/**
 * Goal144/WU-02 — o alvo CL8 do `visual:compare`: as respostas fixas do perfil
 * de quem é agendado por um responsável são válidas para o contrato real (a
 * captura não pode provar uma tela com um corpo que o BFF nunca responderia),
 * o detalhe traz Pedro sem telefone e com a relação `CONFIRMED` e `confirmedAt`
 * de 12/08 em São Paulo, nenhuma resposta tem método diferente de `GET` e o
 * alvo não tem passo: nada na captura toca "Confirmar" nem "Remover".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  customerDetailSchema,
  customerListSchema,
  customerMemorySchema,
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
const ID = "visual-compare-cl8-pedro";
const DETAIL_PATH = `/v1/customers/${ID}`;
const MEMORY_PATH = `${DETAIL_PATH}/memory`;

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bodyOf(path: string): unknown {
  const entry = cl8.responses?.find((item) => item.path === path);
  if (!entry) throw new Error(`CL8 sem resposta de ${path}`);
  return clone(entry.json.data);
}

const detail = () => customerDetailSchema.parse(bodyOf(DETAIL_PATH));

describe("alvo CL8 do visual:compare (perfil com responsável)", () => {
  test("o CL8 é novo: rota própria, arquivo e label do quadro, sem passo e único", () => {
    expect(cl8.route).toBe(`/clientes/detalhes?id=${ID}`);
    expect(cl8.label).toBe("Cliente · responsável");
    expect(cl8.file).toBe(FILE);
    expect(cl8.steps).toBeUndefined();
    expect(targets.filter((item) => item.code === "CL8")).toHaveLength(1);
    expect(targets).toHaveLength(102);
  });

  test("o CL8 declara só GET, com requestId, e os GET que o perfil faz", () => {
    expect(
      cl8.responses?.map((item) => `${item.method} ${item.path}`),
    ).toEqual([
      "GET /v1/status",
      `GET ${DETAIL_PATH}`,
      `GET ${MEMORY_PATH}`,
      "GET /v1/conversations",
      "GET /v1/customers",
    ]);
    for (const item of cl8.responses ?? []) {
      expect(item.method, item.path).toBe("GET");
      expect(typeof item.json.requestId, item.path).toBe("string");
    }
  });

  test("cada caminho é rota do contrato e cada corpo é válido para o schema da rota", () => {
    for (const item of cl8.responses ?? []) {
      const pattern = item.path.startsWith("/v1/customers/")
        ? item.path.endsWith("/memory")
          ? "/v1/customers/:id/memory"
          : "/v1/customers/:id"
        : item.path;
      const contract = findPublicApiRoute("GET", pattern);
      expect(contract, `${pattern} precisa ser rota do contrato`).toBeDefined();
      const parsed = contract?.schema.safeParse(clone(item.json.data));
      expect(parsed?.success, `${item.path}: ${JSON.stringify(parsed)}`).toBe(
        true,
      );
    }
    expect(customerDetailSchema.safeParse(bodyOf(DETAIL_PATH)).success).toBe(
      true,
    );
    expect(customerListSchema.safeParse(bodyOf("/v1/customers")).success).toBe(
      true,
    );
    const memory = bodyOf(MEMORY_PATH);
    expect(Array.isArray(memory) && memory.length).toBe(0);
    expect(customerMemorySchema.array().safeParse(memory).success).toBe(true);
    expect(bodyOf("/v1/conversations")).toEqual([]);
  });

  test("o detalhe é Pedro Souza sem telefone próprio, sem nota nem tag, com os números do quadro", () => {
    const pedro = detail();
    expect(pedro.id).toBe(ID);
    expect(pedro.name).toBe("Pedro Souza");
    expect(pedro.phone).toBeNull();
    expect(pedro.notes).toEqual([]);
    expect(pedro.tags).toEqual([]);
    expect(pedro.createdAt).toMatch(/^2026-08-/);
    expect(pedro.appointmentStats).toMatchObject({
      completed: 2,
      noShows: 0,
      cancelled: 0,
      averageIntervalDays: 28,
    });
    expect(pedro.nextAppointment).toMatchObject({
      startTime: "10:00",
      status: "CONFIRMED",
    });
  });

  test("a relação é CONFIRMED com confirmedAt, e a Maria tem o telefone do quadro", () => {
    const relation = detail().primaryGuardian;
    expect(relation?.status).toBe("CONFIRMED");
    expect(relation?.guardian).toEqual({
      id: "visual-compare-cl8-maria",
      name: "Maria Souza",
      phone: "5511987651100",
    });
    expect(relation?.proposedBy).toBe("PROFESSIONAL");
    expect(relation?.confirmedBy).toBe("PROFESSIONAL");
    expect(relation?.confirmedAt).toBeTruthy();
  });

  test("o confirmedAt cai em 12/08 no fuso de São Paulo", () => {
    const day = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(detail().primaryGuardian?.confirmedAt ?? ""));
    expect(day).toBe("12/08");
  });

  test("a lista ao lado do perfil traz Pedro e Maria, os mesmos ids do detalhe", () => {
    const { items } = customerListSchema.parse(bodyOf("/v1/customers"));
    expect(items.map((item) => [item.id, item.name, item.phone])).toEqual([
      [ID, "Pedro Souza", null],
      ["visual-compare-cl8-maria", "Maria Souza", "5511987651100"],
    ]);
  });

  test("nenhum passo e nenhuma resposta grava: nada toca Confirmar, Remover nem Propor", () => {
    expect(JSON.stringify(cl8.steps ?? [])).not.toMatch(
      /Confirmar|Remover|Propor/,
    );
    expect(
      (cl8.responses ?? []).filter((item) => item.method !== "GET"),
    ).toEqual([]);
  });

  test("as notes dizem por que as respostas são fixas, que nenhum passo grava e citam as divergências", () => {
    const notes = cl8.notes ?? "";
    for (const part of [
      "Goal144",
      "Respostas fixas",
      "Nenhum passo grava",
      "GET /v1/status",
      `GET /v1/customers/${ID}`,
      "mãe",
      "20/09",
      "Responsável principal",
    ]) {
      expect(notes, part).toContain(part);
    }
  });

  test("CL5, CL6 e CL7 seguem sem responses, e CL2, CL3 e CL10 seguem donos delas", () => {
    for (const code of ["CL5", "CL6", "CL7"]) {
      const target = targets.find(
        (item) => item.code === code && item.file === FILE,
      );
      expect(target?.responses, code).toBeUndefined();
      expect(target?.route, code).toBe("/clientes/detalhes?id={customerId}");
    }
    const owners = targets
      .filter((item) => item.file === FILE && item.responses !== undefined)
      .map((item) => item.code);
    expect(owners).toEqual(["CL2", "CL3", "CL10", "CL8"]);
  });
});
