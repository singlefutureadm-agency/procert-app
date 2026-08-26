import { describe, expect, it } from 'vitest';

import {
  mascararCep,
  mascararCnpj,
  mascararCpf,
  mascararTelefone,
} from './mascaras';

/**
 * As máscaras são **progressivas**: formatam o que já foi digitado, sem exigir
 * o campo completo. Testar só o valor final esconderia o estado intermediário,
 * que é o que o usuário passa 100% do tempo vendo enquanto digita.
 *
 * O comprimento COM pontuação é o limite do schema (`VarChar(14)` no CPF,
 * `(18)` no CNPJ, `(9)` no CEP) — estourar aqui vira 400 no backend.
 */

describe('mascararCpf', () => {
  it('formata progressivamente, a cada bloco', () => {
    expect(mascararCpf('123')).toBe('123');
    expect(mascararCpf('1234')).toBe('123.4');
    expect(mascararCpf('1234567')).toBe('123.456.7');
    expect(mascararCpf('12345678901')).toBe('123.456.789-01');
  });

  it('descarta o que passa de 11 dígitos', () => {
    // O excedente estouraria o VarChar(14) com a pontuação.
    expect(mascararCpf('123456789012345')).toBe('123.456.789-01');
    expect(mascararCpf('12345678901')).toHaveLength(14);
  });

  it('ignora o que não é dígito, inclusive a pontuação já aplicada', () => {
    // Reaplicar a máscara sobre o próprio resultado tem de ser estável, senão
    // cada tecla acumularia pontuação.
    expect(mascararCpf('123.456.789-01')).toBe('123.456.789-01');
    expect(mascararCpf('abc123')).toBe('123');
  });

  it('devolve string vazia para entrada vazia', () => {
    expect(mascararCpf('')).toBe('');
  });
});

describe('mascararCnpj', () => {
  it('formata progressivamente', () => {
    expect(mascararCnpj('12')).toBe('12');
    expect(mascararCnpj('123456')).toBe('12.345.6');
    expect(mascararCnpj('12345678000')).toBe('12.345.678/000');
    expect(mascararCnpj('12345678000190')).toBe('12.345.678/0001-90');
  });

  it('respeita o limite de 14 dígitos', () => {
    expect(mascararCnpj('123456780001901234')).toBe('12.345.678/0001-90');
    expect(mascararCnpj('12345678000190')).toHaveLength(18);
  });

  it('é estável ao reaplicar sobre o próprio resultado', () => {
    expect(mascararCnpj('12.345.678/0001-90')).toBe('12.345.678/0001-90');
  });
});

describe('mascararTelefone', () => {
  it('usa 4+4 no fixo e 5+4 no celular', () => {
    /*
     * O corte depende do total. Fixar em 5+4 deixaria o fixo como
     * `(47) 35218-890` enquanto não chegasse o 11º dígito — a pontuação
     * dançaria na frente de quem digita.
     */
    expect(mascararTelefone('4735218890')).toBe('(47) 3521-8890');
    expect(mascararTelefone('47935218890')).toBe('(47) 93521-8890');
  });

  it('mantém o parêntese ABERTO enquanto o DDD é o que existe', () => {
    /*
     * `(47` e não `(47)`. Fechar o parêntese antes do terceiro dígito colocaria
     * um caractere à direita do cursor, e a próxima tecla o empurraria — a
     * pontuação andaria sozinha na frente de quem digita.
     */
    expect(mascararTelefone('4')).toBe('(4');
    expect(mascararTelefone('47')).toBe('(47');
    expect(mascararTelefone('473')).toBe('(47) 3');
    expect(mascararTelefone('')).toBe('');
  });

  it('respeita o limite de 11 dígitos', () => {
    expect(mascararTelefone('4793521889012345')).toBe('(47) 93521-8890');
  });
});

describe('mascararCep', () => {
  it('formata com o hífen no quinto dígito', () => {
    expect(mascararCep('89010')).toBe('89010');
    expect(mascararCep('89010250')).toBe('89010-250');
  });

  it('respeita o limite de 8 dígitos e o VarChar(9)', () => {
    expect(mascararCep('890102501234')).toBe('89010-250');
    expect(mascararCep('89010250')).toHaveLength(9);
  });

  it('é estável ao reaplicar', () => {
    expect(mascararCep('89010-250')).toBe('89010-250');
  });
});
