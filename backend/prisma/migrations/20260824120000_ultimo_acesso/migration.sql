-- Último login bem-sucedido de cada conta.
--
-- Responde a pergunta de negócio "quem sumiu da plataforma". NÃO responde
-- frequência de uso: para isso seria preciso uma tabela de eventos de acesso,
-- deliberadamente não criada — ela cresce sem limite e amplia a exposição de
-- LGPD sem que exista pergunta de negócio que a justifique.
--
-- Nulo em toda linha existente, e é assim que fica até o próximo login: não há
-- de onde inferir o acesso anterior. A UI exibe "Nunca acessou" nesse caso, que
-- é justamente o dado que interessa.
ALTER TABLE "clientes" ADD COLUMN     "ultimo_acesso_em" TIMESTAMP(3);

-- Mesma semântica na equipe interna. Alimenta a coluna "última atividade" do
-- relatório de desempenho.
ALTER TABLE "funcionarios" ADD COLUMN     "ultimo_acesso_em" TIMESTAMP(3);
