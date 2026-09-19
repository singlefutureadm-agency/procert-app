import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, StatusCertificacao, StatusRegistro } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { ModelosTrilhaService } from '../modelos-trilha/modelos-trilha.service';
import { paginar } from '../../common/dto/paginacao.dto';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import {
  AtualizarProcessoDto,
  CriarProcessoDto,
  ListarProcessosDto,
} from './dto/processo.dto';

const INCLUDE_PROCESSO = {
  cliente: { select: { id: true, nome: true, fotoUrl: true } },
  categoria: {
    select: {
      id: true,
      nome: true,
      normaReferencia: true,
      trilha: { select: { id: true, nome: true } },
    },
  },
  modeloTrilha: {
    select: {
      id: true,
      versao: true,
      ativo: true,
      trilha: { select: { id: true, nome: true } },
    },
  },
  certificacao: {
    select: {
      id: true,
      ordem: true,
      status: true,
      etapa: { select: { id: true, nome: true, tipo: true, obrigatoria: true } },
    },
    orderBy: { ordem: 'asc' },
  },
  pagamentos: {
    select: { id: true, status: true, valor: true, dataPagamento: true },
    orderBy: { criadoEm: 'desc' },
    take: 1,
  },
} satisfies Prisma.ProcessoInclude;

@Injectable()
export class ProcessosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly modelosTrilha: ModelosTrilhaService,
  ) {}

  async listar(filtros: ListarProcessosDto, usuario: UsuarioAutenticado) {
    // Clientes enxergam apenas os próprios processos: o escopo é imposto aqui,
    // no servidor, e não pelo id que vem da URL (corrige o IDOR do legado).
    const clienteId =
      usuario.role === Role.CLIENTE ? usuario.id : filtros.clienteId;

    const where: Prisma.ProcessoWhereInput = {
      status: filtros.status ?? StatusRegistro.ATIVO,
      ...(clienteId && { clienteId }),
      ...(filtros.categoriaId && { categoriaId: filtros.categoriaId }),
      ...(filtros.busca && {
        OR: [
          { nome: { contains: filtros.busca, mode: 'insensitive' } },
          { cliente: { nome: { contains: filtros.busca, mode: 'insensitive' } } },
        ],
      }),
    };

    const [registros, total] = await this.prisma.$transaction([
      this.prisma.processo.findMany({
        where,
        include: INCLUDE_PROCESSO,
        orderBy: { nome: 'asc' },
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.processo.count({ where }),
    ]);

    const dados = registros.map((processo) => this.comResumo(processo));
    return paginar(dados, total, filtros);
  }

  async buscarPorId(id: number, usuario: UsuarioAutenticado) {
    const processo = await this.prisma.processo.findUnique({
      where: { id },
      include: INCLUDE_PROCESSO,
    });

    if (!processo) {
      throw new NotFoundException(`Processo ${id} não encontrado.`);
    }
    this.garantirAcesso(processo.clienteId, usuario);

    return this.comResumo(processo);
  }

  /**
   * Cadastra o processo e abre a trilha de certificação.
   *
   * A trilha vem da versão vigente da trilha VINCULADA à categoria escolhida, e
   * o processo guarda essa versão (`modeloTrilhaId`) como retrato: se a trilha
   * publicar uma versão nova amanhã — ou se a categoria passar a apontar para
   * outra trilha —, este processo continua sendo avaliado pelo processo que
   * valia na submissão.
   *
   * Diferença em relação ao legado: processo e etapas nascem na MESMA
   * transação — lá, se o INSERT das etapas falhasse, o processo ficava órfão
   * sem nenhuma certificação associada.
   */
  async criar(dto: CriarProcessoDto) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: dto.clienteId },
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente ${dto.clienteId} não encontrado.`);
    }

    const categoria = await this.prisma.categoriaProcesso.findUnique({
      where: { id: dto.categoriaId },
    });
    if (!categoria) {
      throw new NotFoundException(`Categoria ${dto.categoriaId} não encontrada.`);
    }
    if (categoria.status !== StatusRegistro.ATIVO) {
      throw new BadRequestException(
        'Esta categoria está inativa e não aceita novos processos.',
      );
    }

    // Lança 400 orientando vincular a trilha, ou publicar uma versão dela,
    // conforme o que estiver faltando.
    const modelo = await this.modelosTrilha.resolverVigentePorCategoria(
      dto.categoriaId,
    );

    // O código do processo é sequencial por ano e derivado do MAIOR do ano, o
    // que abre uma corrida entre duas aberturas simultâneas: as duas leem o
    // mesmo máximo e tentam gravar o mesmo número. Quem decide é o índice
    // único de `codigo_processo`; aqui a perdedora tenta de novo em vez de
    // devolver 409 para quem só estava cadastrando um processo.
    return this.comRetryDeCodigo(async () => {
      const codigoProcesso = await this.gerarCodigoProcesso(categoria.sigla);

      return this.prisma.$transaction(async (tx) => {
        const processo = await tx.processo.create({
          data: {
            clienteId: dto.clienteId,
            categoriaId: dto.categoriaId,
            modeloTrilhaId: modelo.id,
            codigoProcesso,
            motivoProcesso: dto.motivoProcesso,
            aprovacaoAutomatica: dto.aprovacaoAutomatica,
            nome: dto.nome,
            descricao: dto.descricao,
            preco: dto.preco ?? 0,
          },
        });

        // `create` por etapa, não `createMany`: as microetapas são relação
        // aninhada e o `createMany` as descartaria sem erro — o processo nasceria
        // com a trilha certa e as checklists vazias.
        for (const etapa of modelo.etapas) {
          await tx.certificacaoProcesso.create({
            data: {
              processoId: processo.id,
              etapaId: etapa.id,
              // A trilha do processo nasce com a ordem do modelo; daí em diante
              // ela é dele, e sobrevive a mudanças de versão.
              ordem: etapa.ordem,
              status: StatusCertificacao.PENDENTE,
              observacao: 'Etapa pendente',
              // Cópia do checklist do catálogo. O `nome` é copiado (e não lido
              // por FK) para que o texto que a pessoa marcou sobreviva a
              // qualquer mudança futura no catálogo.
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

        return tx.processo.findUniqueOrThrow({
          where: { id: processo.id },
          include: INCLUDE_PROCESSO,
        });
      });
    });
  }

  /**
   * Próximo código do processo: `PROCERT-<SIGLA>-<NNN>-<AA>`.
   *
   * Derivado do MAIOR número do ano, nunca de `COUNT`: contar linhas reemite um
   * número já usado assim que um processo é excluído, e dois processos com o
   * mesmo código é exatamente o que a operação não pode ter. Mesma estratégia
   * de `NaoConformidade.codigo` e `Certificado.numero`.
   *
   * O sequencial é por SIGLA e por ano — `PROCERT-EPI-012-26` e
   * `PROCERT-VOL-012-26` convivem, porque é assim que a operação já numera.
   *
   * **O máximo sai de `MAX(número extraído)`, não de `ORDER BY codigo DESC`.**
   * Ordenação de texto só coincide com ordenação numérica enquanto a largura é
   * fixa, e `padStart(3, '0')` a garante apenas até 999. Com `-1000-` na base,
   * o maior lexicográfico volta a ser `...-999-`, o próximo código sairia
   * `1000` de novo e colidiria com um já emitido. Por isso o `$queryRaw`: o
   * `orderBy` do Prisma não ordena por expressão, e trocar de ferramenta é mais
   * barato que uma colisão de identificador que circula fora do sistema.
   *
   * O código passou a ter largura MÍNIMA de 3 (não fixa): `001`..`999` e depois
   * `1000` em diante, que é como um contador se comporta quando estoura a
   * casa reservada.
   *
   * Categoria sem sigla devolve `null` e o processo nasce sem código, sem erro:
   * é preferível a um processo com identificador inventado. A tela mostra "—".
   */
  private async gerarCodigoProcesso(
    sigla: string | null,
  ): Promise<string | null> {
    if (!sigla) return null;

    const ano = new Date().getFullYear();
    const sufixo = `-${String(ano).slice(-2)}`;
    const prefixo = `PROCERT-${sigla.toUpperCase()}-`;

    // O miolo entre o prefixo e o sufixo é o sequencial. `NULLIF` +
    // `~ '^[0-9]+$'` descartam qualquer linha cujo miolo não seja numérico —
    // um código digitado à mão fora do padrão não pode derrubar a geração.
    //
    // Os `::int` nos parâmetros NÃO são decoração: o Prisma envia número de JS
    // como `bigint`, e o Postgres não tem `substring(varchar, bigint, bigint)`
    // — a consulta falha com 42883 em execução. O type-check não vê, e o spec
    // com `$queryRaw` mockado também não: só rodar contra o banco pega.
    const inicio = prefixo.length + 1;
    const descontar = prefixo.length + sufixo.length;

    const [{ maximo }] = await this.prisma.$queryRaw<
      [{ maximo: number | null }]
    >(Prisma.sql`
      SELECT MAX(
               NULLIF(
                 SUBSTRING(
                   codigo_processo
                   FROM ${inicio}::int
                   FOR  (LENGTH(codigo_processo) - ${descontar}::int)
                 ),
                 ''
               )::bigint
             )::int AS maximo
      FROM processos
      WHERE codigo_processo LIKE ${prefixo + '%' + sufixo}
        AND SUBSTRING(
              codigo_processo
              FROM ${inicio}::int
              FOR  (LENGTH(codigo_processo) - ${descontar}::int)
            ) ~ '^[0-9]+$'
    `);

    const sequencial = (maximo ?? 0) + 1;

    return `${prefixo}${String(sequencial).padStart(3, '0')}${sufixo}`;
  }

  /**
   * Repete a operação quando o índice único do código acusa uma corrida.
   *
   * `nao-conformidades` e `certificados` têm a MESMA corrida e NÃO têm este
   * tratamento: lá a perdedora vira 409 genérico e a pessoa refaz à mão. Não
   * foram corrigidos nesta entrega de propósito — são outros módulos, com
   * specs próprios, e mudar o comportamento de erro deles é entrega própria.
   * Registrado em DOCUMENTACAO.md §15, em "`nao-conformidades`: a corrida do
   * sequencial não tem retry".
   *
   * Três tentativas: a corrida exige duas aberturas no mesmo instante, e cada
   * repetição lê um máximo novo. Esgotadas, o P2002 sobe e o filtro global o
   * traduz para 409 — que é o comportamento de hoje, não uma regressão.
   */
  private async comRetryDeCodigo<T>(operacao: () => Promise<T>): Promise<T> {
    const TENTATIVAS = 3;

    for (let tentativa = 1; ; tentativa += 1) {
      try {
        return await operacao();
      } catch (erro) {
        const colisaoDeCodigo =
          erro instanceof Prisma.PrismaClientKnownRequestError &&
          erro.code === 'P2002' &&
          String(erro.meta?.target ?? '').includes('codigo_processo');

        if (!colisaoDeCodigo || tentativa >= TENTATIVAS) throw erro;
      }
    }
  }

  async atualizar(id: number, dto: AtualizarProcessoDto) {
    await this.garantirExiste(id);

    if (dto.clienteId) {
      const cliente = await this.prisma.cliente.findUnique({
        where: { id: dto.clienteId },
      });
      if (!cliente) {
        throw new NotFoundException(`Cliente ${dto.clienteId} não encontrado.`);
      }
    }

    return this.prisma.processo.update({
      where: { id },
      data: dto,
      include: INCLUDE_PROCESSO,
    });
  }

  async alterarStatus(id: number, status: StatusRegistro) {
    await this.garantirExiste(id);
    return this.prisma.processo.update({
      where: { id },
      data: { status },
      include: INCLUDE_PROCESSO,
    });
  }

  /** Exclusão definitiva: remove em cascata certificações e histórico. */
  async remover(id: number): Promise<{ mensagem: string }> {
    const processo = await this.garantirExiste(id);
    await this.uploads.remover(processo.fotoUrl);
    await this.prisma.processo.delete({ where: { id } });
    return { mensagem: 'Processo excluído definitivamente.' };
  }

  async atualizarFoto(id: number, arquivo: Express.Multer.File) {
    const processo = await this.garantirExiste(id);
    const fotoUrl = await this.uploads.substituirImagem(
      arquivo,
      'processos',
      processo.fotoUrl,
    );

    return this.prisma.processo.update({
      where: { id },
      data: { fotoUrl },
      include: INCLUDE_PROCESSO,
    });
  }

  // ---------------------------------------------------------------- privados

  private async garantirExiste(id: number) {
    const processo = await this.prisma.processo.findUnique({ where: { id } });
    if (!processo) {
      throw new NotFoundException(`Processo ${id} não encontrado.`);
    }
    return processo;
  }

  private garantirAcesso(clienteId: number, usuario: UsuarioAutenticado): void {
    if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) {
      throw new ForbiddenException(
        'Você só pode acessar processos do seu próprio cadastro.',
      );
    }
  }

  /** Acrescenta etapa atual, progresso e último pagamento ao payload. */
  private comResumo(
    processo: Prisma.ProcessoGetPayload<{ include: typeof INCLUDE_PROCESSO }>,
  ) {
    const etapas = processo.certificacao;
    const total = etapas.length;
    const aprovadas = etapas.filter(
      (e) => e.status === StatusCertificacao.APROVADO,
    ).length;

    const emAndamento = etapas.find(
      (e) => e.status === StatusCertificacao.EM_ANDAMENTO,
    );
    const primeiraPendente = etapas.find(
      (e) => e.status === StatusCertificacao.PENDENTE,
    );

    const { pagamentos, ...dadosProcesso } = processo;

    return {
      ...dadosProcesso,
      preco: Number(processo.preco),
      ultimoPagamento: pagamentos[0]
        ? { ...pagamentos[0], valor: Number(pagamentos[0].valor) }
        : null,
      resumoCertificacao: {
        totalEtapas: total,
        etapasAprovadas: aprovadas,
        progresso: total ? Math.round((aprovadas / total) * 100) : 0,
        etapaAtual:
          emAndamento?.etapa.nome ??
          primeiraPendente?.etapa.nome ??
          etapas.at(-1)?.etapa.nome ??
          null,
        concluida: total > 0 && aprovadas === total,
      },
    };
  }
}
