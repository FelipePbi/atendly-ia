import { describe, expect, it } from "vitest";

import type { AppointmentDraft } from "../../src/modules/assistant/assistant.service.js";
import { CustomerMemoryService } from "../../src/modules/memory/customer-memory-service.js";
import {
  inferCustomerMemoryCandidates,
  type TurnAppointmentEvidence,
} from "../../src/modules/memory/memory-inference.js";
import {
  type ContactRow,
  fakeMemoryPrisma,
  type FakeMemoryWorld,
  memoryRow,
  type SessionRow,
} from "./fake-memory-prisma.js";

const TENANT = "tenant-a";
const CONVERSATION = "conversation-1";
const CONTACT = "contact-1";
const CUSTOMER = "customer-1";
const NOW = new Date("2026-09-13T12:00:00.000Z");

function appointment(
  overrides: Partial<AppointmentDraft> = {},
): Partial<AppointmentDraft> {
  return {
    desiredPeriod: "afternoon",
    services: [
      {
        serviceId: "svc-1",
        name: "Limpeza de pele",
        durationMinutes: 60,
        price: 120,
      },
    ],
    ...overrides,
  };
}

/** Atendimento avulso confirmado: uma ocorrencia, nao uma recorrencia. */
const CONFIRMADO: TurnAppointmentEvidence = {
  appointmentConfirmed: true,
  recurringSeriesConfirmed: false,
};

/** Serie recorrente confirmada: a repeticao foi combinada de forma explicita. */
const SERIE_CONFIRMADA: TurnAppointmentEvidence = {
  appointmentConfirmed: true,
  recurringSeriesConfirmed: true,
};

/** Turno que so mexeu no rascunho: nada foi marcado. */
const SEM_CONFIRMACAO: TurnAppointmentEvidence = {
  appointmentConfirmed: false,
  recurringSeriesConfirmed: false,
};

function contact(overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    id: CONTACT,
    tenantId: TENANT,
    ignored: false,
    customerId: CUSTOMER,
    categoryOverride: null,
    ...overrides,
  };
}

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "session-1",
    tenantId: TENANT,
    conversationId: CONVERSATION,
    category: "COMMERCIAL",
    humanHandling: false,
    endedAt: null,
    startedAt: new Date("2026-09-13T10:00:00.000Z"),
    ...overrides,
  };
}

function world(overrides: Partial<FakeMemoryWorld> = {}): FakeMemoryWorld {
  return {
    memories: [],
    contacts: [contact()],
    conversations: [{ id: CONVERSATION, tenantId: TENANT, contactId: CONTACT }],
    sessions: [session()],
    ...overrides,
  };
}

function service(initial: Partial<FakeMemoryWorld> = {}) {
  const { state, prisma } = fakeMemoryPrisma(world(initial));
  return {
    state,
    memory: new CustomerMemoryService(prisma, {
      staleDays: 180,
      promptLimit: 12,
    }),
  };
}

async function infer(
  subject: ReturnType<typeof service>,
  input: {
    appointment?: Partial<AppointmentDraft>;
    evidence?: TurnAppointmentEvidence;
    now?: Date;
  } = {},
) {
  return subject.memory.recordTurnInference({
    tenantId: TENANT,
    conversationId: CONVERSATION,
    appointment: input.appointment ?? appointment(),
    evidence: input.evidence ?? CONFIRMADO,
    sourceMessageIds: ["message-1"],
    now: input.now ?? NOW,
  });
}

describe("inferência de memória a partir do atendimento confirmado no turno", () => {
  it("extrai período, dia da semana, serviço e observação do atendimento confirmado", () => {
    const candidates = inferCustomerMemoryCandidates({
      appointment: {
        desiredPeriod: "morning",
        desiredDate: "2026-09-14",
        services: [
          {
            serviceId: "svc-1",
            name: "Manutenção",
            durationMinutes: 45,
            price: 90,
          },
        ],
        notes: "Prefere sala silenciosa",
      },
      evidence: CONFIRMADO,
    });

    expect(candidates).toEqual([
      {
        kind: "PREFERRED_PERIOD",
        value: "manha",
        confidence: expect.any(Number),
      },
      {
        kind: "PREFERRED_DAY",
        value: "segunda-feira",
        confidence: expect.any(Number),
      },
      {
        kind: "RECURRING_SERVICE",
        value: "Manutenção",
        confidence: expect.any(Number),
        // Um atendimento avulso não prova recorrência: o candidato só reforça
        // serviço que já estava registrado.
        reinforceOnly: true,
      },
      {
        kind: "OBSERVATION",
        value: "Prefere sala silenciosa",
        confidence: expect.any(Number),
      },
    ]);
  });

  it("série recorrente confirmada infere serviço recorrente de verdade", () => {
    const candidates = inferCustomerMemoryCandidates({
      appointment: appointment(),
      evidence: SERIE_CONFIRMADA,
    });

    expect(candidates).toContainEqual({
      kind: "RECURRING_SERVICE",
      value: "Limpeza de pele",
      confidence: expect.any(Number),
      reinforceOnly: false,
    });
  });

  it("não infere nada de rascunho não confirmado: intenção de marcar não é preferência", () => {
    expect(
      inferCustomerMemoryCandidates({
        appointment: appointment({ desiredDate: "2026-09-14" }),
        evidence: SEM_CONFIRMACAO,
      }),
    ).toEqual([]);
  });

  it("não infere nada de um turno sem atendimento nenhum", () => {
    expect(
      inferCustomerMemoryCandidates({
        appointment: undefined,
        evidence: CONFIRMADO,
      }),
    ).toEqual([]);
  });

  it("grava memória inferida do turno da IA para contato vinculado", async () => {
    const subject = service();

    const outcome = await infer(subject);

    // Só o período: o serviço do atendimento avulso não vira "recorrente" na
    // primeira ocorrência.
    expect(outcome).toEqual({ applied: 1 });
    expect(
      subject.state.memories.map((row) => ({
        kind: row.kind,
        value: row.value,
        origin: row.origin,
        aiAllowed: row.aiAllowed,
        sourceConversationId: row.sourceConversationId,
        sourceMessageIds: row.sourceMessageIds,
      })),
    ).toEqual([
      {
        kind: "PREFERRED_PERIOD",
        value: "tarde",
        origin: "AI_INFERRED",
        aiAllowed: true,
        sourceConversationId: CONVERSATION,
        sourceMessageIds: ["message-1"],
      },
    ]);
  });

  it("rascunho não confirmado não vira memória, mesmo com sinal claro", async () => {
    const subject = service();

    expect(await infer(subject, { evidence: SEM_CONFIRMACAO })).toEqual({
      applied: 0,
      skipped: "no_confirmed_appointment",
    });
    expect(subject.state.memories).toHaveLength(0);
  });

  it("um atendimento avulso não cria serviço recorrente; a série confirmada cria", async () => {
    const avulso = service();
    await infer(avulso);
    expect(
      avulso.state.memories.filter((row) => row.kind === "RECURRING_SERVICE"),
    ).toHaveLength(0);

    const serie = service();
    await infer(serie, { evidence: SERIE_CONFIRMADA });
    expect(
      serie.state.memories
        .filter((row) => row.kind === "RECURRING_SERVICE")
        .map((row) => row.value),
    ).toEqual(["Limpeza de pele"]);
  });

  it("serviço já registrado é reforçado pelo atendimento avulso, sem linha nova", async () => {
    const subject = service({
      memories: [
        memoryRow({
          id: "memory-servico",
          kind: "RECURRING_SERVICE",
          value: "Limpeza de pele",
          observedAt: new Date("2026-08-01T12:00:00.000Z"),
        }),
      ],
    });

    await infer(subject);

    const services = subject.state.memories.filter(
      (row) => row.kind === "RECURRING_SERVICE",
    );
    expect(services).toHaveLength(1);
    expect(services[0]?.lastReinforcedAt).toEqual(NOW);
  });

  it("não infere de contato ignorado", async () => {
    const subject = service({ contacts: [contact({ ignored: true })] });

    expect(await infer(subject)).toEqual({
      applied: 0,
      skipped: "contact_ignored",
    });
    expect(subject.state.memories).toHaveLength(0);
  });

  it("não infere de contato sem pessoa vinculada", async () => {
    const subject = service({ contacts: [contact({ customerId: null })] });

    expect(await infer(subject)).toEqual({
      applied: 0,
      skipped: "customer_not_linked",
    });
    expect(subject.state.memories).toHaveLength(0);
  });

  it("não infere de sessão pessoal", async () => {
    const subject = service({ sessions: [session({ category: "PERSONAL" })] });

    expect(await infer(subject)).toEqual({
      applied: 0,
      skipped: "personal_session",
    });
    expect(subject.state.memories).toHaveLength(0);
  });

  it("não infere quando a categoria pessoal é decisão da profissional no contato", async () => {
    const subject = service({
      contacts: [contact({ categoryOverride: "PERSONAL" })],
    });

    expect(await infer(subject)).toEqual({
      applied: 0,
      skipped: "personal_session",
    });
    expect(subject.state.memories).toHaveLength(0);
  });

  it("não infere de turno atendido por humano", async () => {
    const subject = service({ sessions: [session({ humanHandling: true })] });

    expect(await infer(subject)).toEqual({
      applied: 0,
      skipped: "human_handled",
    });
    expect(subject.state.memories).toHaveLength(0);
  });

  it("não infere de conversa sem contato resolvido", async () => {
    const subject = service({
      conversations: [{ id: CONVERSATION, tenantId: TENANT, contactId: null }],
    });

    expect(await infer(subject)).toEqual({ applied: 0, skipped: "no_contact" });
    expect(subject.state.memories).toHaveLength(0);
  });

  it("contradição do mesmo tipo substitui sem apagar a anterior", async () => {
    const subject = service({
      memories: [
        memoryRow({
          id: "memory-antiga",
          kind: "PREFERRED_PERIOD",
          value: "manha",
          observedAt: new Date("2026-08-01T12:00:00.000Z"),
        }),
      ],
    });

    await infer(subject);

    const previous = subject.state.memories.find(
      (row) => row.id === "memory-antiga",
    );
    const current = subject.state.memories.find(
      (row) => row.kind === "PREFERRED_PERIOD" && row.value === "tarde",
    );

    expect(current).toBeDefined();
    expect(previous?.removedAt).toBeNull();
    expect(previous?.supersededById).toBe(current?.id);
  });

  it("mesmo valor é reforço: atualiza lastReinforcedAt sem criar linha nova", async () => {
    const subject = service({
      memories: [
        memoryRow({
          id: "memory-tarde",
          kind: "PREFERRED_PERIOD",
          // Mesma preferência escrita de outro jeito continua sendo a mesma.
          value: "Tarde",
          observedAt: new Date("2026-08-01T12:00:00.000Z"),
        }),
      ],
    });

    await infer(subject);

    const periods = subject.state.memories.filter(
      (row) => row.kind === "PREFERRED_PERIOD",
    );
    expect(periods).toHaveLength(1);
    expect(periods[0]?.lastReinforcedAt).toEqual(NOW);
    expect(periods[0]?.supersededById).toBeNull();
  });

  it("a inferência não substitui o que a profissional cadastrou no mesmo tipo", async () => {
    const subject = service({
      memories: [
        memoryRow({
          id: "memory-profissional",
          kind: "PREFERRED_PERIOD",
          value: "manha",
          origin: "PROFESSIONAL",
          aiAllowed: true,
          confidence: null,
        }),
      ],
    });

    await infer(subject);

    const periods = subject.state.memories.filter(
      (row) => row.kind === "PREFERRED_PERIOD",
    );
    expect(periods).toHaveLength(1);
    expect(periods[0]?.origin).toBe("PROFESSIONAL");
    expect(periods[0]?.supersededById).toBeNull();
  });

  it("a substituição herda a permissão que a profissional já tinha decidido", async () => {
    const subject = service({
      memories: [
        memoryRow({
          id: "memory-negada",
          kind: "PREFERRED_PERIOD",
          value: "manha",
          aiAllowed: false,
        }),
      ],
    });

    await infer(subject);

    const current = subject.state.memories.find(
      (row) => row.kind === "PREFERRED_PERIOD" && row.value === "tarde",
    );
    expect(current?.aiAllowed).toBe(false);
  });
});

describe("carga da memória no prompt", () => {
  it("carrega só memória permitida, vigente, da pessoa vinculada", async () => {
    const subject = service({
      memories: [
        memoryRow({ id: "permitida", value: "tarde", aiAllowed: true }),
        memoryRow({
          id: "negada",
          kind: "OBSERVATION",
          value: "segredo",
          aiAllowed: false,
        }),
        memoryRow({
          id: "removida",
          kind: "OBSERVATION",
          value: "removida",
          aiAllowed: true,
          removedAt: new Date("2026-09-01T12:00:00.000Z"),
        }),
        memoryRow({
          id: "substituida",
          kind: "OBSERVATION",
          value: "substituida",
          aiAllowed: true,
          supersededById: "outra",
        }),
      ],
    });

    const items = await subject.memory.loadForPrompt({
      tenantId: TENANT,
      contactId: CONTACT,
      now: NOW,
    });

    expect(items.map((item) => item.value)).toEqual(["tarde"]);
    expect(items[0]?.origin).toBe("AI_INFERRED");
  });

  it("marca como antiga a memória mais velha que o limite de relevância", async () => {
    const subject = service({
      memories: [
        memoryRow({
          id: "antiga",
          value: "manha",
          observedAt: new Date("2025-01-01T12:00:00.000Z"),
        }),
      ],
    });

    const [item] = await subject.memory.loadForPrompt({
      tenantId: TENANT,
      contactId: CONTACT,
      now: NOW,
    });

    expect(item?.stale).toBe(true);
    expect(item?.ageDays).toBeGreaterThan(180);
  });

  it("reforço rejuvenesce a memória: deixa de entrar como antiga", async () => {
    const subject = service({
      memories: [
        memoryRow({
          id: "reforcada",
          value: "manha",
          observedAt: new Date("2025-01-01T12:00:00.000Z"),
          lastReinforcedAt: new Date("2026-09-10T12:00:00.000Z"),
        }),
      ],
    });

    const [item] = await subject.memory.loadForPrompt({
      tenantId: TENANT,
      contactId: CONTACT,
      now: NOW,
    });

    expect(item?.stale).toBe(false);
    expect(item?.ageDays).toBe(3);
  });

  it("não carrega memória de contato ignorado nem de contato sem pessoa vinculada", async () => {
    const ignored = service({
      contacts: [contact({ ignored: true })],
      memories: [memoryRow({ id: "permitida", aiAllowed: true })],
    });
    const unlinked = service({
      contacts: [contact({ customerId: null })],
      memories: [memoryRow({ id: "permitida", aiAllowed: true })],
    });

    expect(
      await ignored.memory.loadForPrompt({
        tenantId: TENANT,
        contactId: CONTACT,
        now: NOW,
      }),
    ).toEqual([]);
    expect(
      await unlinked.memory.loadForPrompt({
        tenantId: TENANT,
        contactId: CONTACT,
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("sem contato na conversa não há memória a carregar", async () => {
    const subject = service({
      memories: [memoryRow({ id: "permitida", aiAllowed: true })],
    });

    expect(
      await subject.memory.loadForPrompt({ tenantId: TENANT, contactId: null }),
    ).toEqual([]);
  });
});
