import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Do que é a tabela. Vira o nome da região no leitor de tela. */
  rotulo: string;
  children: ReactNode;
}

/**
 * Invólucro das tabelas do painel.
 *
 * Era só um `<div className="tabela-wrapper">` com `overflow-x: auto`. O scroll
 * horizontal evita o estouro, mas sozinho deixa dois furos que este componente
 * fecha:
 *
 * - **Só dava para rolar com o dedo ou o mouse.** Uma região rolável precisa ser
 *   focável para o teclado alcançar as colunas escondidas (WCAG 2.1.1).
 * - **Focável e anônima, virava uma parada de Tab muda.** O leitor de tela
 *   anunciaria "grupo" e nada mais; `role="region"` + `aria-label` dizem qual
 *   listagem é.
 *
 * O detalhe é que isso só vale **enquanto a tabela realmente rola**. Numa
 * listagem curta no desktop, ou abaixo de 720px — onde o CSS transforma as
 * linhas em cartões e o estouro deixa de existir —, uma região focável que não
 * rola é só um Tab a mais no caminho de todo mundo. Daí a medição abaixo.
 */
export function TabelaRolavel({ rotulo, children }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const [rola, setRola] = useState(false);

  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;

    const medir = () =>
      // 1px de folga: com zoom do navegador as duas medidas divergem por
      // arredondamento e a região piscaria entre focável e não focável.
      setRola(elemento.scrollWidth - elemento.clientWidth > 1);

    medir();

    /*
     * `ResizeObserver` no lugar de `window.resize` porque a largura útil muda
     * sem a janela mudar: abrir a sidebar, trocar de página com mais colunas ou
     * carregar uma linha com texto longo redimensionam só este contêiner.
     */
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    // A tabela é filha e cresce por conta própria quando os dados chegam.
    if (elemento.firstElementChild) observador.observe(elemento.firstElementChild);

    return () => observador.disconnect();
  }, [children]);

  return (
    <div
      className="tabela-wrapper"
      ref={caixa}
      role={rola ? 'region' : undefined}
      aria-label={rola ? rotulo : undefined}
      tabIndex={rola ? 0 : undefined}
    >
      {children}
    </div>
  );
}
