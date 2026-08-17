-- CreateEnum
CREATE TYPE "TemaPadrao" AS ENUM ('CLARO', 'ESCURO');

-- CreateTable
CREATE TABLE "configuracao_aparencia" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "tema_claro" JSONB NOT NULL,
    "tema_escuro" JSONB NOT NULL,
    "fonte" VARCHAR(200) NOT NULL,
    "tema_padrao" "TemaPadrao" NOT NULL DEFAULT 'ESCURO',
    "permitir_alternancia" BOOLEAN NOT NULL DEFAULT true,
    "atualizado_por_id" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_aparencia_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "configuracao_aparencia" ADD CONSTRAINT "configuracao_aparencia_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
