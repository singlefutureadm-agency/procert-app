-- "Produto" passa a se chamar "Processo" em toda a aplicação.
--
-- Só RENAME: nenhuma linha é copiada, recriada ou apagada, e ids, sequências
-- e FKs seguem os mesmos objetos (o Postgres referencia por OID, não por nome).
-- Os nomes de constraint e índice também mudam para bater com o que o Prisma
-- deriva do schema novo — sem isso o próximo `migrate dev` tentaria recriá-los.

-- Tabelas
ALTER TABLE "produtos" RENAME TO "processos";
ALTER TABLE "categorias_produto" RENAME TO "categorias_processo";
ALTER TABLE "certificacoes_produto" RENAME TO "certificacoes_processo";

-- Colunas
ALTER TABLE "certificacoes_processo" RENAME COLUMN "produto_id" TO "processo_id";
ALTER TABLE "certificados" RENAME COLUMN "produto_id" TO "processo_id";
ALTER TABLE "pagamentos" RENAME COLUMN "produto_id" TO "processo_id";

-- Sequências (cosmético: o DEFAULT aponta pelo OID)
ALTER SEQUENCE "produtos_id_seq" RENAME TO "processos_id_seq";
ALTER SEQUENCE "categorias_produto_id_seq" RENAME TO "categorias_processo_id_seq";
ALTER SEQUENCE "certificacoes_produto_id_seq" RENAME TO "certificacoes_processo_id_seq";

-- processos
ALTER INDEX "produtos_pkey" RENAME TO "processos_pkey";
ALTER INDEX "produtos_codigo_processo_key" RENAME TO "processos_codigo_processo_key";
ALTER INDEX "produtos_categoria_id_idx" RENAME TO "processos_categoria_id_idx";
ALTER INDEX "produtos_cliente_id_idx" RENAME TO "processos_cliente_id_idx";
ALTER INDEX "produtos_status_idx" RENAME TO "processos_status_idx";
ALTER TABLE "processos" RENAME CONSTRAINT "produtos_cancelado_por_id_fkey" TO "processos_cancelado_por_id_fkey";
ALTER TABLE "processos" RENAME CONSTRAINT "produtos_categoria_id_fkey" TO "processos_categoria_id_fkey";
ALTER TABLE "processos" RENAME CONSTRAINT "produtos_cliente_id_fkey" TO "processos_cliente_id_fkey";
ALTER TABLE "processos" RENAME CONSTRAINT "produtos_modelo_trilha_id_fkey" TO "processos_modelo_trilha_id_fkey";

-- categorias_processo
ALTER INDEX "categorias_produto_pkey" RENAME TO "categorias_processo_pkey";
ALTER INDEX "categorias_produto_nome_key" RENAME TO "categorias_processo_nome_key";
ALTER INDEX "categorias_produto_status_idx" RENAME TO "categorias_processo_status_idx";
ALTER INDEX "categorias_produto_trilha_id_idx" RENAME TO "categorias_processo_trilha_id_idx";
ALTER TABLE "categorias_processo" RENAME CONSTRAINT "categorias_produto_trilha_id_fkey" TO "categorias_processo_trilha_id_fkey";

-- certificacoes_processo
ALTER INDEX "certificacoes_produto_pkey" RENAME TO "certificacoes_processo_pkey";
ALTER INDEX "certificacoes_produto_produto_id_etapa_id_key" RENAME TO "certificacoes_processo_processo_id_etapa_id_key";
ALTER INDEX "certificacoes_produto_produto_id_ordem_idx" RENAME TO "certificacoes_processo_processo_id_ordem_idx";
ALTER INDEX "certificacoes_produto_status_idx" RENAME TO "certificacoes_processo_status_idx";
ALTER TABLE "certificacoes_processo" RENAME CONSTRAINT "certificacoes_produto_etapa_id_fkey" TO "certificacoes_processo_etapa_id_fkey";
ALTER TABLE "certificacoes_processo" RENAME CONSTRAINT "certificacoes_produto_produto_id_fkey" TO "certificacoes_processo_processo_id_fkey";

-- certificados e pagamentos
ALTER INDEX "certificados_produto_id_data_emissao_idx" RENAME TO "certificados_processo_id_data_emissao_idx";
ALTER TABLE "certificados" RENAME CONSTRAINT "certificados_produto_id_fkey" TO "certificados_processo_id_fkey";
ALTER INDEX "pagamentos_produto_id_criado_em_idx" RENAME TO "pagamentos_processo_id_criado_em_idx";
ALTER TABLE "pagamentos" RENAME CONSTRAINT "pagamentos_produto_id_fkey" TO "pagamentos_processo_id_fkey";

-- A pasta de upload também mudou (/uploads/produtos → /uploads/processos).
-- Os arquivos são copiados por `npm run mover:uploads-processos`, que lê este
-- mesmo nome de arquivo sob a pasta antiga; ver o script.
UPDATE "processos"
   SET "foto_url" = '/uploads/processos/' || substr("foto_url", length('/uploads/produtos/') + 1)
 WHERE "foto_url" LIKE '/uploads/produtos/%';
