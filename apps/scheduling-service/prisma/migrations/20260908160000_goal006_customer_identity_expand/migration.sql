-- Goal006 - passo de EXPANSAO da identidade de cliente.
--
-- Aditiva e retomavel. Nenhuma linha e removida, nenhuma pessoa e fundida,
-- renomeada ou deduplicada, e nenhum ID de cliente muda. A unicidade antiga
-- `(tenantId, normalizedPhone)` continua de pe aqui de proposito: ela so cai no
-- passo seguinte, depois que todos os leitores e escritores deste repositorio
-- (Scheduling, IA, BFF, frontend) ja tratam telefone como opcional e nao
-- exclusivo.
--
-- O binario anterior continua funcionando depois desta migration enquanto nao
-- existir cliente sem telefone nem numero compartilhado.

-- 1. Telefone deixa de ser obrigatorio. `DROP NOT NULL` nao reescreve linha e
--    nao invalida nenhum valor existente.
ALTER TABLE "Customer" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "normalizedPhone" DROP NOT NULL;

-- 2. Indice NAO exclusivo para busca de candidatos por numero. Convive com a
--    unicidade antiga ate o passo de corte.
CREATE INDEX IF NOT EXISTS "Customer_tenantId_normalizedPhone_idx"
    ON "Customer"("tenantId", "normalizedPhone");

-- 3. Relacao de responsavel principal, com proveniencia e estado de
--    confirmacao. Proposta pela IA nasce PROPOSED; so vira permanente com
--    confirmacao explicita.
DO $$ BEGIN
    CREATE TYPE "CustomerRelationType" AS ENUM ('PRIMARY_GUARDIAN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "CustomerRelationStatus" AS ENUM ('PROPOSED', 'CONFIRMED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "CustomerRelationActor" AS ENUM ('AI', 'PROFESSIONAL', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CustomerRelation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "relatedCustomerId" TEXT NOT NULL,
    "type" "CustomerRelationType" NOT NULL DEFAULT 'PRIMARY_GUARDIAN',
    "status" "CustomerRelationStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedBy" "CustomerRelationActor" NOT NULL,
    "proposedByActor" TEXT,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedBy" "CustomerRelationActor",
    "confirmedByActor" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerRelation_tenantId_id_key" ON "CustomerRelation"("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerRelation_tenantId_customerId_type_key" ON "CustomerRelation"("tenantId", "customerId", "type");
CREATE INDEX IF NOT EXISTS "CustomerRelation_tenantId_relatedCustomerId_idx" ON "CustomerRelation"("tenantId", "relatedCustomerId");

-- 4. Observacoes internas e tags manuais. `aiAuthorized` nasce falso: a
--    autorizacao e atributo do registro e precisa de decisao explicita.
CREATE TABLE IF NOT EXISTS "CustomerNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "aiAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "authorizedAt" TIMESTAMP(3),
    "authorizedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerNote_tenantId_id_key" ON "CustomerNote"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "CustomerNote_tenantId_customerId_createdAt_idx" ON "CustomerNote"("tenantId", "customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerNote_tenantId_customerId_aiAuthorized_idx" ON "CustomerNote"("tenantId", "customerId", "aiAuthorized");

CREATE TABLE IF NOT EXISTS "CustomerTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "aiAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "authorizedAt" TIMESTAMP(3),
    "authorizedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerTag_tenantId_id_key" ON "CustomerTag"("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerTag_tenantId_customerId_label_key" ON "CustomerTag"("tenantId", "customerId", "label");
CREATE INDEX IF NOT EXISTS "CustomerTag_tenantId_customerId_aiAuthorized_idx" ON "CustomerTag"("tenantId", "customerId", "aiAuthorized");

-- 5. FKs compostas por tenant: nenhuma relacao atravessa negocio.
DO $$ BEGIN
    ALTER TABLE "CustomerRelation" ADD CONSTRAINT "CustomerRelation_customer_fkey"
        FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "CustomerRelation" ADD CONSTRAINT "CustomerRelation_relatedCustomer_fkey"
        FOREIGN KEY ("tenantId", "relatedCustomerId") REFERENCES "Customer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customer_fkey"
        FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_customer_fkey"
        FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
