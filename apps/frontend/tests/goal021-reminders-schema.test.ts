import { describe, expect, it } from "vitest";

import {
  appointmentNotificationSchema,
  reminderRuleSchema,
  reminderSettingsSchema,
} from "../src/data/mappers/publicApiSchemas";

/**
 * Goal021 (WU-010): contrato de `GET/PATCH /v1/settings/reminders`
 * (PUBLIC_API_V1.md) — até dois lembretes, `configured` distinguindo "nunca
 * configurado" de "configurado com `rules: []`", e a recusa de antecedência
 * fora do intervalo que a constraint SQL espelha.
 */

describe("contrato de configuração de lembretes (Goal021)", () => {
  it("decodifica o default do produto quando o negócio nunca configurou", () => {
    const settings = reminderSettingsSchema.parse({
      configured: false,
      confirmationEnabled: false,
      pricePolicy: "NEVER",
      rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
    });

    expect(settings.configured).toBe(false);
    expect(settings.rules).toEqual([{ slot: "FIRST", leadMinutes: 1_440 }]);
  });

  it("decodifica dois lembretes configurados, confirmação ligada e preço fixo", () => {
    const settings = reminderSettingsSchema.parse({
      configured: true,
      confirmationEnabled: true,
      pricePolicy: "WHEN_FIXED",
      rules: [
        { slot: "FIRST", leadMinutes: 2_880 },
        { slot: "SECOND", leadMinutes: 120 },
      ],
    });

    expect(settings.rules).toHaveLength(2);
    expect(settings.confirmationEnabled).toBe(true);
  });

  it("decodifica rules vazio como escolha explícita de desligar os lembretes", () => {
    const settings = reminderSettingsSchema.parse({
      configured: true,
      confirmationEnabled: false,
      pricePolicy: "NEVER",
      rules: [],
    });

    expect(settings.rules).toEqual([]);
  });

  it("recusa mais de dois lembretes", () => {
    expect(() =>
      reminderSettingsSchema.parse({
        configured: true,
        confirmationEnabled: false,
        pricePolicy: "NEVER",
        rules: [
          { slot: "FIRST", leadMinutes: 1_440 },
          { slot: "SECOND", leadMinutes: 720 },
          { slot: "SECOND", leadMinutes: 120 },
        ],
      }),
    ).toThrow();
  });

  it("recusa antecedência fora do intervalo (não positiva ou acima de 30 dias)", () => {
    expect(() =>
      reminderRuleSchema.parse({ slot: "FIRST", leadMinutes: 0 }),
    ).toThrow();
    expect(() =>
      reminderRuleSchema.parse({ slot: "FIRST", leadMinutes: 43_201 }),
    ).toThrow();
  });

  it("recusa vocabulário desconhecido de slot e política de preço", () => {
    expect(() =>
      reminderRuleSchema.parse({ slot: "THIRD", leadMinutes: 60 }),
    ).toThrow();
    expect(() =>
      reminderSettingsSchema.parse({
        configured: true,
        confirmationEnabled: false,
        pricePolicy: "ALWAYS",
        rules: [],
      }),
    ).toThrow();
  });
});

/**
 * Goal021 (WU-011/FIX-001): contrato de
 * `GET /v1/appointments/:id/notifications`, o estado de envio **desta**
 * ocorrência. É outra pergunta que a configuração do negócio não responde, e
 * por isso outro schema.
 */
describe("contrato do estado de envio de um agendamento (Goal021)", () => {
  const pending = {
    appointmentVersion: 1,
    dueAt: "2026-09-13T12:00:00.000Z",
    id: "ntf-1",
    kind: "REMINDER",
    reason: null,
    sentAt: null,
    settledAt: null,
    slot: "FIRST",
    state: "PENDING",
  };

  it("decodifica um lembrete ainda agendado, sem motivo e sem envio", () => {
    const notification = appointmentNotificationSchema.parse(pending);

    expect(notification.state).toBe("PENDING");
    expect(notification.reason).toBeNull();
    expect(notification.sentAt).toBeNull();
  });

  it("decodifica um lembrete enviado com o instante do envio", () => {
    const notification = appointmentNotificationSchema.parse({
      ...pending,
      sentAt: "2026-09-13T12:00:04.000Z",
      settledAt: "2026-09-13T12:00:04.000Z",
      state: "SENT",
    });

    expect(notification.sentAt).toBe("2026-09-13T12:00:04.000Z");
  });

  it("decodifica dispensa e falha com o motivo do vocabulário fechado", () => {
    expect(
      appointmentNotificationSchema.parse({
        ...pending,
        reason: "CUSTOMER_WITHOUT_PHONE",
        settledAt: "2026-09-12T12:00:00.000Z",
        state: "DISMISSED",
      }).reason,
    ).toBe("CUSTOMER_WITHOUT_PHONE");
    expect(
      appointmentNotificationSchema.parse({
        ...pending,
        reason: "TRANSPORT_UNKNOWN",
        settledAt: "2026-09-13T12:00:09.000Z",
        state: "FAILED",
      }).reason,
    ).toBe("TRANSPORT_UNKNOWN");
  });

  it("decodifica o aviso de alteração, que usa a posição própria", () => {
    const notification = appointmentNotificationSchema.parse({
      ...pending,
      appointmentVersion: 2,
      id: "ntf-2",
      kind: "CHANGE_NOTICE",
      slot: "CHANGE_NOTICE",
    });

    expect(notification.kind).toBe("CHANGE_NOTICE");
    expect(notification.slot).toBe("CHANGE_NOTICE");
  });

  it("recusa estado e motivo fora do vocabulário do dono do dado", () => {
    expect(() =>
      appointmentNotificationSchema.parse({ ...pending, state: "DELIVERED" }),
    ).toThrow();
    expect(() =>
      appointmentNotificationSchema.parse({
        ...pending,
        reason: "CLIENTE_NAO_QUIS",
        settledAt: "2026-09-12T12:00:00.000Z",
        state: "DISMISSED",
      }),
    ).toThrow();
  });
});
