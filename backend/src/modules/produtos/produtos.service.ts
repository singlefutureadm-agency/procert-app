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
  AtualizarProdutoDto,
  CriarProdutoDto,
  ListarProdutosDto,
} from './dto/produto.dto';

const INCLUDE_PRODUTO = {
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
} satisfies Prisma.ProdutoInclude;

@Injectable()
export class ProdutosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly modelosTrilha: ModelosTrilhaService,
  ) {}

  async listar(filtros: ListarProdutosDto, usuario: UsuarioAutenticado) {
    // Clientes enxergam apenas os próprios produtos: o escopo é imposto aqui,
    // no servidor, e não pelo id que vem da URL (corrige o IDOR do legado).
    const clienteId =
      usuario.role === Role.CLIENTE ? usuario.id : filtros.clienteId;

    const where: Prisma.ProdutoWhereInput = {
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
      this.prisma.produto.findMany({
        where,
        include: INCLUDE_PRODUTO,
        orderBy: { nome: 'asc' },
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.produto.count({ where }),
    ]);

    const dados = registros.map((produto) => this.comResumo(produto));
    return paginar(dados, total, filtros);
  }

  async buscarPorId(id: number, usuario: UsuarioAutenticado) {
    const produto = await this.prisma.produto.findUnique({
      where: { id },
      include: INCLUDE_PRODUTO,
    });

    if (!produto) {
      throw new NotFoundException(`Produto ${id} não encontrado.`);
    }
    this.garantirAcesso(produto.clienteId, usuario);

    return this.comResumo(produto);
  }

  /**
   * Cadastra o produto e abre a trilha de certificação.
   *
   * A trilha vem da versão vigente da trilha VINCULADA à categoria escolhida, e
   * o produto guarda essa versão (`modeloTrilhaId`) como retrato: se a trilha
   * publicar uma versão nova amanhã — ou se a categoria passar a apontar para
   * outra trilha —, este produto continua sendo avaliado pelo processo que
   * valia na submissão.
   *
   * Diferença em relação ao legado: produto e etapas nascem na MESMA
   * transação — lá, se o INSERT das etapas falhasse, o produto ficava órfão
   * sem nenhuma certificação associada.
   */
  async criar(dto: CriarProdutoDto) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: dto.clienteId },
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente ${dto.clienteId} não encontrado.`);
    }

    const categoria = await this.prisma.categoriaProduto.findUnique({
      where: { id: dto.categoriaId },
    });
    if (!categoria) {
      throw new NotFoundException(`Categoria ${dto.categoriaId} não encontrada.`);
    }
    if (categoria.status !== StatusRegistro.ATIVO) {
      throw new BadRequestException(
        'Esta categoria está inativa e não aceita novos produtos.',
      );
    }

    // Lança 400 orientando vincular a trilha, ou publicar uma versão dela,
    // conforme o que estiver faltando.
    const modelo = await this.modelosTrilha.resolverVigentePorCategoria(
      dto.categoriaId,
    );

    return this.prisma.$transaction(async (tx) => {
      const produto = await tx.produto.create({
        data: {
          clienteId: dto.clienteId,
          categoriaId: dto.categoriaId,
          modeloTrilhaId: modelo.id,
          nome: dto.nome,
          descricao: dto.descricao,
          preco: dto.preco ?? 0,
        },
      });

      await tx.certificacaoProduto.createMany({
        data: modelo.etapas.map((etapa) => ({
          produtoId: produto.id,
          etapaId: etapa.id,
          // A trilha do produto nasce com a ordem do modelo; daí em diante ela
          // é dele, e sobrevive a mudanças de versão.
          ordem: etapa.ordem,
          status: StatusCertificacao.PENDENTE,
          observacao: 'Etapa pendente',
        })),
      });

      return tx.produto.findUniqueOrThrow({
        where: { id: produto.id },
        include: INCLUDE_PRODUTO,
      });
    });
  }

  async atualizar(id: number, dto: AtualizarProdutoDto) {
    await this.garantirExiste(id);

    if (dto.clienteId) {
      const cliente = await this.prisma.cliente.findUnique({
        where: { id: dto.clienteId },
      });
      if (!cliente) {
        throw new NotFoundException(`Cliente ${dto.clienteId} não encontrado.`);
      }
    }

    return this.prisma.produto.update({
      where: { id },
      data: dto,
      include: INCLUDE_PRODUTO,
    });
  }

  async alterarStatus(id: number, status: StatusRegistro) {
    await this.garantirExiste(id);
    return this.prisma.produto.update({
      where: { id },
      data: { status },
      include: INCLUDE_PRODUTO,
    });
  }

  /** Exclusão definitiva: remove em cascata certificações e histórico. */
  async remover(id: number): Promise<{ mensagem: string }> {
    const produto = await this.garantirExiste(id);
    await this.uploads.remover(produto.fotoUrl);
    await this.prisma.produto.delete({ where: { id } });
    return { mensagem: 'Produto excluído definitivamente.' };
  }

  async atualizarFoto(id: number, arquivo: Express.Multer.File) {
    const produto = await this.garantirExiste(id);
    const fotoUrl = await this.uploads.substituirImagem(
      arquivo,
      'produtos',
      produto.fotoUrl,
    );

    return this.prisma.produto.update({
      where: { id },
      data: { fotoUrl },
      include: INCLUDE_PRODUTO,
    });
  }

  // ---------------------------------------------------------------- privados

  private async garantirExiste(id: number) {
    const produto = await this.prisma.produto.findUnique({ where: { id } });
    if (!produto) {
      throw new NotFoundException(`Produto ${id} não encontrado.`);
    }
    return produto;
  }

  private garantirAcesso(clienteId: number, usuario: UsuarioAutenticado): void {
    if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) {
      throw new ForbiddenException(
        'Você só pode acessar produtos do seu próprio cadastro.',
      );
    }
  }

  /** Acrescenta etapa atual, progresso e último pagamento ao payload. */
  private comResumo(
    produto: Prisma.ProdutoGetPayload<{ include: typeof INCLUDE_PRODUTO }>,
  ) {
    const etapas = produto.certificacao;
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

    const { pagamentos, ...dadosProduto } = produto;

    return {
      ...dadosProduto,
      preco: Number(produto.preco),
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
