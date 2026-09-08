import "dotenv/config";

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://user:password@localhost:5432/atendly_ai_orchestrator",
    // Banco de sombra usado apenas por `prisma migrate diff --from-migrations`,
    // para conferir que schema e migrations não divergiram. Sem a variável, o
    // comando falha explicitamente em vez de escolher um banco por conta.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
