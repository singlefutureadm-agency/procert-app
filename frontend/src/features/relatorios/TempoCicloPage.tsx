import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Campo } from '@/components/Campo';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Grafico, BarrasHorizontais, GradeGraficos } from '@/components/Graficos';
import { Icone } from '@/components/Icone';
import { TabelaRolavel } from '@/components/TabelaRolavel';
import { mensagemDeErro } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import {
  cicloApi,
  type AgrupamentoCiclo,
  type FiltrosTempoCiclo,
  type GrupoCiclo,
} from './api';

/**
 * Tempo de ciclo.
 *
 * **Três relógios distintos, cada um com nome próprio.** Não existe "tempo da
 * etapa" nesta tela: o rótulo tem de responder sozinho "qual relógio está
 * sendo medido?", porque é isso que alguém vai perguntar meses depois olhando
 * um número de 14 dias.
 *
 * Os três **não são comparáveis entre si** e por isso nunca aparecem na mesma
 * série de gráfico — cada um tem o seu bloco, com a base ao lado. Mediana sem
 * base não diz se veio de 40 etapas ou de uma.
 */

const AGRUPAMENTOS: Array<{ valor: AgrupamentoCiclo; rotulo: string }> = [
  { valor: 'trilha', rotulo: 'Por trilha (categoria + versão)' },
  { valor: 'etapa', rotulo: 'Por etapa' },
];

/** Formata dias preservando o nulo: base vazia não é zero dia. */
function dias(valor: number | null): string {
  return valor === null ? '—' : `${String(valor).replace('.', ',')} d`;
}

function base(quantidade: number, unidade: string): string {
  return `${quantidade} ${unidade}${quantidade === 1 ? '' : 's'}`;
}

/** Fatias de um bloco, descartando grupo sem base — barra de zero mentiria. */
function fatias(
  grupos: GrupoCiclo[],
  valorDe: (g: GrupoCiclo) => number | null,
  cor: string,
) {
  return grupos
    .filter((g) => valorDe(g) !== null)
    .map((g) => ({ rotulo: g.chave, valor: valorDe(g) as number, cor }));
}

export function TempoCicloPage() {
  const [filtros, setFiltros] = useState<FiltrosTempoCiclo>({
    agrupamento: 'trilha',
  });

  const { data, isLoading } = useQuery({
    queryKey: chaves.tempoCiclo(filtros),
    queryFn: () => cicloApi.relatorio(filtros),
  });

  const [exportando, setExportando] = useState<'xlsx' | 'csv' | null>(null);

  async function exportar(formato: 'xlsx' | 'csv') {
    setExportando(formato);
    try {
      await cicloApi.exportar(filtros, formato);
    } catch (erro) {
      toast.error(mensagemDeErro(erro, 'Não foi possível gerar a planilha.'));
    } finally {
      setExportando(null);
    }
  }

  const grupos = data?.grupos ?? [];
  const porTrilha = data?.agrupamento === 'trilha';

  return (
    <>
      <CabecalhoPagina
        titulo="Tempo de ciclo"
        descricao="Quanto tempo o processo leva — e onde ele espera."
        acoes={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => void exportar('xlsx')}
              disabled={exportando !== null}
            >
              <Icone nome="download" tamanho={16} />
              {exportando === 'xlsx' ? 'Gerando...' : 'Excel'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void exportar('csv')}
              disabled={exportando !== null}
            >
              <Icone nome="download" tamanho={16} />
              {exportando === 'csv' ? 'Gerando...' : 'CSV'}
            </button>
          </>
        }
      />

      <div className="entre">
        <Campo label="Agrupar por">
          <select
            value={filtros.agrupamento}
            onChange={(e) =>
              setFiltros((a) => ({
                ...a,
                agrupamento: e.target.value as AgrupamentoCiclo,
              }))
            }
          >
            {AGRUPAMENTOS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Submetidos a partir de">
          <input
            type="date"
            value={filtros.de ?? ''}
            max={filtros.ate}
            onChange={(e) => setFiltros((a) => ({ ...a, de: e.target.value }))}
          />
        </Campo>

        <Campo label="Submetidos até">
          <input
            type="date"
            value={filtros.ate ?? ''}
            min={filtros.de}
            onChange={(e) => setFiltros((a) => ({ ...a, ate: e.target.value }))}
          />
        </Campo>
      </div>

      {isLoading ? (
        <Carregando />
      ) : grupos.length === 0 ? (
        <section className="vidro">
          <EstadoVazio
            icone="relogio"
            titulo="Nenhum dado no recorte"
            descricao="Amplie o período ou aguarde a primeira movimentação de trilha."
          />
        </section>
      ) : (
        <>
          {/*
            Um bloco por métrica, nunca uma série só. São relógios diferentes:
            juntar lead time com tempo em fila no mesmo gráfico sugeriria uma
            comparação que não existe.
          */}
          <GradeGraficos>
            {porTrilha && (
              <Grafico
                titulo="Lead time da trilha"
                descricao="Da submissão do produto até a aprovação da última etapa obrigatória."
                rodape="Mediana, sobre os produtos com todas as etapas obrigatórias aprovadas. A emissão do certificado é ato posterior e não entra."
                vazio={fatias(grupos, (g) => g.leadTimeTrilha?.medianaDias ?? null, '').length === 0}
                mensagemVazio="Nenhum produto concluiu a trilha no recorte."
              >
                <BarrasHorizontais
                  titulo="Lead time da trilha, em dias"
                  colunaIdentidade="Trilha"
                  colunaValor="Mediana"
                  sufixo=" d"
                  fatias={fatias(
                    grupos,
                    (g) => g.leadTimeTrilha?.medianaDias ?? null,
                    'var(--cor-primaria)',
                  )}
                />
              </Grafico>
            )}

            <Grafico
              titulo="Tempo de tratamento da etapa"
              descricao="Da primeira saída de Pendente até a aprovação."
              rodape="Mediana. Etapas aprovadas direto de Pendente ficam FORA: tratamento zero por construção, contadas à parte."
              vazio={fatias(grupos, (g) => g.tempoTratamentoEtapa.medianaDias, '').length === 0}
              mensagemVazio="Nenhuma etapa com tratamento registrado no recorte."
            >
              <BarrasHorizontais
                titulo="Tempo de tratamento da etapa, em dias"
                colunaIdentidade={porTrilha ? 'Trilha' : 'Etapa'}
                colunaValor="Mediana"
                sufixo=" d"
                fatias={fatias(
                  grupos,
                  (g) => g.tempoTratamentoEtapa.medianaDias,
                  'var(--cor-sucesso)',
                )}
              />
            </Grafico>

            <Grafico
              titulo="Tempo em fila"
              descricao="Da criação da etapa até alguém encostar nela."
              rodape="Mediana. É a espera antes do trabalho começar — não se soma ao tempo de tratamento para formar um total."
              vazio={fatias(grupos, (g) => g.tempoEmFila.medianaDias, '').length === 0}
              mensagemVazio="Nenhuma etapa saiu de Pendente no recorte."
            >
              <BarrasHorizontais
                titulo="Tempo em fila, em dias"
                colunaIdentidade={porTrilha ? 'Trilha' : 'Etapa'}
                colunaValor="Mediana"
                sufixo=" d"
                fatias={fatias(
                  grupos,
                  (g) => g.tempoEmFila.medianaDias,
                  'var(--graf-alerta)',
                )}
              />
            </Grafico>
          </GradeGraficos>

          <section className="vidro">
            <h2 className="titulo-secao">Detalhamento</h2>

            <TabelaRolavel rotulo="Tempo de ciclo, detalhado">
              <table className="tabela" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader">{porTrilha ? 'Trilha' : 'Etapa'}</th>
                    {porTrilha && (
                      <th role="columnheader">Lead time da trilha</th>
                    )}
                    <th role="columnheader">Tempo de tratamento da etapa</th>
                    <th role="columnheader">Tempo em fila</th>
                    <th role="columnheader">Aprovação direta</th>
                    <th role="columnheader">Etapas em aberto</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {grupos.map((g) => (
                    <tr role="row" key={g.chave}>
                      <td role="cell" data-principal style={{ fontWeight: 600 }}>
                        {g.chave}
                      </td>

                      {porTrilha && (
                        <td role="cell" data-rotulo="Lead time da trilha">
                          {dias(g.leadTimeTrilha?.medianaDias ?? null)}
                          <span className="texto-suave texto-pequeno">
                            {' '}
                            ({base(g.leadTimeTrilha?.base ?? 0, 'produto')})
                          </span>
                        </td>
                      )}

                      <td role="cell" data-rotulo="Tempo de tratamento da etapa">
                        {dias(g.tempoTratamentoEtapa.medianaDias)}
                        <span className="texto-suave texto-pequeno">
                          {' '}
                          ({base(g.tempoTratamentoEtapa.base, 'etapa')})
                        </span>
                      </td>

                      <td role="cell" data-rotulo="Tempo em fila">
                        {dias(g.tempoEmFila.medianaDias)}
                        <span className="texto-suave texto-pequeno">
                          {' '}
                          ({base(g.tempoEmFila.base, 'etapa')})
                        </span>
                      </td>

                      <td role="cell" data-rotulo="Aprovação direta">
                        {base(g.aprovacaoDireta.etapas, 'etapa')}
                      </td>

                      <td role="cell" data-rotulo="Etapas em aberto">
                        {base(g.etapasEmAberto.etapas, 'etapa')}
                        {g.etapasEmAberto.etapas > 0 && (
                          <span className="texto-suave texto-pequeno">
                            {' '}
                            (há {dias(g.etapasEmAberto.medianaDias)})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaRolavel>

            <div className="texto-suave" style={{ marginTop: 'var(--espaco-3)' }}>
              <p>
                <strong>São três medidas diferentes e não comparáveis entre si.</strong>{' '}
                O número entre parênteses é a base sobre a qual a mediana foi
                calculada.
              </p>
              <ul>
                <li>
                  <strong>Lead time da trilha</strong> — da submissão do produto
                  até a aprovação da última etapa obrigatória. A emissão do
                  certificado é ato posterior e fica de fora.
                </li>
                <li>
                  <strong>Tempo de tratamento da etapa</strong> — da primeira
                  saída de Pendente até a aprovação.
                </li>
                <li>
                  <strong>Tempo em fila</strong> — da criação da etapa até
                  alguém encostar nela.
                </li>
                <li>
                  <strong>Aprovação direta</strong> — etapas que foram de
                  Pendente a Aprovado sem tratamento registrado. Ficam fora da
                  mediana de tratamento, que seria zero por construção.
                </li>
                <li>
                  <strong>Etapas em aberto</strong> — ainda não aprovadas,
                  medidas até hoje. Ficam fora das demais medianas: incluí-las
                  faria a trilha mais lenta parecer a mais rápida.
                </li>
              </ul>
              <p>
                Todos os valores são <strong>medianas</strong>, nunca médias — um
                produto abandonado há dois anos destruiria qualquer média.
              </p>
            </div>
          </section>
        </>
      )}
    </>
  );
}
