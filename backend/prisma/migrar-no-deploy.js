/**
 * Aplica as migrations pendentes durante o build da Vercel.
 *
 * Existe por causa de um incidente: em 26/08/2026 o login em produção passou a
 * devolver 500 com `P2022 — a coluna funcionarios.ultimo_acesso_em não existe`.
 * O código dos PRs #16, #17 e #20 tinha subido; o schema do banco, não. O
 * `vercel-build` era `prisma generate && nest build`, e a migration era um passo
 * manual da máquina do dev (DEPLOY.md §5) — um passo que ninguém lembra de dar
 * três PRs seguidos. Deploy que publica código novo contra schema velho é
 * quebra garantida, e nada no caminho reprovava.
 *
 * Três guardas, e nenhuma delas é zelo excessivo:
 *
 * 1. **Só em produção.** Preview de PR compartilha a `DATABASE_URL` do projeto:
 *    sem esta guarda, abrir um PR com migration a aplicaria em produção antes
 *    da revisão. `VERCEL_ENV` é a Vercel quem define, não dá para errar.
 *
 * 2. **Falha derruba o build.** Migration que não aplicou não pode virar aviso
 *    no log — é exatamente assim que se chega ao 500 de novo, só que agora com
 *    a automação servindo de álibi.
 *
 * 3. **RLS depois do migrate.** O `migrate deploy` não conhece RLS, e no schema
 *    `public` o padrão do Postgres é desligado — o que no Supabase significa
 *    aberto para os roles `anon`/`authenticated` do PostgREST (DEPLOY.md §5:
 *    foi assim que `funcionarios.senha_hash` ficou legível com a chave anônima
 *    até 24/08/2026). Enquanto a migration era manual, quem religava o RLS era
 *    o humano lendo o documento. Automatizada, tabela nova nasceria exposta e
 *    ninguém olharia. O `DO` abaixo é idempotente e roda a cada deploy.
 *
 * `MIGRATE_DATABASE_URL` é o escape para quando a `DATABASE_URL` da função é o
 * *transaction pooler* (:6543), que o Prisma Migrate não aceita — ele precisa de
 * advisory lock, e o pgbouncer em modo transação não o mantém entre statements.
 * Configure-a com o *session pooler* (:5432) e o build usa essa.
 */
const { execFileSync } = require('node:child_process');

const ambiente = process.env.VERCEL_ENV;

if (ambiente !== 'production') {
  console.log(
    `[migrations] VERCEL_ENV=${ambiente ?? '(vazio)'} — nada a aplicar fora de produção.`,
  );
  process.exit(0);
}

const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  console.error(
    '[migrations] Nem MIGRATE_DATABASE_URL nem DATABASE_URL estão definidas no build.',
  );
  process.exit(1);
}

// O CLI é invocado por caminho, não por `npx`: no Windows o `npx.cmd` só sobe
// com `shell: true` (EINVAL desde a correção de execução de `.cmd` do Node), e
// shell aqui significaria interpolar a URL do banco numa linha de comando. Pelo
// caminho, o mesmo script roda no build da Vercel e na máquina de quem depurar.
const prismaCli = require.resolve('prisma/' + require('prisma/package.json').bin.prisma);
const ambienteDoComando = { ...process.env, DATABASE_URL: url };

/**
 * O `catch` não engole a falha — ele troca o stack de `execFileSync` por uma
 * linha legível e mantém o código de saída. No log do build da Vercel o rastro
 * do `child_process` empurra para cima a mensagem do Prisma, que é a única
 * informação útil quando um deploy reprova aqui.
 */
const prisma = (rotulo, argumentos, entrada) => {
  try {
    execFileSync(process.execPath, [prismaCli, ...argumentos], {
      stdio: entrada === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
      input: entrada,
      env: ambienteDoComando,
    });
  } catch {
    console.error(`[migrations] ${rotulo} falhou — deploy interrompido.`);
    process.exit(1);
  }
};

console.log('[migrations] prisma migrate deploy…');
prisma('migrate deploy', ['migrate', 'deploy']);

// Religa o RLS em tudo que a migration acabou de criar. Sem policy alguma: a API
// conecta como `postgres`, dono das tabelas, e o dono ignora RLS — policy só
// devolveria o acesso que se quer fechar.
const habilitarRls = `do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;`;

console.log('[migrations] garantindo RLS nas tabelas de public…');
prisma('habilitar RLS', ['db', 'execute', '--stdin'], habilitarRls);

console.log('[migrations] ok.');
