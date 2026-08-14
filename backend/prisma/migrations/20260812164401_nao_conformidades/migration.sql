-- CreateEnum
CREATE TYPE "CriticidadeNaoConformidade" AS ENUM ('MENOR', 'MAIOR');

-- CreateEnum
CREATE TYPE "StatusNaoConformidade" AS ENUM ('ABERTA', 'EM_TRATATIVA', 'RESOLVIDA', 'REPROVADA');

-- CreateTable
CREATE TABLE "nao_conformidades" (
    "id" SERIAL NOT NULL,
    "certificacao_id" INTEGER NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricao" TEXT NOT NULL,
    "criticidade" "CriticidadeNaoConformidade" NOT NULL,
    "status" "StatusNaoConformidade" NOT NULL DEFAULT 'ABERTA',
    "prazo_resposta" TIMESTAMP(3),
    "resposta_cliente" TEXT,
    "respondido_em" TIMESTAMP(3),
    "parecer" TEXT,
    "aberto_por_id" INTEGER,
    "aberto_por_nome" VARCHAR(150) NOT NULL,
    "resolvido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nao_conformidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nao_conformidades_codigo_key" ON "nao_conformidades"("codigo");

-- CreateIndex
CREATE INDEX "nao_conformidades_certificacao_id_idx" ON "nao_conformidades"("certificacao_id");

-- CreateIndex
CREATE INDEX "nao_conformidades_status_prazo_resposta_idx" ON "nao_conformidades"("status", "prazo_resposta");

-- AddForeignKey
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_certificacao_id_fkey" FOREIGN KEY ("certificacao_id") REFERENCES "certificacoes_produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_aberto_por_id_fkey" FOREIGN KEY ("aberto_por_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
