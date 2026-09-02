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
 * Versões de uma trilha do catálogo.
 *
 * A regra central é a imutabilidade: assim que uma versão tem produto
 * vinculado, ela vira registro histórico — a avaliação daquele produto tem que
 * continuar valendo pelas regras vigentes na submissão. Alterar o processo
 * significa criar uma versão nova, não editar a anterior.
 *
 * A FAMÍLIA (nome, vínculo com categorias, ciclo de vida) é de `TrilhasService`.
 */
@Injectable()
export class ModelosTrilhaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todas as versões da trilha, da mais recente para a mais antiga. */
  async listarPorTrilha(trilhaId: number) {
    await this.garantirTrilha(trilhaId);

    const versoes = await this.prisma.modeloTrilha.findMany({
      where: { trilhaId },
      include: INCLUDE_MODELO,
      orderBy: { versao: 'desc' },
    });

    return versoes.map((versao) => this.comEditavel(versao));
  }

  async buscarPorId(id: number) {
    const modelo = await this.prisma.modeloTrilha.findUnique({
      where: { id },
      include: { ...INCLUDE_MODELO, trilha: true },
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
   * trilha nunca tenha duas versões vigentes.
   */
  async criarVersao(trilhaId: number, dto: CriarVersaoTrilhaDto) {
    await this.garantirTrilha(trilhaId);

    const vigente = await this.prisma.modeloTrilha.findFirst({
      where: { trilhaId, ativo: true },
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
      where: { trilhaId },
      _max: { versao: true },
    });
    const proximaVersao = (agregado._max.versao ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      if (vigente) {
        await tx.modeloTrilha.updateMany({
          where: { trilhaId, ativo: true },
          data: { ativo: false, vigenteAte: new Date() },
        });
      }

      const modelo = await tx.modeloTrilha.create({
        data: {
          trilhaId,
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
      this.prisma.modeloEtapa.deleteMany({
        where: { modeloTrilhaId: modelo.id },
      }),
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
   * Torna esta a versão vigente da trilha, encerrando a que estava no ar.
   *
   * Existe para desfazer uma publicação: uma v3 recém-criada que se mostrou
   * errada precisa de caminho de volta para a v2 sem inventar uma v4 idêntica.
   * Só afeta produto NOVO — os que já estão em avaliação carregam o retrato da
   * versão pela qual entraram e continuam nela. `vigenteAte` volta a ser nulo:
   * a versão está no ar de novo, e uma data de encerramento no passado diria o
   * contrário para todo relatório que lê a vigência.
   */
  async definirVigente(modeloId: number) {
    const modelo = await this.prisma.modeloTrilha.findUnique({
      where: { id: modeloId },
      select: { id: true, trilhaId: true, ativo: true, _count: { select: { etapas: true } } },
    });

    if (!modelo) {
      throw new NotFoundException(`Modelo de trilha ${modeloId} não encontrado.`);
    }

    if (modelo._count.etapas === 0) {
      throw new BadRequestException(
        'Esta versão não tem etapas: uma trilha vigente sem etapa nenhuma faria ' +
          'a categoria recusar todo produto novo. Acrescente as etapas primeiro.',
      );
    }

    if (modelo.ativo) {
      return this.buscarPorId(modeloId);
    }

    await this.prisma.$transaction([
      this.prisma.modeloTrilha.updateMany({
        where: { trilhaId: modelo.trilhaId, ativo: true },
        data: { ativo: false, vigenteAte: new Date() },
      }),
      this.prisma.modeloTrilha.update({
        where: { id: modeloId },
        data: { ativo: true, vigenteAte: null },
      }),
    ]);

    return this.buscarPorId(modeloId);
  }

  /**
   * Exclui uma versão sem produtos.
   *
   * A vigente não sai enquanto for a única da trilha: a trilha ficaria sem
   * versão nenhuma e toda categoria vinculada a ela pararia de aceitar produto,
   * sem nada na tela dizendo o que aconteceu. Havendo outras, a anterior assume
   * a vigência na mesma transação — a trilha nunca fica órfã de vigente.
   */
  async removerVersao(modeloId: number): Promise<{ mensagem: string }> {
    const modelo = await this.garantirEditavel(modeloId);

    const irmas = await this.prisma.modeloTrilha.findMany({
      where: { trilhaId: modelo.trilhaId, id: { not: modeloId } },
      orderBy: { versao: 'desc' },
      select: { id: true },
    });

    if (modelo.ativo && irmas.length === 0) {
      throw new ConflictException(
        'Esta é a única versão da trilha. Excluí-la deixaria as categorias ' +
          'vinculadas sem processo. Exclua a trilha inteira, se for o caso.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // As etapas caem por cascade (ModeloEtapa → ModeloTrilha).
      await tx.modeloTrilha.delete({ where: { id: modeloId } });

      if (modelo.ativo && irmas[0]) {
        await tx.modeloTrilha.update({
          where: { id: irmas[0].id },
          data: { ativo: true, vigenteAte: null },
        });
      }
    });

    return { mensagem: `Versão ${modelo.versao} excluída.` };
  }

  /**
   * Resolve a versão vigente da trilha de uma categoria — usada ao cadastrar
   * produto. Exposta para o `ProdutosService` não duplicar a regra.
   */
  async resolverVigentePorCategoria(categoriaId: number) {
    const categoria = await this.prisma.categoriaProduto.findUnique({
      where: { id: categoriaId },
      select: { trilhaId: true },
    });

    if (!categoria) {
      throw new NotFoundException(`Categoria ${categoriaId} não encontrada.`);
    }

    if (!categoria.trilhaId) {
      throw new BadRequestException(
        'Esta categoria ainda não tem trilha vinculada. Vincule uma trilha do ' +
          'catálogo à categoria antes de submeter produtos.',
      );
    }

    const modelo = await this.prisma.modeloTrilha.findFirst({
      where: { trilhaId: categoria.trilhaId, ativo: true },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
      orderBy: { versao: 'desc' },
    });

    if (!modelo || modelo.etapas.length === 0) {
      throw new BadRequestException(
        'A trilha desta categoria não tem uma versão vigente com etapas. ' +
          'Publique uma versão da trilha antes de submeter produtos.',
      );
    }

    return modelo;
  }

  // ---------------------------------------------------------------- privados

  private async garantirTrilha(trilhaId: number) {
    const trilha = await this.prisma.trilha.findUnique({
      where: { id: trilhaId },
    });
    if (!trilha) {
      throw new NotFoundException(`Trilha ${trilhaId} não encontrada.`);
    }
    return trilha;
  }

  private async garantirEditavel(modeloId: number) {
    const modelo = await this.prisma.modeloTrilha.findUnique({
      where: { id: modeloId },
      include: { _count: { select: { produtos: true } } },
    });

    if (!modelo) {
      throw new NotFoundException(
        `Modelo de trilha ${modeloId} não encontrado.`,
      );
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
