/**
 * Prévia da mensagem de retorno (D-206): cópia deliberada do compositor da
 * IA (`apps/ai-orchestrator/src/modules/customer-return/return-message.ts`).
 * Estas frases são as mesmas que o teste da IA afirma para os mesmos fatos;
 * se um lado mudar sem o outro, os dois testes deixam de concordar. Também
 * as frases da Atividade para as ações do retorno.
 */
import { describe, expect, it } from "vitest";

import type { ActivityEntry } from "@/data";
import {
  activityNote,
  activitySentence,
} from "@/features/activity/activityCopy";
import {
  absenceLabel,
  dueLabel,
  exclusionSummary,
  habitLabel,
  windowLabel,
} from "@/features/customer-return/returnCopy";
import {
  composeReturnText,
  defaultReturnTemplate,
  type ReturnFacts,
} from "@/features/customer-return/returnMessage";

function renewal(overrides: Partial<ReturnFacts> = {}): ReturnFacts {
  return {
    kind: "RENEWAL",
    followUp: false,
    customerName: "Adriana Souza",
    serviceName: "Manutenção 5D",
    today: "2026-10-19",
    expectedDate: "2026-10-22",
    intervalDays: 15,
    daysSinceLastVisit: 12,
    offeredSlots: [
      { date: "2026-10-23", time: "17:30" },
      { date: "2026-10-24", time: "18:00" },
    ],
    incentive: null,
    messageTemplate: null,
    ...overrides,
  };
}

describe("prévia igual à mensagem da IA", () => {
  it("Renovação no estilo Equilibrado", () => {
    expect(composeReturnText({ style: "BALANCED", facts: renewal() })).toBe(
      [
        "Oi, Adriana! Tudo bem?",
        "Seu atendimento de Manutenção 5D completa 15 dias na quinta-feira. Quer que eu já reserve um horário? Tenho sexta às 17h30 ou sábado às 18h.",
      ].join("\n\n"),
    );
  });

  it("Resgate no estilo Descontraído, com o incentivo", () => {
    expect(
      composeReturnText({
        style: "CASUAL",
        facts: renewal({
          kind: "WINBACK",
          customerName: "Joice",
          expectedDate: null,
          intervalDays: null,
          offeredSlots: [],
          incentive: "10% de desconto em qualquer serviço até o fim do mês.",
        }),
      }),
    ).toBe(
      [
        "Oii, Joice! Tudo bem? 😊",
        "Faz um tempinho que você não aparece por aqui 💕 Pra sua volta, tenho uma condição especial: 10% de desconto em qualquer serviço até o fim do mês 💛",
        "Quer que eu veja um horário pra você? 💛",
      ].join("\n\n"),
    );
  });

  it("o texto-base inicial do editor gera o padrão com os campos", () => {
    const template = defaultReturnTemplate("RENEWAL", "BALANCED");
    expect(template).toBe(
      [
        "Oi, {nome}! Tudo bem?",
        "Está chegando a hora do seu atendimento de {servico}, {quando}. Quer que eu já reserve um horário? Tenho {horarios}.",
      ].join("\n\n"),
    );
    expect(
      composeReturnText({
        style: "BALANCED",
        facts: renewal({ messageTemplate: template }),
      }),
    ).toBe(
      [
        "Oi, Adriana! Tudo bem?",
        "Está chegando a hora do seu atendimento de Manutenção 5D, na quinta-feira. Quer que eu já reserve um horário? Tenho sexta às 17h30 ou sábado às 18h.",
      ].join("\n\n"),
    );
  });
});

describe("frases da lista", () => {
  it("prazo, ausência, costume, exclusões e janela", () => {
    expect(dueLabel("2026-10-24", "2026-10-19")).toBe("vence em 5 dias");
    expect(dueLabel("2026-10-20", "2026-10-19")).toBe("vence amanhã");
    expect(dueLabel("2026-10-19", "2026-10-19")).toBe("vence hoje");
    expect(dueLabel("2026-10-17", "2026-10-19")).toBe("venceu há 2 dias");
    expect(absenceLabel(45)).toBe("há 45 dias");
    expect(absenceLabel(95)).toBe("há 3 meses");
    expect(
      habitLabel({ weekdays: [5, 6], bandStart: "16:30", bandEnd: "19:30" }),
    ).toBe("costuma vir sex ou sáb, das 16h30 às 19h30");
    expect(
      habitLabel({ weekdays: [], bandStart: "08:00", bandEnd: "11:00" }),
    ).toBe("costuma vir das 8h às 11h");
    expect(
      exclusionSummary({
        deactivated: 0,
        noPhone: 0,
        futureAppointment: 1,
        blocked: 2,
        recentlyContacted: 0,
        queued: 0,
        ignored: 0,
        personal: 1,
      }),
    ).toBe(
      "Ficaram de fora: 1 já tem horário marcado, 2 pediram para não receber, 1 é conversa pessoal.",
    );
    expect(windowLabel([1, 2, 3, 4, 5, 6], "09:00", "19:00")).toBe(
      "seg a sáb, das 9h às 19h",
    );
    expect(windowLabel([1, 3, 5], "08:00", "12:30")).toBe(
      "seg, qua, sex, das 8h às 12h30",
    );
  });
});

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: "a1",
    occurredAt: "2026-10-19T12:00:00.000Z",
    actor: "USER",
    area: "CUSTOMERS",
    action: "customer_return.campaign_approved",
    entity: { type: "return_campaign", id: "c1", label: null },
    changes: [],
    details: null,
    ...overrides,
  };
}

describe("Atividade do retorno", () => {
  it("frases legíveis para as ações da profissional e da IA", () => {
    expect(
      activitySentence(
        entry({
          details: { kind: "WINBACK", customers: 12, incentive: "brinde" },
        }),
      ),
    ).toBe("Você aprovou uma rodada de Resgate para 12 clientes");
    expect(
      activityNote(
        entry({ details: { kind: "WINBACK", incentive: "brinde" } }),
      ),
    ).toBe("Incentivo: “brinde”");
    expect(
      activitySentence(
        entry({
          action: "customer_return.campaign_paused",
          details: { kind: "RENEWAL" },
        }),
      ),
    ).toBe("Você pausou uma rodada de Renovação");
    expect(
      activitySentence(
        entry({
          actor: "AI",
          action: "customer.return_stopped",
          entity: { type: "customer", id: "x", label: "Joice" },
        }),
      ),
    ).toBe("Joice pediu para não receber mensagens de retorno");
    expect(
      activitySentence(
        entry({
          action: "customer.return_messages_allowed",
          entity: { type: "customer", id: "x", label: "Joice" },
        }),
      ),
    ).toBe("Você liberou as mensagens de retorno para Joice");
    expect(
      activitySentence(
        entry({
          action: "settings.customer_return_updated",
          area: "SETTINGS",
          entity: { type: "settings", id: null, label: null },
        }),
      ),
    ).toBe("Você alterou o retorno de clientes");
  });
});
