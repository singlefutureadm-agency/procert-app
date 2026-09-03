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

/**
 * Resumo da trilha vinculada e da versão vigente dela, para a listagem não
 * precisar de outra consulta.
 *
 * A trilha deixou de pertencer à categoria: agora a categoria APONTA para uma
 * trilha do catálogo, e a versão vigente é a da trilha — pode ser a mesma que
 * outras categorias estão usando.
 */
const INCLUDE_CATEGORIA = {
  _count: { select: { produtos: true } },
  trilha: {
    select: {
      id: true,
      nome: true,
      status: true,
      _count: { select: { versoes: true } },
      versoes: {
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
        trilha: {
          select: {
            id: true,
            nome: true,
            versoes: {
              where: { ativo: true },
              orderBy: { versao: 'desc' },
              take: 1,
              select: {
                id: true,
                versao: true,
                _count: { select: { etapas: true } },
              },
            },
          },
        },
      },
    });

    // Sem trilha vinculada, ou sem versão vigente nela, a categoria não aceita
    // produto — o formulário precisa saber disso antes de o usuário preencher
    // tudo. `trilha` vem junto para a mensagem dizer QUAL trilha está falhando.
    return categorias.map(({ trilha, ...categoria }) => {
      const vigente = trilha?.versoes[0];
      return {
        ...categoria,
        trilha: trilha ? { id: trilha.id, nome: trilha.nome } : null,
        modeloVigente: vigente
          ? {
              id: vigente.id,
              versao: vigente.versao,
              totalEtapas: vigente._count.etapas,
            }
          : null,
      };
    });
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

    /*
     * A trilha NÃO cai junto. Ela é do catálogo e provavelmente serve a outras
     * categorias — antes ela pertencia à categoria e era apagada aqui, o que
     * hoje destruiria o processo alheio. Excluir a categoria apenas solta o
     * vínculo, e a FK é `Restrict` para que nunca seja o contrário.
     */
    await this.prisma.categoriaProduto.delete({ where: { id } });

    return { mensagem: 'Categoria excluída definitivamente.' };
  }

  /**
   * Vincula (ou desvincula, com `null`) a trilha do catálogo que esta categoria
   * segue.
   *
   * Não mexe em produto nenhum: cada produto carrega o retrato da versão pela
   * qual entrou (`Produto.modeloTrilhaId`), então trocar a trilha da categoria
   * muda o processo dos produtos FUTUROS e deixa os em andamento onde estão.
   * Quem quiser mover um produto em curso usa a migração de versão, que é
   * explícita e por produto.
   */
  async vincularTrilha(id: number, trilhaId: number | null) {
    await this.garantirExiste(id);

    if (trilhaId !== null) {
      const trilha = await this.prisma.trilha.findUnique({
        where: { id: trilhaId },
        include: {
          versoes: {
            where: { ativo: true },
            select: { _count: { select: { etapas: true } } },
          },
        },
      });

      if (!trilha) {
        throw new NotFoundException(`Trilha ${trilhaId} não encontrada.`);
      }

      if (trilha.status !== StatusRegistro.ATIVO) {
        throw new ConflictException(
          'Esta trilha está inativa. Reative-a antes de vinculá-la a uma categoria.',
        );
      }

      // Vincular trilha sem versão vigente com etapas deixaria a categoria
      // aparentemente configurada e ainda assim recusando todo produto novo.
      if (!trilha.versoes[0] || trilha.versoes[0]._count.etapas === 0) {
        throw new ConflictException(
          `A trilha "${trilha.nome}" não tem uma versão vigente com etapas. ` +
            'Publique uma versão dela antes de vincular.',
        );
      }
    }

    const categoria = await this.prisma.categoriaProduto.update({
      where: { id },
      data: { trilhaId },
      include: INCLUDE_CATEGORIA,
    });
    return this.comResumo(categoria);
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

  /** Achata trilha e versão vigente para o formato consumido pelo frontend. */
  private comResumo(
    categoria: Prisma.CategoriaProdutoGetPayload<{
      include: typeof INCLUDE_CATEGORIA;
    }>,
  ) {
    const { trilha, _count, ...dados } = categoria;
    const vigente = trilha?.versoes[0];

    return {
      ...dados,
      totalProdutos: _count.produtos,
      trilha: trilha
        ? { id: trilha.id, nome: trilha.nome, status: trilha.status }
        : null,
      totalVersoes: trilha?._count.versoes ?? 0,
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
