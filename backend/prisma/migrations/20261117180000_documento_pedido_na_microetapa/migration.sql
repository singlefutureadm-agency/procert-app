-- Documento PEDIDO ao cliente dentro de uma microetapa: enviado, e aceito ou não.
--
-- Até aqui o documento de etapa era evidência que a EQUIPE anexava, sem
-- situação nenhuma — não havia como pedir um arquivo ao cliente, nem como
-- registrar que ele foi recusado e por quê. O item do checklist passa a poder
-- SER o pedido.
--
-- `exige_documento` em `modelos_micro_etapa` NÃO é o mesmo que o homônimo em
-- `modelos_etapa`: lá a etapa exige evidência para ser aprovada, e quem anexa é
-- a equipe; aqui o item é o pedido ao cliente. Os dois convivem na mesma etapa.
--
-- Nenhuma linha existente é tocada: as colunas novas nascem nulas (ou `false`),
-- e `situacao IS NULL` significa exatamente "não passa por aceite", que é o que
-- toda evidência anexada pela equipe sempre foi. Marcá-las como PENDENTE
-- inventaria uma fila de avaliação que nunca existiu, e ela apareceria na tela
-- como trabalho a fazer.

-- CreateEnum
CREATE TYPE "SituacaoDocumento" AS ENUM ('PENDENTE', 'ACEITO', 'RECUSADO');

-- AlterTable
ALTER TABLE "modelos_micro_etapa" ADD COLUMN     "exige_documento" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "micro_etapas_certificacao" ADD COLUMN     "exige_documento" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "documentos_certificacao" ADD COLUMN     "micro_etapa_id" INTEGER,
ADD COLUMN     "enviado_por_cliente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "situacao" "SituacaoDocumento",
ADD COLUMN     "parecer" TEXT,
ADD COLUMN     "avaliado_por_id" INTEGER,
ADD COLUMN     "avaliado_por_nome" VARCHAR(150),
ADD COLUMN     "avaliado_em" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "documentos_certificacao_micro_etapa_id_situacao_idx" ON "documentos_certificacao"("micro_etapa_id", "situacao");

-- AddForeignKey
ALTER TABLE "documentos_certificacao" ADD CONSTRAINT "documentos_certificacao_micro_etapa_id_fkey" FOREIGN KEY ("micro_etapa_id") REFERENCES "micro_etapas_certificacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_certificacao" ADD CONSTRAINT "documentos_certificacao_avaliado_por_id_fkey" FOREIGN KEY ("avaliado_por_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A invariante da avaliação, no banco:
--
--   situacao IS NULL   ⟹  nunca foi julgado (sem parecer, sem avaliador)
--   PENDENTE           ⟹  ainda não julgado
--   ACEITO | RECUSADO  ⟹  julgado, com data
--   RECUSADO           ⟹  E com parecer
--
-- A última linha é a que importa na prática: documento devolvido sem motivo é
-- um reenvio às cegas, e a ausência de parecer não gera erro em lugar nenhum —
-- só um cliente que reenvia o mesmo arquivo. Mesmo espírito do
-- `motivo_cancelamento` obrigatório ao cancelar um processo.
--
-- Entra JÁ VALIDADA, ao contrário de `ck_certificacao_concluida_em`, e a
-- diferença é real: lá havia linhas migradas do PHP legado fora da invariante,
-- e a constraint derrubava o `migrate deploy`. Aqui as quatro colunas estão
-- sendo criadas nesta mesma migration e TODA linha existente tem as quatro
-- nulas — o primeiro ramo do CASE as aceita por construção. Não há dado antigo
-- possível que a viole.
ALTER TABLE "documentos_certificacao"
  ADD CONSTRAINT "ck_documento_avaliacao"
  CHECK (
    CASE
      WHEN "situacao" IS NULL
        THEN "avaliado_em" IS NULL AND "parecer" IS NULL AND "avaliado_por_nome" IS NULL
      WHEN "situacao" = 'PENDENTE'
        THEN "avaliado_em" IS NULL
      WHEN "situacao" = 'RECUSADO'
        THEN "avaliado_em" IS NOT NULL AND "parecer" IS NOT NULL
      ELSE "avaliado_em" IS NOT NULL
    END
  );
