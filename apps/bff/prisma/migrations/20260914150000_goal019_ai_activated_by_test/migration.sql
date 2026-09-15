-- Goal019 - a ativacao da IA passa a saber qual teste a autorizou.
--
-- Aditiva e sem backfill. A coluna nasce nula para todo o estoque, e nulo
-- significa "esta IA nao foi ligada por teste" — nunca "o teste falhou" e
-- nunca um teste fabricado para negocio que nunca testou. Negocio que ja
-- tinha a IA ligada pela regra vigente continua ligado exatamente como
-- estava: esta coluna nao desliga ninguem por si so.
--
-- Ela existe por duas razoes, e as duas sao de produto:
--
-- 1. **Idempotencia da autoativacao.** Reconciliar a mesma execucao
--    bem-sucedida duas vezes nao pode gerar duas ativacoes. Com o ID gravado
--    aqui, a segunda passada reconhece que aquela execucao ja foi consumida.
-- 2. **O teste nao sobrevive a troca do WhatsApp.** O vault exige novo teste
--    ao trocar/revincular o numero. Guardando qual execucao autorizou a
--    ativacao, o produto consegue desligar a IA quando aquela execucao deixa
--    de valer, em vez de continuar ligada por uma prova que ja nao existe.
ALTER TABLE "AiSettings"
  ADD COLUMN "activatedByRunId" TEXT;
