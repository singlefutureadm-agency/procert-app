import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  diasAteOPrazo,
  formatarData,
  formatarDataHora,
  formatarPrazoSla,
  formatarTamanho,
  formatarUltimoAcesso,
  mascararDocumento,
  paraInputDate,
} from './formatadores';

describe('formatarData / formatarDataHora', () => {
  it('devolve travessão para nulo e indefinido', () => {
    // Célula vazia no meio de uma tabela desloca a leitura da linha.
    expect(formatarData(null)).toBe('—');
    expect(formatarData(undefined)).toBe('—');
    expect(formatarDataHora(null)).toBe('—');
  });

  it('formata em pt-BR', () => {
    expect(formatarData('2026-03-15T12:00:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(formatarDataHora('2026-03-15T12:00:00Z')).toMatch(
      /^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/,
    );
  });
});

describe('formatarUltimoAcesso', () => {
  it('diz "Nunca acessou" no nulo, e NÃO travessão', () => {
    /*
     * Aqui o vazio não é "sem dado", é "nunca entrou" — que é exatamente a
     * informação que se foi buscar na coluna. Um travessão a esconderia junto
     * com os campos genuinamente ausentes.
     */
    expect(formatarUltimoAcesso(null)).toBe('Nunca acessou');
    expect(formatarUltimoAcesso(undefined)).toBe('Nunca acessou');
  });

  it('formata a data quando há acesso', () => {
    expect(formatarUltimoAcesso('2026-03-15T12:00:00Z')).toMatch(
      /^\d{2}\/\d{2}\/\d{4}/,
    );
  });
});

describe('paraInputDate', () => {
  it('devolve YYYY-MM-DD, que é o que o input type=date aceita', () => {
    expect(paraInputDate('2026-03-15T12:00:00Z')).toBe('2026-03-15');
  });

  it('devolve string vazia para nulo — o input rejeita null', () => {
    expect(paraInputDate(null)).toBe('');
    expect(paraInputDate(undefined)).toBe('');
  });
});

describe('diasAteOPrazo', () => {
  afterEach(() => vi.useRealTimers());

  /**
   * Data no fuso LOCAL, em ISO.
   *
   * `diasAteOPrazo` compara `getFullYear/getMonth/getDate`, que são locais — e
   * `formatarData` também. Os dois são coerentes entre si, mas um teste escrito
   * com meia-noite **UTC** erra por um dia em qualquer fuso negativo: no Brasil
   * `2026-03-15T00:00:00Z` é 14/03 às 21h. O helper evita fixar o resultado ao
   * fuso de quem roda a suíte.
   */
  function localIso(ano: number, mes: number, dia: number, hora = 0): string {
    return new Date(ano, mes - 1, dia, hora).toISOString();
  }

  it('compara por DIA, não por instante', () => {
    /*
     * Um prazo que vence hoje às 00h não pode contar como vencido às 15h. Se a
     * comparação fosse por instante, a NC apareceria como atrasada durante o
     * próprio dia em que ainda pode ser respondida.
     */
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 15));

    expect(diasAteOPrazo(localIso(2026, 3, 15))).toBe(0);
    expect(diasAteOPrazo(localIso(2026, 3, 18))).toBe(3);
  });

  it('devolve negativo quando já venceu', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 10));

    expect(diasAteOPrazo(localIso(2026, 3, 10))).toBe(-5);
  });

  it('devolve null sem prazo — NC sem prazo não está atrasada', () => {
    expect(diasAteOPrazo(null)).toBeNull();
    expect(diasAteOPrazo(undefined)).toBeNull();
  });
});

describe('formatarTamanho', () => {
  it('troca de unidade em 1024, não em 1000', () => {
    expect(formatarTamanho(512)).toBe('512 B');
    expect(formatarTamanho(1023)).toBe('1023 B');
    expect(formatarTamanho(1024)).toBe('1 KB');
    expect(formatarTamanho(1024 * 1024)).toBe('1.0 MB');
  });

  it('lida com zero', () => {
    expect(formatarTamanho(0)).toBe('0 B');
  });
});

/**
 * O prazo de SLA passou de dias para horas em 05/09/2026, e o defeito que essa
 * troca produz é silencioso por construção: a tela continua renderizando um
 * número com um sufixo, e "30 dia(s)" vira "720 dia(s)" sem erro, sem stack
 * trace e sem nada que um teste manual perceba — quem lê acredita.
 */
describe('formatarPrazoSla', () => {
  it('devolve travessão para nulo e indefinido', () => {
    expect(formatarPrazoSla(null)).toBe('—');
    expect(formatarPrazoSla(undefined)).toBe('—');
  });

  it('usa a hora crua até 48h — é a unidade em que a operação fala', () => {
    expect(formatarPrazoSla(8)).toBe('8h');
    expect(formatarPrazoSla(24)).toBe('24h');
    expect(formatarPrazoSla(48)).toBe('48h');
  });

  it('acrescenta a escala em dias acima de 48h', () => {
    // O caso que motivou a função: 720h é verdadeiro e ilegível sozinho.
    expect(formatarPrazoSla(72)).toBe('72h (3 dias)');
    expect(formatarPrazoSla(720)).toBe('720h (30 dias)');
  });

  it('não escreve "30,0 dias" quando fecha em dia cheio', () => {
    expect(formatarPrazoSla(240)).toBe('240h (10 dias)');
  });

  it('usa uma casa decimal com vírgula quando não fecha', () => {
    // pt-BR: separador decimal é vírgula. Ponto aqui lê como milhar.
    expect(formatarPrazoSla(60)).toBe('60h (2,5 dias)');
  });

  it('cobre as duas pontas da faixa aceita pelo backend', () => {
    // 49h é o primeiro valor acima do corte; 8760h é o teto do DTO (um ano).
    expect(formatarPrazoSla(49)).toBe('49h (2,0 dias)');
    expect(formatarPrazoSla(8760)).toBe('8760h (365 dias)');
  });

  it('trata zero como ausência de prazo, não como "0h"', () => {
    // O backend recusa 0 (@Min(1)), mas a tela não pode inventar "0h" se vier.
    expect(formatarPrazoSla(0)).toBe('0h');
  });
});

describe('mascararDocumento', () => {
  it('prefere o CNPJ quando os dois existem', () => {
    // A pessoa jurídica é o caso dominante; mostrar o CPF do sócio seria errado.
    expect(mascararDocumento('123.456.789-01', '12.345.678/0001-90')).toBe(
      '12.345.678/0001-90',
    );
  });

  it('cai para o CPF e depois para o travessão', () => {
    expect(mascararDocumento('123.456.789-01', null)).toBe('123.456.789-01');
    expect(mascararDocumento(null, null)).toBe('—');
    expect(mascararDocumento(undefined, undefined)).toBe('—');
  });
});
