/**
 * Goal149, WU-01: a lista de clientes traz o responsável confirmado de cada
 * cliente (`guardian`) e os dependentes confirmados de cada responsável
 * (`dependents`), numa só consulta de relações para a lista inteira. Sem banco
 * real; o mesmo contra PostgreSQL está em `goal149-lista-responsavel` de
 * integração.
 */
import { describe, expect, it } from "vitest";

import { AvenlyCustomerService } from "../../src/modules/customers/avenly-customer-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const otherTenantId = "tenant-b";
const timezone = "America/Sao_Paulo";
const now = new Date("2026-10-08T15:00:00.000Z");

type Database = ReturnType<typeof createDatabaseDouble>;

async function person(
  database: Database,
  tenant: string,
  name: string | null,
  phone?: string,
): Promise<string> {
  const created = await database.client.customer.create({
    data: {
      tenantId: tenant,
      name,
      phone: phone ? `+${phone}` : null,
      normalizedPhone: phone ?? null,
    },
  });
  return created.id;
}

async function relate(
  database: Database,
  tenant: string,
  customerId: string,
  guardianId: string,
  status: "PROPOSED" | "CONFIRMED",
): Promise<void> {
  await database.tables.customerRelation.create({
    data: {
      tenantId: tenant,
      customerId,
      relatedCustomerId: guardianId,
      type: "PRIMARY_GUARDIAN",
      status,
      proposedBy: "PROFESSIONAL",
      confirmedBy: status === "CONFIRMED" ? "PROFESSIONAL" : null,
    },
  });
}

function service(database: Database, tenant = tenantId) {
  return new AvenlyCustomerService(database.client as never, tenant);
}

/** Conta as chamadas à consulta de relações e guarda o filtro de cada uma. */
function spyOnRelationQueries(database: Database) {
  const wheres: Array<Record<string, unknown>> = [];
  const original = database.client.customerRelation.findMany;
  database.client.customerRelation.findMany = (async (
    args: Parameters<typeof original>[0],
  ) => {
    wheres.push((args?.where ?? {}) as Record<string, unknown>);
    return original(args);
  }) as typeof original;
  return wheres;
}

describe("AvenlyCustomerService.list com responsável (Goal149)", () => {
  it("traz guardian no dependente e dependents no responsável, só com a relação CONFIRMED", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    const solo = await person(database, tenantId, "Solo", "5511900000000");
    await relate(database, tenantId, pedro, maria, "CONFIRMED");

    const items = await service(database).list({}, { timezone, now });
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(byId.get(pedro)).toMatchObject({
      guardian: { id: maria, name: "Maria" },
      dependents: [],
    });
    expect(byId.get(maria)).toMatchObject({
      guardian: null,
      dependents: [{ id: pedro, name: "Pedro" }],
    });
    expect(byId.get(solo)).toMatchObject({ guardian: null, dependents: [] });
  });

  it("os campos de pessoa trazem só id e name", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    await relate(database, tenantId, pedro, maria, "CONFIRMED");

    const items = await service(database).list({}, { timezone, now });
    const dependent = items.find((item) => item.id === pedro);
    const guardian = items.find((item) => item.id === maria);
    expect(dependent?.guardian).toEqual({ id: maria, name: "Maria" });
    expect(guardian?.dependents).toEqual([{ id: pedro, name: "Pedro" }]);
  });

  it("relação PROPOSED não aparece em nenhum dos dois lados", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    await relate(database, tenantId, pedro, maria, "PROPOSED");

    const items = await service(database).list({}, { timezone, now });
    for (const item of items) {
      expect(item.guardian).toBeNull();
      expect(item.dependents).toEqual([]);
    }
  });

  it("relação removida some na leitura seguinte", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    await relate(database, tenantId, pedro, maria, "CONFIRMED");
    const before = await service(database).list({}, { timezone, now });
    expect(before.find((item) => item.id === pedro)?.guardian).toEqual({
      id: maria,
      name: "Maria",
    });

    await service(database).clearPrimaryGuardian(pedro);

    const after = await service(database).list({}, { timezone, now });
    for (const item of after) {
      expect(item.guardian).toBeNull();
      expect(item.dependents).toEqual([]);
    }
  });

  it("responsável com dois dependentes: os dois, em ordem de nome, o sem nome por último e depois o id", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const zeca = await person(database, tenantId, "Zeca");
    const ana = await person(database, tenantId, "Ana");
    const semNome = await person(database, tenantId, null);
    const outraAna = await person(database, tenantId, "Ana");
    for (const dependent of [zeca, semNome, ana, outraAna]) {
      await relate(database, tenantId, dependent, maria, "CONFIRMED");
    }

    const items = await service(database).list({}, { timezone, now });
    const guardian = items.find((item) => item.id === maria);
    const sameName = [ana, outraAna].sort((a, b) => a.localeCompare(b));
    expect(guardian?.dependents).toEqual([
      { id: sameName[0], name: "Ana" },
      { id: sameName[1], name: "Ana" },
      { id: zeca, name: "Zeca" },
      { id: semNome, name: null },
    ]);
  });

  it("responsável sem nome chega com name null", async () => {
    const database = createDatabaseDouble();
    const semNome = await person(database, tenantId, null, "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    await relate(database, tenantId, pedro, semNome, "CONFIRMED");

    const items = await service(database).list({}, { timezone, now });
    expect(items.find((item) => item.id === pedro)?.guardian).toEqual({
      id: semNome,
      name: null,
    });
  });

  it("cliente com telefone próprio e responsável traz os dois campos", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const joao = await person(database, tenantId, "João", "5511911112222");
    await relate(database, tenantId, joao, maria, "CONFIRMED");

    const items = await service(database).list({}, { timezone, now });
    expect(items.find((item) => item.id === joao)).toMatchObject({
      phone: "+5511911112222",
      guardian: { id: maria, name: "Maria" },
    });
  });
});

describe("consulta de relações da lista (Goal149)", () => {
  it("faz uma única chamada para a lista inteira, qualquer que seja o tamanho", async () => {
    for (const size of [1, 2, 25]) {
      const database = createDatabaseDouble();
      const guardian = await person(database, tenantId, "Maria", "5511900000000");
      for (let index = 1; index < size; index += 1) {
        const dependent = await person(database, tenantId, `Cliente ${index}`);
        await relate(database, tenantId, dependent, guardian, "CONFIRMED");
      }
      const wheres = spyOnRelationQueries(database);

      const items = await service(database).list({}, { timezone, now });

      expect(items).toHaveLength(size);
      expect(wheres).toHaveLength(1);
    }
  });

  it("filtra por tenant do serviço, tipo, status e pelos ids da lista nos dois lados", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    await relate(database, tenantId, pedro, maria, "CONFIRMED");
    const wheres = spyOnRelationQueries(database);

    await service(database).list({}, { timezone, now });

    expect(wheres).toHaveLength(1);
    const ids = [maria, pedro].sort();
    const where = wheres[0] as {
      tenantId: string;
      type: string;
      status: string;
      OR: Array<Record<string, { in: string[] }>>;
    };
    expect(where.tenantId).toBe(tenantId);
    expect(where.type).toBe("PRIMARY_GUARDIAN");
    expect(where.status).toBe("CONFIRMED");
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]?.customerId?.in.slice().sort()).toEqual(ids);
    expect(where.OR[1]?.relatedCustomerId?.in.slice().sort()).toEqual(ids);
  });

  it("sem timezone não consulta relações e a lista sai como antes", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    await relate(database, tenantId, pedro, maria, "CONFIRMED");
    const wheres = spyOnRelationQueries(database);

    const items = await service(database).list();
    const byPhone = await service(database).findCandidatesByPhone(
      "5511987654321",
    );

    expect(wheres).toHaveLength(0);
    for (const item of [...items, ...byPhone]) {
      expect("guardian" in item).toBe(false);
      expect("dependents" in item).toBe(false);
    }
  });

  it("lista vazia não consulta relações", async () => {
    const database = createDatabaseDouble();
    const wheres = spyOnRelationQueries(database);

    expect(await service(database).list({}, { timezone, now })).toEqual([]);
    expect(wheres).toHaveLength(0);
  });

  it("relação de outro tenant nunca aparece", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const solo = await person(database, tenantId, "Solo");
    const outraMaria = await person(
      database,
      otherTenantId,
      "Maria B",
      "5511987654321",
    );
    const outroPedro = await person(database, otherTenantId, "Pedro B");
    await relate(database, otherTenantId, outroPedro, outraMaria, "CONFIRMED");

    const items = await service(database).list({}, { timezone, now });
    expect(items.map((item) => item.id).sort()).toEqual([maria, solo].sort());
    for (const item of items) {
      expect(item.guardian).toBeNull();
      expect(item.dependents).toEqual([]);
    }
    const doOutroTenant = await service(database, otherTenantId).list(
      {},
      { timezone, now },
    );
    expect(doOutroTenant.find((item) => item.id === outroPedro)?.guardian).toEqual(
      { id: outraMaria, name: "Maria B" },
    );
  });

  it("relação de outro negócio sobre os mesmos ids nunca aparece (dois tenants)", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    // O negócio B tem clientes com os MESMOS ids e uma relação confirmada
    // entre eles: só o `tenantId` do filtro impede que ela entre na lista de A.
    for (const [id, name] of [
      [maria, "Maria B"],
      [pedro, "Pedro B"],
    ] as const) {
      await database.tables.customer.create({
        data: { id, tenantId: otherTenantId, name, phone: null, normalizedPhone: null },
      });
    }
    await relate(database, otherTenantId, pedro, maria, "CONFIRMED");

    const items = await service(database).list({}, { timezone, now });
    expect(items.map((item) => item.id).sort()).toEqual([maria, pedro].sort());
    for (const item of items) {
      expect(item.guardian).toBeNull();
      expect(item.dependents).toEqual([]);
    }
    const doOutroTenant = await service(database, otherTenantId).list(
      {},
      { timezone, now },
    );
    expect(doOutroTenant.find((item) => item.id === pedro)?.guardian).toEqual({
      id: maria,
      name: "Maria B",
    });
  });

  it("a lista por telefone (candidatos da IA) traz os campos quando há timezone", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    await relate(database, tenantId, pedro, maria, "CONFIRMED");

    const candidates = await service(database).findCandidatesByPhone(
      "5511987654321",
      { timezone, now },
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: maria,
      guardian: null,
      dependents: [{ id: pedro, name: "Pedro" }],
    });
  });
});
