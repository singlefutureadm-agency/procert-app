import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  FaseProcesso,
  MotivoProcesso,
  PapelFuncional,
  Prisma,
  Role,
  StatusCertificacao,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import {
  ListarQuadroDto,
  SemaforoAging,
} from './dto/certificacao.dto';

/**
 * Limiares do semáforo de aging, em dias corridos desde `Produto.criadoEm`.
 *
 * Vieram das etiquetas 30/20/15 que a operação aplicava À MÃO no quadro Trello.
 * O que exatamente elas mediam **não foi confirmado com a Qualidade**: podem
 * ser SLA contratual, tempo parado ou simples aging. Estes números reproduzem o
 * comportamento observado (amarelo a partir de 20 dias, vermelho a partir de
 * 30) e a etiqueta de 15 dias ficou de fora por não ter par nas outras duas.
 *
 * Constante no código, e NÃO tabela de parâmetros nem tela de configuração:
 * enquanto o significado não estiver decidido, uma tela de ajuste só espalharia
 * a indefinição por mais um lugar. Quando a Qualidade responder, o valor muda
 * aqui — uma linha.
 */
export const ALERTAS_AGING = { amarelo: 20, vermelho: 30 } as const;

/** Ordem das colunas do quadro: a do enum, mais a coluna derivada do fim. */
export const COLUNAS_QUADRO = [
  ...Object.values(FaseProcesso),
  'CONCLUIDO',
  // Destino explícito para processo interrompido. Sem ele, cancelar só teria
  // duas saídas ruins: excluir o registro, ou deixá-lo preso numa fase que não
  // descreve mais nada — as duas somem com a informação de que ele existiu.
  'CANCELADO',
] as const;

export type ColunaQuadro = (typeof COLUNAS_QUADRO)[number];

/**
 * Situação do prazo da etapa atual — TRÊS estados, não dois.
 *
 * A primeira versão devolvia `SlaDoCartao | null`, e o `null` colapsava dois
 * casos que a operação lê de formas opostas:
 *
 *  - **SEM_PRAZO**: a etapa não tem SLA acordado. Não há nada a cobrar, e a
 *    tela não deve sugerir que há.
 *  - **NAO_INICIADA**: a etapa TEM prazo, mas ninguém começou. Isso é um
 *    processo parado na fila — exatamente o que o quadro existe para mostrar —,
 *    e renderizado como o mesmo "—" do caso acima ele desaparece.
 *
 * A distinção é feita AQUI e não na tela: derivá-la no frontend exigiria expor
 * `prazoSlaHoras` e `iniciadaEm` crus e repetir a regra em cada componente que
 * mostrasse um cartão. O discriminante `situacao` deixa o `switch` exaustivo do
 * lado de quem desenha.
 */
export type SituacaoSla =
  | { situacao: 'SEM_PRAZO' }
  | { situacao: 'NAO_INICIADA'; prazoHoras: number }
  | {
      situacao: 'EM_CONTAGEM';
      prazoHoras: number;
      limiteEm: Date;
      /** Negativo quando o prazo já passou — o sinal é a informação. */
      horasRestantes: number;
      estourado: boolean;
    };

export interface CartaoQuadro {
  produtoId: number;
  codigoProcesso: string | null;
  produto: string;
  motivoProcesso: MotivoProcesso;
  cliente: { id: number; nome: string };
  categoria: { id: number; nome: string };
  etapaAtual: {
    id: number;
    nome: string;
    status: StatusCertificacao;
    papelResponsavel: PapelFuncional | null;
  } | null;
  totalEtapas: number;
  etapasAprovadas: number;
  progresso: number;
  /**
   * Dias entre a submissão e hoje — ou entre a submissão e a conclusão, se o
   * processo já terminou. **O relógio para ao concluir.**
   */
  diasEmAberto: number;
  /** Todas as etapas OBRIGATÓRIAS aprovadas. Opcionais pendentes não seguram. */
  concluido: boolean;
  /**
   * Processo interrompido. `null` = em andamento.
   *
   * Precede a fase: um cancelado não está em fase nenhuma.
   */
  cancelamento: {
    em: Date;
    motivo: string | null;
    por: string | null;
  } | null;
  /** Checklist da ETAPA ATUAL. `total: 0` = etapa sem checklist definido. */
  checklist: { concluidas: number; total: number };
  /**
   * `null` em processo concluído — ausência de sinal, que é diferente de VERDE.
   *
   * Verde afirmaria "está dentro do prazo", e um processo encerrado não está
   * dentro nem fora de prazo nenhum: ele acabou. Semáforo aceso em coluna
   * terminal também disputaria atenção com o que ainda precisa de ação.
   */
  semaforo: SemaforoAging | null;
  sla: SituacaoSla;
  naoConformidadesAbertas: number;
}

export interface ColunaDoQuadro {
  fase: ColunaQuadro;
  /** Contagem REAL, independente de `limitePorFase`. */
  total: number;
  cartoes: CartaoQuadro[];
}

export interface Quadro {
  colunas: ColunaDoQuadro[];
  limitePorFase: number;
  limiares: typeof ALERTAS_AGING;
}

/** Uma linha crua do `$queryRaw`, antes de virar cartão. */
interface LinhaQuadro {
  produto_id: number;
  codigo_processo: string | null;
  produto: string;
  motivo_processo: MotivoProcesso;
  cliente_id: number;
  cliente_nome: string;
  categoria_id: number;
  categoria_nome: string;
  etapa_id: number | null;
  etapa_nome: string | null;
  etapa_status: StatusCertificacao | null;
  papel_responsavel: PapelFuncional | null;
  prazo_sla_horas: number | null;
  iniciada_em: Date | null;
  total_etapas: bigint;
  etapas_aprovadas: bigint;
  dias_em_aberto: number;
  concluido: boolean;
  cancelado_em: Date | null;
  motivo_cancelamento: string | null;
  cancelado_por_nome: string | null;
  micro_total: bigint;
  micro_concluidas: bigint;
  ncs_abertas: bigint;
  coluna: ColunaQuadro;
  total_da_coluna: bigint;
}

/**
 * Quadro de gestão de processos — o pipeline por fase.
 *
 * ## A fase é DERIVADA, nunca armazenada
 *
 * A coluna de um processo sai da etapa atual dele, resolvida pela mesma regra
 * que `listarPainel` já usa: 1ª `EM_ANDAMENTO`, senão 1ª `PENDENTE`, senão a
 * última. Nada disso é gravado em `Produto`.
 *
 * No quadro Trello de onde a demanda veio, a posição da lista e o progresso do
 * checklist eram duas fontes de verdade mantidas à mão — e divergiam. Gravar a
 * fase no produto repetiria o defeito com outro nome, e é por isso que a tela
 * também não tem arrastar-e-soltar: arrastar sugeriria que a posição é
 * editável.
 *
 * ## Por que SQL cru
 *
 * A derivação da etapa atual é por produto, e o quadro precisa de contagem
 * REAL por coluna somada a um recorte de N cartões. Em Prisma isso seria uma
 * consulta por coluna mais uma por produto para o resumo — N+1 —, ou carregar a
 * base inteira e agregar em memória, que é a pendência já registrada do
 * `DashboardService`. Uma consulta com `DISTINCT ON` e funções de janela
 * resolve as duas coisas de uma vez, e é o mesmo caminho que `relatorios/`
 * tomou.
 *
 * `COUNT(*) OVER (PARTITION BY coluna)` é o detalhe que faz `limitePorFase`
 * não mentir: ele conta a partição inteira, antes do corte por `ROW_NUMBER`.
 */
@Injectable()
export class QuadroService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(
    filtros: ListarQuadroDto,
    usuario: UsuarioAutenticado,
  ): Promise<Quadro> {
    // O controller já barra CLIENTE com @Roles, e esta guarda é a segunda
    // camada: a divisão por fase e por departamento é organização interna, e o
    // cliente tem a timeline do próprio produto. Repetida aqui porque a regra
    // do projeto é que o escopo viva no service, não só na rota.
    if (usuario.role === Role.CLIENTE) {
      throw new ForbiddenException(
        'O quadro de processos é uma visão interna da equipe.',
      );
    }

    const limitePorFase = filtros.limitePorFase ?? 50;
    const linhas = await this.consultar(filtros, limitePorFase);

    // Toda coluna aparece, inclusive vazia: uma fase que some da tela vira uma
    // etapa do processo que ninguém lembra que existe.
    return {
      colunas: COLUNAS_QUADRO.map((fase) => {
        const daColuna = linhas.filter((linha) => linha.coluna === fase);

        return {
          fase,
          total: Number(daColuna[0]?.total_da_coluna ?? 0),
          cartoes: daColuna.map((linha) => this.paraCartao(linha)),
        };
      }),
      limitePorFase,
      limiares: ALERTAS_AGING,
    };
  }

  // ------------------------------------------------------------- internos

  private paraCartao(linha: LinhaQuadro): CartaoQuadro {
    const totalEtapas = Number(linha.total_etapas);
    const etapasAprovadas = Number(linha.etapas_aprovadas);

    return {
      produtoId: linha.produto_id,
      codigoProcesso: linha.codigo_processo,
      produto: linha.produto,
      motivoProcesso: linha.motivo_processo,
      cliente: { id: linha.cliente_id, nome: linha.cliente_nome },
      categoria: { id: linha.categoria_id, nome: linha.categoria_nome },
      etapaAtual: linha.etapa_id
        ? {
            id: linha.etapa_id,
            nome: linha.etapa_nome!,
            status: linha.etapa_status!,
            papelResponsavel: linha.papel_responsavel,
          }
        : null,
      totalEtapas,
      etapasAprovadas,
      progresso: totalEtapas
        ? Math.round((etapasAprovadas / totalEtapas) * 100)
        : 0,
      diasEmAberto: linha.dias_em_aberto,
      concluido: linha.concluido,
      cancelamento: linha.cancelado_em
        ? {
            em: linha.cancelado_em,
            motivo: linha.motivo_cancelamento,
            por: linha.cancelado_por_nome,
          }
        : null,
      checklist: {
        concluidas: Number(linha.micro_concluidas),
        total: Number(linha.micro_total),
      },
      // Processo encerrado não acende semáforo: `null` é ausência de sinal.
      // Processo encerrado OU cancelado não acende semáforo: `null` é ausência
      // de sinal, e é diferente de VERDE.
      semaforo:
        linha.concluido || linha.cancelado_em
          ? null
          : semaforoDoAging(linha.dias_em_aberto),
      sla: calcularSla(linha.prazo_sla_horas, linha.iniciada_em),
      naoConformidadesAbertas: Number(linha.ncs_abertas),
    };
  }

  private consultar(filtros: ListarQuadroDto, limitePorFase: number) {
    const busca = filtros.busca?.trim() ? `%${filtros.busca.trim()}%` : null;

    return this.prisma.$queryRaw<LinhaQuadro[]>(Prisma.sql`
      WITH etapa AS (
        SELECT
          cp.produto_id,
          cp.id,
          cp.status,
          cp.ordem,
          cp.iniciada_em,
          cp.concluida_em,
          -- Progresso do checklist DESTA etapa. Subconsultas, e não JOIN: um
          -- JOIN com micro_etapas_certificacao multiplicaria a linha da etapa
          -- por item e inflaria toda contagem acima.
          (SELECT COUNT(*) FROM micro_etapas_certificacao m
             WHERE m.certificacao_id = cp.id)                     AS micro_total,
          (SELECT COUNT(*) FROM micro_etapas_certificacao m
             WHERE m.certificacao_id = cp.id AND m.concluida)     AS micro_concluidas,
          me.nome              AS etapa_nome,
          me.fase,
          me.papel_responsavel,
          me.prazo_sla_horas,
          me.obrigatoria
        FROM certificacoes_produto cp
        JOIN modelos_etapa me ON me.id = cp.etapa_id
      ),
      atual AS (
        -- Mesma regra derivada de listarPainel: 1ª EM_ANDAMENTO, senão 1ª
        -- PENDENTE, senão a última. As duas primeiras querem a MENOR ordem e a
        -- terceira quer a MAIOR, então a chave do meio só existe para os dois
        -- primeiros casos; no terceiro ela é NULL para todas as linhas do
        -- produto, o desempate cai no \`ordem DESC\` e sai a última.
        SELECT DISTINCT ON (produto_id) *
        FROM (
          SELECT
            e.*,
            CASE e.status
              WHEN 'EM_ANDAMENTO' THEN 0
              WHEN 'PENDENTE'     THEN 1
              ELSE 2
            END AS prioridade
          FROM etapa e
        ) ordenada
        ORDER BY
          produto_id,
          prioridade,
          CASE WHEN prioridade < 2 THEN ordem END ASC NULLS LAST,
          ordem DESC
      ),
      resumo AS (
        SELECT
          produto_id,
          COUNT(*)                                        AS total_etapas,
          COUNT(*) FILTER (WHERE status = 'APROVADO')     AS etapas_aprovadas,
          COUNT(*) FILTER (
            WHERE obrigatoria AND status <> 'APROVADO'
          )                                               AS obrigatorias_pendentes,
          -- Marco final do processo: a aprovação da ÚLTIMA etapa obrigatória.
          -- É o mesmo fim que o "lead time da trilha" do ciclo.service usa, e
          -- só vale quando não resta obrigatória pendente — daí o CASE lá
          -- embaixo, que exige as duas condições juntas.
          MAX(concluida_em) FILTER (WHERE obrigatoria)    AS concluido_em
        FROM etapa
        GROUP BY produto_id
      ),
      cartao AS (
        SELECT
          p.id                       AS produto_id,
          p.codigo_processo,
          p.nome                     AS produto,
          p.motivo_processo,
          c.id                       AS cliente_id,
          c.nome                     AS cliente_nome,
          cat.id                     AS categoria_id,
          cat.nome                   AS categoria_nome,
          a.id                       AS etapa_id,
          a.etapa_nome,
          a.status                   AS etapa_status,
          a.papel_responsavel,
          a.prazo_sla_horas,
          a.iniciada_em,
          COALESCE(a.micro_total, 0)      AS micro_total,
          COALESCE(a.micro_concluidas, 0) AS micro_concluidas,
          COALESCE(r.total_etapas, 0)     AS total_etapas,
          COALESCE(r.etapas_aprovadas, 0) AS etapas_aprovadas,
          -- Dias corridos desde a abertura do processo: criado_em do PRODUTO,
          -- que é a submissão — não o da etapa, que é entrada na fila.
          --
          -- O relógio PARA quando o processo conclui. Contra NOW() sem parada,
          -- todo processo antigo vira VERMELHO com o tempo e a coluna
          -- CONCLUIDO fica um paredão vermelho — o semáforo deixaria de
          -- separar o que precisa de atenção do que só é velho.
          -- O relógio para no CANCELAMENTO também, e não só na conclusão: um
          -- processo interrompido não continua envelhecendo.
          (DATE_PART(
            'day',
            COALESCE(
              p.cancelado_em,
              CASE
                WHEN COALESCE(r.obrigatorias_pendentes, 0) = 0
                 AND COALESCE(r.total_etapas, 0) > 0 THEN r.concluido_em
              END,
              NOW()
            ) - p.criado_em
          ))::int AS dias_em_aberto,
          p.cancelado_em,
          p.motivo_cancelamento,
          p.cancelado_por_nome,
          -- Sinaliza ao TypeScript que este cartão é de processo encerrado, e
          -- é o que zera o semáforo. Derivado da mesma condição da coluna.
          (COALESCE(r.obrigatorias_pendentes, 0) = 0
            AND COALESCE(r.total_etapas, 0) > 0) AS concluido,
          -- LATERAL, e não JOIN direto: um JOIN com nao_conformidades
          -- multiplicaria a linha do produto por NC e inflaria todo COUNT.
          nc.abertas                 AS ncs_abertas,
          -- Concluído tem coluna própria e VEM DAS OBRIGATÓRIAS: opcionais
          -- pendentes não seguram o processo, é a mesma régua da emissão do
          -- certificado.
          -- CANCELADO tem PRECEDÊNCIA sobre tudo: um processo interrompido não
          -- está numa fase, e mostrá-lo como "concluído" por ter as
          -- obrigatórias aprovadas seria afirmar um desfecho que não houve.
          CASE
            WHEN p.cancelado_em IS NOT NULL THEN 'CANCELADO'
            WHEN COALESCE(r.total_etapas, 0) > 0
             AND COALESCE(r.obrigatorias_pendentes, 0) = 0 THEN 'CONCLUIDO'
            ELSE COALESCE(a.fase::text, 'ABERTURA')
          END AS coluna
        FROM produtos p
        JOIN clientes c            ON c.id = p.cliente_id
        JOIN categorias_produto cat ON cat.id = p.categoria_id
        LEFT JOIN atual a          ON a.produto_id = p.id
        LEFT JOIN resumo r         ON r.produto_id = p.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS abertas
          FROM nao_conformidades n
          JOIN certificacoes_produto cp2 ON cp2.id = n.certificacao_id
          WHERE cp2.produto_id = p.id
            AND n.status IN ('ABERTA', 'EM_TRATATIVA')
        ) nc ON TRUE
        WHERE p.status = 'ATIVO'
          AND (${filtros.categoriaId ?? null}::int IS NULL
               OR p.categoria_id = ${filtros.categoriaId ?? null}::int)
          AND (${filtros.clienteId ?? null}::int IS NULL
               OR p.cliente_id = ${filtros.clienteId ?? null}::int)
          AND (${filtros.papelResponsavel ?? null}::text IS NULL
               OR a.papel_responsavel::text = ${filtros.papelResponsavel ?? null}::text)
          AND (${busca}::text IS NULL
               OR p.nome ILIKE ${busca}::text
               OR c.nome ILIKE ${busca}::text
               OR p.codigo_processo ILIKE ${busca}::text)
      ),
      classificado AS (
        SELECT
          cartao.*,
          -- NULL em processo concluído, igual ao que o service devolve: sem
          -- isto, filtrar por VERMELHO traria processos encerrados, que não
          -- têm semáforo nenhum para casar.
          CASE
            WHEN concluido OR cancelado_em IS NOT NULL THEN NULL
            WHEN dias_em_aberto >= ${ALERTAS_AGING.vermelho} THEN 'VERMELHO'
            WHEN dias_em_aberto >= ${ALERTAS_AGING.amarelo}  THEN 'AMARELO'
            ELSE 'VERDE'
          END AS semaforo
        FROM cartao
      ),
      filtrado AS (
        SELECT *
        FROM classificado
        WHERE (${filtros.semaforo ?? null}::text IS NULL
               OR semaforo = ${filtros.semaforo ?? null}::text)
      ),
      numerado AS (
        SELECT
          f.*,
          -- Conta a partição INTEIRA, antes do corte por ROW_NUMBER: é o que
          -- faz o total continuar verdadeiro com limitePorFase aplicado.
          COUNT(*)     OVER (PARTITION BY f.coluna) AS total_da_coluna,
          ROW_NUMBER() OVER (
            PARTITION BY f.coluna
            -- Mais antigo primeiro: o quadro existe para mostrar o que está
            -- parado. Ordenação FIXA, não vem da query string — não há
            -- placeholder de ORDER BY em lugar nenhum desta consulta.
            ORDER BY f.dias_em_aberto DESC, f.produto_id
          ) AS posicao
        FROM filtrado f
      )
      -- O corte por coluna acontece AQUI, e não num LIMIT: LIMIT cortaria o
      -- resultado inteiro e as últimas colunas viriam vazias por acidente.
      -- Postgres não tem QUALIFY, então a janela é filtrada por fora.
      SELECT * FROM numerado
      WHERE posicao <= ${limitePorFase}
      ORDER BY coluna, posicao
    `);
  }
}

/** Semáforo de aging a partir dos dias em aberto. Ver `ALERTAS_AGING`. */
export function semaforoDoAging(diasEmAberto: number): SemaforoAging {
  if (diasEmAberto >= ALERTAS_AGING.vermelho) return 'VERMELHO';
  if (diasEmAberto >= ALERTAS_AGING.amarelo) return 'AMARELO';
  return 'VERDE';
}

/**
 * Prazo da etapa atual: `iniciadaEm + prazoSlaHoras`.
 *
 * `prazoLimiteEm` NÃO é coluna do banco de propósito — é soma pura de dois
 * campos que já existem, e persistir derivado é criar uma linha que envelhece
 * sozinha quando qualquer das duas parcelas muda.
 *
 * Devolve um dos três estados de `SituacaoSla`, nunca `null`: os dois casos sem
 * contagem são distintos e a tela precisa distingui-los. Zero seria mentira nos
 * dois — diria "prazo esgotado" para quem não tem prazo e para quem não começou.
 */
export function calcularSla(
  prazoHoras: number | null,
  iniciadaEm: Date | null,
  agora: Date = new Date(),
): SituacaoSla {
  if (prazoHoras === null) return { situacao: 'SEM_PRAZO' };

  // Tem prazo e não começou: é processo parado na fila, e o quadro existe para
  // mostrar isso. O `prazoHoras` viaja junto para a tela poder dizer QUAL
  // prazo está esperando para começar a correr.
  if (iniciadaEm === null) return { situacao: 'NAO_INICIADA', prazoHoras };

  const UMA_HORA = 3_600_000;
  const limiteEm = new Date(iniciadaEm.getTime() + prazoHoras * UMA_HORA);
  const horasRestantes = (limiteEm.getTime() - agora.getTime()) / UMA_HORA;

  return {
    situacao: 'EM_CONTAGEM',
    prazoHoras,
    limiteEm,
    // Uma casa: o quadro mostra "faltam 3,5h", não microssegundos.
    horasRestantes: Math.round(horasRestantes * 10) / 10,
    estourado: horasRestantes < 0,
  };
}
