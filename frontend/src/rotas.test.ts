import type { RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { router } from '@/router';
import { ROTAS_PUBLICAS } from '@/rotas-publicas';
import nginx from '../nginx.conf?raw';
import vercel from '../vercel.json';

/**
 * As rotas do painel só abrem num recarregamento porque o servidor as manda
 * para o `app.html` — o resto do site é arquivo pré-renderizado, e URL
 * desconhecida recebe 404. A lista de prefixos vive em dois lugares fora do
 * código (vercel.json e nginx.conf); rota nova que ficar de fora funciona ao
 * navegar pelo menu e quebra no F5, ou num link compartilhado. Ninguém nota
 * até alguém reclamar.
 */

function primeirosSegmentos(rotas: RouteObject[]): string[] {
  return rotas.flatMap((rota) => [
    ...(rota.path ? [rota.path.replace(/^\//, '').split('/')[0]] : []),
    ...primeirosSegmentos(rota.children ?? []),
  ]);
}

const publicas = new Set(ROTAS_PUBLICAS.map((rota) => rota.path.replace(/^\//, '')));
const doPainel = [
  ...new Set(primeirosSegmentos(router.routes).filter((s) => s !== '*' && !publicas.has(s))),
];

function prefixosDe(padrao: string): string[] {
  const grupo = /\^?\/\(([^)]+)\)/.exec(padrao);
  if (!grupo) throw new Error(`padrão sem grupo de prefixos: ${padrao}`);
  return grupo[1].split('|');
}

describe('rotas do painel no servidor', () => {
  it('encontra rotas do painel no router (sanidade do próprio teste)', () => {
    expect(doPainel).toContain('dashboard');
    expect(doPainel).toContain('login');
  });

  it('todo rewrite do vercel.json cobre as mesmas rotas', () => {
    for (const regra of vercel.rewrites) {
      expect(prefixosDe(regra.source).sort()).toEqual([...doPainel].sort());
    }
  });

  it('o nginx.conf cobre as mesmas rotas', () => {
    const local = /location ~ (\^\/\([^)]+\))/.exec(nginx);
    expect(local).not.toBeNull();
    expect(prefixosDe(local![1]).sort()).toEqual([...doPainel].sort());
  });
});
