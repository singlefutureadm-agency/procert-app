/*
  Trilha deixa de pertencer a uma categoria e vira cadastro próprio.

  ANTES  CategoriaProduto --1:N--> ModeloTrilha (versões) --1:N--> ModeloEtapa
  DEPOIS Trilha (família) --1:N--> ModeloTrilha (versões) --1:N--> ModeloEtapa
            ^
         CategoriaProduto.trilha_id

  Motivo: o processo era redigitado a cada categoria nova, e duas categorias
  com o mesmo processo divergiam em silêncio na primeira revisão de uma delas.

  Esta migration PRESERVA TUDO. Cada categoria que já tinha trilha vira uma
  entrada do catálogo com o nome dela, as versões existentes são repontadas para
  essa entrada e a própria categoria passa a apontar de volta para ela. Nenhum
  `produtos.modelo_trilha_id` é tocado: o retrato de versão de cada produto em
  andamento continua exatamente o mesmo, e nenhuma avaliação em curso muda de
  régua. Categoria que não tinha trilha continua sem trilha (`trilha_id` NULL),
  como já estava.

  `categoria_origem_id` é coluna auxiliar: carrega o mapeamento entre os dois
  passos e é removida no fim. Casar por nome funcionaria hoje (ambos são únicos
  e a cópia é literal), mas amarraria a correção dos dados a um texto editável.
*/

-- CreateTable
CREATE TABLE "trilhas" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "status" "StatusRegistro" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    -- auxiliar desta migration; removida no fim do arquivo
    "categoria_origem_id" INTEGER,

    CONSTRAINT "trilhas_pkey" PRIMARY KEY ("id")
);

-- Uma entrada de catálogo por categoria que JÁ TEM trilha. A que não tem não
-- gera entrada: criar uma trilha vazia só encheria o catálogo de item morto.
INSERT INTO "trilhas" ("nome", "descricao", "status", "criado_em", "atualizado_em", "categoria_origem_id")
SELECT
    c."nome",
    COALESCE(c."descricao", 'Trilha da categoria ' || c."nome" || ', migrada quando as trilhas viraram catálogo.'),
    c."status",
    c."criado_em",
    CURRENT_TIMESTAMP,
    c."id"
FROM "categorias_produto" c
WHERE EXISTS (SELECT 1 FROM "modelos_trilha" mt WHERE mt."categoria_id" = c."id");

-- As versões passam a pender da família.
ALTER TABLE "modelos_trilha" ADD COLUMN "trilha_id" INTEGER;

UPDATE "modelos_trilha" mt
SET "trilha_id" = t."id"
FROM "trilhas" t
WHERE t."categoria_origem_id" = mt."categoria_id";

ALTER TABLE "modelos_trilha" ALTER COLUMN "trilha_id" SET NOT NULL;

-- E a categoria passa a apontar para a família.
ALTER TABLE "categorias_produto" ADD COLUMN "trilha_id" INTEGER;

UPDATE "categorias_produto" c
SET "trilha_id" = t."id"
FROM "trilhas" t
WHERE t."categoria_origem_id" = c."id";

-- DropForeignKey
ALTER TABLE "modelos_trilha" DROP CONSTRAINT "modelos_trilha_categoria_id_fkey";

-- DropIndex
DROP INDEX "modelos_trilha_categoria_id_ativo_idx";
DROP INDEX "modelos_trilha_categoria_id_versao_key";

-- AlterTable
ALTER TABLE "modelos_trilha" DROP COLUMN "categoria_id";

-- A auxiliar já cumpriu o papel.
ALTER TABLE "trilhas" DROP COLUMN "categoria_origem_id";

-- CreateIndex
CREATE UNIQUE INDEX "trilhas_nome_key" ON "trilhas"("nome");
CREATE INDEX "trilhas_status_idx" ON "trilhas"("status");
CREATE INDEX "categorias_produto_trilha_id_idx" ON "categorias_produto"("trilha_id");
CREATE INDEX "modelos_trilha_trilha_id_ativo_idx" ON "modelos_trilha"("trilha_id", "ativo");
CREATE UNIQUE INDEX "modelos_trilha_trilha_id_versao_key" ON "modelos_trilha"("trilha_id", "versao");

-- AddForeignKey
ALTER TABLE "categorias_produto" ADD CONSTRAINT "categorias_produto_trilha_id_fkey" FOREIGN KEY ("trilha_id") REFERENCES "trilhas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "modelos_trilha" ADD CONSTRAINT "modelos_trilha_trilha_id_fkey" FOREIGN KEY ("trilha_id") REFERENCES "trilhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
