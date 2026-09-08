-- AlterTable
ALTER TABLE "modelos_trilha" ADD COLUMN     "aprovacao_automatica" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "aprovacao_automatica" BOOLEAN;

-- CreateTable
CREATE TABLE "modelos_micro_etapa" (
    "id" SERIAL NOT NULL,
    "modelo_etapa_id" INTEGER NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "modelos_micro_etapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "micro_etapas_certificacao" (
    "id" SERIAL NOT NULL,
    "certificacao_id" INTEGER NOT NULL,
    "modelo_micro_etapa_id" INTEGER,
    "nome" VARCHAR(200) NOT NULL,
    "ordem" INTEGER NOT NULL,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "concluida_em" TIMESTAMP(3),
    "concluida_por_id" INTEGER,
    "concluida_por_nome" VARCHAR(150),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "micro_etapas_certificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modelos_micro_etapa_modelo_etapa_id_ordem_idx" ON "modelos_micro_etapa"("modelo_etapa_id", "ordem");

-- CreateIndex
CREATE INDEX "micro_etapas_certificacao_certificacao_id_ordem_idx" ON "micro_etapas_certificacao"("certificacao_id", "ordem");

-- AddForeignKey
ALTER TABLE "modelos_micro_etapa" ADD CONSTRAINT "modelos_micro_etapa_modelo_etapa_id_fkey" FOREIGN KEY ("modelo_etapa_id") REFERENCES "modelos_etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "micro_etapas_certificacao" ADD CONSTRAINT "micro_etapas_certificacao_certificacao_id_fkey" FOREIGN KEY ("certificacao_id") REFERENCES "certificacoes_produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "micro_etapas_certificacao" ADD CONSTRAINT "micro_etapas_certificacao_modelo_micro_etapa_id_fkey" FOREIGN KEY ("modelo_micro_etapa_id") REFERENCES "modelos_micro_etapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "micro_etapas_certificacao" ADD CONSTRAINT "micro_etapas_certificacao_concluida_por_id_fkey" FOREIGN KEY ("concluida_por_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
