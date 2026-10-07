/**
 * Goal147/WU-03 — o alvo CL8 do `visual:compare` com a conversa da responsável:
 * a resposta fixa de `GET /v1/conversations` é válida para o schema da rota no
 * contrato, traz uma única conversa cujo `customerId` é o da Maria
 * (`primaryGuardian.guardian.id` do perfil do Pedro), nenhuma resposta tem
 * método diferente de `GET`, o alvo continua sem passo e as `notes` explicam a
 * divergência (8) trocada.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  conversationSchema,
  customerDetailSchema,
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
  notes?: string;
  responses?: FixedResponse[];
  steps?: unknown[];
};

const FILE = "Clientes.dc.html";
const PEDRO_PATH = "/v1/customers/visual-compare-cl8-pedro";
const MARIA_ID = "visual-compare-cl8-maria";

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

describe("alvo CL8 do visual:compare (conversa da responsável)", () => {
  test("a lista de conversas é válida para o schema da rota no contrato", () => {
    const route = findPublicApiRoute("GET", "/v1/conversations");
    expect(
      route,
      "/v1/conversations precisa ser rota do contrato",
    ).toBeDefined();
    const parsed = route?.schema.safeParse(bodyOf("/v1/conversations"));
    expect(parsed?.success, JSON.stringify(parsed)).toBe(true);
  });

  test("há uma só conversa, a da Maria Souza, com o telefone do quadro", () => {
    const list = conversationSchema.array().parse(bodyOf("/v1/conversations"));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      customerId: MARIA_ID,
      customerName: "Maria Souza",
      externalContactId: "5511987651100",
    });
  });

  test("o customerId da conversa é o primaryGuardian.guardian.id do perfil do CL8", () => {
    const pedro = customerDetailSchema.parse(bodyOf(PEDRO_PATH));
    const [conversation] = conversationSchema
      .array()
      .parse(bodyOf("/v1/conversations"));
    expect(pedro.primaryGuardian?.guardian.id).toBe(MARIA_ID);
    expect(conversation?.customerId).toBe(pedro.primaryGuardian?.guardian.id);
    expect(conversation?.customerId).not.toBe(pedro.id);
  });

  test("o CL8 continua só com GET e sem passo", () => {
    expect(cl8.steps).toBeUndefined();
    expect(
      (cl8.responses ?? []).filter((item) => item.method !== "GET"),
    ).toEqual([]);
  });

  test("as notes trocam a divergência (8): a conversa é da responsável, casa sem a query e nada grava", () => {
    const notes = cl8.notes ?? "";
    for (const part of [
      "Goal147",
      "(8) A conversa de “Conversa com Maria” é da responsável",
      "visual-compare-cl8-maria",
      "sem a query",
      "Nenhum passo grava",
    ]) {
      expect(notes, part).toContain(part);
    }
    expect(notes).not.toContain("o app mostra só “Agendar”");
  });
});
