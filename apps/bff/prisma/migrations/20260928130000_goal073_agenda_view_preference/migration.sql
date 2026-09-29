-- Goal073, WU-03: preferencia de visualizacao da Agenda, por negocio.
--
-- ADITIVA: tabela nova que nasce vazia, sem backfill. A ausencia de linha e
-- o default do produto (nada oculto, sem vista inicial escolhida) e continua
-- sendo lido como tal pelo BFF (`GET /v1/settings/agenda-view`) — esta
-- migration nao materializa linha nenhuma.

CREATE TYPE "AgendaInitialView" AS ENUM ('DAY', 'WEEK', 'MONTH');

CREATE TABLE "AgendaViewPreference" (
    "tenantId" TEXT NOT NULL,
    "hiddenWeekdays" INTEGER[] NOT NULL DEFAULT '{}',
    "initialView" "AgendaInitialView",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaViewPreference_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "AgendaViewPreference"
    ADD CONSTRAINT "AgendaViewPreference_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
