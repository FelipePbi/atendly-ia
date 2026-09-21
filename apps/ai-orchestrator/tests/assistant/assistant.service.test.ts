import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import {
  AssistantService,
  PRODUCT_OWN_TEXTS,
} from "../../src/modules/assistant/assistant.service.js";
import { derivePromptVersion } from "../../src/modules/prompts/system.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { VOCABULARIO_DE_ESPERA } from "../support/vocabulario-de-espera.js";

const phone = "5511999999999";

describe("AssistantService conversational decisions", () => {
  it("answers a first generic greeting without calling the model or offering services", async () => {
    const { prisma, store } = createPrismaMock();
    const modelProvider = { invoke: vi.fn() };
    const assistant = new AssistantService(
      prisma,
      undefined,
      modelProvider as never,
    );

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Oi",
      channelMessage: channelMessage(),
      businessContext: configuredBusinessContext(),
    });

    expect(reply.text).toBe("Oii, tudo bem? Como posso te ajudar hoje?");
    expect(modelProvider.invoke).not.toHaveBeenCalled();
    expect(store.state.aiConversation).toMatchObject({
      stage: "QUALIFYING_CONTACT",
      classification: "unknown",
    });
    expect(store.state.aiDecisionLogs[0]).toMatchObject({
      action: "send_message",
      promptVersion: derivePromptVersion("BALANCED"),
    });
  });

  it("registers the prompt version of the style effectively used, not a fixed constant", async () => {
    const { prisma: professionalPrisma, store: professionalStore } =
      createPrismaMock();
    const professionalAssistant = new AssistantService(
      professionalPrisma,
      undefined,
      { invoke: vi.fn() } as never,
    );

    await professionalAssistant.handleIncomingText({
      phone,
      text: "Oi",
      channelMessage: channelMessage(),
      businessContext: configuredBusinessContext(),
      aiSettings: { aiEnabled: true, tone: "PROFESSIONAL" },
    });

    expect(professionalStore.state.aiDecisionLogs[0]).toMatchObject({
      promptVersion: derivePromptVersion("PROFESSIONAL"),
    });
    expect(professionalStore.state.aiDecisionLogs[0].promptVersion).not.toBe(
      derivePromptVersion("BALANCED"),
    );
  });

  it("uses the light and close tone without inventing an assistant identity", async () => {
    const { prisma } = createPrismaMock();
    const modelProvider = { invoke: vi.fn() };
    const assistant = new AssistantService(
      prisma,
      undefined,
      modelProvider as never,
    );

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Oi",
      channelMessage: channelMessage(),
      businessContext: configuredBusinessContext(),
      aiSettings: {
        aiEnabled: true,
        tone: "BALANCED",
      },
    });

    expect(reply.text).toBe("Oii, tudo bem? Como posso te ajudar hoje?");
    expect(modelProvider.invoke).not.toHaveBeenCalled();
  });

  it("uses the professional and objective tone", async () => {
    const { prisma } = createPrismaMock();
    const modelProvider = { invoke: vi.fn() };
    const assistant = new AssistantService(
      prisma,
      undefined,
      modelProvider as never,
    );

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Olá",
      channelMessage: channelMessage(),
      businessContext: configuredBusinessContext(),
      aiSettings: {
        aiEnabled: true,
        tone: "PROFESSIONAL",
      },
    });

    expect(reply.text).toBe("Olá, tudo bem? Como posso te ajudar hoje?");
    expect(modelProvider.invoke).not.toHaveBeenCalled();
  });

  it("uses the casual tone", async () => {
    const { prisma } = createPrismaMock();
    const modelProvider = { invoke: vi.fn() };
    const assistant = new AssistantService(
      prisma,
      undefined,
      modelProvider as never,
    );

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Oi",
      channelMessage: channelMessage(),
      businessContext: configuredBusinessContext(),
      aiSettings: {
        aiEnabled: true,
        tone: "CASUAL",
      },
    });

    expect(reply.text).toBe("Oii, tudo bem? Como posso te ajudar hoje? 😊");
    expect(modelProvider.invoke).not.toHaveBeenCalled();
  });

  it("does not invent an assistant identity after an owner message", async () => {
    const { prisma, store } = createPrismaMock();
    store.messages.push({
      id: "owner-message-1",
      conversationId: store.conversation.id,
      direction: "OUTBOUND",
      source: "OWNER",
      role: "assistant",
      body: "Oi Maria, pode me mandar o horário que você prefere?",
      createdAt: new Date(Date.UTC(2026, 5, 4, 12, 0)),
    });
    const modelProvider = {
      invoke: vi.fn().mockResolvedValue({
        id: "response-1",
        text: JSON.stringify({
          action: "send_message",
          messages: ["Claro, consigo te ajudar com isso."],
          conversationStage: "GENERAL_CONVERSATION",
          classification: "potential_customer",
          confidence: 0.9,
        }),
        toolCalls: [],
        continuation: {},
      }),
    };
    const assistant = new AssistantService(
      prisma,
      undefined,
      modelProvider as never,
    );

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Pode ser amanhã?",
      channelMessage: channelMessage(),
      businessContext: configuredBusinessContext(),
      aiSettings: {
        aiEnabled: true,
        tone: "BALANCED",
      },
    });

    expect(reply.text).toBe("Claro, consigo te ajudar com isso.");
  });

  it("pauses the chat for supplier-like messages without calling the model", async () => {
    const { prisma, store } = createPrismaMock();
    const modelProvider = { invoke: vi.fn() };
    const assistant = new AssistantService(
      prisma,
      undefined,
      modelProvider as never,
    );

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Oi, aqui e da distribuidora. Chegou o pedido dos produtos?",
      channelMessage: channelMessage(),
      businessContext: configuredBusinessContext(),
    });

    expect(reply.text).toBe(
      "Oi! Vou deixar essa mensagem para a equipe verificar e te responder direitinho, ta bom?",
    );
    expect(modelProvider.invoke).not.toHaveBeenCalled();
    expect(store.conversation).toMatchObject({
      humanHandoff: true,
      status: "HUMAN_HANDOFF",
    });
    expect(store.handoffs).toEqual([
      expect.objectContaining({
        reason: "supplier_or_partner",
        externalContactId: phone,
      }),
    ]);
    expect(store.state.aiConversation).toMatchObject({
      aiEnabledForChat: false,
      stage: "AI_PAUSED",
      classification: "supplier_or_partner",
    });
  });

  it("persists multi-service appointment draft totals from a structured AI decision", async () => {
    const { prisma, store } = createPrismaMock();
    const modelProvider = {
      invoke: vi.fn().mockResolvedValue({
        id: "response-1",
        text: JSON.stringify({
          action: "update_appointment_draft",
          messages: [
            "Perfeito, cilios + sobrancelha fica R$ 220,00 no total.",
            "Se comecar as 14:00, termina por volta de 16:30. Posso confirmar esse horario pra voce?",
          ],
          appointmentDraftPatch: {
            services: [
              {
                serviceId: 1,
                name: "Extensao de cilios",
                durationMinutes: 120,
                price: 180,
              },
              {
                serviceId: 2,
                name: "Design de sobrancelha",
                durationMinutes: 30,
                price: 40,
              },
            ],
            selectedStartDateTime: "2026-08-12T14:00:00-03:00",
            status: "waiting_confirmation",
          },
          conversationStage: "CONFIRMING_APPOINTMENT",
          classification: "potential_customer",
          confidence: 0.94,
        }),
        toolCalls: [],
        continuation: {},
      }),
    };
    const assistant = new AssistantService(
      prisma,
      undefined,
      modelProvider as never,
    );

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Quero fazer cilios e sobrancelha amanha as 14h",
      channelMessage: channelMessage(),
      businessContext: configuredBusinessContext(),
    });

    expect(reply.text).toContain("cilios + sobrancelha");
    expect(store.state.appointmentDraft).toMatchObject({
      customerPhone: phone,
      totalDurationMinutes: 150,
      totalPrice: 220,
      selectedEndDateTime: "2026-08-12T19:30:00.000Z",
      status: "waiting_confirmation",
    });
    expect(
      store.state.conversationMemory.knownCustomerInfo.interestedServices,
    ).toEqual(["Extensao de cilios", "Design de sobrancelha"]);
  });
});

describe("AssistantService.recordInboundText media persistence", () => {
  it("persists kind, an attachment and strips the base64 from rawPayload", async () => {
    const { prisma, store } = createPrismaMock();
    const assistant = new AssistantService(prisma, undefined, {
      invoke: vi.fn(),
    } as never);

    await assistant.recordInboundText({
      phone,
      text: "",
      channelMessage: {
        ...channelMessage(),
        kind: "audio",
        text: undefined,
        media: {
          mimetype: "audio/ogg; codecs=opus",
          sizeBytes: 12_345,
          durationSeconds: 7,
          hasBase64: true,
          hasMediaUrl: false,
          tooLarge: false,
        },
        raw: {
          event: "Message",
          data: {
            Info: { ID: "external-message-1" },
            Message: {
              audioMessage: { mimetype: "audio/ogg; codecs=opus" },
              base64: "d2hhdHNhcHAtYXVkaW8=",
            },
          },
        },
      },
    });

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].kind).toBe("AUDIO");
    const rawPayload = store.messages[0].rawPayload as {
      data: { Message: Record<string, unknown> };
    };
    expect(rawPayload.data.Message).not.toHaveProperty("base64");

    expect(store.attachments).toHaveLength(1);
    expect(store.attachments[0]).toMatchObject({
      tenantId: "tenant-1",
      messageId: store.messages[0].id,
      kind: "AUDIO",
      mimetype: "audio/ogg; codecs=opus",
      sizeBytes: 12_345,
      durationSeconds: 7,
      tooLarge: false,
    });
  });

  it("does not create an attachment for a plain text message", async () => {
    const { prisma, store } = createPrismaMock();
    const assistant = new AssistantService(prisma, undefined, {
      invoke: vi.fn(),
    } as never);

    await assistant.recordInboundText({
      phone,
      text: "Oi",
      channelMessage: channelMessage(),
    });

    expect(store.messages[0].kind).toBe("TEXT");
    expect(store.attachments).toHaveLength(0);
  });
});

function createPrismaMock() {
  const store = {
    state: {} as Record<string, any>,
    conversation: {
      id: "conversation-1",
      tenantId: "tenant-1",
      channelId: "channel-1",
      externalContactId: phone,
      customerName: null as string | null,
      humanHandoff: false,
      status: "ACTIVE",
      handoffPausedUntil: null as Date | null,
    },
    messages: [] as Array<{
      id: string;
      conversationId: string;
      direction: "INBOUND" | "OUTBOUND";
      source?: "CUSTOMER" | "AI" | "OWNER" | null;
      role: string;
      body: string;
      kind?: string;
      rawPayload?: unknown;
      createdAt: Date;
    }>,
    attachments: [] as Array<Record<string, unknown>>,
    handoffs: [] as unknown[],
  };

  let messageCounter = 0;
  const prisma = {
    conversation: {
      upsert: async (args: any) => {
        store.conversation = {
          ...store.conversation,
          customerName:
            args.update.customerName ?? store.conversation.customerName,
          humanHandoff:
            args.update.humanHandoff ?? store.conversation.humanHandoff,
          status: args.update.status ?? store.conversation.status,
          handoffPausedUntil:
            args.update.handoffPausedUntil ??
            store.conversation.handoffPausedUntil,
        };
        return { ...store.conversation, state: store.state };
      },
      findUnique: async () => ({ ...store.conversation, state: store.state }),
      update: async (args: any) => {
        if (args.data.state) store.state = args.data.state;
        store.conversation = {
          ...store.conversation,
          humanHandoff:
            args.data.humanHandoff ?? store.conversation.humanHandoff,
          status: args.data.status ?? store.conversation.status,
          handoffPausedUntil:
            args.data.handoffPausedUntil ??
            store.conversation.handoffPausedUntil,
        };
        return { ...store.conversation, state: store.state };
      },
    },
    message: {
      create: async (args: any) => {
        messageCounter += 1;
        const message = {
          id: `message-${messageCounter}`,
          conversationId: args.data.conversationId,
          direction: args.data.direction,
          source: args.data.source,
          role: args.data.role,
          body: args.data.body,
          kind: args.data.kind,
          rawPayload: args.data.rawPayload,
          createdAt: new Date(Date.UTC(2026, 5, 4, 12, messageCounter)),
        };
        store.messages.push(message);
        return message;
      },
      findMany: async () => [...store.messages].reverse(),
      update: async (args: any) => {
        const message = store.messages.find(
          (item) => item.id === args.where.id,
        );
        return { ...message, ...args.data };
      },
    },
    messageAttachment: {
      create: async (args: any) => {
        const attachment = { id: `attachment-${store.attachments.length + 1}`, ...args.data };
        store.attachments.push(attachment);
        return attachment;
      },
    },
    aiRun: {
      create: vi.fn().mockResolvedValue({ id: "ai-run-1" }),
      update: vi.fn(),
    },
    aiToolCall: {
      create: vi.fn(),
      update: vi.fn(),
    },
    handoff: {
      findFirst: async () => store.handoffs[0] ?? null,
      create: async (args: any) => {
        store.handoffs.push(args.data);
        return { id: `handoff-${store.handoffs.length}`, ...args.data };
      },
    },
  } as unknown as PrismaClient;

  return { prisma, store };
}

function channelMessage() {
  return {
    provider: "evolution-go" as const,
    instanceId: "instance-1",
    messageId: "external-message-1",
    chatId: `${phone}@s.whatsapp.net`,
    customerPhone: phone,
    customerName: "Maria",
    fromMe: false,
    isGroup: false,
    kind: "text" as const,
    text: "Oi",
    raw: {},
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
  };
}

function configuredBusinessContext() {
  return {
    ...DEFAULT_BUSINESS_CONTEXT,
    businessName: "Camili Krauser Beauty",
    configured: true,
  };
}

const assistantServiceSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/assistant/assistant.service.ts",
);
const messageGraphSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/graph/message-graph.ts",
);

/** Extrai literais de string dentro de todo array `messages: [...]` do arquivo (forma que `assistant.service.ts` usa). */
function extractMessagesArrayLiterals(source: string): string[] {
  const literals: string[] = [];
  const arrayBlockPattern = /messages:\s*\[([\s\S]*?)\]/g;
  const stringLiteralPattern = /"((?:[^"\\]|\\.)*)"/g;
  let arrayMatch: RegExpExecArray | null;
  while ((arrayMatch = arrayBlockPattern.exec(source))) {
    stringLiteralPattern.lastIndex = 0;
    let literalMatch: RegExpExecArray | null;
    while ((literalMatch = stringLiteralPattern.exec(arrayMatch[1]))) {
      literals.push(JSON.parse(`"${literalMatch[1]}"`) as string);
    }
  }
  return literals;
}

/** Mapa `identificador -> literal` de toda declaração `const <nome> = "..."` (exportada ou não) do arquivo. */
function extractModuleStringConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  const constPattern = /(?:export\s+)?const\s+(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = constPattern.exec(source))) {
    constants.set(match[1], JSON.parse(`"${match[2]}"`) as string);
  }
  return constants;
}

/** Corpo de `function <nome>(...) { ... }`, delimitado por contagem de chaves (robusto a blocos aninhados). */
function extractFunctionBody(
  source: string,
  functionName: string,
): string | undefined {
  const signatureIndex = source.indexOf(`function ${functionName}(`);
  if (signatureIndex === -1) return undefined;
  const openBraceIndex = source.indexOf("{", signatureIndex);
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex + 1, i);
    }
  }
  return undefined;
}

/**
 * Extrai os literais de constante de módulo despachados como texto de
 * cliente via `response: { text: X }` ou `return { ..., text: X }` (forma
 * que `message-graph.ts` usa). `X` pode ser o identificador da constante
 * diretamente, ou uma chamada de função cujo corpo só devolve identificadores
 * de constantes de módulo (caso de `unsupportedReplyFor`). Identificadores
 * que não resolvem para uma constante de módulo (`state.inboundText`,
 * `message.text`, etc. — texto dinâmico do turno, não texto próprio do
 * produto) são ignorados: não há constante de módulo com esse nome no mapa.
 */
function extractDispatchedModuleConstantTexts(source: string): string[] {
  const constants = extractModuleStringConstants(source);
  const literals: string[] = [];
  const dispatchPattern = /\btext:\s*(\w+)(\()?/g;
  let dispatchMatch: RegExpExecArray | null;
  while ((dispatchMatch = dispatchPattern.exec(source))) {
    const [, identifier, isCall] = dispatchMatch;
    if (isCall) {
      const body = extractFunctionBody(source, identifier);
      if (!body) continue;
      const returnPattern = /return\s+(\w+)\s*;/g;
      let returnMatch: RegExpExecArray | null;
      while ((returnMatch = returnPattern.exec(body))) {
        const literal = constants.get(returnMatch[1]);
        if (literal !== undefined) literals.push(literal);
      }
      continue;
    }
    const literal = constants.get(identifier);
    if (literal !== undefined) literals.push(literal);
  }
  return literals;
}

describe("conjunto fechado dos textos que o produto emite por conta própria (A-09 / Goal034)", () => {
  const baselineFixedTexts = [
    "Vou chamar uma pessoa da equipe pra te responder com atencao por aqui, ta?",
    "Vou chamar a profissional para continuar seu atendimento.",
    "Vou deixar essa conversa para a profissional responder, ta?",
    "Sinto muito por isso. Vou chamar uma pessoa da equipe pra te atender com atencao por aqui, ta?",
    "Oi! Vou deixar essa mensagem para a equipe verificar e te responder direitinho, ta bom?",
    "Vou deixar essa mensagem para ela responder pessoalmente.",
    "Certo, vou te ajudar por aqui.",
  ];
  const baselineGreetings = [
    "Olá, tudo bem? Como posso te ajudar hoje?",
    "Oii, tudo bem? Como posso te ajudar hoje?",
    "Oii, tudo bem? Como posso te ajudar hoje? 😊",
  ];
  /** Os seis textos de cliente que `message-graph.ts` emite por conta própria (Goal037 / WU-02). */
  const baselineMessageGraphTexts = [
    "Recebi sua mensagem, mas por enquanto consigo responder melhor por texto. Me envie sua pergunta em texto que continuo por aqui.",
    "Tive um problema para consultar o sistema agora. Vou chamar a profissional para continuar seu atendimento.",
    "Recebi seu audio, mas nao consegui entender o conteudo dele agora. Pode me mandar em texto, por favor? Assim continuo seu atendimento por aqui.",
    "Recebi sua imagem e ja chamei a profissional para dar uma olhada com voce. Ela continua seu atendimento por aqui.",
    "Recebi seu documento e ele ja esta aqui na conversa. Por enquanto nao consigo abrir arquivos, entao me conta em texto o que voce precisa que eu ajudo.",
    "Recebi seu video e ele ja esta aqui na conversa. Por enquanto nao consigo assistir por aqui, entao me conta em texto o que voce precisa que eu ajudo.",
  ];

  it("reúne exatamente os textos da baseline, sem alterar uma vírgula", () => {
    for (const text of [
      ...baselineFixedTexts,
      ...baselineGreetings,
      ...baselineMessageGraphTexts,
    ]) {
      expect(PRODUCT_OWN_TEXTS).toContain(text);
    }
    expect(PRODUCT_OWN_TEXTS).toHaveLength(
      baselineFixedTexts.length +
        baselineGreetings.length +
        baselineMessageGraphTexts.length,
    );
  });

  it("reprova vocabulário de espera em qualquer texto do conjunto, inclusive os de message-graph.ts", () => {
    for (const text of PRODUCT_OWN_TEXTS) {
      expect(text).not.toMatch(VOCABULARIO_DE_ESPERA);
    }
  });

  it("fecha o conjunto: todo literal em `messages: [...]` de assistant.service.ts pertence a ele", () => {
    const source = readFileSync(assistantServiceSourcePath, "utf8");
    const literals = extractMessagesArrayLiterals(source);
    for (const literal of literals) {
      expect(
        PRODUCT_OWN_TEXTS,
        `texto novo do produto fora do conjunto: "${literal}"`,
      ).toContain(literal);
    }
  });

  it("fecha o conjunto: toda constante de módulo despachada como texto em message-graph.ts pertence a ele", () => {
    const source = readFileSync(messageGraphSourcePath, "utf8");
    const literals = extractDispatchedModuleConstantTexts(source);
    expect(literals.length).toBeGreaterThan(0);
    for (const literal of literals) {
      expect(
        PRODUCT_OWN_TEXTS,
        `texto novo do produto fora do conjunto: "${literal}"`,
      ).toContain(literal);
    }
  });

  it("o fechamento sobre `messages: [...]` realmente acusa um texto novo ausente do conjunto", () => {
    const fixtureComTextoNovo = `
      return {
        messages: ["Esse texto novo nao esta no conjunto e deveria acusar."],
      };
    `;
    const literals = extractMessagesArrayLiterals(fixtureComTextoNovo);
    expect(literals).toEqual([
      "Esse texto novo nao esta no conjunto e deveria acusar.",
    ]);
    expect(PRODUCT_OWN_TEXTS).not.toContain(literals[0]);
  });

  it("o fechamento sobre constante de módulo despachada realmente acusa um texto novo ausente do conjunto", () => {
    const fixtureComTextoNovo = `
      const novaRespostaDeCliente = "Esse texto novo de message-graph.ts nao esta no conjunto e deveria acusar.";
      function algumNo(state) {
        return { response: { text: novaRespostaDeCliente } };
      }
    `;
    const literals = extractDispatchedModuleConstantTexts(fixtureComTextoNovo);
    expect(literals).toEqual([
      "Esse texto novo de message-graph.ts nao esta no conjunto e deveria acusar.",
    ]);
    expect(PRODUCT_OWN_TEXTS).not.toContain(literals[0]);
  });

  it("não acusa texto dinâmico do turno nem constante técnica: erro, chave de log, nome de nó ou literal de teste não são texto de cliente", () => {
    const fixtureComTextoTecnico = `
      const NODE_NAME = "classify_intent";
      function respondeTexto(state) {
        if (state.kind === "x") {
          throw new Error("estado impossivel: jid de grupo chegou no despacho");
        }
        return {
          response: { text: state.inboundText },
          logContext: { text: message.text },
        };
      }
    `;
    const literals = extractDispatchedModuleConstantTexts(fixtureComTextoTecnico);
    expect(literals).toEqual([]);
  });
});
