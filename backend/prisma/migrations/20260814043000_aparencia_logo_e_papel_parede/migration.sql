-- Logo do organismo e papel de parede do painel.
ALTER TABLE "configuracao_aparencia"
  ADD COLUMN "logo_url" VARCHAR(255),
  ADD COLUMN "papel_parede_url" VARCHAR(255),
  ADD COLUMN "papel_parede_opacidade" INTEGER NOT NULL DEFAULT 35,
  ADD COLUMN "papel_parede_ajuste" VARCHAR(20) NOT NULL DEFAULT 'COBRIR';

-- `fonte` passou a guardar o id do catálogo ('inter') em vez da pilha CSS
-- completa ("Inter, system-ui, ..."). Converte o que já estava salvo antes de
-- encolher a coluna — sem isto o valor existente vira lixo e cai no fallback.
UPDATE "configuracao_aparencia" SET "fonte" = CASE
  WHEN "fonte" LIKE 'Inter,%'      THEN 'inter'
  WHEN "fonte" LIKE 'Roboto,%'     THEN 'roboto'
  WHEN "fonte" LIKE 'Poppins,%'    THEN 'poppins'
  WHEN "fonte" LIKE 'system-ui,%'  THEN 'system'
  ELSE 'segoe-ui'
END;

ALTER TABLE "configuracao_aparencia" ALTER COLUMN "fonte" SET DATA TYPE VARCHAR(60);
