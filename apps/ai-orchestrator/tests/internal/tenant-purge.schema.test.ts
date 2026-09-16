import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  TENANT_PURGE_CASCADE_ONLY,
  TENANT_PURGE_TABLES,
} from "../../src/modules/internal/tenantPurge.js";

/**
 * Goal025/WU-05 — a cobertura da purga do negocio deriva do schema, nunca de
 * uma lista escrita a mao e nunca revisada de novo.
 *
 * Nao ha tabela raiz de tenant na IA: `tenantId` esta em ~80 ocorrencias
 * espalhadas por 16 modelos. Esta suite le `prisma/schema.prisma` e prova que
 * `TENANT_PURGE_TABLES` e exatamente o conjunto de modelos com `tenantId` —
 * criar uma tabela nova com `tenantId` sem declarar a purga dela quebra este
 * arquivo, nao um code review.
 */
const schemaPath = fileURLToPath(
  new URL("../../prisma/schema.prisma", import.meta.url),
);
const schema = readFileSync(schemaPath, "utf8");

function modelBlocks(source: string): Array<{ name: string; body: string }> {
  const blocks: Array<{ name: string; body: string }> = [];
  for (const match of source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, name, body] = match;
    if (name && body !== undefined) blocks.push({ name, body });
  }
  return blocks;
}

const blocks = modelBlocks(schema);
// Toda suite depende de ter encontrado modelo: um regex quebrado por mudanca
// de formatacao do schema teria a cobertura inteira passando vazia e em
// silencio, que e exatamente o oposto do que esta suite existe para evitar.
if (blocks.length === 0) {
  throw new Error(
    "No Prisma model was parsed from schema.prisma — the coverage check would pass vacuously.",
  );
}

const modelsWithTenantId = blocks
  .filter(({ body }) => /^\s*tenantId\b/m.test(body))
  .map(({ name }) => name);

const allModelNames = blocks.map(({ name }) => name);

describe("tenant purge coverage derived from schema.prisma", () => {
  it("declares exactly the models that carry tenantId, no more and no less", () => {
    const declared = new Set<string>(TENANT_PURGE_TABLES);
    const derived = new Set(modelsWithTenantId);

    const missing = [...derived].filter((model) => !declared.has(model));
    expect(missing).toEqual([]);

    const stale = [...declared].filter((table) => !derived.has(table));
    expect(stale).toEqual([]);
  });

  it("only names tables that actually exist in the schema", () => {
    const all = new Set(allModelNames);
    const unknown = TENANT_PURGE_TABLES.filter((table) => !all.has(table));
    expect(unknown).toEqual([]);
  });

  it("covers every model without its own tenantId by a declared cascade parent", () => {
    const derived = new Set(modelsWithTenantId);
    const declared = new Set<string>(TENANT_PURGE_TABLES);
    const withoutTenantId = allModelNames.filter(
      (model) => !derived.has(model),
    );

    for (const model of withoutTenantId) {
      const parent = TENANT_PURGE_CASCADE_ONLY[model];
      expect(
        parent,
        `${model} has no tenantId and no declared cascade parent`,
      ).toBeDefined();
      expect(declared.has(parent)).toBe(true);
    }
  });

  it("does not declare the same table twice", () => {
    expect(new Set(TENANT_PURGE_TABLES).size).toBe(TENANT_PURGE_TABLES.length);
  });
});
