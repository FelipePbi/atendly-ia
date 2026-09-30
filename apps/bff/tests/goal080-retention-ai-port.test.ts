import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const { defaultRetentionPorts, retentionCutoffs } = await import(
  "../src/modules/retention/sweep.js"
);

/**
 * Goal080/§6.6 — a porta da IA entrega os três cutoffs e o cliente os
 * serializa em ISO-8601. Sem banco: o upstream é um dobro de `fetch`.
 */
describe("Goal080/§6.6: porta da IA da varredura", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializa commercialCutoff, personalCutoff e unclassifiedCutoff em ISO-8601", async () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const cutoffs = retentionCutoffs(now, {
      commercialRetentionDays: 180,
      personalRetentionDays: 30,
    });

    let sent: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            data: {
              messages: 0,
              messageAttachments: 0,
              aiRuns: 0,
              aiToolCalls: 0,
              conversationsMarked: 0,
              processedEvents: 0,
              hasMore: false,
            },
            requestId: "req-1",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const ports = defaultRetentionPorts(
      null as unknown as Parameters<typeof defaultRetentionPorts>[0],
    );
    await ports.ai({ tenantId: "tenant-1", cutoffs, maxRows: 25 });

    expect(sent).toEqual({
      commercialCutoff: cutoffs.commercialCutoff.toISOString(),
      personalCutoff: cutoffs.personalCutoff.toISOString(),
      unclassifiedCutoff: cutoffs.unclassifiedCutoff.toISOString(),
      maxRows: 25,
    });
    expect(cutoffs.unclassifiedCutoff.toISOString()).toBe(
      cutoffs.commercialCutoff.toISOString(),
    );
  });
});
