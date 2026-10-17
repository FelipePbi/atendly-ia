-- D-181: aparencia da conta (cor de destaque e claro/escuro), por usuario.
--
-- ADITIVA: tipos e tabela novos, sem backfill. Sem linha, a conta usa o
-- padrao do produto (petroleo, claro).

CREATE TYPE "AppearanceAccent" AS ENUM ('VERDE', 'ROSE', 'CHAMPANHE', 'AZUL', 'LAVANDA', 'TERRACOTA');

CREATE TYPE "AppearanceMode" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

CREATE TABLE "AppearancePreference" (
    "userId" TEXT NOT NULL,
    "accent" "AppearanceAccent" NOT NULL DEFAULT 'VERDE',
    "mode" "AppearanceMode" NOT NULL DEFAULT 'LIGHT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppearancePreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "AppearancePreference" ADD CONSTRAINT "AppearancePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
