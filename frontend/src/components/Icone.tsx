/**
 * Ícones do painel — SVG inline, família única (traço, grade 24).
 *
 * Substitui os emojis que vieram do legado. Emoji não serve como ícone de
 * interface por três motivos concretos que apareciam aqui:
 *
 * 1. **Não herda cor.** Emoji é imagem colorida da fonte do sistema, então
 *    ignorava `--cor-primaria` e ficava igual no item ativo e no inativo da
 *    sidebar. O SVG usa `currentColor` e reage ao tema junto com o resto.
 * 2. **Renderiza diferente por sistema.** ✏️ no Windows, no macOS e no Android
 *    são três desenhos distintos, com pesos e tamanhos ópticos distintos — a
 *    barra de ações da tabela nunca ficava alinhada.
 * 3. **Leitor de tela anuncia o nome do emoji.** 🚫 vira "proibido" no meio da
 *    frase. Aqui o `<svg>` é `aria-hidden` e quem carrega o nome acessível é o
 *    botão, via `aria-label`.
 *
 * Optamos por SVG local em vez de importar `bootstrap-icons` (já usado na home
 * institucional): a fonte inteira custa ~106 KB para os ~30 glifos que o painel
 * usa, e o painel é justamente a parte do sistema que fica aberta o dia todo.
 */

import type { ReactElement, SVGProps } from 'react';

/** Nome semântico, não o desenho — trocar o traço não deve renomear o uso. */
export type NomeIcone =
  | 'grafico'
  | 'prancheta'
  | 'alerta'
  | 'certificado'
  | 'caixa'
  | 'pastas'
  | 'predio'
  | 'pessoas'
  | 'paleta'
  | 'escudo'
  | 'menu'
  | 'sol'
  | 'lua'
  | 'seta-esquerda'
  | 'seta-direita'
  | 'lapis'
  | 'proibido'
  | 'reciclar'
  | 'olho'
  | 'lixeira'
  | 'peca'
  | 'bussola'
  | 'atualizar'
  | 'verificado'
  | 'check'
  | 'x'
  | 'ampulheta'
  | 'relogio'
  | 'clipe'
  | 'download'
  | 'cadeado'
  | 'arrastar'
  | 'caixa-vazia';

/*
 * Todos os desenhos vivem na mesma grade 24×24 e são só traço: nenhum usa
 * `fill`, então o peso óptico é uniforme e `strokeWidth` é o único ajuste
 * necessário para o ícone acompanhar o tamanho da fonte.
 */
const DESENHOS: Record<NomeIcone, ReactElement> = {
  grafico: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 16v-5" />
      <path d="M12 16V8" />
      <path d="M17 16v-3" />
    </>
  ),
  prancheta: (
    <>
      <path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M9 2h6a1 1 0 0 1 1 1v3H8V3a1 1 0 0 1 1-1z" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </>
  ),
  alerta: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  certificado: (
    <>
      <circle cx="12" cy="9" r="6" />
      <path d="m15.5 13.9 1.5 8.1-5-3-5 3 1.5-8.1" />
    </>
  ),
  caixa: (
    <>
      <path d="m7.5 4.3 9 5.1" />
      <path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  pastas: (
    <>
      <path d="M20 20a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 4.9A2 2 0 0 0 7.93 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
      <path d="M2 11h20" />
    </>
  ),
  predio: (
    <>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </>
  ),
  pessoas: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  paleta: (
    <>
      <path d="M12 22a10 10 0 1 1 10-10 4 4 0 0 1-4 4h-1.5a1.75 1.75 0 0 0-1.32 2.9 1.75 1.75 0 0 1-1.32 2.9z" />
      <circle cx="7.5" cy="11.5" r="1" />
      <circle cx="10.5" cy="7.5" r="1" />
      <circle cx="15.5" cy="8.5" r="1" />
    </>
  ),
  escudo: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </>
  ),
  lua: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />,
  'seta-esquerda': (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  'seta-direita': (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  lapis: (
    <>
      <path d="M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.83l-1.3 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" />
      <path d="m15 5 4 4" />
    </>
  ),
  proibido: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </>
  ),
  reciclar: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  olho: (
    <>
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lixeira: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  peca: (
    <>
      <path d="M15.4 21H19a2 2 0 0 0 2-2v-3.6a.6.6 0 0 0-.9-.5 2 2 0 1 1 0-3.4.6.6 0 0 0 .9-.5V7a2 2 0 0 0-2-2h-3.6a.6.6 0 0 1-.5-.9 2 2 0 1 0-3.4 0 .6.6 0 0 1-.5.9H5a2 2 0 0 0-2 2v3.4a.6.6 0 0 0 .9.5 2 2 0 1 1 0 3.4.6.6 0 0 0-.9.5V19a2 2 0 0 0 2 2h3.4" />
      <path d="M8.4 21a.6.6 0 0 0 .5-.9 2 2 0 1 1 3.4 0 .6.6 0 0 0 .5.9" />
    </>
  ),
  bussola: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z" />
    </>
  ),
  atualizar: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>
  ),
  verificado: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  ampulheta: (
    <>
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.17a2 2 0 0 0-.59-1.41L12 12l-4.41 4.42A2 2 0 0 0 7 17.83V22" />
      <path d="M7 2v4.17a2 2 0 0 0 .59 1.41L12 12l4.41-4.42A2 2 0 0 0 17 6.17V2" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  clipe: (
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  cadeado: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  /* Seis pontos — a convenção universal de "arraste-me". */
  arrastar: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  'caixa-vazia': (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
};

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  nome: NomeIcone;
  /** Aresta em px. 20 é a medida dos controles; 18 nos compactos. */
  tamanho?: number;
  /**
   * Nome acessível. Só preencha quando o ícone for a **única** informação e não
   * houver texto equivalente por perto. Ao lado de um rótulo visível — ou dentro
   * de um botão que já tem `aria-label` — deixe vazio: o ícone vira decorativo e
   * o leitor de tela para de anunciar a mesma coisa duas vezes.
   */
  titulo?: string;
}

export function Icone({ nome, tamanho = 20, titulo, ...resto }: Props) {
  const decorativo = !titulo;

  return (
    <svg
      className="icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={decorativo ? undefined : 'img'}
      aria-hidden={decorativo || undefined}
      aria-label={titulo}
      focusable="false"
      {...resto}
    >
      {DESENHOS[nome]}
    </svg>
  );
}
