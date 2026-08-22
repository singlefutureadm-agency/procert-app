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
| **Porta 5433, não 5432** | O container é mapeado `5433:5432` para conviver com um PostgreSQL nativo já instalado na máquina em 5432. O `README.md` sempre esteve certo; quem trazia `5432` era o `backend/.env.example` — corrigido em 19/08/2026. |
| **Não rode `npm run build` com o `start:dev` ativo** | `nest-cli.json` tem `deleteOutDir: true` e apaga o `dist/` embaixo do processo em watch. |
| **`Cannot find module '.../dist/main'` após "Found 0 errors"** | Sintoma do conflito `deleteOutDir` × build incremental. Corrigido com `"incremental": false` em `tsconfig.build.json`. Se voltar: apague `dist/` e `tsconfig.build.tsbuildinfo` e reinicie. |
| **SMTP não configurado** | `MAIL_USER`/`MAIL_PASS` vazios no `.env` → o `MailService` só registra os e-mails no log em vez de enviar. É o comportamento esperado em dev. |
| **`npm run test:e2e` sem `.env.test`** | Falha na hora, com a mensagem certa. Copie de `.env.test.example`. |

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
| `npm run lint` | ✅ ESLint 9 flat config (`eslint.config.js`), com `--fix` |
| `npm test` | ✅ 152 unitários, 8 suítes, Prisma mockado |
| `npm run test:cov` | ✅ idem, com cobertura |
| `npm run test:e2e` | ✅ 59 casos, Supertest + PostgreSQL real. **Exige `backend/.env.test`** |
| `npm run typecheck:scripts` | ⚠️ type-check de `prisma/`. **Falha hoje**, e é esperado — o ETL do legado está desatualizado |

**Frontend** (`frontend/`)

| Comando | Ação |
|---|---|
| `npm run dev` | Vite (proxy de `/api` e `/uploads` para :3000) |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | ✅ funciona (`eslint.config.js` presente) |

> **O backend tem rede de segurança; o frontend não.** 152 unitários + 59 e2e cobrem
> auth, certificados, certificações (incluindo a renumeração da migração de trilha),
> modelos de trilha, NCs, e-mail e a matriz de autorização. Ao mexer em regra de negócio,
> **rode `npm test` e `npm run test:e2e`**. O frontend segue sem teste algum — ver
> `DOCUMENTACAO.md` §14 para o estado medido e o que falta.

#### Rodando o e2e

```bash
cd backend
cp .env.test.example .env.test    # não versionado
npm run test:e2e
```

Banco **dedicado** `procert_test`, criado automaticamente pelo `globalSetup` no mesmo
container. A suíte **trunca as tabelas** entre arquivos — há uma trava que recusa qualquer
`DATABASE_URL` cujo banco não termine em `_test`, justamente para não apagar o seu ambiente
de desenvolvimento.

Ao escrever teste novo, três pontos que custaram tempo e estão documentados no código:

- **`src/testing/prisma.mock.ts`** entrega ao callback de `$transaction` um cliente
  separado (`tx`). Assertar em `tx.modelo.metodo` prova que a escrita rodou dentro do
  commit; um mock ingênuo (`$transaction: (cb) => cb(prisma)`) faria o teste passar sem
  proteger nada.
- **`expect.anything()` não funciona contra mock do `jest-mock-extended`.** O `mockDeep`
  cria qualquer propriedade sob demanda, inclusive `asymmetricMatch`, e o Jest passa a
  tratar o mock como um matcher. Use `mock.calls[n][i]` com `toBe`/`not.toBeUndefined()`.
- No e2e, **travessia de caminho exige `requisicaoCrua()`**, não supertest: todo cliente
  HTTP conforme a especificação resolve `..` (mesmo escrito `%2e%2e`) antes de conectar, e
  o teste passaria por engano.

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

`src/bootstrap.ts` monta a cadeia global (a ordem importa). O `main.ts` é fino e só chama
`configurarApp(app)` — **a mesma função que o e2e usa**, para que o teste levante a
aplicação real, e não uma versão sem `ValidationPipe` nem mounts de `/uploads`. Ao
acrescentar configuração global, coloque em `configurarApp`, não no `main.ts`:

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
>
> A decisão passa por `pastaPublicaDaRota()`, que **decodifica o caminho uma vez** antes de
> olhar a allowlist — a mesma decodificação que o `serve-static` faz — e recusa qualquer
> segmento `..`/`.` ou codificação inválida. Ler o texto cru deixava
> `/uploads/produtos/%2e%2e%2fcertificados/x.pdf` atravessar a allowlist como se
> `%2e%2e%2fcertificados` fosse nome de pasta (ver `DOCUMENTACAO.md` §15). Coberto por
> `test/uploads.e2e-spec.ts`.

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
- `VENCIDO` nunca é aplicado manualmente — decorre da data. `ExpiracaoCertificadosCron`
  roda todo dia às 03:00 **dentro da API**, chamando o service direto (sem HTTP e sem token
  de serviço). Desligável por `EXPIRACAO_CRON_ATIVA=false`; a rota
  `POST /certificados/expirar-vencidos` (ADMIN) segue disponível para acionamento manual.
  Com múltiplas instâncias o job dispara em todas — é `updateMany` idempotente, mas deixe a
  variável em `true` em exatamente uma. Razão da escolha em `DOCUMENTACAO.md` §9.
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

### Exportação para planilha — `modules/certificacoes/exportacao.service.ts`

`GET /certificacoes/produto/:id/exportacao?formato=xlsx|csv`, gerada no servidor com
`exceljs`. Reaproveita `detalharPorProduto` em vez de consultar de novo: é lá que o escopo
do CLIENTE é verificado, e uma segunda consulta seria uma segunda chance de esquecer a
checagem.

O XLSX tem **aba de visão geral → uma aba por etapa (na ordem da trilha) → aba de
histórico**. Detalhes que não são estéticos:

- **Nome de aba passa por `nomeAba()`.** Excel recusa mais de 31 caracteres, recusa
  `\ / ? * [ ] :` e recusa duplicata — e nome de etapa é texto livre do admin. O erro só
  apareceria ao ABRIR o arquivo, não ao gerar.
- **Data vai como `Date`, não string**, com `numFmt`. É o que faz o autofiltro do Excel
  ordenar de verdade; como texto, 10/01 vem antes de 02/12.
- **CSV não tem abas.** O arquivo empilha as mesmas seções com linhas de título. Leva
  **BOM de UTF-8** (sem ele o Excel do Windows abre em ANSI e todo acento quebra) e
  separador **`;`** (no Excel em português a vírgula é separador decimal, e com `,` tudo
  cai numa coluna só).

No frontend o download passa por blob (`certificacoesApi.exportar`), não por `<a href>`:
a rota exige o Bearer, e um link direto voltaria 401. O nome do arquivo sai do
`Content-Disposition` — quem sabe montá-lo é o servidor.

### Gráficos — `components/Graficos.tsx`

HTML e CSS, sem SVG e **sem biblioteca de charts** — pelo mesmo motivo dos ícones: um
pacote traz a própria paleta, tipografia e conceito de tema, e viraria um segundo design
system dentro deste. As primitivas são `BarraComposicao`, `BarrasHorizontais` e
`ColunasAgrupadas`, todas dentro da moldura `Grafico`.

**Os dados vêm de `GET /dashboard/graficos`, nunca da listagem da tela.** As listas são
paginadas: um gráfico montado sobre a página visível diria "3 reprovadas" havendo 40, e
pareceria correto. Pelo mesmo motivo os gráficos **ignoram os filtros** da tela — cada um
diz isso no rodapé.

Regras que não devem regredir:

- **`cor` entra como `backgroundColor`, nunca `background`.** O shorthand zera o
  `background-image` de `.gr--textura`, e como estilo inline vence folha de estilo, a
  hachura sumiria sem erro nenhum.
- **Valor zero não desenha marca.** Existe um piso de 3px para o valor pequeno não virar
  um fio invisível; ele não vale para zero, ou o gráfico mente.
- **Nada depende de cor sozinha.** `--cor-sucesso` × `--cor-erro` têm ΔE 5,0 sob
  deuteranopia (medido) — abaixo do piso. Os tokens foram mantidos por coerência com os
  badges, e a distinção vem de rótulo em texto, legenda escrita e hachura a 45° na série
  crítica.
- **`--graf-alerta` é derivado, não o token cru.** No escuro o `#f59e0b` fica em L 0,77,
  fora da faixa das outras marcas.

### Ícones — `components/Icone.tsx`

**O painel não usa emoji como ícone.** Todo ícone sai de `<Icone nome="..." />`: SVG
inline numa família única (traço, grade 24), colorido por `currentColor` e portanto
sujeito ao tema. Precisa de um desenho novo? Acrescente em `NomeIcone` + `DESENHOS`, no
mesmo estilo de traço — não importe uma segunda biblioteca.

A home institucional é a exceção: continua com `bootstrap-icons` (~106 KB de fonte), que
**não** é carregado no painel de propósito.

Regra de nome acessível, nessa ordem:

1. Ícone ao lado de texto visível → decorativo, nada a fazer (`Icone` já marca
   `aria-hidden`).
2. Ícone sozinho dentro de botão/link → o **controle** leva `aria-label`; `title` sozinho
   não serve, o leitor de tela mal o usa e no toque ele nunca aparece.
3. Ícone sozinho fora de controle → passe `titulo` ao `Icone`.

### Acessibilidade — o que já está garantido e não deve regredir

- **Anel de foco global** em `global.css`, via `:where(a, button, input, …):focus-visible`
  — duas camadas (`--anel-foco` + `--anel-foco-halo`) porque uma cor só não contrasta nos
  dois modos. Especificidade zero de propósito: sobrescreva sem `!important`.
- **`.btn--icone` tem 40×40px** e `.tabela__acoes` usa `gap: 8px` — são alvos de toque, não
  medida estética. Não encolha.
- **`TabelaRolavel`** substitui o `<div className="tabela-wrapper">` cru: a região rolável
  precisa de `tabIndex={0}` + `role="region"` + rótulo, senão as colunas escondidas no
  celular ficam inalcançáveis por teclado. Ele **mede o estouro** com `ResizeObserver` e só
  vira parada de Tab enquanto a tabela realmente rola.
- **`ModalConfirmacao`** prende o Tab e devolve o foco à origem ao fechar. O foco inicial é
  dado no efeito, **não** por `autoFocus` — `autoFocus` roda antes do efeito e fazia a
  origem ser gravada errada (o resultado era o foco terminando no `<body>`). Com
  `perigo`, o foco inicial é **"Cancelar"**; sem ele, o confirmar. Os dois usam
  `focus({ focusVisible: true })`, senão o anel não acende em modal aberto por clique.
- **Skip link** (`.pular-para-conteudo`) é o primeiro focável do `LayoutPainel` e aponta
  para `#conteudo-principal`, que carrega `tabIndex={-1}` para poder receber o foco.

### Tabelas — cartões abaixo de 720px

Cada `<tr>` vira um cartão e cada `<td>` uma dupla rótulo/valor, com o rótulo saindo de
`attr(data-rotulo)`. **Ao criar ou alterar uma coluna, atualize os atributos da célula** —
sem eles a célula aparece sem rótulo no celular:

| Atributo | Uso |
|---|---|
| `data-rotulo="Coluna"` | Célula normal. Deve casar com o texto do `<th>`. |
| `data-principal` | A célula-título do cartão (nome, código). Uma por linha, sem rótulo. |
| `className="tabela__celula-inicial"` | Miniatura, alça de arraste, número de ordem — dividem a faixa do título. |
| `className="tabela__celula-acoes"` | Barra de botões; ganha a faixa inteira no rodapé do cartão. |

Trocar o `display` apaga os papéis implícitos de tabela, então **todo elemento declara o
papel explicitamente** (`role="table" | "rowgroup" | "row" | "columnheader" | "cell"`). Sem
isso a associação célula↔cabeçalho some e o leitor de tela lê uma parede de texto — o
`::before` é decoração e não é anunciado de forma confiável. Pelo mesmo motivo o `<thead>`
continua no DOM, só fora da tela.

**Cuidado com bibliotecas que espalham `role` na linha.** O dnd-kit fazia isso: os
`attributes`/`listeners` de `useSortable` estavam no `<tr>` das etapas da trilha e o
sobrescreviam com `role="button"`. Hoje eles vivem numa alça (`.tabela__alca`, um `<button>`
com `setActivatorNodeRef`), o que também é o que torna a reordenação por teclado alcançável
— o `<tr>` não era focável.

### CSS

Três arquivos, todos manuais (sem Tailwind, sem CSS-in-JS): `styles/global.css` (o design
system do painel), `features/home/home.css` (~1320, o site público) e
`features/aparencia/aparencia.css`. Estenda o arquivo existente em vez de introduzir uma
abordagem nova.

**Duas famílias de token, e a diferença importa.** As do bloco `:root` que aparecem em
`TokensTema` (cores, `--raio`, `--vidro-blur`) são reescritas em runtime por `lib/tema.ts`
e editáveis pelo admin — mudou o default de uma delas, mude também
`backend/src/modules/aparencia/aparencia.defaults.ts`. As **escalas** (`--espaco-*`,
`--fs-*`, `--mov-*`, `--tracking-*`) são estáticas, não passam pela API e não têm espelho
no servidor. Use a escala em vez de número solto: era o número solto que fazia dois blocos
irmãos respirarem diferente sem que ninguém tivesse decidido isso.

Os **derivados** (`--fundo-gradiente`, `--vidro-sombra`, `--sombra-1..3`, `--vidro-realce`,
`--raio-xs`, `--anel-foco*`) ficam num bloco `:root, .previa` — e o `.previa` não é
enfeite. A tela de Aparência aplica o tema editado como estilo inline num container, não no
`documentElement`; derivado declarado só em `:root` é resolvido lá dentro com o valor da
**raiz**, e a prévia passa a mostrar a sombra do tema em uso em vez da do tema sendo
editado. **Derivado novo entra nesse seletor, não em `:root` sozinho.**

Tamanho de fonte não vai em `style={{ fontSize }}` no JSX: use `.titulo-pagina`,
`.titulo-secao` ou `.titulo-bloco`. Texto só para leitor de tela usa
`.apenas-leitor-tela`.

**Carregamento**: `Carregando` (spinner) para tela cuja forma depende do dado — detalhe,
formulário. `EsqueletoTabela` / `EsqueletoCards` (`components/Esqueleto.tsx`) para as que
já se sabe que virarão tabela ou cartões: o spinner ocupa ~110px e some dando lugar a
400px, e o pulo de layout é certo. As barras são `aria-hidden`; o anúncio sai do
`role="status"` com texto fora da tela.

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
  via `prisma` → `@prisma/config`, **sem correção publicada** — o `@prisma/config` mais
  novo ainda depende da versão vulnerável. `npm audit fix`, mesmo com `--force`, já não
  propõe nada. Atenção ao número: `npm audit --omit=dev` devolve **as mesmas 3**. O
  `prisma` está em `devDependencies`, mas `@prisma/client` (produção) o declara como
  `peerDependency` opcional, então ele entra na árvore de produção resolvida. O estado
  auditável de produção é 3, não zero — um gate de CI em `npm audit` precisa tolerá-las.
  Ver `DOCUMENTACAO.md` §15 antes de tentar "resolver".
  Desde a exportação para planilha há **1 moderate a mais**: `uuid` via `exceljs`. A
  advisory é "missing buffer bounds check em v3/v5/v6 quando `buf` é fornecido", e o
  `exceljs` importa **só `uuid.v4`** (`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`)
  — o caminho vulnerável não é alcançável. A "correção" que o `npm audit` propõe é
  descer o `exceljs` para 3.4.0, um major para trás; não é correção.
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

O fluxo do repo foi **direto em `main`** até `d9ea0aa`. Com o CI no ar e mais de uma
pessoa com write, passa a ser **branch + PR** — ver a seção de integração contínua do
`README.md`.

**Produto** (funcional, verificado manualmente):

1. `6371a0d` migração completa do legado para NestJS + React.
2. `a27a18a` tela de aparência com design tokens do painel (ADMIN).
3. `7653264` acessibilidade e responsividade do painel.

**Segurança e dependências** (17–19/08/2026):

4. `7102845` fecha `/uploads` para `certificados/` e `certificacoes/`.
5. `ed279ee` zera as vulnerabilidades corrigíveis do backend.
6. `1793963` carrega o `.env` nos scripts `ts-node` do Prisma.
7. `a4a4585` reauditoria da travessia: a allowlist passou a decidir sobre o caminho
   **decodificado**. Antes, quem negava travessia era a confinação de raiz do
   `serve-static`, não o middleware — o que não valeria se alguém remontasse o diretório
   inteiro.

**Rede de segurança** (19/08/2026) — era a lacuna nº 1 e deixou de ser:

8. `0966e96` `eslint.config.js` + `typecheck:scripts`.
9. `3a4d779` 152 testes unitários nos sete services prioritários.
10. `bd1771a` 59 testes e2e de autorização, com `src/bootstrap.ts` extraído para que o
    teste levante a mesma aplicação do `main.ts`.
11. `9edc8a8` expiração de certificados agendada dentro da API.

**Integração contínua** (22/08/2026) — fecha o ciclo da rede de segurança:

12. `8fd0363` `.github/workflows/ci.yml`: build, lint e testes dos dois pacotes, com
    PostgreSQL 16 de serviço mapeado em 5433 para o e2e — assim o job copia
    `.env.test.example` verbatim, em vez de manter uma segunda `DATABASE_URL` que sairia
    de sincronia sem ninguém notar. Acrescenta `lint:ci` (sem `--fix`) nos dois pacotes:
    o `lint` de desenvolvimento reescreveria os arquivos e o job passaria justamente
    quando há o que corrigir.
13. `d9ea0aa` sobe `checkout`/`setup-node` para v5, encerrando o aviso de Node 20.

O CI foi **verificado nos dois sentidos**: verde em `main`, e vermelho num PR descartável
que trocava `setDate(0)` por `setDate(diaOriginal)` em `somarMeses` — regressão limpa para
lint e type-check, para que quem reprovasse fosse o teste. Reprovou em 3 casos da regra de
fim de mês. Verde que nunca ficou vermelho não prova nada.

**A próxima coisa a fazer é a branch protection em `main`.** O CI roda, mas nada impede um
push direto que ignore o resultado. Está **bloqueada por permissão**: o repositório
pertence a uma **conta pessoal** (`singlefutureadm-agency`), não a uma organização — e
repositório de conta pessoal só tem dono e colaborador, sem papel de admin intermediário.
Só a conta dona configura. Quando for feita, três pontos que não são óbvios:

- `required_approving_review_count` em **0**. Qualquer valor acima trava o merge para quem
  trabalha sozinho: ninguém aprova o próprio PR.
- `contexts` precisa bater **exatamente** com o `name:` dos jobs (`Backend (build, lint,
  unitários, e2e)` e `Frontend (build, lint)`), acentos incluídos. Nome divergente faz a
  proteção esperar para sempre um check que nunca chega.
- `enforce_admins: false` deixa uma saída de emergência para o dono se o CI quebrar por
  causa externa.

Depois dela, a lacuna nº 1 volta a ser **teste no frontend**, que segue em zero. Ver
`DOCUMENTACAO.md` §17, que traz o backlog priorizado com o gatilho de cada item.

**Riscos abertos e conscientemente não corrigidos** (todos em `DOCUMENTACAO.md` §15, com a
correção proposta): CRLF em assunto de e-mail no `nodemailer` 9; `esqueciSenha` propagando
falha do `MailService` (oráculo de enumeração, fechado na prática mas frágil); e o ETL
`migrate-legacy.ts`, que não compila nem roda.

Acrescente a esses um risco **de repositório**, não de código: o `DEPLOY.md` está num repo
**público** e descreve a infraestrutura de produção — host FTP com o IP da origem
(`179.188.54.241`), usuário `procertocp1`, porta 21 e a observação de que o servidor
recusa `AUTH TLS`. Nenhuma senha vazou, e o histórico foi varrido. Mas o IP publicado ao
lado da informação de que o site fica atrás do Cloudflare permite bater direto na origem e
contornar a proteção. Decisão consciente de deixar como está em 22/08/2026; se for
tratado, lembre que remover num commit novo não limpa o histórico.

---

## 8. Documentação de referência

- **`DOCUMENTACAO.md`** (~85 KB, 17 seções) — a referência completa: arquitetura, modelo de
  dados campo a campo, referência da API endpoint a endpoint com contratos de payload,
  decisões de projeto, §9 (estáticos, downloads autenticados e a rotina agendada), §14
  (estado medido de lint/testes e cobertura por service), §15 (problemas conhecidos e
  riscos abertos), §16 (postura de segurança), §17 (backlog priorizado com gatilhos).
  **Consulte antes de decidir arquitetura** — a maioria das perguntas de "por que está
  assim?" já está respondida lá.
- **`MIGRACAO.md`** — mapa "arquivo PHP → módulo atual" e os bugs do legado corrigidos.
  Útil ao encontrar um comentário citando o legado.
- **`README.md`** — guia de subida, incluindo como rodar o e2e. Está correto e alinhado
  com o repositório desde 19/08/2026.
