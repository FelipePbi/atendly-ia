import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { meaningfulText } from "../../src/modules/migrations/import-execution-service.js";

/**
 * Validacao de 2026-10-12: bloqueios importados da Minha Agenda chegavam com
 * o motivo "." e a Agenda mostrava o ponto como se fosse o motivo. Motivo sem
 * letra nem numero vira nulo na importacao e no dado ja gravado.
 */
describe("motivo de bloqueio sem conteudo", () => {
  it.each([".", " . ", "-", "...", "", "   ", null, undefined])(
    "%j vira nulo",
    (value) => {
      expect(meaningfulText(value)).toBeNull();
    },
  );

  it.each([
    ["Almoço", "Almoço"],
    ["  Dentista ", "Dentista"],
    ["A", "A"],
    ["3", "3"],
  ])("%j fica %j", (value, expected) => {
    expect(meaningfulText(value)).toBe(expected);
  });

  it("a migration limpa motivo e titulo sem letra nem numero, de forma idempotente", () => {
    const sql = readFileSync(
      path.join(
        __dirname,
        "../../prisma/migrations/20261012180000_time_block_empty_text/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain(
      `UPDATE "TimeBlock" SET "reason" = NULL\nWHERE "reason" IS NOT NULL AND "reason" !~ '[[:alnum:]]';`,
    );
    expect(sql).toContain(
      `UPDATE "TimeBlock" SET "title" = NULL\nWHERE "title" IS NOT NULL AND "title" !~ '[[:alnum:]]';`,
    );
  });
});
