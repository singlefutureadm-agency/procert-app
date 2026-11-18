import { describe, expect, it } from 'vitest';

import type { TipoNotificacao } from '@/types';
import { ROTULO_TIPO, tempoRelativo } from './rotulos';

/**
 * O "há quanto tempo" de um aviso.
 *
 * Erra em silêncio das duas pontas: escolher a unidade errada mostra "há 90
 * min" onde cabia "há 2 h", e um relógio de cliente adiantado produz um
 * decorrido NEGATIVO — que, sem o ramo de "agora", viraria "há -1 min" para um
 * aviso que acabou de chegar. Nenhum dos dois lança nada.
 */
describe('tempoRelativo', () => {
  const AGORA = new Date('2026-11-17T12:00:00Z');
  const atras = (ms: number) => new Date(AGORA.getTime() - ms).toISOString();

  const SEGUNDO = 1_000;
  const MINUTO = 60 * SEGUNDO;
  const HORA = 60 * MINUTO;
  const DIA = 24 * HORA;

  it('abaixo de um minuto é "agora"', () => {
    expect(tempoRelativo(atras(0), AGORA)).toBe('agora');
    expect(tempoRelativo(atras(59 * SEGUNDO), AGORA)).toBe('agora');
  });

  it('relógio do cliente adiantado também cai em "agora"', () => {
    // Decorrido negativo. "em 3 min" para um aviso que já chegou é pior que
    // "agora", e "há -3 min" é pior que os dois.
    const futuro = new Date(AGORA.getTime() + 3 * MINUTO).toISOString();

    expect(tempoRelativo(futuro, AGORA)).toBe('agora');
  });

  it('minutos a partir de um minuto cheio', () => {
    expect(tempoRelativo(atras(MINUTO), AGORA)).toBe('há 1 min');
    expect(tempoRelativo(atras(59 * MINUTO), AGORA)).toBe('há 59 min');
  });

  it('vira hora na virada, não 60 min', () => {
    // A borda: 60 minutos é "há 1 h". Um `<=` no lugar do `<` mostraria
    // "há 60 min".
    expect(tempoRelativo(atras(HORA), AGORA)).toBe('há 1 h');
  });

  it('horas até a virada do dia', () => {
    expect(tempoRelativo(atras(23 * HORA), AGORA)).toBe('há 23 h');
    expect(tempoRelativo(atras(DIA), AGORA)).toBe('há 1 d');
  });

  it('dias até uma semana', () => {
    expect(tempoRelativo(atras(6 * DIA), AGORA)).toBe('há 6 d');
  });

  it('a partir de uma semana vira DATA absoluta', () => {
    // "há 23 d" obriga o leitor a fazer a conta que a data já responde.
    const resultado = tempoRelativo(atras(7 * DIA), AGORA);

    expect(resultado).not.toContain('há');
    expect(resultado).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('arredonda para baixo: 1,9 h é "há 1 h"', () => {
    // Para cima, um aviso de 1h55 apareceria como "há 2 h" — dizendo mais
    // tempo do que passou.
    expect(tempoRelativo(atras(HORA + 55 * MINUTO), AGORA)).toBe('há 1 h');
  });
});

describe('ROTULO_TIPO', () => {
  it('todo tipo tem rótulo, e eles são distintos', () => {
    // `Record` completo: tipo novo sem rótulo reprova o type-check em vez de
    // renderizar `undefined` no badge.
    const tipos: TipoNotificacao[] = [
      'DOCUMENTO_ENVIADO',
      'DOCUMENTO_ACEITO',
      'DOCUMENTO_RECUSADO',
    ];

    const rotulos = tipos.map((tipo) => ROTULO_TIPO[tipo]);
    expect(rotulos.every(Boolean)).toBe(true);
    expect(new Set(rotulos).size).toBe(tipos.length);
  });
});
