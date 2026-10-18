import { describe, expect, it } from "vitest";

import {
  DEFAULT_REMINDER_LEAD_MINUTES,
  MAX_REMINDER_LEAD_MINUTES,
  MAX_REMINDER_MESSAGE_EXAMPLE_LENGTH,
  ReminderService,
} from "../../src/modules/reminders/reminder-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";

function service(database = createDatabaseDouble()) {
  return {
    database,
    reminders: new ReminderService(database.client as never, tenantId),
  };
}

describe("reminder configuration: default without a row", () => {
  it("reads as a single reminder at 24 hours, by the named constant, not configured", async () => {
    const { reminders } = service();
    const config = await reminders.get();
    expect(config.configured).toBe(false);
    expect(config.confirmationEnabled).toBe(false);
    expect(config.pricePolicy).toBe("NEVER");
    expect(config.rules).toEqual([
      { slot: "FIRST", leadMinutes: DEFAULT_REMINDER_LEAD_MINUTES },
    ]);
    expect(DEFAULT_REMINDER_LEAD_MINUTES).toBe(24 * 60);
  });

  it("RED: never fabricates a ReminderSettings row just by reading", async () => {
    const { database, reminders } = service();
    await reminders.get();
    // GREEN: reading never writes; the row still does not exist.
    expect(database.tables.reminderSettings.rows).toHaveLength(0);
  });
});

describe("reminder configuration: zero reminders is an explicit choice", () => {
  it("is distinguishable from never having configured", async () => {
    const { reminders } = service();
    const saved = await reminders.set({ rules: [] });
    expect(saved.configured).toBe(true);
    expect(saved.rules).toEqual([]);

    const read = await reminders.get();
    expect(read.configured).toBe(true);
    expect(read.rules).toEqual([]);
  });

  it("RED: a business that turned reminders off never reads back the default", async () => {
    const { reminders } = service();
    await reminders.set({ rules: [] });
    const read = await reminders.get();
    // GREEN: no fabricated FIRST/24h reminder for a business that opted out.
    expect(read.rules).not.toContainEqual(
      expect.objectContaining({ leadMinutes: DEFAULT_REMINDER_LEAD_MINUTES }),
    );
  });

  it("saves up to two reminders and reads them back sorted by slot", async () => {
    const { reminders } = service();
    const saved = await reminders.set({
      rules: [
        { slot: "SECOND", leadMinutes: 60 },
        { slot: "FIRST", leadMinutes: DEFAULT_REMINDER_LEAD_MINUTES },
      ],
    });
    expect(saved.rules).toEqual([
      { slot: "FIRST", leadMinutes: DEFAULT_REMINDER_LEAD_MINUTES },
      { slot: "SECOND", leadMinutes: 60 },
    ]);
    const read = await reminders.get();
    expect(read.rules).toEqual(saved.rules);
  });
});

describe("reminder configuration: lead time validation", () => {
  it("refuses zero lead minutes with its own code", async () => {
    const { reminders } = service();
    await expect(
      reminders.set({ rules: [{ slot: "FIRST", leadMinutes: 0 }] }),
    ).rejects.toMatchObject({ code: "INVALID_REMINDER_LEAD_MINUTES" });
  });

  it("refuses negative lead minutes with its own code", async () => {
    const { reminders } = service();
    await expect(
      reminders.set({ rules: [{ slot: "FIRST", leadMinutes: -30 }] }),
    ).rejects.toMatchObject({ code: "INVALID_REMINDER_LEAD_MINUTES" });
  });

  it("refuses lead minutes above the declared ceiling", async () => {
    const { reminders } = service();
    await expect(
      reminders.set({
        rules: [
          { slot: "FIRST", leadMinutes: MAX_REMINDER_LEAD_MINUTES + 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_REMINDER_LEAD_MINUTES" });
  });

  it("accepts lead minutes exactly at the declared ceiling", async () => {
    const { reminders } = service();
    const saved = await reminders.set({
      rules: [{ slot: "FIRST", leadMinutes: MAX_REMINDER_LEAD_MINUTES }],
    });
    expect(saved.rules).toEqual([
      { slot: "FIRST", leadMinutes: MAX_REMINDER_LEAD_MINUTES },
    ]);
  });

  it("refuses more than two rules and a repeated slot", async () => {
    const { reminders } = service();
    await expect(
      reminders.set({
        rules: [
          { slot: "FIRST", leadMinutes: 60 },
          { slot: "SECOND", leadMinutes: 120 },
          { slot: "FIRST", leadMinutes: 180 },
        ],
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REMINDER_RULES" });

    await expect(
      reminders.set({
        rules: [
          { slot: "FIRST", leadMinutes: 60 },
          { slot: "FIRST", leadMinutes: 120 },
        ],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_REMINDER_SLOT" });
  });
});

describe("reminder configuration: price policy", () => {
  it("defaults to NEVER, both unconfigured and when saved without an explicit policy", async () => {
    const { reminders } = service();
    expect((await reminders.get()).pricePolicy).toBe("NEVER");
    const saved = await reminders.set({ rules: [] });
    expect(saved.pricePolicy).toBe("NEVER");
  });

  it("accepts an explicit WHEN_FIXED policy", async () => {
    const { reminders } = service();
    const saved = await reminders.set({
      rules: [],
      pricePolicy: "WHEN_FIXED",
    });
    expect(saved.pricePolicy).toBe("WHEN_FIXED");
  });
});

describe("reminder configuration: does not leak across tenants", () => {
  it("keeps configuration scoped to the tenant", async () => {
    const database = createDatabaseDouble();
    const a = new ReminderService(database.client as never, "tenant-a");
    const b = new ReminderService(database.client as never, "tenant-b");
    await a.set({ rules: [{ slot: "FIRST", leadMinutes: 90 }] });
    const readB = await b.get();
    expect(readB.configured).toBe(false);
    expect(readB.rules).toEqual([
      { slot: "FIRST", leadMinutes: DEFAULT_REMINDER_LEAD_MINUTES },
    ]);
  });
});

describe("reminder configuration: message example (D-197)", () => {
  it("is null by default, both unconfigured and when saved without one", async () => {
    const { reminders } = service();
    expect((await reminders.get()).messageExample).toBeNull();
    const saved = await reminders.set({ rules: [] });
    expect(saved.messageExample).toBeNull();
  });

  it("saves the trimmed text and reads it back", async () => {
    const { reminders } = service();
    const saved = await reminders.set({
      messageExample: "  Oii, {nome}! 💛\nTe espero {data}, às {hora}.  ",
      rules: [{ slot: "FIRST", leadMinutes: 1440 }],
    });
    expect(saved.messageExample).toBe(
      "Oii, {nome}! 💛\nTe espero {data}, às {hora}.",
    );
    expect((await reminders.get()).messageExample).toBe(saved.messageExample);
  });

  it("keeps the saved text when the body does not mention it", async () => {
    const { reminders } = service();
    await reminders.set({ messageExample: "Oii, {nome}!", rules: [] });
    const saved = await reminders.set({
      confirmationEnabled: true,
      rules: [{ slot: "FIRST", leadMinutes: 120 }],
    });
    expect(saved.messageExample).toBe("Oii, {nome}!");
    expect((await reminders.get()).messageExample).toBe("Oii, {nome}!");
  });

  it("goes back to the default with null or an empty text", async () => {
    const { reminders } = service();
    await reminders.set({ messageExample: "Oii, {nome}!", rules: [] });
    expect(
      (await reminders.set({ messageExample: "   ", rules: [] })).messageExample,
    ).toBeNull();
    await reminders.set({ messageExample: "Oii, {nome}!", rules: [] });
    expect(
      (await reminders.set({ messageExample: null, rules: [] })).messageExample,
    ).toBeNull();
    expect((await reminders.get()).messageExample).toBeNull();
  });

  it("refuses a text above the declared ceiling", async () => {
    const { reminders } = service();
    await expect(
      reminders.set({
        messageExample: "a".repeat(MAX_REMINDER_MESSAGE_EXAMPLE_LENGTH + 1),
        rules: [],
      }),
    ).rejects.toMatchObject({ code: "INVALID_REMINDER_MESSAGE_EXAMPLE" });
    const atCeiling = "a".repeat(MAX_REMINDER_MESSAGE_EXAMPLE_LENGTH);
    expect(
      (await reminders.set({ messageExample: atCeiling, rules: [] }))
        .messageExample,
    ).toBe(atCeiling);
  });
});
