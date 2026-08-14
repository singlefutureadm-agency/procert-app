import { Injectable } from '@nestjs/common';
import { Role, StatusCertificacao, StatusRegistro } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';

export interface MetricasDashboard {
  totalClientes: number;
  totalProdutos: number;
  certificacoesConcluidas: number;
  certificacoesEmAndamento: number;
  certificacoesPendentes: number;
  percentualPendentes: number;
  ultimasAtualizacoes: Array<{
    produtoId: number;
    produto: string;
    cliente: string;
    etapa: string;
    status: StatusCertificacao;
    atualizadoEm: Date;
  }>;
}

/**
 * Métricas dos cards do painel.
 *
 * Correções em relação ao legado:
 *  • "Certificações aprovadas" sempre exibia 0 (a query devolvia a chave
 *    `total_aprovados` e o controller lia `total_certificacao_aprovada`)
 *  • a etapa final era fixada como `id_etapa = 4`, quebrando ao mudar o catálogo;
 *    aqui um produto é considerado concluído quando TODAS as suas etapas
 *    estão aprovadas
 *  • as consultas rodavam em toda requisição, inclusive na home pública
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async metricas(usuario: UsuarioAutenticado): Promise<MetricasDashboard> {
    const escopoCliente =
      usuario.role === Role.CLIENTE ? { clienteId: usuario.id } : {};

    const [totalClientes, totalProdutos, produtos, ultimas] = await Promise.all([
      usuario.role === Role.CLIENTE
        ? Promise.resolve(1)
        : this.prisma.cliente.count({ where: { status: StatusRegistro.ATIVO } }),

      this.prisma.produto.count({
        where: { status: StatusRegistro.ATIVO, ...escopoCliente },
      }),

      this.prisma.produto.findMany({
        where: { status: StatusRegistro.ATIVO, ...escopoCliente },
        select: { id: true, certificacao: { select: { status: true } } },
      }),

      this.prisma.certificacaoProduto.findMany({
        where: { produto: { status: StatusRegistro.ATIVO, ...escopoCliente } },
        orderBy: { atualizadoEm: 'desc' },
        take: 8,
        select: {
          status: true,
          atualizadoEm: true,
          etapa: { select: { nome: true } },
          produto: {
            select: { id: true, nome: true, cliente: { select: { nome: true } } },
          },
        },
      }),
    ]);

    let concluidas = 0;
    let emAndamento = 0;
    let pendentes = 0;

    for (const produto of produtos) {
      const etapas = produto.certificacao;
      if (etapas.length === 0) {
        pendentes += 1;
        continue;
      }

      const todasAprovadas = etapas.every(
        (e) => e.status === StatusCertificacao.APROVADO,
      );
      const iniciada = etapas.some(
        (e) => e.status !== StatusCertificacao.PENDENTE,
      );

      if (todasAprovadas) concluidas += 1;
      else if (iniciada) emAndamento += 1;
      else pendentes += 1;
    }

    return {
      totalClientes,
      totalProdutos,
      certificacoesConcluidas: concluidas,
      certificacoesEmAndamento: emAndamento,
      certificacoesPendentes: pendentes,
      percentualPendentes: totalProdutos
        ? Math.round((pendentes / totalProdutos) * 100)
        : 0,
      ultimasAtualizacoes: ultimas.map((registro) => ({
        produtoId: registro.produto.id,
        produto: registro.produto.nome,
        cliente: registro.produto.cliente.nome,
        etapa: registro.etapa.nome,
        status: registro.status,
        atualizadoEm: registro.atualizadoEm,
      })),
    };
  }
}
