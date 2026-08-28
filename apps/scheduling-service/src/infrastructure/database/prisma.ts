import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../../config/env.js";
import { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";

let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!env.DATABASE_URL) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "DATABASE_URL is not configured.",
      500,
    );
  }

  prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  return prisma;
}

export async function checkDatabaseConnection(): Promise<void> {
  await getPrisma().$queryRaw`SELECT 1`;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma?.$disconnect();
  prisma = undefined;
}
