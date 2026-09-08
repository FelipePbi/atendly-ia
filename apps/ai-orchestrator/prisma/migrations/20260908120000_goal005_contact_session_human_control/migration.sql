-- Goal005 - contato, sessao, categoria persistida e controle humano.
--
-- Aditiva e retomavel. Nenhuma coluna existente muda de tipo, nenhuma linha e
-- removida e todo backfill e condicionado ao estado ausente, para poder ser
-- reexecutado sem duplicar efeito. O binario anterior ignora as tabelas e a
-- coluna novas: `Conversation.contactId` e opcional e ninguem antigo a le.
--
-- Override manual e `ignored` nascem so por decisao explicita: o backfill nunca
-- os inventa, entao rollback tambem nao os desfaz.

CREATE TYPE "SessionCategory" AS ENUM (
    'COMMERCIAL',
    'UNCLASSIFIED',
    'PERSONAL'
);

CREATE TYPE "CategorySource" AS ENUM (
    'AUTOMATIC',
    'MANUAL'
);

CREATE TYPE "HumanControlSource" AS ENUM (
    'WHATSAPP',
    'ATENDLY',
    'BACKFILL'
);

CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalContactId" TEXT NOT NULL,
    "displayName" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "ignoredAt" TIMESTAMP(3),
    "ignoredBy" TEXT,
    "ignoredSource" TEXT,
    "aiPaused" BOOLEAN NOT NULL DEFAULT false,
    "aiPausedAt" TIMESTAMP(3),
    "aiPausedReason" TEXT,
    "categoryOverride" "SessionCategory",
    "categoryOverrideAt" TIMESTAMP(3),
    "categoryOverrideBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contact_tenantId_channelId_externalContactId_key" ON "Contact"("tenantId", "channelId", "externalContactId");
CREATE UNIQUE INDEX "Contact_tenantId_id_key" ON "Contact"("tenantId", "id");
CREATE INDEX "Contact_tenantId_ignored_idx" ON "Contact"("tenantId", "ignored");

CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastContactMessageAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "category" "SessionCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
    "categorySource" "CategorySource" NOT NULL DEFAULT 'AUTOMATIC',
    "categoryUpdatedAt" TIMESTAMP(3),
    "categoryUpdatedBy" TEXT,
    "suggestedCategory" "SessionCategory",
    "suggestionProvenance" TEXT,
    "suggestedAt" TIMESTAMP(3),
    "humanHandling" BOOLEAN NOT NULL DEFAULT false,
    "humanHandlingSince" TIMESTAMP(3),
    "humanHandlingSource" "HumanControlSource",
    "humanHandlingBy" TEXT,
    "contextResetAt" TIMESTAMP(3),
    "inboundVersion" INTEGER NOT NULL DEFAULT 0,
    "backfillNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationSession_tenantId_id_key" ON "ConversationSession"("tenantId", "id");
CREATE INDEX "ConversationSession_tenantId_conversationId_startedAt_idx" ON "ConversationSession"("tenantId", "conversationId", "startedAt");
CREATE INDEX "ConversationSession_tenantId_conversationId_endedAt_idx" ON "ConversationSession"("tenantId", "conversationId", "endedAt");
CREATE INDEX "ConversationSession_tenantId_category_humanHandling_idx" ON "ConversationSession"("tenantId", "category", "humanHandling");

ALTER TABLE "Conversation" ADD COLUMN "contactId" TEXT;
CREATE INDEX "Conversation_tenantId_contactId_idx" ON "Conversation"("tenantId", "contactId");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_channel_fkey"
    FOREIGN KEY ("tenantId", "channelId") REFERENCES "ChannelConnection"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contact_fkey"
    FOREIGN KEY ("tenantId", "contactId") REFERENCES "Contact"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_conversation_fkey"
    FOREIGN KEY ("tenantId", "channelId", "conversationId") REFERENCES "Conversation"("tenantId", "channelId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_contact_fkey"
    FOREIGN KEY ("tenantId", "contactId") REFERENCES "Contact"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: Contato a partir de `externalContactId`, preservando o ID
-- externo. Nasce nao ignorado e sem override: nenhuma decisao e inventada.
-- `ON CONFLICT DO NOTHING` deixa a instrucao retomavel.
INSERT INTO "Contact" ("id", "tenantId", "channelId", "externalContactId", "displayName", "createdAt", "updatedAt")
SELECT
    'contact_' || md5("c"."tenantId" || ':' || "c"."channelId" || ':' || "c"."externalContactId"),
    "c"."tenantId",
    "c"."channelId",
    "c"."externalContactId",
    "c"."customerName",
    "c"."createdAt",
    "c"."updatedAt"
FROM "Conversation" AS "c"
ON CONFLICT ("tenantId", "channelId", "externalContactId") DO NOTHING;

UPDATE "Conversation" AS "c"
SET "contactId" = "k"."id"
FROM "Contact" AS "k"
WHERE "k"."tenantId" = "c"."tenantId"
  AND "k"."channelId" = "c"."channelId"
  AND "k"."externalContactId" = "c"."externalContactId"
  AND "c"."contactId" IS NULL;

-- Backfill 2: pausa indefinida vira pausa explicita do contato.
--
-- Antes deste Goal, `humanHandoff` com `handoffPausedUntil` nulo ou no ano 9999
-- significava "indefinido" - os dois casos vinham de `/bot off`, `/ia_pause` ou
-- takeover pelo painel. A pausa passa a viver no contato para que a expiracao
-- da sessao nao a desfaca sozinha. Nenhuma retomada automatica e inventada.
UPDATE "Contact" AS "k"
SET "aiPaused" = true,
    "aiPausedAt" = "c"."updatedAt",
    "aiPausedReason" = 'legacy_indefinite_pause'
FROM "Conversation" AS "c"
WHERE "c"."contactId" = "k"."id"
  AND "c"."humanHandoff" = true
  AND ("c"."handoffPausedUntil" IS NULL OR "c"."handoffPausedUntil" > TIMESTAMP '9000-01-01 00:00:00')
  AND "k"."aiPaused" = false;

-- Backfill 3: sessao historica derivada dos timestamps das mensagens.
--
-- Proveniencia explicita em `backfillNote`; nada e afirmado com certeza que o
-- estoque nao tem. A classificacao tecnica do JSON do agente vira **sugestao**
-- com proveniencia `legacy_agent_state` e, na falta de override manual (que o
-- backfill nunca cria), tambem a categoria vigente automatica.
--
-- `humanHandoff` vigente vira atendimento humano da sessao corrente. Conversa
-- com pausa ja vencida no relogio e ambiguidade do estoque: fica em pendencia
-- segura - humano no controle e nota registrada - em vez de a IA voltar a
-- responder sozinha por causa de um relogio antigo.
INSERT INTO "ConversationSession" (
    "id", "tenantId", "channelId", "conversationId", "contactId",
    "startedAt", "lastContactMessageAt", "expiresAt",
    "category", "categorySource",
    "suggestedCategory", "suggestionProvenance", "suggestedAt",
    "humanHandling", "humanHandlingSince", "humanHandlingSource",
    "inboundVersion", "backfillNote", "createdAt", "updatedAt"
)
SELECT
    'session_' || md5("c"."tenantId" || ':' || "c"."id"),
    "c"."tenantId",
    "c"."channelId",
    "c"."id",
    "c"."contactId",
    COALESCE("m"."first_at", "c"."createdAt"),
    "m"."last_inbound_at",
    COALESCE("m"."last_inbound_at", "c"."updatedAt") + INTERVAL '24 hours',
    COALESCE("s"."category", 'UNCLASSIFIED'),
    'AUTOMATIC',
    "s"."category",
    CASE WHEN "s"."category" IS NULL THEN NULL ELSE 'legacy_agent_state' END,
    CASE WHEN "s"."category" IS NULL THEN NULL ELSE "c"."updatedAt" END,
    ("c"."humanHandoff" = true),
    CASE WHEN "c"."humanHandoff" = true THEN "c"."updatedAt" ELSE NULL END,
    CASE WHEN "c"."humanHandoff" = true THEN 'BACKFILL'::"HumanControlSource" ELSE NULL END,
    0,
    CASE
      WHEN "c"."humanHandoff" = true
        AND "c"."handoffPausedUntil" IS NOT NULL
        AND "c"."handoffPausedUntil" <= TIMESTAMP '9000-01-01 00:00:00'
        THEN 'legacy_expired_pause_pending_review'
      ELSE 'legacy_backfill_from_message_timestamps'
    END,
    "c"."createdAt",
    "c"."updatedAt"
FROM "Conversation" AS "c"
LEFT JOIN LATERAL (
    SELECT
        MIN("createdAt") AS "first_at",
        MAX("createdAt") FILTER (WHERE "direction" = 'INBOUND') AS "last_inbound_at"
    FROM "Message"
    WHERE "Message"."conversationId" = "c"."id"
      AND "Message"."tenantId" = "c"."tenantId"
) AS "m" ON true
LEFT JOIN LATERAL (
    SELECT CASE "c"."state" -> 'aiConversation' ->> 'classification'
        WHEN 'potential_customer'  THEN 'COMMERCIAL'::"SessionCategory"
        WHEN 'existing_customer'   THEN 'COMMERCIAL'::"SessionCategory"
        WHEN 'personal_contact'    THEN 'PERSONAL'::"SessionCategory"
        WHEN 'supplier_or_partner' THEN 'UNCLASSIFIED'::"SessionCategory"
        WHEN 'spam'                THEN 'UNCLASSIFIED'::"SessionCategory"
        ELSE NULL
    END AS "category"
) AS "s" ON true
WHERE "c"."contactId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ConversationSession" AS "e"
    WHERE "e"."tenantId" = "c"."tenantId" AND "e"."conversationId" = "c"."id"
  );
