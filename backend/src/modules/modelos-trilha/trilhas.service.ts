import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusRegistro } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { paginar, RespostaPaginada } from '../../common/dto/paginacao.dto';
import {
  AtualizarTrilhaDto,
  CriarTrilhaDto,
  DuplicarTrilhaDto,
  ListarTrilhasDto,
  VincularCategoriasDto,
} from './dto/trilha.dto';
import { EtapaModeloDto } from './dto/modelo-trilha.dto';

/**
 * Resumo por trilha para a listagem não precisar de uma segunda consulta.
 *
 * As versões vêm sem as etapas — só a contagem delas e a de produtos. "Qual é
 * a vigente", "quantas versões existem" e "quantos produtos dependem disto"
 * saem todos daqui: três consultas viraram uma.
 */
const INCLUDE_TRILHA = {
  versoes: {
    orderBy: { versao: 'desc' },
    select: {
      id: true,
      versao: true,
      ativo: true,
      vigenteDe: true,
      vigenteAte: true,
      _count: { select: { etapas: true, produtos: true } },
    },
  },
  categorias: {
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, status: true },
  },
} satisfies Prisma.TrilhaInclude;

type TrilhaComResumo = Prisma.TrilhaGetPayload<{ include: typeof INCLUDE_TRILHA }>;

/**
 * Catálogo de trilhas de certificação.
 *
 * Este service cuida da FAMÍLIA: identidade, vínculo com categorias, ciclo de
 * vida. As VERSÕES e suas etapas são de `ModelosTrilhaService`. A separação
 * acompanha a do schema e existe porque as duas têm regras opostas — a família
 * é editável a qualquer momento, a versão vira imutável assim que tem produto.
 */
@Injectable()
export class TrilhasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: ListarTrilhasDto): Promise<RespostaPaginada<unknown>> {
    const where: Prisma.TrilhaWhereInput = {
      status: filtros.status ?? StatusRegistro.ATIVO,
      ...(filtros.busca && {
        OR: [
          { nome: { contains: filtros.busca, mode: 'insensitive' } },
          { descricao: { contains: filtros.busca, mode: 'insensitive' } },
        ],
      }),
    };

    const [registros, total] = await this.prisma.$transaction([
      this.prisma.trilha.findMany({
        where,
        include: INCLUDE_TRILHA,
        orderBy: { nome: 'asc' },
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.trilha.count({ where }),
    ]);

    return paginar(
      registros.map((registro) => this.comResumo(registro)),
      total,
      filtros,
    );
  }

  /** Lista enxuta para o select de vínculo na categoria. */
  async listarResumido() {
    const trilhas = await this.prisma.trilha.findMany({
      where: { status: StatusRegistro.ATIVO },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        versoes: {
          where: { ativo: true },
          orderBy: { versao: 'desc' },
          take: 1,
          select: { id: true, versao: true, _count: { select: { etapas: true } } },
        },
      },
    });

    // Trilha sem versão vigente com etapas não serve para vincular: a categoria
    // que a adotasse continuaria recusando produto, sem dizer por quê.
    return trilhas.map(({ versoes, ...trilha }) => ({
      ...trilha,
      modeloVigente: versoes[0]
        ? {
            id: versoes[0].id,
            versao: versoes[0].versao,
            totalEtapas: versoes[0]._count.etapas,
          }
        : null,
    }));
  }

  async buscarPorId(id: number) {
    const trilha = await this.prisma.trilha.findUnique({
      where: { id },
      include: INCLUDE_TRILHA,
    });

    if (!trilha) {
      throw new NotFoundException(`Trilha ${id} não encontrada.`);
    }
    return this.comResumo(trilha);
  }

  /**
   * Cria a trilha e, quando o corpo traz etapas, a versão 1 no mesmo commit.
   *
   * As duas juntas porque trilha sem versão não é vinculável: separar deixaria
   * a tela criar um item de catálogo inerte e só descobrir isso na categoria.
   */
  async criar(dto: CriarTrilhaDto) {
    await this.garantirNomeDisponivel(dto.nome);

    const { etapas, ...dados } = dto;

    const trilha = await this.prisma.trilha.create({
      data: {
        ...dados,
        ...(etapas?.length && {
          versoes: {
            create: { versao: 1, ativo: true, etapas: { create: comOrdem(etapas) } },
          },
        }),
      },
      include: INCLUDE_TRILHA,
    });

    return this.comResumo(trilha);
  }

  async atualizar(id: number, dto: AtualizarTrilhaDto) {
    await this.garantirExiste(id);
    if (dto.nome) await this.garantirNomeDisponivel(dto.nome, id);

    const trilha = await this.prisma.trilha.update({
      where: { id },
      data: dto,
      include: INCLUDE_TRILHA,
    });
    return this.comResumo(trilha);
  }

  /** Soft delete / reativação — mesmo padrão de clientes, produtos e categorias. */
  async alterarStatus(id: number, status: StatusRegistro) {
    await this.garantirExiste(id);

    /*
     * Desativar trilha em uso a esconderia do catálogo enquanto as categorias
     * continuassem apontando para ela — e produto novo seguiria entrando por
     * uma trilha que o painel diz não existir mais.
     */
    if (status === StatusRegistro.INATIVO) {
      const emUso = await this.prisma.categoriaProduto.findMany({
        where: { trilhaId: id },
        select: { nome: true },
      });

      if (emUso.length) {
        throw new ConflictException(
          `Esta trilha está vinculada a ${emUso.length} categoria(s): ` +
            `${emUso.map((categoria) => categoria.nome).join(', ')}. ` +
            'Vincule outra trilha a elas antes de desativar esta.',
        );
      }
    }

    const trilha = await this.prisma.trilha.update({
      where: { id },
      data: { status },
      include: INCLUDE_TRILHA,
    });
    return this.comResumo(trilha);
  }

  /**
   * Exclusão definitiva. Recusada enquanto houver produto ou categoria presos.
   *
   * A checagem é explícita, e não deixada para o erro de FK, porque produto
   * pende da VERSÃO (`produtos.modelo_trilha_id`, Restrict) e categoria pende
   * da FAMÍLIA: o banco recusaria as duas com uma mensagem que não diz qual é.
   */
  async remover(id: number): Promise<{ mensagem: string }> {
    const trilha = await this.prisma.trilha.findUnique({
      where: { id },
      include: {
        categorias: { select: { nome: true } },
        versoes: { select: { _count: { select: { produtos: true } } } },
      },
    });

    if (!trilha) {
      throw new NotFoundException(`Trilha ${id} não encontrada.`);
    }

    if (trilha.categorias.length) {
      throw new ConflictException(
        `Esta trilha está vinculada a ${trilha.categorias.length} categoria(s): ` +
          `${trilha.categorias.map((categoria) => categoria.nome).join(', ')}. ` +
          'Desvincule antes de excluir.',
      );
    }

    const produtos = trilha.versoes.reduce(
      (soma, versao) => soma + versao._count.produtos,
      0,
    );

    if (produtos > 0) {
      throw new ConflictException(
        `Esta trilha tem ${produtos} produto(s) em avaliação por alguma de suas ` +
          'versões. Use a desativação em vez da exclusão definitiva.',
      );
    }

    // Versões e etapas caem por cascade (ModeloTrilha → Trilha, ModeloEtapa →
    // ModeloTrilha). Sem produto nenhum, não há histórico a preservar.
    await this.prisma.trilha.delete({ where: { id } });

    return { mensagem: 'Trilha excluída definitivamente.' };
  }

  /**
   * Copia uma trilha existente como v1 de uma trilha nova e independente.
   *
   * Cópia, não referência: editar a nova nunca pode mexer na original, senão
   * "duplicar para ajustar" alteraria o processo de quem já usa a de origem.
   */
  async duplicar(id: number, dto: DuplicarTrilhaDto) {
    await this.garantirExiste(id);
    await this.garantirNomeDisponivel(dto.nome);

    const origem = dto.modeloTrilhaId
      ? await this.prisma.modeloTrilha.findFirst({
          where: { id: dto.modeloTrilhaId, trilhaId: id },
          include: { etapas: { orderBy: { ordem: 'asc' } } },
        })
      : await this.prisma.modeloTrilha.findFirst({
          where: { trilhaId: id, ativo: true },
          include: { etapas: { orderBy: { ordem: 'asc' } } },
          orderBy: { versao: 'desc' },
        });

    if (!origem) {
      throw new NotFoundException(
        dto.modeloTrilhaId
          ? `Versão ${dto.modeloTrilhaId} não encontrada nesta trilha.`
          : 'Esta trilha não tem versão vigente para copiar.',
      );
    }

    if (origem.etapas.length === 0) {
      throw new BadRequestException(
        'A versão de origem não tem etapas — não há o que copiar.',
      );
    }

    const trilha = await this.prisma.trilha.create({
      data: {
        nome: dto.nome,
        descricao: dto.descricao,
        versoes: {
          create: {
            versao: 1,
            ativo: true,
            etapas: { create: comOrdem(origem.etapas.map(paraEntrada)) },
          },
        },
      },
      include: INCLUDE_TRILHA,
    });

    return this.comResumo(trilha);
  }

  /**
   * Aplica esta trilha a um conjunto de categorias, de uma vez.
   *
   * É o caminho inverso do vínculo feito na tela da categoria, e existe porque
   * a pergunta natural depois de desenhar uma trilha é "quais categorias usam
   * esta?" — não "abro sete categorias e escolho a mesma trilha em cada uma".
   */
  async vincularCategorias(id: number, { categoriaIds }: VincularCategoriasDto) {
    await this.garantirExiste(id);

    const encontradas = await this.prisma.categoriaProduto.findMany({
      where: { id: { in: categoriaIds } },
      select: { id: true },
    });

    const faltando = categoriaIds.filter(
      (categoriaId) =>
        !encontradas.some((categoria) => categoria.id === categoriaId),
    );
    if (faltando.length) {
      throw new NotFoundException(
        `Categoria(s) não encontrada(s): ${faltando.join(', ')}.`,
      );
    }

    await this.prisma.categoriaProduto.updateMany({
      where: { id: { in: categoriaIds } },
      data: { trilhaId: id },
    });

    return this.buscarPorId(id);
  }

  // ---------------------------------------------------------------- privados

  private async garantirExiste(id: number) {
    const trilha = await this.prisma.trilha.findUnique({ where: { id } });
    if (!trilha) {
      throw new NotFoundException(`Trilha ${id} não encontrada.`);
    }
    return trilha;
  }

  private async garantirNomeDisponivel(
    nome: string,
    ignorarId?: number,
  ): Promise<void> {
    const existente = await this.prisma.trilha.findUnique({ where: { nome } });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException('Já existe uma trilha com este nome.');
    }
  }

  /** Achata as versões para o formato que o frontend consome. */
  private comResumo(trilha: TrilhaComResumo) {
    const { versoes, categorias, ...dados } = trilha;
    const vigente = versoes.find((versao) => versao.ativo);

    return {
      ...dados,
      categorias,
      totalCategorias: categorias.length,
      totalVersoes: versoes.length,
      totalProdutos: versoes.reduce(
        (soma, versao) => soma + versao._count.produtos,
        0,
      ),
      modeloVigente: vigente
        ? {
            id: vigente.id,
            versao: vigente.versao,
            totalEtapas: vigente._count.etapas,
            totalProdutos: vigente._count.produtos,
          }
        : null,
      versoes: versoes.map(({ _count, ...versao }) => ({
        ...versao,
        totalEtapas: _count.etapas,
        totalProdutos: _count.produtos,
        editavel: _count.produtos === 0,
      })),
    };
  }
}

/** Numera as etapas de 1..N na ordem em que chegaram. */
function comOrdem(etapas: EtapaModeloDto[]) {
  return etapas.map((etapa, indice) => ({ ...etapa, ordem: indice + 1 }));
}

/** Converte uma etapa persistida de volta para o formato de entrada. */
function paraEntrada(etapa: {
  nome: string;
  descricao: string | null;
  tipo: EtapaModeloDto['tipo'];
  obrigatoria: boolean;
  prazoSlaDias: number | null;
  exigeDocumento: boolean;
}): EtapaModeloDto {
  return {
    nome: etapa.nome,
    descricao: etapa.descricao ?? undefined,
    tipo: etapa.tipo,
    obrigatoria: etapa.obrigatoria,
    prazoSlaDias: etapa.prazoSlaDias ?? undefined,
    exigeDocumento: etapa.exigeDocumento,
  };
}
