import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Descobre migrations que estão no repositório e ainda não foram aplicadas ao
 * banco local.
 *
 * Existe pelo mesmo motivo que `prisma/migrar-no-deploy.js`, e é o par dele do
 * lado de cá: um `git pull` traz migrations e não dispara nada. O banco fica uma
 * versão atrás do código e a API sobe normalmente — o erro só aparece na
 * primeira query que toca a coluna nova, como `P2022`, acusando o código.
 *
 * A comparação é a mesma que o Prisma faz: nome de pasta em `prisma/migrations`
 * contra `migration_name` na tabela `_prisma_migrations`. Não se usa
 * `prisma migrate status` aqui porque seria subir um processo do CLI a cada boot
 * — em `--watch`, a cada arquivo salvo.
 */

/** Nome da tabela de controle do Prisma Migrate. */
const TABELA_DE_CONTROLE = '_prisma_migrations';

/** Código do Postgres para "relação não existe" — banco ainda sem migration. */
const RELACAO_NAO_EXISTE = '42P01';

/**
 * Nomes das migrations versionadas, em ordem. São os diretórios de
 * `prisma/migrations`; `migration_lock.toml` é arquivo e fica de fora sozinho.
 *
 * Diretório ausente devolve lista vazia em vez de lançar: é o caso de rodar a
 * API a partir de um `dist/` empacotado, onde `prisma/` não foi junto, e ali não
 * há nada a conferir.
 */
export const migrationsNoDisco = (diretorio: string): string[] => {
  if (!existsSync(diretorio)) return [];

  return readdirSync(diretorio, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
};

/**
 * Migrations que o banco considera aplicadas.
 *
 * `finished_at IS NOT NULL` porque uma migration interrompida no meio deixa a
 * linha criada e inacabada — contá-la como aplicada esconderia exatamente o
 * estado que mais precisa aparecer. `rolled_back_at IS NULL` pela mesma razão.
 *
 * Tabela inexistente não é erro: é um banco em que nenhuma migration rodou
 * ainda, e a resposta certa é "nenhuma aplicada", não uma exceção no boot.
 */
export const migrationsAplicadas = async (
  consultar: (sql: string) => Promise<Array<{ migration_name: string }>>,
): Promise<string[]> => {
  try {
    const linhas = await consultar(
      `select migration_name from "${TABELA_DE_CONTROLE}" ` +
        `where finished_at is not null and rolled_back_at is null`,
    );
    return linhas.map((linha) => linha.migration_name);
  } catch (erro) {
    if (ehTabelaInexistente(erro)) return [];
    throw erro;
  }
};

/**
 * O código do Postgres chega em lugares diferentes conforme o caminho do
 * Prisma: `meta.code` no erro conhecido (`P2010`), `code` no erro cru do driver.
 * Conferir os dois evita que um banco vazio derrube o boot por engano — que
 * seria o oposto do que esta guarda existe para fazer.
 */
const ehTabelaInexistente = (erro: unknown): boolean => {
  if (typeof erro !== 'object' || erro === null) return false;
  const possivel = erro as { code?: unknown; meta?: { code?: unknown } };
  return (
    possivel.code === RELACAO_NAO_EXISTE || possivel.meta?.code === RELACAO_NAO_EXISTE
  );
};

/**
 * O que está no disco e não está no banco, preservando a ordem do disco — que é
 * a ordem cronológica em que o Prisma as aplicaria.
 *
 * Só esta direção. O contrário (aplicada no banco, ausente do disco) acontece
 * ao trocar de branch para trás e **não** é problema para quem está
 * desenvolvendo: o banco tem uma coluna a mais que o código ignora. Reclamar
 * disso transformaria a guarda em ruído em todo `git checkout`.
 */
export const compararMigrations = (noDisco: string[], aplicadas: string[]): string[] => {
  const jaAplicadas = new Set(aplicadas);
  return noDisco.filter((nome) => !jaAplicadas.has(nome));
};

/** Caminho padrão das migrations a partir de onde os scripts npm rodam. */
export const diretorioDeMigrations = (): string =>
  join(process.cwd(), 'prisma', 'migrations');
