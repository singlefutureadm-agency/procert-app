/*
  Warnings:

  - Made the column `categoria_id` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `modelo_trilha_id` on table `produtos` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "produtos" ALTER COLUMN "categoria_id" SET NOT NULL,
ALTER COLUMN "modelo_trilha_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "certificacoes_produto" ADD CONSTRAINT "certificacoes_produto_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "modelos_etapa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
