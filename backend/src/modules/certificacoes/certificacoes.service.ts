import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, StatusCertificacao, StatusRegistro } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NaoConformidadesService } from '../nao-conformidades/nao-conformidades.service';
import { MailService } from '../mail/mail.service';
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

@Injectable()
export class CertificacoesService {
  private readonly logger = new Logger(CertificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly naoConformidades: NaoConformidadesService,
    private readonly documentos: DocumentosCertificacaoService,
    private readonly mail: MailService,
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
      const atual =
        etapas.find((e) => e.status === StatusCertificacao.EM_ANDAMENTO) ??
        etapas.find((e) => e.status === StatusCertificacao.PENDENTE) ??
        etapas.at(-1);

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
              },
            },
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
          await this.naoConformidades.criarRegistro(
            alteracao.id,
            alteracao.naoConformidade,
            usuario,
            tx,
          );
        }

        if (mudouStatus) {
          mudancas.push({
            etapa: atual.etapa.nome,
            statusNovo: alteracao.status,
          });
        }
      }
    });

    // Notificação depois do commit e sem `await`: e-mail não pode atrasar nem
    // derrubar a resposta. Falhas ficam no log do MailService.
    if (mudancas.length) {
      void this.notificarCliente(produtoId, mudancas);
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
      select: { id: true, ordem: true },
    });

    if (etapas.length === 0) {
      throw new BadRequestException(
        'O modelo de trilha deste produto não tem etapas cadastradas.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.certificacaoProduto.deleteMany({ where: { produtoId } }),
      this.prisma.certificacaoProduto.createMany({
        data: etapas.map((etapa) => ({
          produtoId,
          etapaId: etapa.id,
          ordem: etapa.ordem,
          status: StatusCertificacao.PENDENTE,
          observacao: 'Etapa pendente',
        })),
      }),
    ]);

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

    const vigente = await this.prisma.modeloTrilha.findFirst({
      where: { categoriaId: produto.categoriaId, ativo: true },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
      orderBy: { versao: 'desc' },
    });

    if (!vigente || vigente.id === produto.modeloTrilhaId) {
      return {
        atualizado: true,
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

    return {
      atualizado: false,
      versaoProduto: produto.modeloTrilha.versao,
      versaoVigente: vigente.versao,
      etapasAAdicionar: etapasAAdicionar.map((etapa) => ({
        id: etapa.id,
        nome: etapa.nome,
        tipo: etapa.tipo,
        obrigatoria: etapa.obrigatoria,
      })),
      mensagem:
        `Este produto segue a versão ${produto.modeloTrilha.versao} da trilha; ` +
        `a versão vigente é a ${vigente.versao}. ` +
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
    const vigente = await this.prisma.modeloTrilha.findFirstOrThrow({
      where: { categoriaId: produto.categoriaId, ativo: true },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
      orderBy: { versao: 'desc' },
    });

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

      await this.mail.enviarAtualizacaoCertificacao(
        produto.cliente.email,
        produto.cliente.nome,
        produto.nome,
        produtoId,
        mudancas.map((mudanca) => ({
          etapa: mudanca.etapa,
          status: ROTULO_STATUS[mudanca.statusNovo],
        })),
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
        modeloTrilha: true,
        certificacao: { select: { etapa: { select: { nome: true } } } },
      },
    });

    if (!produto) {
      throw new NotFoundException(`Produto ${produtoId} não encontrado.`);
    }
    return produto;
  }

  private garantirAcesso(clienteId: number, usuario: UsuarioAutenticado): void {
    if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) {
      throw new ForbiddenException(
        'Você só pode acompanhar as certificações dos seus produtos.',
      );
    }
  }
}
