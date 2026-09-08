-- Corrige o backfill de `concluida_em` da migration anterior
-- (20260905210000_quadro_processos_fase_papel_sla), que usou MIN.
--
-- MIN devolve a PRIMEIRA aprovação. Uma etapa aprovada → reprovada (não
-- conformidade aberta) → aprovada de novo tem a conclusão vigente na ÚLTIMA
-- aprovação, não na primeira. Com MIN, o backfill nascia discordando do que
-- `CertificacoesService.salvar()` grava — e discordando exatamente nos casos em
-- que a diferença importa, que são os processos que tiveram problema.
--
-- A migration anterior NÃO foi editada: já estava aplicada, e reescrever
-- migration aplicada faz o checksum divergir em toda máquina que já rodou.
--
-- DEFINIÇÃO CORRIGIDA — a mesma no schema (`CertificacaoProduto.concluidaEm`)
-- e em `CertificacoesService.salvar()`:
--
--   concluidaEm = alterado_em da aprovação VIGENTE, isto é
--                 MAX(alterado_em) WHERE status_novo = 'APROVADO'
--                 -- e NULL se a etapa hoje não está APROVADO
--
-- `iniciada_em` continua MIN e NÃO é tocado aqui: é o mesmo marco que
-- `relatorios/ciclo.service.ts` publica como início do tratamento, e movê-lo
-- mudaria número de relatório já divulgado.
UPDATE "certificacoes_produto" cp
SET "concluida_em" = CASE
      WHEN cp."status" = 'APROVADO' THEN (
        SELECT MAX(h."alterado_em")
        FROM "certificacoes_historico" h
        WHERE h."certificacao_id" = cp."id"
          AND h."status_novo" = 'APROVADO'
      )
      ELSE NULL
    END;
