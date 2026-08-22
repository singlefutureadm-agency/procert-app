import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Do que é a região. Vira o nome no leitor de tela. */
  rotulo: string;
  /** Classe da caixa que rola — quem decide o `overflow` é o CSS de quem usa. */
  className: string;
  children: ReactNode;
}

/**
 * Caixa com rolagem horizontal que só vira parada de Tab enquanto realmente rola.
 *
 * O `overflow-x: auto` sozinho evita o estouro, mas deixa dois furos:
 *
 * - **Só dá para rolar com o dedo ou o mouse.** Uma região rolável precisa ser
 *   focável para o teclado alcançar o que está escondido (WCAG 2.1.1).
 * - **Focável e anônima, vira uma parada de Tab muda.** O leitor de tela
 *   anunciaria "grupo" e nada mais; `role="region"` + `aria-label` dizem o quê.
 *
 * E isso só vale **enquanto há estouro**. Numa lista curta no desktop, uma
 * região focável que não rola é só um Tab a mais no caminho de todo mundo —
 * daí a medição abaixo.
 *
 * Era o corpo do `TabelaRolavel`, que hoje é um caso particular deste: a
 * timeline da certificação precisa exatamente do mesmo comportamento, e uma
 * segunda cópia da medição seria uma segunda chance de ela divergir.
 */
export function RegiaoRolavel({ rotulo, className, children }: Props) {
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
    // O conteúdo é filho e cresce por conta própria quando os dados chegam.
    if (elemento.firstElementChild) observador.observe(elemento.firstElementChild);

    return () => observador.disconnect();
  }, [children]);

  return (
    <div
      className={className}
      ref={caixa}
      role={rola ? 'region' : undefined}
      aria-label={rola ? rotulo : undefined}
      tabIndex={rola ? 0 : undefined}
    >
      {children}
    </div>
  );
}
