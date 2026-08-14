# ProCert — Plataforma de Certificação de Produtos

Migração do sistema legado em PHP (MVC artesanal + MySQL) para uma stack moderna:

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 20 + TypeScript + **NestJS 11** |
| ORM | **Prisma 6** |
| Banco | **PostgreSQL 16** |
| Frontend | **React 19** + TypeScript + **Vite 6** |
| Estado servidor | TanStack Query 5 |
| Formulários | React Hook Form + Zod |
| Auth | JWT (access token) + Bcrypt + Guards por papel |

> O mapeamento completo "arquivo PHP → módulo NestJS/React", incluindo todos os bugs do
> legado que foram corrigidos nesta migração, está em **[MIGRACAO.md](./MIGRACAO.md)**.

---

## Estrutura

```
procert-app/
├── docker-compose.yml        PostgreSQL + Adminer
├── DOCUMENTACAO.md           Documentação técnica completa (arquitetura, API, decisões)
├── MIGRACAO.md               Guia de migração (de/para, correções, plano de cutover)
├── backend/                  API NestJS
│   ├── prisma/
│   │   ├── schema.prisma     Modelo de dados PostgreSQL
│   │   ├── seed.ts           Dados base (UFs, categoria + trilha padrão, admin)
│   │   ├── migrate-legacy.ts    ETL MySQL (legado) → PostgreSQL
│   │   └── migrate-categorias.ts Catálogo global de etapas → trilhas por categoria
│   └── src/
│       ├── common/           Guards, decorators, filtros, paginação
│       ├── prisma/           PrismaService
│       └── modules/          auth, clientes, funcionarios, categorias-produto,
│                             modelos-trilha, produtos, certificacoes,
│                             nao-conformidades, certificados, estados,
│                             dashboard, uploads, mail, contato
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
npm install
npx prisma migrate dev --name init
npm run seed
npm run start:dev
```

API em **http://localhost:3000/api** · Swagger em **http://localhost:3000/api/docs**

Credenciais criadas pelo seed:

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Administrador | `admin@procertocp.com.br` | `Procert@2026` |

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
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
| `npm run migrate:legacy` | ETL do MySQL legado para o PostgreSQL |
| `npm run migrate:categorias` | Catálogo global de etapas → trilhas por categoria |
| `npm run prisma:studio` | Interface visual do banco |
| `npm run lint` / `npm test` | **Ainda não funcionam** — sem `eslint.config.js` e sem suíte de testes (ver `DOCUMENTACAO.md` §14) |

> Não rode `npm run build` com o `start:dev` ativo: o `deleteOutDir` apaga o `dist/`
> embaixo do processo em watch e o derruba.

### Frontend
| Comando | Ação |
|---------|------|
| `npm run dev` | Servidor Vite |
| `npm run build` | Build de produção (`dist/`) |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint |

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

## Documentação

- **[DOCUMENTACAO.md](./DOCUMENTACAO.md)** — arquitetura, modelo de dados, referência da
  API, decisões de projeto, problemas conhecidos e postura de segurança.
- **[MIGRACAO.md](./MIGRACAO.md)** — mapeamento arquivo PHP → módulo atual e bugs do legado
  corrigidos.
