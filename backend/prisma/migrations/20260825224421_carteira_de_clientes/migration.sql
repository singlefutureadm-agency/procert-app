-- Carteira de clientes: qual funcionário responde por qual empresa.
--
-- Vínculo 1:N, não tabela pivô — a operação concentra cada empresa num ponto
-- de contato, e pivô sem campo `principal` deixaria "quem responde por esta
-- empresa" sem resposta única.
--
-- Nulo em toda linha existente: não há de onde inferir responsável para os
-- cadastros anteriores, e atribuir um por padrão seria inventar dado.
--
-- ON DELETE SET NULL é seguro ENQUANTO o vínculo for informativo. Ao fechar o
-- acesso por carteira, isto vira decisão explícita: excluir o funcionário
-- soltaria a carteira inteira dele, e com acesso restrito os clientes sumiriam
-- do painel de todos os outros sem erro nenhum.

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "responsavel_id" INTEGER;

-- CreateIndex
CREATE INDEX "clientes_responsavel_id_idx" ON "clientes"("responsavel_id");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
