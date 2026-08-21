# Deploy

Guia de subida do ProCert. O banco de produção **já está migrado e populado**
(PostgreSQL 15.6 na Locaweb); o que falta é publicar a aplicação.

---

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

`C:\Users\Miguel\Documents\procert-backups\backup-servidor-procertocp-2026-08-21_0108.zip`
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

- **Sem CI/CD.** Deploy é manual: buildar, subir, reiniciar.
- **Sem logs estruturados nem métricas.** `/api/health` é o único sinal.
- **Sessão sem revogação.** Token vazado vale até expirar (8h). A revalidação no
  banco cobre conta desativada, não token roubado.
- **Sem testes no frontend.** O backend tem 152 unitários e 59 e2e; o frontend,
  zero. Mudança de UI só é validada olhando.
