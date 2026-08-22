import { TemaPadrao } from '@prisma/client';

/**
 * Preset "Padrão ProCert" — espelho fiel dos valores que estavam chumbados em
 * `frontend/src/styles/global.css` antes desta feature.
 *
 * Este arquivo é a fonte única do default: é o que a API devolve quando não há
 * linha salva, e é para cá que "Restaurar padrão" volta. Se um token mudar no
 * CSS, mude aqui junto — senão o botão de restaurar passa a mentir.
 */

/** Chaves aceitas em cada tema. Serve de allowlist no DTO e de contrato no front. */
export interface TokensTema {
  corPrimaria: string;
  corPrimariaEscura: string;
  corSucesso: string;
  corAlerta: string;
  corErro: string;
  corInfo: string;

  fundo: string;
  fundoDegrade: string;
  fundoBrilho1: string;
  fundoBrilho2: string;

  texto: string;
  textoSuave: string;
  textoFraco: string;
  /**
   * Texto sobre superfícies pintadas com a cor primária (botão primário).
   * Token separado porque `--texto` inverte com o tema e o botão não: no modo
   * claro, herdar `--texto` dava 2,66:1 — texto escuro sobre azul.
   */
  textoSobrePrimaria: string;

  vidroFundo: string;
  vidroFundoForte: string;
  vidroBorda: string;
  sombraCor: string;
  overlayModal: string;

  vidroBlur: number;
  raio: number;
  raioSm: number;
}

export const TEMA_ESCURO_PADRAO: TokensTema = {
  corPrimaria: '#0d6efd',
  corPrimariaEscura: '#0a58ca',
  corSucesso: '#16a34a',
  corAlerta: '#f59e0b',
  corErro: '#dc2626',
  corInfo: '#0ea5e9',

  fundo: '#0b1220',
  fundoDegrade: '#111a2e',
  fundoBrilho1: 'rgba(13, 110, 253, 0.35)',
  fundoBrilho2: 'rgba(14, 165, 233, 0.25)',

  texto: '#f8fafc',
  textoSuave: 'rgba(248, 250, 252, 0.72)',
  textoFraco: 'rgba(248, 250, 252, 0.5)',
  textoSobrePrimaria: '#ffffff',

  vidroFundo: 'rgba(255, 255, 255, 0.07)',
  vidroFundoForte: 'rgba(255, 255, 255, 0.12)',
  vidroBorda: 'rgba(255, 255, 255, 0.18)',
  sombraCor: 'rgba(2, 6, 23, 0.45)',
  overlayModal: 'rgba(2, 6, 23, 0.72)',

  vidroBlur: 14,
  raio: 16,
  raioSm: 10,
};

/**
 * O modo claro não existia no painel — é desenhado aqui pela primeira vez.
 * Duas diferenças estruturais em relação ao escuro, e não são estéticas:
 * as cores semânticas escurecem (o tom original não alcança 4.5:1 sobre vidro
 * claro), e o vidro passa a ser branco quase opaco, porque translucidez sobre
 * fundo claro apaga a separação entre card e página.
 */
export const TEMA_CLARO_PADRAO: TokensTema = {
  corPrimaria: '#1d4ed8',
  corPrimariaEscura: '#1e40af',
  corSucesso: '#15803d',
  corAlerta: '#b45309',
  corErro: '#b91c1c',
  corInfo: '#0369a1',

  fundo: '#eef2f8',
  fundoDegrade: '#ffffff',
  fundoBrilho1: 'rgba(29, 78, 216, 0.12)',
  fundoBrilho2: 'rgba(14, 165, 233, 0.1)',

  texto: '#0f172a',
  textoSuave: 'rgba(15, 23, 42, 0.72)',
  textoFraco: 'rgba(15, 23, 42, 0.55)',
  textoSobrePrimaria: '#ffffff',

  vidroFundo: 'rgba(255, 255, 255, 0.72)',
  vidroFundoForte: 'rgba(255, 255, 255, 0.94)',
  vidroBorda: 'rgba(15, 23, 42, 0.12)',
  sombraCor: 'rgba(15, 23, 42, 0.12)',
  overlayModal: 'rgba(15, 23, 42, 0.55)',

  vidroBlur: 14,
  raio: 16,
  raioSm: 10,
};

/**
 * Lista fechada de fontes, por **id** e não pela pilha CSS.
 *
 * Guardar o id em vez de `"Montserrat, system-ui, sans-serif"` deixa a pilha e
 * o carregamento do Google Fonts sob responsabilidade do frontend
 * (`features/aparencia/fontes.ts`), e reduz a validação do servidor a uma
 * comparação com esta lista — `font-family` aceita quase qualquer string, então
 * campo livre aqui seria injeção de CSS pela porta dos fundos.
 *
 * Mudou aqui, mude no catálogo do frontend: um id sem entrada lá cai no fallback.
 */
export const FONTES_PERMITIDAS = [
  'segoe-ui',
  'system',
  'inter',
  'roboto',
  'open-sans',
  'lato',
  'montserrat',
  'poppins',
  'nunito',
  'raleway',
  'work-sans',
  'dm-sans',
  'source-sans-3',
  'plus-jakarta-sans',
  'manrope',
  'rubik',
] as const;

export const FONTE_PADRAO = FONTES_PERMITIDAS[0];

/** Como o papel de parede preenche a viewport. */
export const AJUSTES_PAPEL_PAREDE = ['COBRIR', 'CONTER', 'REPETIR'] as const;
export type AjustePapelParede = (typeof AJUSTES_PAPEL_PAREDE)[number];

export const APARENCIA_PADRAO = {
  temaClaro: TEMA_CLARO_PADRAO,
  temaEscuro: TEMA_ESCURO_PADRAO,
  fonte: FONTE_PADRAO as string,
  temaPadrao: TemaPadrao.ESCURO,
  permitirAlternancia: true,
  logoTemaClaroUrl: null as string | null,
  logoTemaEscuroUrl: null as string | null,
  papelParedeUrl: null as string | null,
  /** 0 desliga o papel de parede sem perder o arquivo enviado. */
  papelParedeOpacidade: 35,
  papelParedeAjuste: 'COBRIR' as string,
};
