/*
  Posição da etapa na trilha do produto.

  A coluna é derivada de `modelos_etapa.ordem`, então o preenchimento das linhas
  existentes é feito aqui mesmo: não há decisão de negócio envolvida, apenas a
  cópia do valor que a ordenação já usava. Produtos migrados entre versões
  podem ter empates de `ordem` entre modelos diferentes; o `row_number` abaixo
  desempata por id e normaliza cada produto para uma sequência 1..N — exatamente
  a ordem que a timeline exibia antes desta migration.
*/
-- AlterTable (nulável para o backfill)
ALTER TABLE "certificacoes_produto" ADD COLUMN "ordem" INTEGER;

-- Backfill: sequência 1..N por produto, na ordem do modelo
UPDATE "certificacoes_produto" AS cp
   SET "ordem" = sequencia.posicao
  FROM (
        SELECT c."id",
               ROW_NUMBER() OVER (
                 PARTITION BY c."produto_id"
                 ORDER BY e."ordem" ASC, c."id" ASC
               ) AS posicao
          FROM "certificacoes_produto" c
          JOIN "modelos_etapa" e ON e."id" = c."etapa_id"
       ) AS sequencia
 WHERE cp."id" = sequencia."id";

-- AlterTable
ALTER TABLE "certificacoes_produto" ALTER COLUMN "ordem" SET NOT NULL;

-- CreateIndex
CREATE INDEX "certificacoes_produto_produto_id_ordem_idx" ON "certificacoes_produto"("produto_id", "ordem");
