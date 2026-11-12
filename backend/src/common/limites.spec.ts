import type { ExecutionContext } from '@nestjs/common';

import { emailDoCorpo, JANELAS, LIMITES } from './limites';

const janelaEmail = JANELAS.find((janela) => janela.name === 'email')!;

function contexto(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

describe('limites — rate limit', () => {
  it('a janela por conta usa o e-mail normalizado como chave', () => {
    // Variar a caixa ou pôr espaço não pode abrir um balde novo para a mesma conta.
    expect(emailDoCorpo({ body: { email: '  Admin@ProCert.com.BR ' } })).toBe(
      'admin@procert.com.br',
    );
    expect(janelaEmail.getTracker!({ body: { email: 'A@B.com' } }, contexto({}))).toBe('a@b.com');
  });

  it('ignora corpo sem e-mail — ou com e-mail que não é texto', () => {
    expect(janelaEmail.skipIf!(contexto({}))).toBe(true);
    expect(janelaEmail.skipIf!(contexto({ email: ['a@b.com'] }))).toBe(true);
    expect(janelaEmail.skipIf!(contexto({ email: 'a@b.com' }))).toBe(false);
  });

  it('as rotas de senha limitam pela conta-alvo, não só pelo IP', () => {
    expect(LIMITES.login.email.limit).toBeLessThanOrEqual(10);
    expect(LIMITES.esqueciSenha.email.limit).toBeLessThanOrEqual(3);
  });
});
