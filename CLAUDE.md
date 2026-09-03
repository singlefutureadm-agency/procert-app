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
npm ci
npm run setup                 # idempotente: .env que faltarem, migrations, generate, seed
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
| **Máquina de 4 GB: `tsc` e `eslint` morrem por OOM** | `Zone Allocation failed - process out of memory` sem limite de heap. **Limitar resolve**: `node --max-old-space-size=384 ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` e o equivalente para `./node_modules/eslint/bin/eslint.js`. Para o Jest o limite atrapalha (o exceljs passa de 384 MB) — ali o caminho é **parar o Docker** (`docker compose stop`) e rodar em lotes com `--runInBand`; o e2e precisa do banco de pé e só cabe sozinho. |
| **`npm ci` reprova fora do Node 24** | `engine-strict=true` nos `.npmrc` dos dois pacotes. `engines` sozinho só avisa, e o aviso some no meio do `npm ci`: a instalação termina "com sucesso" e a máquina quebra depois, longe da causa. A trava vale para a árvore inteira — medido em 28/08/2026, 910 pacotes no backend e 361 no frontend resolvem limpos. |
| **Porta 5433, não 5432** | O container é mapeado `5433:5432` para conviver com um PostgreSQL nativo já instalado na máquina em 5432. O `README.md` sempre esteve certo; quem trazia `5432` era o `backend/.env.example` — corrigido em 19/08/2026. |
| **Não rode `npm run build` com o `start:dev` ativo** | `nest-cli.json` tem `deleteOutDir: true` e apaga o `dist/` embaixo do processo em watch. |
| **`Cannot find module '.../dist/main'` após "Found 0 errors"** | Sintoma do conflito `deleteOutDir` × build incremental. Corrigido com `"incremental": false` em `tsconfig.build.json`. Se voltar: apague `dist/` e `tsconfig.build.tsbuildinfo` e reinicie. |
| **SMTP não configurado** | `MAIL_USER`/`MAIL_PASS` vazios no `.env` → o `MailService` só registra os e-mails no log em vez de enviar. É o comportamento esperado em dev. |
| **`npm run test:e2e` sem `.env.test`** | Falha na hora, com a mensagem certa. Copie de `.env.test.example`. |

### Scripts

**Backend** (`backend/`)

| Comando | Ação |
|---|---|
| `npm run setup` | **Rode depois de todo `git pull`.** Copia os `.env` que faltarem (nunca sobrescreve), confere o banco, aplica migrations, regenera o client e semeia. Idempotente |
| `npm run start:dev` | API em watch |
| `npm run build` / `npm run start:prod` | Build e execução de produção |
| `npm run seed` | 27 UFs, trilha "Certificação padrão" v1, categoria "Geral" já vinculada a ela, admin inicial. Idempotente — e o vínculo só entra no `create`, para não desfazer uma troca de trilha feita no painel. |
| `postinstall` | `prisma generate` a cada `npm ci`. O `@prisma/client` já faz isso no postinstall dele, mas o npm 11 passou a gatear script de dependência por allowlist — declarar aqui tira o client de refém de um detalhe de empacotamento de terceiro. É a mesma razão do passo explícito no CI. |
| `npm run migrate:legacy` | ETL MySQL legado → PostgreSQL (exige as vars `LEGACY_MYSQL_*`) |
| `npm run migrate:categorias` | Transpõe o catálogo global de etapas do legado para trilhas por categoria |
| `npm run prisma:studio` | UI do banco |
| `npm run lint` | ✅ ESLint 9 flat config (`eslint.config.js`), com `--fix` |
| `npm test` | ✅ 351 unitários, 19 suítes, Prisma mockado |
| `npm run test:cov` | ✅ idem, com cobertura |
| `npm run test:e2e` | ✅ 144 casos, 6 suítes, Supertest + PostgreSQL real. **Exige `backend/.env.test`** |
| `npm run typecheck:scripts` | ⚠️ type-check de `prisma/`. **Falha hoje**, e é esperado — o ETL do legado está desatualizado |

**Frontend** (`frontend/`)

| Comando | Ação |
|---|---|
| `npm run dev` | Vite (proxy de `/api` e `/uploads` para :3000) |
| `npm run build` | `tsc -b && vite build` — o type-check cobre os `.test.tsx` também |
| `npm run lint` | ✅ funciona (`eslint.config.js` presente) |
| `npm test` | ✅ 117 testes, 11 arquivos — Vitest + Testing Library, `vitest.config.ts` |
| `npm run test:watch` | idem, em watch |
| `npm run test:cov` | idem, com cobertura (v8) |

> **Os dois pacotes têm rede de segurança.** No backend, 326 unitários + 144 e2e cobrem
> auth, certificados, certificações (incluindo a renumeração da migração de trilha),
> catálogo e versões de trilha, NCs, relatórios, e-mail e a matriz de autorização. Ao mexer em regra
> de negócio, **rode `npm test` e `npm run test:e2e`**.
>
> No frontend são 117 testes, mirando **o que quebra em silêncio**: `lib/tema.ts` (um token
> fora do `MAPA_CSS` some da saída sem erro), `mensagemDeErro`, as chaves de cache (uma
> chave torta não atualiza a lista e não avisa) e as invariantes de acessibilidade de
> `Campo`, `CampoSenha` e `Modal` — associação rótulo↔controle, `type="button"` no
> alternador de senha, foco preso e devolvido. Nada disso produz stack trace: são bugs que
> passam em revisão de código e em teste manual de quem usa mouse.
>
> **Página inteira fica de fora por decisão** — o custo de montá-la com router, provider e
> mocks de rede não paga o que ela protege. Ver `DOCUMENTACAO.md` §14.

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

> **Depois de um `git pull`, rode `npm run setup`.** O pull traz migrations e um
> `schema.prisma` novos sem disparar nada — o `npm ci` não roda de novo, e com ele fica
> de fora o postinstall que regenera o Prisma Client. Banco uma versão atrás do código e
> client uma versão atrás do schema, os dois em silêncio, e o erro que aparece depois
> (`P2022`) acusa o código, que está certo. É o defeito de 26/08/2026 em produção, na
> máquina de desenvolvimento. `scripts/preparar-ambiente.js` é a guarda equivalente ao
> `migrar-no-deploy.js`, e nunca sobrescreve `.env` nem chama `migrate dev`.
>
> **E se você esquecer, a API recusa subir.** `PrismaService.conferirMigrations()` compara
> `prisma/migrations/` com `_prisma_migrations` no boot e derruba o start listando o que
> falta, com o comando a rodar. Só com `NODE_ENV=development`: em produção o build já
> garantiu, e em `test` o `globalSetup` do e2e aplica antes da suíte. `CHECAR_MIGRATIONS=false`
> desliga — guarda sem contorno é guarda que alguém arranca no primeiro aperto. A direção
> contrária (aplicada no banco, ausente do disco) é ignorada de propósito: acontece a todo
> `git checkout` para trás e não quebra nada.

### Fluxo de mudança no schema

```bash
cd backend
# edite prisma/schema.prisma
npx prisma migrate dev --name descricao_curta   # cria migration + regenera o client
```

**Em produção quem aplica é o build**, por `prisma/migrar-no-deploy.js`, chamado
pelo `vercel-build`. Ele só age com `VERCEL_ENV=production`, **derruba o deploy
se a migration não aplicar** e religa o RLS depois (o `migrate deploy` não o
conhece, e no Supabase tabela sem RLS fica aberta ao PostgREST). Isso substituiu
um passo manual em 26/08/2026, depois que três PRs seguidos com migration
subiram sem que ninguém a rodasse e o login em produção passou a devolver 500 —
`P2022`, coluna inexistente. **Não volte a tratar migration como passo manual**;
se precisar de uma janela controlada, o lugar de decidir isso é o script.
A URL de migração é **derivada** da `DATABASE_URL` por `urlDeMigracao()`, que
troca a porta :6543 (transaction pooler, o modo da função) por :5432 (session
pooler, o único que concede o advisory lock do Prisma Migrate).
`MIGRATE_DATABASE_URL` segue existindo como override e tem precedência, mas
**não é obrigatória** — era, e a exigência reprovou quatro deploys seguidos,
porque a `DATABASE_URL` na Vercel é do tipo Secret e ninguém consegue lê-la para
montar a segunda URL. Ver `DEPLOY.md` §3 e §5.

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

`UploadsService` cuida do que não muda entre ambientes — allowlist de MIME (imagens;
documentos de etapa aceitam também PDF/DOC/XLS), limite de tamanho, nome `randomUUID()` e a
URL relativa `/uploads/<pasta>/<uuid>.<ext>` que vai para o banco. **Onde o byte fica é do
`Armazenamento`**, o driver injetado por `UPLOAD_DRIVER`:

| Driver | Grava em | `/uploads/<pasta>/<arquivo>` |
|---|---|---|
| `disco` (padrão) | `UPLOAD_DIR` no filesystem local | `useStaticAssets` por pasta pública |
| `supabase` | Supabase Storage (REST por `fetch`) | **302** para a URL pública do bucket |

A abstração existe porque em serverless (Vercel) o filesystem é efêmero: um PDF gravado com
`writeFile` some na próxima instância fria e o registro no banco fica apontando para nada.
**A URL guardada no banco é idêntica nos dois drivers** — é o que mantém válidas as linhas
antigas e deixa o frontend fora do assunto. Faltando `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY`, a API **recusa subir** em vez de cair de volta no disco:
degradar em silêncio num ambiente efêmero perde arquivo sem erro. O bucket privado não sai
por URL assinada — seria um segundo caminho até o mesmo byte, com uma segunda chance de
esquecer a checagem de posse.

Toda leitura e remoção passa por `arquivoDeUpload()`, que decompõe a URL do banco em
`<pasta>/<arquivo>` e devolve `null` para qualquer outra forma — travessia inclusive. Quem
lê o conteúdo chama `uploads.ler(url)`: `caminhoAbsoluto` saiu junto com o pressuposto de
que existe caminho em disco.

> **Só as pastas públicas são servidas como estático.** `uploads.constantes.ts` é a fonte
> única: `PASTAS_PUBLICAS` (`clientes`, `funcionarios`, `produtos`, `aparencia`) ganha um
> `useStaticAssets` cada em `main.ts`; `PASTAS_PRIVADAS` (`certificados`, `certificacoes`)
> não é montada e só sai por `GET /certificados/:id/pdf` e
> `GET /certificacoes/documentos/:id/arquivo`, que verificam a posse. Um middleware em
> `/uploads`, registrado **antes** dos mounts, devolve 404 para qualquer pasta fora da
> allowlist — é redundante hoje, e existe para que remontar o estático por engano não
> reabra a exposição. **Ao criar uma pasta nova, decida de que lado da linha ela fica.**
>
> Com driver externo não há `serve-static` nenhum como segunda barreira, e o middleware
> passa a ser a única: por isso ele usa `arquivoPublicoDaRota()`, que exige
> `<pasta>/<arquivo>` — dois segmentos exatos — e é quem decide entre redirecionar para o
> bucket e deixar o estático servir.
>
> Ela **decodifica o caminho uma vez** antes de olhar a allowlist — a mesma decodificação
> que o `serve-static` faz — e recusa qualquer
> segmento `..`/`.` ou codificação inválida. Ler o texto cru deixava
> `/uploads/produtos/%2e%2e%2fcertificados/x.pdf` atravessar a allowlist como se
> `%2e%2e%2fcertificados` fosse nome de pasta (ver `DOCUMENTACAO.md` §15). Coberto por
> `test/uploads.e2e-spec.ts`.

---

## 4. Modelo de domínio e as regras que o sustentam

```
Trilha (catálogo) ──1:N──► ModeloTrilha (versão) ──1:N──► ModeloEtapa
   ▲                              ▲                            │
   └──1:N── CategoriaProduto      └── retrato ── Produto        │
                    │                              │            │
Cliente ──1:N──► Produto ──1:N──► CertificacaoProduto ──N:1─────┘
                    │                      ├──1:N──► CertificacaoHistorico ──1:N──► DocumentoCertificacao
                    │                      └──1:N──► NaoConformidade
                    ├──1:N──► Certificado
                    └──1:N──► Pagamento
```

O `schema.prisma` é **densamente comentado** e é a melhor fonte para o modelo. Os pontos
que exigem entendimento além do schema:

### Trilha é catálogo, não propriedade da categoria

**Mudou em 02/09/2026** (migration `20260902120000_trilhas_como_catalogo`). Antes,
`ModeloTrilha.categoriaId` fazia a trilha pertencer a uma categoria: o mesmo processo era
redigitado a cada categoria nova, e duas categorias com processos iguais divergiam em
silêncio na primeira revisão de uma delas.

Hoje há **três níveis, e confundi-los é a fonte de erro mais provável aqui**:

| Nível | Modelo | O que é | Quem aponta para ele |
|---|---|---|---|
| **Família** | `Trilha` | nome, descrição, status | `CategoriaProduto.trilhaId` |
| **Versão** | `ModeloTrilha` | o processo, imutável em uso | `Produto.modeloTrilhaId` |
| **Etapa** | `ModeloEtapa` | um passo da versão | `CertificacaoProduto.etapaId` |

**A categoria aponta para a FAMÍLIA; o produto, para a VERSÃO.** É essa assimetria que faz
tudo funcionar: trocar a trilha de uma categoria, ou publicar uma versão nova, muda a régua
dos produtos **futuros** e não toca em nenhuma avaliação em andamento. Fazer a categoria
apontar para a versão devolveria o problema que a versionamento existe para resolver.

### Trilhas versionadas — a regra central

- Ao cadastrar um produto, a API resolve `categoria → trilha → versão vigente`
  (`ativo: true`, maior `versao`) por `resolverVigentePorCategoria` e grava
  `Produto.modeloTrilhaId` como **retrato**. Na mesma transação, abre uma linha de
  `CertificacaoProduto` (status `PENDENTE`) para cada `ModeloEtapa`.
- Publicar uma versão nova **não mexe** nos produtos já submetidos: eles continuam sendo
  avaliados pelas regras vigentes na submissão.
- Uma `ModeloTrilha` com produto vinculado **não pode ser editada** (`409` com orientação
  para versionar). Só versão com `totalProdutos === 0` é editável.
- `criarVersao` sem `etapas` no payload **copia as da versão vigente** e encerra a anterior
  (`ativo: false`, `vigenteAte`) na mesma transação — a trilha nunca tem duas vigentes.
- `definirVigente` **volta** para uma versão encerrada, zerando o `vigenteAte` dela. Sem
  isso, desfazer uma publicação errada exigia criar uma cópia idêntica da anterior. A data
  de encerramento precisa mesmo sair: mantida, todo relatório de vigência mentiria.
- `removerVersao` recusa a **única** versão da trilha (as categorias vinculadas ficariam
  sem processo, em silêncio); excluindo a vigente havendo outras, a anterior assume **na
  mesma transação**.

### Duas guardas que impedem categoria muda

Categoria sem processo não pode chegar ao cadastro de produto sem aviso. As duas
mensagens são **distintas de propósito** — mandam para telas diferentes:

- **sem trilha vinculada** → resolve-se em `/categorias/:id`;
- **trilha sem versão vigente com etapas** → resolve-se em `/trilhas/:id`.

Por isso `vincularTrilha` recusa (409) uma trilha sem versão vigente, e
`alterarStatus(INATIVO)` recusa desativar trilha que alguma categoria ainda segue.

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
Ela resolve a vigente por `produto.categoria.trilhaId`; **categoria sem trilha cai no ramo
de "já atualizado"**, porque não há régua nova para onde migrar e um aviso ali mandaria o
usuário a uma ação que a tela não completa.

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

### E-mails ao cliente — a lista de eventos é uma allowlist

Quem compõe o texto é `NotificacoesService` (módulo `mail`, global). O
`MailService` é **só transporte**: recebe destinatário, assunto e HTML pronto.
Ao acrescentar um aviso, escreva um método lá — não monte HTML no service de
domínio.

**Só marcos decisivos notificam.** Decisão do cliente em 03/09/2026:

| Evento | Onde dispara |
|---|---|
| Etapa **reprovada** | `CertificacoesService.salvar` → `EVENTOS_NOTIFICAVEIS` |
| NC aberta **no lote da reprovação** | mesmo e-mail da reprovação, não um segundo |
| NC aberta **avulsa** | `NaoConformidadesService.abrir` |
| NC avaliada (resolvida ou não) | `NaoConformidadesService.avaliar` |
| Certificado **emitido** | `CertificadosService.emitir` |
| Certificado **suspenso** ou **cancelado** | `CertificadosService.alterarStatus` |

**Não notificam**, de propósito: `PENDENTE → EM_ANDAMENTO`, aprovação de etapa
isolada e reativação de certificado. Aviso demais treina o destinatário a
ignorar todos, e aí o único que exigia ação dele chega junto com os que não
exigiam. Alargar a régua para status de etapa é acrescentar um valor a
`EVENTOS_NOTIFICAVEIS` — é uma lista por isso.

**Um destinatário**, o e-mail da conta (`Cliente.email`). Não há tabela de
contatos, e a decisão de 03/09/2026 foi manter assim: quem repassa internamente
é o cliente.

Três regras que não devem regredir:

- **O envio é `await`, nunca `void`.** Em serverless a função congela quando a
  resposta sai e a promessa solta se perde — o e-mail não sai e não há erro.
  Cada `avisar*` engole a própria falha, então esperar é seguro.
- **Todo texto vindo do banco passa por `seguro`**, o template que escapa
  sozinho. `html()` é a escotilha para trecho que o próprio arquivo montou.
- **Todo assunto passa por `assuntoLimpo()`** — nome de produto com CRLF
  emendaria cabeçalho, e o `nodemailer` 9 recusaria a mensagem inteira.

O e-mail do cliente **não entra** nos `SELECT_*` dos services: cada `avisar*`
faz a consulta própria. Acrescentá-lo ao select mudaria o corpo devolvido por
todos os endpoints do domínio.

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
  **Em serverless nada disso roda**: o timer morre com a instância. Lá a variável fica
  `false` e quem acorda a rotina é o Vercel Cron, por `GET /certificados/cron/expirar-vencidos`
  (`expiracao.cron.controller.ts`), autenticado por `CRON_SECRET` — um segredo **dedicado**,
  que não vira sessão e abre uma única porta. É a resposta à objeção registrada no
  `expiracao.cron.ts`, que recusa agendador externo por causa do token de ADMIN guardado
  fora do sistema.
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
afrouxe esse DTO. As URLs de imagem (`logoTemaClaroUrl`, `logoTemaEscuroUrl`,
`papelParedeUrl`) **não são aceitas no corpo do PUT**: só os endpoints de upload as
definem, senão o admin poderia apontar a marca do painel para uma URL externa. `PUT` usa
concorrência otimista via `atualizadoEmVisto` → 409.

**São duas logos, uma por tema**, em `POST`/`DELETE /aparencia/logo/tema-claro` e
`.../tema-escuro`. O fallback é **cruzado**: faltando a do tema vigente, usa-se a outra —
quem envia uma logo só continua com marca nos dois modos. Quem resolve é
`logoDoTema(aparencia, tema)` em `lib/tema.ts`, e o argumento é o tema do **fundo** onde a
imagem vai aparecer, não o modo do usuário: o cabeçalho do site institucional é
transparente sobre um hero escuro nos dois modos, então ele pede sempre a variante escura.

`::selection` e a barra de rolagem derivam de `--cor-primaria` em `global.css`, sem token
próprio — mudam junto com a paleta sem acrescentar campo na tela. A regra de scrollbar
vive em `:root, .previa` pelo mesmo motivo dos outros derivados: `scrollbar-color` é
herdada já resolvida, e declarada só na raiz a prévia mostraria a barra do tema em uso.

### Último acesso e carteira de clientes

`Cliente.ultimoAcessoEm` e `Funcionario.ultimoAcessoEm` guardam o **último login
bem-sucedido**, carimbados em `AuthService.login()` **só no caminho de sucesso** — um write
no ramo de e-mail inexistente daria sinal de tempo distinguindo conta cadastrada de não
cadastrada, exatamente o que a comparação contra hash inválido evita. O `UPDATE` usa
`await` + `try/catch`: em serverless a função congela quando a resposta sai, e promessa
solta se perderia; falhar ali não derruba o login.

Responde **"quem sumiu"**, não frequência de uso — não há tabela de eventos, por decisão.
Como `Cliente` **é** a conta, a relação é 1:1, e o rótulo na UI é "Último acesso da conta".

`Cliente.responsavelId` é a **carteira**: FK 1:N, não pivô. **É informativo e NÃO restringe
acesso** — nenhum service filtra por ele. O `SetNull` só é seguro enquanto for assim; ao
fechar o acesso por carteira, desativar um funcionário faria a carteira dele sumir do
painel de todos, em silêncio. A validação (funcionário existe **e** está ATIVO) vive no
service, não na FK.

### As três medidas de tempo — nunca "tempo da etapa"

| Rótulo (o mesmo na tela, na API e na planilha) | De | Até |
|---|---|---|
| **Lead time da trilha** | `Produto.criadoEm` | aprovação da última etapa **obrigatória** |
| **Tempo de tratamento da etapa** | 1ª saída de `PENDENTE` | aprovação |
| **Tempo em fila** | `CertificacaoProduto.criadoEm` | 1ª saída de `PENDENTE` |

Mais **Aprovação direta** (`PENDENTE` → `APROVADO` sem tratamento) e **Etapas em aberto**.

**Não use "tempo da etapa" genérico em lugar nenhum** — os três relógios cabem embaixo
desse nome, e a pergunta "por que essa etapa demorou 14 dias?" fica sem resposta.

Dois fatos do schema determinam os marcos:

- **`CertificacaoProduto.criadoEm` é a entrada na FILA.** A coluna é `DEFAULT
  CURRENT_TIMESTAMP` e a trilha nasce num `createMany` dentro da transação do produto — em
  Postgres isso é o início da transação, então **todas as etapas nascem com o mesmo
  timestamp**, igual ao do produto. Usá-lo como início do tratamento mediria o produto.
- **A trilha não é sequencial.** `salvar()` recebe lote e não impõe ordem, então "início =
  aprovação da anterior" é inválido, e `PENDENTE → APROVADO` direto acontece.

Recortes que impedem número mentiroso: só etapas `APROVADO` entram nas medianas (as abertas
vão a bloco próprio, senão volta o viés de sobrevivência); aprovação direta sai da mediana
de tratamento (zero por construção); o fim exige `statusAnterior <> statusNovo`, senão um
anexo posterior à aprovação empurra o fim; **mediana, nunca média**; agrupamento por
categoria **+ versão**; e **base vazia devolve `null`, nunca `0`** — zero afirmaria "levou
zero dia".

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
│                   Inclui `home` (site institucional público), `aparencia`,
│                   `relatorios` (equipe, comparativos e tempo de ciclo) e
│                   `trilhas` (catálogo de processos: versões, etapas, dnd-kit).
│                   As etapas se editam em `trilhas`, NÃO em `categorias-produto`
│                   — lá se escolhe qual trilha a categoria segue, e a mesma
│                   trilha serve a várias categorias.
├── lib/            api.ts (axios), queryClient.ts (chaves de cache), tema.ts, formatadores
│                   seo.ts (meta por rota), imagem.ts (reduz upload), cep.ts + useCep.ts
├── pages/          Telas fora do painel (login, reset, 404, sem-permissão)
├── styles/         global.css — tema "liquid glass" herdado do legado
├── testing/        setup do Vitest e fixtures compartilhadas dos testes
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

`/` é o **site institucional público**, com quatro páginas próprias além dele:
`/sobre`, `/servicos`, `/contato` e as duas legais (`/termos-de-uso`,
`/politica-de-privacidade`). O painel fica sob uma rota de layout **sem `path`** envolvida
em `<RotaProtegida>`, com os filhos declarando caminhos absolutos (`dashboard`,
`certificacoes`, `produtos`, …). Rotas restritas usam `<RotaProtegida papeis={['ADMIN']}>`
— **isso é UX, não controle**: o backend repete a checagem em todo endpoint. Ao adicionar
uma rota, ajuste também `components/layout/Sidebar.tsx` (que filtra itens por `papeis`).

**Só a home e o login entram no pacote inicial.** Todo o resto é `lazy`, e o `<Suspense>`
que os segura fica no `main.tsx`, com `CarregandoRota` de fallback. O pacote saiu de 512 KB
para ~332 KB: antes, quem chegava pela busca para ler a página de serviços baixava o painel
inteiro — dashboard, certificações, produtos, clientes, categorias, equipe, aparência —
antes da primeira linha de texto.

Ao acrescentar rota pública, atualize **três** lugares além do router: `PAGINAS` em
`features/home/conteudo-paginas.ts` (menu e rodapé), `public/sitemap.xml` e, se ela não
deve ser rastreada, `public/robots.txt`.

> **Pedaço obsoleto após deploy.** Cada build gera hash novo, e uma aba aberta antes de um
> deploy pede um nome que não existe mais — "Failed to fetch dynamically imported module".
> `pagina()` no topo de `router.tsx` recarrega a página uma vez nesse caso, com trava em
> `sessionStorage` contra laço. **Isso depende do `vercel.json`**, cujo fallback de SPA
> exclui `/assets/`: com o catch-all cru, o pedaço ausente voltava como `index.html` com
> status 200 e `content-type: text/html`, e o erro era falha ao executar HTML como módulo,
> não um 404. Mexeu num, confira o outro.

### SEO do site institucional (`lib/seo.ts`)

O `index.html` traz **um** `<title>` e **uma** `<meta description>` para o site inteiro.
Isso bastava enquanto a home era a única página pública; com `/sobre`, `/servicos` e
`/contato`, as páginas passariam a disputar o mesmo título no resultado de busca.

`aplicarSeo()` / `useSeo()` definem por rota: title, description, canonical, Open Graph,
Twitter Card e um bloco JSON-LD. Escrito à mão em vez de `react-helmet-async`, pelo mesmo
critério que manteve gráficos e ícones sem biblioteca.

- `organizacao()` só declara o que é verificável no próprio site. **Não afirma acreditação
  junto ao Inmetro/Cgcre, escopo acreditado nem norma coberta** — para um OCP são
  declarações com efeito regulatório, e schema.org é lido por agregadores. O campo próprio,
  havendo confirmação documental, é `hasCredential`.
- O mesmo limite vale para o texto das páginas: está registrado no topo de
  `features/home/conteudo-paginas.ts`. **Leia antes de acrescentar conteúdo lá.**
- `FAQPage` exige que a resposta esteja **visível** na página — é por isso que o bloco de
  perguntas não é acordeão.

`public/robots.txt` fecha o painel e `/uploads` ao rastreio; `public/sitemap.xml` lista as
seis rotas públicas. Ambos são mantidos à mão.

> **Limite conhecido:** tudo isso roda no cliente. O Googlebot executa JS e lê o resultado,
> mas crawlers sem JS — e as prévias de link do WhatsApp, LinkedIn e X — recebem o
> `<div id="root">` vazio. Fechar isso é pré-renderizar as rotas públicas no build (SSG);
> não toca em componente, é configuração. Anotado no fim de `lib/seo.ts`.

### Upload de imagem — o erro que chega como "CORS"

**O corpo de uma requisição na Vercel para em 4,5 MB**, e o corte é feito pela plataforma
antes da função rodar: a resposta 413 sai sem passar pelo middleware de CORS, e o navegador
relata `No 'Access-Control-Allow-Origin' header`. O sintoma esconde a causa. Se um upload
falhar com CORS em produção, **olhe o status no log da função antes de mexer em CORS**.

`lib/imagem.ts` redimensiona e recomprime em `<canvas>` antes de enviar. Está ligado no
`CampoArquivo` — então funcionário, cliente e produto ganham juntos — **e em
`features/aparencia/CampoImagem`**, que usa um input próprio e por isso não vem de graça.
Uma foto de 8,7 MB vira 427 KB. Três regras que não são detalhe:

- PNG, WebP e GIF saem como **WebP, nunca JPEG** — converter achataria em preto o fundo
  transparente de uma logo. Coberto por `lib/imagem.test.ts`: é a decisão que falha calada,
  porque o upload conclui e o defeito só aparece na marca exibida.
- Arquivo que já cabe no limite e nas dimensões volta **intacto**: recomprimir o que já
  está bom só degrada.
- O que ainda não couber depois de reduzido é **recusado com mensagem clara**, em vez de
  virar outro 413 disfarçado.

Passe `otimizar={false}` para arquivo que precisa subir intacto — um PDF de evidência, por
exemplo, que este componente não deve tocar.

> **Ao criar um seletor de arquivo, não use `<input type="file">` cru.** Foi assim que a
> tela de Aparência ficou de fora por três semanas: `CampoArquivo` nasceu copiando o
> `CampoImagem`, e o original nunca foi migrado de volta. Logo acima de 4,5 MB voltava
> como erro de CORS em produção (01/09/2026). Use `CampoArquivo`, ou chame
> `prepararImagem` explicitamente.

### Formulários — CEP e senha

- **`lib/cep.ts` + `useCep.ts`** preenchem logradouro, bairro, cidade e UF pelo ViaCEP.
  Dispara ao completar oito dígitos (não no `blur`: quem digita CEP segue direto para o
  número). **Não sobrescreve campo já preenchido** — trocar o CEP de um cadastro antigo não
  pode apagar um complemento corrigido à mão, e CEP de logradouro único volta sem rua.
  Serviço fora do ar não vira toast de erro; CEP inexistente, sim (o ViaCEP o devolve como
  200 com `erro` verdadeiro, não 404). A consulta **não passa pela nossa API** de propósito.
- **`CampoSenha`** substitui todo `<input type="password">`. O alternador é
  `type="button"` — o padrão dentro de um `<form>` é submit, e sem isso revelar a senha
  enviaria o formulário.

### Tema / aparência (`lib/tema.ts` + `features/aparencia/`)

Todo componente lê `var(--token)`. Aplicar tema = escrever custom properties no
`documentElement` → repinta o painel inteiro **sem re-render do React**. `MAPA_CSS` é a
allowlist token→propriedade CSS. `propriedadesDoTema` é separado de `aplicarTema` porque os
previews da tela de Aparência aplicam num container isolado (é o que permite mostrar claro
e escuro lado a lado). `checarContrastes` calcula razão WCAG achatando cores translúcidas
sobre o fundo — **avisa, não bloqueia** o salvamento.

### Exportação para planilha — `common/planilha` + um serviço por relatório

> As regras que fazem o arquivo **abrir de fato no Excel** vivem em
> `src/common/planilha/planilha.util.ts` e são compartilhadas por todas as exportações:
> saneamento de nome de aba, data como `Date` com `numFmt`, BOM de UTF-8, separador `;`,
> escape de CSV e base de nome de arquivo. **Não as reescreva** num serviço novo — cada uma
> nasceu de um arquivo que o Excel recusava ou abria errado.
>
> **Cuidado com crase em comentário SQL**: o `Prisma.sql` é template literal, e uma crase
> dentro dele fecha o template. Já derrubou um build.

#### O caso original — `modules/certificacoes/exportacao.service.ts`

`GET /certificacoes/produto/:id/exportacao?formato=xlsx|csv`, gerada no servidor com
`exceljs`. Reaproveita `detalharPorProduto` em vez de consultar de novo: é lá que o escopo
do CLIENTE é verificado, e uma segunda consulta seria uma segunda chance de esquecer a
checagem.

O XLSX tem **aba de visão geral → uma aba por etapa (na ordem da trilha) → aba de
histórico**. Detalhes que não são estéticos:

- **Nome de aba passa por `nomeAba()`.** Excel recusa mais de 31 caracteres, recusa
  `\ / ? * [ ] :` e recusa duplicata — e nome de etapa é texto livre do admin. O exceljs
  replica essas regras e **lança** em caractere proibido, nome vazio e duplicata (comparada
  sem caixa); só o excesso de 31 ele trunca, com aviso. Ou seja, sem o saneamento a
  exportação vira **500 na geração**. O desempate parte sempre da base, nunca do nome já
  sufixado: derivar do anterior empilhava marcas (`1. Ensaio(2)(3)`) e estourava o limite a
  partir de `(10)`, que ocupa 4 caracteres.
- **Data vai como `Date`, não string**, com `numFmt`. É o que faz o autofiltro do Excel
  ordenar de verdade; como texto, 10/01 vem antes de 02/12.
- **CSV não tem abas.** O arquivo empilha as mesmas seções com linhas de título. Leva
  **BOM de UTF-8** (sem ele o Excel do Windows abre em ANSI e todo acento quebra) e
  separador **`;`** (no Excel em português a vírgula é separador decimal, e com `,` tudo
  cai numa coluna só).

Coberto por `exportacao.service.spec.ts` (21 casos), que **gera o XLSX e relê o buffer** —
é a releitura que prova que o Excel aceitaria o arquivo. O e2e baixa e não abre, então
nenhuma dessas regras é alcançável por teste de rota.

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
- **`RegiaoRolavel`** é o invólucro de toda caixa com rolagem horizontal: a região precisa
  de `tabIndex={0}` + `role="region"` + rótulo, senão o que está escondido fica
  inalcançável por teclado. Ele **mede o estouro** com `ResizeObserver` e só vira parada de
  Tab enquanto realmente rola. `TabelaRolavel` é o caso particular dele para
  `.tabela-wrapper`; a timeline da certificação usa o genérico direto. **Não escreva um
  `overflow-x: auto` cru** — use um dos dois.
- **`Modal`** concentra a mecânica dos modais: cortina, Escape, Tab preso e devolução do
  foco à origem. O foco inicial é dado no efeito, **não** por `autoFocus` — `autoFocus`
  roda antes do efeito e fazia a origem ser gravada errada (o resultado era o foco
  terminando no `<body>`). `focus({ focusVisible: true })` em todos os casos, senão o anel
  não acende em modal aberto por clique. Modal novo se monta sobre ele.
- **`ModalConfirmacao`** é o `Modal` com mensagem e dois botões. Com `perigo`, o foco
  inicial é **"Cancelar"** (via `focoInicial`); sem ele, o confirmar — o modal abre por
  clique e fecha no Escape, então o dedo costuma estar sobre Enter quando ele aparece.
- **`Campo`** associa rótulo e controle sozinho: gera o `id` com `useId`, clona o filho para
  injetar `id`/`aria-describedby`/`aria-invalid` e aponta o `htmlFor`. Era um `<label>` órfão
  ao lado de um input sem `id` — o leitor de tela não anunciava qual campo era, clicar no
  rótulo não focava nada e a mensagem de erro não estava ligada ao campo. **Todo controle de
  formulário deve entrar dentro de um `<Campo>`**, não solto.
- **`CampoArquivo`** substitui o `<input type="file">` cru. O nativo desenha botão e texto
  com legendas do **navegador**: num Chrome em pt-PT o painel exibia "Escolher ficheiro /
  Nenhum ficheiro selecionado" no meio de uma UI em pt-BR, e não há como estilizá-lo.
- **Senha é obrigatória ao criar e opcional ao editar** — `esquemaDoModo(editando)` nos
  formulários de cliente e funcionário. Um esquema só para os dois modos deixava criar sem
  senha passar pelo zod, e só o backend recusava, com toast genérico e sem marcar o campo.
- **`lib/mascaras.ts`** formata CPF, CNPJ, telefone e CEP enquanto se digita, via `setValue`
  — o valor tem de chegar mascarado ao react-hook-form, porque é ele que vai no payload. Os
  limites do schema (`VarChar(18)`, `(14)`, `(9)`) são o comprimento **com** pontuação.
- **Skip link** (`.pular-para-conteudo`) é o primeiro focável do `LayoutPainel` e aponta
  para `#conteudo-principal`, que carrega `tabIndex={-1}` para poder receber o foco.

### Teste no frontend — o que testar e o que não

Vitest + Testing Library, `environment: jsdom`, configurado em `vitest.config.ts`
(separado do `vite.config.ts` para que mudança de teste não arrisque o bundle). **O alias
`@/` está declarado em TRÊS lugares** — `vite.config.ts`, `tsconfig.json` e
`vitest.config.ts` — e os três precisam ficar em sincronia.

O critério do que entra é **"quebra em silêncio?"**. Nada do que está coberto lança
exceção: um token fora do `MAPA_CSS` some da saída, uma chave de cache torta não atualiza
a lista, um `<label>` órfão só falha para quem usa leitor de tela. É o que passa em revisão
de código e em teste manual.

Ao escrever teste de componente, **asserte a relação, não o HTML**: `getByLabelText` só
encontra o controle se a associação existir de verdade, enquanto `querySelector('label')`
passaria com o rótulo órfão. Da mesma forma, `toHaveAccessibleDescription` prova o elo do
`aria-describedby` que um `toHaveAttribute` não prova.

`pool: 'forks'` com `singleFork` porque a máquina de desenvolvimento tem 4 GB: o pool
padrão abre um jsdom por núcleo e a suíte morre por memória. O `afterEach` global chama
`cleanup()` — sem ele um `getByRole` acha o componente do caso anterior e o resultado passa
a depender da ordem.

**Página inteira não é testada**, por decisão: exigiria router, `QueryClientProvider`,
`AuthProvider` e mock de rede para provar pouco além do que o type-check já garante.

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
- **`npm run migrate:categorias` fala do modelo antigo.** Ele transpõe o catálogo global do
  legado para trilhas **por categoria**, que é a forma anterior a 02/09/2026. Já não
  compilava (`typecheck:scripts` reprova de propósito); agora também está errado no modelo.
  Só é relevante para quem for retomar o ETL do legado.
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
  Desde a exportação para planilha há **1 advisory moderate a mais**: `uuid` via `exceljs`. A
  advisory é "missing buffer bounds check em v3/v5/v6 quando `buf` é fornecido", e o
  `exceljs` importa **só `uuid.v4`** (`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`)
  — o caminho vulnerável não é alcançável. A "correção" que o `npm audit` propõe é
  descer o `exceljs` para 3.4.0, um major para trás; não é correção.
  **São duas advisories, mas o `npm audit` conta cinco.** Ele conta *pacotes* na cadeia,
  não advisories: `deepmerge-ts` + `@prisma/config` + `prisma` fecham os 3 high, e `uuid`
  + `exceljs` os 2 moderate. Medido em 28/08/2026 num clone limpo:
  `npm audit --omit=dev` → `{"moderate":2,"high":3,"total":5}`. Um gate de CI compara com
  **5**, não com 4 — a diferença já custou uma investigação em falso.
- **Erro de CORS num upload quase nunca é CORS.** O corpo de requisição na Vercel para em
  4,5 MB e a plataforma responde 413 sem passar pelo middleware — o navegador então não
  acha `Access-Control-Allow-Origin` e culpa o que não é. Confira o status no log da função
  antes de mexer em CORS.
- **Código novo em produção contra schema velho** foi o incidente de 26/08/2026:
  login com 500 e `P2022 — funcionarios.ultimo_acesso_em não existe`. O CI não
  pega, e não é falha dele: o e2e sobe um Postgres limpo, onde `migrate deploy`
  aplica tudo e nunca há divergência. Só o banco de produção acumula defasagem.
  Fechado no build (§2), mas o sintoma vale ser reconhecido: **`P2022` em
  produção é migration pendente, não bug de código.**
- **`vercel.json` não aceita campo fora do schema.** Um `comment` dentro de `rewrites[]`
  derruba o deploy na validação, antes de compilar. JSON não tem comentário; a explicação
  vai no código que depende da regra.
- **Categoria sem trilha não aceita produto**, e a primeira versão de uma trilha precisa
  vir com etapas (não há versão anterior para copiar). São **dois** modos de falha desde
  que a trilha virou catálogo — sem trilha vinculada, e trilha sem versão vigente — e as
  mensagens são diferentes porque as telas de conserto são diferentes.
- **Ao ler `modeloVigente` de uma categoria, lembre que ele vem da trilha.** Uma categoria
  pode ter `trilha` preenchida e `modeloVigente` nulo: vinculada a uma trilha que ainda não
  publicou versão. Tratar os dois como o mesmo caso faz a tela dizer "sem trilha" para quem
  acabou de vincular uma.
- **Assets da home são pesados** e vieram do legado sem reprocessamento
  — mas o pior deles saiu do caminho: `depoimentos-bg.png`, de 2,4 MB, era dois terços do
  peso e virou gradiente CSS em `841a6b7`. **O arquivo continua em `public/img/`, agora sem
  referência**: reprocessar para WebP e reativar, ou apagar, é decisão em aberto. `cta-bg.jpg`
  (332 KB) e `hero-bg.jpg` (218 KB) seguem como estão. O `bootstrap-icons.css` completo (~106 KB) é carregado
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

**Publicação** (23/08/2026):

14. `87339f7` armazenamento externo (driver de `Armazenamento`: disco | Supabase Storage) e
    publicação em **Vercel + Supabase**. A API roda como função (`framework: null` e
    `api/index.js`, pelos motivos em `DEPLOY.md` §7), o painel como estático, e push em
    `main` publica sozinho. O `DEPLOY.md` foi reorganizado: **Parte I** é a produção de
    hoje; **Parte II** é a hospedagem própria com FTP, que continua descrevendo o servidor
    do legado.

**Site institucional e painel** (24/08/2026) — tudo verificado em produção:

15. `72884a9` páginas `/sobre`, `/servicos` e `/contato`, com a camada que as torna
    indexáveis: `lib/seo.ts` (meta por rota, canonical, Open Graph, JSON-LD), `robots.txt`
    e `sitemap.xml`, que não existiam.
16. `9ef75db` proporção das logos por `clamp` (o cabeçalho tinha 96px fixos sobre uma barra
    de 116px; o rodapé, 90px em qualquer largura) e alvos de toque medidos — botão de
    login 37→44px, marcadores do carrossel 12→40px, links do rodapé 16→35px.
17. `841a6b7` carrossel reescrito (`figure`/`blockquote`/`figcaption`, crossfade, barra de
    progresso), hierarquia de headings corrigida — a home tinha `h1 → h3` e seções sem
    `h2` — e carga sob demanda: 512 KB → ~332 KB. O fundo dos depoimentos saiu de um PNG de
    **2,4 MB** para gradiente; ele ficava sob um overlay de 70%.
18. `1865fa4` upload que falhava como "CORS" (era 413 da plataforma), autopreenchimento por
    CEP e alternância de visibilidade da senha.
19. `7f03cc4` + `fe7166e` recuperação de pedaço obsoleto após deploy, e `/assets/` fora do
    fallback de SPA. Regressão do item 17, encontrada em produção.
20. `97b16c1` primeira trilha de uma categoria — sem isso, categoria criada pelo painel
    nunca aceitava produto.

**Relatórios de gestão** (25–26/08/2026) — leva de cinco PRs, pedida pelo sócio para o
painel deixar de ser só operacional e responder perguntas de reunião:

21. `#16` `ultimoAcessoEm` em `Cliente` e `Funcionario`, carimbado no login. Responde "quem
    sumiu", **não** frequência de uso — a tabela de eventos foi deliberadamente descartada.
    Seção 4 da Política de Privacidade declara o registro.
22. `#17` carteira de clientes (`Cliente.responsavelId`). **Informativa: não restringe
    acesso.** Fechar isso é item de backlog com custo próprio (`DOCUMENTACAO.md` §17).
23. `#18` relatório de desempenho da equipe **por autoria**, zero migration. Extrai
    `common/planilha` de `exportacao.service.ts` sem tocar no spec existente — os 21 casos
    seguem intactos, o que é a prova de que o refactor não regrediu.
24. `#19` `baseUrl` removido dos dois `tsconfig` (obsoleto, some no TypeScript 7).
25. `#20` comparativos de produtos e de clientes.
26. Tempo de ciclo, com as três medidas nomeadas.

Todo o módulo `relatorios` agrega em **SQL (`$queryRaw`)**, não em memória como o
`dashboard`, e usa `LEFT JOIN LATERAL` por fonte — `JOIN` direto multiplica as linhas entre
si e infla todo `COUNT`. **Ordenação e agrupamento saem de allowlist fechada**: `ORDER BY`
não aceita placeholder.

**Trilha vira catálogo** (02/09/2026):

27. `ModeloTrilha.categoriaId` → `Trilha` (família) + `CategoriaProduto.trilhaId`. Trilha
    passa a ser cadastro próprio, reutilizável por várias categorias, com CRUD completo em
    `/trilhas` e entrada própria no submenu. Ganha DELETE de trilha e de versão, e
    `definirVigente` para voltar a uma versão encerrada — nada disso existia. A tela da
    categoria deixou de editar etapas e passou a **escolher** a trilha.

    A migration `20260902120000_trilhas_como_catalogo` preserva tudo: cada categoria que
    tinha trilha vira uma entrada do catálogo com o nome dela, as versões são repontadas e
    a categoria passa a apontar de volta. **Nenhum `produtos.modelo_trilha_id` é tocado.**

    **A preservação foi verificada contra a base de desenvolvimento real** (2 categorias,
    6 versões, 25 etapas, 4 produtos, 18 certificações): todas as contagens idênticas,
    zero versão órfã, e `produtos.modelo_trilha_id` **byte a byte igual** antes e depois.
    Dois produtos estavam em versões já ENCERRADAS — o caso que mais facilmente se
    perderia — e continuaram nelas.

    > **Ao rodar em produção, refaça a conferência.** A base de produção tem outra forma,
    > e o CI não cobre isto: o e2e sobe um Postgres vazio, onde `migrate deploy` prova que
    > o SQL roda, não que os `UPDATE ... FROM` acertam linhas — porque não há linha.
    > `SELECT count(*) FROM modelos_trilha WHERE trilha_id IS NULL` deve dar 0, e o total
    > de `categorias_produto WHERE trilha_id IS NOT NULL` deve bater com o de categorias
    > que tinham trilha antes.

28. Achado só no navegador, depois de tudo verde: com a categoria trocando de trilha, o
    botão de migração dizia **"Atualizar trilha (v1 → v1)"**. Verdadeiro e inútil — cada
    trilha numera as versões por conta própria, então duas v1 são processos diferentes.
    `verificarVersaoTrilha` passou a devolver `trilhaProduto`/`trilhaVigente`, e a
    mensagem nomeia as duas **só quando diferem**. Coberto por dois casos novos. Nenhum
    teste pegaria isso: a string estava certa, faltava sentido para quem lê.

**A branch protection em `main` está ATIVA** (verificado em 24/08/2026 — um push direto
foi recusado com `GH013: Changes must be made through a pull request` e `2 of 2 required
status checks are expected`). Foi configurada por *repository rules*, que funcionam em
repositório de conta pessoal — a anotação anterior, de que estaria bloqueada por
permissão, não vale mais.

Na prática: **todo trabalho vai por branch + PR**, o merge espera os dois jobs do CI, e
`gh pr merge --auto` não está disponível neste plano (o repositório recusa
`enablePullRequestAutoMerge`) — aguarde os checks e faça o merge.

A lacuna do frontend foi fechada — são 117 testes hoje, mirando o que quebra em silêncio
(ver §5). Ver `DOCUMENTACAO.md` §17, que traz o backlog priorizado com o gatilho de cada
item.

**Riscos abertos e conscientemente não corrigidos** (todos em `DOCUMENTACAO.md` §15, com a
correção proposta): `esqueciSenha` propagando falha do `MailService` (oráculo de
enumeração, fechado na prática mas frágil) e o ETL `migrate-legacy.ts`, que não compila
nem roda. O CRLF em assunto de e-mail saiu da lista em 03/09/2026: todo assunto passa por
`assuntoLimpo()` no `NotificacoesService`.

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
