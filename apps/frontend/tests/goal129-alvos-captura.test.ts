/**
 * Goal129/WU-03 — as respostas fixas dos alvos 4.4 e 4.5 do `visual:compare`
 * são válidas para o contrato real: a captura não pode provar uma tela com um
 * corpo que o BFF nunca responderia, nem tocar controle que grava.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findPublicApiRoute } from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

import { ONBOARDING_ROUTES } from "../e2e/routes";

type Conversation = {
  id: string;
  externalContactId: string;
  customerName: string | null;
  customerId?: string | null;
  ignored?: boolean;
  lastMessage: { body: string } | null;
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

function resolved(code: string): unknown {
  const [entry] = target(code).responses ?? [];
  return JSON.parse(
    JSON.stringify(entry?.json.data).replaceAll("{today}", "2026-10-06"),
  );
}

function conversations(): Conversation[] {
  return resolved("4.5") as Conversation[];
}

describe.each([
  ["4.4", "/onboarding/whatsapp-conectar", "GET", "/v1/whatsapp"],
  ["4.5", "/onboarding/contatos-ignorados", "GET", "/v1/conversations"],
])("alvo %s do visual:compare", (code, route, method, path) => {
  test("a rota é a da etapa, na conta de onboarding, sem passos", () => {
    expect(target(code).route).toBe(route);
    expect(target(code).account).toBe("onboarding");
    expect(target(code).steps).toBeUndefined();
  });

  test("declara só o GET do quadro, e ele é válido para o schema da rota", () => {
    const { responses } = target(code);
    expect(responses).toHaveLength(1);
    const [entry] = responses ?? [];
    expect(entry?.method).toBe(method);
    expect(entry?.path).toBe(path);
    const contract = findPublicApiRoute("GET", entry?.path ?? "");
    expect(contract, `${path} precisa ser rota do contrato`).toBeDefined();
    const parsed = contract?.schema.safeParse(resolved(code));
    expect(parsed?.success, JSON.stringify(parsed)).toBe(true);
  });

  test("as notes declaram as divergências do Goal129 e o D-104", () => {
    expect(target(code).notes).toContain("Goal129");
    expect(target(code).notes).toContain("D-104");
  });
});

describe("estado de cada quadro", () => {
  test("4.4 é o número conectado do W1, em CONNECTED", () => {
    const connection = resolved("4.4") as {
      status: string;
      phoneNumber: string;
    };
    expect(connection.status).toBe("CONNECTED");
    expect(connection.phoneNumber).toBe("5511987654321");
  });

  test("4.5 traz as cinco conversas do quadro, na ordem", () => {
    expect(conversations().map((item) => item.customerName)).toEqual([
      "Mãe",
      "Dudu ❤️",
      "Tia Lú",
      "Ana Paula",
      "Marcos Vieira",
    ]);
    expect(conversations().map((item) => item.lastMessage?.body)).toEqual([
      "Filha, liga pra mim quando puder",
      "Chego às 20h",
      "Bom dia, família! ☀️",
      "Obrigada, Camila! Até sexta",
      "Tem horário sábado?",
    ]);
  });

  test("4.5 marca só Mãe e Dudu como ignoradas, e só Ana Paula tem customerId", () => {
    expect(
      conversations()
        .filter((item) => item.ignored === true)
        .map((item) => item.customerName),
    ).toEqual(["Mãe", "Dudu ❤️"]);
    expect(
      conversations()
        .filter((item) => item.customerId)
        .map((item) => item.customerName),
    ).toEqual(["Ana Paula"]);
  });

  test("4.5 usa ids e contatos distintos", () => {
    const ids = conversations().map((item) => item.id);
    const contacts = conversations().map((item) => item.externalContactId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(contacts).size).toBe(contacts.length);
  });
});

describe("os outros alvos do onboarding e o gate", () => {
  test("4.2 continua sem responses e sem passos, na mesma rota do 4.4", () => {
    expect(target("4.2").route).toBe(target("4.4").route);
    expect(target("4.2").responses).toBeUndefined();
    expect(target("4.2").steps).toBeUndefined();
  });

  test("/onboarding/contatos-ignorados está em ONBOARDING_ROUTES com o h1 como marcador, e whatsapp-conectar fica fora", () => {
    const route = ONBOARDING_ROUTES.find(
      (candidate) => (candidate.path as string) === "/onboarding/contatos-ignorados",
    );
    expect(route?.name).toBe("onboarding-contatos-ignorados");
    expect(route?.contentMarker).toBe(
      "Quer impedir que a IA responda algumas pessoas?",
    );
    expect(
      ONBOARDING_ROUTES.some(
        (candidate) =>
          (candidate.path as string) === "/onboarding/whatsapp-conectar",
      ),
    ).toBe(false);
  });
});
