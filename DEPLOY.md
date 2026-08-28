# Deploy

O ProCert roda hoje em **Vercel + Supabase**, publicado em 23/08/2026. Este
documento tem duas partes, e a ordem importa:

- **Parte I — a produção de hoje.** É o que está no ar e o que você mexe no dia
  a dia.
- **Parte II — hospedagem própria (Node + FTP).** O caminho anterior, com o
  levantamento do servidor da Locaweb. Continua válido para quem for subir numa
  máquina com runtime Node, e é onde vive o histórico do domínio
  `procertocp.com.br`, que **ainda serve o sistema legado**.

---


# Parte I — A produção de hoje

## 1. O que está no ar

| Peça | Onde | Endereço |
|---|---|---|
| Painel + site institucional | Vercel, projeto `procert-app` | https://procert-app.vercel.app |
| API NestJS | Vercel, projeto `procert-api` (função serverless) | https://procert-api-singlefutureadm-9995s-projects.vercel.app/api |
| PostgreSQL 17 | Supabase, projeto `procert` (`sa-east-1`) | pooler `aws-0-sa-east-1.pooler.supabase.com` |
| Arquivos enviados | Supabase Storage | buckets `procert-publico` e `procert-privado` |

Os dois projetos da Vercel apontam para **o mesmo repositório**, com
`rootDirectory` diferente (`backend/` e `frontend/`) e branch de produção `main`.

## 2. Como uma mudança vai ao ar

**Push em `main` publica em produção.** Push em branch ou PR publica um
*preview*. Não há passo manual — a integração com o GitHub faz o deploy sozinha,
**migration incluída**: desde 26/08/2026 o build de produção roda
`prisma migrate deploy` antes de compilar (§5), e reprova se ela não aplicar.

O fluxo é o do `README.md`: branch → PR → CI verde → merge. O CI (build, lint,
275 unitários e 75 e2e) roda no PR e é a rede de segurança **antes** do deploy;
a Vercel não roda os testes.

> **Variável de ambiente alterada NÃO redeploya nada.** O valor entra no
> ambiente da função no momento em que o deployment é criado. Depois de mexer em
> qualquer variável é preciso um deploy novo — qualquer push serve, ou
> *Redeploy* no painel da Vercel.

## 3. Variáveis de ambiente

Ficam na Vercel (Settings → Environment Variables), **só em Production**. Não
foram replicadas para Preview de propósito: o preview de um PR apontaria para o
banco de produção, e uma branch em desenvolvimento poderia alterar certificado de
verdade. A consequência é conhecida e aceita — **preview de PR sobe com a API
fora do ar**, e a validação de um PR se faz pelo CI e localmente. Para testar um
PR contra dados reais, crie um projeto Supabase próprio e aponte o Preview para
ele.

`procert-api`:

| Variável | Valor em produção | Por quê |
|---|---|---|
| `DATABASE_URL` | pooler **:6543** com `?pgbouncer=true&connection_limit=1` | é o *transaction pooler*, o modo para função stateless. A **:5432** é o *session pooler*, e é ela que o `prisma migrate` exige |
| `MIGRATE_DATABASE_URL` | pooler **:5432**, sem `pgbouncer=true` | **opcional**, e hoje não está definida. `migrar-no-deploy.js` deriva a URL de migração da `DATABASE_URL`, trocando :6543 por :5432. Defina-a só se o banco de migração não for derivável do banco da função. Só é lida no build — a função nunca conecta por ela |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta do projeto | ignora RLS; é o que autoriza a API a ler e gravar nos dois buckets |
| `SUPABASE_URL` | `https://mnwkdtfuvbblmhtdpdsv.supabase.co` | base do REST do Storage |
| `UPLOAD_DRIVER` | `supabase` | disco em serverless é efêmero: o arquivo some na próxima instância fria |
| `UPLOAD_MAX_SIZE_MB` | `4` | o corpo de requisição na Vercel para em **4,5 MB**. Com 5, o usuário veria erro de plataforma em vez da mensagem da API |
| `CORS_ORIGINS` / `FRONTEND_URL` | `https://procert-app.vercel.app` | domínio do **site**, não o da API |
| `EXPIRACAO_CRON_ATIVA` | `false` | ver §4 |
| `CRON_SECRET` | segredo dedicado | ver §4 |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_SALT_ROUNDS`, `API_PREFIX`, `SUPABASE_BUCKET_*` | ver `.env.example` | |

`procert-app`: só `VITE_API_URL`, com a URL absoluta da API **incluindo `/api`**.
Ela vence o `frontend/.env.production` (verificado no bundle), que segue válido
para o deploy de mesma origem da Parte II. `/uploads` acompanha sozinho —
`lib/arquivos.ts` deriva a origem dessa mesma variável.

> Variável com prefixo `VITE_` não aceita visibilidade *secret* na Vercel, e a
> recusa é correta: tudo que começa com `VITE_` é embutido no bundle e fica
> visível para qualquer visitante. Pela CLI, use
> `--visibility config --no-sensitive`.

## 4. A expiração de certificados em serverless

`@nestjs/schedule` **não roda em função**: o timer é criado no boot e morre com a
instância, sem nunca chegar às 03:00. Por isso `EXPIRACAO_CRON_ATIVA=false` na
Vercel — deixá-la ligada não quebra nada, só mente no log.

Quem acorda a rotina é o **Vercel Cron**, declarado em `backend/vercel.json`,
chamando `GET /api/certificados/cron/expirar-vencidos` às 06:00 UTC (03:00 em
Brasília, o mesmo horário do job em processo). A Vercel manda
`Authorization: Bearer $CRON_SECRET` sozinha quando a variável existe.

O `expiracao.cron.ts` recusa agendador externo porque ele exigiria um token de
ADMIN guardado fora do sistema — credencial capaz de excluir cliente e cancelar
certificado. Essa objeção continua valendo, e o desenho responde a ela: o segredo
**não é sessão**, não vira usuário, não passa pelo `RolesGuard`, não aceita corpo
nem parâmetro, e abre **uma única porta** — um `updateMany` idempotente derivado
da data. Vazado, o estrago possível é disparar hoje o que ia rodar de madrugada.
Sem `CRON_SECRET` configurado a rota fica **fechada**, nunca aberta.

## 5. Banco e arquivos

**As migrations são aplicadas pelo próprio build de produção**, por
`prisma/migrar-no-deploy.js`, que o `vercel-build` chama entre o `prisma generate`
e o `nest build`. Ele só age com `VERCEL_ENV=production` (preview de PR
compartilha a `DATABASE_URL` do projeto, e sem essa guarda um PR aplicaria a
migration em produção antes da revisão), **derruba o build se a migration não
aplicar**, e religa o RLS depois — o `migrate deploy` não conhece RLS, e tabela
nova nasceria aberta ao PostgREST, pelo que está descrito mais abaixo nesta seção.

> **Isto substituiu um passo manual, e a troca tem data.** Até 26/08/2026 a
> migration era um comando que se rodava da própria máquina. Em 26/08 o login em
> produção começou a devolver **500** — `P2022, a coluna
> `funcionarios.ultimo_acesso_em` não existe` — porque o código dos PRs #16, #17
> e #20 tinha subido e o schema do banco não. Três PRs seguidos com migration, e
> o passo manual não foi dado em nenhum: nem o CI nem o deploy tinham como
> reprovar, já que o e2e roda contra um Postgres limpo onde `migrate deploy`
> aplica tudo.

A `DATABASE_URL` da função é o *transaction pooler* (:6543), e o Prisma Migrate
não a aceita — ele precisa de advisory lock, que o pgbouncer em modo transação
não mantém entre statements. O script resolve isso sozinho: `urlDeMigracao()`
troca a porta por :5432, o *session pooler*, e descarta `pgbouncer=true` e
`connection_limit`.

Essa conversão substituiu uma `MIGRATE_DATABASE_URL` obrigatória, que **nunca
chegou a ser criada** — e a omissão reprovou os quatro deploys de produção
entre 26/08/2026 e 28/08/2026, com a API servindo código de dois dias antes
enquanto o painel já trazia telas que dependiam dele. O que tornou a exigência
inviável na prática: na Vercel a `DATABASE_URL` é do tipo **Secret**, portanto
write-only — não sai no dashboard, no `vercel env pull` nem na API. Montar a
segunda URL à mão exigia ter a senha guardada fora do sistema, e quem não a
tivesse não tinha como cumprir o passo.

`MIGRATE_DATABASE_URL` continua sendo lida e **tem precedência**, para o caso de
o banco de migração não ser derivável do banco da função.

O **seed** continua sendo manual — ele cria o admin inicial, não é parte de
publicar código:

```powershell
cd backend
$env:DATABASE_URL="postgresql://postgres.mnwkdtfuvbblmhtdpdsv:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
npx prisma migrate deploy   # idempotente; só é preciso à mão fora de um deploy
npm run seed                # idempotente
```

A senha do banco **não é recuperável** depois de criada — só resetável em
Settings → Database. Resetar quebra as conexões existentes, então depois é
preciso atualizar `DATABASE_URL` na Vercel **e redeployar**.

Os buckets espelham a fronteira de `uploads.constantes.ts`: `procert-publico` com
leitura anônima (logo, papel de parede, fotos — coisas que entram em `<img src>`
antes de existir sessão) e `procert-privado` sem leitura anônima (PDF de
certificado e evidência de etapa, que só saem por rota autenticada). **Nenhuma
policy de RLS foi criada, e isso é intencional**: quem grava e lê é a API com a
`service_role`, que ignora RLS. Sem policy, o bucket privado não responde à chave
anônima — que é exatamente o desejado.

> **O mesmo raciocínio se inverte nas tabelas, e foi assim que elas ficaram
> abertas até 24/08/2026.** Em `storage.objects` o RLS já vem **ligado** de
> fábrica, então "nenhuma policy" significa fechado. Nas tabelas do schema
> `public` ele vem **desligado**, e aí "nenhuma policy" significa aberto: o
> PostgREST expõe o schema para os roles `anon` e `authenticated`, que o Supabase
> cria com `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` em tudo. Com a chave
> anônima — pública por construção — dava para ler `funcionarios` inteira,
> incluindo `senha_hash`, ler o CPF/CNPJ dos `clientes`, ler
> `tokens_redefinicao_senha` e apagar certificado, **sem passar pela API**. Toda a
> autorização de `garantirAcesso()` vive no service e não cobre essa porta.
>
> Corrigido habilitando RLS nas 18 tabelas, **sem criar policy alguma** — policy
> só devolveria acesso. A aplicação não sente: o Prisma conecta como `postgres`,
> dono das tabelas, e o dono ignora RLS. O advisor de segurança passou de 18
> `ERROR` a zero, restando 18 `INFO` de "RLS enabled, no policy", que aqui é o
> estado correto e não deve ser "resolvido".
>
> **Banco recriado do zero volta ao estado aberto**: `prisma migrate deploy` não
> conhece RLS. Depois de recriar, rode:
>
> ```sql
> do $$ declare t record; begin
>   for t in select tablename from pg_tables where schemaname = 'public' loop
>     execute format('alter table public.%I enable row level security', t.tablename);
>   end loop;
> end $$;
> ```

Se o login do admin devolver 401 com a senha que você espera, é o hash no banco,
não configuração: o `upsert` do seed usa `update: {}` e **nunca** corrige a senha
de um registro já existente. A saída é `npm run senha:admin`, com a nova senha em
`SEED_ADMIN_PASSWORD` (nunca em argumento — argv fica no histórico do shell).

## 6. Verificação depois de subir

```bash
API=https://procert-api-singlefutureadm-9995s-projects.vercel.app

# 1. Processo de pé E banco visível (são duas perguntas diferentes)
curl $API/api/health          # {"status":"ok","banco":"ok",...}

# 2. A porta continua fechada
curl -o /dev/null -w '%{http_code}\n' $API/api/clientes   # 401
curl -o /dev/null -w '%{http_code}\n' $API/api/docs       # 404 (Swagger fora do ar)

# 3. Login com senha errada: 401 com mensagem genérica, NUNCA 500.
#    500 aqui significa banco fora, não credencial errada.
curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@procertocp.com.br","senha":"errada"}'

# 4. Storage: pasta pública redireciona para o bucket, privada é negada
curl -o /dev/null -w '%{http_code} %{redirect_url}\n' $API/uploads/produtos/x.png   # 302 -> supabase
curl -o /dev/null -w '%{http_code}\n' $API/uploads/certificados/x.pdf               # 404
```

No navegador, **nesta ordem** — cada passo isola uma camada:

1. Home abre → o deploy do frontend está certo.
2. `/login` abre **com o tema aplicado** → o painel alcança a API (o tema vem de
   `GET /api/aparencia`). Tema padrão onde deveria haver logo = a chamada falhou,
   quase sempre `VITE_API_URL` ou `CORS_ORIGINS`.
3. Login entra → JWT e banco de ponta a ponta.
4. **F5 em `/dashboard`** → o fallback de SPA do `frontend/vercel.json` subiu.
5. Produto com foto → `/uploads` e o bucket acessíveis a partir do painel.

## 7. Armadilhas desta hospedagem

| Armadilha | Detalhe |
|---|---|
| **Preset de framework** | `"framework": null` no `backend/vercel.json` é obrigatório. Detectado como "nestjs", o builder roda um type-check próprio sobre **todo** `.ts` do diretório — ignorando `exclude` de tsconfig e `.vercelignore` — e reprova nos erros conhecidos de `prisma/migrate-legacy.ts` |
| **`api/index.js` é JavaScript** | a Vercel compila `api/` com esbuild, que não implementa `emitDecoratorMetadata`. Em TypeScript, o Nest sobe e quebra em "can't resolve dependencies" |
| **Projeto Supabase pausa** | no plano free, após ~7 dias sem tráfego. Volta pelo painel |
| **Sem backup automático** | o plano free do Supabase não faz backup. Exportar o banco é responsabilidade sua |
| **Plano Hobby** | os termos da Vercel reservam o Hobby para uso **não comercial**. Operação comercial pede Pro |
| **Cold start** | a primeira requisição depois de ociosidade paga o boot do Nest + conexão ao pooler (~600 ms medidos no `/health`) |

---

# Parte II — Hospedagem própria (Node + FTP)

> O caminho anterior, preservado porque continua correto para uma máquina com
> runtime Node e porque descreve o servidor onde o **sistema legado** ainda roda.
> Nada aqui vale para a produção da Parte I.

## 1. A decisão que vem antes de tudo: onde a API roda

O ProCert são **duas peças**, e só uma delas é estática:

| Peça | O que é | Onde pode ficar |
|---|---|---|
| `frontend/dist/` | HTML, CSS e JS. Arquivos parados. | Qualquer hospedagem com FTP. |
| `backend/` | NestJS. **Processo Node rodando.** | Só onde houver runtime Node. |

Hospedagem compartilhada de PHP — o tipo que rodava o sistema legado — quase
nunca tem Node. Se for esse o caso, subir só o `dist/` **não** entrega um
sistema funcionando: a home institucional abre (é estática), a tela de login
abre, e daí em diante todo clique chama `/api/...` e falha. Quem conversa com o
PostgreSQL é o backend, não o navegador.

Dois cenários, e cada um muda uma linha de configuração:

### A. Mesmo domínio (API atrás de proxy em `/api`)

O servidor web encaminha `/api` e `/uploads` para o Node na porta 3000.

```
frontend/.env.production   VITE_API_URL=/api        ← já é o valor commitado
backend/.env               CORS_ORIGINS=https://procertocp.com.br
```

É o arranjo mais simples: sem CORS na prática, sem segunda origem para manter.

### B. Hosts diferentes (frontend no FTP, API em outro lugar)

```
frontend/.env.production   VITE_API_URL=https://api.procertocp.com.br/api
backend/.env               CORS_ORIGINS=https://procertocp.com.br,https://www.procertocp.com.br
```

Duas armadilhas aqui, as duas já resolvidas no código:

- **`CORS_ORIGINS` recebe o domínio do SITE, não o da API.** Quem é barrado é o
  navegador do visitante, e ele se identifica pela origem da página aberta.
- **Os arquivos de `/uploads` passam a sair do host da API.** `urlArquivo` em
  `frontend/src/lib/arquivos.ts` deriva a origem do próprio `VITE_API_URL` —
  não existe uma segunda variável para esquecer de atualizar.

---

## 2. Frontend

```bash
cd frontend
# confira VITE_API_URL em .env.production antes de buildar — o valor é
# embutido no bundle, trocar depois exige buildar de novo
npm ci
npm run build
```

Sobe o **conteúdo** de `dist/` para a raiz do site (`public_html`, `www`,
`httpdocs`). Não a pasta `dist` em si — `index.html` precisa ficar na raiz.

**Confira que o `.htaccess` subiu.** Ele está em `frontend/public/.htaccess` e o
Vite o copia para `dist/` a cada build, mas cliente FTP costuma esconder
arquivo que começa com ponto. No FileZilla: *Servidor → Forçar exibição de
arquivos ocultos*. Sem ele, navegar pelo painel funciona e **dar F5 em
`/dashboard` devolve 404** — o Apache procura uma pasta que não existe.

O `.htaccess` também cuida de cache (assets com hash em `immutable`,
`index.html` sem cache — é o que evita o cliente continuar vendo o build
anterior depois do deploy), gzip e três cabeçalhos de segurança.

---

## 3. Backend

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy    # idempotente; hoje não há nada pendente
npm run build
NODE_ENV=production node dist/main.js
```

Use um supervisor de verdade (PM2, systemd, o painel da hospedagem) para o
processo sobreviver a reinício.

### `.env` de produção

Comece do `.env.example` e ajuste. O que **não pode** ficar como está:

| Variável | Por quê |
|---|---|
| `NODE_ENV=production` | Liga as travas descritas abaixo. |
| `JWT_SECRET` | **A aplicação recusa subir** com o valor de exemplo ou com menos de 32 caracteres. Gere: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DATABASE_URL` | Senha com `@` precisa vir como `%40`. Sem isso o Prisma corta a string ali e tenta resolver o resto como host. |
| `CORS_ORIGINS` | Domínio do site (§1). |
| `MAIL_USER` / `MAIL_PASS` | Vazios = e-mail só vai para o log. Recuperação de senha e avisos não saem. |
| `EXPIRACAO_CRON_ATIVA` | Deixe `true` em **exatamente uma** instância. |

Com `NODE_ENV=production`, o Swagger (`/api/docs`) sai do ar — ele é um mapa
completo da API servido sem autenticação. Para ligar conscientemente:
`SWAGGER_ATIVO=true`.

### Uploads

`UPLOAD_DIR` é uma pasta **em disco**, no servidor onde a API roda. O banco
guarda só o caminho. Consequências:

- A pasta precisa persistir entre deploys. Em plataforma de contêiner com disco
  efêmero (Render, Railway no plano free, Heroku), todo restart apaga PDF de
  certificado, evidência de etapa e foto de produto. Ali é disco persistente ou
  storage externo — não é opcional.
- Certificado sem PDF é regerado no primeiro download. **Evidência de etapa e
  foto, não** — essas somem de vez.

---

## 4. Depois de subir: a ordem para verificar

```bash
# 1. A API está de pé E enxerga o banco (são duas perguntas diferentes)
curl https://api.procertocp.com.br/api/health
# {"status":"ok","banco":"ok","latenciaBancoMs":33,...}
# 503 aqui = processo vivo, banco inacessível: confira DATABASE_URL e firewall

# 2. Leitura pública do banco
curl https://api.procertocp.com.br/api/estados     # 27 UFs

# 3. A porta continua fechada
curl -o /dev/null -w '%{http_code}\n' https://api.procertocp.com.br/api/produtos   # 401
curl -o /dev/null -w '%{http_code}\n' https://api.procertocp.com.br/api/docs       # 404
```

No navegador, e **nesta ordem** — cada passo isola uma camada diferente:

1. Home institucional abre → o FTP e o `.htaccess` estão certos.
2. `/login` abre **com o tema aplicado** → o frontend alcança a API (o tema vem
   de `GET /api/aparencia`). Tema padrão quando deveria haver logo = a chamada
   falhou.
3. Login entra → JWT e banco de ponta a ponta.
4. **F5 em `/dashboard`** → o `.htaccess` subiu mesmo.
5. Abrir um produto com foto → `/uploads` acessível a partir do frontend.

---

## 5. Antes de abrir para os usuários

- [ ] **Trocar a senha do admin.** O seed cria `admin@procertocp.com.br` com uma
      senha documentada neste repositório.
- [ ] **Trocar a senha do banco**, se ela já circulou fora do servidor.
- [ ] `JWT_SECRET` diferente do de desenvolvimento — mesmo segredo nos dois
      lugares significa que um token emitido em dev abre a produção.
- [ ] HTTPS no site e na API. O JWT viaja no cabeçalho; em HTTP ele viaja aberto.
- [ ] SMTP configurado, ou "esqueci minha senha" não funciona para ninguém.
- [ ] Backup do banco agendado. A Locaweb oferece; confirme que está ligado.
- [ ] Apagar a mensagem de teste em Contato (`mensagens_contato`), se ainda
      estiver lá.

---

## 6. O servidor de hoje — levantamento de 21/08/2026

Feito por FTP e pelo painel da Locaweb. **Nada foi alterado no servidor**: o
sistema PHP legado continua no ar exatamente como estava.

### Acesso

| | |
|---|---|
| Host FTP | `ftp.procertocp1.hospedagemdesites.ws` → 179.188.54.241 |
| Porta | 21 |
| Usuário | `procertocp1` |
| Raiz da conta | `/home/procertocp1/` |
| Raiz do site | `/public_html` |
| FTPS | **não suportado** (o servidor recusa `AUTH TLS`) |

**`ftp.procertocp.com.br` não funciona** — esse nome não existe em DNS nenhum.
O domínio está atrás do Cloudflare, que só faz proxy de HTTP/HTTPS, e o registro
`ftp` nunca foi criado. Use sempre a **URL Alternativa** acima; é o que o painel
mostra em *Arquivos e FTP*.

### O que está publicado

O sistema PHP legado inteiro, em produção: MVC artesanal em `app/` (13
controllers, 10 models, views), `core/`, `config/config.php`, `assets/`
(`adminlte.css`, `custom.css` — a origem do "liquid glass"), `vendors/phpmailer/`
e `uploads/` com **fotos reais** de administrador, cliente, funcionário e
produto. Total: 134 arquivos, 37,8 MB. Última modificação em 07/02/2026.

Sobras já presentes: `index_Old.html`, `mapa-site.txt`, `README.md` e `.vscode/`.

### O que o plano de hospedagem oferece

Painel → *Configurações*: Publicar via GIT, **Configurar PHP**, Tarefas via HTTP,
Crontabs, Teste de performance, SSH. Painel → *Aplicativos*: instalador de
WordPress, nada instalado.

**Não há runtime Node em lugar nenhum do painel.** É hospedagem PHP. O backend
NestJS não roda aqui — precisa de upgrade de plano, ou de um host separado
(Render, Railway, VPS). É o que falta para o cutover, e é por isso que a subida
está segurada.

### Cloudflare na frente

O domínio resolve para IPs do Cloudflare (104.21.50.129 / 172.67.163.59). Duas
consequências no dia do deploy:

- **Limpar o cache do Cloudflare depois de subir.** Sem isso os visitantes
  continuam recebendo o site antigo, e a leitura errada seria "o upload falhou".
- **Auto Minify e Rocket Loader precisam estar desligados.** Eles reescrevem o
  JS na borda e costumam quebrar SPA React.

### Backup

`procert-backups/backup-servidor-procertocp-2026-08-21_0108.zip`, guardado fora do
repositório, na máquina de quem fez o levantamento
— 167 arquivos, 38,1 MB, íntegro (`testzip` sem erros, arquivos-chave conferidos
um a um). Cobre `/public_html`, `/uploads`, `/home` e os arquivos soltos da raiz
da conta. O symlink `/logs` (aponta para fora da conta) foi ignorado de
propósito.

**Cobre arquivos, não o banco MySQL do legado.** Se ainda houver dado só lá,
exporte antes de qualquer coisa.

### Estratégia acordada para a subida

1. Inventário e backup — **feitos**.
2. Mover a estrutura antiga para `/home/procertocp1/_legado_2026-08-21/`, **fora
   do `public_html`**. Fora, e não dentro, porque o que está dentro continua
   sendo servido pela web — foi exatamente esse o problema do `.vscode/`
   (veja §7). Renomear em vez de apagar deixa a volta a um comando de distância.
3. Subir o conteúdo de `frontend/dist/` para `/public_html`, com atenção ao
   `.htaccess` (arquivo oculto; cliente FTP pula por padrão).
4. Purgar o cache do Cloudflare.
5. Testar na ordem da §4.

---

## 7. Exposição encontrada em 21/08/2026 — senha de FTP pública

`https://procertocp.com.br/.vscode/ftp-simple.json` responde **HTTP 200** para
qualquer pessoa na internet e devolve, em texto claro, o host, a porta, o
usuário e a **senha do FTP**. É o arquivo de configuração da extensão
`ftp-simple` do VS Code, commitado dentro do `public_html` junto com o resto.

Também estão legíveis publicamente `index_Old.html`, `README.md` e
`mapa-site.txt` — sem senha, mas expõem estrutura sem nenhum ganho.

O que fazer, nesta ordem:

1. **Trocar a senha do FTP** no painel (*Arquivos e FTP* → *Alterar senha*).
   Enquanto ela não mudar, a senha exposta continua válida. Isso resolve o
   problema imediato mesmo antes de o arquivo sair do ar.
2. **Tirar o `.vscode/` do `public_html`** — a mudança do passo 2 da estratégia
   acima já faz isso, junto com o resto do legado.
3. Nunca deixar `.vscode/`, `.git/` ou `.env` sob a raiz do site. Nenhum deles
   deveria ser alcançável por HTTP.

---

## 8. O que ainda não existe

Nenhum destes impede subir — mas é melhor saber antes:

- **Sem CI/CD nesta hospedagem.** Aqui o deploy é manual: buildar, subir,
  reiniciar. Na Parte I o push publica sozinho.
- **Sem logs estruturados nem métricas.** `/api/health` é o único sinal.
- **Sessão sem revogação.** Token vazado vale até expirar (8h). A revalidação no
  banco cobre conta desativada, não token roubado.
- **Sem testes no frontend.** O backend tem 275 unitários e 75 e2e; o frontend,
  zero. Mudança de UI só é validada olhando.
