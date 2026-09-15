import { describe, expect, it } from "vitest";

import {
  notificationListSchema,
  notificationMarkReadResultSchema,
  notificationPreferencesSchema,
  notificationSchema,
  notificationSummarySchema,
} from "../src/data/mappers/publicApiSchemas";

/**
 * Goal022 (WU-06): contrato de `GET /v1/notifications`,
 * `GET /v1/notifications/summary`, `POST /v1/notifications/read` e
 * `GET/PATCH /v1/notifications/preferences` (PUBLIC_API_V1.md). `kind`,
 * `level` e `shape` são vocabulário fechado do dono, no mesmo padrão já
 * aplicado ao estado de envio de lembretes (Goal021).
 */

const item = {
  id: "ntf-1",
  kind: "CUSTOMER_WAITING_HUMAN",
  level: "ATTENTION",
  shape: "CONDITION",
  subjectId: "conversa-1",
  occurredAt: "2026-09-15T12:30:00.000Z",
  readAt: null,
  resolvedAt: null,
  payload: { contactName: "Marina", reason: "EXPLICIT_REQUEST" },
};

describe("contrato de item da central de notificações (Goal022)", () => {
  it("decodifica uma condição aberta, não lida", () => {
    const parsed = notificationSchema.parse(item);
    expect(parsed.kind).toBe("CUSTOMER_WAITING_HUMAN");
    expect(parsed.shape).toBe("CONDITION");
    expect(parsed.resolvedAt).toBeNull();
  });

  it("decodifica um evento de histórico, lido e sem alvo de condição", () => {
    const parsed = notificationSchema.parse({
      ...item,
      kind: "IMPORT_COMPLETED",
      level: "INFO",
      shape: "EVENT",
      subjectId: "sessao-1",
      readAt: "2026-09-15T12:31:00.000Z",
      payload: { sessionId: "sessao-1", importedCount: 12 },
    });
    expect(parsed.shape).toBe("EVENT");
    expect(parsed.readAt).toBe("2026-09-15T12:31:00.000Z");
  });

  it.each([
    ["kind", "SOMETHING_ELSE"],
    ["level", "URGENT"],
    ["shape", "STATE"],
  ])("recusa %s fora do vocabulário fechado do dono", (field, value) => {
    expect(() => notificationSchema.parse({ ...item, [field]: value })).toThrow();
  });

  it("aceita as sete espécies do produto", () => {
    const kinds = [
      "CUSTOMER_WAITING_HUMAN",
      "REMINDER_FAILED",
      "IMPORT_COMPLETED",
      "AI_APPOINTMENT_CREATED",
      "WHATSAPP_DISCONNECTED",
      "AI_UNAVAILABLE",
      "SETUP_INCOMPLETE",
    ];
    for (const kind of kinds) {
      expect(() => notificationSchema.parse({ ...item, kind })).not.toThrow();
    }
  });
});

describe("contrato da lista paginada", () => {
  it("decodifica total, paginação e itens", () => {
    const parsed = notificationListSchema.parse({
      total: 3,
      limit: 20,
      offset: 0,
      items: [item],
    });
    expect(parsed.total).toBe(3);
    expect(parsed.items).toHaveLength(1);
  });
});

describe("contrato do resumo (GET /v1/notifications/summary)", () => {
  it("decodifica contadores por nível, não lidas e condições abertas", () => {
    const parsed = notificationSummarySchema.parse({
      byLevel: { INFO: 0, ATTENTION: 1, CRITICAL: 1 },
      unreadCount: 2,
      openConditionsCount: 1,
    });
    expect(parsed.unreadCount).toBe(2);
    expect(parsed.openConditionsCount).toBe(1);
  });

  it("recusa nível desconhecido em byLevel", () => {
    expect(() =>
      notificationSummarySchema.parse({
        byLevel: { INFO: 0, ATTENTION: 0, URGENT: 1 },
        unreadCount: 1,
        openConditionsCount: 0,
      }),
    ).toThrow();
  });
});

describe("contrato de marcar como lida e preferências", () => {
  it("decodifica o resultado de marcar como lida", () => {
    expect(notificationMarkReadResultSchema.parse({ updated: 1 }).updated).toBe(1);
  });

  it("decodifica a preferência da central, default desligado", () => {
    expect(
      notificationPreferencesSchema.parse({ aiAppointmentCreated: false })
        .aiAppointmentCreated,
    ).toBe(false);
  });
});
