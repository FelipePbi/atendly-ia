-- Decisao de 2026-10-12: todo servico tem cor. Backfill unico dos servicos
-- ainda sem `colorToken` (antes "Sem cor definida" na legenda da Agenda).
--
-- Mesma regra de `pickServiceColor` (src/modules/services/service-color.ts):
-- por negocio, as cores da paleta menos usadas vem primeiro, em ordem
-- aleatoria; enquanto houver cor livre nenhuma se repete, e com a paleta toda
-- em uso o rodizio recomeca pelas menos usadas.
--
-- Idempotente: so toca linhas com `colorToken` nulo; rodar de novo nao muda
-- nada. Nenhum schema muda.
WITH palette AS (
    SELECT unnest(enum_range(NULL::"ServiceColorToken")) AS token
),
palette_size AS (
    SELECT count(*)::int AS n FROM palette
),
used AS (
    SELECT "tenantId", "colorToken" AS token, count(*) AS uses
    FROM "Service"
    WHERE "colorToken" IS NOT NULL
    GROUP BY "tenantId", "colorToken"
),
pending_tenants AS (
    SELECT DISTINCT "tenantId" FROM "Service" WHERE "colorToken" IS NULL
),
ranked_palette AS (
    SELECT
        t."tenantId",
        p.token,
        (row_number() OVER (
            PARTITION BY t."tenantId"
            ORDER BY COALESCE(u.uses, 0), random()
        ) - 1)::int AS slot
    FROM pending_tenants t
    CROSS JOIN palette p
    LEFT JOIN used u ON u."tenantId" = t."tenantId" AND u.token = p.token
),
pending AS (
    SELECT
        s.id,
        s."tenantId",
        ((row_number() OVER (
            PARTITION BY s."tenantId"
            ORDER BY s."createdAt", s.id
        ) - 1) % (SELECT n FROM palette_size))::int AS slot
    FROM "Service" s
    WHERE s."colorToken" IS NULL
)
UPDATE "Service" AS target
SET "colorToken" = rp.token
FROM pending pe
JOIN ranked_palette rp
    ON rp."tenantId" = pe."tenantId" AND rp.slot = pe.slot
WHERE target.id = pe.id
  AND target."colorToken" IS NULL;
