import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type ServiceColorToken =
  | "ROSE"
  | "AMBER"
  | "EMERALD"
  | "SKY"
  | "VIOLET"
  | "SLATE";

/** Paleta de identidade visual do serviço (enum `ServiceColorToken`). */
export const SERVICE_COLOR_TOKENS: readonly ServiceColorToken[] = [
  "ROSE",
  "AMBER",
  "EMERALD",
  "SKY",
  "VIOLET",
  "SLATE",
];

/**
 * Cor aleatória para serviço criado sem escolha (decisão de 2026-10-12):
 * onboarding, importação e o backfill dos antigos sem cor. Sorteia entre as
 * cores da paleta menos usadas pelo negócio — enquanto houver cor livre, nunca
 * repete; com a paleta toda em uso, sorteia entre as que menos se repetem.
 * A migration `20261012120000_service_color_backfill` aplica a mesma regra em SQL.
 */
export function pickServiceColor(
  usedColors: ReadonlyArray<ServiceColorToken | null>,
  random: () => number = Math.random,
): ServiceColorToken {
  const usage = new Map<ServiceColorToken, number>(
    SERVICE_COLOR_TOKENS.map((token) => [token, 0]),
  );
  for (const color of usedColors) {
    if (color !== null && usage.has(color)) {
      usage.set(color, (usage.get(color) ?? 0) + 1);
    }
  }
  const least = Math.min(...usage.values());
  const candidates = SERVICE_COLOR_TOKENS.filter(
    (token) => usage.get(token) === least,
  );
  const index = Math.min(
    candidates.length - 1,
    Math.floor(random() * candidates.length),
  );
  return candidates[index];
}

/** `pickServiceColor` sobre as cores já gravadas nos serviços do negócio. */
export async function nextServiceColorForTenant(
  database: DatabaseClient,
  tenantId: string,
  random: () => number = Math.random,
): Promise<ServiceColorToken> {
  const services = await database.service.findMany({
    where: { tenantId },
    select: { colorToken: true },
  });
  return pickServiceColor(
    services.map((service) => service.colorToken),
    random,
  );
}
