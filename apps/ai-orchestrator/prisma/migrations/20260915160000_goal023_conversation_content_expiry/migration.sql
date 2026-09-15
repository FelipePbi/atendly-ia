-- Goal023/WU-02 - marca duravel de ate quando o conteudo de uma conversa ja
-- foi purgado.
--
-- Aditiva, sem backfill e sem default fabricado. A coluna nasce nula em todo o
-- estoque, e nulo significa "nada desta conversa expirou ainda" — nunca um
-- instante inventado, que faria a interface anunciar perda que nao houve.
--
-- `IF NOT EXISTS` porque o ensaio de migrations deste Goal reaplica a
-- migration para provar que ela e retomavel, e retomavel nao pode significar
-- "falha na segunda vez".
ALTER TABLE "Conversation"
    ADD COLUMN IF NOT EXISTS "contentExpiredThrough" TIMESTAMP(3);
