/**
 * Goal150/WU-02 — o alvo CL8 do `visual:compare` (Cliente · responsável): a
 * lista ao lado do perfil agora traz quem agenda por quem, como o quadro. A
 * Maria tem `dependents` Pedro Souza e o Pedro tem `guardian` Maria Souza, com
 * os tipos de `customerListItemSchema`; cada resposta fixa é válida para o
 * schema da rota no contrato, só `GET`, com `requestId`. As notes perdem a
 * divergência da lista sem responsável (Goal121).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  customerListSchema,
  findPublicApiRoute,
} from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

type FixedResponse = {
  method: string;
  path: string;
  json: { data: unknown; requestId?: string };
};

type Target = {
  code: string;
  file: string;
  route: string;
  notes?: string;
  responses?: FixedResponse[];
  steps?: unknown[];
};

const FILE = "Clientes.dc.html";
const PEDRO = "visual-compare-cl8-pedro";
const MARIA = "visual-compare-cl8-maria";

const targets = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../e2e/visual/targets.json"), "utf8"),
  ) as { targets: Target[] }
).targets;

const cl8 = (() => {
  const found = targets.find(
    (item) => item.code === "CL8" && item.file === FILE,
  );
  if (!found) throw new Error("alvo CL8 ausente");
  return found;
})();

function bodyOf(path: string): unknown {
  const entry = cl8.responses?.find((item) => item.path === path);
  if (!entry) throw new Error(`CL8 sem resposta de ${path}`);
  return JSON.parse(JSON.stringify(entry.json.data));
}

function list() {
  return customerListSchema.parse(bodyOf("/v1/customers")).items;
}

describe("alvo CL8 do visual:compare (lista com quem agenda por quem)", () => {
  test("declara só GET, com requestId, e nenhum passo", () => {
    expect(cl8.steps).toBeUndefined();
    expect(cl8.responses?.length).toBeGreaterThan(0);
    for (const item of cl8.responses ?? []) {
      expect(item.method, item.path).toBe("GET");
      expect(typeof item.json.requestId, item.path).toBe("string");
    }
  });

  test("cada caminho é rota do contrato e cada corpo é válido para o schema da rota", () => {
    for (const item of cl8.responses ?? []) {
      // O contrato declara o padrão (`:id`); o alvo traz o id fixo do quadro.
      const pattern = item.path.startsWith("/v1/customers/")
        ? item.path.endsWith("/memory")
          ? "/v1/customers/:id/memory"
          : "/v1/customers/:id"
        : item.path;
      const contract = findPublicApiRoute("GET", pattern);
      expect(contract, `${pattern} precisa ser rota do contrato`).toBeDefined();
      const parsed = contract?.schema.safeParse(bodyOf(item.path));
      expect(parsed?.success, `${item.path}: ${JSON.stringify(parsed)}`).toBe(
        true,
      );
    }
  });

  test("a Maria tem dependents Pedro Souza e o Pedro, sem telefone, tem guardian Maria Souza", () => {
    const items = list();
    expect(items.map((item) => item.name)).toEqual(["Pedro Souza", "Maria Souza"]);
    const maria = items.find((item) => item.id === MARIA);
    const pedro = items.find((item) => item.id === PEDRO);
    expect(maria?.dependents).toEqual([{ id: PEDRO, name: "Pedro Souza" }]);
    expect(maria?.guardian).toBeUndefined();
    expect(pedro?.phone).toBeNull();
    expect(pedro?.guardian).toEqual({ id: MARIA, name: "Maria Souza" });
    expect(pedro?.dependents).toBeUndefined();
  });

  test("o guardian da lista é o responsável do perfil", () => {
    const detail = bodyOf(`/v1/customers/${PEDRO}`) as {
      primaryGuardian: { guardian: { id: string; name: string } };
    };
    expect(list().find((item) => item.id === PEDRO)?.guardian).toEqual({
      id: detail.primaryGuardian.guardian.id,
      name: detail.primaryGuardian.guardian.name,
    });
  });

  test("as notes perdem a divergência 5 (Goal121) e dizem que a lista traz quem agenda por quem", () => {
    const notes = cl8.notes ?? "";
    expect(notes).not.toContain("(Goal121)");
    expect(notes).not.toContain("a lista não traz de quem o cliente é responsável");
    expect(notes).not.toContain("(10)");
    for (const part of ["Goal150", "dependents", "guardian", "Pedro Souza"]) {
      expect(notes, part).toContain(part);
    }
  });
});
