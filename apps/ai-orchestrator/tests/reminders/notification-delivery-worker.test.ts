import { describe, expect, it, vi } from "vitest";

import {
  NOTIFICATION_SWEEP_SCOPE,
  NotificationDeliveryWorker,
} from "../../src/modules/reminders/NotificationDeliveryWorker.js";
import type {
  ClaimedNotificationIntent,
  NotificationClaimResult,
} from "../../src/modules/scheduling-service/types.js";

function intent(id: string, tenantId = "tenant-a"): ClaimedNotificationIntent {
  return {
    id,
    tenantId,
    appointmentId: `appointment-${id}`,
    kind: "REMINDER",
    slot: "FIRST",
    appointmentVersion: 1,
    dueAt: "2026-09-15T17:30:00.000Z",
    attemptCount: 0,
    leaseToken: `lease-${id}`,
    leaseExpiresAt: "2026-09-15T17:32:00.000Z",
    correlationId: `notify:appointment-${id}:REMINDER:FIRST:v1`,
    facts: {
      kind: "REMINDER",
      appointmentStatus: "CONFIRMED",
      customerId: "customer-a",
      customerName: "Ana",
      customerPhone: "5511999999999",
      services: ["Corte"],
      title: null,
      timezone: "America/Sao_Paulo",
      date: "2026-09-16",
      time: "14:30",
      startAt: "2026-09-16T17:30:00.000Z",
      price: null,
      confirmationRequested: true,
    },
  };
}

function claimResult(
  claimed: ClaimedNotificationIntent[],
): NotificationClaimResult {
  return {
    owner: "owner-a",
    claimed,
    settled: [],
    released: 0,
    exhausted: 0,
    skipped: 0,
  };
}

const options = {
  pollIntervalMs: 10,
  leaseTtlSeconds: 120,
  batchLimit: 50,
  perTenantLimit: 10,
  owner: "ai-orchestrator:test",
};

describe("notification delivery worker", () => {
  it("claims a batch with its own owner and the configured caps", async () => {
    const claimDueNotificationIntents = vi.fn(async () => claimResult([]));
    const handler = { deliver: vi.fn(async () => undefined) };

    const delivered = await new NotificationDeliveryWorker(
      { claimDueNotificationIntents },
      handler,
      options,
    ).runOnce();

    expect(delivered).toBe(0);
    expect(claimDueNotificationIntents).toHaveBeenCalledWith(
      {
        owner: "ai-orchestrator:test",
        limit: 50,
        perTenantLimit: 10,
        leaseTtlSeconds: 120,
      },
      // A reivindicacao atravessa negocios: o tenant do cabecalho e contexto,
      // nunca escopo, e por isso ele e um nome declarado.
      expect.objectContaining({ tenantId: NOTIFICATION_SWEEP_SCOPE }),
    );
  });

  it("delivers every claimed intent of the batch", async () => {
    const claimDueNotificationIntents = vi.fn(async () =>
      claimResult([intent("a"), intent("b", "tenant-b")]),
    );
    const handler = { deliver: vi.fn(async () => undefined) };

    const delivered = await new NotificationDeliveryWorker(
      { claimDueNotificationIntents },
      handler,
      options,
    ).runOnce();

    expect(delivered).toBe(2);
    expect(handler.deliver).toHaveBeenCalledTimes(2);
  });

  it("does not let one failed intent stop the rest of the batch", async () => {
    const claimDueNotificationIntents = vi.fn(async () =>
      claimResult([intent("a"), intent("b")]),
    );
    const handler = {
      deliver: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(undefined),
    };
    const error = vi.fn();

    const delivered = await new NotificationDeliveryWorker(
      { claimDueNotificationIntents },
      handler,
      options,
      { info: vi.fn(), warn: vi.fn(), error },
    ).runOnce();

    expect(delivered).toBe(2);
    expect(handler.deliver).toHaveBeenCalledTimes(2);
    // A intencao que falhou espera o lease vencer; ela nao some com o ciclo.
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ intentId: "a" }),
      expect.stringContaining("lease"),
    );
  });

  it("does not run two cycles at the same time", async () => {
    let resolveClaim: (value: NotificationClaimResult) => void = () =>
      undefined;
    const claimDueNotificationIntents = vi.fn(
      () =>
        new Promise<NotificationClaimResult>((resolve) => {
          resolveClaim = resolve;
        }),
    );
    const handler = { deliver: vi.fn(async () => undefined) };
    const worker = new NotificationDeliveryWorker(
      { claimDueNotificationIntents },
      handler,
      options,
    );

    const first = worker.runOnce();
    const second = await worker.runOnce();
    resolveClaim(claimResult([intent("a")]));

    expect(second).toBe(0);
    expect(await first).toBe(1);
    expect(claimDueNotificationIntents).toHaveBeenCalledTimes(1);
  });
});
