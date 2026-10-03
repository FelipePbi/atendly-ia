/**
 * Goal079/WU-04 (§6.8) — as duas etapas animadas do capítulo "Sua IA" entram
 * no gate autenticado, e a segunda conta tem serviço e horário para elas.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { onboardingScenarios } from "@/features/onboarding/scenarios";

import { ONBOARDING_ROUTES } from "../e2e/routes";

const BASELINE_PATHS = [
  "/onboarding/boas-vindas",
  "/onboarding/segmento-e-nome",
  "/onboarding/modalidade",
  "/onboarding/endereco",
  "/onboarding/sistema-atual",
  "/onboarding/quando-importar",
  "/onboarding/importacao",
  "/onboarding/servico-nome",
  "/onboarding/servicos-adicionais",
  "/onboarding/dias-de-atendimento",
  "/onboarding/horarios",
  "/onboarding/agenda-atendly-pronta",
  "/onboarding/whatsapp",
];

describe("Goal079 §6.8 — rotas do gate autenticado", () => {
  const paths = ONBOARDING_ROUTES.map((route) => route.path as string);

  test("as treze rotas da baseline continuam presentes", () => {
    for (const path of BASELINE_PATHS) expect(paths).toContain(path);
  });

  test.each([
    ["demonstracao-da-ia", "onboarding-demonstracao-da-ia"],
    ["tom-da-ia", "onboarding-tom-da-ia"],
  ] as const)("%s está em ONBOARDING_ROUTES com o título da etapa", (step, name) => {
    const route = ONBOARDING_ROUTES.find(
      (candidate) => (candidate.path as string) === `/onboarding/${step}`,
    );
    expect(route).toBeDefined();
    expect(route?.name).toBe(name);
    expect(route?.contentMarker).toBe(onboardingScenarios[step][1]);
  });

  test("todo contentMarker de rota é o título de uma etapa do onboarding", () => {
    const titles = Object.values(onboardingScenarios).map((scenario) => scenario[1]);
    for (const route of ONBOARDING_ROUTES) {
      // Goal105: importacao é medida na origem, cujo h1 vem do módulo de
      // importação; os demais marcadores seguem sendo o título da etapa.
      if ((route.path as string) === "/onboarding/importacao") {
        expect(route.contentMarker).toBe("De onde vamos trazer seus dados?");
        continue;
      }
      expect(titles).toContain(route.contentMarker);
    }
  });
});

describe("Goal079 §6.8 — segunda conta semeada", () => {
  const script = readFileSync(
    resolve(__dirname, "../../../scripts/goal033-authenticated-ui-rehearsal.mjs"),
    "utf8",
  );
  const start = script.indexOf("async function seedOnboardingAccount");
  const end = script.indexOf("/** Corpo do webhook", start);
  const body = script.slice(start, end);

  test("seedOnboardingAccount faz três PATCH /v1/onboarding e nenhum complete", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(body.match(/"PATCH", "\/v1\/onboarding"/g)).toHaveLength(3);
    expect(body).not.toContain("/complete");
    expect(body).toMatch(/service: \{/);
    expect(body).toMatch(/availability: \{/);
  });

  test("o docblock diz três PATCH e que não há POST /complete", () => {
    const docblock = script
      .slice(script.lastIndexOf("/**", start), start)
      .replace(/\s*\n\s*\*\s*/g, " ");
    expect(docblock).toContain("três `PATCH /v1/onboarding`");
    expect(docblock).toContain("Nunca chama `POST /v1/onboarding/complete`");
  });
});
