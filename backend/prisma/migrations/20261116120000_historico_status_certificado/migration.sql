-- Histórico de situação do certificado (auditoria de 16/11/2026, achado A5):
-- suspensão, cancelamento e reativação passam a registrar autor e motivo.
-- Só acrescenta tabela; nenhuma linha existente é tocada.

-- CreateTable
CREATE TABLE "certificados_historico" (
    "id" SERIAL NOT NULL,
    "certificado_id" INTEGER NOT NULL,
    "status_anterior" "StatusCertificado" NOT NULL,
    "status_novo" "StatusCertificado" NOT NULL,
    "motivo" TEXT,
    "alterado_por_id" INTEGER,
    "alterado_por_nome" VARCHAR(150) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificados_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificados_historico_certificado_id_criado_em_idx" ON "certificados_historico"("certificado_id", "criado_em");

-- AddForeignKey
ALTER TABLE "certificados_historico" ADD CONSTRAINT "certificados_historico_certificado_id_fkey" FOREIGN KEY ("certificado_id") REFERENCES "certificados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados_historico" ADD CONSTRAINT "certificados_historico_alterado_por_id_fkey" FOREIGN KEY ("alterado_por_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
