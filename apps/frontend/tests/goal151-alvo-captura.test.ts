/**
 * Goal151/WU-03 — o alvo S9 do `visual:compare` (Serviço · descartar
 * alterações): a guarda "Salvar antes de sair?" do quadro. A rota é literal
 * (`/servicos/editar?id=visual-compare-s9`), as respostas fixas são só `GET`
 * (a conta de teste não tem o "Corte feminino" de 45 min e R$ 90 com `SKY`),
 * cada uma válida para o schema da rota no contrato, e os passos levam a
 * duração a 50 min e o preço a R$ 95, clicam no "x" da barra e esperam o
 * título do quadro. Nenhum passo grava.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findPublicApiRoute,
  serviceListSchema,
} from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

type FixedResponse = {
  method: string;
  path: string;
  json: { data: unknown; requestId?: string };
};

type Step = {
  clickRole?: { name: string; role: string };
  press?: string;
  waitFor?: string;
};

type Target = {
  code: string;
  file: string;
  label: string;
  route: string;
  notes?: string;
  responses?: FixedResponse[];
  steps?: Step[];
};

const FILE = "Servicos.dc.html";
const ID = "visual-compare-s9";

const targets = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../e2e/visual/targets.json"), "utf8"),
  ) as { targets: Target[] }
).targets;

const s9 = (() => {
  const found = targets.find((item) => item.code === "S9" && item.file === FILE);
  if (!found) throw new Error("alvo S9 ausente");
  return found;
})();

function bodyOf(path: string): unknown {
  const entry = s9.responses?.find((item) => item.path === path);
  if (!entry) throw new Error(`S9 sem resposta de ${path}`);
  return JSON.parse(JSON.stringify(entry.json.data));
}

describe("alvo S9 do visual:compare (guarda de saída do serviço)", () => {
  test("o S9 é novo: rota literal com o id fixo, label do quadro e único", () => {
    expect(s9.route).toBe(`/servicos/editar?id=${ID}`);
    expect(s9.label).toBe("Serviço · descartar alterações");
    expect(targets.filter((item) => item.code === "S9")).toHaveLength(1);
  });

  test("declara só GET, com requestId, e nenhum status de erro", () => {
    expect(s9.responses?.map((item) => `${item.method} ${item.path}`)).toEqual([
      "GET /v1/status",
      "GET /v1/services",
      `GET /v1/services/${ID}/ai-instruction`,
    ]);
    for (const item of s9.responses ?? []) {
      expect(item.method, item.path).toBe("GET");
      expect(typeof item.json.requestId, item.path).toBe("string");
      expect(item, item.path).not.toHaveProperty("status");
    }
  });

  test("cada caminho é rota do contrato e cada corpo é válido para o schema da rota", () => {
    for (const item of s9.responses ?? []) {
      // O contrato declara o padrão (`:id`); o alvo traz o id fixo do quadro.
      const pattern = item.path.endsWith("/ai-instruction")
        ? "/v1/services/:id/ai-instruction"
        : item.path;
      const contract = findPublicApiRoute("GET", pattern);
      expect(contract, `${pattern} precisa ser rota do contrato`).toBeDefined();
      const parsed = contract?.schema.safeParse(bodyOf(item.path));
      expect(parsed?.success, `${item.path}: ${JSON.stringify(parsed)}`).toBe(
        true,
      );
    }
  });

  test("a lista traz o Corte feminino de 45 min, R$ 90 e SKY no id da rota, editável", () => {
    const catalogue = serviceListSchema.parse(bodyOf("/v1/services"));
    expect(catalogue.editable).toBe(true);
    const corte = catalogue.items.find((item) => item.id === ID);
    expect(corte).toMatchObject({
      name: "Corte feminino",
      durationMinutes: 45,
      priceType: "FIXED",
      price: 90,
      colorToken: "SKY",
      active: true,
      needsReview: false,
    });
    expect(new Set(catalogue.items.map((item) => item.id)).size).toBe(
      catalogue.items.length,
    );
  });

  test("a instrução da IA vem vazia e o status é conectado", () => {
    expect(bodyOf(`/v1/services/${ID}/ai-instruction`)).toEqual({
      content: "",
    });
    const status = bodyOf("/v1/status") as {
      whatsapp: { status: string };
    };
    expect(status.whatsapp.status).toBe("CONNECTED");
  });

  test("os passos levam a duração a 50 min e o preço a R$ 95, clicam no x e esperam o título do quadro", () => {
    const steps = s9.steps ?? [];
    expect(steps[0]).toEqual({
      clickRole: { name: "Aumentar duração", role: "button" },
    });
    expect(steps[1]).toEqual({
      clickRole: { name: "Preço", role: "textbox" },
    });
    expect(steps.filter((step) => step.press).map((step) => step.press)).toEqual(
      ["Control+A", "9", "5"],
    );
    expect(steps[steps.length - 2]).toEqual({
      clickRole: { name: "Voltar para serviços", role: "link" },
    });
    expect(steps[steps.length - 1]).toEqual({
      waitFor: "Salvar antes de sair?",
    });
  });

  test("nenhum passo grava nem decide a guarda", () => {
    const names = (s9.steps ?? []).map((step) => step.clickRole?.name);
    for (const forbidden of [
      "Salvar alterações",
      "Descartar",
      "Continuar editando",
      "Salvar serviço",
    ]) {
      expect(names, forbidden).not.toContain(forbidden);
    }
  });

  test("as notes citam o Goal151 e as divergências visíveis", () => {
    const notes = s9.notes ?? "";
    for (const part of [
      "Goal151",
      "três cartões",
      "do Corte feminino",
      "iPhone",
    ]) {
      expect(notes, part).toContain(part);
    }
  });
});
