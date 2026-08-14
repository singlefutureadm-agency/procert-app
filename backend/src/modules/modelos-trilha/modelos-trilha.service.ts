import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  CriarVersaoTrilhaDto,
  EtapaModeloDto,
  ReordenarEtapasModeloDto,
  SubstituirEtapasDto,
} from './dto/modelo-trilha.dto';

const INCLUDE_MODELO = {
  etapas: { orderBy: { ordem: 'asc' } },
  _count: { select: { produtos: true } },
} satisfies Prisma.ModeloTrilhaInclude;

/**
 * Versões da trilha de certificação de uma categoria.
 *
 * A regra central é a imutabilidade: assim que uma versão tem produto
 * vinculado, ela vira registro histórico — a avaliação daquele produto tem que
 * continuar valendo pelas regras vigentes na submissão. Alterar o processo
 * significa criar uma versão nova, não editar a anterior.
 */
@Injectable()
export class ModelosTrilhaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todas as versões da categoria, da mais recente para a mais antiga. */
  async listarPorCategoria(categoriaId: number) {
    await this.garantirCategoria(categoriaId);

    const versoes = await this.prisma.modeloTrilha.findMany({
      where: { categoriaId },
      include: INCLUDE_MODELO,
      orderBy: { versao: 'desc' },
    });

    return versoes.map((versao) => this.comEditavel(versao));
  }

  async buscarPorId(id: number) {
    const modelo = await this.prisma.modeloTrilha.findUnique({
      where: { id },
      include: { ...INCLUDE_MODELO, categoria: true },
    });

    if (!modelo) {
      throw new NotFoundException(`Modelo de trilha ${id} não encontrado.`);
    }
    return this.comEditavel(modelo);
  }

  /**
   * Cria a próxima versão da trilha.
   *
   * Sem `etapas` no payload, copia as da versão vigente — o caso comum é
   * partir do processo atual e ajustar. A versão anterior é encerrada
   * (`vigenteAte`, `ativo = false`) na mesma transação, garantindo que a
   * categoria nunca tenha duas versões vigentes.
   */
  async criarVersao(categoriaId: number, dto: CriarVersaoTrilhaDto) {
    await this.garantirCategoria(categoriaId);

    const vigente = await this.prisma.modeloTrilha.findFirst({
      where: { categoriaId, ativo: true },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
      orderBy: { versao: 'desc' },
    });

    const etapas = dto.etapas?.length
      ? dto.etapas
      : (vigente?.etapas.map((etapa) => ({
          nome: etapa.nome,
          descricao: etapa.descricao ?? undefined,
          tipo: etapa.tipo,
          obrigatoria: etapa.obrigatoria,
          prazoSlaDias: etapa.prazoSlaDias ?? undefined,
          exigeDocumento: etapa.exigeDocumento,
        })) ?? []);

    if (etapas.length === 0) {
      throw new BadRequestException(
        'Informe as etapas da nova versão: não há versão anterior para copiar.',
      );
    }

    const agregado = await this.prisma.modeloTrilha.aggregate({
      where: { categoriaId },
      _max: { versao: true },
    });
    const proximaVersao = (agregado._max.versao ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      if (vigente) {
        await tx.modeloTrilha.updateMany({
          where: { categoriaId, ativo: true },
          data: { ativo: false, vigenteAte: new Date() },
        });
      }

      const modelo = await tx.modeloTrilha.create({
        data: {
          categoriaId,
          versao: proximaVersao,
          ativo: true,
          etapas: { create: this.comOrdem(etapas) },
        },
        include: INCLUDE_MODELO,
      });

      return this.comEditavel(modelo);
    });
  }

  /**
   * Substitui as etapas de uma versão ainda não utilizada.
   * Com produto vinculado, a versão é imutável e a resposta orienta versionar.
   */
  async substituirEtapas(modeloId: number, dto: SubstituirEtapasDto) {
    const modelo = await this.garantirEditavel(modeloId);

    await this.prisma.$transaction([
      this.prisma.modeloEtapa.deleteMany({ where: { modeloTrilhaId: modelo.id } }),
      this.prisma.modeloEtapa.createMany({
        data: this.comOrdem(dto.etapas).map((etapa) => ({
          ...etapa,
          modeloTrilhaId: modelo.id,
        })),
      }),
    ]);

    return this.buscarPorId(modelo.id);
  }

  /** Persiste a ordem vinda do drag-and-drop, em transação. */
  async reordenarEtapas(modeloId: number, { ordem }: ReordenarEtapasModeloDto) {
    const modelo = await this.garantirEditavel(modeloId);

    const existentes = await this.prisma.modeloEtapa.findMany({
      where: { modeloTrilhaId: modelo.id },
      select: { id: true },
    });
    const idsValidos = new Set(existentes.map((etapa) => etapa.id));

    const invalidos = ordem.filter((id) => !idsValidos.has(id));
    if (invalidos.length) {
      throw new BadRequestException(
        `Etapas que não pertencem a este modelo: ${invalidos.join(', ')}.`,
      );
    }
    if (ordem.length !== existentes.length) {
      throw new BadRequestException(
        'A ordenação precisa conter todas as etapas do modelo.',
      );
    }

    await this.prisma.$transaction(
      ordem.map((id, indice) =>
        this.prisma.modeloEtapa.update({
          where: { id },
          data: { ordem: indice + 1 },
        }),
      ),
    );

    return this.buscarPorId(modelo.id);
  }

  /**
   * Resolve a versão vigente de uma categoria — usada ao cadastrar produto.
   * Exposta para o ProdutosService não precisar duplicar a regra.
   */
  async resolverVigente(categoriaId: number) {
    const modelo = await this.prisma.modeloTrilha.findFirst({
      where: { categoriaId, ativo: true },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
      orderBy: { versao: 'desc' },
    });

    if (!modelo || modelo.etapas.length === 0) {
      throw new BadRequestException(
        'Esta categoria ainda não tem um modelo de trilha vigente com etapas. ' +
          'Cadastre o modelo antes de submeter produtos.',
      );
    }

    return modelo;
  }

  // ---------------------------------------------------------------- privados

  private async garantirCategoria(categoriaId: number) {
    const categoria = await this.prisma.categoriaProduto.findUnique({
      where: { id: categoriaId },
    });
    if (!categoria) {
      throw new NotFoundException(`Categoria ${categoriaId} não encontrada.`);
    }
    return categoria;
  }

  private async garantirEditavel(modeloId: number) {
    const modelo = await this.prisma.modeloTrilha.findUnique({
      where: { id: modeloId },
      include: { _count: { select: { produtos: true } } },
    });

    if (!modelo) {
      throw new NotFoundException(`Modelo de trilha ${modeloId} não encontrado.`);
    }

    if (modelo._count.produtos > 0) {
      throw new ConflictException(
        `Esta versão já está em uso por ${modelo._count.produtos} produto(s) e não pode ser alterada. ` +
          'Crie uma nova versão da trilha para mudar o processo.',
      );
    }

    return modelo;
  }

  /** Numera as etapas de 1..N na ordem em que chegaram. */
  private comOrdem(etapas: EtapaModeloDto[]) {
    return etapas.map((etapa, indice) => ({ ...etapa, ordem: indice + 1 }));
  }

  /** Marca para o frontend se a versão ainda aceita edição direta. */
  private comEditavel<T extends { _count: { produtos: number } }>(modelo: T) {
    const { _count, ...dados } = modelo;
    return {
      ...dados,
      totalProdutos: _count.produtos,
      editavel: _count.produtos === 0,
    };
  }
}
