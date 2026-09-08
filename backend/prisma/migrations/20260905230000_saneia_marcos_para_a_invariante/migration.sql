-- Saneia `iniciada_em` e `concluida_em` antes que a invariante seja exigida.
--
-- POR QUE ISTO EXISTE: a migration 20260905220000 adicionou
-- `ck_certificacao_concluida_em` e passou na base de DESENVOLVIMENTO, onde todo
-- dado nasceu pelo app e tem histórico completo. **Produção não é assim.** Os
-- dados vieram da migração do PHP legado, onde uma etapa podia chegar já
-- aprovada sem nenhuma transição registrada em `certificacoes_historico`.
--
-- O backfill de 20260905210000 só preenche `concluida_em` quando existe
-- histórico com `status_novo = 'APROVADO'`. Sem histórico, a linha fica
-- `status = 'APROVADO'` com `concluida_em` NULL — exatamente o estado que a
-- constraint recusa. O `migrate deploy` abortaria ali, **com a migration
-- anterior já commitada**, deixando o deploy pela metade e a API fora do ar
-- por um dado que o CI nunca veria: o e2e sobe um Postgres vazio, onde não há
-- linha para violar coisa alguma.
--
-- Esta migration é idempotente e roda ANTES de qualquer nova exigência.

-- ---------------------------------------------------------------------------
-- 1. Conferência — quanto dado está fora da invariante
-- ---------------------------------------------------------------------------

-- Aparece no log do `migrate deploy`. Numa base sã os três são 0; em produção
-- os números dizem quanto do legado entrou sem histórico, e ficam registrados
-- na saída do deploy para conferência posterior.
DO $$
DECLARE
  aprovadas_sem_conclusao int;
  concluidas_sem_aprovacao int;
  iniciadas_faltando int;
BEGIN
  SELECT COUNT(*) INTO aprovadas_sem_conclusao
    FROM certificacoes_produto
    WHERE status = 'APROVADO' AND concluida_em IS NULL;

  SELECT COUNT(*) INTO concluidas_sem_aprovacao
    FROM certificacoes_produto
    WHERE status <> 'APROVADO' AND concluida_em IS NOT NULL;

  SELECT COUNT(*) INTO iniciadas_faltando
    FROM certificacoes_produto
    WHERE iniciada_em IS NULL AND status <> 'PENDENTE';

  RAISE NOTICE 'marcos: % aprovada(s) sem conclusao, % conclusao(oes) sem aprovacao, % sem inicio',
    aprovadas_sem_conclusao, concluidas_sem_aprovacao, iniciadas_faltando;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Fallback para o dado sem histórico
-- ---------------------------------------------------------------------------

-- APROXIMAÇÃO, e assumida como tal: `atualizado_em` é a última escrita na
-- linha, não a data da aprovação. Para o dado migrado do legado — que não tem
-- transição registrada — é o marco mais próximo que existe, e é melhor que
-- NULL, que travaria o deploy, ou que NOW(), que dataria de hoje uma aprovação
-- de dois anos atrás.
--
-- **O histórico continua sendo a fonte de verdade.** `relatorios/ciclo.service`
-- segue derivando dele e não lê estas colunas; um processo com histórico
-- completo não é tocado aqui, porque o backfill anterior já o resolveu.
UPDATE certificacoes_produto
SET concluida_em = atualizado_em
WHERE status = 'APROVADO' AND concluida_em IS NULL;

-- O inverso: conclusão registrada em etapa que hoje não está aprovada. Não
-- deveria existir depois das migrations anteriores, mas a constraint é uma
-- equivalência e recusa as duas direções — e uma base que passou por
-- `db push` ou por correção manual pode ter chegado aqui.
UPDATE certificacoes_produto
SET concluida_em = NULL
WHERE status <> 'APROVADO' AND concluida_em IS NOT NULL;

-- Mesma aproximação para `iniciada_em`, e pelo mesmo motivo do item 2 da
-- revisão: a condição de escrita no service exigia "está saindo de PENDENTE
-- agora", o que criava um ESTADO ABSORVENTE — etapa já EM_ANDAMENTO sem
-- início nunca mais receberia um, porque nenhuma transição futura parte de
-- PENDENTE. O service passou a ser auto-corretivo (grava sempre que estiver
-- null e não estiver voltando para PENDENTE); esta linha resolve as que já
-- estão nesse estado hoje.
--
-- `criado_em` é a entrada na FILA, não o início do trabalho — aproximação
-- conhecida, e a única disponível para quem não tem histórico. Ela ANTECIPA o
-- início, então o SLA dessas etapas aparece mais consumido do que foi: erra
-- para o lado de chamar atenção, não para o de esconder atraso.
UPDATE certificacoes_produto
SET iniciada_em = criado_em
WHERE iniciada_em IS NULL AND status <> 'PENDENTE';

-- ---------------------------------------------------------------------------
-- 3. Revalidação da constraint, sem lock longo
-- ---------------------------------------------------------------------------

-- A constraint de 20260905220000 entrou com `ADD CONSTRAINT` direto, que pega
-- ACCESS EXCLUSIVE e varre a tabela inteira dentro do mesmo lock. Aqui ela é
-- recriada em dois tempos:
--
--   ADD ... NOT VALID   → só passa a valer para escritas NOVAS; não varre nada
--   VALIDATE CONSTRAINT → varre com SHARE UPDATE EXCLUSIVE, que não bloqueia
--                         leitura nem escrita concorrente
--
-- Numa tabela pequena a diferença é imperceptível; numa tabela grande é a
-- diferença entre um deploy e uma janela de indisponibilidade.
ALTER TABLE certificacoes_produto
  DROP CONSTRAINT IF EXISTS ck_certificacao_concluida_em;

ALTER TABLE certificacoes_produto
  ADD CONSTRAINT ck_certificacao_concluida_em
  CHECK ((status = 'APROVADO') = (concluida_em IS NOT NULL))
  NOT VALID;

ALTER TABLE certificacoes_produto
  VALIDATE CONSTRAINT ck_certificacao_concluida_em;
