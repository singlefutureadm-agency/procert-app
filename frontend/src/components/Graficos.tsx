import type { ReactNode } from 'react';

/**
 * Primitivas de gráfico do painel.
 *
 * **Sem biblioteca e sem SVG.** Sem biblioteca pelo mesmo motivo dos ícones: o
 * painel já tem um sistema de design em tokens, e um pacote de charts traz a
 * própria paleta, a própria tipografia e o próprio conceito de tema — seria
 * um segundo design system dentro do primeiro. Sem SVG porque tudo aqui é
 * retângulo proporcional: em HTML o texto reflui sozinho, herda a fonte que o
 * admin escolheu na tela de Aparência e não exige recalcular `viewBox` a cada
 * quebra de layout.
 *
 * ## Cor
 *
 * As cores saem dos MESMOS tokens dos badges — verde é aprovado nos dois
 * lugares. A alternativa (uma paleta categórica própria, separada por daltonismo
 * com folga) foi medida e descartada: obrigaria o leitor a manter dois
 * dicionários de cor na cabeça na mesma tela.
 *
 * O preço dessa escolha é real e está medido: `--cor-sucesso` e `--cor-erro`
 * têm ΔE 5,0 sob deuteranopia — abaixo do piso de 6–8. Por isso **nenhum
 * gráfico aqui depende de cor**:
 *
 *  • todo valor tem rótulo em texto, sempre visível;
 *  • toda série tem legenda escrita;
 *  • a série crítica (reprovado / NC maior) leva hachura a 45°, que distingue
 *    por padrão e não por matiz — é o que separa vermelho de verde para quem
 *    não separa os dois;
 *  • há 2px de respiro entre segmentos vizinhos, então a fronteira existe mesmo
 *    quando as cores encostam.
 *
 * O âmbar do modo escuro é derivado (`--graf-alerta`), não o token cru: o
 * `#f59e0b` fica em L 0.77 sobre o vidro escuro, fora da faixa de luminosidade,
 * e o resultado é uma barra que brilha mais que o texto ao lado dela.
 *
 * ## Acessibilidade
 *
 * Cada gráfico carrega uma `<table>` fora da tela com os mesmos números. As
 * barras são `aria-hidden`: um leitor de tela não tem o que fazer com "div de
 * 62% de largura", e a tabela responde à mesma pergunta em ordem linear.
 */

export interface FatiaGrafico {
  /** Texto da legenda e da tabela acessível. */
  rotulo: string;
  valor: number;
  /**
   * Token CSS, sempre `var(--…)` — nunca cor literal, ou não segue o tema.
   *
   * Aplicado como `backgroundColor`, nunca como `background`: o shorthand
   * zeraria o `background-image` de `.gr--textura`, e como estilo inline vence
   * folha de estilo, a hachura sumiria sem erro nenhum — a marca simplesmente
   * ficaria lisa.
   */
  cor: string;
  /** Hachura 45°: encoding secundário para a série crítica. */
  textura?: boolean;
  /** Linha de apoio no tooltip nativo. */
  detalhe?: string;
}

interface PropsMoldura {
  titulo: string;
  descricao?: string;
  /** Número-síntese à direita do título. */
  destaque?: ReactNode;
  /** Legenda em texto do que os dados cobrem — nunca esconda o recorte. */
  rodape?: string;
  vazio?: boolean;
  mensagemVazio?: string;
  children: ReactNode;
}

export function Grafico({
  titulo,
  descricao,
  destaque,
  rodape,
  vazio,
  mensagemVazio = 'Sem dados para exibir ainda.',
  children,
}: PropsMoldura) {
  return (
    <figure className="gr vidro">
      <figcaption className="gr__cabecalho">
        <div>
          <h3 className="gr__titulo">{titulo}</h3>
          {descricao && <p className="gr__descricao">{descricao}</p>}
        </div>
        {destaque !== undefined && <div className="gr__destaque">{destaque}</div>}
      </figcaption>

      {vazio ? (
        <p className="gr__vazio">{mensagemVazio}</p>
      ) : (
        <div className="gr__corpo">{children}</div>
      )}

      {rodape && <p className="gr__rodape">{rodape}</p>}
    </figure>
  );
}

/** Tabela equivalente, fora da tela. É a versão acessível de todo gráfico. */
function TabelaOculta({
  titulo,
  colunas,
  linhas,
}: {
  titulo: string;
  colunas: string[];
  linhas: Array<Array<string | number>>;
}) {
  return (
    <table className="apenas-leitor-tela">
      <caption>{titulo}</caption>
      <thead>
        <tr>
          {colunas.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i}>
            {linha.map((celula, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {celula}
                </th>
              ) : (
                <td key={j}>{celula}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Legenda({ fatias }: { fatias: FatiaGrafico[] }) {
  return (
    <ul className="gr-legenda" aria-hidden="true">
      {fatias.map((fatia) => (
        <li key={fatia.rotulo} className="gr-legenda__item">
          <span
            className={`gr-legenda__marca${fatia.textura ? ' gr--textura' : ''}`}
            style={{ backgroundColor: fatia.cor }}
          />
          {fatia.rotulo}
          <strong className="gr-legenda__valor">{fatia.valor}</strong>
        </li>
      ))}
    </ul>
  );
}

/**
 * Barra única de composição (100%).
 *
 * Escolhida em vez de pizza porque a pergunta é "quanto de cada um dentro do
 * todo", e comparar comprimentos numa linha é mais preciso que comparar
 * ângulos. Fatia de valor 0 não é renderizada — um segmento invisível ainda
 * consumiria os 2px de respiro e abriria um vão sem explicação.
 */
export function BarraComposicao({
  fatias,
  titulo,
}: {
  fatias: FatiaGrafico[];
  titulo: string;
}) {
  const total = fatias.reduce((soma, f) => soma + f.valor, 0);
  const visiveis = fatias.filter((f) => f.valor > 0);

  return (
    <>
      <div className="gr-composicao" aria-hidden="true">
        {visiveis.map((fatia) => {
          const parte = (fatia.valor / total) * 100;
          return (
            <div
              key={fatia.rotulo}
              className={`gr-composicao__fatia${fatia.textura ? ' gr--textura' : ''}`}
              style={{ backgroundColor: fatia.cor, width: `${parte}%` }}
              title={`${fatia.rotulo}: ${fatia.valor} (${Math.round(parte)}%)`}
            >
              {/* O rótulo só entra quando a fatia comporta — texto espremido
                  não informa, e a legenda abaixo já cobre o caso. */}
              {parte >= 12 && (
                <span className="gr-composicao__valor">{Math.round(parte)}%</span>
              )}
            </div>
          );
        })}
      </div>

      <Legenda fatias={fatias} />

      <TabelaOculta
        titulo={titulo}
        colunas={['Situação', 'Quantidade', 'Participação']}
        linhas={fatias.map((f) => [
          f.rotulo,
          f.valor,
          total === 0 ? '0%' : `${Math.round((f.valor / total) * 100)}%`,
        ])}
      />
    </>
  );
}

/**
 * Barras horizontais ranqueadas.
 *
 * Horizontal, e não vertical, porque o eixo de identidade traz nome de produto
 * e de etapa — texto longo, que na vertical viraria rótulo inclinado a 45°.
 */
export function BarrasHorizontais({
  fatias,
  titulo,
  colunaIdentidade = 'Item',
  colunaValor = 'Valor',
  sufixo = '',
  maximo,
}: {
  fatias: FatiaGrafico[];
  titulo: string;
  colunaIdentidade?: string;
  colunaValor?: string;
  sufixo?: string;
  /** Escala fixa; sem isto o maior item sempre encosta em 100% e some a noção
   *  de "longe do fim". Percentual manda 100. */
  maximo?: number;
}) {
  const teto = maximo ?? Math.max(1, ...fatias.map((f) => f.valor));

  return (
    <>
      <ul className="gr-barras" aria-hidden="true">
        {fatias.map((fatia) => (
          <li key={fatia.rotulo} className="gr-barras__linha">
            <span className="gr-barras__rotulo" title={fatia.rotulo}>
              {fatia.rotulo}
              {fatia.detalhe && (
                <small className="gr-barras__detalhe">{fatia.detalhe}</small>
              )}
            </span>

            <span className="gr-barras__trilho">
              <span
                className={`gr-barras__marca${fatia.textura ? ' gr--textura' : ''}`}
                style={{
                  backgroundColor: fatia.cor,
                  /*
                   * O piso de 3px mantém visível um valor pequeno — 2% de um
                   * trilho largo vira um fio invisível. Mas ele NÃO vale para
                   * zero: uma marca desenhada onde o valor é zero faz o gráfico
                   * mentir, e o rótulo ao lado dizendo "0" não desfaz a marca
                   * que o olho já leu.
                   */
                  width:
                    fatia.valor === 0
                      ? 0
                      : `max(3px, ${(fatia.valor / teto) * 100}%)`,
                }}
              />
            </span>

            <span className="gr-barras__valor">
              {fatia.valor}
              {sufixo}
            </span>
          </li>
        ))}
      </ul>

      <TabelaOculta
        titulo={titulo}
        colunas={[colunaIdentidade, colunaValor]}
        linhas={fatias.map((f) => [
          f.detalhe ? `${f.rotulo} — ${f.detalhe}` : f.rotulo,
          `${f.valor}${sufixo}`,
        ])}
      />
    </>
  );
}

export interface GrupoColunas {
  rotulo: string;
  /** Uma ou mais séries dentro do mesmo grupo. */
  fatias: FatiaGrafico[];
}

/**
 * Colunas verticais, agrupadas.
 *
 * A forma existe para responder "A é maior que B dentro do mesmo grupo?" —
 * agrupada e não empilhada, porque empilhar só deixa comparar o segmento de
 * baixo; os de cima não compartilham linha de base.
 */
export function ColunasAgrupadas({
  grupos,
  titulo,
  colunaIdentidade = 'Grupo',
}: {
  grupos: GrupoColunas[];
  titulo: string;
  colunaIdentidade?: string;
}) {
  const teto = Math.max(
    1,
    ...grupos.flatMap((g) => g.fatias.map((f) => f.valor)),
  );
  const series = grupos[0]?.fatias ?? [];

  return (
    <>
      <div className="gr-colunas" aria-hidden="true">
        {grupos.map((grupo) => (
          <div key={grupo.rotulo} className="gr-colunas__grupo">
            <div className="gr-colunas__marcas">
              {grupo.fatias.map((fatia) => (
                <div
                  key={fatia.rotulo}
                  className="gr-colunas__coluna"
                  title={`${grupo.rotulo} · ${fatia.rotulo}: ${fatia.valor}`}
                >
                  <span className="gr-colunas__valor">{fatia.valor}</span>
                  <span
                    className={`gr-colunas__marca${fatia.textura ? ' gr--textura' : ''}`}
                    style={{
                      backgroundColor: fatia.cor,
                      // Mesma regra das barras: piso só para valor > 0.
                      height:
                        fatia.valor === 0
                          ? 0
                          : `max(3px, ${(fatia.valor / teto) * 100}%)`,
                    }}
                  />
                </div>
              ))}
            </div>
            <span className="gr-colunas__rotulo">{grupo.rotulo}</span>
          </div>
        ))}
      </div>

      {series.length > 1 && (
        <Legenda
          fatias={series.map((s) => ({
            ...s,
            // Na legenda o número é o total da série, não o do primeiro grupo.
            valor: grupos.reduce(
              (soma, g) =>
                soma + (g.fatias.find((f) => f.rotulo === s.rotulo)?.valor ?? 0),
              0,
            ),
          }))}
        />
      )}

      <TabelaOculta
        titulo={titulo}
        colunas={[colunaIdentidade, ...series.map((s) => s.rotulo)]}
        linhas={grupos.map((g) => [
          g.rotulo,
          ...series.map(
            (s) => g.fatias.find((f) => f.rotulo === s.rotulo)?.valor ?? 0,
          ),
        ])}
      />
    </>
  );
}

/** Duas colunas em telas largas, uma no celular. */
export function GradeGraficos({ children }: { children: ReactNode }) {
  return <div className="gr-grade">{children}</div>;
}
