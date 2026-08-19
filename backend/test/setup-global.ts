import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..');

/**
 * Prepara o banco dedicado do e2e, uma vez por execução.
 *
 * `prisma migrate deploy` cria o banco se ele ainda não existir e aplica todas
 * as migrations — é o mesmo comando do ambiente real, então o schema sob teste
 * é o schema de produção, não um `db push` improvisado.
 *
 * A carga de dados NÃO acontece aqui: cada arquivo de teste monta o próprio
 * cenário com `prepararCenario()`, que trunca antes de inserir. Um seed global
 * criaria dependência entre arquivos.
 */
export default function preparar(): void {
  config({ path: resolve(RAIZ, '.env.test'), override: true });

  const banco = (process.env.DATABASE_URL ?? '').split('/').pop() ?? '';
  if (!/^[^?]*_test(\?|$)/.test(banco)) {
    throw new Error(
      'globalSetup abortado: DATABASE_URL do e2e precisa apontar para um banco ' +
        `terminado em "_test" (recebi "${banco}").`,
    );
  }

  // Chama o CLI do Prisma pelo próprio Node, e não por `npx`: no Windows o
  // `execFileSync` não executa `.cmd` sem `shell: true`, e ligar o shell traria
  // de volta o problema de quoting em caminhos com espaço.
  execFileSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: RAIZ, env: process.env, stdio: 'inherit' },
  );
}
