-- CreateTable
CREATE TABLE "documentos_certificacao" (
    "id" SERIAL NOT NULL,
    "historico_id" INTEGER NOT NULL,
    "nome_arquivo" VARCHAR(255) NOT NULL,
    "arquivo_url" VARCHAR(255) NOT NULL,
    "tipo_mime" VARCHAR(100) NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "enviado_por_id" INTEGER,
    "enviado_por_nome" VARCHAR(150) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_certificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_certificacao_historico_id_idx" ON "documentos_certificacao"("historico_id");

-- AddForeignKey
ALTER TABLE "documentos_certificacao" ADD CONSTRAINT "documentos_certificacao_historico_id_fkey" FOREIGN KEY ("historico_id") REFERENCES "certificacoes_historico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_certificacao" ADD CONSTRAINT "documentos_certificacao_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
