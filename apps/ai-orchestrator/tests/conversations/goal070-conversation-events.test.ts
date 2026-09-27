import { describe, expect, it, vi } from "vitest";

import {
  type ConversationToolCallRecord,
  deriveConversationEvents,
} from "../../src/modules/conversations/conversation-events.js";

const TENANT = "tenant-a";
const CONVERSATION = "conversation-a";
const NOW = new Date("2026-09-27T13:00:00.000Z");

function prepareCall(
  overrides: Partial<ConversationToolCallRecord> & {
    date?: string;
    startTime?: string;
    holdExpiresAt?: string;
  } = {},
): ConversationToolCallRecord {
  const { date, startTime, holdExpiresAt, ...rest } = overrides;
  return {
    id: "call-prepare",
    createdAt: new Date("2026-09-27T12:00:00.000Z"),
    completedAt: new Date("2026-09-27T12:00:01.000Z"),
    status: "SUCCEEDED",
    arguments: { action: "prepare" },
    result: {
      ok: true,
      data: {
        pendingAction: {
          date: date ?? "2026-09-27",
          startTime: startTime ?? "15:30",
        },
        hold: { id: "hold-1", expiresAt: holdExpiresAt ?? "2026-09-27T13:46:00.000Z" },
      },
    },
    ...rest,
  };
}

function confirmCall(
  overrides: Partial<ConversationToolCallRecord> & {
    appointmentId?: string;
    date?: string;
    startTime?: string;
  } = {},
): ConversationToolCallRecord {
  const { appointmentId, date, startTime, ...rest } = overrides;
  return {
    id: "call-confirm",
    createdAt: new Date("2026-09-27T12:05:00.000Z"),
    completedAt: new Date("2026-09-27T12:05:01.000Z"),
    status: "SUCCEEDED",
    arguments: { action: "confirm" },
    result: {
      ok: true,
      data: {
        appointment: {
          id: appointmentId ?? "appt-1",
          date: date ?? "2026-09-27",
          startTime: startTime ?? "15:30",
        },
      },
    },
    ...rest,
  };
}

function failedConfirmHoldExpiredCall(
  overrides: Partial<ConversationToolCallRecord> = {},
): ConversationToolCallRecord {
  return {
    id: "call-confirm-failed",
    createdAt: new Date("2026-09-27T12:05:00.000Z"),
    completedAt: new Date("2026-09-27T12:05:01.000Z"),
    status: "FAILED",
    arguments: { action: "confirm" },
    result: {
      ok: false,
      error: {
        code: "APPOINTMENT_HOLD_EXPIRED",
        message: "A reserva expirou.",
        details: { slots: [], confirmed: false },
      },
    },
    ...overrides,
  };
}

function derive(
  toolCalls: ConversationToolCallRecord[],
  now: Date = NOW,
  logger?: {
    warn: (payload: Record<string, unknown>, message?: string) => void;
  },
) {
  return deriveConversationEvents({
    tenantId: TENANT,
    conversationId: CONVERSATION,
    toolCalls,
    now,
    logger,
  });
}

describe("deriveConversationEvents", () => {
  it("prepare seguido de confirm da HOLD_PLACED e APPOINTMENT_CREATED, sem HOLD_EXPIRED", () => {
    const events = derive([prepareCall(), confirmCall()]);

    expect(events.map((event) => event.type)).toEqual([
      "HOLD_PLACED",
      "APPOINTMENT_CREATED",
    ]);
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "HOLD_EXPIRED" }),
    );
  });

  it("prepare, prepare e confirm da dois HOLD_PLACED, um APPOINTMENT_CREATED e nenhum HOLD_EXPIRED", () => {
    const events = derive([
      prepareCall({
        id: "call-prepare-1",
        createdAt: new Date("2026-09-27T11:00:00.000Z"),
        completedAt: new Date("2026-09-27T11:00:01.000Z"),
        holdExpiresAt: "2026-09-27T12:30:00.000Z",
      }),
      prepareCall({
        id: "call-prepare-2",
        createdAt: new Date("2026-09-27T12:00:00.000Z"),
        completedAt: new Date("2026-09-27T12:00:01.000Z"),
        holdExpiresAt: "2026-09-27T13:46:00.000Z",
      }),
      confirmCall(),
    ]);

    expect(events.filter((event) => event.type === "HOLD_PLACED")).toHaveLength(2);
    expect(
      events.filter((event) => event.type === "APPOINTMENT_CREATED"),
    ).toHaveLength(1);
    expect(events.filter((event) => event.type === "HOLD_EXPIRED")).toHaveLength(0);
  });

  it("confirm FAILED com APPOINTMENT_HOLD_EXPIRED da HOLD_EXPIRED e nenhum APPOINTMENT_CREATED", () => {
    const events = derive([
      prepareCall(),
      failedConfirmHoldExpiredCall(),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "HOLD_PLACED",
      "HOLD_EXPIRED",
    ]);
  });

  it("prepare vencido sem confirm da HOLD_EXPIRED; prepare ainda no prazo nao da, com relogio injetado", () => {
    const expired = derive(
      [prepareCall({ holdExpiresAt: "2026-09-27T12:30:00.000Z" })],
      new Date("2026-09-27T12:31:00.000Z"),
    );
    expect(expired.map((event) => event.type)).toEqual([
      "HOLD_PLACED",
      "HOLD_EXPIRED",
    ]);

    const stillOpen = derive(
      [prepareCall({ holdExpiresAt: "2026-09-27T12:30:00.000Z" })],
      new Date("2026-09-27T12:00:00.000Z"),
    );
    expect(stillOpen.map((event) => event.type)).toEqual(["HOLD_PLACED"]);
  });

  it("prepare, confirm FAILED APPOINTMENT_HOLD_EXPIRED, prepare da HOLD_EXPIRED do primeiro hold", () => {
    const events = derive(
      [
        prepareCall({
          id: "call-prepare-1",
          createdAt: new Date("2026-09-27T11:00:00.000Z"),
          completedAt: new Date("2026-09-27T11:00:01.000Z"),
          holdExpiresAt: "2026-09-27T11:15:00.000Z",
        }),
        failedConfirmHoldExpiredCall({
          createdAt: new Date("2026-09-27T11:16:00.000Z"),
          completedAt: new Date("2026-09-27T11:16:01.000Z"),
        }),
        prepareCall({
          id: "call-prepare-2",
          createdAt: new Date("2026-09-27T11:17:00.000Z"),
          completedAt: new Date("2026-09-27T11:17:01.000Z"),
          holdExpiresAt: "2026-09-27T11:32:00.000Z",
        }),
      ],
      new Date("2026-09-27T11:17:02.000Z"),
    );

    expect(
      events.filter((event) => event.type === "HOLD_EXPIRED"),
    ).toEqual([
      expect.objectContaining({
        id: "call-prepare-1:expired",
        occurredAt: "2026-09-27T11:15:00.000Z",
      }),
    ]);
  });

  it("prepare vencido pelo relogio e depois outro prepare da HOLD_EXPIRED do primeiro", () => {
    const events = derive(
      [
        prepareCall({
          id: "call-prepare-1",
          createdAt: new Date("2026-09-27T11:00:00.000Z"),
          completedAt: new Date("2026-09-27T11:00:01.000Z"),
          holdExpiresAt: "2026-09-27T11:15:00.000Z",
        }),
        prepareCall({
          id: "call-prepare-2",
          createdAt: new Date("2026-09-27T12:00:00.000Z"),
          completedAt: new Date("2026-09-27T12:00:01.000Z"),
          holdExpiresAt: "2026-09-27T12:15:00.000Z",
        }),
      ],
      new Date("2026-09-27T12:00:02.000Z"),
    );

    expect(
      events.filter((event) => event.type === "HOLD_EXPIRED"),
    ).toEqual([
      expect.objectContaining({
        id: "call-prepare-1:expired",
        occurredAt: "2026-09-27T11:15:00.000Z",
      }),
    ]);
  });

  it("prepare seguido de outro prepare antes do vencimento continua sem HOLD_EXPIRED", () => {
    const events = derive(
      [
        prepareCall({
          id: "call-prepare-1",
          createdAt: new Date("2026-09-27T11:00:00.000Z"),
          completedAt: new Date("2026-09-27T11:00:01.000Z"),
          holdExpiresAt: "2026-09-27T11:15:00.000Z",
        }),
        prepareCall({
          id: "call-prepare-2",
          createdAt: new Date("2026-09-27T11:05:00.000Z"),
          completedAt: new Date("2026-09-27T11:05:01.000Z"),
          holdExpiresAt: "2026-09-27T11:20:00.000Z",
        }),
      ],
      new Date("2026-09-27T11:10:00.000Z"),
    );

    expect(events.filter((event) => event.type === "HOLD_EXPIRED")).toHaveLength(0);
  });

  it("chamada FAILED/STARTED e result fora de forma nao dao evento, e o descarte e registrado sem dado sensivel", () => {
    const warn = vi.fn();
    const events = derive(
      [
        prepareCall({
          id: "call-failed",
          status: "FAILED",
          result: { ok: false, error: { code: "SLOT_UNAVAILABLE", message: "x" } },
        }),
        prepareCall({
          id: "call-started",
          status: "STARTED",
          result: null,
        }),
        prepareCall({
          id: "call-malformed",
          result: { ok: true, data: { pendingAction: { date: "2026-09-27", startTime: "15:30" } } },
        }),
        confirmCall({
          id: "call-confirm-malformed",
          result: { ok: true, data: { appointment: { id: "appt-1" } } },
        }),
      ],
      NOW,
      { warn },
    );

    expect(events).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    for (const call of warn.mock.calls) {
      const [payload] = call as [Record<string, unknown>, string];
      expect(payload).toEqual({
        tenantId: TENANT,
        conversationId: CONVERSATION,
        toolCallId: expect.any(String),
        field: expect.any(String),
      });
      expect(payload.result).toBeUndefined();
      expect(payload.arguments).toBeUndefined();
      expect(payload.phone).toBeUndefined();
      expect(payload.name).toBeUndefined();
    }
  });

  it("nao usa outputText do AiRun: sem ledger da zero evento", () => {
    const events = derive([]);
    expect(events).toEqual([]);
  });
});
