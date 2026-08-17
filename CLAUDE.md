# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Todo o código, comentários, nomes de variáveis, DTOs, rotas e mensagens de erro
> estão **em português**. Mantenha essa convenção ao escrever código novo.

---

## 1. O que é este projeto

**ProCert** — plataforma de um Organismo de Certificação de Produto (OCP). Clientes
submetem produtos, a equipe interna avalia cada produto ao longo de uma **trilha de
etapas** (análise documental, ensaios, auditoria de fábrica, decisão), reprovações geram
**não conformidades** rastreáveis, e a aprovação de todas as etapas obrigatórias libera a
**emissão de um certificado** com número sequencial, validade e PDF.

O repositório é a **migração de um sistema PHP legado** (MVC artesanal + MySQL) para
NestJS + React + PostgreSQL. Isso explica muita coisa no código: comentários que citam
bugs do legado, nomes de tabelas mapeados com `@@map`, e scripts de ETL. O sistema já
**evoluiu além da paridade** com o legado (trilhas versionadas, NCs, certificados formais,
evidências por etapa, tela de aparência).

Um monorepo simples com dois pacotes independentes (`backend/`, `frontend/`) — **não há
workspace npm na raiz**; cada um tem seu próprio `package.json` e `node_modules`.

---

## 2. Ambiente e comandos

Ambiente de desenvolvimento: **Windows**. O shell padrão é PowerShell; há um Bash (Git
Bash) disponível. Comandos abaixo funcionam nos dois.

### Subir o ambiente completo

```bash
# 1. Banco (na raiz) — requer Docker Desktop rodando
docker compose up -d          # PostgreSQL em localhost:5433 + Adminer em :8080

# 2. Backend
cd backend
npx prisma migrate deploy     # ou `migrate dev` se estiver criando migration
npx prisma generate
npm run seed                  # idempotente
npm run start:dev             # API em http://localhost:3000/api

# 3. Frontend (outro terminal)
cd frontend
npm run dev                   # http://localhost:5173
```

- **Swagger**: http://localhost:3000/api/docs
- **Adminer**: http://localhost:8080 (server `postgres`, user/pass/db = `procert`)
- **Credencial do seed**: `admin@procertocp.com.br` / `Procert@2026`
  (sobrescrevível via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)

### Armadilhas do ambiente

| Armadilha | Detalhe |
|---|---|
| **Porta 5433, não 5432** | O container é mapeado `5433:5432` para conviver com um PostgreSQL nativo já instalado na máquina em 5432. O `DATABASE_URL` do `.env` precisa refletir isso. O `README.md` ainda diz 5432 — está desatualizado. |
| **Não rode `npm run build` com o `start:dev` ativo** | `nest-cli.json` tem `deleteOutDir: true` e apaga o `dist/` embaixo do processo em watch. |
| **`Cannot find module '.../dist/main'` após "Found 0 errors"** | Sintoma do conflito `deleteOutDir` × build incremental. Corrigido com `"incremental": false` em `tsconfig.build.json`. Se voltar: apague `dist/` e `tsconfig.build.tsbuildinfo` e reinicie. |
| **SMTP não configurado** | `MAIL_USER`/`MAIL_PASS` vazios no `.env` → o `MailService` só registra os e-mails no log em vez de enviar. É o comportamento esperado em dev. |

### Scripts

**Backend** (`backend/`)

| Comando | Ação |
|---|---|
| `npm run start:dev` | API em watch |
| `npm run build` / `npm run start:prod` | Build e execução de produção |
| `npm run seed` | 27 UFs, categoria "Geral" + trilha v1, admin inicial. Idempotente. |
| `npm run migrate:legacy` | ETL MySQL legado → PostgreSQL (exige as vars `LEGACY_MYSQL_*`) |
| `npm run migrate:categorias` | Transpõe o catálogo global de etapas do legado para trilhas por categoria |
| `npm run prisma:studio` | UI do banco |
| `npm run lint` | ❌ **não funciona** — não existe `backend/eslint.config.js` (ESLint 9 exige flat config) |
| `npm test` | ❌ **não funciona** — **zero arquivos `.spec.ts`** no projeto |
| `npm run test:e2e` | ❌ aponta para `test/jest-e2e.json`, diretório que não existe |

**Frontend** (`frontend/`)

| Comando | Ação |
|---|---|
| `npm run dev` | Vite (proxy de `/api` e `/uploads` para :3000) |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | ✅ funciona (`eslint.config.js` presente) |

> **Não há suíte de testes em nenhum dos dois pacotes.** Toda validação até aqui foi
> manual. Ao mexer em regra de negócio, não conte com rede de segurança automatizada —
> e considere que adicionar testes é a lacuna nº 1 do projeto (ver `DOCUMENTACAO.md` §14
> para a lista priorizada de services que mais precisam).

### Fluxo de mudança no schema

```bash
cd backend
# edite prisma/schema.prisma
npx prisma migrate dev --name descricao_curta   # cria migration + regenera o client
```

---

## 3. Arquitetura do backend

NestJS 11 + Prisma 6 + PostgreSQL 16. Camadas por módulo em `src/modules/<dominio>/`:

```
<dominio>.controller.ts   HTTP, decorators de rota/papel, Swagger. Sem regra de negócio.
<dominio>.service.ts      TODA a regra de negócio e acesso ao Prisma.
dto/<dominio>.dto.ts      class-validator + @ApiProperty. Entrada e saída.
<dominio>.module.ts       Wiring.
```

`src/common/` guarda guards, decorators, o filtro de exceções e a paginação.
`src/prisma/PrismaService` é o cliente compartilhado, injetado em todo service.

### Fluxo de uma requisição

`main.ts` monta a cadeia global (a ordem importa):

1. **helmet** — cabeçalhos de segurança
2. **CORS** — origens de `CORS_ORIGINS`
3. **`JwtAuthGuard`** (global) — **toda rota exige JWT**, exceto as marcadas com
   `@Public()`. É o inverso do legado, onde nada era protegido.
4. **`RolesGuard`** (global) — se o handler/classe tem `@Roles(...)`, o papel do token
   precisa estar na lista; senão 403.
5. **`ThrottlerGuard`** (global) — 120 req/min por padrão; endpoints sensíveis
   sobrescrevem com `@Throttle` (login e contato usam limites menores).
6. **`ValidationPipe`** (global) — `whitelist: true`, `forbidNonWhitelisted: true`,
   `transform: true`. **Isso mata mass-assignment**: campo não declarado no DTO gera 400.
7. Controller → Service → Prisma
8. **`AllExceptionsFilter`** — padroniza o corpo de erro e traduz códigos do Prisma
   (`P2002` → 409, `P2003` → 409, `P2025` → 404). Nunca vaza detalhe interno.

### Autenticação

- JWT (`accessToken`) de 8h no `Authorization: Bearer`, assinado com `JWT_SECRET`.
- Payload: `{ sub, email, role, nome }`. **`sub` é o id na tabela `Cliente` OU
  `Funcionario`** — as sequências são independentes, e o `role` é o que desambigua.
  Nunca trate `sub` como um id global.
- `JwtStrategy` **revalida no banco a cada request**: usuário desativado perde acesso
  imediatamente.
- `Funcionario` concentra `ADMIN` e `FUNCIONARIO`; `Cliente` é sempre `CLIENTE`.
- Senhas em bcrypt (`BCRYPT_SALT_ROUNDS=12`). O login tem **anti-enumeração**: e-mail
  inexistente ainda paga o custo de um `bcrypt.compare` contra um hash inválido antes de
  devolver a mesma mensagem genérica.
- Reset de senha guarda o **hash SHA-256 do token**, não o token em claro; expira em 1h e
  invalida pedidos anteriores.

### Autorização em duas camadas — leia antes de mexer em qualquer endpoint

1. **`@Roles(...)`** no controller — quem pode chamar.
2. **Escopo do `CLIENTE` dentro do service** — *quais registros* ele vê.

A segunda camada é a que corrige o IDOR do legado e **nunca pode ser esquecida**. O padrão
repetido em `produtos`, `certificacoes`, `certificados` e `nao-conformidades` é:

```ts
// O clienteId vem do TOKEN quando o papel é CLIENTE. O filtro da URL é ignorado.
const clienteId = usuario.role === Role.CLIENTE ? usuario.id : filtros.clienteId;
```

e, para acesso pontual:

```ts
private garantirAcesso(clienteId: number, usuario: UsuarioAutenticado): void {
  if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) throw new ForbiddenException(...);
}
```

**Ao criar um endpoint que devolve dados de produto/certificação/certificado/NC, replique
esse padrão.** Confiar no `clienteId` vindo de query param é exatamente a falha que a
migração corrigiu.

### Convenções que se repetem em todo service

- **Listagens** estendem `PaginacaoDto` (`pagina`, `limite` ≤100, `busca`) e devolvem o
  envelope `paginar(dados, total, filtros)` → `{ dados, total, pagina, limite, totalPaginas }`.
- Listagem + contagem sempre num `$transaction([findMany, count])`.
- **Autoria vem da sessão** (`usuario.id` / `usuario.nome`), nunca de campo do payload.
  Campos como `abertoPorNome`, `alteradoPorNome`, `emitidoPorNome` são **desnormalizados de
  propósito**: a autoria sobrevive à exclusão do colaborador (a FK é `SetNull`).
- `INCLUDE_*` / `SELECT_*` declarados como const no topo do arquivo com
  `satisfies Prisma.XInclude` — reutilizados por todos os métodos do service.
- Mutações multi-tabela sempre em `prisma.$transaction`.
- Efeitos colaterais que não podem derrubar a operação (e-mail, geração de PDF) rodam
  **depois do commit**, sem `await` bloqueante, com falha registrada em log.

### Uploads

`UploadsService` grava em `UPLOAD_DIR` (default `./uploads`) com nome `randomUUID()` e
allowlist de MIME (imagens; documentos de etapa aceitam também PDF/DOC/XLS). Protege
contra path traversal em `remover` e `caminhoAbsoluto`. Devolve sempre URL relativa
`/uploads/<pasta>/<uuid>.<ext>`.

> **Só as pastas públicas são servidas como estático.** `uploads.constantes.ts` é a fonte
> única: `PASTAS_PUBLICAS` (`clientes`, `funcionarios`, `produtos`, `aparencia`) ganha um
> `useStaticAssets` cada em `main.ts`; `PASTAS_PRIVADAS` (`certificados`, `certificacoes`)
> não é montada e só sai por `GET /certificados/:id/pdf` e
> `GET /certificacoes/documentos/:id/arquivo`, que verificam a posse. Um middleware em
> `/uploads`, registrado **antes** dos mounts, devolve 404 para qualquer pasta fora da
> allowlist — é redundante hoje, e existe para que remontar o estático por engano não
> reabra a exposição. **Ao criar uma pasta nova, decida de que lado da linha ela fica.**

---

## 4. Modelo de domínio e as regras que o sustentam

```
CategoriaProduto ──1:N──► ModeloTrilha (versionada) ──1:N──► ModeloEtapa
                                                                  │
Cliente ──1:N──► Produto ──1:N──► CertificacaoProduto ──N:1───────┘
                    │                      ├──1:N──► CertificacaoHistorico ──1:N──► DocumentoCertificacao
                    │                      └──1:N──► NaoConformidade
                    ├──1:N──► Certificado
                    └──1:N──► Pagamento
```

O `schema.prisma` é **densamente comentado** e é a melhor fonte para o modelo. Os pontos
que exigem entendimento além do schema:

### Trilhas versionadas — a regra central

Cada categoria de produto define a própria trilha, **versionada e imutável**:

- Ao cadastrar um produto, a API resolve a **versão vigente** (`ativo: true`, maior
  `versao`) e grava `Produto.modeloTrilhaId` como **retrato**. Na mesma transação, abre uma
  linha de `CertificacaoProduto` (status `PENDENTE`) para cada `ModeloEtapa`.
- Publicar uma versão nova da categoria **não mexe** nos produtos já submetidos: eles
  continuam sendo avaliados pelas regras vigentes na submissão.
- Uma `ModeloTrilha` com produto vinculado **não pode ser editada** (`409` com orientação
  para versionar). Só versão com `totalProdutos === 0` é editável.
- `criarVersao` sem `etapas` no payload **copia as da versão vigente** e encerra a anterior
  (`ativo: false`, `vigenteAte`) na mesma transação — a categoria nunca tem duas vigentes.

### `CertificacaoProduto.ordem` — não é a `ordem` do modelo

Campo **próprio do produto**, copiado de `ModeloEtapa.ordem` na abertura. Existe porque um
produto migrado de versão carrega etapas de `ModeloTrilha` diferentes, cujos `ordem`
colidem — a sequência real só existe no nível do produto. **Toda ordenação de timeline usa
`CertificacaoProduto.ordem`, nunca a do modelo.**

`migrarParaVersaoVigente` acrescenta apenas as etapas ausentes (comparadas **por nome**,
já que cada versão tem `ModeloEtapa` com ids distintos) e **renumera a trilha inteira
1..N dentro da transação**, posicionando as novas conforme o modelo vigente. Etapas que a
versão nova não prevê vão para o fim preservando a ordem relativa. Migração nunca é
silenciosa: `verificarVersaoTrilha` é uma consulta pura, e a migração exige POST explícito.

### Ciclo da não conformidade

`ABERTA` → (cliente responde) `EM_TRATATIVA` → (equipe avalia) `RESOLVIDA` | `REPROVADA`.

- Só pode ser aberta em etapa **`REPROVADO`**.
- Quando aberta junto de uma reprovação (via `CertificacoesService.salvar`), nasce **no
  mesmo commit** — ou a etapa cai e a NC nasce, ou nada.
- `RESOLVIDA` devolve a etapa para **`EM_ANDAMENTO`**, não para aprovada: ela precisa ser
  reavaliada. A transição entra no histórico com autoria.
- Não se reabre uma NC encerrada; registra-se uma nova.
- Código sequencial por ano `NC-2026-000001`, derivado do **maior código do ano** (não de
  `count`, que reutilizaria número após exclusão). Corridas esbarram no índice único e o
  filtro traduz para 409.

### Certificado

- Emissão exige **todas as etapas obrigatórias** aprovadas — opcionais pendentes não
  bloqueiam. O endpoint de detalhe expõe `resumo.obrigatoriasAprovadas` justamente para a
  UI não precisar adivinhar a regra.
- Um produto não pode ter dois certificados vigentes (`EMITIDO` ou `SUSPENSO`) → 409.
- Validade vem de `CategoriaProduto.validadeMeses`, salvo data explícita. A soma de meses
  preserva fim de mês (31/01 + 1 mês = 28/02, não 03/03).
- Número sequencial por ano `PROCERT-2026-000045`, mesma estratégia da NC.
- PDF (pdfkit) é gerado **depois do commit**; se falhar, o certificado existe e o PDF é
  regerado no primeiro download.
- `VENCIDO` nunca é aplicado manualmente — decorre da data, via
  `POST /certificados/expirar-vencidos` (pensado para um cron externo).
- `CANCELADO` é terminal.

### Evidências

`DocumentoCertificacao` pendura em `CertificacaoHistorico`, **não** em
`CertificacaoProduto` — assim fica registrado em que ponto da trilha e por quem cada
arquivo entrou. Uma etapa com `ModeloEtapa.exigeDocumento` **não pode ser aprovada sem
evidência anexada**; a regra vive no service, não na UI.

### Proteções de integridade em `funcionarios`

- Sempre ao menos **um ADMIN ativo**: rebaixar papel, desativar ou excluir o último admin
  → 400.
- Ninguém desativa nem exclui o próprio cadastro.
- E-mail é único **entre `Funcionario` e `Cliente`** (checagem cruzada explícita).

### `ConfiguracaoAparencia`

Linha única (`id = 1`) com os design tokens do painel, editável só por `ADMIN`. Se a linha
não existir, o service devolve os defaults de `aparencia.defaults.ts` — instalação nova
funciona sem seed. Tokens ficam em `Json` para não exigir migration a cada token novo; a
segurança vem do DTO `TokensTemaDto`, que é **allowlist fechada** com regex de cor / faixa
numérica por chave. **Json livre aqui seria injeção de CSS no `style` do documento** — não
afrouxe esse DTO. `logoUrl` e `papelParedeUrl` **não são aceitos no corpo do PUT**: só os
endpoints de upload os definem, senão o admin poderia apontar a marca do painel para uma
URL externa. `PUT` usa concorrência otimista via `atualizadoEmVisto` → 409.

### `Pagamento`

Tabela existe e `produtos` expõe `ultimoPagamento`, mas **não há controller/service de
pagamentos**. É extensão prevista, não funcionalidade entregue — não confunda.

---

## 5. Arquitetura do frontend

React 19 + Vite 6 + TypeScript. Alias `@/` → `src/` (declarado em `vite.config.ts` **e**
`tsconfig.json`). O Vite faz proxy de `/api` e `/uploads` para :3000, então
`VITE_API_URL=/api` (relativo) já funciona em dev.

### Composição (`main.tsx`)

```
aplicarTemaDoCache()          ← antes do primeiro paint, mata o flash de tema
QueryClientProvider
  └ TemaProvider              ← design tokens vindos de GET /api/aparencia (público)
      └ AuthProvider          ← sessão
          └ RouterProvider + Toaster (sonner)
```

### Organização

```
src/
├── auth/           AuthContext (sessão), RotaProtegida, useAuth
├── components/     Genéricos e o layout do painel (LayoutPainel, Sidebar)
├── features/       Um diretório por domínio: api.ts + páginas + componentes locais
│                   Inclui `home` (site institucional público) e `aparencia`
├── lib/            api.ts (axios), queryClient.ts (chaves de cache), tema.ts, formatadores
├── pages/          Telas fora do painel (login, reset, 404, sem-permissão)
├── styles/         global.css — tema "liquid glass" herdado do legado
└── types/          Contratos espelhando os enums/selects do Prisma
```

### Camadas dentro de cada `features/<dominio>/`

- **`api.ts`** — um objeto (`produtosApi`, `clientesApi`, …) com um método por endpoint,
  tipado com os tipos de `@/types`. Componentes **nunca** chamam `api.get` direto.
- **Páginas** — TanStack Query para leitura, `useMutation` para escrita, sempre
  invalidando pelas chaves de `lib/queryClient.ts`.

### `lib/api.ts` (axios)

- Interceptor de request anexa o `Bearer` do `localStorage` (`procert:token`).
- Interceptor de response: **401 com token presente** → limpa a sessão e redireciona para
  `/login?sessao=expirada`. Se você vir esse redirect em dev, é token velho, não bug.
- `mensagemDeErro(erro, padrao)` — converte qualquer erro da API na mensagem exibida;
  entende o array de mensagens do `ValidationPipe` (junta com ` · `).

### `lib/queryClient.ts`

`staleTime: 30s`, sem refetch on focus, **sem retry em 4xx**. O objeto `chaves` centraliza
todas as query keys — **adicione a chave lá antes de usar**, não escreva array solto.

### Sessão (`auth/AuthContext.tsx`)

Token e usuário no `localStorage` (`procert:token`, `procert:usuario`). Ao abrir o app,
revalida em `GET /auth/me`; falha limpa tudo. `sair()` também chama `queryClient.clear()`.

> **Modelo de sessão conhecido**: access token de 8h no `localStorage`, sem refresh token e
> sem revogação por lista. A revalidação no banco cobre conta desativada, mas **não**
> invalida token vazado antes de expirar. Para produção: cookie `httpOnly` + `SameSite` +
> rota de refresh.

### Roteamento (`router.tsx`)

`/` é o **site institucional público**. O painel fica sob uma rota de layout **sem `path`**
envolvida em `<RotaProtegida>`, com os filhos declarando caminhos absolutos
(`dashboard`, `certificacoes`, `produtos`, …). Rotas restritas usam
`<RotaProtegida papeis={['ADMIN']}>` — **isso é UX, não controle**: o backend repete a
checagem em todo endpoint. Ao adicionar uma rota, ajuste também `components/layout/Sidebar.tsx`
(que filtra itens por `papeis`).

### Tema / aparência (`lib/tema.ts` + `features/aparencia/`)

Todo componente lê `var(--token)`. Aplicar tema = escrever custom properties no
`documentElement` → repinta o painel inteiro **sem re-render do React**. `MAPA_CSS` é a
allowlist token→propriedade CSS. `propriedadesDoTema` é separado de `aplicarTema` porque os
previews da tela de Aparência aplicam num container isolado (é o que permite mostrar claro
e escuro lado a lado). `checarContrastes` calcula razão WCAG achatando cores translúcidas
sobre o fundo — **avisa, não bloqueia** o salvamento.

### CSS

Três arquivos, todos manuais (sem Tailwind, sem CSS-in-JS): `styles/global.css` (~995
linhas, o design system do painel), `features/home/home.css` (~1320, o site público) e
`features/aparencia/aparencia.css`. Estenda o arquivo existente em vez de introduzir uma
abordagem nova.

---

## 6. Armadilhas conhecidas ao editar

- **Duas fontes de verdade para os tipos.** `backend/prisma/schema.prisma` e
  `frontend/src/types/index.ts` são sincronizados **à mão**. Mudou enum ou select no
  backend? Atualize `types/index.ts` no mesmo commit — divergência silenciosa é possível.
- **Produtos migrados do legado têm `exigeDocumento: false`** em todas as etapas (o
  catálogo global não tinha o conceito). Para exigir evidência neles é preciso criar uma
  versão nova da trilha e migrar cada produto — a versão em uso é imutável por construção.
- **`DashboardService` agrega em memória** (`findMany` enxuto + JS). Correto na escala
  atual; com dezenas de milhares de produtos, migre para agregação SQL.
- **`npm audit` do backend**: 3 high residuais, todas a mesma advisory de `deepmerge-ts`
  via `prisma` → `@prisma/config` (devDependency, **sem correção publicada** — o
  `@prisma/config` mais novo ainda depende da versão vulnerável). `npm audit fix`, mesmo
  com `--force`, já não propõe nada. Ver `DOCUMENTACAO.md` §15 antes de tentar "resolver".
- **Assets da home são pesados** e vieram do legado sem reprocessamento
  (`depoimentos-bg.png` tem 2,4 MB). O `bootstrap-icons.css` completo (~106 KB) é carregado
  por ~28 ícones.
- **Dados de contato divergentes** em `features/home/conteudo.ts`: o legado tinha três
  telefones diferentes (contato, rodapé, WhatsApp). Preservados como estavam — precisa de
  confirmação do cliente, não invente qual é o certo.
- **Menu móvel da home**: o botão de fechar é `z-index: 999` (painel 998, cabeçalho 997) e
  vira `position: fixed` quando aberto. Refatorar o cabeçalho sem isso reintroduz um X
  invisível sobre a cortina escura.

---

## 7. Estado atual do trabalho

O repositório tem dois commits em `main`:

1. `feat: migração do ProCert para NestJS + React` — a migração completa do legado.
2. `feat: tela de aparência com design tokens do painel` — a tela de design tokens do
   painel para ADMIN (`backend/src/modules/aparencia/`, duas migrations,
   `frontend/src/features/aparencia/`, `frontend/src/lib/tema.ts` e os ajustes que ela
   exigiu em `main.tsx`, `router.tsx`, `Sidebar.tsx`, `LayoutPainel.tsx`, `Campo.tsx`,
   `global.css`, `home.css`, `index.html`, `types/index.ts`).

Ambas funcionais e verificadas manualmente. O fluxo do repo é **direto em `main`**, sem
branches de feature.

---

## 8. Documentação de referência

- **`DOCUMENTACAO.md`** (~85 KB, 17 seções) — a referência completa: arquitetura, modelo de
  dados campo a campo, referência da API endpoint a endpoint com contratos de payload,
  decisões de projeto, §14 (lacunas de qualidade com lista priorizada de testes a escrever),
  §15 (problemas conhecidos), §16 (postura de segurança). **Consulte antes de decidir
  arquitetura** — a maioria das perguntas de "por que está assim?" já está respondida lá.
- **`MIGRACAO.md`** — mapa "arquivo PHP → módulo atual" e os bugs do legado corrigidos.
  Útil ao encontrar um comentário citando o legado.
- **`README.md`** — guia de subida. Desatualizado em dois pontos: diz porta 5432 (é 5433) e
  sugere que `npm test`/`npm run lint` do backend funcionam (não funcionam).
