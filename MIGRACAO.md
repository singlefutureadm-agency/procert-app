# Guia de Migração — PHP/MySQL → NestJS + React + PostgreSQL

Este documento é o mapa da migração: o que virou o quê, o que mudou de
comportamento, quais bugs do legado foram corrigidos e como executar o cutover.

> O sistema legado está documentado em `public_html/DOCUMENTACAO.md`.
> As referências entre colchetes (ex.: **[S1]**, **[B4]**) apontam para os
> achados numerados na seção 18 daquele documento.

> **† O sistema evoluiu além da paridade com o legado.** O catálogo global de
> etapas foi substituído por **trilhas versionadas por categoria de produto**, e
> foram acrescentados não conformidades, certificados formais e evidências por
> etapa. Este guia continua descrevendo o *de/para da migração* — para o estado
> atual do sistema, veja **[DOCUMENTACAO.md](./DOCUMENTACAO.md)**. As linhas
> marcadas com † mudaram depois do cutover.

---

## 1. De/para — arquitetura

| Legado (PHP) | Nova stack |
|--------------|-----------|
| `index.php` + `.htaccess` (front controller) | `backend/src/main.ts` (Nest) + `frontend` SPA |
| `core/Core.php` (roteador por convenção de URL) | Decorators `@Controller` / `@Get` / `@Post` do Nest |
| `core/Controller.php` (`carregarViews`) | Controllers retornam JSON; a renderização é do React |
| `core/Model.php` (PDO singleton) | `PrismaService` (ciclo de vida do Nest) |
| `config/config.php` (constantes versionadas) | `@nestjs/config` + `.env` fora do versionamento **[S3]** |
| `spl_autoload_register` | Módulos ES + imports do TypeScript |
| Views PHP + AdminLTE + jQuery embutido | Componentes React + CSS próprio (tema preservado) |
| `$_SESSION` | JWT no `Authorization: Bearer` + revalidação no banco |
| `filter_input(...)` espalhado por controller | DTOs com `class-validator` + `ValidationPipe` global |
| Nenhum controle de acesso | `JwtAuthGuard` + `RolesGuard` globais **[S1]** |

---

## 2. De/para — módulos

| Arquivo PHP | Módulo NestJS | Página React |
|-------------|---------------|--------------|
| `AuthController` + `LoginController` | `modules/auth` | `pages/LoginPage` |
| `ResetController` + `models/Reset` | `modules/auth` (esqueci/redefinir) | `pages/EsqueciSenhaPage`, `pages/RedefinirSenhaPage` |
| `DashboardController` + métricas em `Controller.php` | `modules/dashboard` | `features/dashboard/DashboardPage` |
| `ClientesController` + `models/Cliente` | `modules/clientes` | `features/clientes/*` |
| `FuncionarioController` + `AdministradorController` | `modules/funcionarios` (**unificado**) | `features/funcionarios/*` |
| `ProdutoController` + `models/Produto` | `modules/produtos` | `features/produtos/*` |
| `EtapaController` + `models/Etapa` | `modules/etapas` → **substituído** por `modules/categorias-produto` + `modules/modelos-trilha` | `features/categorias-produto/*` |
| `CertificacaoController` + `ServicosController` | `modules/certificacoes` | `features/certificacoes/*` |
| `models/Estado` | `modules/estados` | consumido nos formulários |
| `models/Contato` (órfão no legado) | `modules/contato` (agora funcional) | — |
| `HomeController` + `views/home.php` | — | site institucional (fora deste escopo) |
| `vendors/phpmailer` (não utilizado) | `modules/mail` com Nodemailer **em uso** |
| `views/template/*`, `index_Old.html`, `app/home.php` | descartados (código morto) |

### Módulos unificados
`FuncionarioController` e `AdministradorController` eram ~90% idênticos, operando
sobre a mesma `tbl_funcionario` e diferindo apenas no `id_tipo_usuario` **[Q2]**.
Viraram um módulo só, parametrizado pelo enum `Role`.

---

## 3. De/para — banco de dados

| MySQL (legado) | PostgreSQL (novo) | Observação |
|----------------|-------------------|-----------|
| `tbl_estado` | `estados` | |
| `tbl_cliente` | `clientes` | `senha_cliente` → `senha_hash` (bcrypt) |
| `tbl_funcionario` | `funcionarios` | `id_tipo_usuario` → enum `Role` |
| `tbl_tipo_usuario` | *(removida)* | virou o enum `Role` |
| `tbl_produto` | `produtos` | `preco` como `DECIMAL(12,2)` |
| `tbl_etapa_certificacao` | `etapas_certificacao` | `status_etapa` + `ativo_certificacao` → **um único** `ativo` **[B8]** |
| `tbl_certificacao_produto` | `certificacoes_produto` | UNIQUE (produto, etapa) |
| `tbl_certificacao_historico` | `certificacoes_historico` | `alterado_por` texto livre → FK + nome preservado |
| `tbl_pagamento` | `pagamentos` | agora com CRUD possível **[Q9]** |
| `tbl_reset_senha` | `tokens_redefinicao_senha` | guarda o **hash** do token, não o token |
| `tbl_contato` | `mensagens_contato` | + campo `lida` |

Outras mudanças estruturais:
* Todos os status textuais (`'Ativo'`/`'Inativo'`) viraram **enums**.
* Chaves estrangeiras reais, com `ON DELETE` explícito por relação.
* `criadoEm` / `atualizadoEm` em todas as tabelas.
* Índices em `status`, `nome`, `ordem` e nos pares mais consultados.

---

## 4. De/para — rotas

| Legado | Novo (API) | Método |
|--------|-----------|--------|
| `POST /auth/login` | `/api/auth/login` | POST |
| `GET /auth/sair` | *(descartar o token no cliente)* | — |
| `GET /dashboard` | `/api/dashboard/metricas` | GET |
| `GET /clientes/listar` · `/lixeira` | `/api/clientes?status=ATIVO\|INATIVO` | GET |
| `POST /clientes/adicionar` | `/api/clientes` | POST |
| `POST /clientes/editar/{id}` | `/api/clientes/{id}` | PATCH |
| `POST /clientes/desativar/{id}` · `/ativar/{id}` | `/api/clientes/{id}/status` | PATCH |
| `POST /clientes/deletar/{id}` | `/api/clientes/{id}` | DELETE (**só ADMIN**) |
| `GET /funcionario/*` e `/administrador/*` | `/api/funcionarios?role=ADMIN\|FUNCIONARIO` | GET |
| `GET /produto/listar` · `/lixeira` | `/api/produtos?status=` | GET |
| `GET /produto/listarProdutoCliente/{id}` | `/api/produtos` (escopo pelo token) **[S4]** | GET |
| `GET /etapa/listar` | `/api/categorias-produto/{id}/modelos-trilha` † | GET |
| `POST /etapa/reordenar` | `/api/modelos-trilha/{id}/etapas/ordem` † | PATCH |
| `GET /etapa/desativar/{id}` | — † (a versão em uso é imutável; publique uma nova) | — |
| `GET /servicos/listar` | `/api/certificacoes` | GET |
| `GET /servicos/listarCertificacaoClienteId/{id}` | `/api/certificacoes` (escopo pelo token) | GET |
| `GET /certificacao/verMais/{cli}/{prod}` · `/editar/...` | `/api/certificacoes/produto/{produtoId}` | GET |
| `POST /certificacao/salvar` | `/api/certificacoes/produto/{produtoId}` | PUT |
| `GET /certificacao/desativar/{cli}/{prod}` | `/api/certificacoes/produto/{id}/reiniciar` | POST |
| `GET /reset/esqueceuSenha` | `/api/auth/esqueci-senha` | POST |
| `GET /resetsenha/resetarSenha` (**rota inexistente [B3]**) | `/api/auth/redefinir-senha` | POST |

Note que o par `{id_cliente}/{id_produto}` das rotas de certificação virou
apenas `{produtoId}`: o cliente é derivado do produto, e o acesso é validado
contra o token — não contra o que vem na URL.

---

## 5. Bugs e falhas do legado corrigidos nesta migração

### Segurança
| Ref | Problema no legado | Como ficou |
|-----|--------------------|-----------|
| **S1** | `ativar`/`desativar`/`deletar` sem nenhuma verificação de sessão | `JwtAuthGuard` + `RolesGuard` **globais**; exclusão definitiva restrita a `ADMIN` |
| **S2** | Senhas de clientes em texto puro | Bcrypt em todo cadastro, com política mínima de senha |
| **S3** | Credenciais versionadas (`config.php`, `ftp-simple.json`) | `.env` + `.env.example`, `.gitignore` cobrindo segredos |
| **S4** | IDOR: `id_cliente` vinha pela URL sem validação | Escopo do cliente imposto no servidor a partir do token |
| **S5** | Sem CSRF | JWT em header (não em cookie) elimina a classe do ataque |
| **S6** | Upload sem validação de tipo/tamanho | Whitelist de MIME, limite configurável, nome aleatório, proteção contra path traversal |
| **S7** | Sem proteção contra força bruta | `ThrottlerGuard` global + limites estreitos no login e no reset |
| **S8** | XSS armazenado em `etapa/listar.php` | React escapa por padrão |
| **S9** | Redirect via `HTTP_REFERER` | Navegação controlada pelo React Router |
| **S10** | Erro de PDO imprimia host e usuário do banco | `AllExceptionsFilter` com log interno e resposta genérica |
| **S11** | Scripts legados acessíveis em `vendors/assets/php/` | Removidos |

### Funcionais
| Ref | Problema no legado | Como ficou |
|-----|--------------------|-----------|
| **B1** | Funcionários/admins **não conseguiam logar** (hash gravado, comparação com `===`) | `bcrypt.compare()`; hashes `$2y$` do PHP continuam válidos |
| **B2** | Formulário de editar funcionário nunca renderizava | Rota `PATCH` limpa, sem código inalcançável |
| **B3** | Link de redefinição apontava para rota inexistente | Link montado a partir de `FRONTEND_URL` e rota real |
| **B4** | Card "Certificações Aprovadas" sempre 0 | Métrica recalculada e tipada de ponta a ponta |
| **B5** | `id_etapa = 4` fixo como etapa final | Produto é "concluído" quando **todas** as etapas estão aprovadas |
| **B6** | Layout do funcionário com branding e links de outro projeto | Layout único, menu derivado do papel |
| **B7** | Link de perfil do cliente com rota errada | Rotas centralizadas em `router.tsx` |
| **B8** | Duas colunas de "ativo" concorrentes na etapa | Campo único `ativo` |
| **B9** | "Desativar etapa" fazia DELETE físico | Soft delete; exclusão só se a etapa nunca foi usada |
| **B10** | Usuário deslogado via página em branco | `RotaProtegida` redireciona ao login |
| **B11** | 404 respondia HTTP 200 | Status HTTP corretos em toda a API |
| **B12** | URL para método privado causava erro fatal | Só handlers decorados são roteáveis |
| **B13** | Senha do cliente sanitizada com filtro numérico | Validação por schema, sem mutilar o valor |
| **B14** | `FILTER_SANITIZE_STRING` (deprecado) | `class-validator` |
| **B15** | Mapa de status com chaves duplicadas e match por substring | Enum validado no DTO |
| **B17** | Form de contato apontava para arquivo inexistente | `POST /api/contato` funcional, com persistência e e-mail |

### Qualidade
| Ref | Problema no legado | Como ficou |
|-----|--------------------|-----------|
| **Q1** | Bloco de seleção de layout repetido 30+ vezes | Um `LayoutPainel` + `RotaProtegida` |
| **Q2** | Funcionário e Administrador duplicados | Módulo único parametrizado por `Role` |
| **Q3** | JS de ativar/desativar copiado em 8 views | `ModalConfirmacao` + hooks do TanStack Query |
| **Q4** | URLs absolutas hardcoded | `BASE_URL`/`VITE_API_URL` por ambiente |
| **Q5** | 4 queries de métricas em toda requisição | Somente no endpoint do dashboard |
| **Q6** | Sem `.gitignore`, sem dump, sem gerenciador de pacotes | `.gitignore`, migrations Prisma, seed, npm |
| **Q8** | Gráficos com dados de demonstração | Removidos; painel mostra dados reais |

---

## 6. Comportamentos preservados de propósito

A migração não é uma reescrita do negócio. Continuam iguais:

1. **Abertura automática da certificação** ao cadastrar um produto — uma linha
   por etapa prevista, com status `PENDENTE` (agora dentro de uma transação; a
   fonte das etapas passou a ser a trilha da categoria †).
2. **Ordenação das etapas por drag-and-drop**, com persistência transacional.
3. **Soft delete** ("lixeira") para clientes, funcionários e produtos.
4. **Histórico imutável** de cada mudança de status.
5. **Três perfis** (Administrador, Funcionário, Cliente) com o mesmo alcance.
6. **Identidade visual "liquid glass"**, agora como design tokens em CSS.
7. **Senha só é alterada quando preenchida** na edição de cadastro.

---

## 7. Plano de cutover

### Fase 1 — Preparação (sem impacto em produção)
1. Subir o PostgreSQL e rodar `prisma migrate deploy` + `npm run seed`.
2. Configurar o `.env` do backend, incluindo as variáveis `LEGACY_MYSQL_*`.
3. Rodar a **simulação** do ETL e conferir os avisos:
   ```bash
   cd backend
   npm run migrate:legacy -- --dry-run
   ```
4. Rodar o ETL de verdade em um banco de homologação e validar os totais.

### Fase 2 — Validação
5. Conferir, no Prisma Studio ou no Adminer, os totais por tabela contra o MySQL.
6. Testar os fluxos críticos: login dos três perfis, cadastro de produto com
   abertura da certificação, avanço de etapa com histórico, reordenação de etapas.
7. Copiar a pasta `public_html/uploads/` para `backend/uploads/`, preservando os
   subdiretórios (`admin/`, `cliente/`, `funcionario/`, `produto/`). O ETL grava
   os caminhos como `/uploads/<pasta>/<arquivo>`.

### Fase 3 — Virada
8. Colocar o sistema legado em modo somente leitura (ou janela de indisponibilidade).
9. Rodar o ETL definitivo contra o banco de produção novo.
10. Publicar o backend e o frontend; apontar o DNS/proxy para a nova aplicação.
11. Manter o PHP acessível por uma URL interna durante ~2 semanas, como contingência.

### Fase 4 — Pós-virada
12. **Forçar redefinição de senha para todos os usuários** — as senhas antigas de
    clientes trafegaram em texto puro no banco legado e devem ser consideradas
    comprometidas.
13. **Rotacionar** as credenciais expostas no repositório antigo: MySQL, SMTP e FTP.
14. Arquivar o repositório legado como referência histórica.

---

## 8. O que ficou fora deste escopo

Itens que não foram migrados e permanecem como decisão do time:

| Item | Situação |
|------|----------|
| **Site institucional público** (`views/home.php`) | Não migrado. A API já expõe `POST /api/contato` para o formulário; a landing page pode continuar estática ou virar uma rota pública do React. |
| **Módulo de pagamentos** | O modelo `Pagamento` existe e é lido, mas não há CRUD — igual ao legado **[Q9]**. Precisa de definição de negócio. |
| **PDFs do sistema de qualidade** (`assets/img/*.pdf`) | Continuam sendo arquivos estáticos; podem ser servidos pelo Nginx do frontend. |
| **Relatórios/exportação** | Não existiam no legado e não foram criados. |
| **Testes automatizados** | A estrutura (Jest) está configurada, mas não há suíte escrita. Recomendo começar pelos serviços de `auth` e `certificacoes`. |

---

## 9. Comandos essenciais

```bash
# Banco
docker compose up -d

# Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init   # cria o schema
npm run seed                          # UFs, etapas e admin inicial
npm run start:dev                     # http://localhost:3000/api

# ETL do legado (opcional)
npm run migrate:legacy -- --dry-run   # simulação
npm run migrate:legacy                # aplica

# Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev                           # http://localhost:5173
```
