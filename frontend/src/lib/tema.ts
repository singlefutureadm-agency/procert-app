import { garantirFonteCarregada, pilhaDaFonte } from '@/features/aparencia/fontes';
import type { Aparencia, ModoTema, TokensTema } from '@/types';
import { urlArquivo } from './arquivos';

/**
 * Aplicação dos design tokens em runtime.
 *
 * Toda a página de aparência (preview ao vivo incluído) se resume a chamar
 * `aplicarTema` — como todo componente lê `var(--token)`, escrever no
 * `documentElement` repinta o painel inteiro sem re-render do React.
 */

/** Token → nome da custom property. Também é a allowlist do que vai ao CSS. */
const MAPA_CSS: Record<keyof TokensTema, string> = {
  corPrimaria: '--cor-primaria',
  corPrimariaEscura: '--cor-primaria-escura',
  corSucesso: '--cor-sucesso',
  corAlerta: '--cor-alerta',
  corErro: '--cor-erro',
  corInfo: '--cor-info',

  fundo: '--fundo',
  fundoDegrade: '--fundo-degrade',
  fundoBrilho1: '--fundo-brilho-1',
  fundoBrilho2: '--fundo-brilho-2',

  texto: '--texto',
  textoSuave: '--texto-suave',
  textoFraco: '--texto-fraco',
  textoSobrePrimaria: '--texto-sobre-primaria',

  vidroFundo: '--vidro-fundo',
  vidroFundoForte: '--vidro-fundo-forte',
  vidroBorda: '--vidro-borda',
  sombraCor: '--sombra-cor',
  overlayModal: '--overlay-modal',

  vidroBlur: '--vidro-blur',
  raio: '--raio',
  raioSm: '--raio-sm',
};

/** Tokens numéricos são guardados como número e viram px na aplicação. */
const EM_PIXELS = new Set<keyof TokensTema>(['vidroBlur', 'raio', 'raioSm']);

const CHAVE_CACHE = 'procert:aparencia';
const CHAVE_MODO = 'procert:tema-modo';

/** Papel de parede: mesmos valores aceitos em `AJUSTES_PAPEL_PAREDE`. */
export interface PapelParede {
  url: string | null;
  opacidade: number;
  ajuste: string;
}

const AJUSTE_CSS: Record<string, { size: string; repeat: string }> = {
  COBRIR: { size: 'cover', repeat: 'no-repeat' },
  CONTER: { size: 'contain', repeat: 'no-repeat' },
  REPETIR: { size: 'auto', repeat: 'repeat' },
};

/**
 * Converte os tokens nas custom properties correspondentes.
 *
 * Separado de `aplicarTema` porque os previews da tela de Aparência usam o
 * mesmo mapa num container isolado, em vez do documento inteiro — é o que
 * permite mostrar o modo claro e o escuro lado a lado.
 */
export function propriedadesDoTema(
  tokens: TokensTema,
  fonteId?: string,
): Record<string, string> {
  const props: Record<string, string> = {};

  for (const [chave, propriedade] of Object.entries(MAPA_CSS)) {
    const valor = tokens[chave as keyof TokensTema];
    if (valor === undefined || valor === null) continue;

    props[propriedade] = EM_PIXELS.has(chave as keyof TokensTema)
      ? `${valor}px`
      : String(valor);
  }

  if (fonteId) {
    garantirFonteCarregada(fonteId);
    props['--fonte'] = pilhaDaFonte(fonteId);
  }

  // O gradiente é derivado no CSS a partir dos tokens, mas dentro de um
  // container isolado a declaração do :root não é reavaliada — então compõe aqui.
  props['--fundo-gradiente'] =
    `radial-gradient(1200px 600px at 15% -10%, ${tokens.fundoBrilho1}, transparent 60%),` +
    `radial-gradient(900px 500px at 100% 0%, ${tokens.fundoBrilho2}, transparent 55%),` +
    `linear-gradient(160deg, ${tokens.fundo} 0%, ${tokens.fundoDegrade} 55%, ${tokens.fundo} 100%)`;
  props['--vidro-sombra'] = `0 8px 32px ${tokens.sombraCor}`;

  return props;
}

export function aplicarTema(
  tokens: TokensTema,
  fonteId: string,
  modo: ModoTema,
  papelParede?: PapelParede,
): void {
  const raiz = document.documentElement;

  for (const [propriedade, valor] of Object.entries(
    propriedadesDoTema(tokens, fonteId),
  )) {
    // `--fundo-gradiente` e `--vidro-sombra` são derivados: no documento o
    // próprio CSS os recalcula, então não sobrescreve para não congelá-los.
    if (propriedade === '--fundo-gradiente' || propriedade === '--vidro-sombra') {
      continue;
    }
    raiz.style.setProperty(propriedade, valor);
  }

  aplicarPapelParede(papelParede);

  // `color-scheme` acompanha o modo (scrollbar, caret, controles nativos).
  raiz.classList.toggle('tema-claro', modo === 'CLARO');
  raiz.classList.toggle('tema-escuro', modo === 'ESCURO');
}

export function aplicarPapelParede(papelParede?: PapelParede): void {
  const raiz = document.documentElement;
  const ajuste = AJUSTE_CSS[papelParede?.ajuste ?? 'COBRIR'] ?? AJUSTE_CSS.COBRIR;

  // `url()` com aspas simples: o nome do arquivo é um UUID gerado no servidor,
  // mas o valor ainda vai para o CSS e não custa nada fechar a porta.
  //
  // `urlArquivo` porque o caminho vem relativo da API (`/uploads/...`): com a
  // API em outro host, o CSS pediria a imagem ao domínio do site e o painel
  // ficaria sem papel de parede, sem erro visível em lugar nenhum.
  raiz.style.setProperty(
    '--papel-parede',
    papelParede?.url ? `url('${urlArquivo(papelParede.url, '')}')` : 'none',
  );
  raiz.style.setProperty(
    '--papel-parede-opacidade',
    String((papelParede?.url ? (papelParede.opacidade ?? 0) : 0) / 100),
  );
  raiz.style.setProperty('--papel-parede-ajuste', ajuste.size);
  raiz.style.setProperty('--papel-parede-repeticao', ajuste.repeat);
}

export function aplicarAparencia(aparencia: Aparencia, modo: ModoTema): void {
  const tokens = modo === 'CLARO' ? aparencia.temaClaro : aparencia.temaEscuro;
  aplicarTema(tokens, aparencia.fonte, modo, {
    url: aparencia.papelParedeUrl,
    opacidade: aparencia.papelParedeOpacidade,
    ajuste: aparencia.papelParedeAjuste,
  });
}

/**
 * Qual modo usar: preferência local do usuário, se o admin permitir alternar;
 * senão o padrão definido por ele.
 */
export function resolverModo(aparencia: Aparencia): ModoTema {
  if (!aparencia.permitirAlternancia) return aparencia.temaPadrao;
  return lerModoLocal() ?? aparencia.temaPadrao;
}

export function lerModoLocal(): ModoTema | null {
  const bruto = localStorage.getItem(CHAVE_MODO);
  return bruto === 'CLARO' || bruto === 'ESCURO' ? bruto : null;
}

export function guardarModoLocal(modo: ModoTema): void {
  localStorage.setItem(CHAVE_MODO, modo);
}

/**
 * Cache local da última aparência conhecida.
 *
 * Existe só para matar o flash: sem ele, todo carregamento mostraria o preset
 * padrão do `global.css` até `GET /api/aparencia` responder. O servidor
 * continua sendo a autoridade — isto é lido de forma síncrona no boot e
 * substituído assim que a resposta real chega.
 */
export function lerAparenciaEmCache(): Aparencia | null {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE);
    return bruto ? (JSON.parse(bruto) as Aparencia) : null;
  } catch {
    return null;
  }
}

export function guardarAparenciaEmCache(aparencia: Aparencia): void {
  localStorage.setItem(CHAVE_CACHE, JSON.stringify(aparencia));
}

/**
 * Chamado antes do primeiro render, em `main.tsx`. Sem cache não faz nada e o
 * painel usa os defaults do CSS até a API responder — a única janela de flash
 * que sobra, e só na primeira visita do navegador.
 */
export function aplicarTemaDoCache(): void {
  const cache = lerAparenciaEmCache();
  if (cache) aplicarAparencia(cache, resolverModo(cache));
}

/* -------------------------------------------------------------------------- */
/*  Contraste                                                                  */
/* -------------------------------------------------------------------------- */

/** Aceita `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` e `rgba()`. */
function paraRgb(cor: string): [number, number, number, number] | null {
  const texto = cor.trim();

  if (texto.startsWith('#')) {
    const hex = texto.slice(1);
    const expandir = (h: string) => parseInt(h.length === 1 ? h + h : h, 16);

    if (hex.length === 3) {
      return [expandir(hex[0]), expandir(hex[1]), expandir(hex[2]), 1];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      ];
    }
    return null;
  }

  const partes = texto.match(/[\d.]+/g);
  if (!partes || partes.length < 3) return null;

  return [
    Number(partes[0]),
    Number(partes[1]),
    Number(partes[2]),
    partes[3] === undefined ? 1 : Number(partes[3]),
  ];
}

/** Achata uma cor translúcida sobre o fundo — senão o contraste sai errado. */
function sobrepor(
  frente: [number, number, number, number],
  fundo: [number, number, number, number],
): [number, number, number] {
  const a = frente[3];
  return [
    frente[0] * a + fundo[0] * (1 - a),
    frente[1] * a + fundo[1] * (1 - a),
    frente[2] * a + fundo[2] * (1 - a),
  ];
}

function luminancia([r, g, b]: [number, number, number]): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Razão de contraste WCAG entre duas cores.
 *
 * `base` importa: superfícies como `--vidro-fundo` são translúcidas, e tratá-las
 * como opacas dá um número que não corresponde ao que se enxerga na tela. O
 * fundo é achatado sobre a base antes, e só então a frente sobre o resultado.
 *
 * Devolve null quando alguma cor não é interpretável — a UI então não afirma
 * nada, em vez de exibir um número inventado.
 */
export function razaoDeContraste(
  frente: string,
  fundo: string,
  base?: string,
): number | null {
  const f = paraRgb(frente);
  const b = paraRgb(fundo);
  if (!f || !b) return null;

  const baseRgb = base ? paraRgb(base) : null;
  const fundoOpaco: [number, number, number] =
    baseRgb && b[3] < 1
      ? sobrepor(b, [baseRgb[0], baseRgb[1], baseRgb[2], 1])
      : [b[0], b[1], b[2]];

  const l1 = luminancia(sobrepor(f, [...fundoOpaco, 1]));
  const l2 = luminancia(fundoOpaco);

  const claro = Math.max(l1, l2);
  const escuro = Math.min(l1, l2);
  return (claro + 0.05) / (escuro + 0.05);
}

export interface ChecagemContraste {
  rotulo: string;
  razao: number | null;
  minimo: number;
  passa: boolean;
}

/**
 * Os pares que quebram a leitura do painel se o admin errar a mão.
 *
 * Isto avisa, não bloqueia: travar o salvamento impediria combinações
 * legítimas (um cinza decorativo, uma marca com contraste baixo por
 * definição) e transformaria a tela em obstáculo. A decisão fica com o admin,
 * com o número na frente dele.
 */
export function checarContrastes(tokens: TokensTema): ChecagemContraste[] {
  // [rótulo, frente, fundo, base sobre a qual achatar o fundo, mínimo WCAG]
  const pares: Array<[string, string, string, string | undefined, number]> = [
    ['Texto sobre o fundo', tokens.texto, tokens.fundo, undefined, 4.5],
    ['Texto suave sobre o fundo', tokens.textoSuave, tokens.fundo, undefined, 4.5],
    // Texto fraco é secundário (metadado, rótulo de coluna): AA large.
    ['Texto fraco sobre o fundo', tokens.textoFraco, tokens.fundo, undefined, 3],
    ['Texto sobre o vidro', tokens.texto, tokens.vidroFundo, tokens.fundo, 4.5],
    [
      'Botão primário',
      tokens.textoSobrePrimaria,
      tokens.corPrimaria,
      undefined,
      4.5,
    ],
    [
      'Botão primário (hover)',
      tokens.textoSobrePrimaria,
      tokens.corPrimariaEscura,
      undefined,
      4.5,
    ],
  ];

  return pares.map(([rotulo, frente, fundo, base, minimo]) => {
    const razao = razaoDeContraste(frente, fundo, base);
    return { rotulo, razao, minimo, passa: razao !== null && razao >= minimo };
  });
}
