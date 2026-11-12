# ProCert — Plataforma de Certificação de Processos

Migração do sistema legado em PHP (MVC artesanal + MySQL) para uma stack moderna:

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 24 + TypeScript + **NestJS 11** |
| ORM | **Prisma 6** |
| Banco | **PostgreSQL 16** |
| Frontend | **React 19** + TypeScript + **Vite 6** |
| Estado servidor | TanStack Query 5 |
| Formulários | React Hook Form + Zod |
| Auth | JWT (access token) + Bcrypt + Guards por papel |

> O mapeamento completo "arquivo PHP → módulo NestJS/React", incluindo todos os bugs do
> legado que foram corrigidos nesta migração, está em **[MIGRACAO.md](./MIGRACAO.md)**.

---

## No ar

| | |
|---|---|
| Site e painel | https://procert-app.vercel.app |
| API | https://procert-api-singlefutureadm-9995s-projects.vercel.app/api |
| Banco e arquivos | Supabase (PostgreSQL 17 + Storage), região `sa-east-1` |

Push em `main` publica sozinho. O passo a passo, as variáveis de ambiente e as armadilhas
desta hospedagem estão em **[DEPLOY.md](./DEPLOY.md)**, Parte I.

Desde 12/11/2026 há uma segunda hospedagem: um **VPS da Locaweb** (Ubuntu 24.04, nginx,
PostgreSQL 16 local, arquivos em disco), publicado a partir da branch **`prod`** pelo
workflow `CD VPS`. O endereço fica no secret `VPS_HOST`, fora deste repositório público.
Os dois ambientes têm **bancos separados** — o VPS recebeu uma cópia do Supabase nessa
data. Montagem, fluxo e lacunas (HTTPS, SMTP, backup) em **[DEPLOY.md](./DEPLOY.md)**,
Parte III.

### Rotas públicas

`/` (home) · `/sobre` · `/servicos` · `/contato` · `/termos-de-uso` ·
`/politica-de-privacidade`

Cada uma tem título, descrição e dados estruturados próprios (`src/lib/seo.ts`). Ao
acrescentar uma rota pública, atualize também `PAGINAS` em
`src/features/home/conteudo-paginas.ts`, o `public/sitemap.xml` e — se ela não deve ser
rastreada — o `public/robots.txt`.

---

## Estrutura

```
procert-app/
├── docker-compose.yml        PostgreSQL + Adminer
├── DOCUMENTACAO.md           Documentação técnica completa (arquitetura, API, decisões)
├── MIGRACAO.md               Guia de migração (de/para, correções, plano de cutover)
├── DEPLOY.md                 Vercel + Supabase, FTP do legado e VPS Locaweb
├── .github/workflows/        ci.yml (main, qa, prod) e cd-vps.yml (prod → VPS)
├── deploy/vps/               procert-deploy.sh, o lado do servidor do CD
├── backend/                  API NestJS
│   ├── test/                 Suíte e2e (Supertest) e o cenário de autorização
│   ├── prisma/
│   │   ├── schema.prisma     Modelo de dados PostgreSQL
│   │   ├── seed.ts           Dados base (UFs, categoria + trilha padrão, admin)
│   │   ├── migrate-legacy.ts    ETL MySQL (legado) → PostgreSQL
│   │   └── migrate-categorias.ts Catálogo global de etapas → trilhas por categoria
│   └── src/
│       ├── common/           Guards, decorators, filtros, paginação
│       ├── prisma/           PrismaService
│       ├── bootstrap.ts      configurarApp(): prefixo, helmet, CORS, validação,
│       │                     filtro de erros e estáticos de /uploads
│       ├── testing/          Mocks e fixtures dos testes unitários
│       └── modules/          auth, clientes, funcionarios, categorias-processo,
│                             modelos-trilha, processos, certificacoes,
│                             nao-conformidades, certificados, estados,
│                             dashboard, relatorios, uploads, mail, contato,
│                             aparencia, health
└── frontend/                 SPA React 19 + Vite
    ├── public/               Imagens e PDFs do site institucional
    └── src/
        ├── auth/             Contexto de sessão e rotas protegidas
        ├── components/       Layout, tabela, modais, campos
        ├── features/         Um diretório por domínio (api + páginas), incluindo
        │                     home (site público), trilhas, quadro de processos,
        │                     relatórios, aparência e ajuda por tela
        └── styles/           Tema "liquid glass" preservado do legado
```

---

## Subindo o ambiente

> **Node 24** (ver `.nvmrc`) e Docker. O CI valida em 24; rodar outra major
> significa que ninguem testa o que voce roda. Com nvm: `nvm use` na raiz.
>
> Isso é **exigido**, não sugerido: os dois pacotes trazem `engine-strict=true` no
> `.npmrc`, e o `npm ci` reprova numa major diferente em vez de instalar com um aviso
> que ninguém lê.

### 1. Banco de dados

```bash
docker compose up -d
```

Sobe PostgreSQL em **`localhost:5433`** (db `procert`, user `procert`, senha `procert`)
e o Adminer em http://localhost:8080.

> A porta do host é 5433, e não 5432, para conviver com uma instalação nativa de
> PostgreSQL na máquina. O `DATABASE_URL` do backend precisa refletir isso.

### 2. Backend

```bash
cd backend
npm ci
npm run setup
npm run start:dev
```

> **`npm run setup` é idempotente e serve para sempre, não só para o clone.** Ele copia
> `.env` e `.env.test` dos exemplos **se faltarem** (nunca sobrescreve), confere se o
> banco está de pé, aplica as migrations pendentes, regenera o Prisma Client e roda o
> seed. Rodá-lo sem necessidade custa segundos e não muda nada — veja
> [Depois de um `git pull`](#depois-de-um-git-pull).
>
> Por dentro ele usa `migrate deploy`, que só aplica o que está pendente. Use
> `migrate dev --name <descricao>` apenas quando estiver **criando** uma migration
> depois de editar o `schema.prisma` — é o único que compara schema e banco, e o único
> que oferece resetar o banco quando acha divergência.

API em **http://localhost:3000/api** · Swagger em **http://localhost:3000/api/docs**

Credenciais criadas pelo seed:

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Administrador | `admin@procertocp.com.br` | `Procert@2026` |

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

Aplicação em **http://localhost:5173**

### Depois de um `git pull`

```bash
cd backend && npm run setup
```

**É o passo que faltava, e é o que morde na prática.** Um pull traz migrations e um
`schema.prisma` novos sem disparar nada: o `npm ci` não roda de novo, porque as
dependências não mudaram, e com ele fica de fora o postinstall que regenera o Prisma
Client. O banco local passa a estar uma versão atrás do código e o client uma versão
atrás do schema — os dois em silêncio.

O erro que aparece depois não diz isso. Ele diz `P2022, a coluna X não existe`,
apontando para o código, que está certo. **Em produção esse mesmo defeito custou dois
dias** em 26/08/2026, e lá foi fechado no build (`prisma/migrar-no-deploy.js`); aqui a
guarda é rodar o comando acima. Se as dependências também mudaram, `npm ci` antes.

---

## Scripts

### Backend
| Comando | Ação |
|---------|------|
| `npm run setup` | Prepara o ambiente: copia os `.env` que faltarem, aplica migrations, regenera o Prisma Client e semeia. Idempotente — rode depois de todo `git pull` |
| `npm run start:dev` | API em modo watch |
| `npm run build` / `npm run start:prod` | Build e execução de produção |
| `npm run seed` | Popula UFs, a trilha "Certificação padrão" v1, a categoria "Geral" vinculada a ela e o admin inicial |
| `npm run conferir:trilhas` | Confere a migração para trilhas-catálogo. Somente leitura; código 1 se achar problema |
| `npm run mover:uploads-processos` | Copia `/uploads/produtos/` para `/uploads/processos/`; só apaga a origem com `-- --remover-antigos` |
| `npm run senha:admin` | Redefine a senha de um ADMIN. A senha vem de `SEED_ADMIN_PASSWORD` no ambiente — o `upsert` do seed nunca corrige a senha de um registro existente |
| `npm run migrate:legacy` | ETL do MySQL legado para o PostgreSQL |
| `npm run migrate:categorias` | Catálogo global de etapas → trilhas por categoria |
| `npm run prisma:studio` | Interface visual do banco |
| `npm run lint` | ESLint 9 (flat config), com `--fix` |
| `npm run lint:ci` | ESLint sem `--fix` — o que o CI roda |
| `npm test` | Unitários dos services (Prisma mockado) |
| `npm run test:cov` | Idem, com relatório de cobertura |
| `npm run test:e2e` | e2e de autorização (Supertest + PostgreSQL) — exige `.env.test`, ver abaixo |
| `npm run typecheck:scripts` | Type-check de `prisma/` (**falha hoje**: o ETL do legado está desatualizado — `DOCUMENTACAO.md` §15) |

> Não rode `npm run build` com o `start:dev` ativo: o `deleteOutDir` apaga o `dist/`
> embaixo do processo em watch e o derruba.

#### Rodando o e2e

```bash
cd backend
cp .env.test.example .env.test    # não é versionado
npm run test:e2e
```

Ele usa um banco **dedicado** (`procert_test`), criado automaticamente no mesmo container.
A suíte **trunca as tabelas** entre arquivos, então há uma trava que recusa qualquer
`DATABASE_URL` cujo banco não termine em `_test` — apontá-lo para `procert` apagaria o seu
ambiente de desenvolvimento.

### Frontend
| Comando | Ação |
|---------|------|
| `npm run dev` | Servidor Vite |
| `npm run build` | Build de produção (`dist/`) |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint |
| `npm run lint:ci` | ESLint sem `--fix` — o que o CI roda |
| `npm test` | Vitest + Testing Library (133 testes) |
| `npm run test:watch` / `npm run test:cov` | Idem, em watch / com cobertura |

> Os testes do frontend miram o que **quebra em silêncio** — tokens de tema, chaves de
> cache, `mensagemDeErro`, acessibilidade de `Campo`/`CampoSenha`/`Modal`, compressão de
> imagem e a cobertura da ajuda por tela. Página inteira fica de fora por decisão
> (`DOCUMENTACAO.md` §14).

---

## Integração contínua

`.github/workflows/ci.yml` roda em **push** e em **pull request** para `main`, `qa` e `prod`.
Dois jobs independentes:

| Job | O que roda |
|---|---|
| **Backend** | `npm ci` → `prisma generate` → `lint:ci` → `build` → 434 unitários → 144 e2e |
| **Frontend** | `npm ci` → `lint:ci` → `npm test` (129) → `build` (o `tsc -b` é o type-check) |

Um terceiro workflow, `.github/workflows/cd-vps.yml`, **não** é check de PR: roda depois
do CI verde num push em `prod` e publica no VPS (ver [Fluxo de contribuição](#fluxo-de-contribuição)).

O e2e sobe um PostgreSQL 16 de serviço mapeado em **5433**, igual ao `docker-compose`.
É de propósito: assim o job copia `.env.test.example` sem alterar nada, em vez de manter
uma segunda `DATABASE_URL` que sairia de sincronia com a do repositório sem ninguém notar.

**Dois comandos ficam de fora, e não é esquecimento:**

- `typecheck:scripts` falha hoje porque o ETL do legado está desatualizado. Incluí-lo
  deixaria o CI vermelho desde o primeiro run e ensinaria todo mundo a ignorar o resultado.
- `npm audit` tem 1 advisory high sem correção publicada, mais 1 moderate cujo caminho
  vulnerável não é alcançável. Como o `npm` conta pacotes da cadeia e não advisories, o
  total exibido é **5** (3 high + 2 moderate) — é esse o número que um gate de CI compara.
  Ver `DOCUMENTACAO.md` §15 antes de tentar "resolver".

### Antes de abrir um PR

```bash
cd backend  && npm run lint:ci && npm run build && npm test && npm run test:e2e
cd frontend && npm run lint:ci && npm test && npm run build
```

É exatamente o que o CI roda — o `npm test` do frontend entrou no job junto com os
testes do #24, e ficar de fora daqui era deixar passar localmente o que o CI reprova.
Descobrir a falha aqui custa segundos; descobrir no CI custa um ciclo de push.

Medido em 12/11/2026, no CI verde de `main`: backend **434 unitários em 23 suítes** e
**144 e2e em 6 suítes**; frontend **133 testes em 13 arquivos**.

### Fluxo de contribuição

```bash
git checkout -b tipo/descricao-curta   # feat/, fix/, ci/, docs/, test/
# ... altere, commite ...
git push -u origin tipo/descricao-curta
gh pr create --base main
```

As três branches de longa duração, e a ordem em que o código anda entre elas:

| Branch | Papel | Como recebe código |
|---|---|---|
| `main` | integração; publica na Vercel | PR de `tipo/descricao-curta` |
| `qa` | homologação | PR de `main` → `qa` |
| `prod` | a versão no ar no VPS (Locaweb) | PR de `qa` → `prod` |

As três têm a mesma proteção (ruleset do repositório): sem push direto, sem
force-push, sem exclusão, merge só por PR com os dois jobs do CI verdes e a branch
atualizada com a base. Promover é abrir o PR — `gh pr create --base qa --head main`
e depois `--base prod --head qa`.

O merge em `prod` dispara o CI; verde, o `CD VPS` faz o build no runner, sincroniza por
rsync, aplica as migrations, troca a versão e confere `/api/health` — sem resposta
saudável em 60 s, volta sozinho para a anterior. Republicar sem commit novo: Actions →
CD VPS → *Run workflow* em `prod`. `gh pr merge --auto` não está disponível neste plano:
aguarde os checks e faça o merge.

O histórico até aqui foi feito direto em `main`. Com mais de uma pessoa no repositório
isso deixa de servir: dois pushes concorrentes em `main` se atropelam, e nada garante que
a suíte rodou antes. **Trabalhe em branch e abra PR** — os dois checks precisam passar.

---
## Modelo de domínio

```
Trilha (catálogo) ──1:N──► ModeloTrilha (versão) ──1:N──► ModeloEtapa ──1:N──► ModeloMicroEtapa
   ▲                              ▲                            │
   └──1:N── CategoriaProcesso      └── retrato ── Processo        │
                                                    │           │
Cliente ──1:N──► Processo ──1:N──► CertificacaoProcesso ──N:1─────┘
                    │                      ├──1:N──► MicroEtapaCertificacao (checklist)
                    │                      ├──1:N──► CertificacaoHistorico ──1:N──► DocumentoCertificacao
                    │                      └──1:N──► NaoConformidade
                    ├──1:N──► Certificado
                    └──1:N──► Pagamento
```

A **trilha** é um cadastro de catálogo, **versionado**, que várias categorias podem
seguir: a categoria aponta para a trilha (família) e o processo, para a **versão vigente
no momento da submissão** — e continua sendo avaliado por ela mesmo que a trilha publique
uma versão nova depois. Ao cadastrar um **Processo**, a API abre uma linha de
`CertificacaoProcesso` (status `PENDENTE`) para cada etapa dessa versão, com a cópia do
checklist, dentro de uma transação.

A equipe acompanha os processos também pelo **quadro** (`/processos/quadro`), em colunas
por fase. A fase é derivada da etapa atual, nunca gravada; arrastar um cartão escreve
etapa, não posição.

A partir daí: etapas recebem evidências (obrigatórias quando o modelo exige), reprovações
podem abrir **não conformidades** que o cliente responde e a equipe avalia, e a aprovação de
todas as etapas obrigatórias libera a **emissão do certificado** (número sequencial,
validade por categoria e PDF).

## Perfis de acesso

| Papel | Permissões |
|-------|-----------|
| `ADMIN` | Acesso total, incluindo gestão de administradores e emissão/suspensão de certificados |
| `FUNCIONARIO` | Clientes, processos, categorias e trilhas, certificações e não conformidades |
| `CLIENTE` | Somente os próprios processos, certificações e certificados (escopo forçado no servidor); pode responder às suas não conformidades |

---

## Rotinas automáticas

Todo dia às **03:00**, a API marca como `VENCIDO` os certificados fora da validade. Ligada
por padrão — é o que roda no VPS, onde a API é um processo contínuo (`systemd`); rodando a
API em mais de uma instância, deixe `EXPIRACAO_CRON_ATIVA=true` em exatamente uma.

**Em serverless nada disso roda** — o timer nasce no boot e morre com a instância, sem
chegar às 03:00. É por isso que na Vercel a variável fica `false` e quem acorda a rotina é
o **Vercel Cron**, chamando `GET /api/certificados/cron/expirar-vencidos`, autenticado por
`CRON_SECRET` — um segredo dedicado, que não vira sessão e abre uma única porta. A rota
`POST /api/certificados/expirar-vencidos` (ADMIN) segue disponível para acionamento manual.
Detalhes e o porquê da escolha em `DOCUMENTACAO.md` §9 e `DEPLOY.md` §4.

---

## Documentação

- **[DOCUMENTACAO.md](./DOCUMENTACAO.md)** — arquitetura, modelo de dados, referência da
  API, decisões de projeto, problemas conhecidos e postura de segurança.
- **[MIGRACAO.md](./MIGRACAO.md)** — mapeamento arquivo PHP → módulo atual e bugs do legado
  corrigidos.
- **[DEPLOY.md](./DEPLOY.md)** — publicação: Vercel + Supabase (I), FTP do legado (II) e
  VPS Locaweb com CD a partir de `prod` (III).
- **[LICENSE](./LICENSE)** — licença de uso.
- **[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)** — inventário das licenças de
  terceiros e dos materiais que não pertencem à Single Future.

---

## Licença

**Copyright © 2026 Single Future. Todos os direitos reservados.**

Software proprietário. **Não é código aberto**, e a visibilidade pública deste
repositório não constitui licença: usar, copiar, modificar, distribuir ou executar o
Software depende de autorização prévia e por escrito da titular. Os termos completos
estão em **[LICENSE](./LICENSE)**.

A reserva de direitos alcança a obra da Single Future e **não** se estende às
dependências de terceiros, ao template visual do site institucional nem à marca, aos
textos e aos documentos do organismo certificador — cada um regido pela sua própria
licença ou pela titularidade do cliente. O inventário está em
**[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)**, que também registra as
pendências de conformidade abertas (§4) — leia antes de publicar o site ou de trocar
uma imagem da home.
