/**
 * Goal140/WU-03 — os alvos W3, W1 e W2 do `visual:compare`: as respostas fixas
 * da lista dos contatos ignorados são válidas para o contrato real (a captura
 * não pode provar uma tela com um corpo que o BFF nunca responderia), o
 * `total` do W3 é o número de itens, os dois itens do W1 e do W2 são os dois
 * primeiros do W3 e nenhum alvo declara método diferente de `GET`. O W3 não
 * tem passo: nada na captura toca "Remover", "Ignorar" nem "Adicionar".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findPublicApiRoute,
  ignoredContactListSchema,
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
  label?: string;
  route: string;
  notes?: string;
  responses?: FixedResponse[];
  steps?: unknown[];
};

const FILE = "Mais-WhatsApp-Importacao-Conta.dc.html";
const LIST_PATH = "/v1/conversations/ignored-contacts";
const CODES = ["W3", "W1", "W2"] as const;

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function listOf(code: string): unknown {
  const entry = target(code).responses?.find((item) => item.path === LIST_PATH);
  if (!entry) throw new Error(`alvo ${code} sem resposta de ${LIST_PATH}`);
  return clone(entry.json.data);
}

const list = (code: string) => ignoredContactListSchema.parse(listOf(code));

describe("alvos W3, W1 e W2 do visual:compare (contatos ignorados)", () => {
  test("o W3 é novo: rota própria, arquivo e label do quadro, sem passo", () => {
    const t = target("W3");
    expect(t.route).toBe("/configuracoes/whatsapp/contatos-ignorados");
    expect(t.label).toBe("WhatsApp · contatos ignorados");
    expect(t.file).toBe(FILE);
    expect(t.steps).toBeUndefined();
    expect(targets.filter((item) => item.code === "W3")).toHaveLength(1);
  });

  test("o W3 declara só o GET da lista, o W1 e o W2 declaram o GET de /v1/whatsapp e o da lista, todos com requestId", () => {
    expect(
      target("W3").responses?.map((item) => `${item.method} ${item.path}`),
    ).toEqual([`GET ${LIST_PATH}`]);
    for (const code of ["W1", "W2"]) {
      expect(
        target(code).responses?.map((item) => `${item.method} ${item.path}`),
      ).toEqual(["GET /v1/whatsapp", `GET ${LIST_PATH}`]);
    }
    for (const code of CODES) {
      for (const item of target(code).responses ?? []) {
        expect(typeof item.json.requestId, `${code} ${item.path}`).toBe(
          "string",
        );
      }
    }
  });

  test("nenhum dos três alvos declara método diferente de GET", () => {
    for (const code of CODES) {
      for (const item of target(code).responses ?? []) {
        expect(item.method, `${code} ${item.path}`).toBe("GET");
      }
    }
  });

  test("o caminho é rota do contrato e cada corpo é válido para ignoredContactListSchema", () => {
    expect(
      findPublicApiRoute("GET", LIST_PATH),
      `${LIST_PATH} precisa ser rota do contrato`,
    ).toBeDefined();
    for (const code of CODES) {
      const parsed = ignoredContactListSchema.safeParse(listOf(code));
      expect(parsed.success, `${code}: ${JSON.stringify(parsed)}`).toBe(true);
      const contract = findPublicApiRoute("GET", LIST_PATH);
      expect(contract?.schema.safeParse(listOf(code)).success, code).toBe(true);
    }
  });

  test("o total do W3 é o número de itens, e o do W1 e o do W2 também", () => {
    for (const code of CODES) {
      const { items, total } = list(code);
      expect(total, code).toBe(items.length);
    }
    expect(list("W3").items).toHaveLength(3);
  });

  test("o W3 traz Mãe, Dudu ❤️ e Renata, na ordem do quadro e com ignoredAt crescente", () => {
    const { items } = list("W3");
    expect(
      items.map((item) => [
        item.displayName,
        item.externalContactId,
        item.origin,
      ]),
    ).toEqual([
      ["Mãe", "5511999001122", "ONBOARDING"],
      ["Dudu ❤️", "5511988776655", "ONBOARDING"],
      ["Renata", expect.stringMatching(/^\d+$/) as string, "CONVERSATION"],
    ]);
    expect(new Set(items.map((item) => item.contactId)).size).toBe(3);
    const times = items.map((item) => Date.parse(item.ignoredAt ?? ""));
    for (const time of times) expect(Number.isNaN(time)).toBe(false);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  test("a Renata do W3 cai em 18/09 no fuso de São Paulo, e as duas de Mãe e Dudu não têm telefone repetido", () => {
    const renata = list("W3").items[2];
    const day = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(renata?.ignoredAt ?? ""));
    expect(day).toBe("18/09");
    const phones = list("W3").items.map((item) => item.externalContactId);
    expect(new Set(phones).size).toBe(phones.length);
  });

  test("os dois itens do W1 e do W2 são os dois primeiros do W3", () => {
    const first = list("W3").items.slice(0, 2);
    expect(list("W1").items).toEqual(first);
    expect(list("W2").items).toEqual(first);
    expect(list("W1").total).toBe(2);
    expect(list("W2").total).toBe(2);
  });

  test("o W1 e o W2 mantêm o GET de /v1/whatsapp de antes, igual nos dois, e o W2 mantém os passos que não tocam Desconectar", () => {
    const [w1Whatsapp] = target("W1").responses ?? [];
    const [w2Whatsapp] = target("W2").responses ?? [];
    expect(w1Whatsapp?.path).toBe("/v1/whatsapp");
    expect(w2Whatsapp).toEqual(w1Whatsapp);
    expect(target("W1").steps).toBeUndefined();
    expect(target("W2").steps).toEqual([
      { clickRole: { role: "button", name: "Desconectar WhatsApp" } },
      { click: "Desconectar o WhatsApp?" },
    ]);
  });

  test("nenhum passo dos três alvos grava: nada toca Remover, Ignorar, Adicionar nem Desconectar o número", () => {
    for (const code of CODES) {
      const steps = JSON.stringify(target(code).steps ?? []);
      expect(steps, code).not.toMatch(/Remover|Ignorar|Adicionar/);
    }
    const w2Names = (target("W2").steps ?? []).map((step) =>
      JSON.stringify(step),
    );
    expect(w2Names.join("")).not.toMatch(/"name":"Desconectar"/);
  });

  test("as notes dizem por que as respostas são fixas, que a tela só lê esses GET e que nenhum passo grava", () => {
    for (const code of CODES) {
      const notes = target(code).notes ?? "";
      expect(notes, code).toContain("Goal140");
      expect(notes, code).toContain(`GET ${LIST_PATH}`);
      expect(notes, code).toContain("nenhum passo grava");
    }
  });

  test("as notes do W3 citam as divergências visíveis: a barra do iPhone, a linha sem hover, a busca vazia, a casca da conta visual, a área de toque e o letter-spacing", () => {
    const notes = target("W3").notes ?? "";
    for (const divergence of [
      "iPhone",
      ":hover",
      "cursor: pointer",
      "busca vazia",
      "Atendimento automático parado",
      "D-118",
      "40 px de altura",
      "letter-spacing",
    ]) {
      expect(notes, divergence).toContain(divergence);
    }
  });

  test("as notes do W1 citam o nome como foi marcado e as divergências de D-118", () => {
    const notes = target("W1").notes ?? "";
    for (const divergence of [
      "Mãe, Dudu ❤️",
      "Uso pessoal",
      "D-118",
      "iPhone",
    ]) {
      expect(notes, divergence).toContain(divergence);
    }
  });

  test("W3, W1 e W2 são os únicos alvos que declaram a lista dos ignorados", () => {
    const owners = targets
      .filter((item) =>
        (item.responses ?? []).some((entry) => entry.path === LIST_PATH),
      )
      .map((item) => item.code);
    expect(owners).toEqual(["W1", "W2", "W3"]);
  });
});
