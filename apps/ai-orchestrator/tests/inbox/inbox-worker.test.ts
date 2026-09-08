import { describe, expect, it, vi } from "vitest";

import type {
  InboxClaim,
  InboxPort,
} from "../../src/modules/inbox/InboxStore.js";
import { InboxWorker } from "../../src/modules/inbox/InboxWorker.js";

function claim(overrides: Partial<InboxClaim> = {}): InboxClaim {
  return {
    leaseToken: "lease-1",
    leaseExpiresAt: new Date(Date.now() + 60_000),
    conversationKey: "tenant-a:channel-a:5511999999999",
    events: [
      {
        id: "event-1",
        tenantId: "tenant-a",
        channelId: "channel-a",
        eventKey: "evolution-go:instance-a:3EB0",
        eventType: "message",
        conversationKey: "tenant-a:channel-a:5511999999999",
        messageId: "3EB0",
        rawPayload: { event: "Message" },
        receivedAt: new Date(),
        attempts: 1,
      },
    ],
    ...overrides,
  };
}

function fakeInbox(
  claims: Array<InboxClaim | null>,
  options: { renewals?: number[] } = {},
) {
  const queue = [...claims];
  const complete = vi.fn(async () => 1);
  const fail = vi.fn(async () => ({ retrying: true, deadLettered: false }));
  const pending = [...(options.renewals ?? [])];
  const renewLease = vi.fn(async () => pending.shift() ?? 1);
  const inbox: InboxPort = {
    record: async () => ({ stored: true, duplicate: false, id: "event-1" }),
    applyConversationWindow: async () => null,
    claimNext: async () => queue.shift() ?? null,
    complete,
    fail,
    renewLease,
    requestSupersede: async () => 0,
    isSupersedeRequested: async () => false,
    countDeadLetters: async () => 0,
  };
  return { inbox, complete, fail, renewLease };
}

const options = {
  pollIntervalMs: 10,
  leaseMs: 60_000,
  groupWindowMs: 1_000,
  batchLimit: 10,
  maxConcurrentConversations: 3,
};

describe("inbox worker", () => {
  it("completes a claimed batch with its own lease token", async () => {
    const { inbox, complete } = fakeInbox([claim(), null]);
    const handler = {
      dispatch: vi.fn().mockResolvedValue({
        status: "DONE" as const,
        result: { kind: "message" },
      }),
    };

    const processed = await new InboxWorker(inbox, handler, options).runOnce();

    expect(processed).toBe(1);
    expect(complete).toHaveBeenCalledWith({
      ids: ["event-1"],
      leaseToken: "lease-1",
      status: "DONE",
      result: { kind: "message" },
    });
  });

  it("does not apply a result when the lease is no longer ours", async () => {
    const { inbox } = fakeInbox([claim(), null]);
    const expired = { ...inbox, complete: vi.fn(async () => 0) };
    const warn = vi.fn();
    const handler = {
      dispatch: vi
        .fn()
        .mockResolvedValue({ status: "DONE" as const, result: {} }),
    };

    await new InboxWorker(expired, handler, options, {
      info: vi.fn(),
      warn,
      error: vi.fn(),
    }).runOnce();

    // Fencing: outro worker recuperou o lease expirado e a palavra final é
    // dele. Este não sobrescreve o resultado.
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ events: 1 }),
      expect.stringContaining("expired lease"),
    );
  });

  it("schedules a retry when the batch fails", async () => {
    const { inbox, fail } = fakeInbox([claim(), null]);
    const handler = {
      dispatch: vi.fn().mockRejectedValue(new Error("assistant is down")),
    };

    await new InboxWorker(inbox, handler, options).runOnce();

    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ leaseToken: "lease-1", retryable: true }),
    );
  });

  it("reports a dead-letter as an error instead of retrying forever", async () => {
    const { inbox } = fakeInbox([claim(), null]);
    const deadLettering = {
      ...inbox,
      fail: vi.fn(async () => ({ retrying: false, deadLettered: true })),
    };
    const error = vi.fn();
    const handler = {
      dispatch: vi.fn().mockRejectedValue(new Error("assistant is down")),
    };

    await new InboxWorker(deadLettering, handler, options, {
      info: vi.fn(),
      warn: vi.fn(),
      error,
    }).runOnce();

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ deadLettered: true }),
      expect.stringContaining("dead-letter"),
    );
  });

  it("runs distinct conversations in parallel up to the configured limit", async () => {
    const claims = [
      claim({ leaseToken: "lease-a", conversationKey: "tenant-a:channel-a:1" }),
      claim({ leaseToken: "lease-b", conversationKey: "tenant-a:channel-a:2" }),
      claim({ leaseToken: "lease-c", conversationKey: "tenant-a:channel-a:3" }),
      claim({ leaseToken: "lease-d", conversationKey: "tenant-a:channel-a:4" }),
    ];
    const { inbox } = fakeInbox(claims);
    let inFlight = 0;
    let peak = 0;
    const handler = {
      dispatch: vi.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { status: "DONE" as const, result: {} };
      }),
    };

    const processed = await new InboxWorker(inbox, handler, options).runOnce();

    expect(processed).toBe(3);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("heartbeat do lease", () => {
  it("renova o lease enquanto o lote longo executa", async () => {
    vi.useFakeTimers();
    try {
      const { inbox, renewLease, complete } = fakeInbox([claim(), null]);
      let release = () => undefined as void;
      const handler = {
        dispatch: vi.fn(
          () =>
            new Promise<{ status: "DONE"; result: Record<string, unknown> }>(
              (resolve) => {
                release = () => resolve({ status: "DONE", result: {} });
              },
            ),
        ),
      };
      const worker = new InboxWorker(inbox, handler, {
        ...options,
        leaseHeartbeatMs: 1_000,
      });

      const cycle = worker.runOnce();
      // Lote longo: tres batidas de heartbeat antes de terminar.
      await vi.advanceTimersByTimeAsync(3_500);
      expect(renewLease.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(renewLease).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ["event-1"],
          leaseToken: "lease-1",
          leaseMs: 60_000,
        }),
      );

      release();
      await cycle;
      expect(complete).toHaveBeenCalledTimes(1);

      // Terminou: nenhuma renovacao a mais depois da conclusao.
      const afterFinish = renewLease.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(renewLease.mock.calls.length).toBe(afterFinish);
    } finally {
      vi.useRealTimers();
    }
  });

  it("para de renovar quando o lease ja nao e mais nosso", async () => {
    vi.useFakeTimers();
    try {
      const { inbox, renewLease } = fakeInbox([claim(), null], {
        renewals: [0],
      });
      let release = () => undefined as void;
      const handler = {
        dispatch: vi.fn(
          () =>
            new Promise<{ status: "DONE"; result: Record<string, unknown> }>(
              (resolve) => {
                release = () => resolve({ status: "DONE", result: {} });
              },
            ),
        ),
      };
      const worker = new InboxWorker(inbox, handler, {
        ...options,
        leaseHeartbeatMs: 1_000,
      });

      const cycle = worker.runOnce();
      await vi.advanceTimersByTimeAsync(5_000);
      // Fencing preservado: quem perdeu o lease nao o traz de volta.
      expect(renewLease).toHaveBeenCalledTimes(1);

      release();
      await cycle;
    } finally {
      vi.useRealTimers();
    }
  });
});
