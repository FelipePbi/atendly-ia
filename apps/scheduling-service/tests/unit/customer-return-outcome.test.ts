import { describe, expect, it } from "vitest";

import {
  type OutcomeCampaign,
  type OutcomeTarget,
  returnOutcome,
} from "../../src/modules/customer-return/return-outcome.js";

const NOW = new Date("2026-10-20T15:00:00.000Z");
const ACTIVE: OutcomeCampaign = { state: "ACTIVE", completedAt: null };

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function target(overrides: Partial<OutcomeTarget> = {}): OutcomeTarget {
  return {
    state: "SENT",
    reason: null,
    sentAt: daysBefore(1),
    followUpState: null,
    followUpSentAt: null,
    ...overrides,
  };
}

describe("returnOutcome", () => {
  it("traduz os estados que não dependem do tempo", () => {
    expect(returnOutcome(target({ state: "QUEUED" }), ACTIVE, NOW)).toBe(
      "QUEUED",
    );
    expect(returnOutcome(target({ state: "CLAIMED" }), ACTIVE, NOW)).toBe(
      "SENDING",
    );
    expect(returnOutcome(target({ state: "REPLIED" }), ACTIVE, NOW)).toBe(
      "REPLIED",
    );
    expect(returnOutcome(target({ state: "BOOKED" }), ACTIVE, NOW)).toBe(
      "BOOKED",
    );
    expect(returnOutcome(target({ state: "SKIPPED" }), ACTIVE, NOW)).toBe(
      "NOT_SENT",
    );
    expect(returnOutcome(target({ state: "FAILED" }), ACTIVE, NOW)).toBe(
      "FAILED",
    );
  });

  it("separa a recusa do pedido para parar", () => {
    expect(
      returnOutcome(
        target({ state: "DECLINED", reason: "DECLINED" }),
        ACTIVE,
        NOW,
      ),
    ).toBe("DECLINED");
    expect(
      returnOutcome(
        target({ state: "DECLINED", reason: "STOPPED" }),
        ACTIVE,
        NOW,
      ),
    ).toBe("STOPPED");
  });

  it("enviada há pouco espera resposta; o lembrete ainda vem", () => {
    expect(returnOutcome(target({ sentAt: daysBefore(2) }), ACTIVE, NOW)).toBe(
      "AWAITING",
    );
    // Lembrete atrasado pela fila cheia: ainda não desistimos dela.
    expect(returnOutcome(target({ sentAt: daysBefore(5) }), ACTIVE, NOW)).toBe(
      "AWAITING",
    );
    expect(returnOutcome(target({ sentAt: daysBefore(8) }), ACTIVE, NOW)).toBe(
      "NO_REPLY",
    );
  });

  it("depois do lembrete, espera mais 3 dias antes de dar sem resposta", () => {
    const reminded = (days: number) =>
      target({
        sentAt: daysBefore(days + 3),
        followUpState: "SENT",
        followUpSentAt: daysBefore(days),
      });
    expect(returnOutcome(reminded(1), ACTIVE, NOW)).toBe("AWAITING");
    expect(returnOutcome(reminded(3), ACTIVE, NOW)).toBe("NO_REPLY");
  });

  it("lembrete descartado ou que falhou encerra o contato", () => {
    for (const followUpState of ["SKIPPED", "FAILED"]) {
      expect(
        returnOutcome(
          target({ sentAt: daysBefore(3), followUpState }),
          ACTIVE,
          NOW,
        ),
      ).toBe("NO_REPLY");
    }
  });

  it("sem lembrete possível, 3 dias sem resposta bastam", () => {
    const old = target({ sentAt: daysBefore(4) });
    expect(
      returnOutcome(old, { state: "PAUSED", completedAt: null }, NOW),
    ).toBe("NO_REPLY");
    expect(
      returnOutcome(old, { state: "CANCELLED", completedAt: null }, NOW),
    ).toBe("NO_REPLY");
    expect(
      returnOutcome(old, { state: "DONE", completedAt: daysBefore(20) }, NOW),
    ).toBe("NO_REPLY");
    // Encerrada há pouco ainda manda o lembrete.
    expect(
      returnOutcome(old, { state: "DONE", completedAt: daysBefore(2) }, NOW),
    ).toBe("AWAITING");
  });
});
