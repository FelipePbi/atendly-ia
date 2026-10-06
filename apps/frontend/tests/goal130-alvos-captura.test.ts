/**
 * Goal130/WU-02 — os alvos 2.6 e 2.7 do `visual:compare`: a resposta fixa do
 * 2.6 é válida para o contrato real (a captura não pode provar uma tela com um
 * corpo que o BFF nunca responderia), tem o mesmo intervalo em todos os dias, e
 * nenhum dos dois alvos toca controle que grava.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findPublicApiRoute } from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

import { ONBOARDING_ROUTES } from "../e2e/routes";

type Target = {
  code: string;
  file: string;
  label?: string;
  route: string;
  account?: string;
  notes?: string;
  responses?: Array<{ method: string; path: string; json: { data: unknown } }>;
  steps?: unknown[];
};

type Rule = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
};

type OnboardingBody = {
  availability: { rules: Rule[] } | null;
  completed: boolean;
};

const FILE = "Onboarding-1-Negocio-e-Agenda.dc.html";

const targets = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../e2e/visual/targets.json"), "utf8"),
  ) as { targets: Target[] }
).targets;

function target(code: string): Target {
  const found = targets.find(
    (item) => item.code === code && item.file === FILE,
  );
  if (!found) throw new Error(`alvo ${code} ausente`);
  return found;
}

function body(): OnboardingBody {
  const [entry] = target("2.6").responses ?? [];
  return JSON.parse(JSON.stringify(entry?.json.data)) as OnboardingBody;
}

describe("alvo 2.6 do visual:compare", () => {
  test("a rota é a do horário-base, na conta de onboarding, sem passos", () => {
    expect(target("2.6").route).toBe("/onboarding/horarios");
    expect(target("2.6").account).toBe("onboarding");
    expect(target("2.6").steps).toBeUndefined();
  });

  test("declara só o GET /v1/onboarding, e ele é válido para o schema da rota", () => {
    const { responses } = target("2.6");
    expect(responses).toHaveLength(1);
    const [entry] = responses ?? [];
    expect(entry?.method).toBe("GET");
    expect(entry?.path).toBe("/v1/onboarding");
    const contract = findPublicApiRoute("GET", entry?.path ?? "");
    expect(contract, "/v1/onboarding precisa ser rota do contrato").toBeDefined();
    const parsed = contract?.schema.safeParse(body());
    expect(parsed?.success, JSON.stringify(parsed)).toBe(true);
  });

  test("as regras vão de segunda a sábado, todas ativas e com o mesmo intervalo das 09:00 às 18:00", () => {
    const rules = body().availability?.rules ?? [];
    expect(rules.map((rule) => rule.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rules.every((rule) => rule.active)).toBe(true);
    expect(
      new Set(rules.map((rule) => `${rule.startTime}-${rule.endTime}`)),
    ).toEqual(new Set(["09:00-18:00"]));
    expect(new Set(rules.map((rule) => rule.dayOfWeek)).size).toBe(rules.length);
  });

  test("a conta segue no meio do onboarding", () => {
    expect(body().completed).toBe(false);
  });

  test("as notes declaram a queda da divergência 8 de D-105, o Goal130 e o D-104", () => {
    const notes = target("2.6").notes ?? "";
    expect(notes).toContain("Goal130");
    expect(notes).toContain("D-104");
    expect(notes).toContain("D-105");
  });
});

describe("alvo 2.7 do visual:compare", () => {
  test("usa a rota do horário, na conta de onboarding, sem responses e sem passos", () => {
    const t27 = target("2.7");
    expect(t27.label).toBe("Horários por dia");
    expect(t27.route).toBe("/onboarding/horarios");
    expect(t27.route).toBe(target("2.6").route);
    expect(t27.account).toBe("onboarding");
    expect(t27.responses).toBeUndefined();
    expect(t27.steps).toBeUndefined();
  });

  test("as notes citam a semente e as divergências declaradas", () => {
    const notes = target("2.7").notes ?? "";
    expect(notes).toContain("AVAILABILITY");
    expect(notes).toContain("visual-seed.mjs");
    expect(notes).toContain("Goal130");
    expect(notes).toContain("D-104");
    expect(notes).toContain("#716859");
    expect(notes).toContain("chapterFraction");
  });
});

describe("os outros alvos e o gate", () => {
  test("2.3, 2.4 e 2.5 continuam sem responses e sem passos", () => {
    for (const code of ["2.3", "2.4", "2.5"]) {
      expect(target(code).responses).toBeUndefined();
      expect(target(code).steps).toBeUndefined();
    }
  });

  test("/onboarding/horarios segue em ONBOARDING_ROUTES, no horário-base", () => {
    const route = ONBOARDING_ROUTES.find(
      (candidate) => (candidate.path as string) === "/onboarding/horarios",
    );
    expect(route?.contentMarker).toBe("Qual é seu horário de atendimento?");
  });
});
