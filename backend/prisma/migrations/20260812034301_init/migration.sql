-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'FUNCIONARIO', 'CLIENTE');

-- CreateEnum
CREATE TYPE "StatusRegistro" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "StatusCertificacao" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO', 'ESTORNADO');

-- CreateTable
CREATE TABLE "estados" (
    "id" SERIAL NOT NULL,
    "sigla" CHAR(2) NOT NULL,
    "nome" VARCHAR(60) NOT NULL,

    CONSTRAINT "estados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "tipo_pessoa" "TipoPessoa" NOT NULL DEFAULT 'JURIDICA',
    "cpf" VARCHAR(14),
    "cnpj" VARCHAR(18),
    "data_nascimento" DATE,
    "telefone" VARCHAR(20),
    "cep" VARCHAR(9),
    "endereco" VARCHAR(255),
    "bairro" VARCHAR(120),
    "cidade" VARCHAR(120),
    "estado_id" INTEGER,
    "foto_url" VARCHAR(255),
    "status" "StatusRegistro" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funcionarios" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'FUNCIONARIO',
    "tipo_pessoa" "TipoPessoa" NOT NULL DEFAULT 'FISICA',
    "cpf" VARCHAR(14),
    "cnpj" VARCHAR(18),
    "data_nascimento" DATE,
    "telefone" VARCHAR(20),
    "cep" VARCHAR(9),
    "endereco" VARCHAR(255),
    "bairro" VARCHAR(120),
    "cidade" VARCHAR(120),
    "estado_id" INTEGER,
    "foto_url" VARCHAR(255),
    "status" "StatusRegistro" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funcionarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "descricao" TEXT,
    "preco" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "foto_url" VARCHAR(255),
    "status" "StatusRegistro" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas_certificacao" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etapas_certificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificacoes_produto" (
    "id" SERIAL NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "etapa_id" INTEGER NOT NULL,
    "status" "StatusCertificacao" NOT NULL DEFAULT 'PENDENTE',
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificacoes_produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificacoes_historico" (
    "id" SERIAL NOT NULL,
    "certificacao_id" INTEGER NOT NULL,
    "status_anterior" "StatusCertificacao",
    "status_novo" "StatusCertificacao" NOT NULL,
    "observacao" TEXT,
    "alterado_por_id" INTEGER,
    "alterado_por_nome" VARCHAR(150) NOT NULL,
    "alterado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificacoes_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" SERIAL NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE',
    "data_pagamento" TIMESTAMP(3),
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_redefinicao_senha" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_redefinicao_senha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_contato" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "telefone" VARCHAR(20),
    "assunto" VARCHAR(200) NOT NULL,
    "mensagem" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_contato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estados_sigla_key" ON "estados"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_email_key" ON "clientes"("email");

-- CreateIndex
CREATE INDEX "clientes_status_idx" ON "clientes"("status");

-- CreateIndex
CREATE INDEX "clientes_nome_idx" ON "clientes"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "funcionarios_email_key" ON "funcionarios"("email");

-- CreateIndex
CREATE INDEX "funcionarios_role_status_idx" ON "funcionarios"("role", "status");

-- CreateIndex
CREATE INDEX "produtos_cliente_id_idx" ON "produtos"("cliente_id");

-- CreateIndex
CREATE INDEX "produtos_status_idx" ON "produtos"("status");

-- CreateIndex
CREATE UNIQUE INDEX "etapas_certificacao_nome_key" ON "etapas_certificacao"("nome");

-- CreateIndex
CREATE INDEX "etapas_certificacao_ordem_idx" ON "etapas_certificacao"("ordem");

-- CreateIndex
CREATE INDEX "certificacoes_produto_status_idx" ON "certificacoes_produto"("status");

-- CreateIndex
CREATE UNIQUE INDEX "certificacoes_produto_produto_id_etapa_id_key" ON "certificacoes_produto"("produto_id", "etapa_id");

-- CreateIndex
CREATE INDEX "certificacoes_historico_certificacao_id_alterado_em_idx" ON "certificacoes_historico"("certificacao_id", "alterado_em");

-- CreateIndex
CREATE INDEX "pagamentos_produto_id_criado_em_idx" ON "pagamentos"("produto_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_redefinicao_senha_token_hash_key" ON "tokens_redefinicao_senha"("token_hash");

-- CreateIndex
CREATE INDEX "tokens_redefinicao_senha_email_idx" ON "tokens_redefinicao_senha"("email");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificacoes_produto" ADD CONSTRAINT "certificacoes_produto_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificacoes_produto" ADD CONSTRAINT "certificacoes_produto_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapas_certificacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificacoes_historico" ADD CONSTRAINT "certificacoes_historico_certificacao_id_fkey" FOREIGN KEY ("certificacao_id") REFERENCES "certificacoes_produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificacoes_historico" ADD CONSTRAINT "certificacoes_historico_alterado_por_id_fkey" FOREIGN KEY ("alterado_por_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
