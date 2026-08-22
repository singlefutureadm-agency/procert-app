-- Logo por tema: uma para o tema claro, outra para o escuro.
--
-- `logo_url` vira `logo_tema_escuro_url` por RENAME, não por DROP + ADD: a
-- coluna carrega a logo já enviada pelo organismo, e recriar apagaria o
-- vínculo com o arquivo em disco (que continuaria órfão em `uploads/aparencia`).
-- O diff automático do Prisma propõe DROP + ADD e perderia esse valor.
--
-- Vai para a variante ESCURA, e não para a clara, porque é onde ela já estava
-- sendo usada de fato: o painel nasce no tema escuro, o cabeçalho do site é
-- transparente sobre um hero escuro, e a tela de Aparência sempre orientou
-- "prefira traço claro". Cair na coluna do tema claro deixaria a logo do
-- organismo invisível na própria amostra da tela.
ALTER TABLE "configuracao_aparencia" RENAME COLUMN "logo_url" TO "logo_tema_escuro_url";

-- Variante para o tema claro. Nula, o painel cai para a do tema escuro.
ALTER TABLE "configuracao_aparencia" ADD COLUMN "logo_tema_claro_url" VARCHAR(255);
