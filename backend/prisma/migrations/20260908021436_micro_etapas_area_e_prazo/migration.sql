-- AlterTable
ALTER TABLE "micro_etapas_certificacao" ADD COLUMN     "papel_responsavel" "PapelFuncional",
ADD COLUMN     "prazo_sla_horas" INTEGER;

-- AlterTable
ALTER TABLE "modelos_micro_etapa" ADD COLUMN     "papel_responsavel" "PapelFuncional",
ADD COLUMN     "prazo_sla_horas" INTEGER;
