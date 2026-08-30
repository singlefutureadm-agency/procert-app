/**
 * Prepara o ambiente de desenvolvimento — e é para ser rodado SEMPRE, não só no
 * clone.
 *
 * O clone já funcionava: a verificação de onboarding do #27, num clone limpo,
 * passou por todos os passos do README sem tropeçar. O buraco é o outro
 * momento, o que acontece toda semana: **depois de um `git pull`**.
 *
 * Um pull traz `prisma/migrations/` novas e um `schema.prisma` novo, e não
 * dispara nada. O `npm ci` não roda de novo (as dependências não mudaram),
 * então o postinstall que regenera o Prisma Client também não. O resultado é
 * um banco local uma versão atrás do código e um client uma versão atrás do
 * schema — os dois em silêncio. O erro aparece só na primeira query, como
 * `P2022, a coluna X não existe`, apontando para o código, que está certo.
 *
 * É o mesmo defeito que derrubou o login em produção em 26/08/2026 e custou
 * dois dias. Lá ele foi fechado no build (`prisma/migrar-no-deploy.js`); aqui
 * não havia nada equivalente, e a assimetria era gritante: a máquina que
 * ninguém olha ganhou guarda, a que se usa todo dia não.
 *
 * Este script é essa guarda, na forma mais simples que resolve: um comando
 * idempotente que deixa o ambiente coerente com o commit que está no disco.
 * Rodá-lo sem necessidade custa segundos e não muda nada.
 *
 * O que ele NÃO faz, de propósito:
 *
 *  • **não sobrescreve `.env` nem `.env.test`.** Eles carregam ajuste local
 *    (senha de SMTP, outro banco) e são exatamente o que não pode ser
 *    restaurado depois. Faltando, copia do exemplo; existindo, não toca.
 *  • **não roda `migrate dev`.** `migrate dev` compara schema e banco e, ao ver
 *    divergência, OFERECE resetar — apagando o banco de desenvolvimento. Quem
 *    está com pressa aceita. `migrate deploy` só aplica o que está pendente e
 *    não tem esse caminho.
 *  • **não roda `npm ci`.** Ele precisa das dependências para existir: `dotenv`
 *    e o CLI do Prisma saem de `node_modules`. A instalação vem antes, e o
 *    README diz isso.
 */
const { execFileSync } = require('node:child_process');
const { copyFileSync, existsSync } = require('node:fs');
const { connect } = require('node:net');
const { delimiter, join, resolve } = require('node:path');

const raizDoBackend = resolve(__dirname, '..');
const log = (mensagem) => console.log(`[setup] ${mensagem}`);
const erro = (mensagem) => console.error(`[setup] ${mensagem}`);

/**
 * Os dois arquivos de ambiente não versionados. Esquecer o primeiro derruba
 * tudo com "Environment variable not found: DATABASE_URL"; esquecer o segundo
 * reprova o e2e na hora — com a mensagem certa, mas depois de uma suíte inteira
 * de espera.
 */
const ARQUIVOS_DE_AMBIENTE = [
  { destino: '.env', exemplo: '.env.example' },
  { destino: '.env.test', exemplo: '.env.test.example' },
];

const copiarSeFaltar = ({ destino, exemplo }) => {
  const caminhoDestino = join(raizDoBackend, destino);
  if (existsSync(caminhoDestino)) {
    log(`${destino} já existe — mantido como está.`);
    return false;
  }
  copyFileSync(join(raizDoBackend, exemplo), caminhoDestino);
  log(`${destino} criado a partir de ${exemplo}.`);
  return true;
};

/**
 * O banco fora do ar é, de longe, a falha mais comum deste script — e a
 * mensagem do Prisma para ela (`P1001`) nomeia o host, mas não diz o que fazer.
 * Um TCP de 3 s antes de invocar o CLI troca isso por uma instrução.
 *
 * Vale especialmente pela porta: o container é mapeado `5433:5432` para
 * conviver com um PostgreSQL nativo em 5432, e quem tem o nativo instalado
 * recebe uma conexão ACEITA na porta errada, contra um banco que não é este.
 */
const conferirBanco = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return; // Assunto do Prisma, que tem a mensagem boa para isso.

  let endereco;
  try {
    endereco = new URL(url);
  } catch {
    return;
  }

  const host = endereco.hostname;
  const porta = Number(endereco.port || 5432);

  const alcancavel = await new Promise((resolver) => {
    const socket = connect({ host, port: porta });
    const encerrar = (resultado) => {
      socket.destroy();
      resolver(resultado);
    };
    socket.setTimeout(3000);
    socket.once('connect', () => encerrar(true));
    socket.once('timeout', () => encerrar(false));
    socket.once('error', () => encerrar(false));
  });

  if (alcancavel) return;

  erro(`o banco não respondeu em ${host}:${porta}.`);
  erro('Suba o container na RAIZ do repositório e rode de novo:');
  erro('');
  erro('    docker compose up -d');
  erro('');
  erro('A porta esperada é 5433, não 5432 — o container é mapeado 5433:5432');
  erro('para conviver com um PostgreSQL nativo já instalado na máquina.');
  process.exit(1);
};

/**
 * O CLI é invocado por caminho, não por `npx`: no Windows o `npx.cmd` só sobe
 * com `shell: true`, e shell aqui significaria interpolar a URL do banco numa
 * linha de comando. Mesmo motivo — e mesma técnica — de `migrar-no-deploy.js`.
 */
const prismaCli = require.resolve('prisma/' + require('prisma/package.json').bin.prisma);

/**
 * `node_modules/.bin` no PATH do filho — e isto não é zelo, é o que faz o seed
 * rodar. `prisma db seed` executa o comando declarado em `package.json#prisma`
 * (`ts-node prisma/seed.ts`) por shell, contando com o PATH que o **npm** monta
 * ao rodar um script. Invocado por caminho, como aqui, esse PATH não existe e o
 * seed morre com "'ts-node' não é reconhecido como um comando interno ou
 * externo" — em português, no Windows, sem nenhuma pista de que a causa é o
 * PATH e não uma dependência faltando.
 *
 * A chave é procurada sem diferenciar caixa porque no Windows ela vem como
 * `Path`: acrescentar um `PATH` ao objeto criaria duas entradas, e o filho
 * escolheria uma delas sem garantia de qual.
 */
const ambienteDoComando = { ...process.env };
const chaveDoPath =
  Object.keys(ambienteDoComando).find((chave) => chave.toUpperCase() === 'PATH') || 'PATH';
ambienteDoComando[chaveDoPath] = [
  join(raizDoBackend, 'node_modules', '.bin'),
  ambienteDoComando[chaveDoPath] || '',
].join(delimiter);

const rodarPrisma = (rotulo, argumentos) => {
  try {
    execFileSync(process.execPath, [prismaCli, ...argumentos], {
      stdio: 'inherit',
      cwd: raizDoBackend,
      env: ambienteDoComando,
    });
  } catch {
    // Sem stack de `execFileSync`: o que interessa é a mensagem que o Prisma
    // acabou de imprimir logo acima, e o rastro do child_process a empurraria
    // para fora da tela.
    erro(`"${rotulo}" falhou — veja a mensagem acima. Nada mais foi executado.`);
    process.exit(1);
  }
};

const principal = async () => {
  log('preparando o ambiente de desenvolvimento…');

  for (const arquivo of ARQUIVOS_DE_AMBIENTE) copiarSeFaltar(arquivo);

  // Depois da cópia, não antes: numa máquina nova o `.env` acabou de nascer.
  // `quiet` porque a saída deste script é o produto dele: a linha promocional
  // que o dotenv imprime por padrão empurra para cima a mensagem que interessa.
  require('dotenv').config({ path: join(raizDoBackend, '.env'), quiet: true });

  await conferirBanco();

  // A ordem importa: `migrate deploy` põe o banco em dia, `generate` põe o
  // client em dia com o schema, e só então o seed tem um client capaz de
  // escrever nas colunas que a migration acabou de criar.
  log('aplicando migrations pendentes…');
  rodarPrisma('prisma migrate deploy', ['migrate', 'deploy']);

  log('regenerando o Prisma Client…');
  rodarPrisma('prisma generate', ['generate']);

  // Por `db seed` e não por `ts-node` direto: o comando do seed já está
  // declarado em `package.json#prisma`, e duplicá-lo aqui criaria uma segunda
  // fonte que sairia de sincronia. O seed é idempotente — reexecutá-lo não
  // reseta a senha do admin (o `update: {}` no upsert é deliberado).
  log('semeando dados de base (idempotente)…');
  rodarPrisma('prisma db seed', ['db', 'seed']);

  log('');
  log('ambiente pronto. Suba a API com: npm run start:dev');
};

principal().catch((falha) => {
  erro(`falha inesperada: ${falha && falha.message ? falha.message : falha}`);
  process.exit(1);
});
