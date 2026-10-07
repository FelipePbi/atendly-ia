/**
 * Goal142, WU-01: leitura dos dependentes confirmados de um telefone e
 * `includeDependents` na lista de horários, sem banco real (coberto contra
 * PostgreSQL em `goal142-guardian-dependents.test.ts` de integração).
 */
import { describe, expect, it } from "vitest";

import { AvenlyCustomerService } from "../../src/modules/customers/avenly-customer-service.js";
import { AvenlyCalendarProvider } from "../../src/modules/integrations/avenly/provider.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const otherTenantId = "tenant-b";
const timeZone = "America/Sao_Paulo";

type Database = ReturnType<typeof createDatabaseDouble>;

async function person(
  database: Database,
  tenant: string,
  name: string,
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

async function book(
  database: Database,
  customerId: string,
  startAt: Date,
): Promise<void> {
  await database.client.appointment.create({
    data: {
      tenantId,
      customerId,
      source: "USER",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "CONFIRMED",
      statusRaw: "CONFIRMED",
      title: "Corte",
      createdBy: "user-1",
    },
  });
}

describe("findDependentsByPhone (Goal142)", () => {
  it("devolve só o dependente confirmado, com id, nome, telefone e responsável", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    const joao = await person(database, tenantId, "João", "5511911112222");
    await relate(database, tenantId, pedro, maria, "CONFIRMED");
    await relate(database, tenantId, joao, maria, "CONFIRMED");

    const items = await service(database).findDependentsByPhone("11987654321");
    expect(items).toEqual([
      {
        id: joao,
        name: "João",
        phone: "+5511911112222",
        guardian: { id: maria, name: "Maria" },
      },
      {
        id: pedro,
        name: "Pedro",
        phone: null,
        guardian: { id: maria, name: "Maria" },
      },
    ]);
  });

  it("relação PROPOSED, relação removida, outro tenant e outro telefone ficam de fora", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const ana = await person(database, tenantId, "Ana", "5511955550000");
    const proposto = await person(database, tenantId, "Proposto");
    const removido = await person(database, tenantId, "Removido");
    const deOutra = await person(database, tenantId, "Filho da Ana");
    await relate(database, tenantId, proposto, maria, "PROPOSED");
    await relate(database, tenantId, removido, maria, "CONFIRMED");
    await relate(database, tenantId, deOutra, ana, "CONFIRMED");
    const outroResponsavel = await person(
      database,
      otherTenantId,
      "Maria B",
      "5511987654321",
    );
    const outroDependente = await person(database, otherTenantId, "Filho B");
    await relate(
      database,
      otherTenantId,
      outroDependente,
      outroResponsavel,
      "CONFIRMED",
    );
    await service(database).clearPrimaryGuardian(removido);

    expect(await service(database).findDependentsByPhone("11987654321")).toEqual(
      [],
    );
    const doOutroTenant = await service(
      database,
      otherTenantId,
    ).findDependentsByPhone("11987654321");
    expect(doOutroTenant.map((item) => item.id)).toEqual([outroDependente]);
  });

  it("telefone sem candidato devolve lista vazia", async () => {
    const database = createDatabaseDouble();
    expect(await service(database).findDependentsByPhone("11900000000")).toEqual(
      [],
    );
  });

  it("dependente que também é candidato do número aparece uma vez", async () => {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const filha = await person(database, tenantId, "Filha", "5511987654321");
    await relate(database, tenantId, filha, maria, "CONFIRMED");

    const items = await service(database).findDependentsByPhone("11987654321");
    expect(items.map((item) => item.id)).toEqual([filha]);
  });
});

describe("listAppointments com includeDependents (Goal142)", () => {
  async function seed() {
    const database = createDatabaseDouble();
    const maria = await person(database, tenantId, "Maria", "5511987654321");
    const pedro = await person(database, tenantId, "Pedro");
    const proposto = await person(database, tenantId, "Proposto");
    await relate(database, tenantId, pedro, maria, "CONFIRMED");
    await relate(database, tenantId, proposto, maria, "PROPOSED");
    const start = new Date("2026-10-20T13:00:00.000Z");
    await book(database, maria, start);
    await book(database, pedro, new Date(start.getTime() + 60 * 60_000));
    await book(database, proposto, new Date(start.getTime() + 120 * 60_000));
    const provider = new AvenlyCalendarProvider(
      database.client as never,
      tenantId,
      "user-1",
      timeZone,
    );
    return { provider, maria, pedro };
  }

  const range = { startDate: "2026-10-20", endDate: "2026-10-20" };

  it("sem a flag só lista os horários dos candidatos, como antes", async () => {
    const { provider, maria } = await seed();
    const omitted = await provider.listAppointments({
      customerPhone: "11987654321",
      ...range,
    });
    const explicit = await provider.listAppointments({
      customerPhone: "11987654321",
      includeDependents: false,
      ...range,
    });
    expect(omitted.map((item) => item.customerId)).toEqual([maria]);
    expect(explicit).toEqual(omitted);
  });

  it("com includeDependents=true traz o dependente confirmado e não o PROPOSED", async () => {
    const { provider, maria, pedro } = await seed();
    const listed = await provider.listAppointments({
      customerPhone: "11987654321",
      includeDependents: true,
      ...range,
    });
    expect(listed.map((item) => item.customerId)).toEqual([maria, pedro]);
  });

  it("a flag não vale sem telefone: customerId continua pelo cliente", async () => {
    const { provider, pedro } = await seed();
    const listed = await provider.listAppointments({
      customerId: pedro,
      includeDependents: true,
      ...range,
    });
    expect(listed.map((item) => item.customerId)).toEqual([pedro]);
  });
});
