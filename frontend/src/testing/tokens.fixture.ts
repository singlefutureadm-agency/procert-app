import type { TokensTema } from '@/types';

/**
 * Tokens completos, com contraste sabidamente bom.
 *
 * Precisa ser completo: `propriedadesDoTema` percorre `MAPA_CSS`, e um token
 * faltando some da saída em silêncio. Testes que checam ausência só provam algo
 * partindo de uma base onde tudo está presente.
 */
export function tokens(sobrescreve: Partial<TokensTema> = {}): TokensTema {
  return {
    corPrimaria: '#0d6efd',
    corPrimariaEscura: '#0a58ca',
    corSucesso: '#198754',
    corAlerta: '#f59e0b',
    corErro: '#dc3545',
    corInfo: '#0dcaf0',

    fundo: '#0b1020',
    fundoDegrade: '#111a33',
    fundoBrilho1: 'rgba(13,110,253,0.25)',
    fundoBrilho2: 'rgba(25,135,84,0.18)',

    texto: '#f8fafc',
    textoSuave: '#cbd5e1',
    textoFraco: '#94a3b8',
    textoSobrePrimaria: '#ffffff',

    vidroFundo: 'rgba(255,255,255,0.06)',
    vidroFundoForte: 'rgba(255,255,255,0.12)',
    vidroBorda: 'rgba(255,255,255,0.18)',
    sombraCor: 'rgba(0,0,0,0.45)',
    overlayModal: 'rgba(0,0,0,0.6)',

    vidroBlur: 14,
    raio: 16,
    raioSm: 10,

    ...sobrescreve,
  };
}
