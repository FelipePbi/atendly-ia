-- Goal025 - estado duravel da exclusao de conta, uma linha por negocio (WU-01).
--
-- Aditiva e RETOMAVEL: enum, tabela e indices usam guarda de idempotencia
-- (pg_type / IF NOT EXISTS), entao reaplicar esta migration sobre um banco ja
-- migrado nao falha e uma aplicacao interrompida no meio termina na retomada.
-- Nenhuma coluna existente e alterada ou removida e nenhuma linha e fabricada
-- aqui — a tabela nasce vazia.
--
-- SEM CONSTRAINT DE CHAVE ESTRANGEIRA para "Tenant" nem "User", de proposito:
-- esta linha e a prova de que a exclusao aconteceu e precisa sobreviver a
-- purga dos dois (o Goal apaga o Tenant e, por ultimo, o User). FK com
-- CASCADE apagaria a prova junto com o dono; FK sem cascade bloquearia a
-- propria purga. "tenantId" e "requestedByUserId" sao so os IDs.
--
-- LEASE PELO RELOGIO DO BANCO, como no Goal023: "leaseAcquiredAt" e
-- "leaseExpiresAt" sao TIMESTAMPTZ, sempre comparadas contra now() do
-- servidor. "leaseToken" e o fencing da purga.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountDeletionStatus') THEN
        CREATE TYPE "AccountDeletionStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'PURGED');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AccountDeletion" (
    "tenantId"          TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status"            "AccountDeletionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "requestedAt"       TIMESTAMPTZ(3) NOT NULL,
    "dueAt"             TIMESTAMPTZ(3) NOT NULL,
    "cancelledAt"       TIMESTAMPTZ(3),
    "purgedAt"          TIMESTAMPTZ(3),
    "leaseOwner"        TEXT,
    "leaseToken"        TEXT,
    "leaseAcquiredAt"   TIMESTAMPTZ(3),
    "leaseExpiresAt"    TIMESTAMPTZ(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletion_pkey" PRIMARY KEY ("tenantId")
);

-- A leitura do laco de purga: quem venceu e ainda esta SCHEDULED.
CREATE INDEX IF NOT EXISTS "AccountDeletion_status_dueAt_idx"
    ON "AccountDeletion"("status", "dueAt");

CREATE INDEX IF NOT EXISTS "AccountDeletion_leaseExpiresAt_idx"
    ON "AccountDeletion"("leaseExpiresAt");
