/**
 * Goal149/WU-04 — os alvos CL1 e CL3 do `visual:compare` (Clientes · lista e
 * Clientes · busca): as respostas fixas são válidas para o schema da rota no
 * contrato (a captura não pode provar uma tela com um corpo que o BFF nunca
 * responderia), só `GET`, com `requestId`. O CL1 traz as oito linhas do quadro,
 * com Pedro Souza sem telefone e com `guardian` Maria Souza e o cadastro sem
 * nome; no CL3 a Maria tem `dependents` Pedro Souza, e o Pedro entra na lista.
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
  label?: string;
  route: string;
  notes?: string;
  responses?: FixedResponse[];
  steps?: unknown[];
};

const FILE = "Clientes.dc.html";
const TODAY = "2026-10-07";

const targets = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../e2e/visual/targets.json"), "utf8"),
  ) as { targets: Target[] }
).targets;

function target(code: string): Target {
  const found = targets.find((item) => item.code === code && item.file === FILE);
  if (!found) throw new Error(`alvo ${code} ausente`);
  return found;
}

/** Mesma troca de `{today}`, `{today-N}` e `{today+N}` que o `visual:compare` faz. */
function resolveDays(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(
      /\{today(?:([-+])(\d+))?\}/g,
      (_, sign: string | undefined, offset: string | undefined) => {
        const day = new Date(`${TODAY}T12:00:00Z`);
        day.setUTCDate(
          day.getUTCDate() + (sign === "+" ? 1 : -1) * Number(offset ?? 0),
        );
        return day.toISOString().slice(0, 10);
      },
    );
  }
  if (Array.isArray(value)) return value.map(resolveDays);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveDays(item)]),
    );
  }
  return value;
}

function bodyOf(code: string, path: string): unknown {
  const entry = target(code).responses?.find((item) => item.path === path);
  if (!entry) throw new Error(`${code} sem resposta de ${path}`);
  return resolveDays(JSON.parse(JSON.stringify(entry.json.data)));
}

function list(code: string) {
  return customerListSchema.parse(bodyOf(code, "/v1/customers")).items;
}

describe.each(["CL1", "CL3"])("alvo %s do visual:compare", (code) => {
  test("declara só GET, com requestId, os que a lista faz", () => {
    const responses = target(code).responses ?? [];
    expect(responses.map((item) => `${item.method} ${item.path}`)).toEqual([
      "GET /v1/status",
      "GET /v1/customers",
    ]);
    for (const item of responses) {
      expect(item.method, item.path).toBe("GET");
      expect(typeof item.json.requestId, item.path).toBe("string");
    }
  });

  test("cada caminho é rota do contrato e cada corpo é válido para o schema da rota", () => {
    for (const item of target(code).responses ?? []) {
      const contract = findPublicApiRoute("GET", item.path);
      expect(contract, `${item.path} precisa ser rota do contrato`).toBeDefined();
      const parsed = contract?.schema.safeParse(bodyOf(code, item.path));
      expect(parsed?.success, `${item.path}: ${JSON.stringify(parsed)}`).toBe(
        true,
      );
    }
  });

  test("a lista é da agenda do Avenly, o status é conectado e nenhum passo grava", () => {
    const status = bodyOf(code, "/v1/status") as {
      whatsapp: { status: string };
    };
    expect(status.whatsapp.status).toBe("CONNECTED");
    expect(
      customerListSchema.parse(bodyOf(code, "/v1/customers")),
    ).toMatchObject({ source: "AVENLY", managedExternally: false });
    expect(JSON.stringify(target(code).steps ?? [])).not.toMatch(
      /Nomear|Adicionar|Salvar/,
    );
  });
});

describe("alvo CL1 (lista com o responsável)", () => {
  test("rota, label e arquivo do quadro, sem passo", () => {
    const cl1 = target("CL1");
    expect(cl1.route).toBe("/clientes");
    expect(cl1.label).toBe("Clientes · lista");
    expect(cl1.steps).toBeUndefined();
    expect(targets.filter((item) => item.code === "CL1")).toHaveLength(1);
  });

  test("traz as oito linhas do quadro, na ordem dele", () => {
    expect(list("CL1").map((item) => item.name)).toEqual([
      "Ana Paula",
      "Aline Santos",
      "Bia Castro",
      "Carla Nunes",
      "Fernanda Lima",
      "Juliana Mendes",
      "Pedro Souza",
      null,
    ]);
  });

  test("o Pedro é sem telefone e tem guardian Maria Souza; mais ninguém tem guardian", () => {
    const items = list("CL1");
    const pedro = items.find((item) => item.name === "Pedro Souza");
    expect(pedro?.phone).toBeNull();
    expect(pedro?.guardian?.name).toBe("Maria Souza");
    expect(pedro?.guardian?.id).toBeTruthy();
    expect(pedro?.dependents).toBeUndefined();
    expect(
      items.filter((item) => item.guardian).map((item) => item.name),
    ).toEqual(["Pedro Souza"]);
    expect(items.filter((item) => item.phone === null)).toHaveLength(1);
  });

  test("o cadastro sem nome tem o telefone do quadro e nenhum atendimento", () => {
    const semNome = list("CL1").find((item) => item.name === null);
    expect(semNome?.phone).toBe("5511976543210");
    expect(semNome?.nextAppointment).toBeNull();
    expect(semNome?.lastAppointment).toBeNull();
  });

  test("a meta de cada linha é a do quadro, com os horários futuros em {today+N}", () => {
    const byName = new Map(list("CL1").map((item) => [item.name, item]));
    const ana = byName.get("Ana Paula")?.nextAppointment;
    const juliana = byName.get("Juliana Mendes")?.nextAppointment;
    const pedro = byName.get("Pedro Souza")?.nextAppointment;
    expect(ana).toMatchObject({ date: "2026-10-09", startTime: "15:30" });
    expect(juliana).toMatchObject({ date: TODAY, startTime: "15:00" });
    expect(pedro).toMatchObject({ date: "2026-10-10", startTime: "10:00" });
    expect(byName.get("Aline Santos")?.lastAppointment?.date).toBe("2026-09-16");
    expect(byName.get("Bia Castro")?.lastAppointment?.date).toBe(TODAY);
    expect(byName.get("Carla Nunes")?.lastAppointment).toMatchObject({
      date: TODAY,
      status: "NO_SHOW",
    });
    expect(byName.get("Fernanda Lima")?.nextAppointment).toBeNull();
    expect(byName.get("Fernanda Lima")?.lastAppointment).toBeNull();
  });

  test("as notes dizem que a lista é fixa e citam as divergências", () => {
    const notes = target("CL1").notes ?? "";
    for (const part of [
      "GET /v1/status",
      "GET /v1/customers é fixo",
      "só no navegador da captura",
      "Goal149",
      "agenda por esta pessoa",
      "386",
      "dia da semana",
    ]) {
      expect(notes, part).toContain(part);
    }
  });
});

describe("alvo CL3 (busca com o responsável)", () => {
  test("rota, label e passo do quadro", () => {
    const cl3 = target("CL3");
    expect(cl3.route).toBe("/clientes");
    expect(cl3.label).toBe("Clientes · busca");
    expect(cl3.steps).toEqual([
      { fill: { label: "Buscar cliente", value: "mar" } },
    ]);
  });

  test("a Maria tem dependents Pedro Souza e o Pedro está na lista, sem telefone e com guardian Maria", () => {
    const items = list("CL3");
    const maria = items.find((item) => item.name === "Maria Souza");
    const pedro = items.find((item) => item.name === "Pedro Souza");
    expect(maria?.dependents).toEqual([
      { id: pedro?.id, name: "Pedro Souza" },
    ]);
    expect(maria?.guardian).toBeUndefined();
    expect(pedro?.phone).toBeNull();
    expect(pedro?.guardian).toEqual({ id: maria?.id, name: "Maria Souza" });
  });

  test("as outras linhas seguem como eram, e só três casam com “mar”", () => {
    const items = list("CL3");
    expect(items.map((item) => item.name)).toEqual([
      "Marina Costa",
      "Marcos Vieira",
      "Maria Souza",
      "Beatriz Lima",
      "Pedro Souza",
    ]);
    for (const item of items) {
      if (item.name === "Maria Souza" || item.name === "Pedro Souza") continue;
      expect(item.guardian, item.name ?? "").toBeUndefined();
      expect(item.dependents, item.name ?? "").toBeUndefined();
    }
    const matches = items.filter(
      (item) =>
        (item.name ?? "").toLowerCase().includes("mar") ||
        (item.phone ?? "").includes("mar"),
    );
    expect(matches.map((item) => item.name)).toEqual([
      "Marina Costa",
      "Marcos Vieira",
      "Maria Souza",
    ]);
  });

  test("as notes perdem a divergência do Goal121 e citam o Goal149", () => {
    const notes = target("CL3").notes ?? "";
    expect(notes).not.toContain("a lista não traz de quem o cliente é responsável");
    for (const part of ["Goal149", "dependents", "Pedro Souza", "“mar”"]) {
      expect(notes, part).toContain(part);
    }
  });
});
