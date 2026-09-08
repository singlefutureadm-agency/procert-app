import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FaseProcesso,
  Prisma,
  Role,
  StatusCertificacao,
  StatusRegistro,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NaoConformidadesService } from '../nao-conformidades/nao-conformidades.service';
import {
  NaoConformidadeAvisada,
  NotificacoesService,
} from '../mail/notificacoes.service';
import { DocumentosCertificacaoService } from './documentos.service';
import { paginar } from '../../common/dto/paginacao.dto';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import {
  ListarCertificacoesDto,
  SalvarCertificacaoDto,
} from './dto/certificacao.dto';

/** Rótulos em português para os e-mails de acompanhamento. */
const ROTULO_STATUS: Record<StatusCertificacao, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
};

/**
 * Os únicos status cuja mudança gera e-mail para o cliente.
 *
 * Decisão do cliente, registrada em 03/09/2026: notificar apenas marcos
 * decisivos. `PENDENTE → EM_ANDAMENTO` é ruído de rotina, e aprovação de etapa
 * isolada também — o desfecho positivo que interessa é o certificado emitido,
 * que tem aviso próprio. Notificação em massa treina o destinatário a ignorar
 * todas, e aí o aviso que importa chega junto com os que não importam.
 *
 * É uma lista, e não um `if`, porque alargar a régua é mexer numa linha. Se o
 * cliente reclamar de silêncio demais, `APROVADO` entra aqui.
 */
const EVENTOS_NOTIFICAVEIS: StatusCertificacao[] = [
  StatusCertificacao.REPROVADO,
];

/**
 * Checklist da etapa, na ordem.
 *
 * Declarado AQUI e não em `micro-etapas.service` de propósito: aquele service
 * importa `marcosDaTransicao` deste, e a volta fecharia um ciclo de import. A
 * dependência entre os dois é de mão única — micro-etapas conhece certificações,
 * nunca o contrário.
 */
const INCLUDE_MICRO_ETAPAS = {
  orderBy: { ordem: 'asc' },
  select: {
    id: true,
    nome: true,
    ordem: true,
    // Área e prazo PRÓPRIOS do item — uma etapa de ensaio costuma cruzar áreas
    // (receber amostra é da Qualidade, executar é do Técnico).
    papelResponsavel: true,
    prazoSlaHoras: true,
    concluida: true,
    concluidaEm: true,
    concluidaPorNome: true,
  },
} satisfies Prisma.CertificacaoProduto$microEtapasArgs;

@Injectable()
export class CertificacoesService {
  private readonly logger = new Logger(CertificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly naoConformidades: NaoConformidadesService,
    private readonly documentos: DocumentosCertificacaoService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /**
   * Painel consolidado: uma linha por produto, com a etapa atual e o progresso.
   * Substitui as consultas com subquery correlacionada de `Servico::getCertificacoes()`.
   */
  async listarPainel(
    filtros: ListarCertificacoesDto,
    usuario: UsuarioAutenticado,
  ) {
    const clienteId =
      usuario.role === Role.CLIENTE ? usuario.id : filtros.clienteId;

    const where: Prisma.ProdutoWhereInput = {
      status: StatusRegistro.ATIVO,
      ...(clienteId && { clienteId }),
      ...(filtros.status && { certificacao: { some: { status: filtros.status } } }),
      ...(filtros.busca && {
        OR: [
          { nome: { contains: filtros.busca, mode: 'insensitive' } },
          { cliente: { nome: { contains: filtros.busca, mode: 'insensitive' } } },
        ],
      }),
    };

    const [produtos, total] = await this.prisma.$transaction([
      this.prisma.produto.findMany({
        where,
        select: {
          id: true,
          nome: true,
          fotoUrl: true,
          descricao: true,
          atualizadoEm: true,
          cliente: { select: { id: true, nome: true, fotoUrl: true } },
          certificacao: {
            select: {
              id: true,
              status: true,
              observacao: true,
              atualizadoEm: true,
              ordem: true,
              etapa: { select: { id: true, nome: true } },
            },
            orderBy: { ordem: 'asc' },
          },
        },
        orderBy: [{ cliente: { nome: 'asc' } }, { nome: 'asc' }],
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.produto.count({ where }),
    ]);

    const dados = produtos.map((produto) => {
      const etapas = produto.certificacao;
      const aprovadas = etapas.filter(
        (e) => e.status === StatusCertificacao.APROVADO,
      ).length;
      const atual = etapaAtualDe(etapas);

      return {
        produtoId: produto.id,
        produto: produto.nome,
        produtoFotoUrl: produto.fotoUrl,
        cliente: produto.cliente,
        etapaAtual: atual?.etapa.nome ?? null,
        status: atual?.status ?? StatusCertificacao.PENDENTE,
        observacao: atual?.observacao ?? null,
        atualizadoEm: atual?.atualizadoEm ?? produto.atualizadoEm,
        totalEtapas: etapas.length,
        etapasAprovadas: aprovadas,
        progresso: etapas.length
          ? Math.round((aprovadas / etapas.length) * 100)
          : 0,
      };
    });

    return paginar(dados, total, filtros);
  }

  /**
   * Timeline completa de um produto: todas as etapas, em ordem,
   * cada uma com o seu histórico de alterações.
   */
  async detalharPorProduto(produtoId: number, usuario: UsuarioAutenticado) {
    const produto = await this.prisma.produto.findUnique({
      where: { id: produtoId },
      select: {
        id: true,
        nome: true,
        descricao: true,
        fotoUrl: true,
        clienteId: true,
        cliente: {
          select: { id: true, nome: true, email: true, telefone: true, fotoUrl: true },
        },
        certificacao: {
          // A sequência é a da trilha do produto, não a do modelo: só ela
          // acomoda etapas vindas de versões diferentes sem empate.
          orderBy: { ordem: 'asc' },
          select: {
            id: true,
            ordem: true,
            status: true,
            observacao: true,
            atualizadoEm: true,
            // `ordem` do modelo fica de fora de propósito: a posição exibida é
            // a da trilha do produto.
            etapa: {
              select: {
                id: true,
                nome: true,
                descricao: true,
                tipo: true,
                obrigatoria: true,
                exigeDocumento: true,
                papelResponsavel: true,
                fase: true,
                prazoSlaHoras: true,
              },
            },
            // O checklist da etapa NESTE produto. É a cópia que se marca; a
            // definição vive em `ModeloMicroEtapa` e não aparece aqui.
            microEtapas: INCLUDE_MICRO_ETAPAS,
            naoConformidades: {
              orderBy: { id: 'desc' },
              select: {
                id: true,
                codigo: true,
                descricao: true,
                criticidade: true,
                status: true,
                prazoResposta: true,
                respostaCliente: true,
                respondidoEm: true,
                parecer: true,
                abertoPorNome: true,
                resolvidoEm: true,
                criadoEm: true,
              },
            },
            historico: {
              orderBy: { alteradoEm: 'desc' },
              select: {
                id: true,
                statusAnterior: true,
                statusNovo: true,
                observacao: true,
                alteradoPorNome: true,
                alteradoEm: true,
                documentos: {
                  select: {
                    id: true,
                    nomeArquivo: true,
                    tipoMime: true,
                    tamanhoBytes: true,
                    enviadoPorNome: true,
                    criadoEm: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!produto) {
      throw new NotFoundException(`Produto ${produtoId} não encontrado.`);
    }
    this.garantirAcesso(produto.clienteId, usuario);

    const etapas = produto.certificacao;
    const aprovadas = etapas.filter(
      (e) => e.status === StatusCertificacao.APROVADO,
    ).length;

    return {
      produto: {
        id: produto.id,
        nome: produto.nome,
        descricao: produto.descricao,
        fotoUrl: produto.fotoUrl,
      },
      cliente: produto.cliente,
      etapas,
      resumo: {
        totalEtapas: etapas.length,
        etapasAprovadas: aprovadas,
        progresso: etapas.length
          ? Math.round((aprovadas / etapas.length) * 100)
          : 0,
        concluida: etapas.length > 0 && aprovadas === etapas.length,
        // A emissão do certificado exige só as obrigatórias; sem este campo a
        // UI teria de adivinhar a regra que o backend aplica.
        obrigatoriasAprovadas:
          etapas.length > 0 &&
          etapas.every(
            (etapa) =>
              !etapa.etapa.obrigatoria ||
              etapa.status === StatusCertificacao.APROVADO,
          ),
      },
    };
  }

  /**
   * Salva várias etapas de uma vez e grava o histórico das que mudaram.
   * Tudo dentro de uma transação: ou o lote inteiro é aplicado, ou nada.
   */
  async salvar(
    produtoId: number,
    dto: SalvarCertificacaoDto,
    usuario: UsuarioAutenticado,
  ) {
    if (usuario.role === Role.CLIENTE) {
      throw new ForbiddenException(
        'Clientes podem acompanhar, mas não alterar a certificação.',
      );
    }

    const existentes = await this.prisma.certificacaoProduto.findMany({
      where: { produtoId },
      select: {
        id: true,
        status: true,
        observacao: true,
        // `iniciadaEm` entra no select porque a regra dele é MONOTÔNICA: para
        // não sobrescrever é preciso saber se já tem valor.
        iniciadaEm: true,
        etapa: { select: { nome: true } },
      },
    });

    if (existentes.length === 0) {
      throw new NotFoundException(
        `Nenhuma certificação encontrada para o produto ${produtoId}.`,
      );
    }

    const porId = new Map(existentes.map((e) => [e.id, e]));
    const invalidas = dto.etapas.filter((e) => !porId.has(e.id));
    if (invalidas.length) {
      throw new BadRequestException(
        `Etapas que não pertencem a este produto: ${invalidas
          .map((e) => e.id)
          .join(', ')}.`,
      );
    }

    // Etapas marcadas como `exigeDocumento` no modelo não podem ser aprovadas
    // sem evidência anexada — a regra vive aqui, não na UI.
    const aprovacoes = dto.etapas
      .filter(
        (etapa) =>
          etapa.status === StatusCertificacao.APROVADO &&
          porId.get(etapa.id)!.status !== StatusCertificacao.APROVADO,
      )
      .map((etapa) => etapa.id);

    const semDocumento = await this.documentos.etapasSemDocumento(aprovacoes);
    if (semDocumento.length) {
      throw new BadRequestException(
        'Estas etapas exigem documento anexado antes da aprovação: ' +
          `${semDocumento.join(', ')}.`,
      );
    }

    // Não conformidade só faz sentido acompanhando uma reprovação. Recusar
    // antes da transação evita gravar metade do lote e falhar no meio.
    const foraDeContexto = dto.etapas.filter(
      (etapa) =>
        etapa.naoConformidade && etapa.status !== StatusCertificacao.REPROVADO,
    );
    if (foraDeContexto.length) {
      throw new BadRequestException(
        'Não conformidade só pode ser registrada em etapa reprovada: ' +
          `verifique as etapas ${foraDeContexto.map((e) => e.id).join(', ')}.`,
      );
    }

    const mudancas: Array<{ etapa: string; statusNovo: StatusCertificacao }> = [];
    const ncsAbertas: NaoConformidadeAvisada[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const alteracao of dto.etapas) {
        const atual = porId.get(alteracao.id)!;
        const mudouStatus = atual.status !== alteracao.status;
        const mudouObservacao =
          (alteracao.observacao ?? '') !== (atual.observacao ?? '');

        if (!mudouStatus && !mudouObservacao && !alteracao.naoConformidade) {
          continue;
        }

        if (mudouStatus || mudouObservacao) {
          await tx.certificacaoProduto.update({
            where: { id: alteracao.id },
            data: {
              status: alteracao.status,
              observacao: alteracao.observacao ?? null,
              // Marcos gravados NO MESMO UPDATE, dentro da transação que já
              // existe: ou a etapa muda de status e o cache acompanha, ou nada.
              ...marcosDaTransicao(
                { status: atual.status, iniciadaEm: atual.iniciadaEm },
                alteracao.status,
                mudouStatus,
              ),
            },
          });

          await tx.certificacaoHistorico.create({
            data: {
              certificacaoId: alteracao.id,
              statusAnterior: atual.status,
              statusNovo: alteracao.status,
              observacao: alteracao.observacao ?? null,
              // Autoria vem da sessão, não de um campo de texto editável pelo usuário.
              alteradoPorId: usuario.id,
              alteradoPorNome: usuario.nome,
            },
          });
        }

        // Mesmo commit da reprovação: ou a etapa cai e a NC nasce, ou nada.
        if (alteracao.naoConformidade) {
          const criada = await this.naoConformidades.criarRegistro(
            alteracao.id,
            alteracao.naoConformidade,
            usuario,
            tx,
          );

          // Guardada para o e-mail, que sai depois do commit. A NC entra no
          // MESMO aviso da reprovação que a originou: são o mesmo fato para
          // quem recebe, e dois e-mails no mesmo minuto fariam o segundo
          // parecer repetição do primeiro.
          ncsAbertas.push({
            codigo: criada.codigo,
            etapa: atual.etapa.nome,
            criticidade: criada.criticidade,
            descricao: criada.descricao,
            prazoResposta: criada.prazoResposta,
          });
        }

        if (mudouStatus) {
          mudancas.push({
            etapa: atual.etapa.nome,
            statusNovo: alteracao.status,
          });
        }
      }
    });

    // Notificação depois do commit, e COM `await`. A versão anterior usava
    // `void` para não atrasar a resposta; em serverless isso significa não
    // enviar: a função congela quando a resposta sai e a promessa pendente é
    // descartada, sem erro em lugar nenhum. É a mesma razão do `await` no
    // carimbo de `ultimoAcessoEm` do login. Esperar é seguro porque
    // `notificarCliente` engole a própria falha — uma avaliação técnica já
    // gravada não pode ser derrubada por um e-mail que não saiu.
    // Só marcos decisivos viram e-mail — ver `EVENTOS_NOTIFICAVEIS`.
    const notificaveis = mudancas.filter((mudanca) =>
      EVENTOS_NOTIFICAVEIS.includes(mudanca.statusNovo),
    );

    if (notificaveis.length || ncsAbertas.length) {
      await this.notificarCliente(produtoId, notificaveis, ncsAbertas);
    }

    return this.detalharPorProduto(produtoId, usuario);
  }

  /**
   * Reabre a certificação: apaga as linhas atuais (e o histórico em cascata)
   * e recria a trilha a partir das etapas ativas.
   */
  async reiniciar(produtoId: number) {
    const produto = await this.prisma.produto.findUnique({
      where: { id: produtoId },
    });
    if (!produto) {
      throw new NotFoundException(`Produto ${produtoId} não encontrado.`);
    }

    // Reabre pela trilha que o produto carrega, não pela vigente da categoria:
    // trocar de versão é decisão à parte (`migrarParaVersaoVigente`).
    const etapas = await this.prisma.modeloEtapa.findMany({
      where: { modeloTrilhaId: produto.modeloTrilhaId },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        microEtapas: { orderBy: { ordem: 'asc' } },
      },
    });

    if (etapas.length === 0) {
      throw new BadRequestException(
        'O modelo de trilha deste produto não tem etapas cadastradas.',
      );
    }

    // `create` em laço, não `createMany`: as microetapas são relação aninhada e
    // o `createMany` recriaria a trilha com os checklists vazios, sem erro.
    await this.prisma.$transaction(async (tx) => {
      await tx.certificacaoProduto.deleteMany({ where: { produtoId } });

      for (const etapa of etapas) {
        await tx.certificacaoProduto.create({
          data: {
            produtoId,
            etapaId: etapa.id,
            ordem: etapa.ordem,
            status: StatusCertificacao.PENDENTE,
            observacao: 'Etapa pendente',
            // Reiniciar zera o checklist junto: as marcações antigas
            // sustentavam uma avaliação que deixou de existir.
            microEtapas: {
              create: etapa.microEtapas.map((micro) => ({
                modeloMicroEtapaId: micro.id,
                nome: micro.nome,
                papelResponsavel: micro.papelResponsavel,
                prazoSlaHoras: micro.prazoSlaHoras,
                ordem: micro.ordem,
              })),
            },
          },
        });
      }
    });

    return { mensagem: 'Certificação reiniciada com sucesso.' };
  }

  /**
   * Diz se o produto está preso a uma versão antiga da trilha da sua categoria.
   *
   * Consulta pura, sem efeito: a migração só acontece com confirmação
   * explícita em `migrarParaVersaoVigente`. Trocar a régua de avaliação de um
   * produto em andamento nunca deve ser silencioso.
   */
  async verificarVersaoTrilha(produtoId: number) {
    const produto = await this.carregarProdutoComTrilha(produtoId);

    /*
     * Categoria sem trilha vinculada cai no mesmo ramo de "já está na vigente":
     * não há régua nova para onde migrar, e inventar um aviso aqui mandaria o
     * usuário a uma ação que a tela não consegue completar.
     */
    const vigente = produto.categoria.trilhaId
      ? await this.prisma.modeloTrilha.findFirst({
          where: { trilhaId: produto.categoria.trilhaId, ativo: true },
          include: {
            etapas: { orderBy: { ordem: 'asc' } },
            trilha: { select: { nome: true } },
          },
          orderBy: { versao: 'desc' },
        })
      : null;

    if (!vigente || vigente.id === produto.modeloTrilhaId) {
      return {
        atualizado: true,
        trilhaProduto: produto.modeloTrilha.trilha.nome,
        trilhaVigente: produto.modeloTrilha.trilha.nome,
        versaoProduto: produto.modeloTrilha.versao,
        versaoVigente: vigente?.versao ?? produto.modeloTrilha.versao,
        etapasAAdicionar: [],
        mensagem: 'O produto já segue a versão vigente da trilha.',
      };
    }

    const nomesAtuais = new Set(
      produto.certificacao.map((certificacao) => certificacao.etapa.nome),
    );
    // A comparação é por nome porque cada versão tem ModeloEtapa próprias:
    // ids diferentes descrevendo a mesma etapa do processo.
    const etapasAAdicionar = vigente.etapas.filter(
      (etapa) => !nomesAtuais.has(etapa.nome),
    );

    /*
     * A categoria pode ter trocado de trilha desde a submissão, e duas trilhas
     * distintas têm numeração própria: "v1 → v1" é uma frase possível, e
     * verdadeira. Sem o NOME a mensagem fica sem sentido para quem lê — por
     * isso ele entra sempre que as trilhas diferem, e some quando são a mesma,
     * onde repetir o nome dos dois lados só faria ruído.
     */
    const trilhaProduto = produto.modeloTrilha.trilha.nome;
    const trilhaVigente = vigente.trilha.nome;
    const mudouDeTrilha = trilhaProduto !== trilhaVigente;

    const origem = mudouDeTrilha
      ? `a versão ${produto.modeloTrilha.versao} da trilha "${trilhaProduto}"`
      : `a versão ${produto.modeloTrilha.versao} da trilha`;
    const destino = mudouDeTrilha
      ? `a versão ${vigente.versao} da trilha "${trilhaVigente}", que a categoria passou a seguir`
      : `a versão ${vigente.versao}`;

    return {
      atualizado: false,
      trilhaProduto,
      trilhaVigente,
      versaoProduto: produto.modeloTrilha.versao,
      versaoVigente: vigente.versao,
      etapasAAdicionar: etapasAAdicionar.map((etapa) => ({
        id: etapa.id,
        nome: etapa.nome,
        tipo: etapa.tipo,
        obrigatoria: etapa.obrigatoria,
      })),
      mensagem:
        `Este produto segue ${origem}; a vigente é ${destino}. ` +
        (etapasAAdicionar.length
          ? `Migrar adiciona ${etapasAAdicionar.length} etapa(s) pendente(s).`
          : 'Migrar não adiciona etapas novas — as diferenças são de configuração.'),
    };
  }

  /**
   * Move o produto para a versão vigente da trilha, acrescentando apenas as
   * etapas que ainda não existem na sua trilha.
   *
   * O histórico e o progresso das etapas já avaliadas são preservados: nada é
   * apagado nem reavaliado. Para recomeçar do zero existe `reiniciar`.
   */
  async migrarParaVersaoVigente(produtoId: number, usuario: UsuarioAutenticado) {
    const situacao = await this.verificarVersaoTrilha(produtoId);

    if (situacao.atualizado) {
      return { ...situacao, adicionadas: 0 };
    }

    const produto = await this.carregarProdutoComTrilha(produtoId);
    // `situacao.atualizado` false garante que existe trilha e versão vigente:
    // sem elas `verificarVersaoTrilha` teria retornado no ramo acima.
    const vigente = await this.prisma.modeloTrilha.findFirstOrThrow({
      where: { trilhaId: produto.categoria.trilhaId ?? -1, ativo: true },
      include: {
        etapas: {
          orderBy: { ordem: 'asc' },
          include: { microEtapas: { orderBy: { ordem: 'asc' } } },
        },
      },
      orderBy: { versao: 'desc' },
    });

    /**
     * Checklist da versão vigente, por id de etapa.
     *
     * `situacao.etapasAAdicionar` é uma projeção enxuta para a tela e não
     * carrega as microetapas — buscá-las aqui, do modelo vigente que já está
     * em memória, evita uma consulta por etapa e mantém a projeção do
     * `verificarVersaoTrilha` como está (ela é resposta pública de uma consulta
     * pura).
     */
    const microEtapasPorEtapa = new Map(
      vigente.etapas.map((etapa) => [etapa.id, etapa.microEtapas]),
    );

    /**
     * Ordem de referência do modelo vigente, por nome da etapa.
     *
     * A comparação é por nome porque cada versão tem `ModeloEtapa` próprias:
     * ids distintos descrevendo a mesma etapa do processo. Etapas que a versão
     * nova não prevê (foram retiradas do processo) ficam no fim, preservando a
     * sequência relativa que já tinham.
     */
    const ordemVigentePorNome = new Map(
      vigente.etapas.map((etapa) => [etapa.nome, etapa.ordem]),
    );
    const FIM_DA_FILA = Number.MAX_SAFE_INTEGER;

    await this.prisma.$transaction(async (tx) => {
      await tx.produto.update({
        where: { id: produtoId },
        data: { modeloTrilhaId: vigente.id },
      });

      for (const etapa of situacao.etapasAAdicionar) {
        const certificacao = await tx.certificacaoProduto.create({
          data: {
            produtoId,
            etapaId: etapa.id,
            // Provisória: a renumeração logo abaixo posiciona todas de uma vez.
            ordem: ordemVigentePorNome.get(etapa.nome) ?? FIM_DA_FILA,
            status: StatusCertificacao.PENDENTE,
            observacao: `Etapa incluída na migração para a versão ${vigente.versao} da trilha`,
            // Etapa nova nasce com o checklist da versão nova. As etapas que o
            // produto já tinha NÃO são tocadas: o checklist delas pertence à
            // avaliação em curso, e trocá-lo aqui apagaria marcações feitas.
            microEtapas: {
              create: (microEtapasPorEtapa.get(etapa.id) ?? []).map((micro) => ({
                modeloMicroEtapaId: micro.id,
                nome: micro.nome,
                papelResponsavel: micro.papelResponsavel,
                prazoSlaHoras: micro.prazoSlaHoras,
                ordem: micro.ordem,
              })),
            },
          },
        });

        // Mesma exigência das demais mudanças: rastro com autoria da sessão.
        await tx.certificacaoHistorico.create({
          data: {
            certificacaoId: certificacao.id,
            statusAnterior: null,
            statusNovo: StatusCertificacao.PENDENTE,
            observacao: `Etapa adicionada ao migrar da versão ${situacao.versaoProduto} para a ${vigente.versao}`,
            alteradoPorId: usuario.id,
            alteradoPorNome: usuario.nome,
          },
        });
      }

      // Renumera a trilha inteira em 1..N seguindo o modelo vigente. Sem isso,
      // as etapas novas herdariam `ordem` que colide com as das versões
      // anteriores e a sequência exibida ficaria indefinida.
      const trilha = await tx.certificacaoProduto.findMany({
        where: { produtoId },
        select: { id: true, ordem: true, etapa: { select: { nome: true } } },
      });

      const sequencia = trilha
        .map((certificacao) => ({
          id: certificacao.id,
          referencia:
            ordemVigentePorNome.get(certificacao.etapa.nome) ?? FIM_DA_FILA,
          ordemAtual: certificacao.ordem,
        }))
        .sort(
          (a, b) =>
            a.referencia - b.referencia || a.ordemAtual - b.ordemAtual || a.id - b.id,
        );

      for (const [indice, item] of sequencia.entries()) {
        if (item.ordemAtual === indice + 1) continue;
        await tx.certificacaoProduto.update({
          where: { id: item.id },
          data: { ordem: indice + 1 },
        });
      }
    });

    return {
      ...situacao,
      atualizado: true,
      adicionadas: situacao.etapasAAdicionar.length,
      mensagem:
        `Produto migrado para a versão ${vigente.versao} da trilha. ` +
        `${situacao.etapasAAdicionar.length} etapa(s) adicionada(s).`,
    };
  }

  /**
   * Avisa o cliente sobre as etapas que mudaram de status.
   *
   * Nunca propaga erro: seguindo o padrão do MailService, uma falha de envio é
   * registrada em log e o fluxo de certificação segue. Um e-mail que não saiu
   * não pode invalidar uma avaliação técnica que já foi gravada.
   */
  private async notificarCliente(
    produtoId: number,
    mudancas: Array<{ etapa: string; statusNovo: StatusCertificacao }>,
    naoConformidades: NaoConformidadeAvisada[] = [],
  ): Promise<void> {
    try {
      const produto = await this.prisma.produto.findUnique({
        where: { id: produtoId },
        select: {
          nome: true,
          cliente: { select: { nome: true, email: true } },
        },
      });

      if (!produto) return;

      await this.notificacoes.certificacaoAtualizada(
        produto.cliente.email,
        produto.cliente.nome,
        produto.nome,
        produtoId,
        mudancas.map((mudanca) => ({
          etapa: mudanca.etapa,
          status: ROTULO_STATUS[mudanca.statusNovo],
        })),
        naoConformidades,
      );
    } catch (erro) {
      this.logger.error(
        `Falha ao notificar o cliente do produto ${produtoId}: ${(erro as Error).message}`,
      );
    }
  }

  private async carregarProdutoComTrilha(produtoId: number) {
    const produto = await this.prisma.produto.findUnique({
      where: { id: produtoId },
      include: {
        modeloTrilha: { include: { trilha: { select: { nome: true } } } },
        // `trilhaId` da categoria é o que resolve a versão vigente hoje: a
        // trilha virou catálogo e deixou de pertencer à categoria.
        categoria: { select: { id: true, nome: true, trilhaId: true } },
        certificacao: { select: { etapa: { select: { nome: true } } } },
      },
    });

    if (!produto) {
      throw new NotFoundException(`Produto ${produtoId} não encontrado.`);
    }
    return produto;
  }

  /**
   * Leva o processo para uma fase do pipeline — o que o arrastar-e-soltar faz.
   *
   * ## Arrastar ESCREVE ETAPA, não posição
   *
   * A coluna do quadro continua sendo derivada da etapa atual. O que este
   * método faz é mover a etapa: marca como `EM_ANDAMENTO` a primeira etapa
   * daquela fase que ainda não foi aprovada, e devolve a `PENDENTE` qualquer
   * etapa que estivesse `EM_ANDAMENTO` antes dela.
   *
   * É por isso que o cartão para na coluna certa: a regra de derivação é "1ª
   * EM_ANDAMENTO, senão 1ª PENDENTE, senão a última", e depois deste método a
   * 1ª EM_ANDAMENTO é justamente a etapa da fase de destino.
   *
   * Gravar a fase no produto seria mais simples e é exatamente o que o quadro
   * Trello fazia de errado: a lista dizia uma coisa e o checklist dizia outra,
   * porque eram duas fontes mantidas à mão.
   *
   * ## O que ele NÃO faz
   *
   * **Não aprova nada.** Pular para a última fase não marca as anteriores como
   * aprovadas — aprovação é ato com evidência e autoria, e um arrasto não é
   * isso. O processo aparece na fase nova com as etapas anteriores ainda
   * pendentes, que é a verdade.
   *
   * Fases sem etapa na trilha do produto são recusadas: não há para onde mover.
   */
  async moverParaFase(
    produtoId: number,
    fase: FaseProcesso,
    usuario: UsuarioAutenticado,
  ) {
    if (usuario.role === Role.CLIENTE) {
      throw new ForbiddenException(
        'Clientes acompanham o processo, mas não o movimentam.',
      );
    }

    const etapas = await this.prisma.certificacaoProduto.findMany({
      where: { produtoId },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        ordem: true,
        status: true,
        iniciadaEm: true,
        etapa: { select: { nome: true, fase: true } },
      },
    });

    if (etapas.length === 0) {
      throw new NotFoundException(
        `Nenhuma certificação encontrada para o produto ${produtoId}.`,
      );
    }

    const daFase = etapas.filter((e) => e.etapa.fase === fase);

    if (daFase.length === 0) {
      throw new BadRequestException(
        `A trilha deste produto não tem nenhuma etapa na fase escolhida. ` +
          'Mover para lá deixaria o cartão numa coluna sem etapa correspondente.',
      );
    }

    const destino = daFase.find(
      (e) => e.status !== StatusCertificacao.APROVADO,
    );

    if (!destino) {
      throw new BadRequestException(
        'Todas as etapas desta fase já foram aprovadas. Para retomá-las, ' +
          'reabra a etapa na linha do tempo — arrastar não desfaz aprovação.',
      );
    }

    /*
     * O no-op se decide pela fase EM QUE O PROCESSO ESTÁ, não pelo status da
     * etapa de destino.
     *
     * As duas perguntas parecem a mesma e divergem quando há mais de uma etapa
     * `EM_ANDAMENTO` — o que a trilha permite, porque ela não é sequencial e
     * `salvar()` aceita lote. Nesse caso a derivação escolhe a PRIMEIRA, e a
     * etapa de destino pode estar em andamento sem que o cartão esteja naquela
     * coluna. Perguntar pelo status do destino recusava justamente a volta:
     * "já está nesta fase" para um processo que estava em outra.
     */
    const atual = etapaAtualDe(etapas);

    if (atual && atual.etapa.fase === fase) {
      return { mensagem: 'O processo já está nesta fase.', movido: false };
    }

    // Etapas EM_ANDAMENTO ANTES do destino voltam para PENDENTE: sem isso a
    // derivação continuaria escolhendo a primeira delas e o cartão não sairia
    // do lugar. Só as em andamento — aprovada e reprovada guardam decisão
    // tomada, e desfazê-las aqui apagaria trabalho.
    const aDevolver = etapas.filter(
      (e) =>
        e.ordem < destino.ordem &&
        e.status === StatusCertificacao.EM_ANDAMENTO,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const etapa of aDevolver) {
        await tx.certificacaoProduto.update({
          where: { id: etapa.id },
          data: {
            status: StatusCertificacao.PENDENTE,
            ...marcosDaTransicao(
              { status: etapa.status, iniciadaEm: etapa.iniciadaEm },
              StatusCertificacao.PENDENTE,
              true,
            ),
          },
        });

        await tx.certificacaoHistorico.create({
          data: {
            certificacaoId: etapa.id,
            statusAnterior: etapa.status,
            statusNovo: StatusCertificacao.PENDENTE,
            observacao: `Devolvida à fila ao mover o processo para ${fase}.`,
            alteradoPorId: usuario.id,
            alteradoPorNome: usuario.nome,
          },
        });
      }

      // A etapa de destino pode JÁ estar em andamento: é o caso de voltar para
      // a fase de onde se saiu, em que o movimento inteiro consiste em
      // devolver à fila as anteriores. Regravar o mesmo status produziria uma
      // linha de histórico afirmando uma transição que não houve — exatamente
      // o ruído que o `statusAnterior <> statusNovo` do ciclo.service descarta.
      if (destino.status === StatusCertificacao.EM_ANDAMENTO) return;

      await tx.certificacaoProduto.update({
        where: { id: destino.id },
        data: {
          status: StatusCertificacao.EM_ANDAMENTO,
          ...marcosDaTransicao(
            { status: destino.status, iniciadaEm: destino.iniciadaEm },
            StatusCertificacao.EM_ANDAMENTO,
            true,
          ),
        },
      });

      await tx.certificacaoHistorico.create({
        data: {
          certificacaoId: destino.id,
          statusAnterior: destino.status,
          statusNovo: StatusCertificacao.EM_ANDAMENTO,
          observacao: `Processo movido para a fase ${fase} no quadro.`,
          // Autoria da sessão: arrastar é ato de uma pessoa, e a auditoria
          // precisa do nome dela como em qualquer outra mudança de status.
          alteradoPorId: usuario.id,
          alteradoPorNome: usuario.nome,
        },
      });
    });

    return {
      mensagem: `Processo movido para "${destino.etapa.nome}".`,
      movido: true,
    };
  }

  /**
   * Interrompe o processo. As etapas ficam como estão.
   *
   * Cancelar NÃO é desativar o produto (`status: INATIVO`, que é soft delete do
   * cadastro) e NÃO mexe no estado das etapas: o processo existiu, parou onde
   * parou, e é isso que a auditoria precisa poder afirmar. O cartão sai do
   * fluxo e vai para a coluna CANCELADO do quadro.
   *
   * O motivo é obrigatório — um processo interrompido sem motivo registrado é
   * uma pergunta sem resposta seis meses depois.
   */
  async cancelar(
    produtoId: number,
    motivo: string,
    usuario: UsuarioAutenticado,
  ) {
    const produto = await this.prisma.produto.findUnique({
      where: { id: produtoId },
      select: { id: true, canceladoEm: true },
    });

    if (!produto) {
      throw new NotFoundException(`Produto ${produtoId} não encontrado.`);
    }

    if (produto.canceladoEm) {
      throw new BadRequestException('Este processo já está cancelado.');
    }

    await this.prisma.produto.update({
      where: { id: produtoId },
      data: {
        canceladoEm: new Date(),
        motivoCancelamento: motivo,
        // Autoria da sessão, nunca de campo do payload.
        canceladoPorId: usuario.id,
        canceladoPorNome: usuario.nome,
      },
    });

    return { mensagem: 'Processo cancelado.' };
  }

  /**
   * Devolve o processo ao fluxo, limpando o cancelamento.
   *
   * A coluna do quadro volta a ser derivada da etapa atual — não há "voltar
   * para onde estava", porque nunca se gravou onde estava.
   */
  async reabrir(produtoId: number) {
    const produto = await this.prisma.produto.findUnique({
      where: { id: produtoId },
      select: { id: true, canceladoEm: true },
    });

    if (!produto) {
      throw new NotFoundException(`Produto ${produtoId} não encontrado.`);
    }

    if (!produto.canceladoEm) {
      throw new BadRequestException('Este processo não está cancelado.');
    }

    await this.prisma.produto.update({
      where: { id: produtoId },
      data: {
        canceladoEm: null,
        motivoCancelamento: null,
        canceladoPorId: null,
        canceladoPorNome: null,
      },
    });

    return { mensagem: 'Processo reaberto.' };
  }

  private garantirAcesso(clienteId: number, usuario: UsuarioAutenticado): void {
    if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) {
      throw new ForbiddenException(
        'Você só pode acompanhar as certificações dos seus produtos.',
      );
    }
  }
}

/**
 * A etapa ATUAL de um processo: 1ª `EM_ANDAMENTO`, senão 1ª `PENDENTE`, senão
 * a última.
 *
 * Ponto único da regra em TypeScript — `listarPainel` e `moverParaFase` a usam,
 * e o `DISTINCT ON` do `quadro.service` a repete em SQL. Eram três cópias, e a
 * divergência custou um defeito: `moverParaFase` perguntava se a etapa DE
 * DESTINO estava `EM_ANDAMENTO` em vez de perguntar em que fase o processo
 * estava. Com duas etapas em andamento — o que a trilha permite, porque ela não
 * é sequencial — a resposta das duas perguntas diverge, e mover de volta para a
 * fase de origem era recusado como "já está nesta fase".
 *
 * A lista precisa vir ORDENADA por `ordem` — é a ordem da trilha do produto,
 * não a do modelo.
 */
export function etapaAtualDe<T extends { status: StatusCertificacao }>(
  etapasEmOrdem: T[],
): T | undefined {
  return (
    etapasEmOrdem.find((e) => e.status === StatusCertificacao.EM_ANDAMENTO) ??
    etapasEmOrdem.find((e) => e.status === StatusCertificacao.PENDENTE) ??
    etapasEmOrdem.at(-1)
  );
}

/**
 * Os marcos temporais a gravar numa transição de status.
 *
 * Ponto ÚNICO da regra no código — a mesma definição que o comentário de
 * `CertificacaoProduto` no schema e que o SQL de backfill das migrations
 * `20260905210000` e `20260905213000`. São três cópias da mesma regra em três
 * linguagens, e nada as compara em execução: mexeu numa, mexa nas outras.
 *
 *   iniciadaEm  = 1ª saída de PENDENTE.  MONOTÔNICO: grava só se estiver null.
 *   concluidaEm = aprovação VIGENTE.     REVERSÍVEL: grava ao aprovar,
 *                                        limpa em toda saída de APROVADO.
 *
 * As naturezas são opostas de propósito. `iniciadaEm` é o mesmo marco que
 * `relatorios/ciclo.service.ts` publica, e sobrescrevê-lo numa reabertura
 * mudaria número de relatório; `concluidaEm` responde "esta etapa está pronta
 * AGORA?", e mantê-lo após uma reprovação faria o quadro afirmar conclusão que
 * o status nega — o banco recusa esse estado em `ck_certificacao_concluida_em`.
 *
 * Devolve um objeto parcial para ser espalhado no `data` do update: chave
 * ausente é campo não tocado, que é diferente de gravar null.
 */
export function marcosDaTransicao(
  atual: { status: StatusCertificacao; iniciadaEm: Date | null },
  statusNovo: StatusCertificacao,
  mudouStatus: boolean,
  agora: Date = new Date(),
): { iniciadaEm?: Date; concluidaEm?: Date | null } {
  // Sem mudança de status não há marco a mover. Editar a observação de uma
  // etapa aprovada não pode empurrar a data de conclusão para frente — é o
  // mesmo viés que o `statusAnterior <> statusNovo` do ciclo.service descarta.
  if (!mudouStatus) return {};

  const marcos: { iniciadaEm?: Date; concluidaEm?: Date | null } = {};

  // Monotônico E auto-corretivo: a condição é "ainda não tem início E não está
  // voltando para PENDENTE", NÃO "está saindo de PENDENTE agora".
  //
  // A versão anterior exigia `atual.status === PENDENTE` e criava um estado
  // ABSORVENTE: uma etapa hoje EM_ANDAMENTO sem `iniciadaEm` — o que acontece
  // com dado migrado do PHP legado, que não tem histórico de transição — nunca
  // mais receberia valor, porque nenhuma transição futura parte de PENDENTE.
  // Ficaria sem SLA para sempre, sem erro nenhum.
  //
  // Continua monotônico porque só grava quando está null: uma etapa que já tem
  // início nunca o perde, e reabrir não reinicia o relógio.
  if (
    atual.iniciadaEm === null &&
    statusNovo !== StatusCertificacao.PENDENTE
  ) {
    marcos.iniciadaEm = agora;
  }

  if (statusNovo === StatusCertificacao.APROVADO) {
    // Sobrescreve de propósito: numa segunda aprovação, a conclusão vigente é
    // a nova. É a razão de o backfill usar MAX e não MIN.
    marcos.concluidaEm = agora;
  } else if (atual.status === StatusCertificacao.APROVADO) {
    // Toda saída de APROVADO limpa — reprovação, volta para EM_ANDAMENTO,
    // qualquer uma. O gatilho é sair do status, não o motivo da saída.
    marcos.concluidaEm = null;
  }

  return marcos;
}
