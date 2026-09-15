-- Goal023 - estado da varredura de purga, por negocio (WU-05, G-29).
--
-- Aditiva e RETOMAVEL: toda forma usa IF NOT EXISTS (tabela, indices e
-- constraint de chave estrangeira), entao reaplicar esta migration sobre um
-- banco ja migrado nao falha e uma aplicacao interrompida no meio termina na
-- retomada — a divergencia que o review022 registrou. Nenhum UPDATE em linha
-- existente e nenhuma linha e fabricada para negocio nenhum: a tabela nasce
-- vazia e "sem linha" vale como "nunca varrido", resolvido no laco.
--
-- LEASE PELO RELOGIO DO BANCO (licao do Goal021): `leaseAcquiredAt`,
-- `leaseExpiresAt` e `lastRunAt` sao TIMESTAMPTZ, nao TIMESTAMP, porque toda
-- comparacao e contra `now()` do servidor. `leaseToken` e o fencing: a
-- liquidacao carrega o token e so vale para quem ainda o segura, entao um
-- lease vencido e reivindicado por outra instancia nao e liquidado pelo dono
-- anterior quando ele acorda.
--
-- Nada aqui altera tabela existente. Desligado o laco, esta tabela fica parada
-- e nenhuma leitura do produto a consulta.

CREATE TABLE IF NOT EXISTS "RetentionSweepState" (
    "tenantId"             TEXT NOT NULL,
    "leaseOwner"           TEXT,
    "leaseToken"           TEXT,
    "leaseAcquiredAt"      TIMESTAMPTZ(3),
    "leaseExpiresAt"       TIMESTAMPTZ(3),
    -- Ultima passada terminada. Nulo ate a primeira; e a ordem da fila, e e
    -- ela que o piso por negocio compara contra now().
    "lastRunAt"            TIMESTAMPTZ(3),
    -- Ultima passada terminada **sem nenhuma fonte falhando**. E este o
    -- instante que o contrato publico chama de "ultima varredura concluida":
    -- uma passada que degradou com a IA fora do ar terminou, mas nao concluiu,
    -- e anuncia-la como conclusao diria que expirou o que nao expirou.
    "lastCompletedAt"      TIMESTAMPTZ(3),
    -- Nomes das fontes que falharam, separados por virgula. Nunca mensagem
    -- crua de upstream, nunca conteudo purgado.
    "lastError"            TEXT,
    "lastAiRows"           INTEGER NOT NULL DEFAULT 0,
    "lastSchedulingRows"   INTEGER NOT NULL DEFAULT 0,
    "lastNotificationRows" INTEGER NOT NULL DEFAULT 0,
    "lastHasMore"          BOOLEAN NOT NULL DEFAULT false,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionSweepState_pkey" PRIMARY KEY ("tenantId")
);

CREATE INDEX IF NOT EXISTS "RetentionSweepState_leaseExpiresAt_idx"
    ON "RetentionSweepState"("leaseExpiresAt");

CREATE INDEX IF NOT EXISTS "RetentionSweepState_lastRunAt_idx"
    ON "RetentionSweepState"("lastRunAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RetentionSweepState_tenantId_fkey'
    ) THEN
        ALTER TABLE "RetentionSweepState"
            ADD CONSTRAINT "RetentionSweepState_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Retomada de um banco onde a versao anterior desta migration ja criou a
-- tabela sem a coluna: aditivo e idempotente, como o resto do arquivo.
ALTER TABLE "RetentionSweepState"
    ADD COLUMN IF NOT EXISTS "lastCompletedAt" TIMESTAMPTZ(3);
