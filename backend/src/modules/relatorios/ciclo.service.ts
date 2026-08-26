import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  AgrupamentoCiclo,
  ListarTempoCicloDto,
} from './dto/relatorios.dto';

/**
 * Tempo de ciclo da certificação.
 *
 * ## Três relógios diferentes, nunca um "tempo da etapa"
 *
 * O relatório mede coisas distintas e **nomeia cada uma**, porque daqui a seis
 * meses alguém vai perguntar "por que essa etapa demorou 14 dias?" e a resposta
 * tem de sair do rótulo, sem abrir o código:
 *
 * | Métrica | De | Até |
 * |---|---|---|
 * | Lead time da trilha | `Produto.criadoEm` | aprovação da última etapa OBRIGATÓRIA |
 * | Tempo de tratamento da etapa | 1ª saída de `PENDENTE` | aprovação |
 * | Tempo em fila | `CertificacaoProduto.criadoEm` | 1ª saída de `PENDENTE` |
 *
 * Os números **não são comparáveis entre si** e nunca entram na mesma série.
 *
 * ## Por que os marcos são esses
 *
 * `CertificacaoProduto.criadoEm` é `DEFAULT CURRENT_TIMESTAMP` e a trilha nasce
 * num único `createMany` dentro da transação que cria o produto — em Postgres
 * `CURRENT_TIMESTAMP` é o início da transação, então **todas as etapas de um
 * produto nascem com o mesmo timestamp**. Ele marca a entrada da etapa NA FILA,
 * nunca o início do trabalho nela. É por isso que ele só aparece no tempo em
 * fila e no lead time.
 *
 * `salvar()` **não impõe ordem entre etapas** e aceita lote, então "início da
 * etapa = aprovação da anterior" seria inválido: várias podem ser aprovadas no
 * mesmo instante. O único marco de início defensável no nível da etapa é a
 * primeira saída de `PENDENTE`.
 *
 * ## Recortes que evitam número mentiroso
 *
 * - Só etapas hoje `APROVADO` entram nas medianas de tratamento e fila; as em
 *   aberto vão para bloco próprio. Misturá-las reintroduz o viés de
 *   sobrevivência, que faz a trilha lenta parecer rápida.
 * - Etapa que foi de `PENDENTE` direto a `APROVADO` tem tratamento zero por
 *   construção e sai da mediana, contada em "Aprovação direta". Incluída, um
 *   time que aprova em lote exibiria ciclo de 0 dia.
 * - **Mediana**, não média: um produto abandonado há dois anos destrói a média.
 * - Agrupamento por trilha usa categoria **+ versão**. Juntar v1 e v3 compara
 *   réguas diferentes.
 */

/** Uma métrica de duração, sempre acompanhada da base sobre a qual foi medida. */
export interface Medida {
  medianaDias: number | null;
  /** Quantas etapas (ou produtos) entraram no cálculo. */
  base: number;
}

export interface GrupoCiclo {
  chave: string;
  /** Só existe no agrupamento por trilha: é uma medida do produto, não da etapa. */
  leadTimeTrilha: Medida | null;
  tempoTratamentoEtapa: Medida;
  tempoEmFila: Medida;
  /** Etapas aprovadas sem tratamento registrado. Fora da mediana acima. */
  aprovacaoDireta: { etapas: number };
  etapasEmAberto: { etapas: number; medianaDias: number | null };
}

export interface RelatorioCiclo {
  agrupamento: AgrupamentoCiclo;
  periodo: { de: string | null; ate: string | null };
  grupos: GrupoCiclo[];
}

interface GrupoBruto {
  chave: string;
  tratamento_mediana: number | null;
  tratamento_base: bigint;
  fila_mediana: number | null;
  fila_base: bigint;
  diretas: bigint;
  abertas: bigint;
  abertas_mediana: number | null;
}

interface LeadTimeBruto {
  chave: string;
  mediana: number | null;
  base: bigint;
}

@Injectable()
export class CicloService {
  constructor(private readonly prisma: PrismaService) {}

  async relatorio(filtros: ListarTempoCicloDto): Promise<RelatorioCiclo> {
    const { de, ate } = this.periodo(filtros.de, filtros.ate);
    const agrupamento = filtros.agrupamento;

    const grupos = await this.consultarEtapas(agrupamento, de, ate);

    // Lead time é medida do PRODUTO: não faz sentido por etapa.
    const leadTimes =
      agrupamento === 'trilha' ? await this.consultarLeadTime(de, ate) : [];
    const porChave = new Map(leadTimes.map((l) => [l.chave, l]));

    return {
      agrupamento,
      periodo: { de: filtros.de ?? null, ate: filtros.ate ?? null },
      grupos: grupos.map((g) => {
        const lead = porChave.get(g.chave);

        return {
          chave: g.chave,
          leadTimeTrilha: lead
            ? { medianaDias: this.dias(lead.mediana), base: Number(lead.base) }
            : agrupamento === 'trilha'
              ? { medianaDias: null, base: 0 }
              : null,
          tempoTratamentoEtapa: {
            medianaDias: this.dias(g.tratamento_mediana),
            base: Number(g.tratamento_base),
          },
          tempoEmFila: {
            medianaDias: this.dias(g.fila_mediana),
            base: Number(g.fila_base),
          },
          aprovacaoDireta: { etapas: Number(g.diretas) },
          etapasEmAberto: {
            etapas: Number(g.abertas),
            medianaDias: this.dias(g.abertas_mediana),
          },
        };
      }),
    };
  }

  // ------------------------------------------------------------- internos

  /**
   * Métricas no nível da etapa.
   *
   * O `WITH` monta uma linha por etapa com os três marcos resolvidos, e a
   * agregação acontece depois. Sem o CTE, cada `percentile_cont` repetiria as
   * subconsultas de histórico.
   */
  private async consultarEtapas(
    agrupamento: AgrupamentoCiclo,
    de: Date | null,
    ate: Date | null,
  ): Promise<GrupoBruto[]> {
    // Allowlist: a expressão de agrupamento nunca vem da query string.
    const chave =
      agrupamento === 'trilha'
        ? Prisma.sql`cat.nome || ' · v' || mt.versao`
        : Prisma.sql`me.nome`;

    return this.prisma.$queryRaw<GrupoBruto[]>(Prisma.sql`
      WITH etapa AS (
        SELECT
          ${chave} AS chave,
          cp.id,
          cp.criado_em,
          cp.status,
          (
            SELECT MIN(h.alterado_em)
            FROM certificacoes_historico h
            WHERE h.certificacao_id = cp.id
              AND h.status_anterior IS DISTINCT FROM h.status_novo
              AND h.status_novo <> 'PENDENTE'
          ) AS primeira_saida,
          (
            SELECT MAX(h.alterado_em)
            FROM certificacoes_historico h
            WHERE h.certificacao_id = cp.id
              AND h.status_anterior IS DISTINCT FROM h.status_novo
              AND h.status_novo = 'APROVADO'
          ) AS aprovacao,
          EXISTS (
            SELECT 1
            FROM certificacoes_historico h
            WHERE h.certificacao_id = cp.id
              AND h.status_anterior = 'PENDENTE'
              AND h.status_novo = 'APROVADO'
          ) AS direta
        FROM certificacoes_produto cp
        JOIN modelos_etapa me       ON me.id = cp.etapa_id
        JOIN produtos p             ON p.id = cp.produto_id
        JOIN modelos_trilha mt      ON mt.id = p.modelo_trilha_id
        JOIN categorias_produto cat ON cat.id = mt.categoria_id
        WHERE p.status = 'ATIVO'
          AND (${de}::timestamp IS NULL OR cp.criado_em >= ${de}::timestamp)
          AND (${ate}::timestamp IS NULL OR cp.criado_em <= ${ate}::timestamp)
      )
      SELECT
        chave,
        -- Tratamento: da 1a saida de PENDENTE ate a aprovacao. Exclui as
        -- aprovacoes diretas, cujo tratamento e zero por construcao.
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (aprovacao - primeira_saida))
        ) FILTER (
          WHERE status = 'APROVADO' AND aprovacao IS NOT NULL
            AND primeira_saida IS NOT NULL AND NOT direta
        ) AS tratamento_mediana,
        COUNT(*) FILTER (
          WHERE status = 'APROVADO' AND aprovacao IS NOT NULL
            AND primeira_saida IS NOT NULL AND NOT direta
        ) AS tratamento_base,

        -- Fila: da criacao da etapa ate alguem encostar nela.
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (primeira_saida - criado_em))
        ) FILTER (WHERE primeira_saida IS NOT NULL) AS fila_mediana,
        COUNT(*) FILTER (WHERE primeira_saida IS NOT NULL) AS fila_base,

        COUNT(*) FILTER (WHERE status = 'APROVADO' AND direta) AS diretas,

        -- Em aberto: bloco proprio, medido de agora. Junto das medianas acima
        -- reintroduziria o vies de sobrevivencia.
        COUNT(*) FILTER (WHERE status <> 'APROVADO') AS abertas,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (now() - criado_em))
        ) FILTER (WHERE status <> 'APROVADO') AS abertas_mediana
      FROM etapa
      GROUP BY chave
      ORDER BY chave
    `);
  }

  /**
   * Lead time por trilha, medido no PRODUTO.
   *
   * Só entra o produto cujas etapas obrigatórias estão TODAS aprovadas — é a
   * mesma regra que libera a emissão do certificado. A emissão em si fica de
   * fora de propósito: emitir é ato manual e pode demorar dias depois de a
   * trilha fechar, e misturar os dois mede a secretaria, não o processo.
   */
  private async consultarLeadTime(
    de: Date | null,
    ate: Date | null,
  ): Promise<LeadTimeBruto[]> {
    return this.prisma.$queryRaw<LeadTimeBruto[]>(Prisma.sql`
      WITH produto AS (
        SELECT
          cat.nome || ' · v' || mt.versao AS chave,
          p.id,
          p.criado_em,
          (
            SELECT MAX(h.alterado_em)
            FROM certificacoes_produto cp
            JOIN modelos_etapa me ON me.id = cp.etapa_id
            JOIN certificacoes_historico h ON h.certificacao_id = cp.id
            WHERE cp.produto_id = p.id
              AND me.obrigatoria
              AND h.status_anterior IS DISTINCT FROM h.status_novo
              AND h.status_novo = 'APROVADO'
          ) AS concluido_em,
          NOT EXISTS (
            SELECT 1
            FROM certificacoes_produto cp2
            JOIN modelos_etapa me2 ON me2.id = cp2.etapa_id
            WHERE cp2.produto_id = p.id
              AND me2.obrigatoria
              AND cp2.status <> 'APROVADO'
          ) AS concluido
        FROM produtos p
        JOIN modelos_trilha mt      ON mt.id = p.modelo_trilha_id
        JOIN categorias_produto cat ON cat.id = mt.categoria_id
        WHERE p.status = 'ATIVO'
          AND (${de}::timestamp IS NULL OR p.criado_em >= ${de}::timestamp)
          AND (${ate}::timestamp IS NULL OR p.criado_em <= ${ate}::timestamp)
      )
      SELECT
        chave,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (concluido_em - criado_em))
        ) FILTER (WHERE concluido AND concluido_em IS NOT NULL) AS mediana,
        COUNT(*) FILTER (WHERE concluido AND concluido_em IS NOT NULL) AS base
      FROM produto
      GROUP BY chave
      ORDER BY chave
    `);
  }

  /** Segundos → dias com uma casa. `null` atravessa: base vazia não vira zero. */
  private dias(segundos: number | string | null): number | null {
    if (segundos === null || segundos === undefined) return null;
    const valor = typeof segundos === 'string' ? Number(segundos) : segundos;
    if (Number.isNaN(valor)) return null;
    return Math.round((valor / 86_400) * 10) / 10;
  }

  private periodo(
    de?: string,
    ate?: string,
  ): { de: Date | null; ate: Date | null } {
    const inicio = de ? new Date(de) : null;
    const fim = ate ? new Date(ate) : null;

    // Data sem hora cortaria o próprio dia informado.
    if (fim && ate && /^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      fim.setHours(23, 59, 59, 999);
    }

    if (inicio && fim && inicio > fim) {
      throw new BadRequestException(
        'O início do período não pode ser posterior ao fim.',
      );
    }

    return { de: inicio, ate: fim };
  }
}
