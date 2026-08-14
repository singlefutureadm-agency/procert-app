import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusRegistro } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { paginar, RespostaPaginada } from '../../common/dto/paginacao.dto';
import {
  AtualizarCategoriaProdutoDto,
  CriarCategoriaProdutoDto,
  ListarCategoriasProdutoDto,
} from './dto/categoria-produto.dto';

/** Resumo da versão vigente, para a listagem não precisar de outra consulta. */
const INCLUDE_CATEGORIA = {
  _count: { select: { produtos: true, modelosTrilha: true } },
  modelosTrilha: {
    where: { ativo: true },
    orderBy: { versao: 'desc' },
    take: 1,
    select: {
      id: true,
      versao: true,
      vigenteDe: true,
      _count: { select: { etapas: true, produtos: true } },
    },
  },
} satisfies Prisma.CategoriaProdutoInclude;

@Injectable()
export class CategoriasProdutoService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(
    filtros: ListarCategoriasProdutoDto,
  ): Promise<RespostaPaginada<unknown>> {
    const where: Prisma.CategoriaProdutoWhereInput = {
      status: filtros.status ?? StatusRegistro.ATIVO,
      ...(filtros.busca && {
        OR: [
          { nome: { contains: filtros.busca, mode: 'insensitive' } },
          { normaReferencia: { contains: filtros.busca, mode: 'insensitive' } },
        ],
      }),
    };

    const [registros, total] = await this.prisma.$transaction([
      this.prisma.categoriaProduto.findMany({
        where,
        include: INCLUDE_CATEGORIA,
        orderBy: { nome: 'asc' },
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.categoriaProduto.count({ where }),
    ]);

    return paginar(
      registros.map((registro) => this.comResumo(registro)),
      total,
      filtros,
    );
  }

  /** Lista enxuta para selects (ex.: cadastro de produto). */
  async listarResumido() {
    const categorias = await this.prisma.categoriaProduto.findMany({
      where: { status: StatusRegistro.ATIVO },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        normaReferencia: true,
        modelosTrilha: {
          where: { ativo: true },
          orderBy: { versao: 'desc' },
          take: 1,
          select: { id: true, versao: true, _count: { select: { etapas: true } } },
        },
      },
    });

    // Sem trilha vigente a categoria não aceita produto — o formulário precisa
    // saber disso antes de o usuário preencher tudo.
    return categorias.map(({ modelosTrilha, ...categoria }) => ({
      ...categoria,
      modeloVigente: modelosTrilha[0]
        ? {
            id: modelosTrilha[0].id,
            versao: modelosTrilha[0].versao,
            totalEtapas: modelosTrilha[0]._count.etapas,
          }
        : null,
    }));
  }

  async buscarPorId(id: number) {
    const categoria = await this.prisma.categoriaProduto.findUnique({
      where: { id },
      include: INCLUDE_CATEGORIA,
    });

    if (!categoria) {
      throw new NotFoundException(`Categoria ${id} não encontrada.`);
    }
    return this.comResumo(categoria);
  }

  async criar(dto: CriarCategoriaProdutoDto) {
    await this.garantirNomeDisponivel(dto.nome);
    const categoria = await this.prisma.categoriaProduto.create({
      data: dto,
      include: INCLUDE_CATEGORIA,
    });
    return this.comResumo(categoria);
  }

  async atualizar(id: number, dto: AtualizarCategoriaProdutoDto) {
    await this.garantirExiste(id);

    if (dto.nome) {
      await this.garantirNomeDisponivel(dto.nome, id);
    }

    const categoria = await this.prisma.categoriaProduto.update({
      where: { id },
      data: dto,
      include: INCLUDE_CATEGORIA,
    });
    return this.comResumo(categoria);
  }

  /** Soft delete / reativação — mesmo padrão de clientes e produtos. */
  async alterarStatus(id: number, status: StatusRegistro) {
    await this.garantirExiste(id);
    const categoria = await this.prisma.categoriaProduto.update({
      where: { id },
      data: { status },
      include: INCLUDE_CATEGORIA,
    });
    return this.comResumo(categoria);
  }

  /** Exclusão definitiva, bloqueada quando há produtos vinculados. */
  async remover(id: number): Promise<{ mensagem: string }> {
    const categoria = await this.prisma.categoriaProduto.findUnique({
      where: { id },
      include: { _count: { select: { produtos: true } } },
    });

    if (!categoria) {
      throw new NotFoundException(`Categoria ${id} não encontrada.`);
    }

    if (categoria._count.produtos > 0) {
      throw new ConflictException(
        `Esta categoria possui ${categoria._count.produtos} produto(s) vinculado(s). ` +
          'Use a desativação em vez da exclusão definitiva.',
      );
    }

    // As versões de trilha e suas etapas caem junto (cascade em ModeloEtapa);
    // ModeloTrilha é Restrict, então precisa sair explicitamente antes.
    await this.prisma.$transaction([
      this.prisma.modeloTrilha.deleteMany({ where: { categoriaId: id } }),
      this.prisma.categoriaProduto.delete({ where: { id } }),
    ]);

    return { mensagem: 'Categoria excluída definitivamente.' };
  }

  // ---------------------------------------------------------------- privados

  private async garantirExiste(id: number) {
    const categoria = await this.prisma.categoriaProduto.findUnique({
      where: { id },
    });
    if (!categoria) {
      throw new NotFoundException(`Categoria ${id} não encontrada.`);
    }
    return categoria;
  }

  private async garantirNomeDisponivel(
    nome: string,
    ignorarId?: number,
  ): Promise<void> {
    const existente = await this.prisma.categoriaProduto.findUnique({
      where: { nome },
    });

    if (existente && existente.id !== ignorarId) {
      throw new ConflictException('Já existe uma categoria com este nome.');
    }
  }

  /** Achata a versão vigente para o formato consumido pelo frontend. */
  private comResumo(
    categoria: Prisma.CategoriaProdutoGetPayload<{
      include: typeof INCLUDE_CATEGORIA;
    }>,
  ) {
    const { modelosTrilha, _count, ...dados } = categoria;
    const vigente = modelosTrilha[0];

    return {
      ...dados,
      totalProdutos: _count.produtos,
      totalVersoes: _count.modelosTrilha,
      modeloVigente: vigente
        ? {
            id: vigente.id,
            versao: vigente.versao,
            vigenteDe: vigente.vigenteDe,
            totalEtapas: vigente._count.etapas,
            totalProdutos: vigente._count.produtos,
          }
        : null,
    };
  }
}
