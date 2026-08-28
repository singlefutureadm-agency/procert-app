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
 * A URL usada no build sai de `urlDeMigracao()`, logo abaixo: a `DATABASE_URL`
 * da função é o *transaction pooler* (:6543), que o Prisma Migrate não aceita, e
 * a conversão para o *session pooler* (:5432) acontece ali. `MIGRATE_DATABASE_URL`
 * segue existindo como override explícito, para quando o banco de migração não
 * for derivável do banco da função.
 */
const { execFileSync } = require('node:child_process');

const ambiente = process.env.VERCEL_ENV;

if (ambiente !== 'production') {
  console.log(
    `[migrations] VERCEL_ENV=${ambiente ?? '(vazio)'} — nada a aplicar fora de produção.`,
  );
  process.exit(0);
}

/**
 * O Prisma Migrate exige advisory lock, e o pgbouncer em modo transação — o
 * *transaction pooler* do Supabase, na :6543 — nunca o concede: o comando não
 * falha, fica pendurado até o teto mais abaixo derrubar o build. O *session
 * pooler* atende na :5432, mesmo host e mesmas credenciais.
 *
 * `MIGRATE_DATABASE_URL` continua sendo o override explícito, e tem precedência.
 * Faltando ela, a porta é corrigida aqui em vez de o deploy reprovar — e a razão
 * é concreta: na Vercel a `DATABASE_URL` é uma variável do tipo **Secret**, ou
 * seja, write-only. Não sai no dashboard, nem no `vercel env pull`, nem na API.
 * Ninguém consegue ler a senha para montar a segunda URL à mão. Exigir uma
 * variável que só quem guardou a senha fora do sistema consegue preencher é
 * exigir um passo manual — e foi exatamente esse passo que reprovou quatro
 * deploys de produção seguidos, de 26/08/2026 em diante, enquanto a API servia
 * código de dois dias antes.
 *
 * A troca é feita por `URL`, não por regex, pelo mesmo motivo registrado no
 * `catch` lá embaixo: a senha entra entre `:` e `@`, e uma que contenha dígitos
 * seguidos de barra faria um padrão ingênuo trocar o trecho errado.
 */
const PORTA_TRANSACAO = '6543';
const PORTA_SESSAO = '5432';

const urlDeMigracao = () => {
  if (process.env.MIGRATE_DATABASE_URL) {
    return { url: process.env.MIGRATE_DATABASE_URL, origem: 'MIGRATE_DATABASE_URL' };
  }

  const daFuncao = process.env.DATABASE_URL;
  if (!daFuncao) return {};

  let endereco;
  try {
    endereco = new URL(daFuncao);
  } catch {
    // URL malformada é assunto do Prisma, que tem a mensagem boa para isso.
    // Passa intacta em vez de virar um erro pior aqui.
    return { url: daFuncao, origem: 'DATABASE_URL' };
  }

  if (endereco.port !== PORTA_TRANSACAO) {
    return { url: daFuncao, origem: 'DATABASE_URL' };
  }

  endereco.port = PORTA_SESSAO;
  // Ajustes que só fazem sentido do outro lado: `pgbouncer=true` desliga
  // prepared statements no Prisma, e `connection_limit=1` dimensiona a função
  // serverless — não um comando único que roda no build e termina.
  endereco.searchParams.delete('pgbouncer');
  endereco.searchParams.delete('connection_limit');

  return {
    url: endereco.toString(),
    origem: `DATABASE_URL, com a porta :${PORTA_TRANSACAO} trocada por :${PORTA_SESSAO}`,
  };
};

const { url, origem } = urlDeMigracao();

if (!url) {
  console.error(
    '[migrations] Nem MIGRATE_DATABASE_URL nem DATABASE_URL estão definidas no build.',
  );
  process.exit(1);
}

// Só a procedência, nunca a URL: ela carrega a senha, e o log do build da Vercel
// fica visível para todo mundo que abre o deploy.
console.log(`[migrations] origem da URL: ${origem}.`);

// O CLI é invocado por caminho, não por `npx`: no Windows o `npx.cmd` só sobe
// com `shell: true` (EINVAL desde a correção de execução de `.cmd` do Node), e
// shell aqui significaria interpolar a URL do banco numa linha de comando. Pelo
// caminho, o mesmo script roda no build da Vercel e na máquina de quem depurar.
const prismaCli = require.resolve('prisma/' + require('prisma/package.json').bin.prisma);
const ambienteDoComando = { ...process.env, DATABASE_URL: url };

/**
 * Cinco minutos, e o número não é chute: `migrate deploy` sadio termina em
 * segundos, e o que passa disso não está lento — está pendurado.
 *
 * Foi medido no primeiro deploy com este script, em 26/08/2026. Apontado para o
 * *transaction pooler* (:6543) por falta da `MIGRATE_DATABASE_URL`, o comando
 * **não falhou**: ficou esperando o advisory lock que o pgbouncer em modo
 * transação nunca concede, e o build seguiu de pé até ser cancelado à mão. Sem
 * teto, a URL errada não reprova o deploy — ela ocupa o pipeline.
 */
const TEMPO_LIMITE_MS = 5 * 60 * 1000;

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
      timeout: TEMPO_LIMITE_MS,
    });
  } catch (erro) {
    // `SIGTERM` aqui é o timeout acima, não uma falha do Prisma — e o Prisma não
    // terá impresso erro nenhum, porque do ponto de vista dele nada deu errado.
    // Sem esta linha o log mostraria só "falhou", e a suspeita cairia sobre a
    // migration em vez de sobre a URL.
    if (erro && erro.signal === 'SIGTERM') {
      // Por `URL`, não por regex: a senha entra na string entre `:` e `@`, e uma
      // que contenha dígitos seguidos de barra faria um padrão ingênuo apontar a
      // porta errada — bem no log de que alguém depende para achar o problema.
      let porta;
      try {
        porta = new URL(url).port;
      } catch {
        porta = undefined;
      }
      console.error(
        `[migrations] ${rotulo} passou de ${TEMPO_LIMITE_MS / 60000} min sem responder — deploy interrompido.`,
      );
      console.error(
        porta === PORTA_TRANSACAO
          ? `[migrations] A URL usada é a do transaction pooler (:${PORTA_TRANSACAO}), que não concede o advisory lock do Prisma Migrate. Como a conversão automática só age sobre a DATABASE_URL, chegar aqui significa que MIGRATE_DATABASE_URL está definida e aponta para a porta errada — corrija-a para :${PORTA_SESSAO} ou remova-a.`
          : `[migrations] A porta é :${porta ?? '(indeterminada)'}, não a do transaction pooler — o travamento não é o do advisory lock. Confira se o banco está no ar e alcançável a partir do build.`,
      );
      process.exit(1);
    }
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

/**
 * `--schema` não é decoração: ao contrário de `migrate deploy`, o `db execute`
 * **não** lê a `DATABASE_URL` do ambiente. Ele exige a datasource explícita, por
 * `--url` ou `--schema`, e sem uma das duas aborta com "Either --url or --schema
 * must be provided" antes de tocar no banco.
 *
 * Entre as duas, `--schema`: o schema declara `url = env("DATABASE_URL")`, e o
 * `ambienteDoComando` acima já injeta ali a URL convertida. Por `--url` a mesma
 * string iria para o `argv` do processo — visível em qualquer listagem de
 * processos, com a senha dentro. Nada obriga o segredo a sair do ambiente.
 *
 * Este passo esteve quebrado desde que foi escrito, e ninguém tinha como saber:
 * o `migrate deploy` logo acima pendurava por 5 min contra o transaction pooler
 * e derrubava o build antes daqui. Consertada a porta, o segundo erro apareceu
 * no primeiro build que chegou a este ponto.
 */
console.log('[migrations] garantindo RLS nas tabelas de public…');
prisma(
  'habilitar RLS',
  ['db', 'execute', '--stdin', '--schema', require('node:path').join(__dirname, 'schema.prisma')],
  habilitarRls,
);

console.log('[migrations] ok.');
