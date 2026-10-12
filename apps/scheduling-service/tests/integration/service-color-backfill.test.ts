/**
 * Backfill único da cor do serviço (decisão de 2026-10-12): a migration
 * `20261012120000_service_color_backfill` preenche só `colorToken` nulo, com
 * cor da paleta e, por negócio, sem repetir enquanto houver cor livre. É
 * idempotente: rodar de novo não muda nada.
 */
import { readFileSync } from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { resetTenant } from "./support/reset-tenant.js";

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const backfillSql = readFileSync(
  new URL(
    "../../prisma/migrations/20261012120000_service_color_backfill/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const PALETTE = ["ROSE", "AMBER", "EMERALD", "SKY", "VIOLET", "SLATE"];
const tenantA = "tenant-color-a";
const tenantB = "tenant-color-b";

let prisma: PrismaClient;

async function seed(
  tenantId: string,
  rows: Array<{ id: string; colorToken: string | null }>,
) {
  for (const [index, row] of rows.entries()) {
    await prisma.service.create({
      data: {
        id: row.id,
        tenantId,
        name: row.id,
        durationMinutes: 30,
        priceType: "ON_REQUEST",
        colorToken: row.colorToken as never,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      },
    });
  }
}

async function colorsOf(tenantId: string) {
  const rows = await prisma.service.findMany({
    where: { tenantId },
    orderBy: { id: "asc" },
    select: { id: true, colorToken: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row.colorToken]));
}

describeWithDatabase("service color backfill against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
  });

  it("preenche só os nulos, com cores livres do negócio, e é idempotente", async () => {
    await seed(tenantA, [
      { id: "a-1-rose", colorToken: "ROSE" },
      { id: "a-2-amber", colorToken: "AMBER" },
      { id: "a-3-null", colorToken: null },
      { id: "a-4-null", colorToken: null },
      { id: "a-5-null", colorToken: null },
    ]);
    // Outro negócio sem nenhuma cor: recebe cores distintas, sem herdar o
    // uso do primeiro.
    await seed(tenantB, [
      { id: "b-1-null", colorToken: null },
      { id: "b-2-null", colorToken: null },
    ]);

    await prisma.$executeRawUnsafe(backfillSql);

    const a = await colorsOf(tenantA);
    expect(a["a-1-rose"]).toBe("ROSE");
    expect(a["a-2-amber"]).toBe("AMBER");
    const filledA = [a["a-3-null"], a["a-4-null"], a["a-5-null"]];
    for (const color of filledA) {
      expect(PALETTE).toContain(color);
      expect(["ROSE", "AMBER"]).not.toContain(color);
    }
    expect(new Set(filledA).size).toBe(3);

    const b = await colorsOf(tenantB);
    expect(PALETTE).toContain(b["b-1-null"]);
    expect(PALETTE).toContain(b["b-2-null"]);
    expect(b["b-1-null"]).not.toBe(b["b-2-null"]);

    await prisma.$executeRawUnsafe(backfillSql);
    expect(await colorsOf(tenantA)).toEqual(a);
    expect(await colorsOf(tenantB)).toEqual(b);
  });
});
