import { describe, expect, it } from "vitest";

import type { OnboardingState } from "../src/lib/onboarding-state.js";
import {
  aiAppointmentCursor,
  planAiAppointmentCreated,
  planAwaitingHuman,
  planImportCompleted,
  planReminderFailed,
  planSetupIncomplete,
  planStatusConditions,
} from "../src/modules/notifications/plan.js";
import { NOTIFICATION_SPECIES } from "../src/modules/notifications/species.js";

/**
 * Goal022/WU-03 — as regras de produto da central, sem banco e sem serviço no
 * ar.
 *
 * Cada teste aqui falha se a regra for removida, e nenhum deles depende de
 * infraestrutura: são as decisões que este Goal não pode errar (nível derivado
 * de espécie, `UNKNOWN` que não abre condição, `OFF` que não é
 * indisponibilidade, preferência silenciosa, nada de retroativo, dedupe por
 * conversa) verificadas onde elas moram.
 */

const SEEDED_AT = new Date("2026-09-15T12:00:00.000Z");
const NOW = new Date("2026-09-15T13:00:00.000Z");

describe("tabela fixa de espécies", () => {
  it("deriva nível e forma do kind, e só CONDITION resolve", () => {
    expect(NOTIFICATION_SPECIES.WHATSAPP_DISCONNECTED).toEqual({
      level: "CRITICAL",
      shape: "CONDITION",
    });
    expect(NOTIFICATION_SPECIES.AI_UNAVAILABLE).toEqual({
      level: "CRITICAL",
      shape: "CONDITION",
    });
    expect(NOTIFICATION_SPECIES.CUSTOMER_WAITING_HUMAN).toEqual({
      level: "ATTENTION",
      shape: "CONDITION",
    });
    expect(NOTIFICATION_SPECIES.SETUP_INCOMPLETE).toEqual({
      level: "ATTENTION",
      shape: "CONDITION",
    });
    expect(NOTIFICATION_SPECIES.REMINDER_FAILED).toEqual({
      level: "ATTENTION",
      shape: "EVENT",
    });
    expect(NOTIFICATION_SPECIES.IMPORT_COMPLETED).toEqual({
      level: "INFO",
      shape: "EVENT",
    });
    expect(NOTIFICATION_SPECIES.AI_APPOINTMENT_CREATED).toEqual({
      level: "INFO",
      shape: "EVENT",
    });
  });
});

describe("condições de canal dentro de /v1/status", () => {
  it("DISCONNECTED abre e CONNECTED resolve a condição de WhatsApp", () => {
    const opened = planStatusConditions({
      whatsapp: "DISCONNECTED",
      ai: "ACTIVE",
      now: NOW,
    });
    expect(opened.open.map((draft) => draft.kind)).toEqual([
      "WHATSAPP_DISCONNECTED",
    ]);
    expect(opened.resolve).not.toContain("WHATSAPP_DISCONNECTED");

    const back = planStatusConditions({
      whatsapp: "CONNECTED",
      ai: "ACTIVE",
      now: NOW,
    });
    expect(back.open).toEqual([]);
    expect(back.resolve).toContain("WHATSAPP_DISCONNECTED");
  });

  it("WhatsApp UNKNOWN não abre condição e não resolve condição aberta", () => {
    const plan = planStatusConditions({
      whatsapp: "UNKNOWN",
      ai: "ACTIVE",
      now: NOW,
    });
    expect(plan.open.map((draft) => draft.kind)).not.toContain(
      "WHATSAPP_DISCONNECTED",
    );
    expect(plan.resolve).not.toContain("WHATSAPP_DISCONNECTED");
  });

  it("ai OFF não gera AI_UNAVAILABLE: desligada é escolha, não indisponibilidade", () => {
    const plan = planStatusConditions({
      whatsapp: "CONNECTED",
      ai: "OFF",
      now: NOW,
    });
    expect(plan.open).toEqual([]);
    expect(plan.resolve).toContain("AI_UNAVAILABLE");
  });

  it("ai UNKNOWN e PENDING são indisponibilidade e abrem a condição", () => {
    for (const state of ["UNKNOWN", "PENDING"] as const) {
      const plan = planStatusConditions({
        whatsapp: "CONNECTED",
        ai: state,
        now: NOW,
      });
      expect(plan.open.map((draft) => draft.kind)).toContain("AI_UNAVAILABLE");
      expect(plan.open[0]?.payload).toEqual({ state });
      expect(plan.resolve).not.toContain("AI_UNAVAILABLE");
    }
  });
});

describe("cliente esperando humano", () => {
  it("deduplica pela conversa e reporta os alvos que continuam abertos", () => {
    const plan = planAwaitingHuman([
      {
        conversationId: "conversa-1",
        contactName: "Marina",
        reason: "EXPLICIT_REQUEST",
        openedAt: "2026-09-15T12:30:00.000Z",
      },
    ]);
    expect(plan.open).toHaveLength(1);
    expect(plan.open[0]?.dedupeKey).toBe(
      "CUSTOMER_WAITING_HUMAN:conversation:conversa-1",
    );
    expect(plan.open[0]?.subjectId).toBe("conversa-1");
    // O instante é o da abertura no dono, nunca o da materialização.
    expect(plan.open[0]?.occurredAt.toISOString()).toBe(
      "2026-09-15T12:30:00.000Z",
    );
    expect(plan.keepSubjectIds).toEqual(["conversa-1"]);
    // Só o nome e o motivo; nada que identifique o contato por telefone.
    expect(plan.open[0]?.payload).toEqual({
      contactName: "Marina",
      reason: "EXPLICIT_REQUEST",
    });
  });

  it("sem nome do contato o payload não ganha identificação nenhuma", () => {
    const plan = planAwaitingHuman([
      {
        conversationId: "conversa-1",
        contactName: null,
        reason: "EXPLICIT_REQUEST",
        openedAt: "2026-09-15T12:30:00.000Z",
      },
    ]);
    // A fonte não cai para telefone formatado e o BFF não inventa substituto:
    // a chave simplesmente não existe, e a copy genérica da espécie assume.
    expect(plan.open[0]?.payload).toEqual({ reason: "EXPLICIT_REQUEST" });
  });

  it("fonte sem ninguém esperando resolve tudo que estava aberto", () => {
    expect(planAwaitingHuman([])).toEqual({ open: [], keepSubjectIds: [] });
  });
});

describe("falha de lembrete", () => {
  const failed = {
    id: "intencao-1",
    appointmentId: "compromisso-1",
    kind: "REMINDER",
    slot: "T24H",
    reason: "PROVIDER_ERROR",
    dueAt: "2026-09-15T12:20:00.000Z",
    settledAt: "2026-09-15T12:30:00.000Z",
    detail: "upstream 503: connection reset by peer",
  };

  it("deduplica pela intenção e não leva detail para o payload", () => {
    const [draft] = planReminderFailed([failed], { seededAt: SEEDED_AT });
    expect(draft?.dedupeKey).toBe("REMINDER_FAILED:intent:intencao-1");
    expect(draft?.payload).toEqual({
      appointmentId: "compromisso-1",
      kind: "REMINDER",
      slot: "T24H",
      reason: "PROVIDER_ERROR",
    });
    expect(JSON.stringify(draft?.payload)).not.toContain("connection reset");
  });

  it("falha anterior à primeira reconciliação não vira notificação retroativa", () => {
    const old = { ...failed, settledAt: "2026-09-15T11:00:00.000Z" };
    expect(planReminderFailed([old], { seededAt: SEEDED_AT })).toEqual([]);
  });
});

describe("agendamento criado pela IA", () => {
  const events = [
    {
      appointmentId: "compromisso-9",
      after: { date: "2026-09-20", startTime: "10:00", status: "SCHEDULED" },
      occurredAt: "2026-09-15T12:40:00.000Z",
      sequence: "412",
    },
  ];

  it("preferência desligada não materializa e mesmo assim avança o cursor", () => {
    expect(
      planAiAppointmentCreated(events, {
        seededAt: SEEDED_AT,
        preferenceEnabled: false,
      }),
    ).toEqual([]);
    expect(aiAppointmentCursor(events, null)).toBe("412");
  });

  it("preferência ligada materializa uma linha por sequence", () => {
    const [draft] = planAiAppointmentCreated(events, {
      seededAt: SEEDED_AT,
      preferenceEnabled: true,
    });
    expect(draft?.dedupeKey).toBe("AI_APPOINTMENT_CREATED:event:412");
    expect(draft?.payload).toEqual({
      appointmentId: "compromisso-9",
      date: "2026-09-20",
      startTime: "10:00",
    });
  });

  it("cursor sem página lida não anda para trás", () => {
    expect(aiAppointmentCursor([], "412")).toBe("412");
  });
});

describe("importação concluída", () => {
  it("deduplica pela sessão e respeita o corte do retroativo", () => {
    const history = {
      sessionId: "sessao-3",
      completedAt: "2026-09-15T12:45:00.000Z",
      counts: { imported: 12 },
    };
    const [draft] = planImportCompleted(history, { seededAt: SEEDED_AT });
    expect(draft?.dedupeKey).toBe("IMPORT_COMPLETED:session:sessao-3");
    expect(draft?.payload).toEqual({
      sessionId: "sessao-3",
      importedCount: 12,
    });

    expect(
      planImportCompleted(
        { ...history, completedAt: "2026-09-01T00:00:00.000Z" },
        { seededAt: SEEDED_AT },
      ),
    ).toEqual([]);
    expect(planImportCompleted(null, { seededAt: SEEDED_AT })).toEqual([]);
  });
});

describe("configuração essencial faltando", () => {
  function state(overrides: Partial<OnboardingState>): OnboardingState {
    return {
      business: {
        name: "Studio Marina",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
        modalities: ["ONLINE"],
        address: null,
        contextVersion: 1,
        contextProjectedVersion: 1,
        contextProjectionStatus: "PROJECTED",
        ...(overrides.business ?? {}),
      },
      calendar: {
        source: "ATENDLY",
        timezone: "America/Sao_Paulo",
        integration: null,
      },
      ai: { tone: "BALANCED" },
      service: { id: "servico-1", active: true } as OnboardingState["service"],
      availability: {
        rules: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true },
        ],
      } as OnboardingState["availability"],
      whatsapp: null,
      completed: true,
      completedAt: "2026-09-10T12:00:00.000Z",
      ...overrides,
    } as OnboardingState;
  }

  it("negócio em onboarding não tem configuração faltando: está configurando", () => {
    const plan = planSetupIncomplete(
      state({ completed: false, completedAt: null, ai: { tone: null } }),
      NOW,
    );
    expect(plan.open).toEqual([]);
    expect(plan.resolve).toEqual(["SETUP_INCOMPLETE"]);
  });

  it("negócio concluído com pendência abre a condição com vocabulário fechado", () => {
    const plan = planSetupIncomplete(state({ ai: { tone: null } }), NOW);
    expect(plan.open[0]?.kind).toBe("SETUP_INCOMPLETE");
    expect(plan.open[0]?.dedupeKey).toBe("SETUP_INCOMPLETE:tenant");
    expect(plan.open[0]?.payload).toEqual({
      issues: ["AI_TONE_NOT_SELECTED"],
    });
    expect(plan.resolve).toEqual([]);
  });

  it("configuração deixa de faltar e a condição é resolvida", () => {
    const plan = planSetupIncomplete(state({}), NOW);
    expect(plan.open).toEqual([]);
    expect(plan.resolve).toEqual(["SETUP_INCOMPLETE"]);
  });
});
