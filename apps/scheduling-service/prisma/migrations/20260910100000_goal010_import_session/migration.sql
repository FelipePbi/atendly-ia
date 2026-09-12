-- Goal010 - modelo de dados da importacao unica do Minha Agenda: sessao,
-- item, decisao, cobertura por categoria, lease da execucao e conclusao
-- unica por negocio.
--
-- ADITIVA E RETOMAVEL, em um passo unico. Nao existe passo de corte aqui:
-- todo objeto e novo, as unicas tabelas preexistentes tocadas sao
-- `MigrationJob` (colunas novas anulaveis ou com default constante) e
-- `IntegrationConnection` (um indice unico tecnico). Nenhuma linha de
-- `MigrationJob`, `MigrationConflict`, `ExternalEntityMap` ou
-- `IntegrationConnection` e apagada, reescrita ou convertida: as UPDATEs
-- deste arquivo nao existem, e o `ADD COLUMN ... NOT NULL DEFAULT` usa o
-- default constante (fast default do Postgres 11+), que nao reescreve a
-- tabela nem muda o valor de nenhuma linha existente. Job legado
-- `COMPLETED` continua `COMPLETED` e nasce `UNCLASSIFIED`.
--
-- DIVERGENCIAS DE SCHEMA INTENCIONAIS, como nos Goals 005-009. `prisma
-- migrate diff` vai relata-las; sao esperadas e nao devem ser "corrigidas"
-- removendo o objeto:
--
--   1. Indices unicos PARCIAIS, que o Prisma nao modela:
--      - `ImportSession_one_completed_per_tenant` sobre `("tenantId")
--        WHERE "completedAt" IS NOT NULL`. E a invariante mais cara do
--        Goal: a segunda conclusao de importacao do mesmo negocio e
--        recusada pelo BANCO, inclusive com duas conexoes concorrentes
--        commitando ao mesmo tempo, e nao apenas por checagem de codigo.
--        O predicado usa `completedAt` (e nao o enum) de proposito: e o
--        dado que registra a decisao, e o CHECK de conclusao amarra os dois
--        sentidos (`status = COMPLETED` se e somente se `completedAt`
--        existe).
--      - `ImportSession_one_live_per_tenant` sobre `("tenantId")` restrito
--        aos estados vivos. E a "uma sessao por negocio": dois starts
--        simultaneos nao criam duas sessoes. Substituir uma sessao viva
--        exige move-la antes para `SUPERSEDED` ou `FAILED` — falha tecnica
--        antes da conclusao nao consome o direito de importacao.
--
--   2. CHECKs explicitos, que o Prisma tambem nao modela. O estado do item
--      ja e um enum do Postgres, mas ganha `ImportItem_status_check` pelo
--      mesmo motivo do Goal008: o conjunto fechado e invariante de banco,
--      e um valor fora dele precisa ser recusado mesmo que algum caminho
--      passe a gravar a coluna como texto no futuro.
--
--   3. `updatedAt` nasce com `DEFAULT CURRENT_TIMESTAMP`, que o Prisma nao
--      declara (ele preenche a coluna na aplicacao). E a mesma divergencia
--      que `BlockSeries`, `AppointmentHold`, `CustomerNote` e outras ja
--      carregam desde os Goals anteriores, e existe para que INSERT em SQL
--      cru (ensaio, fixture, correcao operacional) nao precise repetir o
--      valor. `prisma migrate diff` lista isso como unica diferenca das
--      tabelas novas.
--
-- LEASE PELO RELOGIO DO BANCO: `leaseAcquiredAt`, `leaseExpiresAt` e
-- `leaseHeartbeatAt` sao TIMESTAMPTZ, nao TIMESTAMP, pela licao do
-- `AppointmentHold` no Goal008 (`20260909182000_goal008_agenda_fixups`):
-- sao sempre comparados com `now()` do servidor e precisam continuar
-- corretos independentemente do fuso da sessao que grava ou le a linha. A
-- reivindicacao e `... WHERE "leaseOwner" IS NULL OR "leaseExpiresAt" <=
-- now()` com `SET "leaseExpiresAt" = now() + interval`, nunca com um
-- instante calculado pelo relogio do processo.
--
-- IDEMPOTENCIA POR ITEM: continua sendo `ExternalEntityMap (tenantId,
-- provider, entityType, externalId)`. `ImportItem_tenantId_sessionId_..._key`
-- e identidade do item DENTRO da sessao (e o que permite a reanalise
-- reconciliar decisoes por identificador de origem), nao uma segunda chave
-- de idempotencia.
--
-- REVERSAO: o binario anterior a este Goal continua funcionando enquanto
-- nao existir sessao de importacao — ele ignora as tabelas novas e as
-- colunas novas de `MigrationJob` (todas anulaveis ou com default). A
-- partir da primeira sessao concluida sob o protocolo novo, a versao
-- anterior deixa de ser destino seguro de rollback: ela ainda oferece
-- migracao bidirecional e troca automatica de fonte, que este Goal remove.

-- 1. Enums novos da importacao. `CREATE TYPE` sob guarda de
--    `duplicate_object`, no padrao do Goal009, para a migration ser
--    retomavel.
DO $$ BEGIN
    CREATE TYPE "ImportCategory" AS ENUM (
        'SERVICE',
        'CUSTOMER',
        'AVAILABILITY',
        'TIME_BLOCK',
        'FUTURE_APPOINTMENT',
        'PAST_APPOINTMENT',
        'CANCELLED_APPOINTMENT',
        'NO_SHOW_APPOINTMENT'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ImportSessionStatus" AS ENUM (
        'DRAFT',
        'ANALYZING',
        'READY',
        'EXECUTING',
        'PARTIAL',
        'FAILED',
        'SUPERSEDED',
        'COMPLETED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ImportItemStatus" AS ENUM (
        'PENDING',
        'IMPORTED',
        'SKIPPED',
        'FAILED',
        'NEEDS_REVIEW'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ImportDecisionScope" AS ENUM ('SESSION', 'CATEGORY', 'ITEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ImportDecisionKind" AS ENUM (
        'IMPORT_ALL',
        'INCLUDE',
        'EXCLUDE',
        'MERGE_WITH_EXISTING',
        'CREATE_NEW',
        'KEEP_EXISTING',
        'ACCEPT_PENDING_COMPLETION'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "LegacyMigrationJobClass" AS ENUM (
        'UNCLASSIFIED',
        'TECHNICAL_COMPLETED',
        'TECHNICAL_INCOMPLETE',
        'TECHNICAL_FAILED',
        'NEEDS_REVIEW'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Valores novos de `ExternalEntityType`, no padrao validado no Goal009
--    (`CalendarEffectEntityType`): `ADD VALUE IF NOT EXISTS`, aditivo e
--    retomavel. A origem ja marca bloqueios (`isSlotBlocker`) e ausencias,
--    que na Atendly viram `TimeBlock` e `AvailabilityException`; sem esses
--    valores essas categorias nao teriam chave de idempotencia em
--    `ExternalEntityMap`. Nenhum valor existente muda de significado e
--    nenhuma linha de `ExternalEntityMap` e tocada.
--
--    Os dois valores NAO sao usados como literal em nenhum outro ponto
--    desta migration, de proposito: o Postgres proibe usar um valor de enum
--    acrescentado na mesma transacao. As colunas abaixo apenas referenciam
--    o TIPO.
ALTER TYPE "ExternalEntityType" ADD VALUE IF NOT EXISTS 'TIME_BLOCK';
ALTER TYPE "ExternalEntityType" ADD VALUE IF NOT EXISTS 'AVAILABILITY_EXCEPTION';

-- 3. Unicidade tecnica `(tenantId, id)` em `IntegrationConnection`, para a
--    FK composta por tenant da sessao. Aditiva e impossivel de violar: `id`
--    ja e a chave primaria da tabela. Nenhuma linha e lida, reescrita ou
--    apagada.
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationConnection_tenantId_id_key"
    ON "IntegrationConnection"("tenantId", "id");

-- 4. Sessao de importacao.
CREATE TABLE IF NOT EXISTS "ImportSession" (
    "id"                   TEXT NOT NULL,
    "tenantId"             TEXT NOT NULL,
    "provider"             "IntegrationProvider" NOT NULL DEFAULT 'MINHA_AGENDA',
    -- Identidade da conta de origem. Nao e credencial: o segredo continua
    -- cifrado com AAD em `IntegrationConnection.credentialsEncrypted`.
    "sourceAccountId"      TEXT NOT NULL,
    "sourceAccountLabel"   TEXT,
    "connectionId"         TEXT,
    "status"               "ImportSessionStatus" NOT NULL DEFAULT 'DRAFT',
    -- Versao do preview: reanalise incrementa, nao apaga decisao.
    "previewVersion"       INTEGER NOT NULL DEFAULT 0,
    "previewGeneratedAt"   TIMESTAMP(3),
    "sourceFingerprint"    TEXT,
    -- Contagens agregadas; o detalhe por categoria vive em
    -- `ImportSessionCategory`.
    "pendingCount"         INTEGER NOT NULL DEFAULT 0,
    "importedCount"        INTEGER NOT NULL DEFAULT 0,
    "skippedCount"         INTEGER NOT NULL DEFAULT 0,
    "failedCount"          INTEGER NOT NULL DEFAULT 0,
    "needsReviewCount"     INTEGER NOT NULL DEFAULT 0,
    -- Lease da execucao, pelo relogio do banco (ver cabecalho).
    "leaseOwner"           TEXT,
    "leaseAcquiredAt"      TIMESTAMPTZ(3),
    "leaseExpiresAt"       TIMESTAMPTZ(3),
    "leaseHeartbeatAt"     TIMESTAMPTZ(3),
    "startedAt"            TIMESTAMP(3),
    "finishedAt"           TIMESTAMP(3),
    -- Conclusao unica e irreversivel do negocio.
    "completedAt"          TIMESTAMP(3),
    "completedBy"          TEXT,
    -- Aceite explicito de concluir com pendentes: autor, data e a contagem
    -- no momento da decisao.
    "pendingAcceptedAt"    TIMESTAMP(3),
    "pendingAcceptedBy"    TEXT,
    "pendingAcceptedCount" INTEGER,
    "errorCode"            TEXT,
    "errorMessage"         TEXT,
    "createdBy"            TEXT NOT NULL,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportSession_tenantId_id_key"
    ON "ImportSession"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "ImportSession_tenantId_status_createdAt_idx"
    ON "ImportSession"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ImportSession_tenantId_leaseExpiresAt_idx"
    ON "ImportSession"("tenantId", "leaseExpiresAt");
CREATE INDEX IF NOT EXISTS "ImportSession_tenantId_provider_sourceAccountId_idx"
    ON "ImportSession"("tenantId", "provider", "sourceAccountId");

-- 4.1. Conclusao unica por negocio, garantida pelo banco.
CREATE UNIQUE INDEX IF NOT EXISTS "ImportSession_one_completed_per_tenant"
    ON "ImportSession"("tenantId")
    WHERE "completedAt" IS NOT NULL;

-- 4.2. Uma sessao viva por negocio. Estados terminais (`COMPLETED`,
--      `FAILED`, `SUPERSEDED`) ficam fora do predicado: e assim que uma
--      sessao que falhou pode ser retomada ou substituida sem consumir o
--      direito de importacao.
CREATE UNIQUE INDEX IF NOT EXISTS "ImportSession_one_live_per_tenant"
    ON "ImportSession"("tenantId")
    WHERE "status" IN ('DRAFT', 'ANALYZING', 'READY', 'EXECUTING', 'PARTIAL');

-- 4.3. Contagens nunca negativas.
DO $$ BEGIN
    ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_counts_check"
        CHECK (
            "previewVersion" >= 0
            AND "pendingCount" >= 0
            AND "importedCount" >= 0
            AND "skippedCount" >= 0
            AND "failedCount" >= 0
            AND "needsReviewCount" >= 0
            AND ("pendingAcceptedCount" IS NULL OR "pendingAcceptedCount" >= 0)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4.4. O aceite de pendentes e um bloco: autor, data e contagem entram
--      juntos ou nao entram.
DO $$ BEGIN
    ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_pending_acceptance_check"
        CHECK (
            ("pendingAcceptedAt" IS NULL) = ("pendingAcceptedBy" IS NULL)
            AND ("pendingAcceptedAt" IS NULL) = ("pendingAcceptedCount" IS NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4.5. Conclusao: `status = COMPLETED` se e somente se `completedAt`
--      existe; conclusao tem autor; e conclusao COM PENDENTES exige o
--      aceite explicito registrado. Sem o aceite, o banco recusa — nao e
--      aviso de UI.
DO $$ BEGIN
    ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_completion_check"
        CHECK (
            (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL))
            AND ("completedAt" IS NULL OR "completedBy" IS NOT NULL)
            AND (
                "completedAt" IS NULL
                OR "pendingCount" = 0
                OR "pendingAcceptedAt" IS NOT NULL
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4.6. Lease coerente: dono e expiracao andam juntos, e a expiracao e
--      posterior a aquisicao.
DO $$ BEGIN
    ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_lease_check"
        CHECK (
            ("leaseOwner" IS NULL) = ("leaseExpiresAt" IS NULL)
            AND ("leaseAcquiredAt" IS NULL OR "leaseExpiresAt" IS NULL OR "leaseExpiresAt" > "leaseAcquiredAt")
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_tenantId_connectionId_fkey"
        FOREIGN KEY ("tenantId", "connectionId")
        REFERENCES "IntegrationConnection"("tenantId", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Cobertura, limitacao declarada e checkpoint por categoria.
CREATE TABLE IF NOT EXISTS "ImportSessionCategory" (
    "id"                  TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "sessionId"           TEXT NOT NULL,
    "category"            "ImportCategory" NOT NULL,
    -- `Importar tudo` e o caminho principal: nasce selecionada.
    "selected"            BOOLEAN NOT NULL DEFAULT true,
    -- Limitacao declarada: quando a origem nao fornece a categoria,
    -- `sourceSupported` e falso e o codigo da limitacao e obrigatorio.
    "sourceSupported"     BOOLEAN NOT NULL DEFAULT true,
    "limitationCode"      TEXT,
    "limitationDetail"    TEXT,
    -- Cobertura: quanto a origem declarou existir (NULL quando ela nao
    -- declara) e quanto foi efetivamente lido.
    "sourceReportedCount" INTEGER,
    "readCount"           INTEGER NOT NULL DEFAULT 0,
    "discoveredCount"     INTEGER NOT NULL DEFAULT 0,
    "pendingCount"        INTEGER NOT NULL DEFAULT 0,
    "importedCount"       INTEGER NOT NULL DEFAULT 0,
    "skippedCount"        INTEGER NOT NULL DEFAULT 0,
    "failedCount"         INTEGER NOT NULL DEFAULT 0,
    "needsReviewCount"    INTEGER NOT NULL DEFAULT 0,
    -- Checkpoint da paginacao/execucao. Nunca guarda payload cru da origem.
    "cursor"              JSONB,
    "checkpointAt"        TIMESTAMP(3),
    "previewVersion"      INTEGER NOT NULL DEFAULT 0,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportSessionCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportSessionCategory_tenantId_id_key"
    ON "ImportSessionCategory"("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "ImportSessionCategory_tenantId_sessionId_category_key"
    ON "ImportSessionCategory"("tenantId", "sessionId", "category");
CREATE INDEX IF NOT EXISTS "ImportSessionCategory_tenantId_sessionId_selected_idx"
    ON "ImportSessionCategory"("tenantId", "sessionId", "selected");

DO $$ BEGIN
    ALTER TABLE "ImportSessionCategory" ADD CONSTRAINT "ImportSessionCategory_counts_check"
        CHECK (
            "previewVersion" >= 0
            AND "readCount" >= 0
            AND "discoveredCount" >= 0
            AND "pendingCount" >= 0
            AND "importedCount" >= 0
            AND "skippedCount" >= 0
            AND "failedCount" >= 0
            AND "needsReviewCount" >= 0
            AND ("sourceReportedCount" IS NULL OR "sourceReportedCount" >= 0)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ImportSessionCategory" ADD CONSTRAINT "ImportSessionCategory_limitation_check"
        CHECK ("sourceSupported" OR "limitationCode" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ImportSessionCategory" ADD CONSTRAINT "ImportSessionCategory_tenantId_sessionId_fkey"
        FOREIGN KEY ("tenantId", "sessionId")
        REFERENCES "ImportSession"("tenantId", "id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Item: um registro analisado da origem.
CREATE TABLE IF NOT EXISTS "ImportItem" (
    "id"                      TEXT NOT NULL,
    "tenantId"                TEXT NOT NULL,
    "sessionId"               TEXT NOT NULL,
    "category"                "ImportCategory" NOT NULL,
    "externalId"              TEXT NOT NULL,
    "label"                   TEXT,
    "status"                  "ImportItemStatus" NOT NULL DEFAULT 'PENDING',
    -- Motivo sanitizado. Nunca segredo, credencial ou payload cru.
    "reasonCode"              TEXT,
    "reasonDetail"            TEXT,
    -- Referencia ao registro criado na Atendly, quando houver.
    "entityType"              "ExternalEntityType",
    "internalId"              TEXT,
    "fingerprint"             TEXT,
    "firstSeenPreviewVersion" INTEGER NOT NULL DEFAULT 0,
    "lastSeenPreviewVersion"  INTEGER NOT NULL DEFAULT 0,
    "disappearedAt"           TIMESTAMP(3),
    "attemptCount"            INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt"           TIMESTAMP(3),
    "processedAt"             TIMESTAMP(3),
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportItem_tenantId_id_key"
    ON "ImportItem"("tenantId", "id");
-- Identidade do item DENTRO da sessao (ver cabecalho): e o que permite a
-- reanalise reconciliar decisoes por identificador de origem. NAO e uma
-- segunda chave de idempotencia — essa continua em `ExternalEntityMap`.
CREATE UNIQUE INDEX IF NOT EXISTS "ImportItem_tenantId_sessionId_category_externalId_key"
    ON "ImportItem"("tenantId", "sessionId", "category", "externalId");
CREATE INDEX IF NOT EXISTS "ImportItem_tenantId_sessionId_status_idx"
    ON "ImportItem"("tenantId", "sessionId", "status");
CREATE INDEX IF NOT EXISTS "ImportItem_tenantId_sessionId_category_status_idx"
    ON "ImportItem"("tenantId", "sessionId", "category", "status");

-- 6.1. Estado do item em conjunto fechado, explicito em SQL alem do enum.
DO $$ BEGIN
    ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_status_check"
        CHECK ("status" IN ('PENDING', 'IMPORTED', 'SKIPPED', 'FAILED', 'NEEDS_REVIEW'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6.2. Coerencia do estado: `IMPORTED` aponta para o registro criado;
--      `PENDING` nao aponta para nada; todo estado que nao importou tem
--      motivo; e nao existe referencia interna sem tipo de entidade.
DO $$ BEGIN
    ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_status_consistency_check"
        CHECK (
            ("status" <> 'IMPORTED' OR ("internalId" IS NOT NULL AND "entityType" IS NOT NULL))
            AND ("status" <> 'PENDING' OR "internalId" IS NULL)
            AND ("status" NOT IN ('SKIPPED', 'FAILED', 'NEEDS_REVIEW') OR "reasonCode" IS NOT NULL)
            AND ("internalId" IS NULL OR "entityType" IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_counts_check"
        CHECK (
            "attemptCount" >= 0
            AND "firstSeenPreviewVersion" >= 0
            AND "lastSeenPreviewVersion" >= "firstSeenPreviewVersion"
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_tenantId_sessionId_fkey"
        FOREIGN KEY ("tenantId", "sessionId")
        REFERENCES "ImportSession"("tenantId", "id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. Decisao do usuario, por item ou por categoria, com autor e data.
--    Append-only: reanalise nunca apaga decisao.
CREATE TABLE IF NOT EXISTS "ImportDecision" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "sessionId"        TEXT NOT NULL,
    "scope"            "ImportDecisionScope" NOT NULL,
    "decision"         "ImportDecisionKind" NOT NULL,
    "category"         "ImportCategory",
    "itemId"           TEXT,
    -- Identificador de origem guardado junto com `itemId`: e por ele que a
    -- reconciliacao apos reanalise reencontra a decisao.
    "externalId"       TEXT,
    "previewVersion"   INTEGER NOT NULL DEFAULT 0,
    "targetInternalId" TEXT,
    "noteCode"         TEXT,
    "decidedBy"        TEXT NOT NULL,
    "decidedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportDecision_tenantId_id_key"
    ON "ImportDecision"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "ImportDecision_tenantId_sessionId_decidedAt_idx"
    ON "ImportDecision"("tenantId", "sessionId", "decidedAt");
-- Nome explicito e curto: o nome derivado das cinco colunas passaria dos 63
-- caracteres do Postgres e seria truncado, divergindo do que o Prisma
-- geraria. O `@@index` correspondente usa o mesmo `map`.
CREATE INDEX IF NOT EXISTS "ImportDecision_tenantId_sessionId_target_idx"
    ON "ImportDecision"("tenantId", "sessionId", "category", "externalId", "decidedAt");
CREATE INDEX IF NOT EXISTS "ImportDecision_tenantId_itemId_decidedAt_idx"
    ON "ImportDecision"("tenantId", "itemId", "decidedAt");

DO $$ BEGIN
    ALTER TABLE "ImportDecision" ADD CONSTRAINT "ImportDecision_scope_check"
        CHECK (
            "previewVersion" >= 0
            AND ("scope" <> 'ITEM' OR ("itemId" IS NOT NULL AND "category" IS NOT NULL))
            AND ("scope" <> 'CATEGORY' OR ("category" IS NOT NULL AND "itemId" IS NULL))
            AND ("scope" <> 'SESSION' OR ("category" IS NULL AND "itemId" IS NULL))
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Semelhanca sugere, nunca funde sozinha: resolver divergencia e sempre
-- decisao de ITEM, e mesclar exige dizer com QUAL registro existente.
DO $$ BEGIN
    ALTER TABLE "ImportDecision" ADD CONSTRAINT "ImportDecision_kind_check"
        CHECK (
            ("decision" NOT IN ('MERGE_WITH_EXISTING', 'CREATE_NEW', 'KEEP_EXISTING') OR "scope" = 'ITEM')
            AND ("decision" NOT IN ('IMPORT_ALL', 'ACCEPT_PENDING_COMPLETION') OR "scope" = 'SESSION')
            AND ("decision" <> 'MERGE_WITH_EXISTING' OR "targetInternalId" IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ImportDecision" ADD CONSTRAINT "ImportDecision_tenantId_sessionId_fkey"
        FOREIGN KEY ("tenantId", "sessionId")
        REFERENCES "ImportSession"("tenantId", "id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ImportDecision" ADD CONSTRAINT "ImportDecision_tenantId_itemId_fkey"
        FOREIGN KEY ("tenantId", "itemId")
        REFERENCES "ImportItem"("tenantId", "id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. Classificacao do `MigrationJob` legado (U-02), sem tocar nenhuma linha.
--
--    O default e `UNCLASSIFIED`: toda linha que ja existia continua com o
--    `status`, o `summary`, as datas e os conflitos que tinha, e nasce
--    explicitamente NAO classificada. Classificar um job como
--    `TECHNICAL_COMPLETED` nao e a conclusao de importacao do usuario e nao
--    consome o direito do negocio — o direito e consumido apenas por uma
--    `ImportSession` com `completedAt`, e isso e estrutural: as duas
--    tabelas nao se comunicam, entao nenhum job legado pode habilitar nem
--    consumir uma importacao por default.
ALTER TABLE "MigrationJob"
    ADD COLUMN IF NOT EXISTS "legacyClass"        "LegacyMigrationJobClass" NOT NULL DEFAULT 'UNCLASSIFIED',
    ADD COLUMN IF NOT EXISTS "legacyClassifiedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "legacyClassifiedBy" TEXT,
    ADD COLUMN IF NOT EXISTS "legacyReviewReason" TEXT;

CREATE INDEX IF NOT EXISTS "MigrationJob_tenantId_legacyClass_idx"
    ON "MigrationJob"("tenantId", "legacyClass");
