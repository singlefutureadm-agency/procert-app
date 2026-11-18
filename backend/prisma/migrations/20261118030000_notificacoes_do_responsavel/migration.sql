-- Avisos no painel, endereçados a UMA pessoa da equipe.
--
-- Fecha a leva de três PRs: o PR1 criou o destinatário (`processos.responsavel_id`),
-- o PR2 criou os eventos (documento pedido na microetapa), e aqui eles se encontram.
--
-- O destinatário é sempre o responsável pelo PROCESSO, e somente ele — nem o
-- ADMIN. Processo sem responsável não gera aviso para ninguém: é consequência
-- assumida, e por isso a listagem e o quadro marcam e filtram "sem responsável".
--
-- `destinatario_id` é FK para `funcionarios` com CASCADE, não para uma tabela de
-- usuários genérica: aviso é pessoal e não serve a mais ninguém. O cliente não
-- tem caixa de avisos nesta entrega — ele acompanha pela timeline do processo.
--
-- `processo_id` também é CASCADE e NULÁVEL: o aviso leva a um processo, e se ele
-- deixar de existir o aviso vai com ele em vez de apontar para o nada.
--
-- Só acrescenta tabela e tipo; nenhuma linha existente é tocada.

-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('DOCUMENTO_ENVIADO', 'DOCUMENTO_ACEITO', 'DOCUMENTO_RECUSADO');

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" SERIAL NOT NULL,
    "destinatario_id" INTEGER NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "detalhe" TEXT,
    "processo_id" INTEGER,
    "lida_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- A consulta da tela é sempre "as minhas, não lidas primeiro, recentes no topo",
-- e o badge conta as não lidas a cada polling. Sem índice, cada polling de cada
-- funcionário logado varre a tabela inteira.
CREATE INDEX "notificacoes_destinatario_id_lida_em_criado_em_idx" ON "notificacoes"("destinatario_id", "lida_em", "criado_em");

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
