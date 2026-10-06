/**
 * Goal127/WU-03 — as respostas fixas do alvo 4.9 do `visual:compare` são
 * válidas para o contrato real: a captura não pode provar uma tela com um
 * corpo que o BFF nunca responderia.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findPublicApiRoute } from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

type Target = {
  code: string;
  file: string;
  responses?: Array<{ method: string; path: string; json: { data: unknown } }>;
  steps?: unknown[];
};

const targets = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../e2e/visual/targets.json"), "utf8"),
  ) as { targets: Target[] }
).targets;

function target(code: string): Target {
  const found = targets.find(
    (item) =>
      item.code === code && item.file === "Onboarding-3-IA-e-WhatsApp.dc.html",
  );
  if (!found) throw new Error(`alvo ${code} ausente`);
  return found;
}

describe("alvo 4.9 do visual:compare", () => {
  test("cada resposta fixa é válida para o schema da rota", () => {
    const { responses } = target("4.9");
    expect(responses).toHaveLength(2);
    for (const entry of responses ?? []) {
      const route = findPublicApiRoute("GET", entry.path);
      expect(route, `${entry.path} precisa ser rota do contrato`).toBeDefined();
      const data: unknown = JSON.parse(
        JSON.stringify(entry.json.data).replaceAll("{today}", "2026-10-06"),
      );
      const parsed = route?.schema.safeParse(data);
      expect(parsed?.success, `${entry.path}: ${JSON.stringify(parsed)}`).toBe(
        true,
      );
    }
  });

  test("a execução é SUCCEEDED, terminal, com os seis marcos alcançados e a limpeza CLEAN", () => {
    const run = target("4.9").responses?.find(
      (entry) => entry.path === "/v1/activation-test",
    )?.json.data as {
      state: string;
      terminal: boolean;
      cleanupState: string;
      milestones: Array<{ reached: boolean }>;
    };
    expect(run.state).toBe("SUCCEEDED");
    expect(run.terminal).toBe(true);
    expect(run.cleanupState).toBe("CLEAN");
    expect(run.milestones).toHaveLength(6);
    expect(run.milestones.every((milestone) => milestone.reached)).toBe(true);
  });

  test("o 4.10 não declara responses nem passos, e o 4.9 não declara passos", () => {
    expect(target("4.10").responses).toBeUndefined();
    expect(target("4.10").steps).toBeUndefined();
    expect(target("4.9").steps).toBeUndefined();
  });
});
