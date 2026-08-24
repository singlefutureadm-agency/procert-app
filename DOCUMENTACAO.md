# ProCert — Documentação Técnica

Plataforma de **certificação de conformidade de produtos**. Um organismo certificador
(ProCert / OCP) define trilhas de certificação por categoria de produto, recebe produtos
dos clientes e conduz cada um pelas etapas previstas — análise documental, ensaios,
auditoria de fábrica, decisão —, registrando quem alterou o quê e quando, com as evidências
anexadas e as não conformidades tratadas até a **emissão do certificado**. O cliente
acompanha os próprios produtos pelo mesmo painel, com escopo restrito, e responde às
pendências que lhe cabem.

O produto tem duas faces na mesma aplicação: o **site institucional público** em `/`
(apresentação, serviços, documentos do organismo e formulário de contato) e o **painel
autenticado** a partir de `/dashboard`.

Este documento descreve a arquitetura, as decisões de projeto, o modelo de dados, a API,
o frontend, a operação local e o estado real de qualidade do código. O mapeamento
"arquivo PHP legado → módulo atual" vive em [MIGRACAO.md](./MIGRACAO.md); o passo a passo
resumido de subida vive em [README.md](./README.md). Aqui está o porquê de cada peça.

---

## Sumário

1. [Visão geral e contexto](#1-visão-geral-e-contexto)
2. [Arquitetura](#2-arquitetura)
3. [Stack tecnológica e justificativas](#3-stack-tecnológica-e-justificativas)
4. [Estrutura de diretórios](#4-estrutura-de-diretórios)
5. [Modelo de dados](#5-modelo-de-dados)
6. [Autenticação e autorização](#6-autenticação-e-autorização)
7. [Módulos do backend](#7-módulos-do-backend)
8. [Referência da API](#8-referência-da-api)
9. [Preocupações transversais](#9-preocupações-transversais)
10. [Arquitetura do frontend](#10-arquitetura-do-frontend)
11. [Configuração e variáveis de ambiente](#11-configuração-e-variáveis-de-ambiente)
12. [Ambiente local](#12-ambiente-local)
13. [Operação e manutenção](#13-operação-e-manutenção)
14. [Qualidade: testes, lint e lacunas reais](#14-qualidade-testes-lint-e-lacunas-reais)
15. [Problemas conhecidos e decisões registradas](#15-problemas-conhecidos-e-decisões-registradas)
16. [Postura de segurança](#16-postura-de-segurança)
17. [Próximos passos sugeridos](#17-próximos-passos-sugeridos)

---

## 1. Visão geral e contexto

### O domínio

O negócio gira em torno de uma máquina de estados simples, mas auditável:

```
Categoria de produto  →  Modelo de trilha (versionado)  →  Etapas previstas
        │                          │
        └──────────┬───────────────┘
                   ▼
Cliente cadastra-se  →  submete Produto (escolhe a categoria)
                                   ↓
        o produto congela a versão vigente da trilha e abre suas etapas
                                   ↓
      cada etapa: PENDENTE → EM_ANDAMENTO → APROVADO | REPROVADO
                                   ↓
   reprovação pode abrir Não conformidade → cliente responde → equipe avalia
                                   ↓          (resolvida ⇒ etapa reaberta)
        toda transição gera um registro imutável de histórico,
             ao qual se prendem as evidências anexadas
                                   ↓
   todas as etapas obrigatórias APROVADO  →  Certificado emitido (PDF, validade)
```

Seis invariantes sustentam o produto:

| Invariante | Onde é garantida |
|---|---|
| Um produto nasce com uma linha de certificação para **cada etapa da versão vigente** da trilha da sua categoria | `ProdutosService.criar()`, dentro de uma transação |
| Um produto é avaliado pela versão da trilha vigente **na submissão**, mesmo que a categoria publique outra depois | `Produto.modeloTrilhaId` é um retrato; mudar de versão exige ação explícita |
| Uma versão de trilha com produto vinculado é imutável | `ModelosTrilhaService.garantirEditavel()` responde `409` |
| Nenhuma mudança de status existe sem autoria e carimbo de tempo | `CertificacoesService.salvar()` grava `CertificacaoHistorico` na mesma transação |
| Uma etapa marcada como `exigeDocumento` não é aprovada sem evidência anexada | validação antes da transação em `salvar()` |
| Um cliente nunca acessa dados de outro cliente | escopo forçado no servidor em cada service, nunca pelo id da URL |

### Papéis

| Papel | Alcance |
|---|---|
| `ADMIN` | Tudo, incluindo gestão da equipe interna, exclusões definitivas e **emissão/suspensão de certificados** |
| `FUNCIONARIO` | Clientes, produtos, categorias e trilhas, avanço das certificações e abertura/avaliação de não conformidades |
| `CLIENTE` | Somente os próprios produtos, certificações e certificados — leitura da trilha, com uma exceção de escrita: **responder às não conformidades** |

### Origem: migração de um sistema PHP legado

Esta é a reescrita de um sistema PHP/MySQL com MVC artesanal. A migração não foi uma
tradução linha a linha — vários defeitos estruturais do legado foram corrigidos por
construção, e cada correção está anotada em docblock no arquivo correspondente. Os mais
relevantes:

| Defeito do legado | Correção aqui |
|---|---|
| Cadastro usava `password_hash()`, login comparava com `===` → funcionário/admin criado pela interface **nunca conseguia entrar** | `bcrypt.compare()` em `AuthService.login()` |
| Senhas de cliente em **texto puro** no banco | `senhaHash` bcrypt obrigatório; o ETL re-hasheia o que vinha em claro |
| Nenhuma guarda de rota: endpoints de exclusão eram **públicos** | `JwtAuthGuard` + `RolesGuard` globais; acesso é opt-out via `@Public()` |
| `id` vindo da URL sem verificação de posse (IDOR) | `garantirAcesso()` em controllers/services; escopo do CLIENTE derivado do JWT |
| Upload aceitava qualquer extensão, inclusive `.php` | allowlist de MIME + nome gerado por `randomUUID()` |
| Card "Certificações aprovadas" sempre exibia 0 (chave `total_aprovados` vs. leitura de `total_certificacao_aprovada`) | agregação recalculada em `DashboardService` |
| Etapa final fixada como `id_etapa = 4` | "concluído" = **todas** as etapas aprovadas |
| "Desativar etapa" executava `DELETE` físico, quebrando certificações em andamento | catálogo global substituído por trilhas versionadas por categoria (ver abaixo) |
| Produto criado fora de transação → produto órfão sem etapas | `prisma.$transaction` |
| Erro de conexão imprimia host e usuário do banco na tela | `AllExceptionsFilter` padroniza e omite internos |
| Constantes SMTP existiam mas nunca eram usadas; link de reset apontava para rota inexistente | `MailService` com nodemailer e link real |
| `if ($_SESSION['id_tipo_usuario'] == '1')` espalhado por 30+ arquivos | `<RotaProtegida papeis={...}>` declarativo, revalidado no backend |

### Evolução além da paridade com o legado

Quatro incrementos posteriores levaram o sistema de "cópia modernizada" a algo utilizável
por um organismo certificador real. Estão descritos em detalhe nas seções 5, 7 e 8; em
resumo:

| Incremento | O que resolve |
|---|---|
| **Categoria de produto + trilha versionada** | O legado tinha um catálogo único de etapas aplicado a todo produto. Famílias diferentes (EPI, brinquedo, eletrodoméstico) exigem normas e ensaios diferentes — e uma trilha muda com o tempo sem poder alterar a régua de quem já está em avaliação. |
| **Não conformidade estruturada** | Reprovar era um status com observação em texto livre. Agora a reprovação vira um registro com código, gravidade, prazo, resposta do cliente e parecer — e a resolução reabre a etapa. |
| **Certificado formal** | O processo terminava sem produzir nada. Agora emite um documento numerado, com validade, PDF e ciclo próprio (suspender, cancelar, vencer). |
| **Evidências por etapa e notificação** | A avaliação não guardava prova nem avisava o cliente. Agora cada etapa aceita anexos (obrigatórios quando o modelo exige) e cada mudança de status dispara e-mail. |

---

## 2. Arquitetura

### Topologia

```
┌────────────────────────────────────────────────────────────────────────┐
│  Navegador                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SPA React 19 (Vite)                                              │  │
│  │  router → RotaProtegida → páginas de feature                      │  │
│  │  TanStack Query (cache/estado servidor) · RHF+Zod (formulários)   │  │
│  │  axios interceptors: injeta Bearer, trata 401                     │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
└──────────────────────────────┼─────────────────────────────────────────┘
                               │  JSON sobre HTTP (dev: proxy /api do Vite)
┌──────────────────────────────▼─────────────────────────────────────────┐
│  API NestJS 11  (prefixo global /api)                                  │
│                                                                        │
│  helmet → CORS → ValidationPipe global → guards globais                │
│    guards, na ordem: JwtAuthGuard → RolesGuard → ThrottlerGuard        │
│                                                                        │
│  Controller  (HTTP, papéis, DTOs)                                      │
│      ↓                                                                 │
│  Service     (regra de negócio, transações, escopo por papel)           │
│      ↓                                                                 │
│  PrismaService (client único, ciclo de vida do Nest)                    │
│                                                                        │
│  AllExceptionsFilter padroniza toda resposta de erro                   │
│  /uploads servido como estático                                        │
│  Swagger em /api/docs                                                  │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │  SQL
                    ┌──────────▼──────────┐        ┌──────────────────┐
                    │  PostgreSQL 16      │        │ Adminer (dev)    │
                    │  (Docker, :5433)    │        │ :8080            │
                    └─────────────────────┘        └──────────────────┘
```

### Camadas do backend e o que pertence a cada uma

| Camada | Responsabilidade | Não faz |
|---|---|---|
| **Controller** | Rotas, verbos, `@Roles`, DTO de entrada, documentação Swagger | Consultar o banco, decidir regra de negócio |
| **Service** | Regra de negócio, transações, escopo por papel, mensagens de domínio | Conhecer HTTP (exceto lançar `HttpException` semântica) |
| **DTO** | Contrato de entrada + validação declarativa (class-validator) | Lógica |
| **PrismaService** | Conexão única e tipada com o banco | Regra |
| **common/** | Guards, decorators, filtro de exceção, paginação, util de senha | Domínio |

A regra prática: um controller nunca tem `if` de negócio, e um service nunca sabe que
existe uma requisição HTTP. O `@CurrentUser()` entra no service como um objeto simples
(`UsuarioAutenticado`), o que mantém os services testáveis sem levantar o Nest.

### Fluxo de uma requisição autenticada

```
PUT /api/certificacoes/produto/1
  1. helmet aplica cabeçalhos de segurança
  2. CORS valida a origem (CORS_ORIGINS)
  3. JwtAuthGuard        → rota não é @Public(); valida assinatura e expiração do JWT
     JwtStrategy.validate → RECONSULTA o usuário no banco; se INATIVO, 401 na hora
  4. RolesGuard          → @Roles(ADMIN, FUNCIONARIO); CLIENTE recebe 403
  5. ThrottlerGuard      → 120 req/min por padrão
  6. ValidationPipe      → SalvarCertificacaoDto: whitelist + forbidNonWhitelisted
  7. Controller          → delega ao service com (produtoId, dto, usuario)
  8. Service             → transação: UPDATE das etapas + INSERT do histórico
  9. Resposta            → timeline recalculada
     Erro em qualquer ponto → AllExceptionsFilter → corpo padronizado
```

O passo 3 merece destaque: a estratégia JWT **não confia apenas no payload do token**.
Cada requisição revalida `status = ATIVO` no banco. O custo é uma consulta por request; o
ganho é revogação imediata ao desativar um cadastro, sem lista de revogação nem
refresh token.

---

## 3. Stack tecnológica e justificativas

### Backend

| Tecnologia | Versão | Por que |
|---|---|---|
| **Node.js + TypeScript** | Node 20+ / TS 5.7 | Tipagem estática de ponta a ponta com o frontend |
| **NestJS** | 11 | DI, guards/pipes/filtros globais e modularidade prontos — o que o legado improvisava à mão |
| **Prisma** | 6 | Schema declarativo, migrations versionadas e client tipado; elimina SQL concatenado (vetor de SQLi do legado) |
| **PostgreSQL** | 16 | ENUMs nativos, FKs confiáveis, transações reais, `citext`/índices ricos |
| **@nestjs/jwt + passport-jwt** | 11 / 4 | Stateless, adequado a SPA; sem sessão de servidor para escalar |
| **bcrypt** | 5 | Custo configurável (12 rounds); compatível com hashes `$2y$` do PHP migrado |
| **class-validator / class-transformer** | 0.14 / 0.5 | Validação declarativa no DTO, aplicada globalmente |
| **helmet** | 8 | Cabeçalhos de segurança que o legado não tinha |
| **@nestjs/throttler** | 6 | Rate limit global e por rota (login e reset de senha mais restritos) |
| **@nestjs/swagger** | 11 | Contrato executável da API, gerado dos próprios DTOs |
| **nodemailer** | 6 | SMTP real para recuperação de senha e avisos de certificação |
| **pdfkit** | 0.15 | Geração do PDF do certificado; sem dependência de binário externo ou serviço |

### Frontend

| Tecnologia | Versão | Por que |
|---|---|---|
| **React** | 19 | Base do ecossistema; sem framework SSR porque é um painel autenticado |
| **Vite** | 6 | Dev server instantâneo, HMR, proxy `/api` que dispensa CORS em dev |
| **TanStack Query** | 5 | Cache, invalidação e estados de carregamento/erro do servidor — remove `useEffect`+`useState` manual |
| **React Hook Form + Zod** | 7 / 3 | Formulários performáticos com schema tipado; a mesma regra valida no cliente e é reforçada no servidor |
| **react-router-dom** | 7 | Rotas aninhadas com layout e proteção declarativa por papel |
| **axios** | 1.7 | Interceptors para Bearer e tratamento central de 401 |
| **sonner** | 1.7 | Toasts de feedback |
| **@dnd-kit** | 6 | Reordenação das etapas por arrastar e soltar |
| **bootstrap-icons** | 1.11 | Ícones da home; mesmos nomes de classe do legado, agora empacotados (sem CDN) |
| **CSS puro com design tokens** | — | Preserva o tema "liquid glass" do painel e o tema claro da home sem arrastar Bootstrap/AdminLTE |

### Decisões explícitas de arquitetura

- **Monorepo simples de duas pastas**, sem workspaces ou ferramenta de build compartilhada.
  A superfície é pequena; os tipos são reespelhados em `frontend/src/types/index.ts` em vez
  de compartilhados via pacote. Custo: duplicação controlada. Ganho: zero configuração de
  build cruzada. Quando a API crescer, o caminho natural é gerar os tipos do OpenAPI.
- **Sem refresh token.** Access token de 8h + revalidação no banco a cada request.
  Adequado ao uso (jornada de trabalho); revisitar se aparecer requisito de sessão longa.
- **Token no `localStorage`.** Escolha pragmática de SPA sem BFF. Contrapartida: exposto a
  XSS. Mitigado por React (escapa por padrão), helmet e nenhuma renderização de HTML de
  usuário. A alternativa correta em produção é cookie `httpOnly` + rota de refresh.
- **Soft delete por padrão, hard delete só para `ADMIN`** e bloqueado quando há vínculos
  (`ConflictException` explicando o que impede).

---

## 4. Estrutura de diretórios

```
procert-app/
├── docker-compose.yml            PostgreSQL 16 (host :5433) + Adminer (:8080)
├── README.md                     Guia rápido de subida
├── MIGRACAO.md                   Mapa arquivo PHP → módulo atual, bugs corrigidos, cutover
├── DOCUMENTACAO.md               Este documento
│
├── backend/
│   ├── nest-cli.json             deleteOutDir: true, watchAssets
│   ├── tsconfig.json             strict-ish, decorators, outDir dist, incremental
│   ├── tsconfig.build.json       exclui test/prisma/spec; incremental: false (ver §15)
│   ├── prisma/
│   │   ├── schema.prisma         Fonte da verdade do modelo de dados
│   │   ├── migrations/           Migrations versionadas (init → … → documentos_certificacao)
│   │   ├── seed.ts               27 UFs, categoria "Geral" + trilha v1, admin (idempotente)
│   │   ├── migrate-legacy.ts     ETL MySQL legado → PostgreSQL, com --dry-run
│   │   └── migrate-categorias.ts Catálogo global de etapas → trilhas por categoria
│   └── src/
│       ├── main.ts               Bootstrap: prefixo, helmet, CORS, pipes, estáticos, Swagger
│       ├── app.module.ts         Composição dos módulos + guards globais
│       ├── prisma/               PrismaService (OnModuleInit/Destroy)
│       ├── common/
│       │   ├── decorators/       @Public, @Roles, @CurrentUser
│       │   ├── dto/              PaginacaoDto + paginar(), PessoaBaseDto
│       │   ├── filters/          AllExceptionsFilter
│       │   ├── guards/           JwtAuthGuard, RolesGuard
│       │   └── utils/            senha.util (bcrypt, SENHA_REGEX)
│       └── modules/
│           ├── auth/             login, /me, esqueci/redefinir/alterar senha, JwtStrategy
│           ├── clientes/         CRUD + foto + soft delete
│           ├── funcionarios/     ADMIN e FUNCIONARIO no mesmo módulo
│           ├── categorias-produto/ CRUD de categorias (famílias de produto)
│           ├── modelos-trilha/   versões da trilha: criar, editar, reordenar
│           ├── produtos/         CRUD + abertura da trilha na versão vigente
│           ├── certificacoes/    painel, timeline, salvar lote, versão da trilha,
│           │                     reiniciar + documentos.service (evidências)
│           ├── nao-conformidades/ abertura, resposta do cliente, avaliação
│           ├── certificados/     emissão, status, expiração + certificado-pdf.service
│           ├── dashboard/        métricas dos cards
│           ├── estados/          UFs (controller inline, público)
│           ├── contato/          formulário público do site + caixa de entrada
│           ├── mail/             MailService (SMTP ou log simulado)
│           └── uploads/          UploadsService global (allowlists, troca, remoção segura)
│
└── frontend/
    ├── vite.config.ts            alias @, proxy /api e /uploads, manualChunks
    ├── index.html                favicon, meta description, fontes do site institucional
    ├── public/
    │   ├── img/                  Imagens da home (herdadas do legado) + logos
    │   └── documentos/           PDFs públicos do organismo certificador
    └── src/
        ├── main.tsx              QueryClientProvider → AuthProvider → RouterProvider → Toaster
        ├── router.tsx            Home pública em "/" + rota de layout protegida por papel
        ├── auth/                 AuthContext, useAuth, RotaProtegida
        ├── lib/                  api (axios+interceptors), queryClient (+chaves), formatadores
        ├── components/           Layout, Sidebar, Campo, Badge, Paginacao, Modal, EstadoVazio…
        ├── features/
        │   ├── home/             Site institucional: conteudo.ts, hooks.ts, home.css, secoes/
        │   ├── categorias-produto/ Listagem, modal, detalhe com versões e editor de etapas
        │   ├── certificacoes/    Painel, timeline, DocumentosEtapa
        │   ├── nao-conformidades/ Página do cliente/equipe + CartaoNaoConformidade
        │   ├── certificados/     Página de certificados + painel dentro do produto
        │   └── <domínio>/        api.ts (chamadas tipadas) + páginas do domínio
        ├── pages/                Login, EsqueciSenha, RedefinirSenha, SemPermissao, 404
        ├── styles/global.css     Design tokens + tema liquid glass do painel
        └── types/index.ts        Contratos espelhados da API
```

**Convenção de features (frontend):** cada domínio isola suas chamadas HTTP em `api.ts`,
com tipos importados de `@/types`. As páginas nunca chamam `axios` diretamente — chamam
`clientesApi.listar(...)` dentro de `useQuery`/`useMutation`. Isso mantém um único ponto de
mudança quando um endpoint muda de forma.

---

## 5. Modelo de dados

Fonte da verdade: `backend/prisma/schema.prisma`. Convenções: modelos em PascalCase no
código, tabelas e colunas em `snake_case` no banco (`@@map` / `@map`), timestamps
`criadoEm`/`atualizadoEm` em toda entidade mutável.

### Diagrama de relacionamentos

```
  CategoriaProduto ──1:N──► ModeloTrilha (versão) ──1:N──► ModeloEtapa
          │                        │                            │
          │                        │                            │ (etapa)
          ▼                        ▼                            ▼
        Produto ◄──1:N── Cliente   │                   CertificacaoProduto
          │  │  └──────── modeloTrilha (retrato da versão) ──┘  │
          │  │                                                  ├──1:N──► CertificacaoHistorico
          │  ├──1:N──► Pagamento                                │              │
          │  └──1:N──► Certificado                              │              └──1:N──► DocumentoCertificacao
          │                                                     └──1:N──► NaoConformidade
        Estado ──1:N──► Cliente
          └────1:N──► Funcionario ──── autoria (SetNull) ────► Historico · NC · Certificado · Documento

    Isoladas: TokenRedefinicaoSenha (por e-mail) · MensagemContato (formulário público)
```

### Entidades

| Modelo | Tabela | Papel no domínio |
|---|---|---|
| `Estado` | `estados` | 27 UFs; referência de endereço |
| `Cliente` | `clientes` | Quem contrata a certificação; **também é usuário** (login com `role` CLIENTE implícita) |
| `Funcionario` | `funcionarios` | Equipe interna; guarda `role` = `ADMIN` \| `FUNCIONARIO` |
| `CategoriaProduto` | `categorias_produto` | Família de produtos com processo próprio; guarda a norma e a `validadeMeses` do certificado |
| `ModeloTrilha` | `modelos_trilha` | **Versão** da trilha de uma categoria (`versao`, `ativo`, `vigenteDe/Ate`) |
| `ModeloEtapa` | `modelos_etapa` | Etapa prevista por uma versão (`ordem`, `tipo`, `obrigatoria`, `prazoSlaDias`, `exigeDocumento`) |
| `Produto` | `produtos` | Item submetido; aponta para a categoria e para a **versão da trilha da submissão** |
| `CertificacaoProduto` | `certificacoes_produto` | Uma etapa aplicada a um produto — o estado corrente, com `ordem` própria |
| `CertificacaoHistorico` | `certificacoes_historico` | Trilha de auditoria imutável das transições e dos anexos |
| `DocumentoCertificacao` | `documentos_certificacao` | Evidência anexada, presa ao registro de histórico que a trouxe |
| `NaoConformidade` | `nao_conformidades` | Achado de uma etapa reprovada: código, gravidade, prazo, resposta e parecer |
| `Certificado` | `certificados` | Documento formal emitido: número, escopo, validade, status e PDF |
| `Pagamento` | `pagamentos` | Financeiro do processo (modelado; sem módulo de escrita ainda) |
| `EtapaCertificacao` | `etapas_certificacao` | **Obsoleto** — catálogo global do legado, mantido só até a conferência do cutover |
| `TokenRedefinicaoSenha` | `tokens_redefinicao_senha` | Reset de senha; guarda **hash** do token |
| `MensagemContato` | `mensagens_contato` | Formulário público do site |

### Enums

| Enum | Valores |
|---|---|
| `Role` | `ADMIN`, `FUNCIONARIO`, `CLIENTE` |
| `StatusRegistro` | `ATIVO`, `INATIVO` |
| `TipoPessoa` | `FISICA`, `JURIDICA` |
| `TipoEtapa` | `DOCUMENTAL`, `ENSAIO`, `AUDITORIA_FABRICA`, `ANALISE_CRITICA`, `DECISAO`, `OUTRO` |
| `StatusCertificacao` | `PENDENTE`, `EM_ANDAMENTO`, `APROVADO`, `REPROVADO` |
| `CriticidadeNaoConformidade` | `MENOR`, `MAIOR` |
| `StatusNaoConformidade` | `ABERTA`, `EM_TRATATIVA`, `RESOLVIDA`, `REPROVADA` |
| `StatusCertificado` | `EMITIDO`, `SUSPENSO`, `CANCELADO`, `VENCIDO` |
| `StatusPagamento` | `PENDENTE`, `PAGO`, `CANCELADO`, `ESTORNADO` |

### Restrições e índices que carregam regra

| Restrição | Efeito |
|---|---|
| `@@unique([categoriaId, versao])` em `ModeloTrilha` | Duas versões com o mesmo número são impossíveis |
| `@@unique([produtoId, etapaId])` em `CertificacaoProduto` | Impossível duplicar uma etapa no mesmo produto — a migração de versão fica idempotente por construção |
| `codigo @unique` (NC) e `numero @unique` (certificado) | Guardas contra emissões simultâneas com o mesmo sequencial; o filtro traduz para `409` |
| `email @unique` em `Cliente` **e** em `Funcionario` | Unicidade por tabela; a unicidade **cross-tabela** é verificada em código (`garantirEmailDisponivel`), pois o banco não a expressa |
| `Produto.cliente` / `.categoria` / `.modeloTrilha` `onDelete: Restrict` | Cliente, categoria ou versão em uso não podem ser apagados — force o soft delete |
| `ModeloEtapa.modeloTrilha` `onDelete: Cascade` | Apagar uma versão limpa suas etapas |
| `CertificacaoProduto.produto` `onDelete: Cascade` | Apagar produto limpa trilha, histórico, evidências e NCs |
| `CertificacaoProduto.etapa` `onDelete: Restrict` | Etapa de modelo em uso não pode ser apagada |
| `DocumentoCertificacao.historico` `onDelete: Cascade` | Evidência não sobrevive ao registro que a datou |
| `Certificado.produto` `onDelete: Restrict` | Produto com certificado emitido não pode ser apagado |
| Autorias `alteradoPor` / `abertoPor` / `emitidoPor` / `enviadoPor` `onDelete: SetNull` | Excluir um colaborador **não apaga a auditoria**: o nome desnormalizado permanece |
| `TokenRedefinicaoSenha.tokenHash @unique` | Só o hash SHA-256 é persistido; vazamento do banco não revela tokens usáveis |
| Índices em `[produtoId, ordem]`, `[categoriaId, ativo]`, `[status, prazoResposta]`, `[status, dataValidade]`, `[certificacaoId, alteradoEm]` | Suportam a timeline, a fila de NCs por prazo e a rotina de expiração sem varredura |

**Decisão de modelagem — dois modelos de usuário.** `Cliente` e `Funcionario` são tabelas
separadas em vez de uma tabela `Usuario` com discriminador. Motivo: herança do legado
(`tbl_cliente`/`tbl_funcionario`) e ciclos de vida distintos (cliente tem produtos e
faturamento; funcionário tem autoria de auditoria). Custo assumido: o login consulta as duas
tabelas e a unicidade de e-mail é validada em código. Se um dia houver um quarto papel,
vale unificar.

**Desnormalização deliberada.** `alteradoPorNome`, `abertoPorNome`, `emitidoPorNome` e
`enviadoPorNome` duplicam o nome do autor. É intencional: auditoria precisa sobreviver à
exclusão do autor.

**Decisão de modelagem — trilha versionada em vez de editável.** Uma versão de trilha com
produto vinculado nunca é alterada; mudar o processo cria a versão seguinte e encerra a
anterior (`vigenteAte`, `ativo = false`). Isso mantém uma propriedade que um organismo
certificador precisa poder afirmar: *este produto foi avaliado por estas regras, nesta
redação*. O custo é uma tabela a mais e a necessidade de migrar produtos entre versões
conscientemente (§7, `certificacoes`).

**Decisão de modelagem — `ordem` na trilha do produto.** `CertificacaoProduto.ordem` é
copiado de `ModeloEtapa.ordem` na abertura, mas vive por conta própria. Um produto migrado
entre versões carrega etapas de modelos diferentes, cujas ordens colidem; só um campo no
nível do produto descreve a sequência real. Toda ordenação de timeline usa esse campo.

**Decisão de modelagem — evidência presa ao histórico.** `DocumentoCertificacao` aponta
para `CertificacaoHistorico`, não para `CertificacaoProduto`, para registrar *em que ponto
da trilha* cada arquivo entrou. Como consequência, anexar cria um registro de histórico
próprio (com `statusAnterior === statusNovo`) — uma marcação de trilha, não uma transição.
A interface reconhece esse caso e mostra "Documento anexado".

---

## 6. Autenticação e autorização

### Fluxo de login

```
Frontend                            Backend
────────                            ───────
POST /api/auth/login                AuthService.login()
{email, senha}                        1. normaliza e-mail (trim + lowercase)
                                      2. procura em funcionarios
                                      3. senão, procura em clientes
                                      4. garante status ATIVO
                                      5. bcrypt.compare(senha, senhaHash)
                                      6. assina JWT {sub, email, role, nome}, 8h
        ◄─── 200 {accessToken, usuario}

tokenStorage.set(token)             (procert:token no localStorage)
localStorage[procert:usuario]       (cache do perfil para o primeiro render)
navigate('/dashboard')

Todo request seguinte:
  interceptor axios → Authorization: Bearer <token>
  JwtStrategy.validate → reconsulta o usuário; INATIVO ⇒ 401
```

**Anti-enumeração de contas.** Quando o e-mail não existe, o service ainda executa um
`bcrypt.compare` contra um hash inválido antes de responder `401`. Isso equaliza o tempo de
resposta entre "e-mail inexistente" e "senha errada", e a mensagem é a mesma nos dois casos
(`E-mail ou senha incorretos.`). O mesmo princípio rege `esqueci-senha`, que **sempre**
responde a mesma frase de sucesso.

### Autorização em duas camadas

| Camada | Mecanismo | Vale para |
|---|---|---|
| Frontend | `<RotaProtegida papeis={['ADMIN']}>` + filtro de itens da Sidebar | Experiência: esconder o que não se pode usar |
| Backend | `JwtAuthGuard` + `RolesGuard` globais, `@Roles(...)` por rota/classe | **Segurança**: é a fronteira real |

O frontend nunca é a fronteira de segurança. Digitar `/clientes` na barra de endereços com
uma sessão de cliente resulta em redirecionamento para `/sem-permissao` **e** `403` na API
se a requisição partir.

### Escopo do papel CLIENTE

Três padrões, aplicados de forma consistente:

```ts
// 1. Listagens: o escopo vem do token, não do query param
const clienteId = usuario.role === Role.CLIENTE ? usuario.id : filtros.clienteId;

// 2. Detalhes: verificação de posse antes de devolver
if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) throw new ForbiddenException(...);

// 3. Escrita de domínio: negada explicitamente
if (usuario.role === Role.CLIENTE) throw new ForbiddenException('Clientes podem acompanhar, mas não alterar…');
```

Consequência: um cliente **pode** ler e editar o próprio cadastro (`GET`/`PATCH
/clientes/:id` com `id` igual ao seu), ler os próprios produtos, trilhas, certificados e
evidências, e **responder às próprias não conformidades** — a única escrita de domínio que
lhe cabe. Não consegue listar clientes, ver o catálogo de categorias e trilhas, avançar
certificações, avaliar NCs nem emitir ou suspender certificados.

O catálogo de categorias e modelos de trilha é **integralmente restrito à equipe, leitura
inclusive**: é configuração interna do organismo, e as normas e prazos de cada família não
são informação do cliente. Ele continua vendo a categoria do próprio produto, que vem
embutida no payload de `/produtos`.

No dashboard, `totalClientes` devolve a constante `1` para um CLIENTE — não é a contagem
real da base. É proposital, para o card não vazar o tamanho da carteira.

### Recuperação de senha

```
POST /auth/esqueci-senha  →  gera token aleatório de 32 bytes
                              persiste APENAS sha256(token) + expiraEm (1h)
                              invalida pedidos anteriores em aberto (usadoEm = now)
                              envia link FRONTEND_URL/redefinir-senha?token=<claro>
                              responde sempre a mesma mensagem neutra

POST /auth/redefinir-senha →  busca por sha256(token); rejeita se usado ou expirado
                              transação: atualiza senhaHash (funcionario ou cliente)
                                         + marca token como usado
```

Uso único, validade de 1 hora, só o hash no banco, e falha de SMTP nunca propaga para o
fluxo de autenticação (seria um canal lateral de enumeração).

### Política de senha

`SENHA_REGEX = /^(?=.*[A-Za-zÀ-ÿ])(?=.*\d).{8,}$/` — mínimo 8 caracteres, com letra e
número, acentos contam como letra. Aplicada nos DTOs de criação/alteração. Hash bcrypt com
`BCRYPT_SALT_ROUNDS` (padrão 12). Hashes `$2y$` herdados do PHP são normalizados para
`$2b$` na comparação, então usuários migrados entram com a mesma senha de sempre.

---

## 7. Módulos do backend

### `auth`
Login unificado (cliente ou equipe), perfil da sessão, recuperação e troca de senha.
`JwtStrategy` revalida o usuário a cada request. Rate limit mais apertado que o global:
10/min no login, 5/min nos fluxos de senha.

### `clientes`
CRUD com paginação e busca por nome/e-mail/CPF/CNPJ. `SELECT_CLIENTE` é uma allowlist de
campos — **`senhaHash` nunca sai do service**, nem por acidente em um `include`. Soft delete
via `status`; hard delete só `ADMIN` e bloqueado com `409` se houver produtos vinculados.
`GET /clientes/resumo` devolve a lista enxuta para popular selects.

### `funcionarios`
`ADMIN` e `FUNCIONARIO` no mesmo módulo (o legado tinha dois controllers e dois models
quase idênticos). Duas salvaguardas operacionais: ninguém desativa ou exclui o próprio
cadastro, e o sistema **impede ficar sem nenhum ADMIN ativo** (`garantirOutroAdminAtivo`).

### `categorias-produto`
CRUD das famílias de produto, com a norma de referência e a `validadeMeses` usada no cálculo
do vencimento do certificado. Soft delete via `status`; hard delete só `ADMIN` e bloqueado
com `409` se houver produtos vinculados (as versões de trilha caem junto, em transação).
`GET /categorias-produto/resumo` devolve a lista para selects **já com o modelo vigente**,
para o formulário de produto saber, antes de o usuário preencher tudo, que a categoria não
aceita submissão. Módulo inteiro restrito a `ADMIN`/`FUNCIONARIO`, leitura inclusive.

### `modelos-trilha`
Versões da trilha de uma categoria. A regra central é a imutabilidade:

- `POST /categorias-produto/:id/modelos-trilha` — cria a próxima versão. Sem `etapas` no
  corpo, **copia as da vigente** (o caso comum é partir do processo atual e ajustar).
  Encerra a anterior (`vigenteAte`, `ativo = false`) na mesma transação, de modo que a
  categoria nunca tenha duas versões vigentes.
- `PATCH /modelos-trilha/:id/etapas` — substitui a lista inteira; `409` se a versão já tem
  produto, com a mensagem orientando versionar.
- `PATCH /modelos-trilha/:id/etapas/ordem` — persiste o drag-and-drop em transação.

`resolverVigente()` é exposto para o `ProdutosService` não duplicar a regra de qual versão
vale no momento da submissão.

### `produtos`
CRUD + upload de foto. Na criação exige `categoriaId`, resolve a versão vigente da trilha
daquela categoria e abre uma linha de certificação para cada etapa dela — tudo na **mesma
transação**. Sem modelo vigente, responde `400` orientando cadastrar a trilha primeiro; com
categoria inativa, `400`. O `AtualizarProdutoDto` **omite `categoriaId`**: trocar a
categoria depois da submissão mudaria a régua de um produto em avaliação, o que é
reabertura de processo, não edição de cadastro. Todo payload vem enriquecido com
`resumoCertificacao` e o último pagamento, evitando N+1 no frontend. `Decimal` do Prisma é
convertido para `number` na borda.

### `certificacoes`
O coração do produto.

- `GET /certificacoes` — painel consolidado: uma linha por produto com etapa atual,
  status e progresso. Substitui as subqueries correlacionadas do legado.
- `GET /certificacoes/produto/:id` — timeline completa: etapas na ordem do produto, cada
  uma com evidências, não conformidades e histórico decrescente, mais um `resumo` agregado
  (inclui `obrigatoriasAprovadas`, que habilita a emissão do certificado).
- `PUT /certificacoes/produto/:id` — **salvamento em lote**. Valida que toda etapa enviada
  pertence ao produto, recusa aprovar etapa que exige evidência sem anexo, recusa NC fora de
  reprovação, ignora as que não mudaram e, para cada mudança, grava `UPDATE` + `INSERT` de
  histórico (+ NC quando enviada) na mesma transação. Autoria vem da sessão, nunca de campo
  editável. Depois do commit, dispara a notificação por e-mail sem bloquear a resposta.
- `GET .../versao-trilha` — consulta pura: diz se o produto ficou preso a uma versão antiga
  e **o que a migração faria**, sem efeito colateral.
- `POST .../migrar-versao-trilha` — migra para a versão vigente adicionando só as etapas
  ausentes (comparadas por nome, já que cada versão tem `ModeloEtapa` próprias), grava
  histórico com autoria e **renumera a trilha inteira** conforme a ordem do modelo vigente.
  Etapas que a versão nova não prevê vão para o fim, preservando a sequência relativa.
- `POST .../reiniciar` — só `ADMIN`: recria a trilha do zero pela versão que o produto
  carrega (trocar de versão é decisão à parte), apagando o histórico em cascata.
- `POST .../etapas/:etapaId/documento` e `GET /certificacoes/documentos/:id/arquivo` —
  evidências, em `documentos.service.ts`.

"Etapa atual" é derivada, não armazenada: primeira `EM_ANDAMENTO`, senão primeira
`PENDENTE`, senão a última. Progresso = aprovadas / total.

### `nao-conformidades`
Transforma a reprovação em registro rastreável. Código sequencial por ano
(`NC-2026-000001`) derivado do **maior código do ano**, não de `COUNT` — contar linhas
reutilizaria um número já emitido após uma exclusão.

Ciclo: a equipe abre a NC (avulsa em etapa reprovada, ou junto da reprovação no lote) →
o cliente responde, e a NC passa a `EM_TRATATIVA` → a equipe avalia. `RESOLVIDA` devolve a
etapa a `EM_ANDAMENTO` — precisa ser **reavaliada**, não é aprovada automaticamente — e
registra a transição no histórico; `REPROVADA` encerra mantendo a etapa reprovada.

Duas guardas que a máquina de estados exige: `ABERTA` é recusada na avaliação (reabrir
apagaria rastro — registre uma NC nova), e NC encerrada não aceita nova resposta nem
reavaliação. `criarRegistro()` aceita um `TransactionClient` para nascer no mesmo commit da
reprovação.

### `certificados`
Emissão formal. Exige todas as etapas **obrigatórias** aprovadas (opcionais pendentes não
bloqueiam) e recusa com `409` se o produto já tem certificado vigente. Número sequencial por
ano (`PROCERT-2026-000001`), validade de `categoria.validadeMeses` salvo data explícita.

O PDF é gerado **depois do commit**, de propósito: escrita em disco não participa de
transação de banco e o arquivo é derivável do registro. Se falhar, o certificado existe e o
PDF nasce no primeiro download — `obterPdf()` também regenera se o arquivo sumiu do disco.

`PATCH /certificados/:id/status` suspende, cancela ou reativa, com motivo obrigatório ao
encerrar. `VENCIDO` não é aceito ali: vencimento decorre da data, aplicado por
`POST /certificados/expirar-vencidos`, pensado para um agendador externo. Também bloqueia
reativar fora da validade e mexer em cancelado.

`CertificadoPdfService` é isolado e não conhece o Prisma: recebe os dados e devolve um
Buffer, para que o layout possa mudar sem tocar no domínio.

### `dashboard`
`GET /dashboard/metricas`: total de clientes e produtos, contagem por situação
(concluídas/em andamento/pendentes), percentual de pendentes e as 8 últimas movimentações.
A classificação é calculada em memória sobre um único `findMany` enxuto
(`select: {id, certificacao: {status}}`) — mais previsível que quatro `count` com filtros
correlacionados. Se a base crescer muito, este é o primeiro ponto a virar agregação SQL.

### `estados`
Controller inline no módulo, `@Public()`: a lista de UFs alimenta formulários antes do login.

### `contato`
`POST /contato` público (5/min) grava a mensagem e notifica por e-mail, com escape de HTML
no corpo. `GET /contato` e `PATCH /contato/:id/lida` para a equipe. No legado o model
existia mas nenhum controller o usava.

### `mail`
`MailService` com nodemailer. **Sem SMTP configurado, não quebra**: registra o e-mail no log
com `[SIMULADO]` — é o comportamento em desenvolvimento. Falhas de envio são logadas, nunca
propagadas.

Dois templates: redefinição de senha e **atualização da certificação** (nome da etapa, novo
status e link para o painel), este agrupando todas as etapas alteradas em uma mensagem só.
Nome de produto e de etapa vêm do banco e entram no corpo HTML, então passam por escape.

### `uploads`
`@Global()`, injetado nos módulos que gravam arquivo. Três caminhos, com allowlists
distintos:

| Método | Allowlist | Uso |
|---|---|---|
| `salvarImagem` | `jpeg`/`png`/`webp`/`gif` | Fotos de cliente, colaborador e produto |
| `salvarDocumento` | imagens + PDF, Word e Excel | Evidências de etapa |
| `salvarArquivoGerado` | — (conteúdo é do próprio sistema) | PDF de certificado |

Em todos: extensão derivada do MIME e não do nome enviado, nome gerado por `randomUUID()`,
limite de `UPLOAD_MAX_SIZE_MB` e guarda de path traversal (`normalize` + verificação de
prefixo) antes de qualquer leitura ou `unlink`. `substituirImagem` remove o arquivo anterior;
`caminhoAbsoluto` resolve o caminho para leitura autenticada.

---

## 8. Referência da API

Base: `http://localhost:3000/api` · Swagger navegável: `/api/docs`
Autenticação: `Authorization: Bearer <accessToken>` em tudo que não esteja marcado como
público. Toda rota autenticada devolve `401` sem token válido e `403` quando o papel não
autoriza.

### Auth — `/auth`

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/login` | Público · 10/min | Autentica cliente ou equipe; devolve `{accessToken, usuario}` |
| GET | `/me` | Autenticado | Perfil completo da sessão (sem `senhaHash`) |
| POST | `/esqueci-senha` | Público · 5/min | Dispara link de redefinição; resposta sempre neutra |
| POST | `/redefinir-senha` | Público · 5/min | Consome o token e grava a nova senha |
| PATCH | `/alterar-senha` | Autenticado | Troca a senha exigindo a atual |

### Clientes — `/clientes`

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/` | ADMIN, FUNCIONARIO | Lista paginada; filtros `busca`, `status` |
| GET | `/resumo` | ADMIN, FUNCIONARIO | Lista enxuta para selects |
| GET | `/:id` | Autenticado (CLIENTE só o próprio) | Detalhe |
| POST | `/` | ADMIN, FUNCIONARIO | Cadastra (senha obrigatória, validada) |
| PATCH | `/:id` | Autenticado (CLIENTE só o próprio) | Atualiza; senha só se enviada |
| PATCH | `/:id/status` | ADMIN, FUNCIONARIO | Ativa/desativa (soft delete) |
| POST | `/:id/foto` | Autenticado (CLIENTE só o próprio) | `multipart/form-data`, campo `foto` |
| DELETE | `/:id` | ADMIN | Exclusão definitiva; `409` se houver produtos |

### Funcionários — `/funcionarios`

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/` | ADMIN, FUNCIONARIO | Lista paginada; filtros `busca`, `status`, `role` |
| GET | `/:id` | ADMIN, FUNCIONARIO | Detalhe |
| POST | `/` | ADMIN | Cadastra integrante |
| PATCH | `/:id` | ADMIN | Atualiza; protege o último ADMIN |
| PATCH | `/:id/status` | ADMIN | Ativa/desativa; não permite auto-desativação |
| POST | `/:id/foto` | ADMIN, FUNCIONARIO | Foto do integrante |
| DELETE | `/:id` | ADMIN | Exclusão definitiva; preserva a auditoria |

### Produtos — `/produtos`

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/` | Autenticado (CLIENTE escopado) | Lista paginada; filtros `busca`, `status`, `clienteId`, `categoriaId` |
| GET | `/:id` | Autenticado (CLIENTE só os seus) | Detalhe com `resumoCertificacao`, categoria e versão da trilha |
| POST | `/` | ADMIN, FUNCIONARIO | Cadastra (exige `categoriaId`) **e abre a trilha na versão vigente** |
| PATCH | `/:id` | ADMIN, FUNCIONARIO | Atualiza; `categoriaId` não é aceito |
| PATCH | `/:id/status` | ADMIN, FUNCIONARIO | Ativa/desativa |
| POST | `/:id/foto` | ADMIN, FUNCIONARIO | Foto do produto |
| DELETE | `/:id` | ADMIN | Exclusão definitiva (cascata na trilha) |
| GET | `/:id/certificados` | Autenticado (CLIENTE só os seus) | Certificados do produto |
| POST | `/:id/certificados` | ADMIN | **Emite** o certificado |

### Categorias e trilhas *(módulos inteiros: ADMIN, FUNCIONARIO — leitura inclusive)*

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/categorias-produto` | Equipe | Lista paginada, com a versão vigente resumida |
| GET | `/categorias-produto/resumo` | Equipe | Lista para selects, com o modelo vigente |
| GET | `/categorias-produto/:id` | Equipe | Detalhe |
| POST | `/categorias-produto` | Equipe | Cadastra (nome, norma, `validadeMeses`) |
| PATCH | `/categorias-produto/:id` | Equipe | Atualiza |
| PATCH | `/categorias-produto/:id/status` | Equipe | Ativa/desativa (soft delete) |
| DELETE | `/categorias-produto/:id` | ADMIN | Exclusão; `409` se houver produtos |
| GET | `/categorias-produto/:id/modelos-trilha` | Equipe | Versões da trilha, com etapas |
| POST | `/categorias-produto/:id/modelos-trilha` | Equipe | **Nova versão**; copia a vigente e a encerra |
| GET | `/modelos-trilha/:id` | Equipe | Detalhe de uma versão |
| PATCH | `/modelos-trilha/:id/etapas` | Equipe | Substitui as etapas; `409` se já tem produtos |
| PATCH | `/modelos-trilha/:id/etapas/ordem` | Equipe | Reordena (drag-and-drop) |

### Certificações — `/certificacoes`

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/` | Autenticado (CLIENTE escopado) | Painel: uma linha por produto, com progresso |
| GET | `/produto/:produtoId` | Autenticado (CLIENTE só os seus) | Timeline: etapas, evidências, NCs e histórico |
| PUT | `/produto/:produtoId` | ADMIN, FUNCIONARIO | Salva o lote, grava auditoria, abre NC e notifica |
| GET | `/produto/:produtoId/versao-trilha` | ADMIN, FUNCIONARIO | Diz se há versão mais nova e o que mudaria |
| POST | `/produto/:produtoId/migrar-versao-trilha` | ADMIN, FUNCIONARIO | Migra e renumera a trilha |
| POST | `/produto/:produtoId/reiniciar` | ADMIN | Recria a trilha do zero |
| POST | `/produto/:produtoId/etapas/:etapaId/documento` | ADMIN, FUNCIONARIO | Anexa evidência (`multipart`, campo `documento`) |
| GET | `/certificacoes/documentos/:id/arquivo` | Autenticado (CLIENTE só os seus) | Baixa a evidência |

### Não conformidades

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/certificacoes/:certificacaoId/nao-conformidades` | ADMIN, FUNCIONARIO | Abre NC em etapa **reprovada** |
| GET | `/nao-conformidades` | Autenticado (CLIENTE escopado) | Lista ordenada por prazo; filtros `status`, `criticidade`, `produtoId`, `pendentes` |
| GET | `/nao-conformidades/:id` | Autenticado (CLIENTE só as suas) | Detalhe |
| PATCH | `/nao-conformidades/:id/resposta` | **CLIENTE** | Registra a correção; NC vai a `EM_TRATATIVA` |
| PATCH | `/nao-conformidades/:id/status` | ADMIN, FUNCIONARIO | Avalia; `RESOLVIDA` reabre a etapa |

### Certificados — `/certificados`

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/` | Autenticado (CLIENTE escopado) | Lista; filtros `status`, `produtoId`, `clienteId`, `busca` |
| GET | `/:id` | Autenticado (CLIENTE só os seus) | Detalhe |
| GET | `/:id/pdf` | Autenticado (CLIENTE só os seus) | PDF; gerado sob demanda se faltar |
| PATCH | `/:id/status` | ADMIN | Suspende, cancela ou reativa; motivo obrigatório ao encerrar |
| POST | `/expirar-vencidos` | ADMIN | Rotina de expiração (agendador externo) |

### Dashboard, Estados e Contato

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/dashboard/metricas` | Autenticado (CLIENTE escopado) | Cards e últimas movimentações |
| GET | `/estados` | **Público** | 27 UFs |
| POST | `/contato` | **Público** · 5/min | Recebe mensagem do site |
| GET | `/contato` | ADMIN, FUNCIONARIO | Caixa de entrada paginada |
| PATCH | `/contato/:id/lida` | ADMIN, FUNCIONARIO | Marca como lida |

> `POST /contato` é consumido pelo formulário da home pública. Não existe ainda uma tela
> no painel para ler a caixa de entrada — os dois endpoints de leitura estão disponíveis
> apenas via API/Swagger.

### Contratos de payload

**Listagem paginada** (envelope de toda listagem):

```json
{ "dados": [ ... ], "total": 42, "pagina": 1, "limite": 20, "totalPaginas": 3 }
```

Query params comuns: `pagina` (≥1, padrão 1), `limite` (1–100, padrão 20), `busca` (≤120 chars).

**Erro** (padronizado pelo `AllExceptionsFilter`):

```json
{
  "statusCode": 400,
  "message": ["senha: A senha deve ter ao menos 8 caracteres, incluindo letras e números."],
  "error": "Bad Request",
  "path": "/api/clientes",
  "timestamp": "2026-08-12T14:52:10.412Z"
}
```

**Salvar certificação** (`PUT /certificacoes/produto/:id`) — a não conformidade é opcional e
só aceita quando a etapa vai como `REPROVADO`:

```json
{
  "etapas": [
    { "id": 1, "status": "APROVADO", "observacao": "Documentação conforme." },
    {
      "id": 2,
      "status": "REPROVADO",
      "observacao": "Ensaio fora do especificado.",
      "naoConformidade": {
        "descricao": "Carga de ruptura 3% abaixo do mínimo normativo.",
        "criticidade": "MAIOR",
        "prazoResposta": "2026-09-30"
      }
    }
  ]
}
```

**Nova versão de trilha** (`POST /categorias-produto/:id/modelos-trilha`) — corpo vazio
(`{}`) copia as etapas da versão vigente:

```json
{
  "etapas": [
    { "nome": "Ensaio dinâmico", "tipo": "ENSAIO", "prazoSlaDias": 30, "exigeDocumento": true },
    { "nome": "Decisão de certificação", "tipo": "DECISAO", "obrigatoria": true }
  ]
}
```

**Emitir certificado** (`POST /produtos/:id/certificados`) — `dataValidade` sobrescreve a
validade padrão da categoria:

```json
{ "escopo": "Cinturão tipo paraquedista, modelos CS-100 e CS-120.", "dataValidade": "2028-08-12" }
```

### Códigos de status

| Código | Quando |
|---|---|
| `200` / `201` | Sucesso |
| `400` | Validação de DTO, enum inválido, regra de negócio (categoria sem trilha vigente, etapa que exige evidência sem anexo, NC fora de reprovação, emissão com etapa obrigatória pendente, último ADMIN) |
| `401` | Sem token, token inválido/expirado, senha atual incorreta, cadastro inativo |
| `403` | Papel sem permissão, ou cliente tentando acessar dado de outro |
| `404` | Registro inexistente (`P2025` do Prisma também cai aqui) |
| `409` | Duplicidade (`P2002`), vínculo que impede a exclusão (`P2003`), versão de trilha em uso, certificado vigente já existente |
| `429` | Rate limit excedido |
| `500` | Erro inesperado — detalhes ficam no log do servidor, não na resposta |

---

## 9. Preocupações transversais

### Validação de entrada

`ValidationPipe` global com três flags que definem a postura:

```ts
whitelist: true,              // remove propriedades não declaradas no DTO
forbidNonWhitelisted: true,   // e responde 400 em vez de descartar em silêncio
transform: true,              // instancia o DTO e converte tipos (enableImplicitConversion)
```

O efeito prático mais importante é **anti-mass-assignment**: enviar `{"role": "ADMIN"}` em
um cadastro de cliente não é ignorado — é rejeitado com `400 property role should not
exist`. A escalada de privilégio por campo extra no JSON deixa de ser possível sem que cada
service precise se defender.

### Tratamento de erros

`AllExceptionsFilter` (`@Catch()` sem argumento, pega tudo):
`HttpException` preserva status e mensagem; erros conhecidos do Prisma são traduzidos
(`P2002` → 409, `P2003` → 409, `P2025` → 404); qualquer outra coisa vira `500` genérico com
stack **apenas no log**. Nada de host, usuário ou query do banco na resposta.

### Paginação e busca

`PaginacaoDto` centraliza `pagina`/`limite`/`busca` com limites sanos (`limite ≤ 100`
impede um `?limite=999999` que derrubaria a API) e expõe `skip` calculado. O helper
`paginar()` monta o envelope. Buscas textuais usam `mode: 'insensitive'` do Prisma.

### Rate limiting

Global: 120 requisições/minuto. Reforçado por rota nos pontos sensíveis a força bruta e a
abuso de e-mail: login 10/min, esqueci/redefinir senha 5/min, contato 5/min.

### Cabeçalhos e CORS

`helmet` com `crossOriginResourcePolicy: 'cross-origin'` — necessário para que as imagens de
`/uploads` sejam consumidas pelo frontend em outra origem. CORS lê `CORS_ORIGINS` (lista
separada por vírgula), com `credentials: true`.

### Arquivos estáticos e downloads autenticados

`UPLOAD_DIR` (padrão `./uploads`) tem **todas** as subpastas criadas no bootstrap, públicas
e privadas — os métodos do `UploadsService` já fazem `mkdir` recursivo na gravação, mas a
criação antecipada garante o diretório existente desde a subida.

A divisão entre o que é servido como estático e o que não é vive em
`modules/uploads/uploads.constantes.ts`, fonte única de `main.ts` e do tipo `PastaUpload`:

| Constante | Pastas | Servida em `/uploads/…` |
|---|---|---|
| `PASTAS_PUBLICAS` | `clientes`, `funcionarios`, `produtos`, `aparencia` | ✅ um `useStaticAssets` por pasta, com `prefix` próprio e `index: false` |
| `PASTAS_PRIVADAS` | `certificados`, `certificacoes` | ❌ nunca — só pelas rotas autenticadas |

`aparencia` é pública por necessidade: o logo aparece no cabeçalho do site institucional e
na tela de login, ambos antes de existir sessão, e o papel de parede entra como
`background-image` — não há como exigir `Bearer` em `<img src>` nem em `url()` de CSS. O
mesmo vale para as fotos de cliente, funcionário e produto.

Antes dos mounts, um middleware em `/uploads` **nega qualquer pasta fora de
`PASTAS_PUBLICAS`** com o mesmo corpo de erro 404 do resto da API. Não montar as pastas
privadas já bastaria para produzir 404 (a requisição cairia no roteador do Nest, que não
tem rota para `/uploads`), mas seria um 404 por acidente de roteamento: o middleware torna
a negação explícita e, por estar registrado antes, continua valendo se alguém remontar o
diretório inteiro como estático no futuro.

**Evidências de etapa e PDFs de certificado só saem por rota autenticada**
(`/certificacoes/documentos/:id/arquivo`, `/certificados/:id/pdf`), que aplicam o escopo do
CLIENTE e devolvem o arquivo como blob. O download da evidência vem com
`Content-Disposition: attachment` para que um SVG ou HTML anexado não execute no domínio
da API.

### Onde o byte fica: `UPLOAD_DRIVER`

O disco deixou de ser uma escolha universal. Em ambiente serverless (Vercel) o filesystem é
efêmero e recriado a cada instância fria: uma evidência de etapa gravada com `writeFile`
desaparece **sem erro nenhum**, e o registro no banco fica apontando para um arquivo que não
existe mais. O `UploadsService` passou a conversar só com a interface `Armazenamento`
(`modules/uploads/uploads.armazenamento.ts`), e quem implementa é o driver escolhido por
`UPLOAD_DRIVER`:

| Driver | Grava em | `/uploads/<pasta>/<arquivo>` |
|---|---|---|
| `disco` (padrão) | `UPLOAD_DIR` no filesystem local | `useStaticAssets` por pasta pública, como sempre |
| `supabase` | Supabase Storage, via REST | **302** para a URL pública do bucket |

Três decisões que sustentam isso:

- **A URL guardada no banco é a mesma nos dois drivers** — `/uploads/<pasta>/<uuid>.<ext>`.
  Não é economia de código: é o que mantém válidas as linhas gravadas antes da migração e o
  que deixa o frontend sem saber de onde o byte vem. Com o driver externo, quem vai atrás do
  arquivo é o navegador seguindo o 302 — o byte não passa pela API, que em serverless
  pagaria a banda duas vezes.
- **Dois buckets, espelhando `PASTAS_PUBLICAS` × `PASTAS_PRIVADAS`.** O bucket privado
  **não** sai por URL assinada: PDF de certificado e evidência continuam saindo por
  `GET /certificados/:id/pdf` e `GET /certificacoes/documentos/:id/arquivo`, que conferem a
  posse. URL assinada seria um segundo caminho de acesso ao mesmo byte, com uma segunda
  chance de esquecer a checagem — exatamente o IDOR que a migração corrigiu.
- **Configuração faltando quebra no boot**, em vez de cair de volta no disco. Degradar em
  silêncio num ambiente efêmero é o pior dos mundos: o upload responde 200 e o arquivo some
  na próxima instância fria.

O driver do Storage fala o REST por `fetch`, sem o `@supabase/supabase-js` — o SDK traz
junto PostgREST, realtime e um cliente de auth que este projeto não usa, pela mesma razão
que o painel não tem biblioteca de gráficos nem de ícones.

O allowlist de `/uploads` decide **antes** dos dois caminhos e é o mesmo nos dois: com o
driver externo não existe `serve-static` para servir de segunda barreira, e
`arquivoPublicoDaRota` passa a ser a única. Por isso ela exige `<pasta>/<arquivo>` — dois
segmentos exatos, decodificados uma vez, sem `..` nem `.`.

O e2e roda sempre em `disco`: ele grava arquivos de verdade e confere presença em disco
antes de afirmar qualquer 404. O driver do Supabase é coberto no unitário
(`uploads.armazenamento.spec.ts`), com o `fetch` interceptado.

Em dev, o Vite faz proxy de `/uploads` para a API, então o mesmo caminho relativo funciona
nos dois ambientes — inclusive o 404 das pastas privadas.

`helmet` continua com `crossOriginResourcePolicy: 'cross-origin'`: as fotos e o logo são
consumidos pelo frontend em outra origem.

### Notificações por e-mail

Mudanças de status na certificação avisam o cliente. O envio acontece **depois do commit e
sem `await`**, com try/catch que só registra em log: um e-mail que não saiu não pode
invalidar uma avaliação técnica já gravada, nem atrasar a resposta HTTP. Sem SMTP
configurado, o `MailService` loga `[SIMULADO]`.

### Logging

Logger do Nest (`error`, `warn`, `log`). Prisma loga `warn`+`error` em desenvolvimento e só
`error` fora dele. `500` sempre registra método, URL e stack. Nenhuma senha, hash ou token
é logado.

---

## 10. Arquitetura do frontend

### Composição da aplicação

```tsx
QueryClientProvider   // cache de servidor
  └─ AuthProvider     // sessão: usuario, entrar, sair, temPapel
      ├─ RouterProvider  // rotas
      └─ Toaster         // feedback (sonner)
```

### Camadas

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Transporte | `lib/api.ts` | axios, Bearer, tratamento de 401, `mensagemDeErro()` |
| Contratos | `types/index.ts` | Espelho tipado dos payloads da API |
| Acesso por domínio | `features/<x>/api.ts` | Funções tipadas por endpoint |
| Estado de servidor | `lib/queryClient.ts` | Config do Query + **chaves de cache centralizadas** |
| Sessão | `auth/*` | Contexto, `useAuth`, `RotaProtegida` |
| Apresentação | `components/*`, `features/<x>/*Page.tsx` | UI e composição |

### Sessão e revalidação

`AuthProvider` hidrata o usuário de `localStorage` para o primeiro render (sem flash de
tela vazia) e, em seguida, **revalida contra `GET /auth/me`**. Se o token não valer mais,
limpa tudo e derruba a sessão. Ou seja: o cache local acelera, mas o servidor decide.

O interceptor de resposta do axios fecha o ciclo: qualquer `401` com token presente limpa o
storage e redireciona para `/login?sessao=expirada`.

### Roteamento

Rotas públicas: `/` (site institucional), `/login`, `/esqueci-senha`,
`/redefinir-senha`, `/sem-permissao`.

O painel vive em uma **rota de layout sem `path`** — ela envolve
`<RotaProtegida><LayoutPainel/></RotaProtegida>` sem ocupar a raiz, que pertence à home.
Os filhos declaram caminhos absolutos, com proteções adicionais por papel nas subárvores:

| Rota | Quem vê |
|---|---|
| `dashboard`, `certificacoes`, `certificacoes/produto/:id`, `produtos`, `nao-conformidades`, `certificados` | Autenticados (o backend escopa o CLIENTE) |
| `produtos/novo`, `produtos/:id/editar`, `clientes/*`, `categorias`, `categorias/:id` | Equipe |
| `equipe/*` | Só `ADMIN` |

`*` cai em `NaoEncontradaPage`.

### Telas por domínio

| Tela | O que faz |
|---|---|
| `categorias-produto/CategoriasPage` | Lista com a versão vigente destacada e alerta de categoria **sem trilha** (que não aceita produto) |
| `categorias-produto/CategoriaDetalhePage` | Versões da trilha e editor de etapas com drag-and-drop, bloqueado quando a versão já tem produtos; botão "Nova versão" com confirmação |
| `certificacoes/CertificacaoDetalhePage` | Timeline com status, evidências, NCs, aviso de versão defasada, painel do certificado e histórico |
| `certificacoes/DocumentosEtapa` | Evidências da etapa: lista com tamanho, download e anexo; marca "obrigatória para aprovar" |
| `nao-conformidades/NaoConformidadesPage` | Para o cliente abre em "Aguardando ação" com resposta inline; para a equipe, a mesma lista com cliente e produto |
| `certificados/CertificadosPage` | Filtros por situação, download do PDF e ações de suspender/cancelar/reativar (ADMIN) |
| `certificados/PainelCertificadoProduto` | Emissão dentro da tela do produto — o desfecho da trilha fica onde a trilha está |

Downloads autenticados (PDF de certificado e evidências) passam pelo axios como **blob**:
um link direto não serve, porque a rota exige o `Authorization` que só o interceptor injeta.

### Site institucional (`features/home`)

A home pública é a recriação do `app/views/home.php` do legado — mesmas seções, mesmo
conteúdo e mesma identidade visual do template "Gp" (acento `#0076A8`, Roboto/Raleway/
Poppins) —, agora **sem Bootstrap, AdminLTE, AOS, Swiper, GLightbox, Isotope nem
PureCounter**. A página não faz nenhuma requisição a CDN de script.

| Arquivo | Papel |
|---|---|
| `HomePage.tsx` | Composição das seções, na ordem do legado |
| `conteudo.ts` | **Todo o texto e os dados** (empresa, serviços, depoimentos, PDFs) |
| `secoes/*.tsx` | Uma seção por arquivo: Cabeçalho, Hero, Sobre, Diferenciais, Serviços, ChamadaAcao, Números, Depoimentos, Contato, Rodapé, BotõesFlutuantes |
| `hooks.ts` | Substitutos das bibliotecas do legado (abaixo) |
| `Revelar.tsx` | Wrapper declarativo do efeito de entrada (`data-aos="fade-up"`) |
| `api.ts` | `POST /api/contato` |
| `home.css` | Tema institucional, escopado em `.home` |

Substituições de biblioteca — ~80 linhas de hook contra ~200 KB de JS externo:

| Legado | Aqui |
|---|---|
| AOS (revelar ao rolar) | `useRevelar` com `IntersectionObserver`, respeitando `prefers-reduced-motion` |
| PureCounter (contagem animada) | `useContador` com `requestAnimationFrame` e easing |
| Swiper (carrossel) | `useCarrossel`: rotação a cada 5s, pausa no hover/foco, marcadores clicáveis |
| `main.js` (classe `.scrolled` no body) | `useRolagem` |

**Convivência dos dois temas.** O painel é escuro e seu CSS é global; a home é clara.
Em vez de disputar especificidade, `useTemaInstitucional` adiciona
`body.tema-institucional` enquanto a rota está montada e remove ao desmontar. Todo o
`home.css` está escopado em `.home`, então nada vaza para o painel.

**Conteúdo dinâmico.** O formulário de contato usa React Hook Form + Zod com o schema
espelhando o `CriarMensagemContatoDto` (nome ≥3, e-mail válido, assunto ≥3, mensagem ≥10)
e envia para a rota pública `POST /api/contato`. Campos opcionais vazios são omitidos —
`forbidNonWhitelisted` no servidor não tolera lixo no payload.

**Diferenças conscientes em relação ao legado:**

- o formulário **realmente envia**; antes apontava para `forms/contact.php`, arquivo
  ausente do repositório — nenhuma mensagem do site chegava a lugar algum
- o item "Portfólio" saiu do menu: a seção correspondente já havia sido removida da
  página, deixando o link morto (o rodapé apontava para `#portifolio`, com typo)
- o botão "Login" vira "Painel" quando existe sessão ativa
- o mapa do Google usa o endereço real; o embed do legado apontava para um lugar de
  teste ("Trabalho Laisla")
- ícones de redes sociais sem perfil definido ficam desabilitados em vez de `href=""`
  (que recarregava a página)
- a imagem da chamada para ação era `position: fixed` e vazava sobre outras seções em
  telas curtas; agora fica contida
- o menu móvel ganhou cortina que fecha ao toque fora e trava a rolagem do fundo
- o botão do WhatsApp tem um pulso discreto (respiro + anel a cada 3s), suspenso no hover
  e desligado sob `prefers-reduced-motion`

### Estado de servidor

`staleTime` de 30s, sem refetch ao focar a janela, e retry inteligente: erros `4xx`
**não** são repetidos (insistir em um `403` é ruído), `5xx` tentam até 2 vezes. Mutations
não repetem. As chaves de cache ficam todas em `chaves` — sem strings soltas pelo código,
o que torna a invalidação após mutação previsível.

### Formulários

React Hook Form + Zod via `@hookform/resolvers`. O schema Zod é a fonte de verdade no
cliente e reflete o DTO do servidor; o servidor valida de novo, sempre. Erros da API são
traduzidos por `mensagemDeErro()`, que também detecta `ERR_NETWORK` e diz "verifique se o
backend está no ar" em vez de exibir um erro técnico.

### UI e tema

CSS puro com design tokens em `:root` (`--cor-*`, `--vidro-*`, `--raio`, `--espaco`), tema
escuro "liquid glass" herdado do legado — mas sem Bootstrap nem AdminLTE. A classe `.vidro`
concentra o efeito de vidro. Componentes reutilizáveis: `LayoutPainel`, `Sidebar`
(itens filtrados por papel), `CabecalhoPagina`, `Campo`, `CampoBusca`, `Badge`,
`Progresso`, `Paginacao`, `ModalConfirmacao`, `EstadoVazio`, `Carregando`.

### Build

Vite com alias `@` → `src`, proxy de `/api` e `/uploads` para a porta 3000 (por isso não há
CORS em dev), e `manualChunks` separando `vendor` (react, router), `query` e `forms` —
mantém o chunk principal pequeno e melhora o cache entre deploys.

---

## 11. Configuração e variáveis de ambiente

### Backend — `backend/.env` (modelo em `.env.example`)

| Variável | Padrão | Função |
|---|---|---|
| `NODE_ENV` | `development` | Verbosidade do log do Prisma |
| `PORT` | `3000` | Porta HTTP da API |
| `API_PREFIX` | `api` | Prefixo global (e base do Swagger) |
| `CORS_ORIGINS` | `http://localhost:5173` | Origens liberadas, separadas por vírgula |
| `DATABASE_URL` | — | String de conexão PostgreSQL (**local: porta `5433`**) |
| `JWT_SECRET` | — | **Obrigatória** (`getOrThrow`); gere com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `8h` | Validade do access token |
| `BCRYPT_SALT_ROUNDS` | `12` | Custo do bcrypt |
| `CRON_SECRET` | vazio | Segredo do gatilho externo da expiração (§9). **Vazio = rota fechada** |
| `UPLOAD_DRIVER` | `disco` | Onde os arquivos ficam: `disco` ou `supabase` (§9) |
| `UPLOAD_DIR` | `./uploads` | Raiz dos arquivos enviados (só com `disco`; absoluto é respeitado) |
| `UPLOAD_MAX_SIZE_MB` | `5` | Tamanho máximo por imagem |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | vazio | **Obrigatórias** com `UPLOAD_DRIVER=supabase` — sem elas a API recusa subir |
| `SUPABASE_BUCKET_PUBLICO` / `SUPABASE_BUCKET_PRIVADO` | `procert-publico` / `procert-privado` | Buckets que espelham `PASTAS_PUBLICAS` × `PASTAS_PRIVADAS` |
| `PUBLIC_URL` | `http://localhost:3000` | Base pública dos arquivos |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_SECURE` | `smtp.hostinger.com` / `465` / `true` | SMTP |
| `MAIL_USER` / `MAIL_PASS` / `MAIL_FROM` | vazio | Credenciais; **vazio ⇒ e-mail apenas logado** |
| `FRONTEND_URL` | `http://localhost:5173` | Base do link de redefinição de senha |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | `admin@procertocp.com.br` / `Procert@2026` | Admin criado pelo seed |
| `LEGACY_MYSQL_*` | vazio | Conexão com o MySQL legado, só para o ETL |
| `LEGACY_DEFAULT_PASSWORD` | `ProcertTrocar@2026` | Senha provisória de usuários migrados sem hash aproveitável |

### Frontend — `frontend/.env`

| Variável | Padrão | Função |
|---|---|---|
| `VITE_API_URL` | `/api` | Base das chamadas. Em dev, caminho relativo usando o proxy do Vite; em produção, a URL absoluta da API |

`.env` **não** é versionado; `.env.example` é o contrato. `JWT_SECRET` sem valor derruba o
boot intencionalmente — falhar cedo é melhor que rodar com segredo padrão.

---

## 12. Ambiente local

### Pré-requisitos

Node.js 20+, Docker Desktop, npm.

### Subida completa

```bash
# 1. Banco (na raiz do projeto)
docker compose up -d
#    PostgreSQL em localhost:5433  ·  Adminer em http://localhost:8080

# 2. Backend
cd backend
cp .env.example .env          # ajuste DATABASE_URL para a porta 5433 e gere o JWT_SECRET
npm install
npx prisma migrate dev        # aplica as migrations
npm run seed                  # 27 UFs, 4 etapas padrão, admin inicial
npm run start:dev             # API em watch mode

# 3. Frontend (outro terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Endereços e credenciais

| Serviço | Endereço |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000/api |
| Swagger | http://localhost:3000/api/docs |
| Adminer | http://localhost:8080 (server `postgres`, user/pass/db `procert`) |
| PostgreSQL | `localhost:5433` |

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador (seed) | `admin@procertocp.com.br` | `Procert@2026` |

> **Porta 5433, não 5432.** O container foi remapeado em `docker-compose.yml`
> (`'5433:5432'`) porque uma instância nativa de PostgreSQL já ocupava a 5432 nesta
> máquina — o sintoma era `P1000: Authentication failed`, já que o Prisma conectava no
> servidor errado. `DATABASE_URL` precisa refletir isso. O `README.md` ainda menciona 5432.

### Verificação rápida por linha de comando

```bash
# login e captura do token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@procertocp.com.br","senha":"Procert@2026"}' \
  | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

curl -s http://localhost:3000/api/auth/me           -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/dashboard/metricas -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/dashboard/metricas   # 401
```

---

## 13. Operação e manutenção

### Scripts — backend

| Comando | Ação |
|---|---|
| `npm run start:dev` | API em watch mode |
| `npm run build` + `npm run start:prod` | Build e execução de produção |
| `npm run seed` | UFs, categoria "Geral" com trilha v1 e admin (idempotente via upsert) |
| `npm run prisma:migrate` | Cria/aplica migration em desenvolvimento |
| `npm run prisma:deploy` | Aplica migrations em produção (não gera novas) |
| `npm run prisma:generate` | Regenera o client tipado |
| `npm run prisma:studio` | Explorador visual do banco |
| `npm run migrate:legacy` | ETL do MySQL legado (aceita `-- --dry-run`) |
| `npm run migrate:categorias` | Catálogo global → trilhas por categoria (aceita `-- --dry-run`) |
| `npm test` / `npm run lint` | Ver §14 — ambos falham hoje |

> **Não rode `npm run build` com o `start:dev` ativo.** O `deleteOutDir` do nest-cli apaga
> o `dist/` embaixo do processo em watch e o derruba.

### Rotina agendada

**Expiração de certificados — agendada dentro da API desde 19/08/2026.**

`ExpiracaoCertificadosCron` (`modules/certificados/expiracao.cron.ts`) roda todo dia às
**03:00** no fuso do processo e chama `CertificadosService.expirarVencidos()` **direto, sem
passar por HTTP**. Marca como `VENCIDO` tudo que está `EMITIDO` ou `SUSPENSO` com
`dataValidade` no passado; `CANCELADO` não muda, por ser estado terminal.

Antes disso a rotina existia mas **ninguém a chamava**: certificado fora da validade
continuava constando como `EMITIDO` até alguém acionar a rota na mão. Para um organismo de
certificação isso não é detalhe de interface — é exibir como válido um documento que não
é mais.

**Por que dentro da API, e não num cron externo chamando a rota**

O cron externo é a solução mais limpa em separação de responsabilidades e roda uma vez só
mesmo com várias instâncias. O custo é a credencial: ele precisaria de um token de `ADMIN`
de longa duração guardado numa variável de ambiente do agendador. Esse token dá poder total
sobre a API — excluir cliente, emitir e cancelar certificado —, fica fora do sistema, sem
rotação, e a sessão hoje **não tem lista de revogação** (ver §15, "Modelo de sessão"): se
vazar, só o vencimento o encerra.

Trocar essa exposição permanente por um `updateMany` diário resolvido em processo é o
negócio melhor. O custo do caminho escolhido é o inverso e é conhecido: **com múltiplas
instâncias da API, o job dispara em todas**. É tolerável porque `expirarVencidos()` é um
único `updateMany` idempotente cujo `where` já exclui o que ele acabou de mudar — a segunda
execução afeta zero linhas. Não é gratuito (N conexões, N linhas de log), e por isso o
comportamento é controlado por `EXPIRACAO_CRON_ATIVA`.

| Variável | Padrão | Efeito |
|---|---|---|
| `EXPIRACAO_CRON_ATIVA` | `true` | Só o valor literal `false` desliga. Ao passar a rodar em mais de uma instância, deixe `true` em exatamente uma. Desligado, o serviço registra isso no boot apontando a rota manual — desligar em silêncio seria pior que o problema original. |

`POST /api/certificados/expirar-vencidos` (ADMIN) **continua existindo** para acionamento
manual e para quem preferir o agendador externo. O log do resultado
(`N certificado(s) marcado(s) como vencido(s).`, nível `log`) vive no service e não no
agendador, de modo que os dois caminhos deixam o mesmo rastro.

O agendamento é um provider separado do `CertificadosService` de propósito: agendamento é
infraestrutura, e o service continua testável sem levantar o Nest nem o `ScheduleModule`.
Coberto por `expiracao.cron.spec.ts`, que inclui um caso levantando o Nest de verdade para
conferir que o job está registrado no `SchedulerRegistry` — instanciar a classe na mão não
exercita o decorator, e um `@Cron` removido por acidente passaria despercebido.

**E em serverless? O gatilho externo, desenhado contra a própria objeção acima (23/08/2026)**

Nada disso roda numa função. `@nestjs/schedule` agenda um timer no processo, e em serverless
não existe processo entre uma requisição e outra: o timer nasce no boot da instância e morre
com ela, sem nunca chegar às 03:00. Por isso a produção na Vercel tem
`EXPIRACAO_CRON_ATIVA=false` — deixá-la ligada não quebra nada, apenas mente no log.

Lá quem acorda a rotina é o **Vercel Cron** declarado em `backend/vercel.json`, chamando
`GET /api/certificados/cron/expirar-vencidos` às 06:00 UTC (03:00 em Brasília, o mesmo
horário do job em processo).

Isso é exatamente o "cron externo chamando a rota" recusado acima — mas **sem a credencial
que era o motivo da recusa**. O que foi recusado era um token de `ADMIN` de longa duração
guardado no agendador; o que existe agora é `CRON_SECRET`, e a diferença é de natureza:

| | Token de ADMIN | `CRON_SECRET` |
|---|---|---|
| É sessão? | Sim — passa pelo `JwtStrategy`, vira `UsuarioAutenticado` | **Não.** A rota é `@Public()` e compara o segredo em `timingSafeEqual`, sem tocar no `JwtStrategy` nem no `RolesGuard` |
| O que abre | Toda a API: excluir cliente, emitir e cancelar certificado | **Uma porta só**, sem corpo nem parâmetro: um `updateMany` idempotente derivado da data |
| Estrago se vazar | Total, até o vencimento, sem revogação | Disparar hoje o que rodaria de madrugada |
| Como se revoga | Não há lista de revogação | Trocar a variável e redeployar |

Duas decisões que não são estéticas: **sem `CRON_SECRET` configurado a rota fica fechada**,
nunca aberta — um deploy sem a variável deve falhar visível no log do agendador, e não
executar rotina de negócio para quem pedir; e a comparação é em **tempo constante**, porque
`===` sobre segredo vaza o tamanho do prefixo correto pelo tempo de resposta, e aqui quem
chama pode medir à vontade. A rota fica **fora do Swagger** (`@ApiExcludeEndpoint`) e tem
`@Throttle` estreito (4/min): a rotina legítima roda uma vez por dia.

Coberto por `expiracao.cron.controller.spec.ts` (10 casos). O que os testes travam não é o
401 — é que a **rotina de negócio não roda** em nenhum caminho de recusa, e que a mensagem
não distingue segredo errado de segredo ausente.

### Scripts — frontend

| Comando | Ação |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` + build de produção em `dist/` |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint (config existe neste pacote) |

### Fluxo de mudança no schema

```
edita prisma/schema.prisma
  → npx prisma migrate dev --name descricao_curta
      (gera SQL versionado em prisma/migrations/ e regenera o client)
  → ajusta services/DTOs afetados
  → espelha o contrato em frontend/src/types/index.ts
```

Em produção: `prisma migrate deploy`. Nunca editar uma migration já aplicada — crie outra.

### ETL do legado

`prisma/migrate-legacy.ts` (~500 linhas) carrega na ordem das FKs:
`estados → clientes → funcionários → produtos → etapas → certificações → histórico →
pagamentos`, mantendo mapas de `id` antigo → novo. Tratamento de senhas: texto puro é
re-hasheado com bcrypt (o usuário continua entrando com a mesma senha), hash `$2y$` do PHP
é aproveitado, e ausência de senha recebe `LEGACY_DEFAULT_PASSWORD`. Sempre rode primeiro
com `--dry-run`.

> ⚠️ **O script não roda hoje.** Ficou para trás no refactor de trilhas versionadas — ver
> §15, "ETL do legado quebrado". O cutover já aconteceu, então isso só volta a importar se
> houver reimportação.

### Transposição para trilhas por categoria

`prisma/migrate-categorias.ts` move uma base do catálogo global para o modelo versionado:
cria a categoria "Geral", a versão 1 da sua trilha, copia cada etapa do catálogo (inclusive
as inativas que ainda estejam em uso, como não obrigatórias), aponta os produtos existentes
e remapeia `certificacoes_produto.etapa_id`. É idempotente e aceita `-- --dry-run`.

A transição foi feita em **três passos**, porque a FK antiga impedia o remapeamento:

```
1. migration `categorias_e_modelos_trilha`  (aditiva: tabelas novas, colunas NULLABLE,
                                             derruba a FK para o catálogo global)
2. npm run migrate:categorias                (transpõe os dados)
3. migration `fecha_transicao_trilhas`       (NOT NULL + FK para modelos_etapa)
```

Uma armadilha que o script documenta: `etapas_certificacao` e `modelos_etapa` têm sequências
de id independentes que costumam se sobrepor (1..4 → 1..4 numa base recém-semeada). Por isso
a checagem de "já migrado" é feita **no nível da execução**, não linha a linha — o teste por
id daria falso positivo e pularia o remapeamento em silêncio.

O model `EtapaCertificacao` continua no schema, marcado como obsoleto, para permitir
conferência pós-cutover. O módulo `etapas` do backend e a feature correspondente do frontend
já foram removidos.

### Encerrando o ambiente

```bash
docker compose down          # containers (o volume procert-pgdata persiste)
docker compose down -v       # apaga também os dados
```

No Windows, processos `node` iniciados por wrappers de shell podem sobreviver ao
encerramento do terminal. Se a porta continuar ocupada:
`netstat -ano | findstr :3000` e `taskkill /PID <pid> /F`.

---

## 14. Qualidade: testes, lint e lacunas reais

Estado medido em **23/08/2026**, com a saída real de cada comando — não por leitura de
código.

| Item | Situação |
|---|---|
| Compilação do backend (`tsc --noEmit -p tsconfig.build.json`) | ✅ 0 erros |
| `npm run build` (backend) | ✅ 0 erros |
| `npm run build` (frontend) | ✅ `tsc -b && vite build`, 239 módulos |
| **`npm run lint` (backend)** | ✅ **executa e sai 0** — `eslint.config.js` criado em `0966e96` |
| **`npm run lint:ci` (ambos)** | ✅ 0 — é o que o CI roda: `--max-warnings=0` e **sem `--fix`**. O `lint` de desenvolvimento reescreve os arquivos, então usá-lo no pipeline faria o job passar justamente quando houvesse o que corrigir. |
| `npm run lint` (frontend) | ✅ |
| **CI (GitHub Actions)** | ✅ dois jobs obrigatórios, ~1m15s por execução (`8fd0363`, `d9ea0aa`) |
| **`npm test` (backend)** | ✅ **234 testes, 12 suítes** |
| **`npm run test:e2e` (backend)** | ✅ **75 testes, 2 suítes**, contra PostgreSQL de verdade |
| `npm run typecheck:scripts` | ❌ **falha, e é esperado** — dois erros em `migrate-legacy.ts` (§15). Fora de pipeline obrigatório de propósito. |
| Testes no frontend | ❌ **inexistentes** — é a lacuna que sobrou |
| Validação funcional manual | ✅ mantida a cada incremento |

### Cobertura dos services alvo

`npm run test:cov`, statements. A meta declarada é **por service coberto**, não um número
global: uma média que inclui `aparencia` e `clientes` (ainda sem teste) não diria nada
sobre o que foi protegido.

| Alvo | Statements | Branches |
|---|---|---|
| `common/utils/senha.util.ts` | 100% | 100% |
| `modules/auth/auth.service.ts` | 100% | 100% |
| `modules/mail/mail.service.ts` | 100% | 83,33% |
| `modules/nao-conformidades/nao-conformidades.service.ts` | 98,14% | 81,25% |
| `modules/modelos-trilha/modelos-trilha.service.ts` | 90,47% | 90,47% |
| `modules/certificacoes/certificacoes.service.ts` | 84,84% | 67,50% |
| `modules/certificados/certificados.service.ts` | 81,05% | 77,77% |
| `modules/certificacoes/exportacao.service.ts` | 94,36% | 56,84% |

Somados aos 75 casos de e2e, cobrem as regras que a evolução do sistema acumulou:
imutabilidade de versão de trilha, renumeração 1..N na migração, máquina de estados da NC,
ciclo do certificado, exigência de evidência e o escopo do CLIENTE.

**Services de `6bb7be8` ainda sem unitário:** `graficos.service.ts` e o controller de
`health`. Os dois têm cobertura de e2e — escopo do CLIENTE, formato e códigos de status —,
mas nenhum teste de unidade.

O `exportacao.service.ts` era o terceiro e **deixou de ser.** São 21 casos cobrindo
`nomeAba()`, a data gravada como `Date` com `numFmt`, a ordenação do histórico e o CSV
(BOM, separador `;`, escape de aspas e quebra de linha). A suíte **gera o XLSX e relê o
buffer**: é a releitura que prova que o Excel aceitaria o arquivo — o e2e baixa e não abre,
então nada disso era alcançável por teste de rota.

Escrevê-la revelou dois defeitos reais em `nomeAba()`, ambos da mesma causa — o laço de
desempate derivava cada tentativa do nome já sufixado, em vez da base:

1. As marcas **empilhavam** em nome curto: `1. Ensaio(2)(3)(4)` em vez de `1. Ensaio(4)`.
2. A partir da décima colisão o nome ia a **32 caracteres**, porque `(10)` ocupa 4 e o
   corte era fixo em 28. O exceljs truncava de volta para 31 e comia o parêntese de
   fechamento, deixando `(10`.

Nenhum dos dois é alcançável hoje, porque `CertificacaoProduto.ordem` é única por produto
e o prefixo já separa as abas — o desempate é defensivo. Corrigidos assim mesmo, junto com
um comentário do service que estava errado: ele dizia que nome inválido só apareceria ao
abrir o arquivo, quando o exceljs 4.4.0 **lança** em caractere proibido, nome vazio e
duplicata. Sem o saneamento a exportação daria 500 na geração.

### Como os testes estão organizados

**Unitários** (`npm test`, Prisma mockado, sem banco):

- `src/testing/prisma.mock.ts` — `PrismaService` mockado com um `$transaction` que **abre
  mesmo a transação**, entregando ao callback um cliente separado (`tx`) inalcançável de
  fora. Uma chamada registrada em `tx.*` só pode ter acontecido lá dentro; se o
  `$transaction` sumir do service, a chamada aparece em `prisma.*` e o teste quebra. Um
  mock ingênuo (`$transaction: (cb) => cb(prisma)`) faria todos esses testes passarem sem
  proteger nada. `chamadasNaTransacao` registra as operações em ordem, o que permite
  afirmar que duas escritas caíram no **mesmo** commit.
- `src/testing/usuarios.fixture.ts` — `admin()`, `funcionario()`, `cliente(id)`. Cada spec
  tem ao menos um caso de escopo de papel: autorização é testada junto da regra, não numa
  suíte à parte.
- Armadilha registrada no próprio helper: **`expect.anything()` não funciona contra um mock
  do `jest-mock-extended`**. O `mockDeep` cria qualquer propriedade sob demanda, inclusive
  `asymmetricMatch` — o Jest checa exatamente essa propriedade para descobrir se o valor
  recebido é um matcher, encontra uma função, trata o mock como matcher e o resultado
  aparece como `undefined`.

**E2E** (`npm run test:e2e`, PostgreSQL real):

- Banco dedicado `procert_test`, criado pelo `globalSetup` com `prisma migrate deploy` — o
  mesmo comando do ambiente real, então o schema sob teste é o de produção.
- Duas travas contra apagar dados por engano (a suíte trunca as tabelas): tanto o
  `setup-env.ts` quanto o `globalSetup` recusam `DATABASE_URL` cujo banco não termine em
  `_test`.
- `src/bootstrap.ts` é chamado pelo `main.ts` **e** pelo e2e. Sem isso, o teste levantaria
  uma aplicação sem `ValidationPipe`, sem filtro de exceções e sem os mounts de `/uploads`
  — justamente as peças que ele existe para cobrir.
- Os arquivos são gravados de verdade em disco antes das asserções de 404, e há um bloco de
  pré-condição que confere presença e tamanho: um 404 só prova negação se o arquivo estiver
  lá.
- `requisicaoCrua()` envia o caminho literalmente, como o `curl --path-as-is`. É necessário
  porque todo cliente HTTP conforme a especificação de URL resolve segmentos `..` — mesmo
  escritos como `%2e%2e` — antes de abrir a conexão; usar o supertest nos testes de
  travessia daria falso verde. Foi exatamente esse erro que invalidou a verificação manual
  de 17/08 (§15).

### A suíte foi verificada por mutação (23/08/2026)

Antes de construir o CI em cima dela, cada invariante foi quebrado de propósito para
confirmar que a suíte fica vermelha. Um gate montado sobre testes que não detectam nada é
pior que nenhum gate: dá confiança sem dar proteção.

| Invariante quebrado | Testes vermelhos |
|---|---|
| Normalização `$2y$` → `$2b$` removida | 2 |
| `redefinirSenha` sem `$transaction` | 2 |
| `listar` confiando no `clienteId` da query (o IDOR) | 1 unitário + 1 e2e |
| `@Roles(ADMIN)` removido de `expirar-vencidos` | 2 |
| `forbidNonWhitelisted` removido | 2 |
| `certificados` movido para `PASTAS_PUBLICAS` | 2 |
| `pastaPublicaDaRota` lendo o caminho cru | 7 |
| Escopo do CLIENTE removido de `graficos.service` | 3 |

**8 de 8 detectadas.** Duas merecem nota:

- A do `$transaction` é a que valida o próprio `prisma.mock.ts`. Se o mock fosse ingênuo
  (`$transaction: (cb) => cb(prisma)`), essa mutação passaria em silêncio e todos os testes
  de atomicidade seriam decorativos.
- A do caminho cru reintroduz exatamente o defeito encontrado na reauditoria de 19/08
  (§15). Derrubar 7 casos confirma que os testes de travessia não são tautologia — é o
  `requisicaoCrua()` fazendo o trabalho que o supertest não faria.

### O que ainda falta

1. **CI** — GitHub Actions com build + lint + test nos dois pacotes e PostgreSQL de
   serviço. É o que impede a regressão de tudo isto. Primeiro da fila (§17).
2. **Testes no frontend** — zero. As telas de trilha (drag-and-drop, renumeração) e o
   cálculo de contraste de `lib/tema.ts` são os candidatos com mais regra por linha.
3. Services ainda sem unitário: `ProdutosService.criar` (abertura da trilha),
   `FuncionariosService` (proteção do último ADMIN), `DashboardService` (classificação e
   escopo), `AparenciaService` (allowlist de tokens), `UploadsService`,
   `ExportacaoService` (`nomeAba`, data como `Date`) e `GraficosService` (faixas de
   vencimento, desempate do ranking).

## 15. Problemas conhecidos e decisões registradas

### Build incremental × `deleteOutDir` (corrigido)

`nest-cli.json` define `deleteOutDir: true`, que apaga `dist/` a cada start. Com
`incremental: true` herdado do `tsconfig.json`, o `tsc` consultava
`tsconfig.build.tsbuildinfo`, concluía que nada havia mudado e **não emitia nada** — o
start então falhava com `Cannot find module '…/dist/main'`, logo após imprimir
"Found 0 errors". Reproduzia em toda execução após a primeira.

Correção aplicada: `"incremental": false` em `backend/tsconfig.build.json`, com comentário
explicando o motivo. O build de desenvolvimento (`tsconfig.json`) segue incremental.
Se o sintoma reaparecer: `rm -rf dist tsconfig.build.tsbuildinfo` e reinicie.

### Porta do PostgreSQL (resolvido em 19/08/2026)

Container mapeado em `5433:5432` para conviver com uma instância nativa na 5432.

**Correção de uma afirmação desta documentação.** Estava registrado aqui, e no §17, que o
`README.md` documentava 5432 e que dava a entender que `npm test` e `npm run lint`
funcionavam. Conferido: o `README.md` **já dizia 5433** e **já dizia explicitamente** que os
dois comandos não funcionavam. Quem estava errada era esta documentação, não o README.

O que de fato estava errado era o **`backend/.env.example`**, que trazia
`localhost:5432` — e é ele que o guia manda copiar para `.env`. Era a causa real do
`P1000: Authentication failed` de quem seguia o passo a passo. Corrigido em 19/08/2026, com o motivo
em comentário no próprio arquivo.

### Modelo de sessão

Access token de 8h no `localStorage`, sem refresh token e sem revogação por lista. A
revalidação no banco a cada request cobre desativação de conta, mas **não** invalida um
token vazado antes de expirar. Para produção, o caminho é cookie `httpOnly` + `SameSite` e
uma rota de refresh.

### `Pagamento` modelado sem módulo de escrita

A tabela existe, os produtos expõem `ultimoPagamento`, mas não há controller/service de
pagamentos. É uma extensão prevista, não um bug — só não deve ser confundida com
funcionalidade entregue.

### `/uploads` servido sem autenticação — ✅ RESOLVIDO (17/08/2026 `7102845`, reauditado e endurecido em 19/08/2026 `a4a4585`)

O `main.ts` montava o diretório inteiro de `UPLOAD_DIR` em `/uploads/` com um único
`useStaticAssets`. PDF de certificado e evidência de etapa — documento formal e dado de
cliente — eram baixáveis por qualquer um que tivesse a URL, sem token. Os nomes em UUID
não são adivinháveis e nenhuma tela expõe esses caminhos, mas isso é obscuridade, não
controle de acesso.

Correção aplicada: um `useStaticAssets` **por pasta pública** (`PASTAS_PUBLICAS` em
`modules/uploads/uploads.constantes.ts`) e um middleware de negação em `/uploads`,
registrado antes dos mounts, que devolve 404 para qualquer outra pasta. Detalhe em §9.

Duas decisões que valem registro:

- **`aparencia` entrou nas públicas**, embora a correção prevista falasse só em
  `produtos|clientes|funcionarios`. O logo e o papel de parede do painel são consumidos por
  `<img src>` e por `url()` de CSS, inclusive no site institucional e na tela de login,
  antes de existir sessão — fechá-los quebraria a marca do painel sem ganho de segurança:
  são arquivos que o próprio ADMIN publica para exibição pública.
- **O middleware foi mantido mesmo sendo redundante hoje.** Sem mount, a requisição já
  cairia no roteador do Nest e viraria 404. A negação explícita existe para que remontar o
  estático por engano no futuro não reabra a exposição em silêncio.

Verificado com a API no ar: PDF de certificado e evidência em `/uploads/…` respondem 404
com o arquivo presente em disco (o mesmo arquivo respondia 200 antes da mudança), foto de
produto segue em 200, e as rotas autenticadas continuam devolvendo 401 sem token, 200 para
o cliente dono e 403 para cliente alheio.

#### Reauditoria em 19/08/2026: o middleware não cobria travessia

A verificação de 17/08 usou `curl` **sem `--path-as-is`**. O `curl` normaliza o caminho no
cliente, então o request de travessia saiu do socket já como
`/uploads/certificados/<uuid>.pdf` — o 404 era real, mas provava o mesmo que o teste
trivial. Refeito com `--path-as-is` e com as três formas codificadas (`%2e%2e%2f`, `..%2f`,
`%2e%2e/%2e%2e/`), **nenhuma devolveu 200**: não houve regressão de segurança.

O que a reauditoria encontrou foi outra coisa, no corpo das respostas. Nos casos de
travessia o 404 vinha com `"Cannot GET …"` — o 404 do roteador do Nest —, e não com
`"Arquivo não encontrado."`, que é o do middleware. Ou seja: **o middleware deixava a
travessia passar** e quem negava era a confinação de raiz do `serve-static` de cada pasta.

Isso invalidava a razão de existir do middleware. Ele lia a pasta com
`req.path.split('/')[0]`, sobre o texto **cru** da URL: em
`/uploads/produtos/%2e%2e%2fcertificados/x.pdf` a primeira pasta é `produtos`, está na
allowlist, e ele chamava `next()`. No arranjo atual — um mount por pasta — o
`serve-static` de `produtos/` recusa sair da própria raiz e o resultado final é 404. Mas no
cenário exato contra o qual o middleware foi escrito (alguém remontar o diretório inteiro
de uploads como estático), `produtos/../certificados/x.pdf` cairia **dentro** da raiz do
mount e voltaria a ser servido com 200.

Correção: `pastaPublicaDaRota()` em `uploads.constantes.ts` substitui a leitura crua. Ela
**decodifica o caminho uma vez** — a mesma decodificação que o `serve-static` faz antes de
resolver o arquivo, de modo que a decisão de allowlist e a resolução em disco olham para o
mesmo texto —, recusa qualquer segmento `..` ou `.`, recusa codificação inválida (`%ZZ`) e
só então confere a primeira pasta contra `PASTAS_PUBLICAS`. A separação de segmentos inclui
a barra invertida, que no Windows também separa diretório.

Verificado com a API no ar, com o PDF de certificado presente em disco (2316 bytes). Antes
da correção os casos de travessia respondiam 404 com `"Cannot GET …"`; depois, todos
respondem 404 com `"Arquivo não encontrado."` — a negação passou a ser do middleware:

| Requisição | Antes | Depois |
|---|---|---|
| `--path-as-is …/produtos/../certificados/<uuid>.pdf` | 404 `Cannot GET` | 404 `Arquivo não encontrado.` |
| `…/produtos/%2e%2e%2fcertificados/<uuid>.pdf` | 404 `Cannot GET` | 404 `Arquivo não encontrado.` |
| `…/produtos/..%2fcertificados/<uuid>.pdf` | 404 `Cannot GET` | 404 `Arquivo não encontrado.` |
| `--path-as-is …/produtos/%2e%2e/%2e%2e/certificados/<uuid>.pdf` | 404 `Cannot GET` | 404 `Arquivo não encontrado.` |
| `--path-as-is …/produtos/..%5ccertificados/<uuid>.pdf` | 404 `Cannot GET` | 404 `Arquivo não encontrado.` |
| `--path-as-is …/produtos/%ZZ/x.png` | 404 | 404 `Arquivo não encontrado.` |
| `…/produtos/<uuid>.png` (controle) | 200 | 200 |
| `…/certificados/<uuid>.pdf` (controle) | 404 | 404 |

Nota sobre o quarto caso: sem `--path-as-is` o próprio `curl` decodifica `%2e%2e` e
normaliza, e o request sai como `/certificados/<uuid>.pdf` — fora de `/uploads`. Só a forma
com `--path-as-is` exercita o servidor.

**Confirmado na mesma reauditoria** (0.3 da revisão): `PastaUpload` **já é derivado** das
constantes (`(typeof PASTAS_PUBLICAS)[number] | (typeof PASTAS_PRIVADAS)[number]`) em
`uploads.constantes.ts`, e o `uploads.service.ts` apenas reexporta o tipo — não há duas
listas. E `aparencia` grava por `salvarImagem` (`aparencia.service.ts:134`, allowlist só de
imagem), não por `salvarDocumento`: PDF ou planilha ali seriam publicação irrestrita, já
que é a única pasta pública onde um ADMIN publica arquivo que qualquer um baixa sem token.

### Produtos migrados não têm `exigeDocumento`

O script de transposição copiou as etapas do catálogo global, que não tinha esse conceito —
todas nasceram com `exigeDocumento: false`. Para passar a exigir evidência nesses produtos é
preciso criar uma versão nova da trilha da categoria e migrar cada produto, já que a versão
em uso é imutável por construção.

### Vulnerabilidades do `npm audit` (backend) — ✅ RESOLVIDO no que tem correção (17/08/2026 `ed279ee`), remedido o número em 19/08/2026 (`a4a4585`)

Antes: **8 vulnerabilidades (7 *high*, 1 *critical*)** — o inventário havia crescido em
relação às 5 registradas antes, porque o banco de advisories avançou (entrou o
`deepmerge-ts` via `@prisma/config`).

Depois: **3 *high*, 0 *critical***. Em três passos:

1. `npm audit fix` (sem `--force`) — subiu `@nestjs/swagger` 11.4.6 → 11.4.7 e, com ele,
   `js-yaml` 5.2.1 → 5.3.0. Patch, sem mudança de API.
2. **`bcrypt` 5.1.1 → 6.0.0** (major, instalado explicitamente). O 6.0.0 **abandonou o
   `@mapbox/node-pre-gyp`** em favor de `node-gyp-build` + `node-addon-api`, o que remove
   da árvore o `node-pre-gyp` (*high*) e o `tar` (*critical*) de uma vez. A API usada em
   `senha.util.ts` (`hash`, `compare`) não mudou. **O `npm audit fix --force` não faria
   isso** — ele não enxergava o `bcrypt` como caminho de correção.
3. **`nodemailer` 6.10.1 → 9.0.5** (major, o único que o `--force` proporia). Fecha oito
   advisories, entre elas injeção de comando SMTP e injeção de cabeçalho por CRLF. O
   `MailService` usa apenas `createTransport({host, port, secure, auth})` e
   `sendMail({from, to, subject, html})`, estáveis nos três majors; o caminho `[SIMULADO]`
   (sem `MAIL_HOST`/`MAIL_USER`) nem instancia o transporter.

**Residual — 3 *high*, todas a mesma advisory:** `deepmerge-ts <8.0.0` (stack exhaustion ao
mesclar grafos recursivos), alcançada por `prisma` → `@prisma/config` → `deepmerge-ts`.

**Números medidos em 19/08/2026, separando produção de tooling:**

| Comando | Resultado |
|---|---|
| `npm audit` | 3 *high*, 0 *critical* |
| `npm audit --omit=dev` | **3 *high*, 0 *critical*** |

Os dois números são iguais, e isso corrige uma afirmação da rodada anterior. Estava
registrado que "`prisma` é devDependency, logo não entra em produção" e que o número de
produção seria zero. A declaração no `package.json` está certa — `prisma` está mesmo em
`devDependencies` —, mas ela não é o que o `npm audit --omit=dev` enxerga:

```
$ npm ls prisma --omit=dev
procert-backend@1.0.0
└─┬ @prisma/client@6.19.3
  └── prisma@6.19.3
```

`@prisma/client`, que **é** dependência de produção, declara `prisma` como
`peerDependency` opcional. Instalado, ele passa a fazer parte da árvore de produção
resolvida e o `--omit=dev` continua contando a advisory. Ou seja: o estado de produção
auditável é **3 *high***, não zero.

Isso não muda a avaliação de risco — em execução, o `@prisma/client` não carrega o
`@prisma/config` — mas muda o que se pode afirmar. O número que um pipeline de CI vai
medir é 3, e é esse que fica registrado aqui.

**Por que ficam:**

- **Não há correção disponível.** `@prisma/config@7.9.1` — o mais novo — ainda depende de
  `deepmerge-ts@7.1.5`. Subir para `prisma@7` custaria a migração de `package.json#prisma`
  para `prisma.config.ts` **sem fechar a advisory**.
- `npm audit fix` e `npm audit fix --force` já não propõem mudança alguma (`up to date`).
- O vetor exige um arquivo de configuração hostil — que é do próprio repositório.

**Pendência de tooling, com gatilho:** acompanhar o `@prisma/config` até que ele suba para
`deepmerge-ts@8` e então rodar `npm update @prisma/client prisma`. Enquanto isso, um
eventual gate de CI em `npm audit` precisa tolerar essas três — não é dívida que dê para
pagar do lado do projeto.

**Tabela de versões — refeita a partir da árvore real, não do relatório anterior**
(`npm ls js-yaml bcrypt nodemailer @nestjs/swagger` e o diff de `package-lock.json` em
`ed279ee`):

| Pacote | Antes (`ed279ee^`) | Depois | Observação |
|---|---|---|---|
| `bcrypt` | 5.1.1 | 6.0.0 | direto, major |
| `nodemailer` | 6.10.1 | 9.0.5 | direto, três majors |
| `@nestjs/swagger` | 11.4.6 | 11.4.7 | direto, patch |
| `js-yaml` (via `@nestjs/swagger`) | 5.2.1 | 5.3.0 | transitivo |

O `js-yaml` 5.x foi conferido no registry por ter parecido implausível: `npm view js-yaml
dist-tags` devolve `latest: 5.3.0`, com `v4-legacy: 4.3.1` e `v3-legacy: 3.15.1`. As
versões 4.3.1 e 3.15.1 continuam na árvore por outros caminhos (`@eslint/eslintrc`,
`cosmiconfig`, `@istanbuljs/load-nyc-config`) — é uma árvore com quatro cópias de
`js-yaml`, não uma só.

Verificado após a mudança: `nest build` sem erros; login do seed (`bcrypt` 6 conferindo o
hash gravado pelo `bcrypt` 5); hash legado `$2y$` do PHP ainda aceito pela normalização de
`conferirSenha` (vetor `password_hash("rasmuslerdorf", PASSWORD_DEFAULT)` da documentação
do PHP); upload de foto; download autenticado do PDF; e-mail em modo `[SIMULADO]`.

### `esqueciSenha`: falha de e-mail vira oráculo de enumeração (risco aberto)

Encontrado em 19/08/2026 ao escrever `auth.service.spec.ts`.

`AuthService.esqueciSenha` faz `await this.mail.enviarRedefinicaoSenha(...)` **sem
try/catch**. A garantia de "e-mail não derruba o fluxo de autenticação" existe, mas mora
inteira dentro de `MailService.enviar`, que engole a exceção do `sendMail`. Ou seja: o
`AuthService` depende de um detalhe de implementação de outro serviço para manter uma
propriedade de segurança sua.

Por que importa mais do que um 500 comum: o envio só acontece no ramo em que o e-mail
**existe e está ATIVO**. E-mail inexistente ou inativo retorna a mensagem neutra antes
disso, sempre 200. Se `enviarRedefinicaoSenha` rejeitar por qualquer motivo — um erro de
template, uma mudança futura no `MailService`, o CRLF do item acima em outro assunto —, a
resposta passa a ser 500 **apenas para contas que existem**. Isso é exatamente a
enumeração que a mensagem neutra e o `bcrypt.compare` contra hash inválido no `login`
foram escritos para impedir.

Hoje o vetor está fechado na prática, porque o `MailService` nunca rejeita. É frágil por
construção, não explorável agora.

Estado: **coberto por teste** — `auth.service.spec.ts` tem um caso que afirma o
comportamento atual (a exceção escapa), com o raciocínio no próprio arquivo. Ele existe
para que a correção seja uma decisão consciente: quando o try/catch entrar, o teste falha
e obriga a revisão.

Correção proposta (não aplicada: mexer no `AuthService` é entrega própria): envolver a
chamada em try/catch, registrar em log e devolver a mensagem neutra assim mesmo — o
cliente que não recebeu o e-mail pede de novo, e ninguém descobre quais contas existem.

### ETL do legado quebrado — `migrate-legacy.ts` (risco aberto, prioridade baixa)

`prisma/` está no `exclude` do `tsconfig.build.json`, então `nest build` nunca compilou os
scripts. Foi por isso que `migrate-legacy.ts` deixou de casar com o schema no refactor de
trilhas versionadas sem que nada ficasse vermelho.

Fechada a lacuna de verificação em 19/08/2026: `tsconfig.scripts.json` inclui `prisma/**`
e o script `npm run typecheck:scripts` o executa. Saída atual:

```
$ npm run typecheck:scripts
prisma/migrate-legacy.ts(323,9): error TS2322: … Type '{ clienteId … }' is missing the
  following properties from type 'ProdutoUncheckedCreateInput': categoriaId, modeloTrilhaId
prisma/migrate-legacy.ts(362,9): error TS2322: … Property 'ordem' is missing in type
  '{ produtoId … }' but required in type 'CertificacaoProdutoUncheckedCreateInput'
```

Não é só tipagem: `categoriaId`, `modeloTrilhaId` e `ordem` são colunas `NOT NULL`, então o
script falharia em execução também. `seed.ts` e `migrate-categorias.ts` passam limpo — os
dois erros estão só no ETL.

**Não corrigido de propósito.** Consertar exige decidir como o ETL resolve categoria e
versão de trilha para cada produto migrado (uma categoria "Geral" para todos? inferida do
legado? a versão vigente no momento da importação?) e como numera a `ordem` de cada etapa
do produto. Isso é decisão de projeto, não ajuste de linha.

Por isso `typecheck:scripts` **fica fora de qualquer pipeline obrigatório** enquanto o ETL
não for arrumado — entrar agora deixaria o CI vermelho por dívida conhecida. É um comando
de diagnóstico, rodado sob demanda.

Prioridade real: **baixa**. O cutover já aconteceu e o sistema está em produção com os
dados migrados; o script só volta a importar se houver reimportação.

Gatilho para promover: plano de reimportação do legado.

### `nodemailer` 9: nome de produto com CRLF derruba o aviso em silêncio (risco aberto)

Registrado em 19/08/2026. O upgrade 6 → 9 fechou, entre outras, a injeção de cabeçalho por
CRLF — mas as versões novas **rejeitam** o header malformado lançando exceção, onde as
antigas saneavam e seguiam. Isso muda o comportamento do `MailService` num caminho que
nunca foi exercitado: sem `MAIL_HOST`/`MAIL_USER` no `.env`, só roda o `[SIMULADO]`, que
nem instancia o transporter.

O ponto exposto é `enviarAtualizacaoCertificacao`, que monta o assunto com um valor vindo
do banco:

```ts
await this.enviar(para, `Atualização na certificação — ${produto}`, html);
```

`produto` é o nome cadastrado do produto. Um nome com `\r\n` — colado de uma planilha, por
exemplo — produz um assunto com quebra de linha, o `sendMail` lança, e o `try/catch` de
`MailService.enviar` engole a exceção e registra em log. O efeito prático: **a operação de
domínio conclui normalmente e o cliente simplesmente não recebe o aviso**, sem nada na tela
indicando isso.

O `try/catch` está certo e deve continuar — e-mail não pode derrubar avaliação de etapa
nem enumerar contas pelo tempo de resposta. O que falta é o assunto não chegar malformado.

Estado: **coberto por teste** (`mail.service.spec.ts` — assunto com `\r\n` no nome do
produto: o envio falha, a exceção não escapa de `enviar`, e o erro vai para o log), mas
**não corrigido**. O saneamento — colapsar `\r` e `\n` do assunto antes do `sendMail` — é
mudança de comportamento no `MailService` e fica para uma entrega própria.

Gatilho para promover: configurar SMTP real (`MAIL_USER`/`MAIL_PASS`). O primeiro envio de
verdade — Hostinger, porta 465/TLS — nunca aconteceu, e é quando esse caminho passa a
existir em produção.

### Ordenação após migração de versão (resolvido)

Um produto migrado carrega etapas de modelos diferentes, cujos `ordem` colidem. A primeira
implementação ordenava pela `ordem` do modelo com desempate por id, o que produzia sequências
plausíveis mas erradas (uma etapa nova inserida no meio aparecia no fim). Resolvido com
`CertificacaoProduto.ordem`: campo próprio do produto, copiado do modelo na abertura e
**renumerado 1..N dentro da transação de migração**, posicionando as etapas novas conforme o
modelo vigente. Toda ordenação de timeline passou a usá-lo.

### `DashboardService` calcula em memória

`findMany` enxuto + agregação em JavaScript. Correto e legível na escala atual; com dezenas
de milhares de produtos, migre para agregação SQL.

### Peso dos assets da home

As imagens vieram do legado sem reprocessamento e algumas são grandes para uso web:
`depoimentos-bg.png` tinha **2,4 MB** — dois terços do peso de imagens do site — e deixou
de ser carregado em `841a6b7`: ficava sob um overlay de 70%, então foi trocado por dois
gradientes radiais. O arquivo permanece em `public/img/` sem referência, à espera de
reprocessamento para WebP ou remoção. `cta-bg.jpg` (332 KB) e `hero-bg.jpg` (218 KB)
seguem como estão. Todas carregam com
`loading="lazy"` (exceto o hero, que usa `fetchPriority="high"`), mas o certo é converter
para WebP/AVIF e redimensionar — provavelmente 90% de redução sem perda perceptível.

O `servico.jpg` original tinha **13,4 MB** e foi **substituído** por `services.jpg`
(54 KB, mesma temática) na seção de diferenciais. Publicar a original seria um defeito de
performance, não fidelidade.

O `bootstrap-icons.css` completo (~106 KB, 19,7 KB gzip) é carregado por ~28 ícones. Se o
peso incomodar, o caminho é gerar um subset ou inlinar os SVGs usados.

### Dados de contato divergentes entre seções

O legado exibia **três** números: `11 94230-7431` na seção de contato, `11 91443-3414` no
rodapé e `5511914433414` no link do WhatsApp. Os textos foram preservados como estavam
(em `conteudo.ts`, campos `telefoneContato` e `telefoneRodape`) porque não há como
inferir qual é o correto — precisa de confirmação do cliente.

### Menu móvel: armadilhas de empilhamento

Duas correções que valem registro, porque voltam a morder em qualquer refatoração do
cabeçalho:

- **O botão de fechar sumia atrás do painel.** O painel de navegação é `z-index: 998` e o
  cabeçalho, `997` — o X ficava por baixo. O botão agora é `z-index: 999`.
- **Aberto, o botão vira `position: fixed` no canto superior direito.** Sem isso ele
  permanece na posição original do cabeçalho, onde cai sobre a cortina escura em vez do
  painel branco — um X escuro invisível sobre fundo escuro. Fixá-lo garante que ele
  sempre pouse sobre o branco, em qualquer largura.

A lista suspensa "Links Úteis" precisou de `.home__nav .home__nav-suspenso` (e não apenas
`.home__nav-suspenso`): a regra base `.home__nav ul` tem especificidade maior e impunha
`display: flex` em linha com `align-items: center`, deixando o menu horizontal e com os
itens encolhidos ao tamanho do texto.

> **Como o layout móvel foi verificado:** a janela do Chrome estava maximizada e não
> aceitou redimensionamento, então o breakpoint de `home.css` foi elevado temporariamente
> para ativar as regras móveis reais na largura corrente — abertura, X, acordeão dos
> documentos, cortina e liberação da rolagem — e devolvido a `1199px` em seguida. Vale
> ainda uma passada manual em um aparelho real.

### Duas fontes de verdade para os tipos

`schema.prisma` (backend) e `types/index.ts` (frontend) são mantidos manualmente em sincronia.
Divergência silenciosa é possível. Mitigação futura: gerar tipos do OpenAPI que o Swagger
já expõe.

### `DEPLOY.md` expõe a infraestrutura num repositório público (risco aberto)

O repositório é **público** (`singlefutureadm-agency/procert-app`). A §6 do `DEPLOY.md`,
escrita como levantamento do servidor em 21/08/2026, publica junto:

| Dado | Consequência |
|---|---|
| `ftp.procertocp1.hospedagemdesites.ws` → `179.188.54.241` | É o IP da origem. Publicado ao lado da informação de que o site fica atrás do Cloudflare, permite bater direto no servidor e contornar WAF e proteção de DDoS. |
| Usuário FTP `procertocp1` | Metade de uma credencial. |
| Porta 21, e `AUTH TLS` recusado pelo servidor | A outra metade trafega em texto claro a cada publicação. |
| `/home/procertocp1/`, `/public_html` | Estrutura da conta de hospedagem. |

**Nenhuma senha vazou** — o histórico completo foi varrido em 22/08/2026 e não há
credencial em commit nenhum. O `DEPLOY.md` entrou em `6bb7be8`, então a janela é curta, e
o repositório tem 0 forks.

Decisão consciente de **deixar como está** em 22/08/2026. Ao tratar, duas coisas:

1. Remover num commit novo **não limpa o histórico** — o conteúdo continua acessível pelos
   commits anteriores, e o GitHub é varrido por bots continuamente. Trate como já exposto.
2. As saídas reais são tornar o repositório privado, ou redigir o documento **e** trocar a
   senha do FTP. Redigir sozinho não devolve o que já saiu.

---

### RLS ausente nas tabelas do schema `public` — ✅ RESOLVIDO (24/08/2026)

As 18 tabelas estavam **sem row level security** enquanto os roles `anon` e
`authenticated` do Supabase tinham `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` em todas.
O PostgREST expõe o schema `public` para a chave anônima — que é pública por construção —,
então dava para ler `funcionarios` inteira **incluindo `senha_hash`**, ler o CPF/CNPJ dos
`clientes`, ler `tokens_redefinicao_senha` e apagar certificado, tudo **sem passar pela
API**. Toda a autorização de `garantirAcesso()` vive no service e não cobre essa porta.

A armadilha é que o `DEPLOY.md` já dizia "sem policy = fechado", e isso é verdade para o
**Storage**, onde `storage.objects` já vem com RLS ligado. Nas tabelas do `public` o RLS
vem **desligado**, e ali "sem policy" significa aberto.

Corrigido habilitando RLS nas 18 tabelas, **sem criar policy alguma** — policy só devolveria
acesso. A aplicação não sente: o Prisma conecta como `postgres`, dono das tabelas, e o dono
ignora RLS. O advisor de segurança do Supabase passou de 18 `ERROR` a zero, restando 18
`INFO` de "RLS enabled, no policy", que aqui é o estado correto e **não deve ser
"resolvido"**.

`prisma migrate deploy` não conhece RLS: **banco recriado do zero volta ao estado aberto.**
O SQL para reaplicar está em `DEPLOY.md` §5.

### O 413 da plataforma que chega ao navegador como erro de CORS

Sintoma: `Access to XMLHttpRequest ... has been blocked by CORS policy: No
'Access-Control-Allow-Origin' header`, num upload de foto que funcionava em
desenvolvimento.

Não era CORS. O corpo de uma requisição na Vercel para em **4,5 MB**, e o corte é feito pela
plataforma antes de a função rodar — a resposta 413 sai sem passar pelo middleware, o
navegador não encontra o cabeçalho e relata o que não é. No log da função aparece como
`413 [info/static]`, e o `[info/static]` é a pista de que quem respondeu foi a plataforma.

Corrigido no cliente (`frontend/src/lib/imagem.ts`): a imagem é redimensionada e
recomprimida em `<canvas>` antes do envio — 8,7 MB viram ~430 KB. A dica dos formulários
dizia "até 5 MB", acima do que o backend aceita **e** do que a plataforma deixa passar.

**Regra geral:** erro de CORS num endpoint que já funcionava merece um olhar no status da
resposta antes de qualquer mexida em `CORS_ORIGINS`.

### Pedaço de código obsoleto após deploy — ✅ RESOLVIDO (24/08/2026)

Regressão introduzida pelo carregamento sob demanda (`841a6b7`) e encontrada em produção:
uma aba aberta antes de um deploy pedia um chunk com hash já substituído e exibia
"Failed to fetch dynamically imported module" numa tela de erro crua.

Duas causas somadas. A primeira é inerente ao code splitting. A segunda é que o fallback de
SPA era `/(.*)`, capturando também `/assets/`:

```
/assets/FuncionariosPage-BF5bvhsa.js   →  200  text/html
/assets/nao-existe-mesmo-123.js        →  200  text/html
```

O `import()` recebia o `index.html` e falhava ao executar HTML como módulo — por isso o erro
não era um 404 legível.

Corrigido com `pagina()` em `router.tsx` (recarrega uma vez, com trava em `sessionStorage`
contra laço) e `/assets/` fora do rewrite no `vercel.json`. **Os dois andam juntos:** o
retry depende de o asset ausente devolver 404 de verdade.

Lição de bônus do mesmo episódio: `vercel.json` **recusa propriedade fora do schema**. Um
campo `comment` dentro de `rewrites[]` derruba o deploy na validação, antes de compilar.

### Categoria criada pelo painel não aceitava trilha — ✅ RESOLVIDO (24/08/2026)

Encontrado ao percorrer o fluxo do admin em produção. `POST
/categorias-produto/:id/modelos-trilha` sem `etapas` copia as da versão vigente; numa
categoria nova não há vigente, e o servidor recusa corretamente. A tela chamava sempre sem
etapas e o modal era só uma confirmação — **não havia caminho para criar a primeira
trilha**, e sem trilha a categoria não aceita produto.

Corrigido em `97b16c1`, só no frontend. Junto foram dois textos que descreviam um estado
impossível: "esta versão já está em uso por 0 produto(s)" sem versão nenhuma (`editavel` é
`Boolean(modelo?.editavel)`, e sem modelo caía no ramo de imutável), e "a versão 1 será
encerrada" antes de a versão 1 existir.

## 16. Postura de segurança

| Controle | Implementação |
|---|---|
| Senhas | bcrypt, 12 rounds, nunca em texto; `senhaHash` fora de todo `select` de resposta |
| Política de senha | ≥8 caracteres com letra e número, validada no DTO |
| Autenticação | JWT assinado, expiração obrigatória, `JWT_SECRET` obrigatório no boot |
| Revogação | Revalidação do usuário no banco a cada request (cadastro inativo cai na hora) |
| Autorização | Guards globais; acesso é opt-out via `@Public()`, nunca opt-in |
| Multi-tenant | Escopo do CLIENTE derivado do token; verificação de posse em detalhes e uploads |
| Mass assignment | `whitelist` + `forbidNonWhitelisted` → `{"role":"ADMIN"}` recebe `400` |
| SQL injection | Prisma parametriza tudo; não há SQL concatenado |
| Upload | Allowlists de MIME por finalidade (imagem × documento), extensão derivada do MIME, nome `randomUUID()`, limite de tamanho, guarda de path traversal |
| Estático de `/uploads` | Allowlist de pastas (`PASTAS_PUBLICAS`), um mount por pasta + middleware que nega o resto com 404; `certificados/` e `certificacoes/` nunca são servidos como estático |
| Download de evidência e de PDF | Rota autenticada com verificação de posse; `Content-Disposition: attachment` na evidência para não executar SVG/HTML no domínio da API |
| Injeção em e-mail | Nome de produto e etapa escapados antes de entrar no corpo HTML |
| Imutabilidade de processo | Versão de trilha em uso não pode ser editada; certificado cancelado não muda de estado; NC encerrada não é reaberta |
| Força bruta | Throttle 10/min no login, 5/min em senha e contato, 120/min global |
| Enumeração de contas | Mensagem e tempo de resposta uniformes no login; resposta neutra em `esqueci-senha`; falha de SMTP não propaga |
| Reset de senha | Token de 32 bytes, **só o SHA-256 é persistido**, uso único, validade de 1h, pedidos anteriores invalidados |
| Cabeçalhos | helmet |
| CORS | Allowlist explícita via `CORS_ORIGINS` |
| Vazamento em erro | `AllExceptionsFilter` padroniza; stack só no log |
| Auditoria | Histórico imutável com autoria da sessão; sobrevive à exclusão do autor (`SetNull` + nome desnormalizado) |
| Integridade operacional | Impossível remover o último ADMIN ativo ou desativar a si mesmo |

**Pendências conscientes:** token em `localStorage` (exposto a XSS), ausência de refresh
token, a advisory de `deepmerge-ts` que o `prisma` (devDependency) ainda arrasta e para a
qual não há correção publicada (§15) e — o item mais crítico — nenhum
teste automatizado cobrindo a matriz de autorização, de modo que hoje uma regressão de RBAC
passaria em silêncio. **O fechamento do estático de `/uploads` (§15) é exatamente o tipo de
mudança que precisaria de um e2e travando os quatro casos** (404 privado, 200 público, 403
de cliente alheio, 401 sem token): hoje ele está verificado à mão e nada impede que um
`useStaticAssets` amplo volte no próximo refactor.

---

## 17. Próximos passos sugeridos

### Concluído nas sessões de 17 e 19/08/2026

| Item | Commit |
|---|---|
| ~~Fechar o `/uploads` estático para certificados e evidências~~ | `7102845` |
| ~~`npm audit fix` no backend~~ (o que tinha correção) | `ed279ee` |
| ~~`.env` nos scripts `ts-node` do Prisma~~ | `1793963` |
| ~~Reauditoria da travessia + allowlist sobre o caminho decodificado~~ | `a4a4585` |
| ~~`backend/eslint.config.js`, destravando `npm run lint`~~ | `0966e96` |
| ~~Suíte de testes unitários dos services (§14)~~ | `3a4d779` |
| ~~E2E de autorização (Supertest, papéis × endpoints)~~ | `bd1771a` |
| ~~Agendar a expiração de certificados~~ | `9edc8a8` |
| ~~Alinhar `README.md` e esta documentação~~ | 19/08/2026 |
| ~~Gráficos, exportação para planilha, `/api/health` e preparação de deploy~~ | `6bb7be8` (21/08/2026) |
| ~~CI no GitHub Actions (build + lint + testes nos dois pacotes)~~ | `8fd0363`, `d9ea0aa` |
| ~~Cobertura de e2e das rotas de `6bb7be8` + verificação da suíte por mutação~~ | esta entrega |

### Concluído em 23 e 24/08/2026

| Item | Commit |
|---|---|
| ~~Armazenamento externo (Supabase Storage) e publicação na Vercel~~ | `87339f7` |
| ~~Expiração por Vercel Cron~~ | `6d38869` |
| ~~Redefinição de senha de ADMIN fora do seed~~ | `33e3c50` |
| ~~RLS nas 18 tabelas do schema `public`~~ | aplicado no banco, registrado em `DEPLOY.md` §5 |
| ~~Páginas `/sobre`, `/servicos`, `/contato` + base de SEO~~ | `72884a9` |
| ~~Proporção das logos e alvos de toque~~ | `9ef75db` |
| ~~Carrossel, hierarquia de headings e carga sob demanda~~ | `841a6b7` |
| ~~Upload de imagem, CEP e senha visível~~ | `1865fa4` |
| ~~Pedaço obsoleto após deploy~~ | `7f03cc4`, `fe7166e` |
| ~~Primeira trilha de uma categoria~~ | `97b16c1` |
| ~~**Branch protection em `main`**~~ | ativa desde 24/08/2026 |

### Prioridade 1 — o que sustenta tudo que foi construído

**1. ~~Branch protection em `main`~~ — FEITA.** Verificada em 24/08/2026: um push direto foi
recusado com `GH013: Changes must be made through a pull request` e `2 of 2 required status
checks are expected`. Foi configurada por *repository rules*, que funcionam em repositório
de conta pessoal — a anotação anterior, de que estaria bloqueada por falta de papel de
admin, não valia.

Consequências práticas para quem trabalha aqui: todo trabalho vai por branch + PR, e
`gh pr merge --auto` **não** está disponível neste plano (o repositório recusa
`enablePullRequestAutoMerge`) — aguarde os dois checks e faça o merge.

**2. Teste no frontend.** Zero hoje (§14), enquanto o backend tem 234 unitários + 75 e2e. O
CI já reserva o lugar: o job do frontend roda `lint:ci` e `build`, e é só acrescentar o
passo. Comece pelo que quebra silencioso — `lib/tema.ts` (`MAPA_CSS`, `checarContrastes`),
`mensagemDeErro` e as chaves de `lib/queryClient.ts`.

*Gatilho: nenhum — é a lacuna nº 1 depois da proteção de branch.*

### Prioridade 2 — funcionalidade que os usuários já sentem falta

**3. Tela de caixa de entrada de `/contato` no painel.** As mensagens do formulário do site
só podem ser lidas via Swagger/API hoje. *Gatilho: o cliente perguntar onde estão as
mensagens — ou seja, na primeira mensagem que chegar em produção.*

**4. Aviso de prazo de NC vencido**, no dashboard e por e-mail. Hoje o vencimento só
aparece para quem abre a tela da NC. *Gatilho: a primeira NC que estourar o prazo sem
ninguém notar.*

### Prioridade 3 — desempenho e evolução prevista

**5. Otimizar as imagens da home.** `depoimentos-bg.png` tem 2,4 MB e `cta-bg.jpg` 340 KB;
converter para WebP/AVIF e redimensionar deve dar ~90% de redução. O `bootstrap-icons.css`
completo (~106 KB de fonte) é carregado por ~28 ícones — cabe um subset. *Gatilho: medição
de Core Web Vitals do site público, ou reclamação de carregamento em conexão móvel.*

**6. Módulo de pagamentos.** A tabela `Pagamento` existe e `produtos` já expõe
`ultimoPagamento`, mas não há controller nem service. *Gatilho: o OCP passar a cobrar pelo
sistema em vez de por fora.*

**7. Tipos do frontend gerados do OpenAPI.** Hoje `schema.prisma` e
`frontend/src/types/index.ts` são sincronizados à mão, e divergência silenciosa é possível.
*Gatilho: a primeira divergência que chegar ao usuário — ou o CI, que torna a geração
verificável.*

**8. Observabilidade — parcialmente feita em `6bb7be8`.** `GET /api/health` já existe:
público, fora do throttler, faz `SELECT 1` e devolve 503 sem vazar detalhe do driver.
Faltam **logs estruturados (JSON) e métricas**. *Gatilho: o primeiro incidente em produção
que exigir correlacionar requisições — hoje o log é texto e não tem id de requisição.*

### Prioridade 4 — condicionados a um evento

**9. Endurecer a sessão** — cookie `httpOnly` + `SameSite` + rota de refresh. A revalidação
no banco já cobre conta desativada, mas não invalida token vazado antes de expirar (§15).
*Gatilho: requisito de sessão longa ou exposição pública maior. **Não antes** — o custo é
alto e o risco atual é aceitável para um sistema interno.*

**10. Corrigir o ETL `migrate-legacy.ts`** (§15). Exige decidir como o script resolve
categoria e versão de trilha para cada produto migrado. *Gatilho: plano de reimportação. O
cutover já aconteceu; sem reimportação, o script é código morto.*

**11. `DashboardService` com agregação SQL.** Hoje agrega em memória (`findMany` enxuto +
JavaScript), correto na escala atual. *Gatilho: dezenas de milhares de produtos.*

**12. Dados de contato divergentes no site.** O legado exibia **três telefones diferentes**
(contato, rodapé e link do WhatsApp), preservados como estavam em
`features/home/conteudo.ts`. *Gatilho: **confirmação do cliente sobre qual é o correto** —
não invente.*

---

*Documento baseado na leitura direta do código em `backend/` e `frontend/`, com o ambiente
local em execução e os fluxos principais verificados por API e navegador.*
