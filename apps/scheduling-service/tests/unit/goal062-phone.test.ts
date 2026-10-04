import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AvenlyCustomerService } from "../../src/modules/customers/avenly-customer-service.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import {
  BRAZILIAN_DDDS,
  normalizePhone,
  normalizePhoneDetailed,
  phoneEquivalenceCandidates,
} from "../../src/shared/phone/phone.js";
import { createDatabaseDouble } from "./support/database-double.js";

describe("normalizePhone (Goal062, WU-02)", () => {
  it("10 digits, celular sem 9º dígito: completa 55 + DDD + 9 + assinante", () => {
    expect(normalizePhone("1166665555")).toBe("5511966665555");
  });

  it("10 digits, fixo: não completa 9º dígito", () => {
    expect(normalizePhone("1133334444")).toBe("551133334444");
  });

  it("11 digits, celular já com 9º dígito: mantém", () => {
    expect(normalizePhone("11966665555")).toBe("5511966665555");
  });

  it("12 digits, 55 + DDD + fixo: mantém sem 9º dígito", () => {
    expect(normalizePhone("551133334444")).toBe("551133334444");
  });

  it("12 digits, 55 + DDD + celular sem 9º dígito: completa", () => {
    expect(normalizePhone("551166665555")).toBe("5511966665555");
  });

  it("13 digits, forma canônica completa: mantém", () => {
    expect(normalizePhone("5511966665555")).toBe("5511966665555");
  });

  it("remove o prefixo internacional 00", () => {
    expect(normalizePhone("0055 11 96666-5555")).toBe("5511966665555");
  });

  it("remove o prefixo de tronco 0", () => {
    expect(normalizePhone("0 11 96666-5555")).toBe("5511966665555");
  });

  it("DDD inválido: não reconhece, mantém dígitos como hoje", () => {
    const result = normalizePhoneDetailed("2033334444");
    expect(result.recognized).toBe(false);
    expect(result.normalizedPhone).toBe("2033334444");
  });

  it("número estrangeiro: não reconhece, mantém dígitos como hoje", () => {
    // Reino Unido: +44 20 7946 0958 — 12 dígitos, não cabe em nenhuma forma
    // brasileira reconhecida (nem 55+DDD+assinante, nem DDD+assinante puro).
    const result = normalizePhoneDetailed("442079460958");
    expect(result.recognized).toBe(false);
    expect(result.normalizedPhone).toBe("442079460958");
  });

  it("rejeita menos de 6 dígitos", () => {
    expect(() => normalizePhone("12345")).toThrow(AppError);
  });

  it("rejeita mais de 15 dígitos", () => {
    expect(() => normalizePhone("1234567890123456")).toThrow(AppError);
  });

  it("reconhece cada DDD da lista e recusa os que nunca foram DDD", () => {
    for (const ddd of BRAZILIAN_DDDS) {
      expect(normalizePhoneDetailed(`${ddd}33334444`).recognized).toBe(true);
    }
    // 20, 23, 25, 26, 29 nunca foram DDDs brasileiros.
    for (const ddd of [20, 23, 25, 26, 29]) {
      expect(normalizePhoneDetailed(`${ddd}33334444`).recognized).toBe(false);
    }
  });
});

/**
 * A lista de DDDs do Scheduling é a mesma do BFF (Goal062 §3). O BFF é outro
 * app, então o teste lê o arquivo-fonte dele em vez de importá-lo: se
 * `apps/bff/src/lib/phone.ts` mudar a lista, este teste reprova.
 */
const BFF_PHONE_SOURCE = fileURLToPath(
  new URL("../../../bff/src/lib/phone.ts", import.meta.url),
);

function dddsDeclaredIn(source: string): number[] {
  const match = /const BRAZILIAN_DDDS = new Set\(\[([\s\S]*?)\]\)/.exec(source);
  if (!match) throw new Error("BRAZILIAN_DDDS não encontrado no arquivo-fonte");
  return match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(Number)
    .sort((a, b) => a - b);
}

describe("lista de DDDs igual à do BFF (Goal062 §3)", () => {
  const bffSource = readFileSync(BFF_PHONE_SOURCE, "utf8");
  const schedulingDdds = [...BRAZILIAN_DDDS].sort((a, b) => a - b);

  it("o Scheduling usa exatamente a lista de apps/bff/src/lib/phone.ts", () => {
    const bffDdds = dddsDeclaredIn(bffSource);
    expect(bffDdds.length).toBeGreaterThan(60);
    expect(bffDdds.every(Number.isInteger)).toBe(true);
    expect(schedulingDdds).toEqual(bffDdds);
  });

  it("uma divergência entre as listas é detectada", () => {
    const withoutOneDdd = bffSource.replace("98, 99,", "98,");
    const withExtraDdd = bffSource.replace("11, 12,", "10, 11, 12,");
    expect(dddsDeclaredIn(withoutOneDdd)).not.toEqual(schedulingDdds);
    expect(dddsDeclaredIn(withExtraDdd)).not.toEqual(schedulingDdds);
  });
});

describe("phoneEquivalenceCandidates (Goal062, WU-02)", () => {
  it("expande um celular canônico para as formas nacional e sem 9º dígito", () => {
    const candidates = new Set(phoneEquivalenceCandidates("5511966665555"));
    expect(candidates).toEqual(
      new Set(["5511966665555", "551166665555", "11966665555", "1166665555"]),
    );
  });

  it("mantém um fixo apenas na forma canônica e nacional", () => {
    const candidates = new Set(phoneEquivalenceCandidates("551133334444"));
    expect(candidates).toEqual(new Set(["551133334444", "1133334444"]));
  });

  it("devolve só a si mesmo para um número que não é forma brasileira reconhecida", () => {
    expect(phoneEquivalenceCandidates("442079460958")).toEqual([
      "442079460958",
    ]);
  });
});

describe("findCandidatesByPhone por equivalência (Goal062, WU-02)", () => {
  function customers(tenantId = "tenant-a") {
    return new AvenlyCustomerService(
      createDatabaseDouble().client as never,
      tenantId,
    );
  }

  it("acha um celular gravado com o 9º dígito consultando sem ele, e vice-versa", async () => {
    const service = customers();
    const maria = await service.create({
      name: "Maria",
      phone: "5511966665555",
    });

    expect(
      (await service.findCandidatesByPhone("551166665555")).map((c) => c.id),
    ).toEqual([maria.id]);
    expect(
      (await service.findCandidatesByPhone("5511966665555")).map((c) => c.id),
    ).toEqual([maria.id]);
  });

  it("acha uma linha gravada antes do Goal, em dígitos nacionais sem 55", async () => {
    const database = createDatabaseDouble();
    const legacy = await database.client.customer.create({
      data: {
        tenantId: "tenant-a",
        name: "Cliente Antigo",
        phone: "11966665555",
        normalizedPhone: "11966665555",
      },
    });
    const service = new AvenlyCustomerService(
      database.client as never,
      "tenant-a",
    );

    expect(
      (await service.findCandidatesByPhone("5511966665555")).map((c) => c.id),
    ).toEqual([legacy.id]);
  });

  it("grava phone como + seguido da forma canônica quando o número é reconhecido", async () => {
    const service = customers();
    const maria = await service.create({ name: "Maria", phone: "11966665555" });
    expect(maria.phone).toBe("+5511966665555");
    expect(maria.normalizedPhone).toBe("5511966665555");
  });

  it("não mistura correspondência por equivalência entre tenants", async () => {
    const database = createDatabaseDouble();
    const a = new AvenlyCustomerService(database.client as never, "tenant-a");
    const b = new AvenlyCustomerService(database.client as never, "tenant-b");
    await a.create({ name: "Maria", phone: "5511966665555" });
    await b.create({ name: "Outra Maria", phone: "5511966665555" });

    const foundInA = await a.findCandidatesByPhone("551166665555");
    const foundInB = await b.findCandidatesByPhone("551166665555");
    expect(foundInA).toHaveLength(1);
    expect(foundInB).toHaveLength(1);
    expect(foundInA[0]?.id).not.toBe(foundInB[0]?.id);
  });
});
