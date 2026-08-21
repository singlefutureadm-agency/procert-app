import {
  BarraComposicao,
  BarrasHorizontais,
  GradeGraficos,
  Grafico,
  type FatiaGrafico,
} from '@/components/Graficos';
import { rotuloStatusCertificacao } from '@/lib/formatadores';
import type { StatusCertificacao } from '@/types';
import { useGraficos } from '../graficos/useGraficos';

const COR_STATUS: Record<StatusCertificacao, string> = {
  PENDENTE: 'var(--graf-neutro)',
  EM_ANDAMENTO: 'var(--graf-andamento)',
  APROVADO: 'var(--graf-aprovado)',
  REPROVADO: 'var(--graf-reprovado)',
};

/**
 * Gráficos abaixo da tabela de acompanhamento.
 *
 * Duas perguntas diferentes, duas formas diferentes:
 *
 *  • **"quem está na frente?"** — barras ranqueadas. Comparar comprimento a
 *    partir de uma origem comum é a leitura mais precisa que existe, e é o que
 *    a tabela não entrega: nela o progresso aparece linha a linha, e ordenar
 *    mentalmente oito produtos por uma barrinha em cada linha não acontece.
 *  • **"a carteira está travada onde?"** — barra de composição. A pergunta é
 *    sobre parte/todo, não sobre ranking.
 *
 * A escala do ranking é fixada em 100 (`maximo`), e não no maior valor. Sem
 * isso o produto mais adiantado sempre encostaria na ponta direita, e um
 * ranking em que o líder está com 30% pareceria idêntico a um em que está com
 * 95% — a barra diria "primeiro lugar" quando a informação útil é "longe do fim".
 */
export function PainelGraficosCertificacoes() {
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

  const { ranking, etapasPorStatus, totalProdutos, foraDoRanking } =
    data.acompanhamento;

  const fatiasStatus: FatiaGrafico[] = etapasPorStatus.map((linha) => ({
    rotulo: rotuloStatusCertificacao[linha.status],
    valor: linha.total,
    cor: COR_STATUS[linha.status],
    textura: linha.status === 'REPROVADO',
  }));

  const totalEtapas = etapasPorStatus.reduce((soma, l) => soma + l.total, 0);

  const fatiasRanking: FatiaGrafico[] = ranking.map((linha) => ({
    rotulo: linha.produto,
    detalhe: `${linha.cliente} · ${linha.aprovadas} de ${linha.total} etapas`,
    valor: linha.progresso,
    cor:
      linha.progresso === 100
        ? 'var(--graf-aprovado)'
        : 'var(--graf-andamento)',
  }));

  return (
    <GradeGraficos>
      <Grafico
        titulo="Progresso por produto"
        descricao="Percentual de etapas aprovadas, do mais adiantado ao mais atrasado."
        destaque={totalProdutos}
        rodape={
          foraDoRanking > 0
            ? `Mostrando os 8 primeiros de ${totalProdutos} produtos ativos. A tabela acima é filtrável; o gráfico é sempre a carteira inteira.`
            : 'Considera todos os produtos ativos, independentemente do filtro da tabela.'
        }
        vazio={ranking.length === 0}
        mensagemVazio="Nenhum produto ativo em certificação."
      >
        <BarrasHorizontais
          titulo="Progresso por produto"
          fatias={fatiasRanking}
          colunaIdentidade="Produto"
          colunaValor="Progresso"
          sufixo="%"
          maximo={100}
        />
      </Grafico>

      <Grafico
        titulo="Situação das etapas"
        descricao="Onde está cada etapa de todos os produtos, somadas."
        destaque={totalEtapas}
        rodape="Reprovado aparece riscado além de vermelho — a distinção não depende de enxergar a cor."
        vazio={totalEtapas === 0}
        mensagemVazio="Nenhuma etapa aberta."
      >
        <BarraComposicao titulo="Situação das etapas" fatias={fatiasStatus} />
      </Grafico>
    </GradeGraficos>
  );
}
