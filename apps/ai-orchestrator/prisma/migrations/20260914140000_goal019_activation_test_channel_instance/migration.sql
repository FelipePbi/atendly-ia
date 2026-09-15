-- Goal019 - a execucao do teste grava contra qual instancia de WhatsApp ela rodou.
--
-- Aditiva, sem backfill e sem default fabricado. A coluna nasce nula, e nulo
-- significa "execucao anterior a esta coluna" — nunca uma instancia inventada.
--
-- Ela existe porque `ChannelConnection` e unica por `(tenantId, provider)`:
-- revincular o WhatsApp **atualiza a mesma linha**, trocando
-- `externalInstanceId` sem mudar o `id`. Comparar so o `id` do vinculo nao
-- enxergaria a troca, e o teste de um numero continuaria valendo para outro —
-- exatamente o que o vault proibe ao exigir teste novo a cada revinculacao.
-- `IF NOT EXISTS` pela mesma razao das outras migrations deste Goal: o ensaio
-- reaplica a migration para provar que ela e retomavel, e retomavel nao pode
-- significar "falha na segunda vez".
ALTER TABLE "ActivationTestRun"
    ADD COLUMN IF NOT EXISTS "channelInstanceId" TEXT;
