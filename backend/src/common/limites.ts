import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
/** Limite das janelas nomeadas fora das rotas que as ajustam: não limita. */
const SEM_LIMITE = Number.MAX_SAFE_INTEGER;

/** E-mail do corpo, normalizado — `Admin@X.com` e `admin@x.com` são a mesma conta. */
export function emailDoCorpo(requisicao: Record<string, unknown>): string | null {
  const corpo = requisicao.body as { email?: unknown } | undefined;
  const email = corpo?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}

/**
 * As três janelas do rate limit, declaradas no `ThrottlerModule`.
 *
 * - `default` — por IP, 120/min em toda rota. Só funciona com o IP real do
 *   cliente: ver `TRUST_PROXY` em `bootstrap.ts`. Sem ele, todos os visitantes
 *   chegam com o IP do nginx e dividem o mesmo balde — 10 tentativas de login
 *   de um robô travavam o login do site inteiro por um minuto.
 * - `hora` — por IP, janela de 1 h. Só as rotas públicas a apertam: 5/min
 *   ainda são 7.200 envios por dia de um mesmo IP.
 * - `email` — pela conta-alvo, não por quem pede. É o que segura o ataque
 *   distribuído (muitos IPs contra uma conta) e o bombardeio de e-mails de
 *   redefinição na caixa de uma vítima, que o limite por IP não vê.
 *
 * Fora das rotas que as ajustam (`LIMITES`), `hora` e `email` não limitam.
 */
export const JANELAS: ThrottlerOptions[] = [
  { name: 'default', ttl: MINUTO, limit: 120 },
  { name: 'hora', ttl: HORA, limit: SEM_LIMITE },
  {
    name: 'email',
    ttl: 15 * MINUTO,
    limit: SEM_LIMITE,
    getTracker: (requisicao) => emailDoCorpo(requisicao) ?? '',
    skipIf: (contexto: ExecutionContext) =>
      emailDoCorpo(contexto.switchToHttp().getRequest()) === null,
  },
];

/** Limites das rotas sensíveis, para o `@Throttle(...)` de cada uma. */
export const LIMITES = {
  login: {
    default: { limit: 10, ttl: MINUTO },
    hora: { limit: 60, ttl: HORA },
    // Uma conta aceita 10 tentativas a cada 15 min, venham de onde vierem.
    email: { limit: 10, ttl: 15 * MINUTO },
  },
  esqueciSenha: {
    default: { limit: 5, ttl: MINUTO },
    hora: { limit: 20, ttl: HORA },
    // Três e-mails de redefinição por hora para a mesma caixa, no máximo.
    email: { limit: 3, ttl: HORA },
  },
  redefinirSenha: {
    default: { limit: 5, ttl: MINUTO },
    hora: { limit: 20, ttl: HORA },
  },
  alterarSenha: {
    default: { limit: 5, ttl: MINUTO },
  },
  contato: {
    default: { limit: 5, ttl: MINUTO },
    hora: { limit: 20, ttl: HORA },
  },
};
