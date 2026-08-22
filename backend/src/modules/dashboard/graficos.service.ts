import { Injectable } from '@nestjs/common';
import {
  CriticidadeNaoConformidade,
  Role,
  StatusCertificacao,
  StatusCertificado,
  StatusNaoConformidade,
  StatusRegistro,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import {
  diasAteVencer,
  FAIXAS_VENCIMENTO,
  faixaDeVencimento,
  hojeAMeiaNoite,
} from '../certificados/vencimento.constantes';

/**
 * Agregados que alimentam os gráficos das telas de Acompanhamento, Certificados
 * e Não conformidades.
 *
 * Endpoint único, e não um `resumo` por módulo, por dois motivos: os três
 * blocos são pequenos e a resposta inteira cabe num payload, e assim o
 * TanStack Query guarda uma chave só — trocar de tela não refaz a conta.
 *
 * **Por que não calcular no frontend a partir da listagem:** as listas são
 * paginadas (20 por página). Um gráfico montado sobre a página visível diria
 * "3 reprovadas" quando existem 40, e ninguém perceberia o erro — ele parece
 * um gráfico correto. Agregação é do servidor, que enxerga o conjunto todo.
 *
 * O escopo do CLIENTE é aplicado em cada consulta, como no resto do sistema:
 * cliente só soma o que é dele.
 */

const RANKING_MAXIMO = 8;
const ETAPAS_MAXIMO = 6;


export interface DadosGraficos {
  acompanhamento: {
    etapasPorStatus: Array<{ status: StatusCertificacao; total: number }>;
    ranking: Array<{
      produtoId: number;
      produto: string;
      cliente: string;
      aprovadas: number;
      total: number;
      progresso: number;
    }>;
    totalProdutos: number;
    foraDoRanking: number;
  };
  certificados: {
    porStatus: Array<{ status: StatusCertificado; total: number }>;
    vencimentos: Array<{ chave: string; rotulo: string; total: number }>;
    totalVigentes: number;
  };
  naoConformidades: {
    porStatus: Array<{
      status: StatusNaoConformidade;
      menor: number;
      maior: number;
      total: number;
    }>;
    porEtapa: Array<{ etapa: string; total: number }>;
    total: number;
  };
}

@Injectable()
export class GraficosService {
  constructor(private readonly prisma: PrismaService) {}

  async dados(usuario: UsuarioAutenticado): Promise<DadosGraficos> {
    const ehCliente = usuario.role === Role.CLIENTE;
    const escopoProduto = ehCliente ? { clienteId: usuario.id } : {};

    const [produtos, certificados, naoConformidades] = await Promise.all([
      this.prisma.produto.findMany({
        where: { status: StatusRegistro.ATIVO, ...escopoProduto },
        select: {
          id: true,
          nome: true,
          cliente: { select: { nome: true } },
          certificacao: { select: { status: true } },
        },
      }),

      this.prisma.certificado.findMany({
        where: ehCliente
          ? { produto: { clienteId: usuario.id } }
          : {},
        select: { status: true, dataValidade: true },
      }),

      this.prisma.naoConformidade.findMany({
        where: ehCliente
          ? { certificacao: { produto: { clienteId: usuario.id } } }
          : {},
        select: {
          status: true,
          criticidade: true,
          certificacao: { select: { etapa: { select: { nome: true } } } },
        },
      }),
    ]);

    return {
      acompanhamento: this.montarAcompanhamento(produtos),
      certificados: this.montarCertificados(certificados),
      naoConformidades: this.montarNaoConformidades(naoConformidades),
    };
  }

  // ------------------------------------------------------------ acompanhamento

  private montarAcompanhamento(
    produtos: Array<{
      id: number;
      nome: string;
      cliente: { nome: string };
      certificacao: Array<{ status: StatusCertificacao }>;
    }>,
  ): DadosGraficos['acompanhamento'] {
    const contagem: Record<StatusCertificacao, number> = {
      PENDENTE: 0,
      EM_ANDAMENTO: 0,
      APROVADO: 0,
      REPROVADO: 0,
    };

    const linhas = produtos.map((produto) => {
      let aprovadas = 0;
      for (const etapa of produto.certificacao) {
        contagem[etapa.status] += 1;
        if (etapa.status === StatusCertificacao.APROVADO) aprovadas += 1;
      }

      const total = produto.certificacao.length;
      return {
        produtoId: produto.id,
        produto: produto.nome,
        cliente: produto.cliente.nome,
        aprovadas,
        total,
        // Produto sem trilha aberta não é 100%: é 0 de 0, e arredondar para
        // cima o colocaria no topo do ranking sem ter feito nada.
        progresso: total === 0 ? 0 : Math.round((aprovadas / total) * 100),
      };
    });

    /*
     * Ordem: mais avançado primeiro; empate desempata por quantidade absoluta
     * de etapas aprovadas, senão um produto de trilha curta com 2/2 apareceria
     * na frente de um de 9/10.
     */
    linhas.sort((a, b) => b.progresso - a.progresso || b.aprovadas - a.aprovadas);

    return {
      etapasPorStatus: (
        Object.keys(contagem) as StatusCertificacao[]
      ).map((status) => ({ status, total: contagem[status] })),
      ranking: linhas.slice(0, RANKING_MAXIMO),
      totalProdutos: produtos.length,
      foraDoRanking: Math.max(0, produtos.length - RANKING_MAXIMO),
    };
  }

  // -------------------------------------------------------------- certificados

  private montarCertificados(
    certificados: Array<{ status: StatusCertificado; dataValidade: Date }>,
  ): DadosGraficos['certificados'] {
    const porStatus: Record<StatusCertificado, number> = {
      EMITIDO: 0,
      SUSPENSO: 0,
      VENCIDO: 0,
      CANCELADO: 0,
    };
    const vencimentos: Record<string, number> = {};
    for (const faixa of FAIXAS_VENCIMENTO) vencimentos[faixa.chave] = 0;

    const hoje = hojeAMeiaNoite();

    let totalVigentes = 0;

    for (const certificado of certificados) {
      porStatus[certificado.status] += 1;

      /*
       * Só vigente entra na projeção de vencimento. Cancelado é terminal e
       * vencido já venceu — incluí-los infla a barra "Vencido" com casos que
       * ninguém precisa renovar.
       */
      if (
        certificado.status !== StatusCertificado.EMITIDO &&
        certificado.status !== StatusCertificado.SUSPENSO
      ) {
        continue;
      }

      totalVigentes += 1;

      const dias = diasAteVencer(certificado.dataValidade, hoje);
      vencimentos[faixaDeVencimento(dias)] += 1;
    }

    return {
      porStatus: (Object.keys(porStatus) as StatusCertificado[]).map(
        (status) => ({ status, total: porStatus[status] }),
      ),
      vencimentos: FAIXAS_VENCIMENTO.map((f) => ({
        chave: f.chave,
        rotulo: f.rotulo,
        total: vencimentos[f.chave],
      })),
      totalVigentes,
    };
  }

  // --------------------------------------------------------- não conformidades

  private montarNaoConformidades(
    naoConformidades: Array<{
      status: StatusNaoConformidade;
      criticidade: CriticidadeNaoConformidade;
      certificacao: { etapa: { nome: string } };
    }>,
  ): DadosGraficos['naoConformidades'] {
    const porStatus: Record<
      StatusNaoConformidade,
      { menor: number; maior: number }
    > = {
      ABERTA: { menor: 0, maior: 0 },
      EM_TRATATIVA: { menor: 0, maior: 0 },
      RESOLVIDA: { menor: 0, maior: 0 },
      REPROVADA: { menor: 0, maior: 0 },
    };

    const porEtapa = new Map<string, number>();

    for (const nc of naoConformidades) {
      const balde = porStatus[nc.status];
      if (nc.criticidade === CriticidadeNaoConformidade.MAIOR) balde.maior += 1;
      else balde.menor += 1;

      const etapa = nc.certificacao.etapa.nome;
      porEtapa.set(etapa, (porEtapa.get(etapa) ?? 0) + 1);
    }

    return {
      porStatus: (Object.keys(porStatus) as StatusNaoConformidade[]).map(
        (status) => ({
          status,
          menor: porStatus[status].menor,
          maior: porStatus[status].maior,
          total: porStatus[status].menor + porStatus[status].maior,
        }),
      ),
      porEtapa: [...porEtapa.entries()]
        .map(([etapa, total]) => ({ etapa, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, ETAPAS_MAXIMO),
      total: naoConformidades.length,
    };
  }
}
