/**
 * Goal148/WU-03 — o alvo CL9 do `visual:compare` (Clientes · carregando):
 * `GET /v1/status` fixo é válido para o schema da rota no contrato, só
 * `GET /v1/customers` fica retido (`hold`, sem `json` nem `status`), nenhuma
 * entrada tem método diferente de `GET`, o passo `waitFor` espera um texto que
 * o estado de carregamento mostra e as `notes` explicam a leitura retida.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findPublicApiRoute } from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

type FixedResponse = {
  method: string;
  path: string;
  hold?: boolean;
  status?: number;
  json?: { data: unknown; requestId?: string };
};

type Target = {
  code: string;
  file: string;
  label?: string;
  route?: string;
  notes?: string;
  responses?: FixedResponse[];
  steps?: { waitFor?: string; optional?: boolean }[];
};

const targets = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../e2e/visual/targets.json"), "utf8"),
  ) as { targets: Target[] }
).targets;

const cl9 = (() => {
  const found = targets.find(
    (item) => item.code === "CL9" && item.file === "Clientes.dc.html",
  );
  if (!found) throw new Error("alvo CL9 ausente");
  return found;
})();

const loadingSource = readFileSync(
  resolve(__dirname, "../src/features/customers/CustomerList.tsx"),
  "utf8",
);

describe("alvo CL9 do visual:compare (lista de clientes carregando)", () => {
  test("é o quadro 'Clientes · carregando' da rota /clientes", () => {
    expect(cl9.label).toBe("Clientes · carregando");
    expect(cl9.route).toBe("/clientes");
  });

  test("o GET /v1/status fixo é válido para o schema da rota no contrato", () => {
    const route = findPublicApiRoute("GET", "/v1/status");
    expect(route, "/v1/status precisa ser rota do contrato").toBeDefined();
    const entry = cl9.responses?.find((item) => item.path === "/v1/status");
    expect(entry?.json, "CL9 sem resposta de /v1/status").toBeDefined();
    const parsed = route?.schema.safeParse(
      JSON.parse(JSON.stringify(entry?.json?.data)),
    );
    expect(parsed?.success, JSON.stringify(parsed)).toBe(true);
    expect(
      (entry?.json?.data as { whatsapp: { status: string } }).whatsapp.status,
    ).toBe("CONNECTED");
  });

  test("só GET /v1/customers fica retido, sem json nem status", () => {
    const held = (cl9.responses ?? []).filter((item) => item.hold === true);
    expect(held).toEqual([{ method: "GET", path: "/v1/customers", hold: true }]);
  });

  test("é o único alvo com entrada retida", () => {
    const holders = targets
      .filter((item) => (item.responses ?? []).some((r) => r.hold === true))
      .map((item) => item.code);
    expect(holders).toEqual(["CL9"]);
  });

  test("só declara GET", () => {
    expect(
      (cl9.responses ?? []).filter((item) => item.method !== "GET"),
    ).toEqual([]);
  });

  test("tem o passo waitFor obrigatório com um texto que o estado de carregamento mostra", () => {
    const waits = (cl9.steps ?? []).filter(
      (step) => typeof step.waitFor === "string" && step.waitFor.length > 0,
    );
    expect(waits).toHaveLength(1);
    expect(waits[0]?.optional).not.toBe(true);
    expect(waits[0]?.waitFor).toBe("Carregando clientes");
    expect(loadingSource).toContain("Carregando clientes");
  });

  test("as notes explicam a leitura retida e a divergência da captura", () => {
    const notes = cl9.notes ?? "";
    for (const part of ["GET /v1/status", "GET /v1/customers", "retido", "FREEZE_CSS"]) {
      expect(notes, part).toContain(part);
    }
  });
});
