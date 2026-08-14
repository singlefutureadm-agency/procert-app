/*
  Primeira metade da transição para trilhas por categoria.

  Esta migration é ADITIVA de propósito: cria as tabelas novas, adiciona as
  colunas de `produtos` como NULLABLE e derruba a FK de `certificacoes_produto`
  para o catálogo global. Isso deixa o banco em um estado intermediário onde o
  script `npm run migrate:categorias` pode transpor os dados.

  A migration seguinte fecha a transição: NOT NULL nas colunas e FK de
  `certificacoes_produto.etapa_id` para `modelos_etapa`.
*/
-- CreateEnum
CREATE TYPE "TipoEtapa" AS ENUM ('DOCUMENTAL', 'ENSAIO', 'AUDITORIA_FABRICA', 'ANALISE_CRITICA', 'DECISAO', 'OUTRO');

-- DropForeignKey
ALTER TABLE "certificacoes_produto" DROP CONSTRAINT "certificacoes_produto_etapa_id_fkey";

-- AlterTable (nullable nesta etapa; o script de dados preenche e a migration
-- seguinte aplica o NOT NULL)
ALTER TABLE "produtos" ADD COLUMN     "categoria_id" INTEGER,
ADD COLUMN     "modelo_trilha_id" INTEGER;

-- CreateTable
CREATE TABLE "categorias_produto" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "norma_referencia" VARCHAR(200),
    "status" "StatusRegistro" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_trilha" (
    "id" SERIAL NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "vigente_de" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_ate" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelos_trilha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_etapa" (
    "id" SERIAL NOT NULL,
    "modelo_trilha_id" INTEGER NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL,
    "tipo" "TipoEtapa" NOT NULL DEFAULT 'OUTRO',
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "prazo_sla_dias" INTEGER,
    "exige_documento" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "modelos_etapa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_produto_nome_key" ON "categorias_produto"("nome");

-- CreateIndex
CREATE INDEX "categorias_produto_status_idx" ON "categorias_produto"("status");

-- CreateIndex
CREATE INDEX "modelos_trilha_categoria_id_ativo_idx" ON "modelos_trilha"("categoria_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "modelos_trilha_categoria_id_versao_key" ON "modelos_trilha"("categoria_id", "versao");

-- CreateIndex
CREATE INDEX "modelos_etapa_modelo_trilha_id_ordem_idx" ON "modelos_etapa"("modelo_trilha_id", "ordem");

-- CreateIndex
CREATE INDEX "produtos_categoria_id_idx" ON "produtos"("categoria_id");

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_modelo_trilha_id_fkey" FOREIGN KEY ("modelo_trilha_id") REFERENCES "modelos_trilha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelos_trilha" ADD CONSTRAINT "modelos_trilha_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelos_etapa" ADD CONSTRAINT "modelos_etapa_modelo_trilha_id_fkey" FOREIGN KEY ("modelo_trilha_id") REFERENCES "modelos_trilha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A FK de certificacoes_produto.etapa_id -> modelos_etapa fica para a próxima
-- migration: os ids ainda apontam para etapas_certificacao até o script rodar.
