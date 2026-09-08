-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "cancelado_em" TIMESTAMP(3),
ADD COLUMN     "cancelado_por_id" INTEGER,
ADD COLUMN     "cancelado_por_nome" VARCHAR(150),
ADD COLUMN     "motivo_cancelamento" TEXT;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
