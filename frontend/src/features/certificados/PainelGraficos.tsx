import {
  BarraComposicao,
  ColunasAgrupadas,
  GradeGraficos,
  Grafico,
  type FatiaGrafico,
  type GrupoColunas,
} from '@/components/Graficos';
import type { StatusCertificado } from '@/types';
import { useGraficos } from '../graficos/useGraficos';

const COR_STATUS: Record<StatusCertificado, string> = {
  EMITIDO: 'var(--graf-aprovado)',
  SUSPENSO: 'var(--graf-alerta)',
  VENCIDO: 'var(--graf-reprovado)',
  CANCELADO: 'var(--graf-neutro)',
};

const ROTULO_STATUS: Record<StatusCertificado, string> = {
  EMITIDO: 'Emitido',
  SUSPENSO: 'Suspenso',
  VENCIDO: 'Vencido',
  CANCELADO: 'Cancelado',
};

/**
 * Urgência por faixa de vencimento.
 *
 * A cor segue a faixa, não a posição dela no gráfico: "até 30 dias" é âmbar
 * porque exige ação neste mês, e continuaria âmbar se a barra estivesse vazia.
 * Faixas distantes ficam neutras de propósito — pintar tudo daria seis
 * intensidades competindo pela atenção, quando só as duas primeiras exigem algo.
 */
const COR_FAIXA: Record<string, string> = {
  vencido: 'var(--graf-reprovado)',
  '30': 'var(--graf-alerta)',
  '60': 'var(--graf-andamento)',
  '90': 'var(--graf-andamento)',
  '180': 'var(--graf-neutro)',
  depois: 'var(--graf-neutro)',
};

/**
 * Gráficos abaixo da lista de certificados.
 *
 * O primeiro é o que um organismo certificador olha toda semana: **o que vence
 * quando**. É a informação que a lista tem mas não mostra — ela ordena por
 * emissão, e a validade fica em cada cartão, exigindo ler um por um para saber
 * se há renovação atrasada. Aqui a resposta é a primeira coluna.
 *
 * Só certificado **vigente** entra na projeção: cancelado é terminal e vencido
 * já venceu. Incluí-los encheria a coluna "Vencido" de casos que ninguém vai
 * renovar, e a barra que deveria disparar ação viraria ruído histórico.
 */
export function PainelGraficosCertificados() {
  const { data, isLoading, isError } = useGraficos();

  if (isLoading) {
    return (
      <GradeGraficos>
        <div className="esqueleto vidro" style={{ height: 260 }} aria-hidden />
        <div className="esqueleto vidro" style={{ height: 260 }} aria-hidden />
      </GradeGraficos>
    );
  }

  if (isError || !data) return null;

  const { porStatus, vencimentos, totalVigentes } = data.certificados;

  const grupos: GrupoColunas[] = vencimentos.map((faixa) => ({
    rotulo: faixa.rotulo,
    fatias: [
      {
        rotulo: 'Certificados',
        valor: faixa.total,
        cor: COR_FAIXA[faixa.chave] ?? 'var(--graf-neutro)',
        textura: faixa.chave === 'vencido',
      },
    ],
  }));

  const fatiasStatus: FatiaGrafico[] = porStatus.map((linha) => ({
    rotulo: ROTULO_STATUS[linha.status],
    valor: linha.total,
    cor: COR_STATUS[linha.status],
    textura: linha.status === 'VENCIDO',
  }));

  const total = porStatus.reduce((soma, l) => soma + l.total, 0);
  const vencendoEmBreve =
    (vencimentos.find((f) => f.chave === 'vencido')?.total ?? 0) +
    (vencimentos.find((f) => f.chave === '30')?.total ?? 0);

  return (
    <GradeGraficos>
      <Grafico
        titulo="Vencimentos à frente"
        descricao="Quantos certificados vigentes vencem em cada janela."
        destaque={totalVigentes}
        rodape={
          vencendoEmBreve > 0
            ? `${vencendoEmBreve} exigem ação até 30 dias. Considera apenas emitidos e suspensos — cancelado e vencido ficam de fora.`
            : 'Considera apenas emitidos e suspensos — cancelado e vencido ficam de fora.'
        }
        vazio={totalVigentes === 0}
        mensagemVazio="Nenhum certificado vigente no momento."
      >
        <ColunasAgrupadas
          titulo="Vencimentos à frente"
          grupos={grupos}
          colunaIdentidade="Janela"
        />
      </Grafico>

      <Grafico
        titulo="Situação da carteira"
        descricao="Todos os certificados já emitidos, por situação atual."
        destaque={total}
        rodape="Vencido aparece riscado além de vermelho — a distinção não depende de enxergar a cor."
        vazio={total === 0}
        mensagemVazio="Nenhum certificado emitido ainda."
      >
        <BarraComposicao titulo="Situação da carteira" fatias={fatiasStatus} />
      </Grafico>
    </GradeGraficos>
  );
}
