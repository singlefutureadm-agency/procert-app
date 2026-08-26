import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { paginar, RespostaPaginada } from '../../common/dto/paginacao.dto';
import {
  LIMITE_LINHAS_EXPORTACAO,
  ListarRelatorioEquipeDto,
  MESES_MAXIMOS_EXPORTACAO,
} from './dto/relatorios.dto';

/**
 * Desempenho da equipe interna.
 *
 * ## Carteira e atividade são métricas independentes
 *
 * Este é o ponto que não pode regredir. Vêm de origens diferentes e respondem
 * a recortes diferentes:
 *
 * | | Carteira | Atividade |
 * |---|---|---|
 * | Origem | `Cliente.responsavelId` | autoria em histórico/NC/certificado |
 * | Recorte | retrato de **agora** | filtrada por `de`/`ate` |
 *
 * Um funcionário pode movimentar produto de cliente que **não** é da carteira
 * dele, e isso conta como atividade dele. Pode também ter 30 clientes na
 * carteira e nenhuma movimentação no mês — e o relatório precisa mostrar
 * exatamente isso. Por isso a resposta traz dois grupos nomeados e **nenhum
 * campo agregado que combine os dois**: somar carteira com atividade produz um
 * número que não significa nada.
 *
 * ## Por que SQL, e não agregação em memória
 *
 * `DashboardService` faz `findMany` enxuto + JS, e está certo na escala dele.
 * Aqui não serve: seria varrer o histórico inteiro para contar. E o `groupBy`
 * do Prisma **não compara duas colunas**, que é exatamente do que precisamos —
 * linha de anexo de documento tem `status_anterior = status_novo` e não é
 * avaliação de etapa nenhuma (`DocumentosCertificacaoService` grava uma a cada
 * upload). Contá-las inflaria a produtividade de quem só anexou arquivo.
 */

/** Uma linha do relatório, como sai do banco. */
interface LinhaEquipeBruta {
  id: number;
  nome: string;
  email: string;
  role: string;
  status: string;
  ultimo_acesso_em: Date | null;
  clientes_na_carteira: bigint;
  etapas_avaliadas: bigint;
  aprovacoes: bigint;
  reprovacoes: bigint;
  ncs_abertas: bigint;
  certificados_emitidos: bigint;
  documentos_enviados: bigint;
  ultima_movimentacao: Date | null;
}

export interface LinhaEquipe {
  id: number;
  nome: string;
  email: string;
  role: string;
  status: string;
  ultimoAcessoEm: Date | null;
  /** Retrato de agora. **Não** respeita o período. */
  carteira: { clientes: number };
  /** Tudo aqui é recortado pelo período informado. */
  atividade: {
    etapasAvaliadas: number;
    aprovacoes: number;
    reprovacoes: number;
    ncsAbertas: number;
    certificadosEmitidos: number;
    documentosEnviados: number;
    ultimaMovimentacao: Date | null;
  };
}

export interface RelatorioEquipe extends RespostaPaginada<LinhaEquipe> {
  periodo: { de: string | null; ate: string | null };
}

@Injectable()
export class RelatorioEquipeService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: ListarRelatorioEquipeDto): Promise<RelatorioEquipe> {
    const { de, ate } = this.periodo(filtros.de, filtros.ate);

    const [linhas, total] = await Promise.all([
      this.consultar(de, ate, filtros.limite, filtros.skip),
      this.prisma.funcionario.count(),
    ]);

    return {
      ...paginar(linhas, total, filtros),
      periodo: { de: filtros.de ?? null, ate: filtros.ate ?? null },
    };
  }

  /**
   * Mesmos dados, sem paginação, para a exportação.
   *
   * O teto **não trunca**: estourou, é 400 pedindo recorte mais estreito. Uma
   * planilha cortada em silêncio vai para a reunião parecendo completa.
   */
  async paraExportacao(deIso: string, ateIso: string): Promise<LinhaEquipe[]> {
    const { de, ate } = this.periodo(deIso, ateIso);
    this.garantirJanela(de, ate);

    const linhas = await this.consultar(de, ate, LIMITE_LINHAS_EXPORTACAO + 1, 0);

    if (linhas.length > LIMITE_LINHAS_EXPORTACAO) {
      throw new BadRequestException(
        `A exportação passa de ${LIMITE_LINHAS_EXPORTACAO} linhas. ` +
          'Reduza o período para gerar o arquivo.',
      );
    }

    return linhas;
  }

  // ------------------------------------------------------------- internos

  /**
   * Um `LEFT JOIN LATERAL` por fonte de autoria, e não `JOIN` direto.
   *
   * Com joins diretos as linhas se multiplicam entre si (5 etapas × 3 NCs = 15)
   * e todo `COUNT` sai inflado. Cada subconsulta agrega isoladamente e devolve
   * uma linha só. `LEFT` garante que quem não fez nada no período apareça com
   * zero em vez de sumir do relatório — justamente o caso que a gestão quer
   * enxergar.
   */
  private async consultar(
    de: Date | null,
    ate: Date | null,
    limite: number,
    pular: number,
  ): Promise<LinhaEquipe[]> {
    // `IS NULL OR` deixa o filtro opcional sem montar SQL condicional na mão.
    const noPeriodo = (coluna: Prisma.Sql) => Prisma.sql`
      (${de}::timestamp IS NULL OR ${coluna} >= ${de}::timestamp)
      AND (${ate}::timestamp IS NULL OR ${coluna} <= ${ate}::timestamp)
    `;

    const brutas = await this.prisma.$queryRaw<LinhaEquipeBruta[]>(Prisma.sql`
      SELECT
        f.id, f.nome, f.email, f.role::text AS role, f.status::text AS status,
        f.ultimo_acesso_em,
        COALESCE(cart.total, 0)      AS clientes_na_carteira,
        COALESCE(hist.total, 0)      AS etapas_avaliadas,
        COALESCE(hist.aprovadas, 0)  AS aprovacoes,
        COALESCE(hist.reprovadas, 0) AS reprovacoes,
        COALESCE(nc.total, 0)        AS ncs_abertas,
        COALESCE(cert.total, 0)      AS certificados_emitidos,
        COALESCE(doc.total, 0)       AS documentos_enviados,
        hist.ultima                  AS ultima_movimentacao
      FROM funcionarios f

      -- Carteira: SEM recorte de período. É retrato de agora, por decisão.
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM clientes c
        WHERE c.responsavel_id = f.id
      ) cart ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE h.status_novo = 'APROVADO')  AS aprovadas,
          COUNT(*) FILTER (WHERE h.status_novo = 'REPROVADO') AS reprovadas,
          MAX(h.alterado_em) AS ultima
        FROM certificacoes_historico h
        WHERE h.alterado_por_id = f.id
          -- Anexo de documento grava histórico com status_anterior = status_novo
          -- e não é avaliação de etapa. Contá-lo infla quem só subiu arquivo.
          AND h.status_anterior IS DISTINCT FROM h.status_novo
          AND ${noPeriodo(Prisma.sql`h.alterado_em`)}
      ) hist ON TRUE

      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM nao_conformidades n
        WHERE n.aberto_por_id = f.id
          AND ${noPeriodo(Prisma.sql`n.criado_em`)}
      ) nc ON TRUE

      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM certificados ct
        WHERE ct.emitido_por_id = f.id
          AND ${noPeriodo(Prisma.sql`ct.criado_em`)}
      ) cert ON TRUE

      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM documentos_certificacao d
        WHERE d.enviado_por_id = f.id
          AND ${noPeriodo(Prisma.sql`d.criado_em`)}
      ) doc ON TRUE

      ORDER BY etapas_avaliadas DESC, f.nome ASC
      LIMIT ${limite} OFFSET ${pular}
    `);

    /*
     * `COUNT` do Postgres volta como `bigint`, e `bigint` não sobrevive ao
     * `JSON.stringify` do Nest — lança "Do not know how to serialize a BigInt".
     * A conversão é obrigatória, não cosmética.
     */
    return brutas.map((b) => ({
      id: b.id,
      nome: b.nome,
      email: b.email,
      role: b.role,
      status: b.status,
      ultimoAcessoEm: b.ultimo_acesso_em,
      carteira: { clientes: Number(b.clientes_na_carteira) },
      atividade: {
        etapasAvaliadas: Number(b.etapas_avaliadas),
        aprovacoes: Number(b.aprovacoes),
        reprovacoes: Number(b.reprovacoes),
        ncsAbertas: Number(b.ncs_abertas),
        certificadosEmitidos: Number(b.certificados_emitidos),
        documentosEnviados: Number(b.documentos_enviados),
        ultimaMovimentacao: b.ultima_movimentacao,
      },
    }));
  }

  private periodo(
    de?: string,
    ate?: string,
  ): { de: Date | null; ate: Date | null } {
    const inicio = de ? new Date(de) : null;
    const fim = ate ? new Date(ate) : null;

    /*
     * Data sem hora ('2026-12-31') vira meia-noite, e o filtro `<=` cortaria o
     * dia inteiro que o usuário pediu para incluir. O fim do período é o fim
     * do dia informado.
     */
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

  private garantirJanela(de: Date | null, ate: Date | null): void {
    if (!de || !ate) return;

    const limite = new Date(de);
    limite.setMonth(limite.getMonth() + MESES_MAXIMOS_EXPORTACAO);

    if (ate > limite) {
      throw new BadRequestException(
        `A exportação aceita no máximo ${MESES_MAXIMOS_EXPORTACAO} meses por arquivo.`,
      );
    }
  }
}
