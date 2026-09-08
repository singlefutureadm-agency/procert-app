-- Quadro de gestão de processos: fase do pipeline, papel funcional, SLA em
-- horas e os dois marcos temporais que o quadro lê.
--
-- ATENÇÃO AO ESCREVER MIGRATION PARECIDA: o SQL gerado pelo `prisma migrate
-- dev` para a troca `prazo_sla_dias` → `prazo_sla_horas` era um único
-- `ALTER TABLE ... DROP COLUMN ..., ADD COLUMN ...`. O Prisma não sabe que uma
-- coluna nova é o renome convertido de outra: ele derruba e cria vazia, e o
-- próprio comando avisou ("about to drop the column `prazo_sla_dias`, which
-- still contains 1 non-null values") antes de recusar rodar sem confirmação.
-- Este arquivo foi escrito à mão para ADICIONAR, CONVERTER e só então DERRUBAR.

-- CreateEnum
CREATE TYPE "PapelFuncional" AS ENUM ('CLIENTE', 'TECNICO', 'QUALIDADE', 'AUDITOR', 'DIRETORIA');

-- CreateEnum
CREATE TYPE "FaseProcesso" AS ENUM ('ABERTURA', 'AMOSTRAGEM_AUDITORIA', 'ENSAIOS_LABORATORIO', 'ANALISE_PROCESSO', 'EMISSAO');

-- CreateEnum
CREATE TYPE "MotivoProcesso" AS ENUM ('INICIAL', 'RENOVACAO', 'RECERTIFICACAO', 'MANUTENCAO', 'TRANSFERENCIA', 'EXTENSAO_ESCOPO');

-- ---------------------------------------------------------------------------
-- 1. Etapa do modelo: papel funcional e fase do pipeline
-- ---------------------------------------------------------------------------

-- `papel_responsavel` fica nulável: as etapas já cadastradas não têm
-- responsável definido, e um default inventaria dado que ninguém decidiu.
-- `fase` tem default para não travar em base com dados e para que nenhuma etapa
-- fique fora do quadro — cartão sem coluna some da tela, o que é pior que
-- cartão na coluna errada.
ALTER TABLE "modelos_etapa" ADD COLUMN     "papel_responsavel" "PapelFuncional",
ADD COLUMN     "fase" "FaseProcesso" NOT NULL DEFAULT 'ABERTURA';

-- ---------------------------------------------------------------------------
-- 2. SLA em horas — ADD, converte, só então DROP
-- ---------------------------------------------------------------------------

-- A ordem dos três comandos é a razão de este arquivo existir. Invertida ou
-- fundida num só ALTER, o prazo de toda etapa que tinha um vira NULL sem erro.
ALTER TABLE "modelos_etapa" ADD COLUMN "prazo_sla_horas" INTEGER;

UPDATE "modelos_etapa" SET "prazo_sla_horas" = "prazo_sla_dias" * 24
  WHERE "prazo_sla_dias" IS NOT NULL;

ALTER TABLE "modelos_etapa" DROP COLUMN "prazo_sla_dias";

-- ---------------------------------------------------------------------------
-- 3. Marcos temporais da etapa do produto (cache do histórico)
-- ---------------------------------------------------------------------------

ALTER TABLE "certificacoes_produto" ADD COLUMN     "iniciada_em" TIMESTAMP(3),
ADD COLUMN     "concluida_em" TIMESTAMP(3);

-- BACKFILL — a definição abaixo é a MESMA de `CertificacoesService.salvar()` e
-- do comentário de `CertificacaoProduto` no schema. Ela está escrita em três
-- lugares porque é uma só regra; duas definições divergiriam para sempre, já
-- que nada as compararia em tempo de execução.
--
--   iniciada_em  = MIN(alterado_em) WHERE status_anterior = 'PENDENTE'
--                                     AND status_novo    <> 'PENDENTE'
--   concluida_em = MIN(alterado_em) WHERE status_novo = 'APROVADO',
--                  e NULL se a etapa hoje não está APROVADO
--
-- `criado_em` NÃO serve como início: é a entrada na FILA. A trilha nasce num
-- `createMany` dentro da transação do produto e, em Postgres,
-- CURRENT_TIMESTAMP é o início da transação — todas as etapas de um produto
-- nascem com o mesmo timestamp, igual ao do produto.
--
-- O histórico continua sendo a FONTE DE VERDADE: `relatorios/ciclo.service.ts`
-- segue derivando dele e não lê estas colunas. Elas são cache, para o quadro
-- não varrer o histórico uma vez por cartão.
UPDATE "certificacoes_produto" cp
SET "iniciada_em" = (
      SELECT MIN(h."alterado_em")
      FROM "certificacoes_historico" h
      WHERE h."certificacao_id" = cp."id"
        AND h."status_anterior" = 'PENDENTE'
        AND h."status_novo" <> 'PENDENTE'
    ),
    "concluida_em" = CASE
      WHEN cp."status" = 'APROVADO' THEN (
        SELECT MIN(h."alterado_em")
        FROM "certificacoes_historico" h
        WHERE h."certificacao_id" = cp."id"
          AND h."status_novo" = 'APROVADO'
      )
      ELSE NULL
    END;

-- ---------------------------------------------------------------------------
-- 4. Identificação do processo (sigla, código sequencial e motivo)
-- ---------------------------------------------------------------------------

ALTER TABLE "categorias_produto" ADD COLUMN     "sigla" VARCHAR(8);

-- `codigo_processo` fica NULL para todo produto existente, DE PROPÓSITO: não há
-- backfill retroativo. Inventar `PROCERT-XXX-001-24` para um processo antigo
-- criaria um identificador que nunca circulou em documento nenhum e que a
-- operação não reconheceria. Produto anterior à mudança mostra "—".
ALTER TABLE "produtos" ADD COLUMN     "codigo_processo" VARCHAR(30),
ADD COLUMN     "motivo_processo" "MotivoProcesso" NOT NULL DEFAULT 'INICIAL';

-- CreateIndex
-- Único, e é ele que resolve a corrida de dois processos abertos no mesmo
-- instante: o segundo esbarra aqui e o filtro de exceções traduz P2002 para
-- 409. Mesma estratégia de `nao_conformidades.codigo` e `certificados.numero`.
-- NULLs não colidem entre si em índice único no Postgres, então os produtos
-- sem código convivem sem problema.
CREATE UNIQUE INDEX "produtos_codigo_processo_key" ON "produtos"("codigo_processo");
