-- CreateEnum
CREATE TYPE "StatusCertificado" AS ENUM ('EMITIDO', 'SUSPENSO', 'CANCELADO', 'VENCIDO');

-- AlterTable
ALTER TABLE "categorias_produto" ADD COLUMN     "validade_meses" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "certificados" (
    "id" SERIAL NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "escopo" TEXT NOT NULL,
    "data_emissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_validade" TIMESTAMP(3) NOT NULL,
    "status" "StatusCertificado" NOT NULL DEFAULT 'EMITIDO',
    "motivo_status" TEXT,
    "emitido_por_id" INTEGER,
    "emitido_por_nome" VARCHAR(150) NOT NULL,
    "arquivo_pdf" VARCHAR(255),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificados_numero_key" ON "certificados"("numero");

-- CreateIndex
CREATE INDEX "certificados_produto_id_data_emissao_idx" ON "certificados"("produto_id", "data_emissao");

-- CreateIndex
CREATE INDEX "certificados_status_data_validade_idx" ON "certificados"("status", "data_validade");

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_emitido_por_id_fkey" FOREIGN KEY ("emitido_por_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
