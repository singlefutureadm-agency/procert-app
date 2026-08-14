import { useEffect, useRef, useState } from 'react';

/**
 * Substitutos em React para as três bibliotecas que o legado carregava por CDN
 * na home: AOS (revelar ao rolar), PureCounter (contagem animada) e Swiper
 * (carrossel de depoimentos). São ~80 linhas no total contra ~200 KB de JS
 * externo, e não adicionam dependência ao projeto.
 */

/** Revela o elemento quando ele entra na viewport (equivalente ao AOS). */
export function useRevelar<T extends HTMLElement>(margem = '0px 0px -80px 0px') {
  const referencia = useRef<T>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const elemento = referencia.current;
    if (!elemento) return;

    // Respeita quem pediu menos animação no sistema operacional.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisivel(true);
      return;
    }

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisivel(true);
          observador.disconnect(); // revela uma única vez
        }
      },
      { rootMargin: margem, threshold: 0.05 },
    );

    observador.observe(elemento);
    return () => observador.disconnect();
  }, [margem]);

  return { referencia, visivel };
}

/** Conta de 0 até `destino` quando o elemento aparece (equivalente ao PureCounter). */
export function useContador(destino: number, duracaoMs = 1400) {
  const { referencia, visivel } = useRevelar<HTMLDivElement>();
  const [valor, setValor] = useState(0);

  useEffect(() => {
    if (!visivel) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValor(destino);
      return;
    }

    let quadro = 0;
    const inicio = performance.now();

    const animar = (agora: number) => {
      const progresso = Math.min((agora - inicio) / duracaoMs, 1);
      // easeOutCubic: rápido no início, desacelera no fim.
      setValor(Math.round(destino * (1 - Math.pow(1 - progresso, 3))));
      if (progresso < 1) quadro = requestAnimationFrame(animar);
    };

    quadro = requestAnimationFrame(animar);
    return () => cancelAnimationFrame(quadro);
  }, [visivel, destino, duracaoMs]);

  return { referencia, valor };
}

/** Rotação automática de slides, pausável (equivalente ao autoplay do Swiper). */
export function useCarrossel(total: number, intervaloMs = 5000) {
  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado || total <= 1) return;
    const temporizador = setInterval(
      () => setAtual((indice) => (indice + 1) % total),
      intervaloMs,
    );
    return () => clearInterval(temporizador);
  }, [pausado, total, intervaloMs]);

  return {
    atual,
    irPara: setAtual,
    pausar: () => setPausado(true),
    retomar: () => setPausado(false),
  };
}

/** Verdadeiro depois que a página rolou além de `limite` px (header e botão de topo). */
export function useRolagem(limite = 100) {
  const [passou, setPassou] = useState(false);

  useEffect(() => {
    const aoRolar = () => setPassou(window.scrollY > limite);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, [limite]);

  return passou;
}

/**
 * Marca no <body> que a página institucional está ativa.
 * O tema do painel é escuro e global; a home é clara. Em vez de disputar
 * especificidade, a classe troca a paleta enquanto esta rota estiver montada.
 */
export function useTemaInstitucional() {
  useEffect(() => {
    document.body.classList.add('tema-institucional');
    return () => document.body.classList.remove('tema-institucional');
  }, []);
}
