import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role, StatusRegistro } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { paginar, RespostaPaginada } from '../../common/dto/paginacao.dto';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import {
  LIMITE_LINHAS_EXPORTACAO,
  ListarComparativoClientesDto,
  ListarComparativoProdutosDto,
  OrdemComparativoCliente,
  OrdemComparativoProduto,
} from './dto/relatorios.dto';

/**
 * Comparativos de produtos e de clientes.
 *
 * ## Escopo do CLIENTE
 *
 * O controller restringe estas rotas a ADMIN e FUNCIONARIO, então hoje nenhum
 * CLIENTE as alcança. O filtro por `clienteId` abaixo mesmo assim segue o
 * padrão dos demais services — **defesa em profundidade, pelo mesmo motivo do
 * middleware de `/uploads`**: é redundante enquanto o `@Roles` estiver como
 * está, e existe para que relaxá-lo um dia não vire vazamento silencioso de um
 * cliente vendo o comparativo de outro. Foi exatamente esse o IDOR que a
 * migração do legado corrigiu.
 *
 * ## Por que não reaproveitar o gráfico do dashboard
 *
 * `GraficosService.montarAcompanhamento` faz `findMany` de todos os produtos e
 * agrega em JS, limitado ao top 8 — dimensionado para um card. Aqui a listagem
 * é paginada e ordenável sobre a base inteira, então a conta é do Postgres. O
 * gráfico do dashboard **fica como está**; são consumidores diferentes.
 */

const ORDENACAO_PRODUTO: Record<OrdemComparativoProduto, Prisma.Sql> = {
  progresso: Prisma.sql`progresso DESC, p.nome ASC`,
  progresso_asc: Prisma.sql`progresso ASC, p.nome ASC`,
  paradas: Prisma.sql`dias_parado DESC NULLS LAST, p.nome ASC`,
  nome: Prisma.sql`p.nome ASC`,
};

const ORDENACAO_CLIENTE: Record<OrdemComparativoCliente, Prisma.Sql> = {
  produtos: Prisma.sql`produtos DESC, c.nome ASC`,
  produtos_asc: Prisma.sql`produtos ASC, c.nome ASC`,
  certificados: Prisma.sql`certificados_vigentes DESC, c.nome ASC`,
  nome: Prisma.sql`c.nome ASC`,
};

interface LinhaProdutoBruta {
  id: number;
  nome: string;
  cliente: string;
  cliente_id: number;
  categoria: string;
  trilha_versao: number;
  total_etapas: bigint;
  aprovadas: bigint;
  reprovadas: bigint;
  pendentes: bigint;
  obrigatorias_pendentes: bigint;
  ncs_abertas: bigint;
  progresso: number;
  ultima_movimentacao: Date | null;
  dias_parado: number | null;
  criado_em: Date;
}

export interface LinhaProduto {
  id: number;
  nome: string;
  clienteId: number;
  cliente: string;
  categoria: string;
  trilhaVersao: number;
  totalEtapas: number;
  aprovadas: number;
  reprovadas: number;
  pendentes: number;
  /** Quantas etapas OBRIGATÓRIAS ainda faltam — é o que trava o certificado. */
  obrigatoriasPendentes: number;
  ncsAbertas: number;
  /** 0 a 100, sobre o total de etapas da trilha do produto. */
  progresso: number;
  ultimaMovimentacao: Date | null;
  /** Dias desde a última movimentação. `null` quando nunca houve nenhuma. */
  diasParado: number | null;
  criadoEm: Date;
}

interface LinhaClienteBruta {
  id: number;
  nome: string;
  email: string;
  responsavel: string | null;
  ultimo_acesso_em: Date | null;
  produtos: bigint;
  produtos_concluidos: bigint;
  certificados_vigentes: bigint;
  ncs_abertas: bigint;
  ultima_movimentacao: Date | null;
}

export interface LinhaCliente {
  id: number;
  nome: string;
  email: string;
  responsavel: string | null;
  ultimoAcessoEm: Date | null;
  produtos: number;
  /** Produtos com TODAS as etapas obrigatórias aprovadas. */
  produtosConcluidos: number;
  certificadosVigentes: number;
  ncsAbertas: number;
  ultimaMovimentacao: Date | null;
}

@Injectable()
export class ComparativosService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- produtos

  async produtos(
    filtros: ListarComparativoProdutosDto,
    usuario: UsuarioAutenticado,
  ): Promise<RespostaPaginada<LinhaProduto>> {
    const where = this.wherePodutos(filtros, usuario);

    const [linhas, total] = await Promise.all([
      this.consultarProdutos(where, filtros.ordem, filtros.limite, filtros.skip),
      this.contarProdutos(where),
    ]);

    return paginar(linhas, total, filtros);
  }

  async produtosParaExportacao(
    filtros: ListarComparativoProdutosDto,
    usuario: UsuarioAutenticado,
  ): Promise<LinhaProduto[]> {
    const where = this.wherePodutos(filtros, usuario);
    const linhas = await this.consultarProdutos(
      where,
      filtros.ordem,
      LIMITE_LINHAS_EXPORTACAO + 1,
      0,
    );

    this.garantirTeto(linhas.length);
    return linhas;
  }

  /**
   * Filtros do comparativo de produtos.
   *
   * O `clienteId` vem do TOKEN quando o papel é CLIENTE; o da query é ignorado.
   * É o mesmo padrão de `produtos`, `certificacoes` e `certificados`.
   */
  private wherePodutos(
    filtros: ListarComparativoProdutosDto,
    usuario: UsuarioAutenticado,
  ): Prisma.Sql {
    const clienteId =
      usuario.role === Role.CLIENTE ? usuario.id : filtros.clienteId;

    const busca = filtros.busca ? `%${filtros.busca}%` : null;

    return Prisma.sql`
      p.status = ${StatusRegistro.ATIVO}::"StatusRegistro"
      AND (${clienteId ?? null}::int IS NULL OR p.cliente_id = ${clienteId ?? null}::int)
      AND (${filtros.categoriaId ?? null}::int IS NULL OR p.categoria_id = ${filtros.categoriaId ?? null}::int)
      AND (${busca}::text IS NULL OR p.nome ILIKE ${busca}::text OR c.nome ILIKE ${busca}::text)
    `;
  }

  private async contarProdutos(where: Prisma.Sql): Promise<number> {
    const [{ total }] = await this.prisma.$queryRaw<[{ total: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*) AS total
        FROM produtos p
        JOIN clientes c ON c.id = p.cliente_id
        WHERE ${where}
      `,
    );
    return Number(total);
  }

  private async consultarProdutos(
    where: Prisma.Sql,
    ordem: OrdemComparativoProduto,
    limite: number,
    pular: number,
  ): Promise<LinhaProduto[]> {
    const brutas = await this.prisma.$queryRaw<LinhaProdutoBruta[]>(Prisma.sql`
      SELECT
        p.id, p.nome, p.criado_em, p.cliente_id,
        c.nome AS cliente,
        cat.nome AS categoria,
        mt.versao AS trilha_versao,
        COALESCE(et.total, 0)       AS total_etapas,
        COALESCE(et.aprovadas, 0)   AS aprovadas,
        COALESCE(et.reprovadas, 0)  AS reprovadas,
        COALESCE(et.pendentes, 0)   AS pendentes,
        COALESCE(et.obrigatorias_pendentes, 0) AS obrigatorias_pendentes,
        COALESCE(nc.total, 0)       AS ncs_abertas,
        -- Calculado AQUI, e não em JS, porque o ORDER BY precisa do alias
        -- existir no SELECT. Era o bug que derrubou a primeira versão deste
        -- relatório: a ordenação apontava para uma coluna inexistente e o
        -- Postgres devolvia 42703, virando 500 na rota.
        --
        -- Nada de crase neste comentário: ele vive dentro de um template
        -- literal, e uma crase o fecharia no meio da consulta.
        CASE WHEN COALESCE(et.total, 0) = 0 THEN 0
             ELSE ROUND((et.aprovadas::numeric / et.total) * 100)::int
        END AS progresso,
        mov.ultima                  AS ultima_movimentacao,
        -- Dias desde a última movimentação. É o número que revela o processo
        -- travado, que o progresso sozinho não mostra: 60% parado há 90 dias
        -- parece melhor que 30% mexido ontem, e não é.
        CASE WHEN mov.ultima IS NULL THEN NULL
             ELSE EXTRACT(DAY FROM (now() - mov.ultima))::int
        END AS dias_parado
      FROM produtos p
      JOIN clientes c            ON c.id = p.cliente_id
      JOIN categorias_produto cat ON cat.id = p.categoria_id
      JOIN modelos_trilha mt      ON mt.id = p.modelo_trilha_id

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE cp.status = 'APROVADO')  AS aprovadas,
          COUNT(*) FILTER (WHERE cp.status = 'REPROVADO') AS reprovadas,
          COUNT(*) FILTER (WHERE cp.status = 'PENDENTE')  AS pendentes,
          -- Só a obrigatória trava a emissão do certificado; opcional pendente
          -- não bloqueia (ver CertificadosService).
          COUNT(*) FILTER (
            WHERE me.obrigatoria AND cp.status <> 'APROVADO'
          ) AS obrigatorias_pendentes
        FROM certificacoes_produto cp
        JOIN modelos_etapa me ON me.id = cp.etapa_id
        WHERE cp.produto_id = p.id
      ) et ON TRUE

      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM nao_conformidades n
        JOIN certificacoes_produto cp2 ON cp2.id = n.certificacao_id
        WHERE cp2.produto_id = p.id
          AND n.status IN ('ABERTA', 'EM_TRATATIVA')
      ) nc ON TRUE

      LEFT JOIN LATERAL (
        SELECT MAX(h.alterado_em) AS ultima
        FROM certificacoes_historico h
        JOIN certificacoes_produto cp3 ON cp3.id = h.certificacao_id
        WHERE cp3.produto_id = p.id
      ) mov ON TRUE

      WHERE ${where}
      ORDER BY ${ORDENACAO_PRODUTO[ordem]}
      LIMIT ${limite} OFFSET ${pular}
    `);

    return brutas.map((b) => ({
      id: b.id,
      nome: b.nome,
      clienteId: b.cliente_id,
      cliente: b.cliente,
      categoria: b.categoria,
      trilhaVersao: b.trilha_versao,
      totalEtapas: Number(b.total_etapas),
      aprovadas: Number(b.aprovadas),
      reprovadas: Number(b.reprovadas),
      pendentes: Number(b.pendentes),
      obrigatoriasPendentes: Number(b.obrigatorias_pendentes),
      ncsAbertas: Number(b.ncs_abertas),
      // Vem pronto do banco; o CASE lá cobre o produto sem etapa nenhuma, que
      // daria divisão por zero.
      progresso: Number(b.progresso),
      ultimaMovimentacao: b.ultima_movimentacao,
      diasParado: b.dias_parado,
      criadoEm: b.criado_em,
    }));
  }

  // ------------------------------------------------------------- clientes

  async clientes(
    filtros: ListarComparativoClientesDto,
    usuario: UsuarioAutenticado,
  ): Promise<RespostaPaginada<LinhaCliente>> {
    const where = this.whereClientes(filtros, usuario);

    const [linhas, total] = await Promise.all([
      this.consultarClientes(where, filtros.ordem, filtros.limite, filtros.skip),
      this.contarClientes(where),
    ]);

    return paginar(linhas, total, filtros);
  }

  async clientesParaExportacao(
    filtros: ListarComparativoClientesDto,
    usuario: UsuarioAutenticado,
  ): Promise<LinhaCliente[]> {
    const where = this.whereClientes(filtros, usuario);
    const linhas = await this.consultarClientes(
      where,
      filtros.ordem,
      LIMITE_LINHAS_EXPORTACAO + 1,
      0,
    );

    this.garantirTeto(linhas.length);
    return linhas;
  }

  private whereClientes(
    filtros: ListarComparativoClientesDto,
    usuario: UsuarioAutenticado,
  ): Prisma.Sql {
    // Mesma defesa em profundidade do comparativo de produtos.
    const proprio = usuario.role === Role.CLIENTE ? usuario.id : null;
    const busca = filtros.busca ? `%${filtros.busca}%` : null;

    return Prisma.sql`
      c.status = ${StatusRegistro.ATIVO}::"StatusRegistro"
      AND (${proprio}::int IS NULL OR c.id = ${proprio}::int)
      AND (${filtros.responsavelId ?? null}::int IS NULL
           OR c.responsavel_id = ${filtros.responsavelId ?? null}::int)
      AND (${busca}::text IS NULL OR c.nome ILIKE ${busca}::text OR c.email ILIKE ${busca}::text)
    `;
  }

  private async contarClientes(where: Prisma.Sql): Promise<number> {
    const [{ total }] = await this.prisma.$queryRaw<[{ total: bigint }]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM clientes c WHERE ${where}`,
    );
    return Number(total);
  }

  private async consultarClientes(
    where: Prisma.Sql,
    ordem: OrdemComparativoCliente,
    limite: number,
    pular: number,
  ): Promise<LinhaCliente[]> {
    const brutas = await this.prisma.$queryRaw<LinhaClienteBruta[]>(Prisma.sql`
      SELECT
        c.id, c.nome, c.email, c.ultimo_acesso_em,
        f.nome AS responsavel,
        COALESCE(pr.total, 0)        AS produtos,
        COALESCE(pr.concluidos, 0)   AS produtos_concluidos,
        COALESCE(ct.total, 0)        AS certificados_vigentes,
        COALESCE(nc.total, 0)        AS ncs_abertas,
        mov.ultima                   AS ultima_movimentacao
      FROM clientes c
      LEFT JOIN funcionarios f ON f.id = c.responsavel_id

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total,
          -- Concluído = nenhuma etapa OBRIGATÓRIA fora de APROVADO. É a mesma
          -- regra que libera a emissão do certificado; contar "todas as etapas"
          -- deixaria de fora produto pronto com opcional pendente.
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM certificacoes_produto cp
              JOIN modelos_etapa me ON me.id = cp.etapa_id
              WHERE cp.produto_id = p.id
                AND me.obrigatoria
                AND cp.status <> 'APROVADO'
            )
          ) AS concluidos
        FROM produtos p
        WHERE p.cliente_id = c.id
          AND p.status = 'ATIVO'
      ) pr ON TRUE

      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM certificados cert
        JOIN produtos p2 ON p2.id = cert.produto_id
        WHERE p2.cliente_id = c.id
          -- Vigente = EMITIDO ou SUSPENSO. CANCELADO é terminal e VENCIDO já
          -- passou; incluí-los infla a contagem (ver vencimento.constantes.ts).
          AND cert.status IN ('EMITIDO', 'SUSPENSO')
      ) ct ON TRUE

      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM nao_conformidades n
        JOIN certificacoes_produto cp2 ON cp2.id = n.certificacao_id
        JOIN produtos p3 ON p3.id = cp2.produto_id
        WHERE p3.cliente_id = c.id
          AND n.status IN ('ABERTA', 'EM_TRATATIVA')
      ) nc ON TRUE

      LEFT JOIN LATERAL (
        SELECT MAX(h.alterado_em) AS ultima
        FROM certificacoes_historico h
        JOIN certificacoes_produto cp3 ON cp3.id = h.certificacao_id
        JOIN produtos p4 ON p4.id = cp3.produto_id
        WHERE p4.cliente_id = c.id
      ) mov ON TRUE

      WHERE ${where}
      ORDER BY ${ORDENACAO_CLIENTE[ordem]}
      LIMIT ${limite} OFFSET ${pular}
    `);

    return brutas.map((b) => ({
      id: b.id,
      nome: b.nome,
      email: b.email,
      responsavel: b.responsavel,
      ultimoAcessoEm: b.ultimo_acesso_em,
      produtos: Number(b.produtos),
      produtosConcluidos: Number(b.produtos_concluidos),
      certificadosVigentes: Number(b.certificados_vigentes),
      ncsAbertas: Number(b.ncs_abertas),
      ultimaMovimentacao: b.ultima_movimentacao,
    }));
  }

  // ------------------------------------------------------------- internos

  private garantirTeto(quantidade: number): void {
    if (quantidade > LIMITE_LINHAS_EXPORTACAO) {
      throw new BadRequestException(
        `A exportação passa de ${LIMITE_LINHAS_EXPORTACAO} linhas. ` +
          'Estreite os filtros para gerar o arquivo.',
      );
    }
  }
}
