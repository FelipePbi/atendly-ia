import { describe, expect, it } from "vitest";

import { AtendlyCustomerService } from "../../src/modules/customers/atendly-customer-service.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";

function service(database = createDatabaseDouble()) {
  return {
    database,
    customers: new AtendlyCustomerService(
      database.client as never,
      tenantId,
    ),
  };
}

describe("customer identity", () => {
  it("keeps two people with the same phone as two different people", async () => {
    const { customers } = service();
    const maria = await customers.create({
      name: "Maria",
      phone: "+55 11 90000-0001",
    });
    const pedro = await customers.create({
      name: "Pedro",
      phone: "+55 11 90000-0001",
    });

    expect(pedro.id).not.toBe(maria.id);
    const candidates = await customers.findCandidatesByPhone("5511900000001");
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual(
      [maria.id, pedro.id].sort(),
    );
  });

  it("creates a customer without a phone", async () => {
    const { customers } = service();
    const child = await customers.create({ name: "Pedro" });
    expect(child.phone).toBeNull();
    expect(child.normalizedPhone).toBeNull();
  });

  it("refuses a customer with neither name nor phone", async () => {
    const { customers } = service();
    await expect(customers.create({})).rejects.toMatchObject({
      code: "CUSTOMER_IDENTIFICATION_REQUIRED",
    });
  });

  it("never renames anyone on creation: creating with a known phone does not touch the existing person", async () => {
    const { customers } = service();
    const maria = await customers.create({
      name: "Maria",
      phone: "5511900000001",
    });
    await customers.create({ name: "Pedro", phone: "5511900000001" });

    expect((await customers.get(maria.id)).name).toBe("Maria");
  });

  it("changes the name only through the explicit update operation", async () => {
    const { customers } = service();
    const maria = await customers.create({
      name: "Maria",
      phone: "5511900000001",
    });
    const renamed = await customers.update(maria.id, { name: "Maria Souza" });
    expect(renamed.name).toBe("Maria Souza");
  });

  it("refuses an update that would leave the person with no name and no phone", async () => {
    const { customers } = service();
    const person = await customers.create({ name: "Pedro" });
    await expect(
      customers.update(person.id, { name: null }),
    ).rejects.toMatchObject({ code: "CUSTOMER_IDENTIFICATION_REQUIRED" });
  });

  it("does not leak customers across tenants", async () => {
    const database = createDatabaseDouble();
    const a = new AtendlyCustomerService(database.client as never, "tenant-a");
    const b = new AtendlyCustomerService(database.client as never, "tenant-b");
    const inA = await a.create({ name: "Maria", phone: "5511900000001" });
    await b.create({ name: "Maria", phone: "5511900000001" });

    expect(await b.findCandidatesByPhone("5511900000001")).toHaveLength(1);
    expect(
      (await b.findCandidatesByPhone("5511900000001"))[0]?.id,
    ).not.toBe(inA.id);
    await expect(b.get(inA.id)).rejects.toBeInstanceOf(AppError);
  });
});

describe("primary guardian", () => {
  it("is only proposed until an explicit confirmation arrives, keeping provenance", async () => {
    const { customers } = service();
    const pedro = await customers.create({ name: "Pedro" });
    const maria = await customers.create({
      name: "Maria",
      phone: "5511900000001",
    });

    const proposed = await customers.setPrimaryGuardian(pedro.id, {
      guardianCustomerId: maria.id,
      proposedBy: "AI",
    });
    expect(proposed.status).toBe("PROPOSED");
    expect(proposed.proposedBy).toBe("AI");
    expect(proposed.confirmedAt).toBeNull();

    const confirmed = await customers.confirmPrimaryGuardian(pedro.id, {
      confirmedBy: "PROFESSIONAL",
      actor: "user-1",
    });
    expect(confirmed.status).toBe("CONFIRMED");
    // A proveniência da proposta sobrevive à confirmação.
    expect(confirmed.proposedBy).toBe("AI");
    expect(confirmed.confirmedBy).toBe("PROFESSIONAL");
  });

  it("refuses a relation the assistant tries to confirm by itself", async () => {
    const { customers } = service();
    const pedro = await customers.create({ name: "Pedro" });
    const maria = await customers.create({ name: "Maria" });

    await expect(
      customers.setPrimaryGuardian(pedro.id, {
        guardianCustomerId: maria.id,
        proposedBy: "AI",
        confirmedBy: "CUSTOMER",
      }),
    ).rejects.toMatchObject({
      code: "CUSTOMER_RELATION_CONFIRMATION_REQUIRED",
    });
  });

  it("keeps a merely proposed relation out of what the assistant reads", async () => {
    const { customers } = service();
    const pedro = await customers.create({ name: "Pedro" });
    const maria = await customers.create({ name: "Maria" });
    await customers.setPrimaryGuardian(pedro.id, {
      guardianCustomerId: maria.id,
      proposedBy: "AI",
    });

    expect(
      (await customers.aiAuthorizedContext(pedro.id)).primaryGuardian,
    ).toBeNull();

    await customers.confirmPrimaryGuardian(pedro.id, {
      confirmedBy: "PROFESSIONAL",
    });
    expect(
      (await customers.aiAuthorizedContext(pedro.id)).primaryGuardian,
    ).not.toBeNull();
  });
});

describe("notes and tags authorisation", () => {
  it("does not hand an unauthorised note or tag to the assistant", async () => {
    const { customers } = service();
    const maria = await customers.create({ name: "Maria" });
    await customers.addNote(maria.id, { body: "Prefere fim da tarde." });
    await customers.addTag(maria.id, { label: "vip" });

    const authorized = await customers.aiAuthorizedContext(maria.id);
    expect(authorized.notes).toHaveLength(0);
    expect(authorized.tags).toHaveLength(0);
    // O registro continua existindo para a profissional.
    expect(await customers.listNotes(maria.id)).toHaveLength(1);
    expect(await customers.listTags(maria.id)).toHaveLength(1);
  });

  it("hands over exactly what was explicitly authorised", async () => {
    const { customers } = service();
    const maria = await customers.create({ name: "Maria" });
    const note = await customers.addNote(maria.id, { body: "Alergia a X." });
    await customers.addNote(maria.id, { body: "Assunto pessoal." });
    await customers.addTag(maria.id, { label: "vip", aiAuthorized: true });
    await customers.addTag(maria.id, { label: "interno" });

    await customers.setNoteAuthorization(maria.id, note.id, {
      aiAuthorized: true,
      actor: "user-1",
    });

    const authorized = await customers.aiAuthorizedContext(maria.id);
    expect(authorized.notes.map((item) => item.body)).toEqual(["Alergia a X."]);
    expect(authorized.tags.map((item) => item.label)).toEqual(["vip"]);
  });

  it("revokes authorisation when it is withdrawn", async () => {
    const { customers } = service();
    const maria = await customers.create({ name: "Maria" });
    const note = await customers.addNote(maria.id, {
      body: "Alergia a X.",
      aiAuthorized: true,
    });
    await customers.setNoteAuthorization(maria.id, note.id, {
      aiAuthorized: false,
    });

    expect((await customers.aiAuthorizedContext(maria.id)).notes).toHaveLength(
      0,
    );
  });
});
