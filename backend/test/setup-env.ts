import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carrega `.env.test` antes de qualquer import do Nest.
 *
 * Roda como `setupFiles` — ou seja, dentro de cada worker, antes do módulo de
 * teste. O `globalSetup` também carrega, mas só no processo principal; repetir
 * aqui torna a suíte independente da herança de `process.env` entre processos.
 *
 * `override: true` porque o `.env` de desenvolvimento pode já estar no ambiente
 * do shell — e apontar o e2e para o banco de desenvolvimento apagaria os dados
 * dele no primeiro `TRUNCATE`.
 */
const caminho = resolve(__dirname, '..', '.env.test');

if (!existsSync(caminho)) {
  throw new Error(
    `Não encontrei ${caminho}. Copie backend/.env.test.example para ` +
      'backend/.env.test antes de rodar o e2e (ele não é versionado).',
  );
}

config({ path: caminho, override: true });

/**
 * Trava de segurança. A suíte TRUNCA as tabelas entre arquivos: se o
 * `DATABASE_URL` apontar para o banco de desenvolvimento — ou pior, o de
 * produção —, a primeira execução apaga tudo. Preferimos falhar aqui.
 */
const url = process.env.DATABASE_URL ?? '';
const nomeDoBanco = url.split('/').pop()?.split('?')[0] ?? '';

if (!/_test$/.test(nomeDoBanco)) {
  throw new Error(
    `O e2e trunca as tabelas e só roda contra um banco cujo nome termina em ` +
      `"_test". DATABASE_URL aponta para "${nomeDoBanco || '(vazio)'}". ` +
      'Ajuste backend/.env.test.',
  );
}
