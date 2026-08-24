# ProCert — Plataforma de Certificação de Produtos

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
desta hospedagem estão em **[DEPLOY.md](./DEPLOY.md)**.

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
│       └── modules/          auth, clientes, funcionarios, categorias-produto,
│                             modelos-trilha, produtos, certificacoes,
│                             nao-conformidades, certificados, estados,
│                             dashboard, uploads, mail, contato, aparencia
└── frontend/                 SPA React 19 + Vite
    ├── public/               Imagens e PDFs do site institucional
    └── src/
        ├── auth/             Contexto de sessão e rotas protegidas
        ├── components/       Layout, tabela, modais, campos
        ├── features/         Um diretório por domínio (api + páginas), incluindo
        │                     home (site público) e certificados
        └── styles/           Tema "liquid glass" preservado do legado
```

---

## Subindo o ambiente

> **Node 24** (ver `.nvmrc`) e Docker. O CI valida em 24; rodar outra major
> significa que ninguem testa o que voce roda. Com nvm: `nvm use` na raiz.

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
cp .env.example .env
npm ci
npx prisma migrate deploy
npm run seed
npm run start:dev
```

> `migrate deploy` aplica as migrations que ja vem no repositorio, que e o que voce
> quer num clone novo. Use `migrate dev --name <descricao>` apenas quando estiver
> **criando** uma migration depois de editar o `schema.prisma`.

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

---

## Scripts

### Backend
| Comando | Ação |
|---------|------|
| `npm run start:dev` | API em modo watch |
| `npm run build` / `npm run start:prod` | Build e execução de produção |
| `npm run seed` | Popula UFs, a categoria padrão com sua trilha v1 e o admin inicial |
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

> Não há testes automatizados no frontend — é a próxima lacuna depois do CI
> (`DOCUMENTACAO.md` §17).

---

## Integração contínua

`.github/workflows/ci.yml` roda em **push para `main`** e em **todo pull request**.
Dois jobs independentes:

| Job | O que roda |
|---|---|
| **Backend** | `npm ci` → `prisma generate` → `lint:ci` → `build` → 152 unitários → 59 e2e |
| **Frontend** | `npm ci` → `lint:ci` → `build` (o `tsc -b` é o type-check) |

O e2e sobe um PostgreSQL 16 de serviço mapeado em **5433**, igual ao `docker-compose`.
É de propósito: assim o job copia `.env.test.example` sem alterar nada, em vez de manter
uma segunda `DATABASE_URL` que sairia de sincronia com a do repositório sem ninguém notar.

**Dois comandos ficam de fora, e não é esquecimento:**

- `typecheck:scripts` falha hoje porque o ETL do legado está desatualizado. Incluí-lo
  deixaria o CI vermelho desde o primeiro run e ensinaria todo mundo a ignorar o resultado.
- `npm audit` tem 3 high sem correção publicada, mais 1 moderate cujo caminho vulnerável
  não é alcançável. Ver `DOCUMENTACAO.md` §15 antes de tentar "resolver".

### Antes de abrir um PR

```bash
cd backend  && npm run lint:ci && npm run build && npm test && npm run test:e2e
cd frontend && npm run lint:ci && npm run build
```

É exatamente o que o CI roda. Descobrir a falha aqui custa segundos; descobrir no CI
custa um ciclo de push.

### Fluxo de contribuição

```bash
git checkout -b tipo/descricao-curta   # feat/, fix/, ci/, docs/, test/
# ... altere, commite ...
git push -u origin tipo/descricao-curta
gh pr create --base main
```

O histórico até aqui foi feito direto em `main`. Com mais de uma pessoa no repositório
isso deixa de servir: dois pushes concorrentes em `main` se atropelam, e nada garante que
a suíte rodou antes. **Trabalhe em branch e abra PR** — os dois checks precisam passar.

---
## Modelo de domínio

```
CategoriaProduto ──1:N──► ModeloTrilha (versionado) ──1:N──► ModeloEtapa
                                                                  │
Cliente ──1:N──► Produto ──1:N──► CertificacaoProduto ──N:1───────┘
                    │                      ├──1:N──► CertificacaoHistorico ──1:N──► DocumentoCertificacao
                    │                      └──1:N──► NaoConformidade
                    ├──1:N──► Certificado
                    └──1:N──► Pagamento
```

Cada **categoria** define a própria trilha de certificação, **versionada**: um produto se
vincula à versão vigente no momento da submissão e continua sendo avaliado por ela mesmo
que a categoria publique uma versão nova depois. Ao cadastrar um **Produto**, a API abre
uma linha de `CertificacaoProduto` (status `PENDENTE`) para cada etapa dessa versão, dentro
de uma transação.

A partir daí: etapas recebem evidências (obrigatórias quando o modelo exige), reprovações
podem abrir **não conformidades** que o cliente responde e a equipe avalia, e a aprovação de
todas as etapas obrigatórias libera a **emissão do certificado** (número sequencial,
validade por categoria e PDF).

## Perfis de acesso

| Papel | Permissões |
|-------|-----------|
| `ADMIN` | Acesso total, incluindo gestão de administradores e emissão/suspensão de certificados |
| `FUNCIONARIO` | Clientes, produtos, categorias e trilhas, certificações e não conformidades |
| `CLIENTE` | Somente os próprios produtos, certificações e certificados (escopo forçado no servidor); pode responder às suas não conformidades |

---

## Rotinas automáticas

Todo dia às **03:00**, a API marca como `VENCIDO` os certificados fora da validade. Ligada
por padrão; rodando a API em mais de uma instância, deixe `EXPIRACAO_CRON_ATIVA=true` em
exatamente uma.

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
