-- Dono do processo: uma PESSOA (funcionário), e não uma área.
--
-- `modelos_etapa.papel_responsavel` já dizia de que ÁREA é cada etapa
-- (PapelFuncional). Faltava de QUEM é o processo — o eixo que permite endereçar
-- aviso a uma pessoa. A carteira (`clientes.responsavel_id`) não serve: é por
-- empresa, e dois técnicos dividem processos do mesmo cliente.
--
-- Coluna NULÁVEL e SEM backfill: atribuir responsável a processo antigo
-- inventaria dado, e não há de onde deduzi-lo. Processo sem responsável aparece
-- como "sem responsável" na listagem e no quadro — estado achável, não
-- silencioso.
--
-- `ON DELETE SET NULL`: excluir o funcionário solta o processo em vez de
-- recusar o delete. É seguro porque a coluna NÃO restringe acesso — ninguém
-- perde a visão de um processo por ele ficar sem dono.

-- AlterTable
ALTER TABLE "processos" ADD COLUMN     "responsavel_id" INTEGER;

-- CreateIndex
CREATE INDEX "processos_responsavel_id_idx" ON "processos"("responsavel_id");

-- AddForeignKey
ALTER TABLE "processos" ADD CONSTRAINT "processos_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
