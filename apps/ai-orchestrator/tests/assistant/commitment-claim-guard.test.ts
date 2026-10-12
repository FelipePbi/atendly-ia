import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { DiagnosticLogger } from "../../src/lib/diagnostic-log.js";
import {
  type AssistantGraphSession,
  AssistantService,
  COMMITMENT_CLAIM_NEGATION_WINDOW_WORDS,
  COMMITMENT_CLAIM_VOCABULARY,
  findCommitmentClaims,
  normalizeCommitmentText,
  normalizeModelDashes,
  PRODUCT_OWN_TEXTS,
} from "../../src/modules/assistant/assistant.service.js";
import type { ModelResponse } from "../../src/modules/model/model-provider.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { VOCABULARIO_DE_ESPERA } from "../support/vocabulario-de-espera.js";

/**
 * Guard de afirmacao de efeito nao gravado (QA A-01 / Goal057): a resposta
 * que afirma agendamento, remarcacao ou cancelamento com rascunho pendente e
 * sem `confirm` bem-sucedido no ledger do turno nao sai.
 */

const COMMITMENT_NOT_RECORDED =
  "Ainda não ficou registrado na agenda. Posso confirmar agora pra você?";

describe("vocabulario de afirmacao de efeito (QA A-01)", () => {
  it("e um conjunto fechado e congelado, por tipo, ja escrito na forma normalizada", () => {
    expect(Object.keys(COMMITMENT_CLAIM_VOCABULARY)).toEqual([
      "schedule",
      "reschedule",
      "cancel",
    ]);
    expect(Object.isFrozen(COMMITMENT_CLAIM_VOCABULARY)).toBe(true);
    for (const terms of Object.values(COMMITMENT_CLAIM_VOCABULARY)) {
      expect(Object.isFrozen(terms)).toBe(true);
      for (const term of terms) {
        expect(normalizeCommitmentText(term)).toBe(term);
      }
    }
    const genericConfirmTerms = [
      "confirmado",
      "confirmada",
      "confirmados",
      "confirmadas",
      "confirmei",
      "marcado",
      "marcada",
      "marcados",
      "marcadas",
      "marquei",
    ];
    expect(COMMITMENT_CLAIM_VOCABULARY.schedule).toEqual([
      "agendado",
      "agendada",
      "agendados",
      "agendadas",
      "agendei",
      "agendamento feito",
      "agendamento criado",
      ...genericConfirmTerms,
    ]);
    expect(COMMITMENT_CLAIM_VOCABULARY.reschedule).toEqual([
      "remarcado",
      "remarcada",
      "remarcados",
      "remarcadas",
      "remarquei",
      "reagendado",
      "reagendada",
      "reagendados",
      "reagendadas",
      "reagendei",
      ...genericConfirmTerms,
    ]);
    expect(COMMITMENT_CLAIM_VOCABULARY.cancel).toEqual([
      "cancelado",
      "cancelada",
      "cancelados",
      "canceladas",
      "cancelei",
      "desmarcado",
      "desmarcada",
      "desmarcados",
      "desmarcadas",
      "desmarquei",
      ...genericConfirmTerms,
    ]);
  });

  it("normaliza para minusculas, sem acento e com letra repetida colapsada", () => {
    expect(normalizeCommitmentText("Tá CONFIRMADÍSSIMO")).toBe(
      "ta confirmadisimo",
    );
    expect(normalizeCommitmentText("Confirmadoo!!")).toBe("confirmado!!");
    expect(normalizeCommitmentText("Remarcaaado")).toBe("remarcado");
    expect(normalizeCommitmentText("Pré-agendado")).toBe("pre-agendado");
  });

  it.each([
    ["Seu horário está AGENDADO.", ["schedule"]],
    ["Agendei pra você na quinta.", ["schedule"]],
    ["Agendamento feito com sucesso", ["schedule"]],
    ["Prontinho, remarcado para sexta.", ["reschedule"]],
    ["Já reagendei seu horário.", ["reschedule"]],
    ["Seu horário foi cancelado.", ["cancel"]],
    ["Desmarquei pra você.", ["cancel"]],
  ])("%s afirma %s", (text, kinds) => {
    expect(findCommitmentClaims(text)).toEqual(kinds);
  });

  it.each([
    "Pronto, ficou confirmado para segunda às 10h!",
    "Tá marcado, te espero!",
    "Confirmadoo, tudo certo",
  ])(
    "%s usa vocabulário genérico de confirmação: afirma os três tipos, porque o guard decide pelo rascunho pendente (QA A-01)",
    (text) => {
      expect(findCommitmentClaims(text)).toEqual([
        "schedule",
        "reschedule",
        "cancel",
      ]);
    },
  );

  it("casa palavra inteira: remarcacao e cancelamento nao contam como agendamento", () => {
    expect(findCommitmentClaims("Remarcado!")).toEqual(["reschedule"]);
    expect(findCommitmentClaims("Desmarcado!")).toEqual(["cancel"]);
  });

  it.each([
    ["reservado", "Seu horário está reservado por alguns minutos."],
    ["pré-agendado", "Deixei pré-agendado para segunda às 10h."],
    ["pre agendado", "Ficou pre agendado para segunda às 10h."],
    ["pré agendada", "Está pré agendada para as 10h."],
    ["posso confirmar?", "Segunda às 10h com a Ana. Posso confirmar?"],
    ["quer que eu confirme?", "Quer que eu confirme esse horário?"],
    ["vou confirmar", "Certo, vou confirmar isso pra você."],
    ["negação: ainda não está confirmado", "Ainda não está confirmado."],
    ["negação: não ficou marcado", "Não ficou marcado ainda, tá?"],
    ["negação: ainda não foi remarcado", "Ainda não foi remarcado."],
    ["negação: não está cancelado", "Seu horário não está cancelado."],
  ])("%s não é afirmação", (_label, text) => {
    expect(findCommitmentClaims(text)).toEqual([]);
  });

  it(`a janela de negação é curta e fixa (${COMMITMENT_CLAIM_NEGATION_WINDOW_WORDS} palavras) e não atravessa pontuação`, () => {
    expect(COMMITMENT_CLAIM_NEGATION_WINDOW_WORDS).toBe(3);
    // Negador a 3 palavras: dentro da janela.
    expect(findCommitmentClaims("Não consegui deixar confirmado.")).toEqual(
      [],
    );
    // Negador a 4 palavras: fora da janela, é afirmação (termo genérico: os três tipos).
    expect(
      findCommitmentClaims("Não precisa se preocupar que ficou confirmado."),
    ).toEqual(["schedule", "reschedule", "cancel"]);
    // Pontuação corta a janela.
    expect(findCommitmentClaims("Não, ficou confirmado.")).toEqual([
      "schedule",
      "reschedule",
      "cancel",
    ]);
  });
});

describe("texto fixo que substitui a afirmação não gravada (QA A-01)", () => {
  it("está em PRODUCT_OWN_TEXTS, não afirma efeito e não casa com o vocabulário de espera", () => {
    expect(PRODUCT_OWN_TEXTS).toContain(COMMITMENT_NOT_RECORDED);
    expect(findCommitmentClaims(COMMITMENT_NOT_RECORDED)).toEqual([]);
    expect(COMMITMENT_NOT_RECORDED).not.toMatch(VOCABULARIO_DE_ESPERA);
    expect(COMMITMENT_NOT_RECORDED).not.toContain("—");
  });
});

describe("travessão normalizado fora dos textos próprios do produto (Goal057/U-06)", () => {
  it("nenhum texto de PRODUCT_OWN_TEXTS contém U+2014", () => {
    for (const text of PRODUCT_OWN_TEXTS) {
      expect(text).not.toContain("—");
    }
  });
});

describe("normalizeModelDashes (Goal057/U-06)", () => {
  it("troca U+2014 (sempre) por vírgula", () => {
    expect(normalizeModelDashes("Perfeito — só me confirma o nome.")).toBe(
      "Perfeito, só me confirma o nome.",
    );
    expect(normalizeModelDashes("Tudo certo — te vejo la — combinado?")).toBe(
      "Tudo certo, te vejo la, combinado?",
    );
  });

  it("troca U+2013 cercado de espaço por vírgula, mas não toca faixa numérica sem espaço", () => {
    expect(normalizeModelDashes("Segunda a sexta – das 9h as 18h.")).toBe(
      "Segunda a sexta, das 9h as 18h.",
    );
    expect(normalizeModelDashes("Tenho horario as 10–11h.")).toBe(
      "Tenho horario as 10–11h.",
    );
  });

  it("não sobra pontuação duplicada nem vírgula solta nas bordas", () => {
    expect(normalizeModelDashes("— Oi, tudo bem?")).toBe("Oi, tudo bem?");
    expect(normalizeModelDashes("Tudo certo —")).toBe("Tudo certo");
    expect(normalizeModelDashes("Combinado — .")).toBe("Combinado.");
  });

  it("sem travessão, o texto sai intacto: nenhuma limpeza de vírgula mexe nele", () => {
    expect(normalizeModelDashes("Ok,, beleza , .")).toBe("Ok,, beleza , .");
    expect(normalizeModelDashes("Perfeito, obrigada!")).toBe(
      "Perfeito, obrigada!",
    );
  });

  it("não destrói quebra de linha ao normalizar travessão em lista", () => {
    expect(
      normalizeModelDashes("Horarios:\n— 10h\n— 11h"),
    ).toBe("Horarios:\n10h\n11h");
  });
});

type ToolCallRow = {
  tenantId: string;
  aiRunId: string;
  name: string;
  status: "SUCCEEDED" | "FAILED" | "STARTED";
  arguments: Record<string, unknown>;
};

function createGuardHarness(input: {
  pendingAction?: Record<string, unknown>;
  toolCalls?: ToolCallRow[];
}) {
  const store = {
    state: (input.pendingAction
      ? { pendingAction: input.pendingAction }
      : {}) as Record<string, unknown>,
    messages: [] as Array<{ body: string }>,
    aiRunUpdates: [] as Array<Record<string, unknown>>,
    toolCalls: input.toolCalls ?? [],
  };
  const conversation = {
    id: "conversation-1",
    tenantId: "tenant-1",
    channelId: "channel-1",
    humanHandoff: false,
  };
  const prisma = {
    conversation: {
      findUnique: async () => ({ ...conversation, state: store.state }),
      update: async (args: any) => {
        if (args.data.state) store.state = args.data.state;
        return { ...conversation, state: store.state };
      },
    },
    message: {
      create: async (args: any) => {
        store.messages.push({ body: args.data.body });
        return {
          id: `message-${store.messages.length}`,
          correlationId: args.data.correlationId,
        };
      },
    },
    aiRun: {
      update: async (args: any) => {
        store.aiRunUpdates.push(args.data);
        return {};
      },
    },
    aiToolCall: {
      findMany: async (args: any) =>
        store.toolCalls
          .filter(
            (call) =>
              call.tenantId === args.where.tenantId &&
              call.aiRunId === args.where.aiRunId &&
              call.status === args.where.status &&
              (args.where.name?.in ?? [call.name]).includes(call.name),
          )
          .map((call) => ({ name: call.name, arguments: call.arguments })),
    },
  } as unknown as PrismaClient;
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const assistant = new AssistantService(
    prisma,
    logger as unknown as DiagnosticLogger,
    { invoke: vi.fn() } as never,
  );
  return { assistant, store, logger };
}

function session(): AssistantGraphSession {
  return {
    conversationId: "conversation-1",
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    inputMessageIds: ["inbound-1"],
    turnId: "turn-1",
    phone: "5511999999999",
    customerName: "Maria",
    businessContext: DEFAULT_BUSINESS_CONTEXT,
    instructions: "",
    promptVersion: "test",
    input: [],
    turns: [],
    iteration: 1,
    aiRunId: "ai-run-1",
  };
}

function modelReply(
  message: string,
  extra: Record<string, unknown> = {},
): ModelResponse {
  return {
    id: "response-1",
    continuation: null,
    text: JSON.stringify({
      action: "send_message",
      messages: [message],
      confidence: 0.9,
      ...extra,
    }),
    toolCalls: [],
  };
}

const scheduleDraft = {
  type: "schedule",
  serviceId: "service-1",
  date: "2026-09-28",
  startTime: "10:00",
  customerName: "Maria",
  customerPhone: "5511999999999",
  holdId: "hold-1",
  idempotencyKey: "key-1",
  preparedInTurnId: "turn-0",
};

const CLAIM = "Pronto, ficou confirmado para segunda às 10h!";

describe("guard de afirmação de efeito não gravado em completeGraphTurn (QA A-01)", () => {
  it("sem rascunho pendente, a afirmação sai como o modelo escreveu", async () => {
    const { assistant, store, logger } = createGuardHarness({});

    const reply = await assistant.completeGraphTurn(session(), modelReply(CLAIM));

    expect(reply.text).toBe(CLAIM);
    expect(store.messages.map((m) => m.body)).toEqual([CLAIM]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("com rascunho e confirm bem-sucedido no ledger do AiRun, a afirmação sai", async () => {
    const { assistant, store, logger } = createGuardHarness({
      pendingAction: scheduleDraft,
      toolCalls: [
        {
          tenantId: "tenant-1",
          aiRunId: "ai-run-1",
          name: "create_appointment",
          status: "SUCCEEDED",
          arguments: { action: "confirm" },
        },
      ],
    });

    const reply = await assistant.completeGraphTurn(session(), modelReply(CLAIM));

    expect(reply.text).toBe(CLAIM);
    expect(store.messages.map((m) => m.body)).toEqual([CLAIM]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("com rascunho e sem confirm, sai o texto fixo, com warn sem texto e outputText original", async () => {
    const { assistant, store, logger } = createGuardHarness({
      pendingAction: scheduleDraft,
    });
    const response = modelReply(CLAIM);

    const reply = await assistant.completeGraphTurn(session(), response);

    expect(reply.text).toBe(COMMITMENT_NOT_RECORDED);
    expect(store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);
    expect(store.aiRunUpdates[0]).toMatchObject({
      status: "SUCCEEDED",
      outputText: response.text,
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [fields, message] = logger.warn.mock.calls[0];
    expect(fields).toEqual({
      requestId: "request-1",
      tenantId: "tenant-1",
      conversationId: "conversation-1",
      aiRunId: "ai-run-1",
      claimType: "schedule",
      pendingActionType: "schedule",
    });
    const logged = JSON.stringify([fields, message]);
    expect(logged).not.toContain("confirmado");
    expect(logged).not.toContain("segunda");
    // O turno não vira handoff por causa do guard.
    expect(store.state.aiConversation).toMatchObject({
      aiEnabledForChat: true,
    });
  });

  it("prepare bem-sucedido no ledger não é confirmação", async () => {
    const { assistant, store } = createGuardHarness({
      pendingAction: scheduleDraft,
      toolCalls: [
        {
          tenantId: "tenant-1",
          aiRunId: "ai-run-1",
          name: "create_appointment",
          status: "SUCCEEDED",
          arguments: { action: "prepare" },
        },
      ],
    });

    await assistant.completeGraphTurn(session(), modelReply(CLAIM));

    expect(store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);
  });

  it("confirm que falhou (hold vencido) não é confirmação", async () => {
    const { assistant, store } = createGuardHarness({
      pendingAction: { ...scheduleDraft, holdId: null },
      toolCalls: [
        {
          tenantId: "tenant-1",
          aiRunId: "ai-run-1",
          name: "create_appointment",
          status: "FAILED",
          arguments: { action: "confirm" },
        },
      ],
    });

    await assistant.completeGraphTurn(session(), modelReply(CLAIM));

    expect(store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);
  });

  it("confirm de outro AiRun não é evidência deste turno", async () => {
    const { assistant, store } = createGuardHarness({
      pendingAction: scheduleDraft,
      toolCalls: [
        {
          tenantId: "tenant-1",
          aiRunId: "ai-run-0",
          name: "create_appointment",
          status: "SUCCEEDED",
          arguments: { action: "confirm" },
        },
      ],
    });

    await assistant.completeGraphTurn(session(), modelReply(CLAIM));

    expect(store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);
  });

  it("a evidência nunca sai do JSON da decisão: status confirmed no rascunho do modelo não conta", async () => {
    const { assistant, store } = createGuardHarness({
      pendingAction: scheduleDraft,
    });

    await assistant.completeGraphTurn(
      session(),
      modelReply(CLAIM, {
        appointmentDraftPatch: { status: "confirmed" },
        toolName: "create_appointment",
        toolInput: { action: "confirm" },
      }),
    );

    expect(store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);
  });

  it("série recorrente pendente usa o vocabulário de schedule e confirm_recurring_appointments como evidência", async () => {
    const recurringDraft = {
      type: "recurring",
      holdIds: ["hold-1", "hold-2"],
      serviceIds: ["service-1"],
      idempotencyKey: "key-r",
    };
    const blocked = createGuardHarness({ pendingAction: recurringDraft });
    await blocked.assistant.completeGraphTurn(
      session(),
      modelReply("Prontinho, todos os horários agendados!"),
    );
    expect(blocked.store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);
    expect(blocked.logger.warn.mock.calls[0][0]).toMatchObject({
      claimType: "schedule",
      pendingActionType: "recurring",
    });

    const allowed = createGuardHarness({
      pendingAction: recurringDraft,
      toolCalls: [
        {
          tenantId: "tenant-1",
          aiRunId: "ai-run-1",
          name: "confirm_recurring_appointments",
          status: "SUCCEEDED",
          arguments: { holdIds: ["hold-1", "hold-2"] },
        },
      ],
    });
    await allowed.assistant.completeGraphTurn(
      session(),
      modelReply("Prontinho, todos os horários agendados!"),
    );
    expect(allowed.store.messages.map((m) => m.body)).toEqual([
      "Prontinho, todos os horários agendados!",
    ]);
  });

  it("remarcação: rascunho reschedule sem confirm bloqueia; com reschedule_appointment confirm sai", async () => {
    const rescheduleDraft = {
      type: "reschedule",
      appointmentId: "appointment-1",
      date: "2026-09-29",
      startTime: "11:00",
      idempotencyKey: "key-re",
    };
    const text = "Pronto, remarcado para terça às 11h.";
    const blocked = createGuardHarness({ pendingAction: rescheduleDraft });
    await blocked.assistant.completeGraphTurn(session(), modelReply(text));
    expect(blocked.store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);
    expect(blocked.logger.warn.mock.calls[0][0]).toMatchObject({
      claimType: "reschedule",
      pendingActionType: "reschedule",
    });

    const allowed = createGuardHarness({
      pendingAction: rescheduleDraft,
      toolCalls: [
        {
          tenantId: "tenant-1",
          aiRunId: "ai-run-1",
          name: "reschedule_appointment",
          status: "SUCCEEDED",
          arguments: { action: "confirm" },
        },
      ],
    });
    await allowed.assistant.completeGraphTurn(session(), modelReply(text));
    expect(allowed.store.messages.map((m) => m.body)).toEqual([text]);
  });

  it("remarcação com vocabulário genérico de confirmação ('confirmada') também bloqueia sem confirm", async () => {
    const rescheduleDraft = {
      type: "reschedule",
      appointmentId: "appointment-1",
      date: "2026-09-29",
      startTime: "11:00",
      idempotencyKey: "key-re",
    };
    const text = "Pronto, sua remarcação foi confirmada.";
    const blocked = createGuardHarness({ pendingAction: rescheduleDraft });
    await blocked.assistant.completeGraphTurn(session(), modelReply(text));
    expect(blocked.store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);
  });

  it("cancelamento: rascunho cancel sem confirm bloqueia; com cancel_appointment confirm sai", async () => {
    const cancelDraft = {
      type: "cancel",
      appointmentId: "appointment-1",
      idempotencyKey: "key-c",
    };
    const text = "Tudo certo, seu horário foi cancelado.";
    const blocked = createGuardHarness({ pendingAction: cancelDraft });
    await blocked.assistant.completeGraphTurn(session(), modelReply(text));
    expect(blocked.store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);

    const allowed = createGuardHarness({
      pendingAction: cancelDraft,
      toolCalls: [
        {
          tenantId: "tenant-1",
          aiRunId: "ai-run-1",
          name: "cancel_appointment",
          status: "SUCCEEDED",
          arguments: { action: "confirm" },
        },
      ],
    });
    await allowed.assistant.completeGraphTurn(session(), modelReply(text));
    expect(allowed.store.messages.map((m) => m.body)).toEqual([text]);
  });

  it("cancelamento com vocabulário genérico de confirmação ('confirmado') também bloqueia sem confirm", async () => {
    const cancelDraft = {
      type: "cancel",
      appointmentId: "appointment-1",
      idempotencyKey: "key-c",
    };
    const text = "Cancelamento confirmado!";
    const blocked = createGuardHarness({ pendingAction: cancelDraft });
    await blocked.assistant.completeGraphTurn(session(), modelReply(text));
    expect(blocked.store.messages.map((m) => m.body)).toEqual([
      COMMITMENT_NOT_RECORDED,
    ]);
  });

  it("afirmação de outro tipo que o do rascunho não é violação", async () => {
    const { assistant, store, logger } = createGuardHarness({
      pendingAction: scheduleDraft,
    });

    await assistant.completeGraphTurn(
      session(),
      modelReply("Seu horário antigo foi cancelado."),
    );

    expect(store.messages.map((m) => m.body)).toEqual([
      "Seu horário antigo foi cancelado.",
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    "Seu horário está reservado. Posso confirmar?",
    "Deixei pré-agendado para segunda às 10h. Quer que eu confirme?",
    "Certo, vou confirmar isso pra você.",
    "Ainda não está confirmado, tá? Posso seguir?",
  ])("com rascunho pendente, %s sai como escrito", async (text) => {
    const { assistant, store, logger } = createGuardHarness({
      pendingAction: scheduleDraft,
    });

    await assistant.completeGraphTurn(session(), modelReply(text));

    expect(store.messages.map((m) => m.body)).toEqual([text]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("a mensagem persistida nunca contém U+2014; faixa numérica sem espaço (10–11) não é tocada", async () => {
    const { assistant, store } = createGuardHarness({});

    await assistant.completeGraphTurn(
      session(),
      modelReply("Perfeito — funcionamos das 10–11h, combinado?"),
    );

    expect(store.messages.map((m) => m.body)).toEqual([
      "Perfeito, funcionamos das 10–11h, combinado?",
    ]);
    expect(store.messages[0]?.body).not.toContain("—");
  });
});
