import { describe, expect, it } from "vitest";

import { clearExpiredNotificationContent } from "../../src/modules/reminders/notification-retention-service.js";
import { createDatabaseDouble } from "./support/database-double.js";

/**
 * Esvaziamento de conteúdo das intenções terminais (Goal023, WU-03, G-29).
 *
 * Aqui se prova o recorte: só estado terminal fora do prazo perde `facts` e
 * `detail`, a linha sobrevive, `PENDING`/`CLAIMED` nunca são tocadas mesmo com
 * lease vencido, o teto de linhas é respeitado e sinalizado, uma segunda
 * passada imediata é inócua, e o escopo é por tenant.
 */

const tenantA = "tenant-a";
const tenantB = "tenant-b";

type Database = ReturnType<typeof createDatabaseDouble>;

function pushIntent(
  database: Database,
  overrides: Partial<{
    id: string;
    tenantId: string;
    appointmentId: string;
    state: string;
    settledAt: Date | null;
    facts: unknown;
    detail: string | null;
    leaseOwner: string | null;
    leaseToken: string | null;
    leaseExpiresAt: Date | null;
  }>,
) {
  database.tables.appointmentNotificationIntent.rows.push({
    id: overrides.id ?? "intent-1",
    tenantId: overrides.tenantId ?? tenantA,
    appointmentId: overrides.appointmentId ?? overrides.id ?? "appointment-1",
    kind: "REMINDER",
    slot: "FIRST",
    appointmentVersion: 1,
    state: overrides.state ?? "SENT",
    reason: overrides.state === "FAILED" ? "ATTEMPTS_EXHAUSTED" : null,
    detail: overrides.detail === undefined ? "some failure detail" : overrides.detail,
    dueAt: new Date("2026-09-01T10:00:00.000Z"),
    facts:
      overrides.facts === undefined
        ? { customerPhone: "+5511999990000" }
        : overrides.facts,
    attemptCount: 0,
    lastAttemptAt: null,
    leaseOwner: overrides.leaseOwner ?? null,
    leaseToken: overrides.leaseToken ?? null,
    leaseAcquiredAt: null,
    leaseExpiresAt: overrides.leaseExpiresAt ?? null,
    leaseHeartbeatAt: null,
    outboundCorrelationId: null,
    sentAt: null,
    settledAt:
      overrides.settledAt === undefined
        ? new Date("2026-09-01T10:05:00.000Z")
        : overrides.settledAt,
  });
}

function rowById(database: Database, id: string) {
  const row = database.tables.appointmentNotificationIntent.rows.find(
    (candidate) => candidate.id === id,
  );
  if (!row) throw new Error(`intent ${id} not found`);
  return row;
}

const cutoff = new Date("2026-09-10T00:00:00.000Z");

describe("clearExpiredNotificationContent (Goal023, WU-03)", () => {
  it("esvazia facts e detail de intenção terminal liquidada antes do prazo, e a linha permanece", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, {
      id: "old-sent",
      state: "SENT",
      settledAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = await clearExpiredNotificationContent(
      database.client as never,
      { tenantId: tenantA, settledBefore: cutoff, maxRows: 100 },
    );

    expect(result).toEqual({ cleared: 1, hasMore: false });
    const row = rowById(database, "old-sent");
    expect(row.facts).toBeNull();
    expect(row.detail).toBeNull();
    expect(row.id).toBe("old-sent");
    expect(row.state).toBe("SENT");
  });

  it("nunca esvazia intenção liquidada dentro do prazo", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, {
      id: "recent-sent",
      state: "SENT",
      settledAt: new Date("2026-09-15T00:00:00.000Z"),
    });

    const result = await clearExpiredNotificationContent(
      database.client as never,
      { tenantId: tenantA, settledBefore: cutoff, maxRows: 100 },
    );

    expect(result).toEqual({ cleared: 0, hasMore: false });
    const row = rowById(database, "recent-sent");
    expect(row.facts).not.toBeNull();
    expect(row.detail).not.toBeNull();
  });

  for (const terminal of ["SENT", "FAILED", "DISMISSED", "CANCELLED"]) {
    it(`esvazia estado terminal ${terminal} fora do prazo`, async () => {
      const database = createDatabaseDouble();
      pushIntent(database, {
        id: `intent-${terminal}`,
        state: terminal,
        settledAt: new Date("2026-09-01T00:00:00.000Z"),
      });

      const result = await clearExpiredNotificationContent(
        database.client as never,
        { tenantId: tenantA, settledBefore: cutoff, maxRows: 100 },
      );

      expect(result.cleared).toBe(1);
      const row = rowById(database, `intent-${terminal}`);
      expect(row.facts).toBeNull();
      expect(row.detail).toBeNull();
    });
  }

  it("nunca toca intenção PENDING, mesmo com dueAt antigo", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, {
      id: "pending-1",
      state: "PENDING",
      settledAt: null,
      detail: null,
    });

    const result = await clearExpiredNotificationContent(
      database.client as never,
      { tenantId: tenantA, settledBefore: cutoff, maxRows: 100 },
    );

    expect(result).toEqual({ cleared: 0, hasMore: false });
    const row = rowById(database, "pending-1");
    expect(row.facts).not.toBeNull();
  });

  it("nunca toca intenção CLAIMED, mesmo com lease vencido", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, {
      id: "claimed-1",
      state: "CLAIMED",
      settledAt: null,
      detail: null,
      leaseOwner: "scheduling:test:a",
      leaseToken: "lease-token-1",
      leaseExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const result = await clearExpiredNotificationContent(
      database.client as never,
      { tenantId: tenantA, settledBefore: cutoff, maxRows: 100 },
    );

    expect(result).toEqual({ cleared: 0, hasMore: false });
    const row = rowById(database, "claimed-1");
    expect(row.facts).not.toBeNull();
    expect(row.leaseToken).toBe("lease-token-1");
  });

  it("respeita o teto de linhas e sinaliza que resta trabalho", async () => {
    const database = createDatabaseDouble();
    for (let index = 0; index < 3; index += 1) {
      pushIntent(database, {
        id: `intent-${index}`,
        state: "SENT",
        settledAt: new Date(2026, 7, 1 + index),
      });
    }

    const result = await clearExpiredNotificationContent(
      database.client as never,
      { tenantId: tenantA, settledBefore: cutoff, maxRows: 2 },
    );

    expect(result).toEqual({ cleared: 2, hasMore: true });
    const cleared = database.tables.appointmentNotificationIntent.rows.filter(
      (row) => row.facts === null,
    );
    expect(cleared).toHaveLength(2);
  });

  it("uma segunda passada imediata não altera nada", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, {
      id: "old-sent",
      state: "SENT",
      settledAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const first = await clearExpiredNotificationContent(
      database.client as never,
      { tenantId: tenantA, settledBefore: cutoff, maxRows: 100 },
    );
    expect(first).toEqual({ cleared: 1, hasMore: false });

    const second = await clearExpiredNotificationContent(
      database.client as never,
      { tenantId: tenantA, settledBefore: cutoff, maxRows: 100 },
    );
    expect(second).toEqual({ cleared: 0, hasMore: false });
  });

  it("é escopada por tenant: o negócio A não esvazia intenção do negócio B", async () => {
    const database = createDatabaseDouble();
    pushIntent(database, {
      id: "belongs-to-b",
      tenantId: tenantB,
      state: "SENT",
      settledAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = await clearExpiredNotificationContent(
      database.client as never,
      { tenantId: tenantA, settledBefore: cutoff, maxRows: 100 },
    );

    expect(result).toEqual({ cleared: 0, hasMore: false });
    const row = rowById(database, "belongs-to-b");
    expect(row.facts).not.toBeNull();
  });
});
