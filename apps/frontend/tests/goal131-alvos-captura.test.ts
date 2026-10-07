/**
 * Goal131/WU-03 — os alvos 2.I2 e 2.I3 do `visual:compare`: a resposta fixa do
 * 2.I3 é válida para o contrato real (a captura não pode provar uma tela com um
 * corpo que o BFF nunca responderia), é uma análise em curso sem nenhuma
 * categoria, e nenhum dos dois alvos envia o formulário ou escreve no BFF.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findPublicApiRoute,
  importStateSchema,
} from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

import { ONBOARDING_ROUTES } from "../e2e/routes";

type Step = {
  clickRole?: { role: string; name: string };
  fill?: { label: string; value: string };
  press?: string;
  click?: string;
  optional?: boolean;
};

type Target = {
  code: string;
  file: string;
  label?: string;
  route: string;
  account?: string;
  notes?: string;
  responses?: Array<{ method: string; path: string; json: { data: unknown } }>;
  steps?: Step[];
};

const FILE = "Onboarding-2-Importacao.dc.html";

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

function body(): unknown {
  const [entry] = target("2.I3").responses ?? [];
  return JSON.parse(JSON.stringify(entry?.json.data)) as unknown;
}

describe("alvo 2.I2 do visual:compare", () => {
  test("usa a rota do onboarding, na conta de onboarding, sem responses", () => {
    const t = target("2.I2");
    expect(t.label).toBe("Credenciais Minha Agenda");
    expect(t.route).toBe("/onboarding/importacao");
    expect(t.account).toBe("onboarding");
    expect(t.responses).toBeUndefined();
  });

  test("tem só os três passos: clickRole em Continuar e fill nos dois campos", () => {
    const steps = target("2.I2").steps ?? [];
    expect(steps).toHaveLength(3);
    expect(steps[0]?.clickRole).toEqual({ role: "button", name: "Continuar" });
    expect(steps[1]?.fill?.label).toBe("E-mail do Minha Agenda");
    expect(steps[2]?.fill?.label).toBe("Senha");
    expect(steps[2]?.fill?.value).toHaveLength(8);
    for (const step of steps) {
      expect(step.press).toBeUndefined();
      expect(step.click).toBeUndefined();
      expect(step.optional).not.toBe(true);
    }
  });

  test("nenhum passo envia o formulário", () => {
    const touched = JSON.stringify(target("2.I2").steps);
    expect(touched).not.toMatch(/Analisar meus dados|Conectar|Enter/);
  });

  test("as notes declaram o teclado, a segunda frase da descrição e o Goal131", () => {
    const notes = target("2.I2").notes ?? "";
    expect(notes).toContain("Goal131");
    expect(notes).toContain("teclado");
    expect(notes).toContain("Ele não fica guardado.");
    expect(notes).toContain("D-104");
  });
});

describe("alvo 2.I3 do visual:compare", () => {
  test("usa a mesma rota do 2.I2, na conta de onboarding, sem passos", () => {
    const t = target("2.I3");
    expect(t.label).toBe("Analisando dados");
    expect(t.route).toBe("/onboarding/importacao");
    expect(t.route).toBe(target("2.I2").route);
    expect(t.account).toBe("onboarding");
    expect(t.steps).toBeUndefined();
  });

  test("declara só o GET /v1/calendar/imports, e ele é válido para o schema da rota", () => {
    const { responses } = target("2.I3");
    expect(responses).toHaveLength(1);
    const [entry] = responses ?? [];
    expect(entry?.method).toBe("GET");
    expect(entry?.path).toBe("/v1/calendar/imports");
    const contract = findPublicApiRoute("GET", entry?.path ?? "");
    expect(
      contract,
      "/v1/calendar/imports precisa ser rota do contrato",
    ).toBeDefined();
    const parsed = contract?.schema.safeParse(body());
    expect(parsed?.success, JSON.stringify(parsed)).toBe(true);
  });

  test("a resposta é válida para importStateSchema", () => {
    const parsed = importStateSchema.safeParse(body());
    expect(parsed.success, JSON.stringify(parsed)).toBe(true);
  });

  test("a sessão está ANALYZING, sem interrupção, sem erro, sem histórico e sem categoria", () => {
    const state = importStateSchema.parse(body());
    expect(state.session?.status).toBe("ANALYZING");
    expect(state.session?.interrupted).toBe(false);
    expect(state.session?.lastError).toBeNull();
    expect(state.session?.previewVersion).toBe(0);
    expect(state.session?.categories).toEqual([]);
    expect(state.history).toBeNull();
    expect(state.right.available).toBe(true);
  });

  test("o sessionId é próprio do 2.I3, diferente do que o I1 usa", () => {
    const state = importStateSchema.parse(body());
    expect(state.session?.sessionId).toBe("visual-compare-import-analyzing");
    expect(state.right.sessionId).toBe("visual-compare-import-analyzing");
    const i1 = targets.find((item) => item.code === "I1");
    expect(JSON.stringify(i1?.responses)).not.toContain(
      "visual-compare-import-analyzing",
    );
  });

  test("as notes declaram as contagens ausentes, a barra indeterminada e o Goal131", () => {
    const notes = target("2.I3").notes ?? "";
    expect(notes).toContain("Goal131");
    expect(notes).toContain("recordAnalysis");
    expect(notes).toContain("indeterminada");
    expect(notes).toContain("D-104");
  });
});

describe("os outros alvos e o gate", () => {
  test("2.I1 continua sem responses e sem passos", () => {
    expect(target("2.I1").responses).toBeUndefined();
    expect(target("2.I1").steps).toBeUndefined();
  });

  test("/onboarding/importacao segue em ONBOARDING_ROUTES, na origem", () => {
    const route = ONBOARDING_ROUTES.find(
      (candidate) => (candidate.path as string) === "/onboarding/importacao",
    );
    expect(route?.contentMarker).toBe("De onde vamos trazer seus dados?");
  });
});
