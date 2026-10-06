/**
 * Goal128/WU-03 — as respostas fixas dos alvos 4.7 e 4.8 do `visual:compare`
 * são válidas para o contrato real: a captura não pode provar uma tela com um
 * corpo que o BFF nunca responderia, nem com um estado que não é o do quadro.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findPublicApiRoute } from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

type Run = {
  state: string;
  terminal: boolean;
  currentStep: string | null;
  failedStep: string | null;
  failedStepLabel: string | null;
  failureCode: string | null;
  attempts: number;
  maxAttempts: number;
  cleanupState: string;
  milestones: Array<{ milestone: string; reached: boolean }>;
};

type Target = {
  code: string;
  file: string;
  route: string;
  account?: string;
  notes?: string;
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

function run(code: string): Run {
  const entry = target(code).responses?.find(
    (response) => response.path === "/v1/activation-test",
  );
  return entry?.json.data as Run;
}

describe.each([
  ["4.7", "/onboarding/teste-real-progresso"],
  ["4.8", "/onboarding/teste-real-falha"],
])("alvo %s do visual:compare", (code, route) => {
  test("a rota é a da etapa, na conta de onboarding, sem passos", () => {
    expect(target(code).route).toBe(route);
    expect(target(code).account).toBe("onboarding");
    expect(target(code).steps).toBeUndefined();
  });

  test("declara só o GET da execução, e ele é válido para o schema da rota", () => {
    const { responses } = target(code);
    expect(responses).toHaveLength(1);
    const [entry] = responses ?? [];
    expect(entry?.method).toBe("GET");
    expect(entry?.path).toBe("/v1/activation-test");
    const route = findPublicApiRoute("GET", entry?.path ?? "");
    expect(route, "/v1/activation-test precisa ser rota do contrato").toBeDefined();
    const data: unknown = JSON.parse(
      JSON.stringify(entry?.json.data).replaceAll("{today}", "2026-10-06"),
    );
    const parsed = route?.schema.safeParse(data);
    expect(parsed?.success, JSON.stringify(parsed)).toBe(true);
  });

  test("as notes declaram as divergências do Goal128", () => {
    expect(target(code).notes).toContain("Goal128");
    expect(target(code).notes).toContain("D-104");
  });

  test("os três primeiros marcos estão alcançados e os três últimos não", () => {
    expect(run(code).milestones.map((m) => [m.milestone, m.reached])).toEqual([
      ["MESSAGE_SENT", true],
      ["SERVICE_IDENTIFIED", true],
      ["PRICE_INFORMED", true],
      ["AVAILABILITY_CHECKED", false],
      ["SLOT_SELECTED", false],
      ["APPOINTMENT_CONFIRMED", false],
    ]);
  });
});

describe("estado de cada quadro", () => {
  test("4.7 é RUNNING, não terminal, com a limpeza ainda PENDING e sem falha", () => {
    const running = run("4.7");
    expect(running.state).toBe("RUNNING");
    expect(running.terminal).toBe(false);
    expect(running.currentStep).toBe("AI_CHECKS_AVAILABILITY");
    expect(running.cleanupState).toBe("PENDING");
    expect(running.failedStep).toBeNull();
    expect(running.failureCode).toBeNull();
  });

  test("4.8 é FAILED, terminal, em AI_CHECKS_AVAILABILITY com o código fixo e a limpeza CLEAN", () => {
    const failed = run("4.8");
    expect(failed.state).toBe("FAILED");
    expect(failed.terminal).toBe(true);
    expect(failed.failedStep).toBe("AI_CHECKS_AVAILABILITY");
    expect(failed.failedStepLabel).toBeTruthy();
    expect(failed.failureCode).toBe("ACTIVATION_TEST_AI_DID_NOT_ACT");
    expect(failed.attempts).toBe(1);
    expect(failed.maxAttempts).toBe(2);
    expect(failed.cleanupState).toBe("CLEAN");
  });
});

describe("os outros alvos do onboarding", () => {
  test("4.9 continua com os dois GET, o 4.10 sem responses e sem passos, e o 4.6 sem nenhum", () => {
    expect(
      target("4.9")
        .responses?.map((entry) => `${entry.method} ${entry.path}`)
        .sort(),
    ).toEqual(["GET /v1/activation-test", "GET /v1/status"]);
    expect(target("4.10").responses).toBeUndefined();
    expect(target("4.10").steps).toBeUndefined();
    expect(target("4.6").responses).toBeUndefined();
    expect(target("4.6").steps).toBeUndefined();
  });
});
