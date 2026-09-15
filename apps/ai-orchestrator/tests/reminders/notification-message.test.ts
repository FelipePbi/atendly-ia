import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  composeNotificationText,
  notificationFactualLines,
} from "../../src/modules/reminders/notification-message.js";
import type { NotificationFacts } from "../../src/modules/scheduling-service/types.js";
import { AI_CONVERSATION_STYLES } from "../../src/modules/tenant-config/ai-settings.js";

function facts(overrides: Partial<NotificationFacts> = {}): NotificationFacts {
  return {
    kind: "REMINDER",
    appointmentStatus: "CONFIRMED",
    customerId: "customer-a",
    customerName: "Ana",
    customerPhone: "5511999999999",
    services: ["Corte"],
    title: null,
    timezone: "America/Sao_Paulo",
    // Ja formatadas pelo dono, no fuso do negocio. A IA nunca as recalcula.
    date: "2026-09-16",
    time: "14:30",
    startAt: "2026-09-16T17:30:00.000Z",
    price: null,
    confirmationRequested: false,
    ...overrides,
  };
}

describe("notification message templates", () => {
  it("composes the text by template in the three styles", () => {
    const texts = AI_CONVERSATION_STYLES.map((style) =>
      composeNotificationText({ style, facts: facts() }),
    );

    // Os tres existem, nenhum vazio, e os tres soam diferente: estilo muda
    // registro e informalidade.
    expect(texts).toHaveLength(3);
    for (const text of texts) expect(text.trim().length).toBeGreaterThan(0);
    expect(new Set(texts).size).toBe(3);
  });

  it("keeps the factual content identical across the three styles", () => {
    const sample = facts({
      services: ["Corte", "Escova"],
      price: 120,
      confirmationRequested: true,
    });
    const lines = notificationFactualLines(sample);
    expect(lines.length).toBeGreaterThan(0);

    for (const style of AI_CONVERSATION_STYLES) {
      const text = composeNotificationText({ style, facts: sample });
      // Cada frase factual entra palavra por palavra, nos tres.
      for (const line of lines) expect(text).toContain(line);
      // E o fato so aparece na forma que o dono compos.
      expect(text).toContain("Corte e Escova");
      expect(text).toContain("R$ 120,00");
    }
  });

  it("uses the date and the time exactly as the intent carries them", () => {
    for (const style of AI_CONVERSATION_STYLES) {
      const text = composeNotificationText({ style, facts: facts() });
      expect(text).toContain("no dia 2026-09-16 às 14:30");
    }
  });

  it("asks for presence only when the reminder requests confirmation", () => {
    const silent = composeNotificationText({
      style: "BALANCED",
      facts: facts({ confirmationRequested: false }),
    });
    const asking = composeNotificationText({
      style: "BALANCED",
      facts: facts({ confirmationRequested: true }),
    });

    expect(silent).not.toContain("confirma");
    expect(asking).toContain("confirma sua presença");
  });

  it("never asks for presence on a change notice", () => {
    const text = composeNotificationText({
      style: "CASUAL",
      // Mesmo com o fato marcado: confirmar presenca e do lembrete.
      facts: facts({ kind: "CHANGE_NOTICE", confirmationRequested: true }),
    });
    expect(text).not.toContain("Confirma pra mim");
  });

  it("says a cancelled appointment was cancelled, and a moved one was moved", () => {
    const cancelled = notificationFactualLines(
      facts({ kind: "CHANGE_NOTICE", appointmentStatus: "CANCELLED" }),
    ).join(" ");
    const moved = notificationFactualLines(
      facts({ kind: "CHANGE_NOTICE", appointmentStatus: "CONFIRMED" }),
    ).join(" ");

    expect(cancelled).toContain("foi cancelado");
    expect(moved).toContain("foi alterado");
  });

  it("falls back to the manual appointment title, then to a generic subject", () => {
    expect(
      notificationFactualLines(
        facts({ services: [], title: "Avaliação" }),
      ).join(" "),
    ).toContain("Avaliação");
    expect(
      notificationFactualLines(facts({ services: [], title: null })).join(" "),
    ).toContain("seu atendimento");
  });

  it("omits the price when the owner did not send one", () => {
    const text = composeNotificationText({
      style: "PROFESSIONAL",
      facts: facts({ price: null }),
    });
    expect(text).not.toContain("Valor");
  });

  it("never repeats an address, because the facts do not carry one", () => {
    const keys = Object.keys(facts());
    expect(keys).not.toContain("address");
  });

  /**
   * As duas provas estruturais do item 5 do Goal: o texto e composto por
   * modelo, sem modelo de linguagem, e nenhum instante e formatado aqui.
   */
  it("composes without any language model call and without formatting instants", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/modules/reminders/notification-message.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    for (const forbidden of [
      "langchain",
      "openai",
      "OpenAI",
      "ChatOpenAI",
      "invokeModel",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    for (const forbidden of [
      "new Date(",
      "Intl.",
      "toLocale",
      "toISOString",
      "getHours",
      "timeZone",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
