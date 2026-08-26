import { beforeEach, describe, expect, it } from 'vitest';

import {
  checarContrastes,
  logoDoTema,
  propriedadesDoTema,
  razaoDeContraste,
  resolverModo,
} from './tema';
import { tokens } from '@/testing/tokens.fixture';
import type { Aparencia } from '@/types';

/**
 * `lib/tema.ts` é o alvo nº 1 da suíte porque **quebra em silêncio**: nada aqui
 * lança exceção. Um token fora do `MAPA_CSS` simplesmente não é escrito, e o
 * painel continua funcionando com a cor errada — ninguém vê stack trace, e o
 * bug chega ao cliente como "achei o tema estranho".
 */

function aparencia(sobrescreve: Partial<Aparencia> = {}): Aparencia {
  return {
    temaPadrao: 'ESCURO',
    permitirAlternancia: true,
    logoTemaClaroUrl: null,
    logoTemaEscuroUrl: null,
    papelParedeUrl: null,
    tokens: tokens(),
    ...sobrescreve,
  } as unknown as Aparencia;
}

describe('propriedadesDoTema', () => {
  it('mapeia TODO token para uma custom property', () => {
    const props = propriedadesDoTema(tokens());

    /*
     * A asserção é sobre a contagem, não sobre alguns nomes: token novo em
     * `TokensTema` sem entrada no `MAPA_CSS` some da saída sem erro nenhum, e
     * um teste que checa só os que já existem nunca pegaria isso.
     */
    const chavesDeToken = Object.keys(tokens()).length;
    const derivados = ['--fundo-gradiente', '--vidro-sombra'];

    expect(Object.keys(props)).toHaveLength(chavesDeToken + derivados.length);
    for (const derivado of derivados) expect(props).toHaveProperty(derivado);
  });

  it('converte os tokens numéricos para px, e só eles', () => {
    const props = propriedadesDoTema(tokens({ raio: 16, vidroBlur: 14 }));

    // Sem o `px` o CSS descarta a declaração inteira e o valor vira o default.
    expect(props['--raio']).toBe('16px');
    expect(props['--vidro-blur']).toBe('14px');
    expect(props['--cor-primaria']).toBe('#0d6efd');
  });

  it('compõe os derivados que o container isolado não recalcula', () => {
    const props = propriedadesDoTema(tokens());

    /*
     * Dentro da prévia da tela de Aparência o `:root` não é reavaliado, então
     * o gradiente e a sombra precisam vir prontos — senão a prévia mostra a
     * sombra do tema EM USO em vez da do tema sendo editado.
     */
    expect(props['--fundo-gradiente']).toContain('rgba(13,110,253,0.25)');
    expect(props['--vidro-sombra']).toContain('rgba(0,0,0,0.45)');
  });
});

describe('logoDoTema', () => {
  it('usa a variante do tema pedido', () => {
    const a = aparencia({
      logoTemaClaroUrl: '/uploads/aparencia/clara.png',
      logoTemaEscuroUrl: '/uploads/aparencia/escura.png',
    });

    expect(logoDoTema(a, 'CLARO')).toBe('/uploads/aparencia/clara.png');
    expect(logoDoTema(a, 'ESCURO')).toBe('/uploads/aparencia/escura.png');
  });

  it('cai para a outra variante quando falta a do tema — nos DOIS sentidos', () => {
    // Quem enviou uma logo só continua com marca nos dois modos.
    const soClara = aparencia({ logoTemaClaroUrl: '/clara.png' });
    const soEscura = aparencia({ logoTemaEscuroUrl: '/escura.png' });

    expect(logoDoTema(soClara, 'ESCURO')).toBe('/clara.png');
    expect(logoDoTema(soEscura, 'CLARO')).toBe('/escura.png');
  });

  it('devolve null sem logo nenhuma e sem aparência', () => {
    expect(logoDoTema(aparencia(), 'CLARO')).toBeNull();
    expect(logoDoTema(null, 'CLARO')).toBeNull();
    expect(logoDoTema(undefined, 'ESCURO')).toBeNull();
  });
});

describe('resolverModo', () => {
  beforeEach(() => localStorage.clear());

  it('ignora a preferência local quando o admin desliga a alternância', () => {
    localStorage.setItem('procert:tema-modo', 'CLARO');

    const resolvido = resolverModo(
      aparencia({ permitirAlternancia: false, temaPadrao: 'ESCURO' }),
    );

    // Senão a trava do admin não teria efeito para quem já alternou uma vez.
    expect(resolvido).toBe('ESCURO');
  });

  it('respeita a preferência local quando a alternância está ligada', () => {
    localStorage.setItem('procert:tema-modo', 'CLARO');
    expect(resolverModo(aparencia({ temaPadrao: 'ESCURO' }))).toBe('CLARO');
  });

  it('usa o padrão do admin quando não há preferência local', () => {
    expect(resolverModo(aparencia({ temaPadrao: 'CLARO' }))).toBe('CLARO');
  });

  it('ignora lixo no localStorage em vez de propagá-lo como modo', () => {
    localStorage.setItem('procert:tema-modo', 'ROXO');
    expect(resolverModo(aparencia({ temaPadrao: 'ESCURO' }))).toBe('ESCURO');
  });
});

describe('razaoDeContraste', () => {
  it('devolve 21 para o par de máximo contraste', () => {
    expect(razaoDeContraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('devolve 1 para cores iguais', () => {
    expect(razaoDeContraste('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('achata o fundo translúcido sobre a base antes de medir', () => {
    /*
     * Sem achatar, um vidro `rgba(255,255,255,0.06)` seria tratado como branco
     * opaco e a razão sairia altíssima — a tela aprovaria um par ilegível.
     */
    const semBase = razaoDeContraste('#f8fafc', 'rgba(255,255,255,0.06)');
    const comBase = razaoDeContraste(
      '#f8fafc',
      'rgba(255,255,255,0.06)',
      '#0b1020',
    );

    expect(comBase).not.toBeNull();
    expect(comBase).not.toBeCloseTo(semBase as number, 1);
    // Texto claro sobre vidro quase transparente em fundo escuro: continua legível.
    expect(comBase as number).toBeGreaterThan(4.5);
  });

  it('devolve null para cor não interpretável, em vez de inventar número', () => {
    expect(razaoDeContraste('não-é-cor', '#ffffff')).toBeNull();
    expect(razaoDeContraste('#ffffff', 'nem-essa')).toBeNull();
  });
});

describe('checarContrastes', () => {
  it('aprova uma paleta legível', () => {
    const checagens = checarContrastes(tokens());

    expect(checagens.length).toBeGreaterThan(0);
    for (const c of checagens) {
      expect(c.razao).not.toBeNull();
      expect(c.passa).toBe(true);
    }
  });

  it('reprova o par ilegível SEM lançar — a tela avisa, não bloqueia', () => {
    // Texto cinza-claro sobre fundo branco: o caso clássico.
    const checagens = checarContrastes(
      tokens({ fundo: '#ffffff', texto: '#eeeeee' }),
    );

    const reprovado = checagens.find((c) => c.passa === false);
    expect(reprovado).toBeDefined();
    expect(reprovado?.razao).toBeLessThan(reprovado?.minimo as number);
  });

  it('cada checagem traz rótulo e mínimo, para a UI não adivinhar a regra', () => {
    for (const c of checarContrastes(tokens())) {
      expect(c.rotulo).toBeTruthy();
      expect(c.minimo).toBeGreaterThan(0);
    }
  });
});
