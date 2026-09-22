import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { ACTIVATION_TEST_NOTICE } from "../../src/modules/activation-test/ActivationTestService.js";
import {
  AssistantService,
  PRODUCT_OWN_TEXTS,
} from "../../src/modules/assistant/assistant.service.js";
import { buildStyleGreeting } from "../../src/modules/prompts/style.js";
import { derivePromptVersion } from "../../src/modules/prompts/system.js";
import {
  composeNotificationText,
  notificationFactualLines,
} from "../../src/modules/reminders/notification-message.js";
import type { NotificationFacts } from "../../src/modules/scheduling-service/types.js";
import { AI_CONVERSATION_STYLES } from "../../src/modules/tenant-config/ai-settings.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import {
  CLASS_BINDING_REFUSAL_CATEGORIES,
  CLIENT_FIELD_USE_REFUSAL_CATEGORIES,
  computeBoundaryValueCrossing,
  discoverGoServiceHttpRequests,
  discoverHttpEgressSites,
  INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES,
  listTypeScriptSources,
  readEnvFileValue,
  readEnvSchemaDefault,
  readProductTransportRoutesFile,
} from "../support/http-egress-sites.js";
import { classifyNotificationTextSites } from "../support/notification-message-sites.js";
import {
  classifySendTextSites,
  classifyTransitCallersInSource,
  discoverSendTextSites,
  discoverSendTextTransitChains,
  parseWhatsAppProviderMethods,
  resolveSendTextCarrierMethodNames,
} from "../support/send-text-sites.js";
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
const aiOrchestratorSrcPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src",
);
const bffSrcPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../bff/src",
);
const notificationMessageSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/reminders/notification-message.ts",
);
const activationTestServiceSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/activation-test/ActivationTestService.ts",
);
const platformCredentialIsolationTestPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../security/platform-credential-isolation.test.ts",
);
const whatsAppProviderPortSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/channel/ports/WhatsAppProvider.ts",
);

/** Número de sítios `messages: [...]` que o arquivo tem — piso para o fechamento. */
function countMessagesArraySites(source: string): number {
  return (source.match(/messages:\s*\[/g) ?? []).length;
}

/** Mapa `chave -> literal` de `const PRODUCT_OWN_FIXED_TEXTS = { chave: "...", ... } as const;`. */
function extractProductOwnFixedTextsMap(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const blockMatch = source.match(
    /const PRODUCT_OWN_FIXED_TEXTS = \{([\s\S]*?)\}\s*as const;/,
  );
  if (!blockMatch) return map;
  const entryPattern = /(\w+):\s*"((?:[^"\\]|\\.)*)"/g;
  let entryMatch: RegExpExecArray | null;
  while ((entryMatch = entryPattern.exec(blockMatch[1]))) {
    map.set(entryMatch[1], JSON.parse(`"${entryMatch[2]}"`) as string);
  }
  return map;
}

/** Divide o conteúdo de um array em expressões de topo, ignorando vírgulas dentro de `()`/`[]`/`{}` e de literais. */
function splitTopLevelExpressions(
  content: string,
): Array<{ text: string; offset: number }> {
  const items: Array<{ text: string; offset: number }> = [];
  let depth = 0;
  let quote: string | undefined;
  let current = "";
  let start = 0;
  const pushCurrent = () => {
    if (!current.trim()) return;
    const leading = current.length - current.trimStart().length;
    items.push({ text: current.trim(), offset: start + leading });
  };
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (quote) {
      current += char;
      if (char === "\\") {
        current += content[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      pushCurrent();
      current = "";
      start = i + 1;
      continue;
    }
    current += char;
  }
  pushCurrent();
  return items;
}

/** Categoria de uma expressão de `messages: [...]` de `assistant.service.ts` (Goal038 / FIX-001). */
type MessageExpressionCategory =
  | "quoted_literal"
  | "fixed_text_reference"
  | "dynamic_turn_value_with_fixed_text_fallback"
  | "style_greeting_builder";

interface ClassifiedMessageExpression {
  category: MessageExpressionCategory;
  /** Textos próprios do produto que a expressão produz. Toda categoria produz ao menos um. */
  literals: string[];
}

/**
 * Valor dinâmico do turno: identificador, acesso a propriedade e, no máximo,
 * um `.trim()` — o que `assistant.service.ts` usa do lado esquerdo de um
 * fallback. Nunca é texto próprio do produto, por isso só é aceito quando o
 * lado direito resolve para um texto do conjunto.
 */
const DYNAMIC_TURN_VALUE_PATTERN =
  /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*(?:\.trim\(\))?$/;

/** Texto de `PRODUCT_OWN_FIXED_TEXTS.<chave>`, ou `undefined` se não for essa forma ou a chave não existir. */
function resolveFixedTextReference(
  expression: string,
  fixedTexts: Map<string, string>,
): string | undefined {
  const match = expression.match(/^PRODUCT_OWN_FIXED_TEXTS\.(\w+)$/);
  return match ? fixedTexts.get(match[1]) : undefined;
}

/** Operandos de topo de `a || b`, respeitando aninhamento e literais. */
function splitTopLevelOrOperands(expression: string): string[] {
  const operands: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let current = "";
  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];
    if (quote) {
      current += char;
      if (char === "\\") {
        current += expression[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (depth === 0 && char === "|" && expression[i + 1] === "|") {
      operands.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += char;
  }
  operands.push(current.trim());
  return operands;
}

/**
 * Classifica uma expressão de `messages: [...]` em uma das categorias
 * reconhecidas (formas que `assistant.service.ts` usa):
 *
 * - `quoted_literal`: texto entre aspas escrito no próprio sítio.
 * - `fixed_text_reference`: `PRODUCT_OWN_FIXED_TEXTS.<chave>` que resolve a
 *   um texto do mapa do arquivo.
 * - `dynamic_turn_value_with_fixed_text_fallback`: `<valor do turno> ||
 *   PRODUCT_OWN_FIXED_TEXTS.<chave>` — só o fallback é texto próprio do
 *   produto; o lado esquerdo é valor do turno e não entra no conjunto.
 * - `style_greeting_builder`: `buildStyleGreeting(...)`, que depende de um
 *   estilo em tempo de execução — resolve para o texto de cada estilo aceito
 *   (`AI_CONVERSATION_STYLES`), não para um texto só.
 *
 * Devolve `undefined` para qualquer outra forma: é resíduo, e quem chama
 * derruba o fechamento nomeando arquivo e linha. Descartar em silêncio o que
 * não se entende era exatamente a cegueira que este Goal fecha.
 */
function classifyMessageExpression(
  expression: string,
  fixedTexts: Map<string, string>,
): ClassifiedMessageExpression | undefined {
  const trimmed = expression.trim();

  const quotedLiteralMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (quotedLiteralMatch) {
    return {
      category: "quoted_literal",
      literals: [JSON.parse(`"${quotedLiteralMatch[1]}"`) as string],
    };
  }

  const orOperands = splitTopLevelOrOperands(trimmed);
  if (orOperands.length === 2) {
    const [dynamicValue, fallback] = orOperands;
    const fallbackText = resolveFixedTextReference(fallback, fixedTexts);
    if (DYNAMIC_TURN_VALUE_PATTERN.test(dynamicValue) && fallbackText !== undefined) {
      return {
        category: "dynamic_turn_value_with_fixed_text_fallback",
        literals: [fallbackText],
      };
    }
    return undefined;
  }

  const fixedText = resolveFixedTextReference(trimmed, fixedTexts);
  if (fixedText !== undefined) {
    return { category: "fixed_text_reference", literals: [fixedText] };
  }

  if (/^buildStyleGreeting\([\s\S]*\)$/.test(trimmed)) {
    return {
      category: "style_greeting_builder",
      literals: AI_CONVERSATION_STYLES.map((style) => buildStyleGreeting(style)),
    };
  }

  return undefined;
}

/** Conteúdo de cada array `messages: [...]` de `source`, com o índice em que o conteúdo começa. */
function extractMessagesArrayBlocks(
  source: string,
): Array<{ content: string; startIndex: number }> {
  const blocks: Array<{ content: string; startIndex: number }> = [];
  const sitePattern = /messages:\s*\[/g;
  let siteMatch: RegExpExecArray | null;
  while ((siteMatch = sitePattern.exec(source))) {
    const contentStart = siteMatch.index + siteMatch[0].length;
    let depth = 0;
    let quote: string | undefined;
    let end = contentStart;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (quote) {
        if (char === "\\") {
          end += 1;
          continue;
        }
        if (char === quote) quote = undefined;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        continue;
      }
      if (char === "(" || char === "[" || char === "{") {
        depth += 1;
        continue;
      }
      if (char === ")" || char === "]" || char === "}") {
        if (depth === 0) break;
        depth -= 1;
      }
    }
    blocks.push({ content: source.slice(contentStart, end), startIndex: contentStart });
  }
  return blocks;
}

/**
 * Classifica cada expressão de cada `messages: [...]` de `source` em uma
 * categoria nomeada. Forma fora das categorias é resíduo e derruba o
 * fechamento, nomeando `filePath` e a linha da expressão. Não há allowlist
 * por arquivo ou por linha; o conjunto reconhecido é computado.
 */
function classifyMessageExpressionSites(
  source: string,
  filePath = "<fixture>",
): ClassifiedMessageExpression[] {
  const fixedTexts = extractProductOwnFixedTextsMap(source);
  const sites: ClassifiedMessageExpression[] = [];
  for (const block of extractMessagesArrayBlocks(source)) {
    for (const item of splitTopLevelExpressions(block.content)) {
      const classified = classifyMessageExpression(item.text, fixedTexts);
      if (!classified) {
        const line = lineAt(source, block.startIndex + item.offset);
        throw new Error(
          `${filePath}:${line}: expressão em "messages: [...]" com forma não reconhecida ("${item.text}") ` +
            "— não é literal entre aspas, referência a PRODUCT_OWN_FIXED_TEXTS, " +
            "valor do turno com fallback de PRODUCT_OWN_FIXED_TEXTS nem construtor de texto de módulo.",
        );
      }
      sites.push(classified);
    }
  }
  return sites;
}

/** Extrai os textos que todo array `messages: [...]` do arquivo produz (forma que `assistant.service.ts` usa). */
function extractMessagesArrayLiterals(
  source: string,
  filePath = "<fixture>",
): string[] {
  return classifyMessageExpressionSites(source, filePath).flatMap(
    (site) => site.literals,
  );
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

/** Categoria de um sítio `text:` de `message-graph.ts` (Goal038 / WU-02). */
type DispatchedTextSiteCategory =
  | "module_constant"
  | "dynamic_turn_expression"
  | "type_annotation";

interface ClassifiedDispatchedTextSite {
  category: DispatchedTextSiteCategory;
  /** Textos resolvidos do sítio. Só `module_constant` produz texto; as outras categorias descartam. */
  literals: string[];
}

/**
 * Extrai a expressão bruta que segue um `text:` a partir de `startIndex`,
 * respeitando aspas e parênteses/colchetes/chaves aninhados. Para no primeiro
 * delimitador de topo (`,` `;` `}` `)` `]`), sem consumi-lo — é o que separa
 * a expressão do sítio do que a envolve (próxima propriedade, fim do objeto
 * literal, fim da lista de parâmetros).
 */
function extractTextSiteExpression(source: string, startIndex: number): string {
  let depth = 0;
  let quote: string | undefined;
  let end = startIndex;
  for (; end < source.length; end += 1) {
    const char = source[end];
    if (quote) {
      if (char === "\\") {
        end += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      if (depth === 0) break;
      depth -= 1;
      continue;
    }
    if (depth === 0 && (char === "," || char === ";")) break;
  }
  return source.slice(startIndex, end).trim();
}

/** Linha (1-based) de um índice de caractere em `source`. */
function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/**
 * Classifica cada sítio `text:` de `source` em uma das três categorias
 * reconhecidas (forma que `message-graph.ts` usa):
 *
 * - `module_constant`: o identificador da constante diretamente, ou uma
 *   chamada de função cujo corpo só devolve identificadores de constantes de
 *   módulo (caso de `unsupportedReplyFor(state)`) — texto do produto, entra
 *   no fechamento.
 * - `dynamic_turn_expression`: acesso a `state.*`/`message.*` (com ou sem
 *   `.trim()`) — texto dinâmico do turno, não texto próprio do produto;
 *   categoria declarada, descartada.
 * - `type_annotation`: `text: string` — não é valor, é tipo; categoria
 *   declarada, descartada.
 *
 * Qualquer outra forma — literal inline, template literal, lookup em objeto,
 * identificador que não resolve a constante de módulo — é resíduo: derruba o
 * fechamento lançando erro que nomeia `filePath` e a linha do sítio. Não há
 * allowlist por arquivo ou por linha; o conjunto reconhecido é computado.
 *
 * `imageHandoffSummary` nunca é candidato: é despachado via `handoffSummary:`,
 * não via `text:`, então o padrão `\btext:\s*` desta função nunca o alcança.
 */
function classifyDispatchedTextSites(
  source: string,
  filePath: string,
): ClassifiedDispatchedTextSite[] {
  const constants = extractModuleStringConstants(source);
  const sites: ClassifiedDispatchedTextSite[] = [];
  const sitePattern = /\btext:\s*/g;
  let siteMatch: RegExpExecArray | null;
  while ((siteMatch = sitePattern.exec(source))) {
    const expressionStart = siteMatch.index + siteMatch[0].length;
    const expression = extractTextSiteExpression(source, expressionStart);

    if (expression === "string") {
      sites.push({ category: "type_annotation", literals: [] });
      continue;
    }
    if (/^(?:state|message)\.[\w.]+(?:\.trim\(\))?$/.test(expression)) {
      sites.push({ category: "dynamic_turn_expression", literals: [] });
      continue;
    }

    const callMatch = expression.match(/^([A-Za-z_$][\w$]*)(\([\s\S]*\))?$/);
    if (callMatch) {
      const [, identifier, call] = callMatch;
      if (!call) {
        const literal = constants.get(identifier);
        if (literal !== undefined) {
          sites.push({ category: "module_constant", literals: [literal] });
          continue;
        }
      } else {
        const body = extractFunctionBody(source, identifier);
        if (body !== undefined) {
          const literals: string[] = [];
          const returnPattern = /return\s+(\w+)\s*;/g;
          let returnMatch: RegExpExecArray | null;
          while ((returnMatch = returnPattern.exec(body))) {
            const literal = constants.get(returnMatch[1]);
            if (literal !== undefined) literals.push(literal);
          }
          sites.push({ category: "module_constant", literals });
          continue;
        }
      }
    }

    const line = lineAt(source, siteMatch.index);
    throw new Error(
      `${filePath}:${line}: sítio "text:" com forma não reconhecida ("${expression}") ` +
        "— não é constante de módulo, expressão dinâmica do turno nem anotação de tipo.",
    );
  }
  return sites;
}

/** Só os literais resolvidos (categoria `module_constant`) dos sítios `text:` de `source`. */
function extractDispatchedModuleConstantTexts(
  source: string,
  filePath = "<fixture>",
): string[] {
  return classifyDispatchedTextSites(source, filePath).flatMap(
    (site) => site.literals,
  );
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
    const literals = extractMessagesArrayLiterals(
      source,
      assistantServiceSourcePath,
    );
    expect(literals.length).toBeGreaterThan(0);
    for (const literal of literals) {
      expect(
        PRODUCT_OWN_TEXTS,
        `texto novo do produto fora do conjunto: "${literal}"`,
      ).toContain(literal);
    }
  });

  it("dá piso ao fechamento: o extrator não devolve menos textos do que os sítios `messages: [...]` de assistant.service.ts", () => {
    const source = readFileSync(assistantServiceSourcePath, "utf8");
    const literals = extractMessagesArrayLiterals(
      source,
      assistantServiceSourcePath,
    );
    const siteCount = countMessagesArraySites(source);
    expect(
      literals.length,
      `assistant.service.ts tem ${siteCount} sítio(s) messages: [...] mas o extrator só resolveu ${literals.length} texto(s)`,
    ).toBeGreaterThanOrEqual(siteCount);
  });

  it("o piso do fechamento realmente acusa quando o extrator devolve menos textos do que os sítios", () => {
    const fixtureComSitioSemTexto = `
      function algumaDecisao() {
        return { messages: [] };
      }
      function outraDecisao() {
        return { messages: ["Texto reconhecido normalmente."] };
      }
    `;
    const literals = extractMessagesArrayLiterals(fixtureComSitioSemTexto);
    const siteCount = countMessagesArraySites(fixtureComSitioSemTexto);
    expect(siteCount).toBe(2);
    expect(literals.length).toBeLessThan(siteCount);
  });

  it("classifica as expressões de `messages: [...]` de assistant.service.ts em categorias nomeadas, com resíduo zero", () => {
    const source = readFileSync(assistantServiceSourcePath, "utf8");
    const sites = classifyMessageExpressionSites(
      source,
      assistantServiceSourcePath,
    );
    expect(sites).toHaveLength(countMessagesArraySites(source));
    const counts = {
      quoted_literal: sites.filter((s) => s.category === "quoted_literal")
        .length,
      fixed_text_reference: sites.filter(
        (s) => s.category === "fixed_text_reference",
      ).length,
      dynamic_turn_value_with_fixed_text_fallback: sites.filter(
        (s) => s.category === "dynamic_turn_value_with_fixed_text_fallback",
      ).length,
      style_greeting_builder: sites.filter(
        (s) => s.category === "style_greeting_builder",
      ).length,
    };
    expect(counts).toEqual({
      quoted_literal: 0,
      fixed_text_reference: 4,
      dynamic_turn_value_with_fixed_text_fallback: 1,
      style_greeting_builder: 1,
    });
  });

  it("uma expressão de `messages: [...]` fora das categorias reconhecidas derruba o fechamento nomeando arquivo e linha", () => {
    const fixtureComResiduo = [
      "function algumaDecisao() {",
      "  return { messages: [algumaExpressaoDesconhecida()] };",
      "}",
    ].join("\n");
    expect(() =>
      classifyMessageExpressionSites(fixtureComResiduo, "<fixture-residuo>"),
    ).toThrowError(
      /<fixture-residuo>:2: expressão em "messages: \[\.\.\.\]" com forma não reconhecida/,
    );
  });

  it("fecha o conjunto: toda constante de módulo despachada como texto em message-graph.ts pertence a ele", () => {
    const source = readFileSync(messageGraphSourcePath, "utf8");
    const literals = extractDispatchedModuleConstantTexts(
      source,
      messageGraphSourcePath,
    );
    expect(literals.length).toBeGreaterThan(0);
    for (const literal of literals) {
      expect(
        PRODUCT_OWN_TEXTS,
        `texto novo do produto fora do conjunto: "${literal}"`,
      ).toContain(literal);
    }
  });

  it("classifica os 16 sítios `text:` de message-graph.ts em categorias nomeadas, com resíduo zero", () => {
    const source = readFileSync(messageGraphSourcePath, "utf8");
    const sites = classifyDispatchedTextSites(source, messageGraphSourcePath);
    expect(sites).toHaveLength(16);
    const counts = {
      module_constant: sites.filter((s) => s.category === "module_constant")
        .length,
      dynamic_turn_expression: sites.filter(
        (s) => s.category === "dynamic_turn_expression",
      ).length,
      type_annotation: sites.filter((s) => s.category === "type_annotation")
        .length,
    };
    expect(counts).toEqual({
      module_constant: 3,
      dynamic_turn_expression: 10,
      type_annotation: 3,
    });
  });

  it("um sítio `text:` fora das três categorias reconhecidas derruba o fechamento nomeando arquivo e linha", () => {
    const fixtureComResiduo = [
      "function algumNo(state) {",
      '  return { response: { text: "Um literal inline nao deveria passar por aqui." } };',
      "}",
    ].join("\n");
    expect(() =>
      classifyDispatchedTextSites(fixtureComResiduo, "<fixture-residuo>"),
    ).toThrowError(/<fixture-residuo>:2: sítio "text:" com forma não reconhecida/);
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

describe("conjunto de emissores de texto pelo canal do produto é computado, não escrito à mão (Goal039 / WU-01)", () => {
  it("descobre os sete sítios de sendText de apps/ai-orchestrator/src, com resíduo zero", () => {
    const sites = discoverSendTextSites(aiOrchestratorSrcPath);
    expect(sites).toHaveLength(7);
    const counts = {
      port_declaration: sites.filter((s) => s.category === "port_declaration")
        .length,
      adapter_implementation: sites.filter(
        (s) => s.category === "adapter_implementation",
      ).length,
      composed_by_named_module: sites.filter((s) =>
        s.category.startsWith("composed_by_"),
      ).length,
      assistant_decision_text: sites.filter(
        (s) => s.category === "assistant_decision_text",
      ).length,
      text_in_transit_named_origin: sites.filter(
        (s) => s.category === "text_in_transit_named_origin",
      ).length,
      person_typed_text: sites.filter(
        (s) => s.category === "person_typed_text",
      ).length,
    };
    expect(counts).toEqual({
      port_declaration: 1,
      adapter_implementation: 1,
      composed_by_named_module: 1,
      assistant_decision_text: 1,
      text_in_transit_named_origin: 2,
      person_typed_text: 1,
    });
  });

  it("classifica cada um dos sete sítios reais na categoria e origem esperadas", () => {
    const sites = discoverSendTextSites(aiOrchestratorSrcPath).map((site) => ({
      file: site.filePath.replace(/\\/g, "/").split("/ai-orchestrator/src/")[1],
      line: site.line,
      category: site.category,
      origin: site.origin,
    }));
    expect(sites).toEqual(
      expect.arrayContaining([
        {
          file: "modules/channel/ports/WhatsAppProvider.ts",
          line: 38,
          category: "port_declaration",
          origin: undefined,
        },
        {
          file: "modules/channel/adapters/evolution/EvolutionProvider.ts",
          line: 36,
          category: "adapter_implementation",
          origin: undefined,
        },
        {
          file: "modules/graph/message-graph.ts",
          line: 1207,
          category: "assistant_decision_text",
          origin: undefined,
        },
        {
          file: "modules/reminders/NotificationDeliveryService.ts",
          line: 318,
          category: "composed_by_composeNotificationText",
          origin: undefined,
        },
        {
          file: "modules/activation-test/ActivationTestReplySender.ts",
          line: 120,
          category: "text_in_transit_named_origin",
          origin: "input",
        },
        {
          file: "modules/channel/platform/PlatformWhatsAppSender.ts",
          line: 98,
          category: "text_in_transit_named_origin",
          origin: "message",
        },
        {
          file: "modules/internal/routes.ts",
          line: 705,
          category: "person_typed_text",
          origin: undefined,
        },
      ]),
    );
  });

  it("não enxerga comentário, anotação de tipo (`ReturnType<...[\"sendText\"]>`) nem chamada com outro nome como sítio", () => {
    const fixtureSemSitioReal = `
      // provider.sendText({ to: "1", text: "isto é só um comentário" });
      /* outro comentário mencionando sendText(x) */
      let sent: Awaited<ReturnType<WhatsAppProvider["sendText"]>>;
      function trySendTextSomethingElse() {}
      provider.sendTextMessage({ to: "1", text: "não é sendText" });
    `;
    expect(classifySendTextSites(fixtureSemSitioReal, "<fixture>")).toEqual([]);
  });

  it("uma chamada sendText(...) com forma de text: não reconhecida vira resíduo e derruba a descoberta, nomeando arquivo e linha", () => {
    const fixtureComResiduo = [
      "class NovoEmissor {",
      "  async enviar(provider: WhatsAppProvider) {",
      '    return provider.sendText({ to: "1", text: "literal inline nunca visto antes" });',
      "  }",
      "}",
    ].join("\n");
    expect(() =>
      classifySendTextSites(fixtureComResiduo, "<fixture-residuo>"),
    ).toThrowError(
      /<fixture-residuo>:3: chamada sendText\(\.\.\.\) com forma de "text:" não reconhecida/,
    );
  });

  it("classifica texto em trânsito com origem nomeada a partir de qualquer parâmetro `<origem>.text`, exceto `body`", () => {
    const fixture =
      'provider.sendText({ to: "1", text: outroParametro.text, correlationId: "c" });';
    const sites = classifySendTextSites(fixture, "<fixture>");
    expect(sites).toEqual([
      {
        filePath: "<fixture>",
        line: 1,
        category: "text_in_transit_named_origin",
        origin: "outroParametro",
      },
    ]);
  });

  it("classifica texto digitado por pessoa (`body.text`) e texto próprio do produto (`state.response.text` e variável local de composeNotificationText)", () => {
    expect(
      classifySendTextSites(
        'provider.sendText({ to: "1", text: body.text });',
        "<fixture>",
      ),
    ).toEqual([
      {
        filePath: "<fixture>",
        line: 1,
        category: "person_typed_text",
      },
    ]);
    expect(
      classifySendTextSites(
        'provider.sendText({ to: "1", text: state.response.text });',
        "<fixture>",
      ),
    ).toEqual([
      {
        filePath: "<fixture>",
        line: 1,
        category: "assistant_decision_text",
      },
    ]);
    const fixtureComposta = [
      "const text = composeNotificationText({ style, facts });",
      'const sent = provider.sendText({ to: externalContactId, text, correlationId: intent.correlationId });',
    ].join("\n");
    expect(classifySendTextSites(fixtureComposta, "<fixture>")).toEqual([
      {
        filePath: "<fixture>",
        line: 2,
        category: "composed_by_composeNotificationText",
      },
    ]);
  });

  it("uma variável local atribuída num bloco de função diferente do sítio não herda a categoria de compositor e vira resíduo, nomeando arquivo e linha", () => {
    const fixtureComResiduo = [
      "function outraFuncao() {",
      "  const text = origemDiferente();",
      "}",
      "",
      "function enviaTexto(provider: WhatsAppProvider) {",
      '  const sent = provider.sendText({ to: "1", text });',
      "}",
    ].join("\n");
    expect(() =>
      classifySendTextSites(fixtureComResiduo, "<fixture-residuo>"),
    ).toThrowError(
      /<fixture-residuo>:6: chamada sendText\(\.\.\.\) com forma de "text:" não reconhecida/,
    );
  });

  it("a categoria que nomeia o compositor liga a sítio real a texto verificado: `NotificationDeliveryService.ts` compõe com composeNotificationText, e o conjunto que ele produz está em VERIFIED_CLIENT_TEXTS", () => {
    const sites = discoverSendTextSites(aiOrchestratorSrcPath);
    const composedSites = sites.filter((site) =>
      site.category.startsWith("composed_by_"),
    );
    expect(composedSites).toHaveLength(1);
    expect(composedSites[0].category).toBe(
      "composed_by_composeNotificationText",
    );
    expect(NOTIFICATION_MESSAGE_TEXTS.size).toBeGreaterThan(0);
    for (const text of NOTIFICATION_MESSAGE_TEXTS) {
      expect(VERIFIED_CLIENT_TEXTS).toContain(text);
    }
  });

  it("controle negativo: chamada de identificador solto (`sendText({...})` sem receptor) é sítio classificado, não declaração de porta", () => {
    const fixture = [
      "export class SenderSemReceptor {",
      "  async entregar(reply: { text: string }) {",
      '    sendText({ to: "1", text: reply.text });',
      "  }",
      "}",
    ].join("\n");
    // Enquanto o reconhecimento exigia `.` antes do nome, esta chamada caía no
    // ramo de declaração e saía como `port_declaration`: um emissor real
    // registrado como assinatura inofensiva, sem resíduo e sem alarme.
    expect(classifySendTextSites(fixture, "<fixture-solto>")).toEqual([
      {
        filePath: "<fixture-solto>",
        line: 3,
        category: "text_in_transit_named_origin",
        origin: "reply",
      },
    ]);
  });

  it("controle negativo: chamada de identificador solto com forma de `text:` não reconhecida vira resíduo, nomeando arquivo e linha", () => {
    const fixture = [
      "export class SenderSemReceptor {",
      "  async entregar() {",
      '    sendText({ to: "1", text: compoeTextoNovo() });',
      "  }",
      "}",
    ].join("\n");
    expect(() => classifySendTextSites(fixture, "<fixture-solto>")).toThrowError(
      /<fixture-solto>:3: chamada sendText\(\.\.\.\) com forma de "text:" não reconhecida/,
    );
  });

  it("controle negativo: a declaração da porta e a implementação do adapter continuam fora da categoria de chamada", () => {
    const fixture = [
      "export interface WhatsAppProvider {",
      "  sendText(input: SendTextInput): Promise<SendTextResult>;",
      "}",
      "export class EvolutionAdapter implements WhatsAppProvider {",
      "  async sendText(input: SendTextInput): Promise<SendTextResult> {",
      "    return this.client.post(input);",
      "  }",
      "}",
    ].join("\n");
    expect(classifySendTextSites(fixture, "<fixture-declaracao>")).toEqual([
      {
        filePath: "<fixture-declaracao>",
        line: 2,
        category: "port_declaration",
      },
      {
        filePath: "<fixture-declaracao>",
        line: 5,
        category: "adapter_implementation",
      },
    ]);
  });

  it("a mensagem de resíduo nomeia o portador descoberto, não um nome fixo — com porta sintética que declara um portador de outro nome", () => {
    const fixtureComResiduo = [
      "class NovoEmissor {",
      "  entregar() {",
      '    return provider.enviarMensagem({ to: "1", text: "literal inline nunca visto antes" });',
      "  }",
      "}",
    ].join("\n");
    expect(() =>
      classifySendTextSites(fixtureComResiduo, "<fixture-residuo>", [
        "enviarMensagem",
      ]),
    ).toThrowError(
      /<fixture-residuo>:3: chamada enviarMensagem\(\.\.\.\) com forma de "text:" não reconhecida/,
    );
  });
});

describe("métodos da porta WhatsAppProvider são enumerados com categoria e motivo, computados da declaração (Goal040 / WU-01)", () => {
  it("classifica sendText como portador de texto e downloadMedia como não portador, cada um com motivo escrito", () => {
    const source = readFileSync(whatsAppProviderPortSourcePath, "utf8");
    const methods = parseWhatsAppProviderMethods(
      source,
      whatsAppProviderPortSourcePath,
    );
    expect(methods).toHaveLength(2);
    const byName = Object.fromEntries(methods.map((m) => [m.name, m]));
    expect(byName.sendText.isCarrier).toBe(true);
    expect(byName.sendText.reason).toBe(
      'parâmetro "SendTextInput" declara text: string — carrega texto ao destinatário do canal',
    );
    expect(byName.downloadMedia.isCarrier).toBe(false);
    expect(byName.downloadMedia.reason).toBe(
      'parâmetro "DownloadMediaInput" não declara text: string — não carrega texto ao destinatário do canal',
    );
    expect(resolveSendTextCarrierMethodNames()).toEqual(["sendText"]);
  });

  it("forma propriedade-arrow de membro de porta (`sendText: (input: SendTextInput) => Promise<SendTextResult>`) é classificada igual à forma método", () => {
    const fixturePropriedadeArrow = [
      "export interface WhatsAppProvider {",
      "  sendText: (input: SendTextInput) => Promise<SendTextResult>;",
      "  downloadMedia: (input: DownloadMediaInput) => Promise<void>;",
      "}",
      "export interface SendTextInput {",
      "  text: string;",
      "}",
      "export interface DownloadMediaInput {",
      "  mediaId: string;",
      "}",
    ].join("\n");
    const methods = parseWhatsAppProviderMethods(
      fixturePropriedadeArrow,
      "<fixture-propriedade-arrow>",
    );
    expect(methods.map((method) => [method.name, method.isCarrier])).toEqual([
      ["sendText", true],
      ["downloadMedia", false],
    ]);
  });

  it("método cujo parâmetro resolve a um tipo não declarado como interface no arquivo vira resíduo, nomeando arquivo e linha", () => {
    const fixtureSemInterface = [
      "export interface WhatsAppProvider {",
      "  sendText(input: SendTextInput): Promise<void>;",
      "}",
    ].join("\n");
    expect(() =>
      parseWhatsAppProviderMethods(fixtureSemInterface, "<fixture-residuo>"),
    ).toThrowError(
      /<fixture-residuo>:2: método "sendText" tem parâmetro de tipo "SendTextInput", não declarado como interface neste arquivo/,
    );
  });

  it("método cujo parâmetro não tem forma de tipo nomeado reconhecível vira resíduo, nomeando arquivo e linha", () => {
    const fixtureSemForma = [
      "export interface WhatsAppProvider {",
      "  sendText(input: { text: string }): Promise<void>;",
      "}",
    ].join("\n");
    expect(() =>
      parseWhatsAppProviderMethods(fixtureSemForma, "<fixture-residuo>"),
    ).toThrowError(
      /<fixture-residuo>:2: método "sendText" declarado com forma de parâmetro não reconhecida na porta WhatsAppProvider/,
    );
  });

  it("controle negativo: método de porta em forma genérica (`sendTemplate<T>(input: SendTemplateInput<T>)`) vira resíduo, nomeando arquivo e linha — não sai da vigilância em silêncio", () => {
    const fixtureGenerico = [
      "export interface WhatsAppProvider {",
      "  sendText(input: SendTextInput): Promise<void>;",
      "  sendTemplate<T>(input: SendTemplateInput<T>): Promise<void>;",
      "}",
      "export interface SendTextInput {",
      "  text: string;",
      "}",
      "export interface SendTemplateInput<T> {",
      "  text: string;",
      "  variables: T;",
      "}",
    ].join("\n");
    // O método genérico carrega `text: string` e emitiria texto pelo canal. A
    // leitura não reconhece a forma `nome<T>(` e, por isso, derruba a suíte
    // nomeando arquivo e linha — nunca devolve o método como não-portador.
    expect(() =>
      parseWhatsAppProviderMethods(fixtureGenerico, "<fixture-generico>"),
    ).toThrowError(
      /<fixture-generico>:3: membro "sendTemplate<T>[\s\S]*" declarado com forma não reconhecida na porta WhatsAppProvider/,
    );
    // O mesmo método sem parâmetros de tipo é classificado normalmente: o que
    // derruba é a forma genérica, não a existência de um terceiro método.
    const fixtureSimples = fixtureGenerico
      .replace(
        "sendTemplate<T>(input: SendTemplateInput<T>)",
        "sendTemplate(input: SendTemplateInput)",
      )
      .replace("interface SendTemplateInput<T>", "interface SendTemplateInput");
    const methods = parseWhatsAppProviderMethods(
      fixtureSimples,
      "<fixture-simples>",
    );
    expect(methods.map((method) => [method.name, method.isCarrier])).toEqual([
      ["sendText", true],
      ["sendTemplate", true],
    ]);
  });
});

describe("a cadeia de trânsito é seguida até o chamador, elo a elo (Goal040 / WU-03)", () => {
  /** Caminho do sítio relativo a `apps/ai-orchestrator/src`, no formato `arquivo:linha`. */
  const at = (filePath: string, line: number): string =>
    `${filePath.replace(/\\/g, "/").split("/ai-orchestrator/src/")[1]}:${line}`;

  it("segue as duas cadeias sobre apps/ai-orchestrator/src e computa exatamente um chamador em cada, com resíduo zero", () => {
    const chains = discoverSendTextTransitChains(
      aiOrchestratorSrcPath,
      resolveVerifiedComposers(),
    );
    const followed = chains
      .map((chain) => ({
        site: at(chain.site.filePath, chain.site.line),
        siteOrigin: chain.site.origin,
        transitFunction: chain.transitFunction,
        callers: chain.callers.map((caller) => ({
          at: at(caller.filePath, caller.line),
          callerFunction: caller.callerFunction,
          category: caller.category,
          origin: caller.origin,
        })),
      }))
      .sort((a, b) => a.site.localeCompare(b.site));
    expect(followed).toEqual([
      {
        site: "modules/activation-test/ActivationTestReplySender.ts:120",
        siteOrigin: "input",
        transitFunction: "sendAiReply",
        callers: [
          {
            at: "modules/activation-test/ActivationTestAiDriver.ts:228",
            callerFunction: "deliverReply",
            category: "text_in_transit_named_origin",
            origin: "reply",
          },
        ],
      },
      {
        site: "modules/channel/platform/PlatformWhatsAppSender.ts:98",
        siteOrigin: "message",
        transitFunction: "sendToTenantUnderTest",
        callers: [
          {
            at: "modules/activation-test/ActivationTestService.ts:852",
            callerFunction: "sendAsClient",
            category: "text_in_transit_named_origin",
            origin: "text",
          },
        ],
      },
    ]);
  });

  it("nomeia cada ocorrência excluída — assinatura da porta, implementação que contém o sítio e anotação de tipo `Pick<..., \"sendToTenantUnderTest\">` — e nenhuma delas virou resíduo", () => {
    const chains = discoverSendTextTransitChains(
      aiOrchestratorSrcPath,
      resolveVerifiedComposers(),
    );
    const excluded = Object.fromEntries(
      chains.map((chain) => [
        chain.transitFunction,
        chain.excludedOccurrences
          .map((occurrence) => ({
            at: at(occurrence.filePath, occurrence.line),
            reason: occurrence.reason,
          }))
          .sort((a, b) => a.at.localeCompare(b.at)),
      ]),
    );
    expect(excluded).toEqual({
      sendAiReply: [
        {
          at: "modules/activation-test/ActivationTestReplySender.ts:104",
          reason: "port_declaration_or_implementation",
        },
        {
          at: "modules/activation-test/ActivationTestReplySender.ts:60",
          reason: "port_declaration_or_implementation",
        },
      ],
      sendToTenantUnderTest: [
        {
          at: "modules/activation-test/ActivationTestService.ts:90",
          reason: "type_or_string_reference",
        },
        {
          at: "modules/channel/platform/PlatformWhatsAppSender.ts:79",
          reason: "port_declaration_or_implementation",
        },
      ],
    });
  });

  it("helper com parâmetro `text`, log de texto, comentário e anotação de tipo não viram chamador nem resíduo — o reconhecimento é ancorado no nome da função de trânsito", () => {
    const fixture = [
      '// this.replySender.sendAiReply({ to: "1", text: "isto é comentário" });',
      "/* menção a sendAiReply(algo) dentro de bloco de comentário */",
      "type Port = { sendAiReply(input: { text: string }): Promise<void> };",
      'let visto: Awaited<ReturnType<Port["sendAiReply"]>>;',
      "function formatarTexto(text: string) {",
      "  return text.trim();",
      "}",
      "function registrarTexto(logger: DiagnosticLogger, message: { text: string }) {",
      '  logger.info({ text: message.text }, "nada sai do canal daqui");',
      "}",
    ].join("\n");
    const scanned = classifyTransitCallersInSource(
      fixture,
      "<fixture>",
      "sendAiReply",
      resolveVerifiedComposers(),
    );
    expect(scanned.callers).toEqual([]);
    expect(scanned.excluded).toEqual([
      {
        filePath: "<fixture>",
        line: 3,
        transitFunction: "sendAiReply",
        reason: "port_declaration_or_implementation",
      },
      {
        filePath: "<fixture>",
        line: 4,
        transitFunction: "sendAiReply",
        reason: "type_or_string_reference",
      },
    ]);
  });

  it("chamada de teste não vira chamador nem resíduo: o critério que a exclui é a raiz de leitura, e a suíte de isolamento de credencial chama `sendAiReply` de verdade", () => {
    const chains = discoverSendTextTransitChains(
      aiOrchestratorSrcPath,
      resolveVerifiedComposers(),
    );
    for (const chain of chains) {
      for (const caller of chain.callers) {
        expect(caller.filePath.startsWith(aiOrchestratorSrcPath)).toBe(true);
      }
    }
    // A suíte chama `sendAiReply` com texto literal. Se a leitura incluísse
    // `tests/`, essa chamada viraria resíduo — ela fica fora porque a raiz
    // lida é `apps/ai-orchestrator/src`, onde nenhuma suíte mora.
    const suiteSource = readFileSync(
      platformCredentialIsolationTestPath,
      "utf8",
    );
    expect(() =>
      classifyTransitCallersInSource(
        suiteSource,
        "<suíte>",
        "sendAiReply",
        resolveVerifiedComposers(),
      ),
    ).toThrowError(/<suíte>:\d+: chamador de sendAiReply\(\.\.\.\) sem categoria/);
  });

  it("chamador que compõe o texto na hora com compositor ausente de VERIFIED_CLIENT_TEXTS é resíduo, com arquivo e linha; com compositor verificado, a categoria nomeia o compositor", () => {
    const fixture = [
      "class NovoDriver {",
      "  async entregar(reply: { conversationId: string }) {",
      "    const text = compoeTextoNovo(reply);",
      '    return this.replySender.sendAiReply({ to: "1", text });',
      "  }",
      "}",
    ].join("\n");
    expect(() =>
      classifyTransitCallersInSource(
        fixture,
        "<fixture-residuo>",
        "sendAiReply",
        resolveVerifiedComposers(),
      ),
    ).toThrowError(
      /<fixture-residuo>:4: chamador de sendAiReply\(\.\.\.\) sem categoria — compõe o texto na hora com "compoeTextoNovo"/,
    );
    const comCompositorVerificado = fixture.replace(
      "compoeTextoNovo",
      "composeNotificationText",
    );
    expect(
      classifyTransitCallersInSource(
        comCompositorVerificado,
        "<fixture>",
        "sendAiReply",
        resolveVerifiedComposers(),
      ).callers,
    ).toEqual([
      {
        filePath: "<fixture>",
        line: 4,
        callerFunction: "entregar",
        category: "composed_by_composeNotificationText",
        composer: "composeNotificationText",
      },
    ]);
  });

  it("chamador que entrega texto de categoria já declarada continua reconhecido pelo mesmo vocabulário dos sítios", () => {
    const fixture = [
      "class NovoDriver {",
      "  async daDecisao(state: { response: { text: string } }) {",
      '    return this.replySender.sendAiReply({ to: "1", text: state.response.text });',
      "  }",
      "  async daPessoa(body: { text: string }) {",
      '    return this.replySender.sendAiReply({ to: "1", text: body.text });',
      "  }",
      "}",
    ].join("\n");
    const scanned = classifyTransitCallersInSource(
      fixture,
      "<fixture>",
      "sendAiReply",
      resolveVerifiedComposers(),
    );
    expect(scanned.callers).toEqual([
      {
        filePath: "<fixture>",
        line: 3,
        callerFunction: "daDecisao",
        category: "assistant_decision_text",
      },
      {
        filePath: "<fixture>",
        line: 6,
        callerFunction: "daPessoa",
        category: "person_typed_text",
      },
    ]);
  });

  it("chamador sem categoria é resíduo, com arquivo e linha", () => {
    const fixture = [
      "class NovoDriver {",
      "  async entregar() {",
      '    return this.replySender.sendAiReply({ to: "1", text: "literal nunca visto antes" });',
      "  }",
      "}",
    ].join("\n");
    expect(() =>
      classifyTransitCallersInSource(
        fixture,
        "<fixture-residuo>",
        "sendAiReply",
        resolveVerifiedComposers(),
      ),
    ).toThrowError(
      /<fixture-residuo>:3: chamador de sendAiReply\(\.\.\.\) sem categoria/,
    );
  });

  it("controle negativo: chamada de identificador solto da função de trânsito é chamador classificado, e a assinatura acima dela continua excluída", () => {
    const fixture = [
      "export interface ActivationTestReplyPort {",
      "  sendAiReply(",
      "    input: ActivationTestReplyInput,",
      "  ): Promise<ActivationTestReplyDelivery>;",
      "}",
      "",
      "export async function entregarSemReceptor(reply: { text: string }) {",
      '  sendAiReply({ to: "1", text: reply.text });',
      "}",
    ].join("\n");
    // Com o reconhecimento anterior, a chamada da linha 8 era excluída como
    // `port_declaration_or_implementation` — um elo da cadeia desaparecia sem
    // virar resíduo. O que separa as duas ocorrências é o que vem depois do
    // `)`: `:` na assinatura, `;` na chamada.
    const scanned = classifyTransitCallersInSource(
      fixture,
      "<fixture-solto>",
      "sendAiReply",
      resolveVerifiedComposers(),
    );
    expect(scanned.callers).toEqual([
      {
        filePath: "<fixture-solto>",
        line: 8,
        callerFunction: "entregarSemReceptor",
        category: "text_in_transit_named_origin",
        origin: "reply",
      },
    ]);
    expect(scanned.excluded).toEqual([
      {
        filePath: "<fixture-solto>",
        line: 2,
        transitFunction: "sendAiReply",
        reason: "port_declaration_or_implementation",
      },
    ]);
  });

  it("controle negativo: chamada de identificador solto que compõe o texto na hora com compositor não verificado vira resíduo, com arquivo e linha", () => {
    const fixture = [
      "export async function entregarComposto(reply: { conversationId: string }) {",
      "  const text = compoeTextoNovo(reply);",
      '  sendAiReply({ to: "1", text });',
      "}",
    ].join("\n");
    expect(() =>
      classifyTransitCallersInSource(
        fixture,
        "<fixture-solto>",
        "sendAiReply",
        resolveVerifiedComposers(),
      ),
    ).toThrowError(
      /<fixture-solto>:3: chamador de sendAiReply\(\.\.\.\) sem categoria — compõe o texto na hora com "compoeTextoNovo"/,
    );
  });
});

/** Fatos mínimos de notificação, como em `tests/reminders/notification-message.test.ts`. */
function notificationFacts(
  overrides: Partial<NotificationFacts> = {},
): NotificationFacts {
  return {
    kind: "REMINDER",
    appointmentStatus: "CONFIRMED",
    customerId: "customer-a",
    customerName: "Ana",
    customerPhone: "5511999999999",
    services: ["Corte"],
    title: null,
    timezone: "America/Sao_Paulo",
    date: "2026-09-16",
    time: "14:30",
    startAt: "2026-09-16T17:30:00.000Z",
    price: null,
    confirmationRequested: false,
    ...overrides,
  };
}

/** `composeNotificationText` monta blocos separados por linha em branco: saudação, frase(s) factual(is), confirmação ou fechamento. */
function splitComposedBlocks(text: string): string[] {
  return text.split("\n\n");
}

/** As seis formas factuais que o Goal exige: lembrete, cancelamento e alteração, cada uma com e sem linha de valor. */
const FACTUAL_LINE_SCENARIOS: Array<Partial<NotificationFacts>> = [
  { kind: "REMINDER", price: null },
  { kind: "REMINDER", price: 120 },
  { kind: "CHANGE_NOTICE", appointmentStatus: "CANCELLED", price: null },
  { kind: "CHANGE_NOTICE", appointmentStatus: "CANCELLED", price: 120 },
  { kind: "CHANGE_NOTICE", appointmentStatus: "CONFIRMED", price: null },
  { kind: "CHANGE_NOTICE", appointmentStatus: "CONFIRMED", price: 120 },
];

/**
 * Os textos que `notification-message.ts` produz, obtidos executando
 * `composeNotificationText`/`notificationFactualLines` sobre fatos declarados
 * aqui — não escritos à mão. Cobre saudação com e sem nome, pedido de
 * confirmação e fechamento nos três estilos de `AI_CONVERSATION_STYLES`, e as
 * frases factuais das seis formas de {@link FACTUAL_LINE_SCENARIOS}.
 */
const NOTIFICATION_MESSAGE_TEXTS = new Set<string>();
for (const style of AI_CONVERSATION_STYLES) {
  for (const customerName of ["Ana", null] as const) {
    const facts = notificationFacts({
      customerName,
      confirmationRequested: false,
    });
    const text = composeNotificationText({ style, facts });
    const blocks = splitComposedBlocks(text);
    NOTIFICATION_MESSAGE_TEXTS.add(blocks[0]); // saudação
    NOTIFICATION_MESSAGE_TEXTS.add(blocks[blocks.length - 1]); // fechamento
    for (const line of notificationFactualLines(facts)) {
      NOTIFICATION_MESSAGE_TEXTS.add(line);
    }
  }
  const confirmationText = composeNotificationText({
    style,
    facts: notificationFacts({ confirmationRequested: true }),
  });
  const confirmationBlocks = splitComposedBlocks(confirmationText);
  NOTIFICATION_MESSAGE_TEXTS.add(
    confirmationBlocks[confirmationBlocks.length - 1],
  ); // pedido de confirmação
}
for (const overrides of FACTUAL_LINE_SCENARIOS) {
  for (const line of notificationFactualLines(notificationFacts(overrides))) {
    NOTIFICATION_MESSAGE_TEXTS.add(line);
  }
}

/** PRODUCT_OWN_TEXTS mais os textos de notification-message.ts (Goal039 / WU-02). */
const VERIFIED_CLIENT_TEXTS = [
  ...PRODUCT_OWN_TEXTS,
  ...NOTIFICATION_MESSAGE_TEXTS,
];

/**
 * Compositores cujo texto produzido está inteiro em VERIFIED_CLIENT_TEXTS.
 *
 * O nome de cada compositor vem dos sítios `composed_by_*` descobertos na
 * árvore, não de uma lista; o conjunto de textos que ele produz vem de
 * executá-lo. Compositor que aparecer em um sítio novo sem texto conhecido
 * aqui fica de fora — e um chamador que compuser com ele vira resíduo
 * (Goal040 / WU-03).
 */
function resolveVerifiedComposers(): Set<string> {
  const producedByComposer = new Map<string, ReadonlySet<string>>([
    ["composeNotificationText", NOTIFICATION_MESSAGE_TEXTS],
  ]);
  const verified = new Set<string>();
  for (const site of discoverSendTextSites(aiOrchestratorSrcPath)) {
    if (!site.category.startsWith("composed_by_")) continue;
    const composer = site.category.slice("composed_by_".length);
    const produced = producedByComposer.get(composer);
    if (!produced || produced.size === 0) continue;
    if ([...produced].every((text) => VERIFIED_CLIENT_TEXTS.includes(text))) {
      verified.add(composer);
    }
  }
  return verified;
}

/** Argumento (4º) de `this.sendAsClient(run, step, attempt, <texto>, ...)` no passo `stepName` de ActivationTestService.ts. */
function extractSendAsClientText(source: string, stepName: string): string {
  const caseIndex = source.indexOf(`case "${stepName}":`);
  if (caseIndex === -1) {
    throw new Error(`passo "${stepName}" não encontrado em ActivationTestService.ts`);
  }
  const callIndex = source.indexOf("this.sendAsClient(", caseIndex);
  const openParenIndex = callIndex + "this.sendAsClient".length;
  let depth = 0;
  let quote: string | undefined;
  let closeParenIndex = openParenIndex;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        closeParenIndex = i;
        break;
      }
    }
  }
  const args = splitTopLevelExpressions(
    source.slice(openParenIndex + 1, closeParenIndex),
  );
  const textArgument = args[3]?.text;
  const literalMatch =
    textArgument?.match(/^`((?:[^`\\]|\\.)*)`$/) ??
    textArgument?.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (!literalMatch) {
    throw new Error(
      `${activationTestServiceSourcePath}:${lineAt(source, callIndex)}: 4º argumento de sendAsClient(...) ` +
        `no passo "${stepName}" não é literal reconhecível ("${textArgument}")`,
    );
  }
  return literalMatch[1];
}

/**
 * Os quatro textos do canal de teste de ativação (Goal039 / WU-02): o aviso
 * ao observador humano e as três falas do cliente simulado. Nenhum é texto
 * que o produto emite para uma pessoa cliente real — o aviso é dirigido a
 * quem observa o teste, e as falas são o script que o teste envia *como se
 * fosse* o cliente, para a IA responder, não respostas do produto. Por isso
 * ficam fora do guardrail de espera (nunca conferidas contra
 * VOCABULARIO_DE_ESPERA nem incluídas em VERIFIED_CLIENT_TEXTS), mas
 * continuam enumeradas aqui, com a categoria e o motivo junto — nada some em
 * silêncio.
 */
const activationTestServiceSource = readFileSync(
  activationTestServiceSourcePath,
  "utf8",
);
const ACTIVATION_TEST_CHANNEL_TEXTS = [
  {
    category: "activation_test_channel" as const,
    reason: "aviso ao observador humano, não texto do produto para cliente",
    text: ACTIVATION_TEST_NOTICE,
  },
  {
    category: "activation_test_channel" as const,
    reason: "fala do cliente simulado (pergunta de preço), não resposta do produto",
    text: extractSendAsClientText(
      activationTestServiceSource,
      "CLIENT_ASKS_PRICE",
    ),
  },
  {
    category: "activation_test_channel" as const,
    reason: "fala do cliente simulado (pergunta de horário), não resposta do produto",
    text: extractSendAsClientText(
      activationTestServiceSource,
      "CLIENT_ASKS_SLOT",
    ),
  },
  {
    category: "activation_test_channel" as const,
    reason: "fala do cliente simulado (aceite de horário), não resposta do produto",
    text: extractSendAsClientText(
      activationTestServiceSource,
      "CLIENT_ACCEPTS_SLOT",
    ),
  },
];

describe("conjunto verificado de texto de cliente inclui notification-message.ts (Goal039 / WU-02)", () => {
  it("o conjunto inclui saudação com e sem nome, pedido de confirmação e fechamento, nos três estilos", () => {
    for (const style of AI_CONVERSATION_STYLES) {
      for (const customerName of ["Ana", null] as const) {
        const text = composeNotificationText({
          style,
          facts: notificationFacts({
            customerName,
            confirmationRequested: false,
          }),
        });
        const blocks = splitComposedBlocks(text);
        expect(NOTIFICATION_MESSAGE_TEXTS.has(blocks[0])).toBe(true);
        expect(NOTIFICATION_MESSAGE_TEXTS.has(blocks[blocks.length - 1])).toBe(
          true,
        );
      }
      const confirmationText = composeNotificationText({
        style,
        facts: notificationFacts({ confirmationRequested: true }),
      });
      const confirmationBlocks = splitComposedBlocks(confirmationText);
      expect(
        NOTIFICATION_MESSAGE_TEXTS.has(
          confirmationBlocks[confirmationBlocks.length - 1],
        ),
      ).toBe(true);
    }
  });

  it("o conjunto inclui as frases factuais de lembrete, cancelamento e alteração, com e sem linha de valor", () => {
    for (const overrides of FACTUAL_LINE_SCENARIOS) {
      const lines = notificationFactualLines(notificationFacts(overrides));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(NOTIFICATION_MESSAGE_TEXTS.has(line)).toBe(true);
      }
    }
  });

  it("todo texto do conjunto verificado é conferido contra VOCABULARIO_DE_ESPERA, definição única de tests/support/", () => {
    expect(NOTIFICATION_MESSAGE_TEXTS.size).toBeGreaterThan(0);
    for (const text of VERIFIED_CLIENT_TEXTS) {
      expect(text).not.toMatch(VOCABULARIO_DE_ESPERA);
    }
  });

  it("fecha o conjunto: os sítios que produzem texto em notification-message.ts têm forma reconhecida, com resíduo zero", () => {
    const source = readFileSync(notificationMessageSourcePath, "utf8");
    const sites = classifyNotificationTextSites(
      source,
      notificationMessageSourcePath,
    );
    const counts = {
      style_voice_greeting_ternary: sites.filter(
        (s) => s.category === "style_voice_greeting_ternary",
      ).length,
      style_voice_static_literal: sites.filter(
        (s) => s.category === "style_voice_static_literal",
      ).length,
      factual_change_notice_ternary: sites.filter(
        (s) => s.category === "factual_change_notice_ternary",
      ).length,
      factual_single_template: sites.filter(
        (s) => s.category === "factual_single_template",
      ).length,
    };
    expect(counts).toEqual({
      style_voice_greeting_ternary: 3,
      style_voice_static_literal: 6,
      factual_change_notice_ternary: 1,
      factual_single_template: 2,
    });
  });

  it("um sítio de STYLE_VOICES fora das formas reconhecidas derruba o fechamento nomeando arquivo e linha", () => {
    const fixtureComResiduo = [
      "const STYLE_VOICES: Record<AiConversationStyle, StyleVoice> = {",
      "  PROFESSIONAL: {",
      "    greeting: buildGreetingSomehow(),",
      '    confirmation: "Pode confirmar sua presença respondendo sim ou não?",',
      '    closing: "Fico à disposição.",',
      "  },",
      "};",
    ].join("\n");
    expect(() =>
      classifyNotificationTextSites(fixtureComResiduo, "<fixture-residuo>"),
    ).toThrowError(
      /<fixture-residuo>:3: greeting de STYLE_VOICES com forma não reconhecida/,
    );
  });

  it("um sítio de notificationFactualLines fora das formas reconhecidas derruba o fechamento nomeando arquivo e linha", () => {
    const fixtureComResiduo = [
      "const STYLE_VOICES: Record<AiConversationStyle, StyleVoice> = {",
      "  PROFESSIONAL: {",
      '    greeting: (name) => (name ? `Olá, ${name}.` : "Olá."),',
      '    confirmation: "Pode confirmar sua presença respondendo sim ou não?",',
      '    closing: "Fico à disposição.",',
      "  },",
      "};",
      "",
      "export function notificationFactualLines(facts: NotificationFacts): string[] {",
      "  const lines: string[] = [];",
      "  lines.push(algumaFuncaoDesconhecida());",
      "  return lines;",
      "}",
    ].join("\n");
    expect(() =>
      classifyNotificationTextSites(fixtureComResiduo, "<fixture-residuo>"),
    ).toThrowError(
      /<fixture-residuo>:11: lines\.push\(\.\.\.\) de notificationFactualLines com forma não reconhecida/,
    );
  });

  it("ACTIVATION_TEST_NOTICE e as três falas do cliente simulado ficam em categoria declarada, fora do guardrail de espera", () => {
    expect(ACTIVATION_TEST_CHANNEL_TEXTS).toHaveLength(4);
    for (const entry of ACTIVATION_TEST_CHANNEL_TEXTS) {
      expect(entry.category).toBe("activation_test_channel");
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.text.length).toBeGreaterThan(0);
      expect(VERIFIED_CLIENT_TEXTS).not.toContain(entry.text);
    }
  });

  it("PRODUCT_OWN_TEXTS não muda: continua idêntico ao conjunto que a suíte já prova na baseline", () => {
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
    const baselineMessageGraphTexts = [
      "Recebi sua mensagem, mas por enquanto consigo responder melhor por texto. Me envie sua pergunta em texto que continuo por aqui.",
      "Tive um problema para consultar o sistema agora. Vou chamar a profissional para continuar seu atendimento.",
      "Recebi seu audio, mas nao consegui entender o conteudo dele agora. Pode me mandar em texto, por favor? Assim continuo seu atendimento por aqui.",
      "Recebi sua imagem e ja chamei a profissional para dar uma olhada com voce. Ela continua seu atendimento por aqui.",
      "Recebi seu documento e ele ja esta aqui na conversa. Por enquanto nao consigo abrir arquivos, entao me conta em texto o que voce precisa que eu ajudo.",
      "Recebi seu video e ele ja esta aqui na conversa. Por enquanto nao consigo assistir por aqui, entao me conta em texto o que voce precisa que eu ajudo.",
    ];
    expect(PRODUCT_OWN_TEXTS).toHaveLength(
      baselineFixedTexts.length +
        baselineGreetings.length +
        baselineMessageGraphTexts.length,
    );
    for (const text of [
      ...baselineFixedTexts,
      ...baselineGreetings,
      ...baselineMessageGraphTexts,
    ]) {
      expect(PRODUCT_OWN_TEXTS).toContain(text);
    }
  });
});

/** Caminho de um sítio de egresso HTTP relativo a `ai-orchestrator/src` ou `bff/src`, o que se aplicar. */
function httpEgressRelativePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const aiOrchestratorMarker = "/ai-orchestrator/src/";
  if (normalized.includes(aiOrchestratorMarker)) {
    return `ai-orchestrator/src/${normalized.split(aiOrchestratorMarker)[1]}`;
  }
  const bffMarker = "/bff/src/";
  return `bff/src/${normalized.split(bffMarker)[1]}`;
}

/** Cria uma árvore de fontes temporária em disco, para exercitar `discoverHttpEgressSites` sobre uma forma sintética sem tocar as árvores reais. */
function makeTempSourceTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "http-egress-wu04-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf8");
  }
  return root;
}

describe("todo egresso HTTP fora da porta do canal é enumerado com resíduo zero (Goal041 / WU-04)", () => {
  it("descobre os 9 sítios das duas árvores, com resíduo zero e exatamente 1 portador de prosa ao número da cliente", () => {
    const discovery = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    expect(discovery.excluded).toEqual([]);
    expect(discovery.sites).toHaveLength(9);
    const proseSites = discovery.sites.filter(
      (site) => site.category === "product_prose_to_client_number",
    );
    expect(proseSites).toHaveLength(1);
    expect(httpEgressRelativePath(proseSites[0].filePath)).toBe(
      "ai-orchestrator/src/modules/channel/adapters/evolution/EvolutionProvider.ts",
    );
    expect(proseSites[0].line).toBe(73);
  });

  it("classifica cada um dos 9 sítios na categoria que a resolução de destino computa, sem lista escrita à mão e sem pular arquivo nenhum", () => {
    const discovery = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const sites = discovery.sites
      .map((site) => ({
        file: httpEgressRelativePath(site.filePath),
        line: site.line,
        category: site.category,
      }))
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    expect(sites).toEqual([
      {
        file: "ai-orchestrator/src/lib/http.ts",
        line: 32,
        category: "generic_egress_destination_decided_by_caller_fetchJson",
      },
      {
        file: "ai-orchestrator/src/modules/channel/adapters/evolution/EvolutionProvider.ts",
        line: 73,
        category: "product_prose_to_client_number",
      },
      {
        file: "ai-orchestrator/src/modules/channel/adapters/evolution/EvolutionProvider.ts",
        line: 172,
        category: "env_vars_EVOLUTION_BASE_URL_and_EVOLUTION_DOWNLOAD_MEDIA_PATH",
      },
      {
        file: "ai-orchestrator/src/modules/media/openai-transcription-provider.ts",
        line: 58,
        category: "env_var_OPENAI_BASE_URL",
      },
      {
        file: "ai-orchestrator/src/modules/scheduling-service/client.ts",
        line: 793,
        category: "env_var_SCHEDULING_SERVICE_BASE_URL",
      },
      {
        file: "bff/src/clients/internal-http-client.ts",
        line: 83,
        category: "constructor_base_url_requestBinary",
      },
      {
        file: "bff/src/clients/internal-http-client.ts",
        line: 149,
        category: "constructor_base_url_perform",
      },
      {
        file: "bff/src/clients/password-reset-delivery.ts",
        line: 20,
        category: "env_var_PASSWORD_RESET_DELIVERY_URL",
      },
      {
        file: "bff/src/routes/health.ts",
        line: 46,
        category: "caller_resolved_base_url_via_checkHealth",
      },
    ]);
  });
});

describe("o egresso genérico é fail-closed, com o primitivo e a contagem de chamadores computados (Goal041 / WU-04)", () => {
  it("o fetch do primitivo genérico é classificado como qualquer outro sítio — o nome da função sai da declaração, não de uma lista de arquivos", () => {
    const discovery = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    expect(
      discovery.genericEgressPrimitives.map((primitive) => ({
        file: httpEgressRelativePath(primitive.filePath),
        line: primitive.line,
        functionName: primitive.functionName,
      })),
    ).toEqual([{ file: "ai-orchestrator/src/lib/http.ts", line: 32, functionName: "fetchJson" }]);
  });

  it("hoje nenhum código das duas árvores chama o primitivo genérico — a contagem sai de ler a árvore, não de suposição", () => {
    const discovery = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    expect(discovery.genericEgressCallers).toEqual([]);
  });

  it("primitivo genérico com outro nome, em outro arquivo, é descoberto igual — nenhuma allowlist por nome de arquivo ou de função", () => {
    const tree = makeTempSourceTree({
      "net/send.ts": [
        "export async function requestJson(destino: string, options: RequestInit) {",
        "  return fetch(destino, options);",
        "}",
      ].join("\n"),
      "caller.ts": [
        "export async function fetchThing() {",
        "  return requestJson(env.THING_URL, {});",
        "}",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const discovery = discoverHttpEgressSites(tree, emptyTree);
      expect(
        discovery.sites.map((site) => ({ line: site.line, category: site.category })),
      ).toEqual([
        { line: 2, category: "generic_egress_destination_decided_by_caller_requestJson" },
      ]);
      expect(discovery.genericEgressPrimitives).toEqual([
        { filePath: join(tree, "net", "send.ts"), line: 2, functionName: "requestJson" },
      ]);
      expect(
        discovery.genericEgressCallers.map((caller) => ({
          filePath: caller.filePath,
          line: caller.line,
          category: caller.category,
          reason: caller.reason,
        })),
      ).toEqual([
        {
          filePath: join(tree, "caller.ts"),
          line: 2,
          category: "env_var_THING_URL",
          reason: "destino resolvido de env.THING_URL",
        },
      ]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("chamador que repassa a URL recebida vira primitivo genérico ele próprio — a varredura segue até ponto fixo e o repasse em cadeia não escapa", () => {
    const tree = makeTempSourceTree({
      "net/send.ts": [
        "export async function requestJson(destino: string, options: RequestInit) {",
        "  return fetch(destino, options);",
        "}",
      ].join("\n"),
      "repasse.ts": [
        "export async function repassa(destino: string) {",
        "  return requestJson(destino, {});",
        "}",
      ].join("\n"),
      "caller.ts": [
        "export async function fetchThing() {",
        "  return repassa(destinoDecididoNaHora);",
        "}",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() => discoverHttpEgressSites(tree, emptyTree)).toThrowError(
        /caller\.ts:2: sítio de egresso HTTP sem categoria/,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("chamador do primitivo genérico cujo destino não resolve derruba a leitura inteira, nomeando arquivo e linha — a categoria genérica nunca aceita chamador silencioso", () => {
    const tree = makeTempSourceTree({
      "net/send.ts": [
        "export async function requestJson(destino: string, options: RequestInit) {",
        "  return fetch(destino, options);",
        "}",
      ].join("\n"),
      "caller.ts": [
        "export async function fetchThing() {",
        "  return requestJson(destinoNuncaResolvido, {});",
        "}",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() => discoverHttpEgressSites(tree, emptyTree)).toThrowError(
        /caller\.ts:2: sítio de egresso HTTP sem categoria/,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("a cadeia de trânsito é seguida transitivamente até a raiz de cada ramo, com os cinco chamadores de segundo elo nomeados (Goal041 / WU-04)", () => {
  /** Caminho do elo relativo a `apps/ai-orchestrator/src`, no formato `arquivo:linha`. */
  const at = (filePath: string, line: number): string =>
    `${filePath.replace(/\\/g, "/").split("/ai-orchestrator/src/")[1]}:${line}`;

  it("os dois ramos têm, juntos, exatamente cinco elos de segunda profundidade, cada um nomeado com chamador, categoria e raiz", () => {
    const chains = discoverSendTextTransitChains(
      aiOrchestratorSrcPath,
      resolveVerifiedComposers(),
    );
    const secondLinks = chains
      .flatMap((chain) => chain.links.filter((link) => link.depth === 2))
      .map((link) => ({
        at: at(link.filePath, link.line),
        callee: link.calleeFunction,
        caller: link.callerFunction,
        category: link.category,
        literalText: link.literalText,
        rootKind: link.root?.kind,
      }))
      .sort((a, b) => a.at.localeCompare(b.at));
    expect(secondLinks).toHaveLength(5);
    expect(secondLinks).toEqual([
      {
        at: "modules/activation-test/ActivationTestAiDriver.ts:203",
        callee: "deliverReply",
        caller: "deliver",
        category: "assistant_decision_text",
        literalText: undefined,
        rootKind: "assistant_decision_text",
      },
      {
        at: "modules/activation-test/ActivationTestService.ts:604",
        callee: "sendAsClient",
        caller: "performStep",
        category: "literal_text_at_link",
        literalText: ACTIVATION_TEST_NOTICE,
        rootKind: "literal_text_at_link",
      },
      {
        at: "modules/activation-test/ActivationTestService.ts:608",
        callee: "sendAsClient",
        caller: "performStep",
        category: "literal_text_at_link",
        literalText: extractSendAsClientText(
          activationTestServiceSource,
          "CLIENT_ASKS_PRICE",
        ),
        rootKind: "literal_text_at_link",
      },
      {
        at: "modules/activation-test/ActivationTestService.ts:653",
        callee: "sendAsClient",
        caller: "performStep",
        category: "literal_text_at_link",
        literalText: extractSendAsClientText(
          activationTestServiceSource,
          "CLIENT_ASKS_SLOT",
        ),
        rootKind: "literal_text_at_link",
      },
      {
        at: "modules/activation-test/ActivationTestService.ts:679",
        callee: "sendAsClient",
        caller: "performStep",
        category: "literal_text_at_link",
        literalText: extractSendAsClientText(
          activationTestServiceSource,
          "CLIENT_ACCEPTS_SLOT",
        ),
        rootKind: "literal_text_at_link",
      },
    ]);
  });

  it("cada ramo termina em raiz classificada — nenhum resíduo e nenhum ciclo nas duas cadeias reais", () => {
    const chains = discoverSendTextTransitChains(
      aiOrchestratorSrcPath,
      resolveVerifiedComposers(),
    );
    expect(chains).toHaveLength(2);
    for (const chain of chains) {
      expect(chain.cycles).toEqual([]);
      expect(chain.roots.length).toBeGreaterThan(0);
      for (const link of chain.links) {
        if (link.category === "text_in_transit_named_origin") {
          expect(link.root).toBeUndefined();
        } else {
          expect(link.root).toBeDefined();
        }
      }
    }
    const rootKinds = chains
      .flatMap((chain) => chain.roots.map((root) => root.kind))
      .sort();
    expect(rootKinds).toEqual(
      [
        "assistant_decision_text",
        "literal_text_at_link",
        "literal_text_at_link",
        "literal_text_at_link",
        "literal_text_at_link",
      ].sort(),
    );
  });
});

const envSchemaSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/config/env.ts",
);
const envExamplePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.env.example",
);

/** A chave cujo valor é o encontro entre o produto e o serviço de transporte. */
const BOUNDARY_PATH_ENV_KEY = "EVOLUTION_SEND_TEXT_PATH";

describe("a fronteira de serviço é atravessada por um valor, e os dois lados leem o mesmo (Goal042 / §3)", () => {
  it("computa o default do schema de ambiente e o compara ao .env.example, sem o valor estar escrito no teste", () => {
    const crossing = computeBoundaryValueCrossing(
      envSchemaSourcePath,
      envExamplePath,
      BOUNDARY_PATH_ENV_KEY,
    );

    // O valor não é digitado aqui: ele vem das duas fontes, e a única
    // coisa afirmada é que as duas concordam e que o que elas trazem é
    // um caminho de rota.
    expect(crossing.envSchema.value).toBe(crossing.envExample.value);
    expect(crossing.envSchema.value.startsWith("/")).toBe(true);
    expect(crossing.envSchema.value.length).toBeGreaterThan(1);
    expect(crossing.envSchema.line).toBeGreaterThan(0);
    expect(crossing.envExample.line).toBeGreaterThan(0);
  });

  it("reprova quando o default do schema diverge do .env.example, em vez de escolher um dos dois", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": [
        "export const env = {",
        `  ${BOUNDARY_PATH_ENV_KEY}: stringEnv("/send/text"),`,
        "};",
        "",
      ].join("\n"),
      ".env.example": `${BOUNDARY_PATH_ENV_KEY}=/send/outro\n`,
    });

    expect(() =>
      computeBoundaryValueCrossing(
        join(tree, "config/env.ts"),
        join(tree, ".env.example"),
        BOUNDARY_PATH_ENV_KEY,
      ),
    ).toThrowError(/diverge entre os dois lados da fronteira/u);

    rmSync(tree, { recursive: true, force: true });
  });

  it("reprova, em vez de pular, quando a chave falta em qualquer um dos dois lados", () => {
    const withoutExampleKey = makeTempSourceTree({
      "config/env.ts": [
        "export const env = {",
        `  ${BOUNDARY_PATH_ENV_KEY}: stringEnv("/send/text"),`,
        "};",
        "",
      ].join("\n"),
      ".env.example": "OUTRA_CHAVE=/qualquer\n",
    });
    expect(() =>
      readEnvFileValue(join(withoutExampleKey, ".env.example"), BOUNDARY_PATH_ENV_KEY),
    ).toThrowError(new RegExp(`não define ${BOUNDARY_PATH_ENV_KEY}`, "u"));
    expect(() =>
      computeBoundaryValueCrossing(
        join(withoutExampleKey, "config/env.ts"),
        join(withoutExampleKey, ".env.example"),
        BOUNDARY_PATH_ENV_KEY,
      ),
    ).toThrowError(new RegExp(`não define ${BOUNDARY_PATH_ENV_KEY}`, "u"));
    rmSync(withoutExampleKey, { recursive: true, force: true });

    const withoutSchemaKey = makeTempSourceTree({
      "config/env.ts": ["export const env = {", "  OUTRA_CHAVE: stringEnv(\"/qualquer\"),", "};", ""].join("\n"),
      ".env.example": `${BOUNDARY_PATH_ENV_KEY}=/send/text\n`,
    });
    expect(() =>
      readEnvSchemaDefault(join(withoutSchemaKey, "config/env.ts"), BOUNDARY_PATH_ENV_KEY),
    ).toThrowError(/não é declarada com default literal/u);
    rmSync(withoutSchemaKey, { recursive: true, force: true });
  });

  it("lê o default do schema pela forma, não pelo nome do helper nem por um valor escrito à mão", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": [
        "export const env = {",
        `  ${BOUNDARY_PATH_ENV_KEY}: qualquerHelperDeString("/um/caminho/qualquer"),`,
        "};",
        "",
      ].join("\n"),
    });

    const reading = readEnvSchemaDefault(join(tree, "config/env.ts"), BOUNDARY_PATH_ENV_KEY);
    expect(reading.value).toBe("/um/caminho/qualquer");
    expect(reading.line).toBe(2);

    rmSync(tree, { recursive: true, force: true });
  });
});

const productTransportRoutesFilePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../support/product-transport-routes.txt",
);

/** Chave estável `MÉTODO CAMINHO` de uma rota, para comparação por conjunto. */
function productTransportRouteKey(route: { method: string; path: string }): string {
  return `${route.method} ${route.path}`;
}

/**
 * Compara o conjunto computado ao conjunto do arquivo de valores, nas duas
 * direções, e reprova nomeando toda rota que sobra de um lado só. É a
 * asserção que a suíte permanente usa, e a que as duas demonstrações abaixo
 * exercitam com conjuntos sintéticos.
 */
function assertGoServiceRouteSetsMatch(
  computed: { method: string; path: string }[],
  fromFile: { method: string; path: string }[],
): void {
  const computedKeys = new Set(computed.map(productTransportRouteKey));
  const fileKeys = new Set(fromFile.map(productTransportRouteKey));
  const missingFromFile = Array.from(computedKeys).filter((key) => !fileKeys.has(key));
  const missingFromDiscovery = Array.from(fileKeys).filter((key) => !computedKeys.has(key));
  if (missingFromFile.length > 0 || missingFromDiscovery.length > 0) {
    throw new Error(
      `conjunto de rotas do serviço Go diverge do arquivo de valores — computada e ausente do arquivo: [${missingFromFile.join(", ")}]; linha do arquivo ausente do computado: [${missingFromDiscovery.join(", ")}]`,
    );
  }
}

describe("a fronteira inteira é atravessada — o conjunto de rotas do serviço Go bate com o arquivo de valores, nas duas direções (Goal043 / WU-02)", () => {
  it("o conjunto computado por discoverGoServiceHttpRequests é exatamente o conjunto do arquivo de valores", () => {
    const { requests } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const computed = Array.from(
      new Map(
        requests.map((request) => [
          productTransportRouteKey({ method: request.method, path: request.pathExpression }),
          { method: request.method, path: request.pathExpression },
        ]),
      ).values(),
    );
    const fromFile = readProductTransportRoutesFile(productTransportRoutesFilePath);

    expect(() => assertGoServiceRouteSetsMatch(computed, fromFile)).not.toThrow();
    expect(computed.map(productTransportRouteKey).sort()).toEqual(
      fromFile.map(productTransportRouteKey).sort(),
    );
  });

  it("rota computada e ausente do arquivo reprova, nomeando a rota que sobra", () => {
    const fromFile = readProductTransportRoutesFile(productTransportRoutesFilePath);
    const computedWithExtra = [...fromFile, { method: "GET", path: "/rota/nunca/no/arquivo" }];
    expect(() => assertGoServiceRouteSetsMatch(computedWithExtra, fromFile)).toThrowError(
      /computada e ausente do arquivo: \[GET \/rota\/nunca\/no\/arquivo\]/u,
    );
  });

  it("linha do arquivo que o descobridor não computa reprova, nomeando a rota que sobra", () => {
    const computed = readProductTransportRoutesFile(productTransportRoutesFilePath);
    const fromFileWithExtra = [
      ...computed,
      { method: "GET", path: "/rota/nunca/computada", line: 999 },
    ];
    expect(() => assertGoServiceRouteSetsMatch(computed, fromFileWithExtra)).toThrowError(
      /linha do arquivo ausente do computado: \[GET \/rota\/nunca\/computada\]/u,
    );
  });

  it("arquivo ausente reprova, em vez de pular", () => {
    const tree = makeTempSourceTree({});
    try {
      expect(() =>
        readProductTransportRoutesFile(join(tree, "product-transport-routes.txt")),
      ).toThrow();
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it("arquivo vazio reprova, em vez de pular", () => {
    const tree = makeTempSourceTree({ "product-transport-routes.txt": "# só comentário\n\n" });
    try {
      expect(() =>
        readProductTransportRoutesFile(join(tree, "product-transport-routes.txt")),
      ).toThrowError(/arquivo de rotas de transporte do produto vazio/u);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it("linha malformada reprova, nomeando arquivo e linha, em vez de pular", () => {
    const tree = makeTempSourceTree({
      "product-transport-routes.txt": "GET /ok\nisto não é uma linha de rota\n",
    });
    try {
      expect(() =>
        readProductTransportRoutesFile(join(tree, "product-transport-routes.txt")),
      ).toThrowError(/product-transport-routes\.txt:2: linha malformada/u);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it("ignora comentário e linha em branco, e preserva '{}' como segmento computado", () => {
    const tree = makeTempSourceTree({
      "product-transport-routes.txt": "# comentário\n\nGET /instance/{}\n",
    });
    try {
      expect(readProductTransportRoutesFile(join(tree, "product-transport-routes.txt"))).toEqual([
        { method: "GET", path: "/instance/{}", line: 3 },
      ]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});

describe("nenhum sítio de egresso é descartado em silêncio: ou vira requisição ao serviço Go, ou é contado fora com motivo escrito (Goal043 / WU-02)", () => {
  it("todo sítio classificado por discoverHttpEgressSites termina em requisição ou em contagem com motivo", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const { requests, notGoBound } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    const unaccounted = egress.sites.filter((site) => {
      const position = `${site.filePath}:${site.line}`;
      const countedOut = notGoBound.some(
        (counted) => `${counted.filePath}:${counted.line}` === position,
      );
      const turnedIntoRequest = requests.some(
        (request) =>
          `${request.filePath}:${request.line}` === position || request.reason.includes(position),
      );
      return !countedOut && !turnedIntoRequest;
    });
    expect(unaccounted.map((site) => `${site.filePath}:${site.line}`)).toEqual([]);
    expect(notGoBound.every((counted) => counted.reason.trim().length > 0)).toBe(true);
  });

  it("a requisição cujo destino só existe no chamador entra no conjunto alcançado — GET /health do BFF para o serviço Go", () => {
    const { requests } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const health = requests.filter(
      (request) => request.method === "GET" && request.pathExpression === "/health",
    );
    expect(health).toHaveLength(1);
    // O destino não está escrito na expressão da URL do `fetch`: ele chega
    // por parâmetro e só existe no chamador, que é a posição registrada.
    expect(health[0].filePath.replace(/\\/gu, "/")).toContain("apps/bff/src/routes/health.ts");
    expect(health[0].category).toBe("env_var_EVOLUTION_GO_BASE_URL");
    expect(health[0].reason).toContain("EVOLUTION_GO_BASE_URL");
  });
});

describe("Goal045 / WU-04 — afirmações permanentes: superfície por declaração distinta, ligação de instanciação resolvida e enumerações consumidas", () => {
  it("cada entrada de internalClientSurfaces corresponde a uma declaração distinta, e cada uma tem ao menos uma ligação de instanciação resolvida e registrada", () => {
    const { internalClientSurfaces } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    // Não-vacuidade: a resolução por ligação reconheceu ao menos uma instanciação.
    expect(internalClientSurfaces.length).toBeGreaterThan(0);

    // Cada superfície corresponde a uma declaração distinta: arquivo + linha
    // da classe é a chave, nunca o nome isolado (duas classes homônimas em
    // arquivos diferentes seriam duas entradas, não uma).
    const declarationKeys = internalClientSurfaces.map(
      (surface) => `${surface.filePath}:${surface.classLine}`,
    );
    expect(new Set(declarationKeys).size).toBe(declarationKeys.length);

    const validBindingForms = new Set([
      "local_declaration",
      "named_import",
      "aliased_named_import",
      "default_import",
    ]);
    let totalInstantiationBindings = 0;
    for (const surface of internalClientSurfaces) {
      // Cada instanciação reconhecida teve a ligação resolvida até a
      // declaração — a prova do que o motivo escrito afirma.
      expect(surface.instantiationBindings.length).toBeGreaterThan(0);
      for (const binding of surface.instantiationBindings) {
        expect(binding.filePath.length).toBeGreaterThan(0);
        expect(binding.localName.length).toBeGreaterThan(0);
        expect(validBindingForms.has(binding.form)).toBe(true);
      }
      totalInstantiationBindings += surface.instantiationBindings.length;
    }
    expect(totalInstantiationBindings).toBeGreaterThan(0);
  });

  it("a enumeração de instanciação fora do transporte é consumida: toda entrada tem motivo escrito e aponta a uma superfície computada", () => {
    const { internalClientSurfaces, nonGoBoundInstantiations } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    // Não-vacuidade: a enumeração de fora do transporte produziu ao menos
    // uma entrada.
    expect(nonGoBoundInstantiations.length).toBeGreaterThan(0);

    const knownClassNames = new Set(internalClientSurfaces.map((surface) => surface.className));
    for (const instantiation of nonGoBoundInstantiations) {
      expect(instantiation.filePath.length).toBeGreaterThan(0);
      expect(instantiation.line).toBeGreaterThan(0);
      expect(instantiation.reason.trim().length).toBeGreaterThan(0);
      expect(knownClassNames.has(instantiation.className)).toBe(true);
    }
  });
});

describe("controle negativo 2b — destino que só existe no chamador: o do serviço Go entra, o de outro serviço é contado fora (Goal043 / WU-02)", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    '  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://scheduling:9090"),',
    "};",
    "",
  ].join("\n");

  const healthModule = (baseUrlExpression: string): string =>
    [
      "export async function registerHealthRoutes() {",
      `  return checkHealth(${baseUrlExpression}, "/health", "request-id");`,
      "}",
      "",
      "async function checkHealth(baseUrl: string, path: string, requestId: string) {",
      "  const normalizedBaseUrl = baseUrl.replace(/\\/$/, \"\");",
      "  return fetch(`${normalizedBaseUrl}${path}`, { headers: { \"x-request-id\": requestId } });",
      "}",
      "",
    ].join("\n");

  it("o chamador que passa a base do serviço Go produz a rota, com o método GET que é o default do próprio fetch", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "routes/health.ts": healthModule("env.EVOLUTION_GO_BASE_URL"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, notGoBound } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "GET", path: "/health" }]);
      expect(notGoBound).toEqual([]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("o mesmo sítio, com o chamador passando a base de outro serviço, fica fora do conjunto — contado, com motivo, nunca pulado", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "routes/health.ts": healthModule("env.SCHEDULING_SERVICE_BASE_URL"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, notGoBound } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(requests).toEqual([]);
      expect(notGoBound).toHaveLength(1);
      expect(notGoBound[0].category).toBe("caller_resolved_base_url_via_checkHealth");
      expect(notGoBound[0].reason).toContain("checkHealth");
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

/* =========================================================================
 * Os cinco controles negativos de §4 (Goal043 / WU-05), lado TypeScript.
 * Cada um constrói uma árvore sintética em diretório temporário e roda o
 * descobridor real sobre ela — nunca a árvore real, e nunca resíduo
 * deixado para trás (todo diretório é removido no `finally`).
 * ========================================================================= */

describe("controle negativo 1 — chamada nova ao transporte por caminho não listado, e linha do arquivo que o descobridor não computa (Goal043 / WU-05)", () => {
  it("uma chamada nova ao serviço Go por caminho ausente do arquivo de valores reprova, com método e caminho impressos", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": [
        "export const env = {",
        '  EVOLUTION_BASE_URL: stringEnv("http://evolution-go:8080"),',
        '  EVOLUTION_SEND_TEXT_PATH: stringEnv("/send/text"),',
        '  EVOLUTION_NEW_THING_PATH: stringEnv("/new/thing"),',
        "};",
        "",
      ].join("\n"),
      "modules/new-thing.ts": [
        'return fetch(join(env.EVOLUTION_BASE_URL, env.EVOLUTION_SEND_TEXT_PATH), { method: "POST" });',
        'return fetch(join(env.EVOLUTION_BASE_URL, env.EVOLUTION_NEW_THING_PATH), { method: "POST" });',
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    const valueFileTree = makeTempSourceTree({ "routes.txt": "POST /send/text\n" });
    try {
      const { requests } = discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      const computed = requests.map((request) => ({ method: request.method, path: request.pathExpression }));
      expect(computed).toEqual([
        { method: "POST", path: "/send/text" },
        { method: "POST", path: "/new/thing" },
      ]);

      const fromFile = readProductTransportRoutesFile(join(valueFileTree, "routes.txt"));
      expect(() => assertGoServiceRouteSetsMatch(computed, fromFile)).toThrowError(
        /computada e ausente do arquivo: \[POST \/new\/thing\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
      rmSync(valueFileTree, { recursive: true, force: true });
    }
  });

  it("uma linha do arquivo de valores que o descobridor não computa reprova, na direção oposta", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": [
        "export const env = {",
        '  EVOLUTION_BASE_URL: stringEnv("http://evolution-go:8080"),',
        '  EVOLUTION_SEND_TEXT_PATH: stringEnv("/send/text"),',
        "};",
        "",
      ].join("\n"),
      "modules/only-old.ts": [
        'return fetch(join(env.EVOLUTION_BASE_URL, env.EVOLUTION_SEND_TEXT_PATH), { method: "POST" });',
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    const valueFileTree = makeTempSourceTree({
      "routes.txt": "POST /send/text\nGET /never/discovered\n",
    });
    try {
      const { requests } = discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      const computed = requests.map((request) => ({ method: request.method, path: request.pathExpression }));
      const fromFile = readProductTransportRoutesFile(join(valueFileTree, "routes.txt"));
      expect(() => assertGoServiceRouteSetsMatch(computed, fromFile)).toThrowError(
        /linha do arquivo ausente do computado: \[GET \/never\/discovered\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
      rmSync(valueFileTree, { recursive: true, force: true });
    }
  });
});

describe("controle negativo 4 (lado TypeScript) — mover sítio, cliente e rota para arquivo, pasta e classe de outro nome não muda a classificação (Goal043 / WU-05)", () => {
  it("a mesma requisição via cliente genérico, movida, classifica igual — nenhuma regra decide por nome", () => {
    const envSchema = [
      "export const env = {",
      '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
      "};",
      "",
    ].join("\n");
    const before = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const after = makeTempSourceTree({
      "config/env.ts": envSchema,
      "gateways/renamed-gateway.ts": [
        "export class TransportGateway {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "callers/another-caller.ts": [
        'import { TransportGateway } from "../gateways/renamed-gateway.js";',
        "",
        "export class AnotherCaller {",
        "  private gateway: TransportGateway;",
        "  constructor() {",
        "    this.gateway = new TransportGateway(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async doSomethingElse() {",
        '    return this.gateway.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const beforeRequests = discoverGoServiceHttpRequests(before, emptyTree, join(before, "config/env.ts"))
        .requests.map((request) => ({
          method: request.method,
          path: request.pathExpression,
          category: request.category,
        }));
      const afterRequests = discoverGoServiceHttpRequests(after, emptyTree, join(after, "config/env.ts"))
        .requests.map((request) => ({
          method: request.method,
          path: request.pathExpression,
          category: request.category,
        }));
      expect(beforeRequests).toEqual([
        { method: "POST", path: "/instance/create", category: "env_var_EVOLUTION_GO_BASE_URL" },
      ]);
      expect(afterRequests).toEqual(beforeRequests);
    } finally {
      rmSync(before, { recursive: true, force: true });
      rmSync(after, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("controle negativo 5 — destino resolvido por forma: cliente genérico para outro serviço, e URL montada para entrega, ficam fora do conjunto alcançado (Goal043 / WU-05)", () => {
  it("cliente genérico apontado para outro serviço não entra no conjunto, e URL montada para o webhook de entrada não entra — invertendo qualquer um dos dois reprovaria", () => {
    const envSchema = [
      "export const env = {",
      '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
      '  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://scheduling:9090"),',
      '  AI_ORCHESTRATOR_BASE_URL: stringEnv("http://ai-orchestrator:4000"),',
      "};",
      "",
    ].join("\n");
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/scheduling-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class SchedulingClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.SCHEDULING_SERVICE_BASE_URL);",
        "  }",
        "  async listSlots() {",
        '    return this.http.request({ method: "GET", path: "/slots" });',
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  webhookUrl(): string {",
        "    return `${env.AI_ORCHESTRATOR_BASE_URL}/webhooks/evolution?token=abc`;",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, assembledUrls } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );

      // O cliente genérico apontado para outro serviço nunca chega a ser
      // varrido: nenhuma requisição de /slots aparece, nem no conjunto
      // alcançado nem em URL montada.
      expect(requests).toEqual([]);
      expect(assembledUrls.some((assembled) => assembled.urlExpression.includes("/slots"))).toBe(false);

      // A URL montada para o webhook de entrada é nomeada como montagem
      // para entrega, não como requisição ao transporte.
      const webhook = assembledUrls.find((assembled) => assembled.functionName === "webhookUrl");
      expect(webhook).toBeDefined();
      expect(webhook?.category).toBe("assembled_url_for_delivery_webhookUrl");
      expect(webhook?.urlExpression).toContain("/webhooks/evolution");
      expect(requests.some((request) => request.pathExpression.includes("/webhooks/evolution"))).toBe(false);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

/* =========================================================================
 * Afirmações permanentes que consomem os dois mecanismos do Goal044: o
 * chamador seguido por ligação importada, atravessando arquivo (WU-01), e a
 * superfície do cliente HTTP interno derivada da classe (WU-02). Nenhuma
 * asserção do Goal043 acima foi relaxada, pulada ou removida — estas são
 * adições (Goal044 / WU-03).
 * ========================================================================= */

describe("WU-01 na árvore real: nenhum motivo de notGoBound afirma algo sobre chamador não lido (Goal044 / WU-03)", () => {
  it("todo sítio 'caller_resolved_base_url_via_*' contado fora do conjunto relata quantos chamadores foram lidos e em quantos arquivos", () => {
    const { notGoBound } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const callerResolvedNotGoBound = notGoBound.filter((counted) =>
      counted.category.startsWith("caller_resolved_base_url_via_"),
    );
    for (const counted of callerResolvedNotGoBound) {
      expect(counted.reason).toMatch(/\d+ chamador\(es\) lido\(s\) em \d+ arquivo\(s\)/u);
      expect(counted.reason).not.toMatch(/não lido/u);
    }
  });
});

describe("WU-01 é exercitado: o chamador que vive em outro arquivo, ligado por import (com alias), continua alcançando o serviço Go (Goal044 / WU-03)", () => {
  it("a requisição cujo único chamador real está em outro arquivo, importado sob outro nome, entra no conjunto alcançado", () => {
    const envSchema = [
      "export const env = {",
      '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
      '  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://scheduling:9090"),',
      "};",
      "",
    ].join("\n");
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/transport/check-health.ts": [
        "export async function checkHealthUpstream(baseUrl: string, path: string) {",
        "  return fetch(`${baseUrl}${path}`);",
        "}",
        "",
        // Chamador no mesmo arquivo, para uma base que não é o serviço Go —
        // é o que classifica o sítio como "caller_resolved_base_url_via_*"
        // (categoria da qual a resolução de chamadores parte). O chamador
        // que de fato alcança o serviço Go vive só em routes/status.ts.
        "export async function checkOtherService() {",
        '  return checkHealthUpstream(env.SCHEDULING_SERVICE_BASE_URL, "/status");',
        "}",
        "",
      ].join("\n"),
      "routes/status.ts": [
        'import { checkHealthUpstream as probe } from "../modules/transport/check-health.js";',
        "",
        "export async function registerStatusRoute() {",
        '  return probe(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, notGoBound } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "GET", path: "/health" }]);
      // O chamador que alcança o serviço Go está em routes/status.ts, não
      // no arquivo do sítio — é essa travessia de arquivo que o Goal043
      // (chamador só no mesmo arquivo) não seguia.
      expect(requests[0].filePath).toBe(join(tree, "routes", "status.ts"));
      expect(requests[0].reason).toContain("probe");
      expect(requests[0].reason).toContain("checkHealthUpstream");
      expect(notGoBound).toEqual([]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("quando nenhum chamador resolve ao serviço Go, o motivo relata os chamadores lidos — um no mesmo arquivo, um em outro arquivo — nunca um deles como não lido", () => {
    const envSchema = [
      "export const env = {",
      '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
      '  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://scheduling:9090"),',
      "};",
      "",
    ].join("\n");
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/transport/probe.ts": [
        "export async function probeUpstream(baseUrl: string, path: string) {",
        "  return fetch(`${baseUrl}${path}`);",
        "}",
        "",
        "export async function callFromSameFile() {",
        '  return probeUpstream(env.SCHEDULING_SERVICE_BASE_URL, "/slots");',
        "}",
        "",
      ].join("\n"),
      "routes/other.ts": [
        'import { probeUpstream } from "../modules/transport/probe.js";',
        "",
        "export async function callFromOtherFile() {",
        '  return probeUpstream(env.SCHEDULING_SERVICE_BASE_URL, "/other");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, notGoBound } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(requests).toEqual([]);
      expect(notGoBound).toHaveLength(1);
      expect(notGoBound[0].category).toBe("caller_resolved_base_url_via_probeUpstream");
      // Dois chamadores reais foram lidos — um no arquivo do sítio, um em
      // outro arquivo ligado por import — e os dois arquivos entram na
      // contagem. Antes do WU-01, só o chamador do mesmo arquivo era lido;
      // o motivo abaixo prova que o segundo não ficou "não lido".
      expect(notGoBound[0].reason).toContain("2 chamador(es) lido(s) em 2 arquivo(s)");
      expect(notGoBound[0].reason).not.toMatch(/não lido/u);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("WU-02 é exercitado na árvore real: a superfície do cliente HTTP interno é derivada por alcançabilidade, não por uma lista de três nomes (Goal044 / WU-03)", () => {
  it("ao menos um membro exercitado por uma requisição real chegou por delegação (não tem fetch no próprio corpo), e nenhum membro exercitado é private/protected na declaração real", () => {
    const discovery = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const { requests } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    const directFetchMemberNames = new Set(
      discovery.sites
        .filter((site) => site.category.startsWith("constructor_base_url_"))
        .map((site) => site.category.slice("constructor_base_url_".length)),
    );

    const clientCallPattern = /this\.\w+\.(\w+)\(/u;
    const exercisedMemberNames = Array.from(
      new Set(
        requests
          .map((request) => request.reason.match(clientCallPattern)?.[1])
          .filter((name): name is string => name !== undefined),
      ),
    );

    // Não-vacuidade do mecanismo: a superfície derivada realmente produziu
    // requisição sobre a árvore real.
    expect(exercisedMemberNames.length).toBeGreaterThan(0);

    // Ao menos um membro exercitado não é, ele próprio, o sítio direto de
    // fetch (`constructor_base_url_<nome>`) — chegou à superfície por
    // delegação (`this.<outro>()`), a diferença entre a lista de três
    // nomes que existia antes e a superfície computada por alcançabilidade.
    const delegatedMembersInUse = exercisedMemberNames.filter(
      (name) => !directFetchMemberNames.has(name),
    );
    expect(delegatedMembersInUse.length).toBeGreaterThan(0);

    const clientSite = discovery.sites.find((site) => site.category.startsWith("constructor_base_url_"));
    expect(clientSite).toBeDefined();
    const clientSource = readFileSync(clientSite!.filePath, "utf8");
    for (const memberName of exercisedMemberNames) {
      const nonPublicDeclaration = new RegExp(
        `(private|protected)\\s+(?:readonly\\s+|async\\s+|static\\s+)*${memberName}\\s*[(<]`,
        "u",
      );
      expect(nonPublicDeclaration.test(clientSource)).toBe(false);
    }
  });
});

describe("WU-02 é exercitado: delegação de dois níveis alcança fetch, membro private que alcança fetch fica fora da superfície, e membro que não delega nem chama fetch também fica fora (Goal044 / WU-03)", () => {
  it("as duas requisições vêm de membros públicos que só alcançam fetch por delegação; o membro private e o membro que não alcança fetch não geram requisição nenhuma", () => {
    const envSchema = [
      "export const env = {",
      '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
      "};",
      "",
    ].join("\n");
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    return this.requestWithStatus(options);",
        "  }",
        "  async requestWithStatus(options: { method: string; path: string }) {",
        "    return this.perform(options);",
        "  }",
        "  private async perform(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "  ping(): string {",
        '    return "pong";',
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "  async createInstanceWithStatus() {",
        '    return this.http.requestWithStatus({ method: "POST", path: "/instance/create-with-status" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests } = discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([
        { method: "POST", path: "/instance/create" },
        { method: "POST", path: "/instance/create-with-status" },
      ]);
      // "request" só alcança fetch delegando a "requestWithStatus", que por
      // sua vez delega a "perform" — dois níveis de delegação, não um
      // fetch direto no próprio membro.
      expect(requests[0].reason).toContain("this.http.request(...)");
      expect(requests[1].reason).toContain("this.http.requestWithStatus(...)");
      // "perform" alcança fetch mas é private: não integra a superfície
      // chamável de fora, e nenhuma requisição é atribuída a ele.
      expect(requests.some((request) => request.reason.includes(".perform("))).toBe(false);
      // "ping" não chama fetch nem delega: fica fora da superfície, e
      // nenhuma requisição é atribuída a ele.
      expect(requests.some((request) => request.reason.includes(".ping("))).toBe(false);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

/* =========================================================================
 * Os quatro controles negativos de WU-04 (Goal044). Cada um monta a própria
 * árvore sintética em diretório temporário e roda o descobridor real sobre
 * ela — nunca a árvore real —, removendo todo diretório no `finally`. Nenhum
 * amplia nem estreita o conjunto de 10 rotas que a suíte permanente assere.
 * ========================================================================= */

describe("controle negativo 1 (Goal044 / WU-04) — helper com chamador que passa a base do serviço Go em outro arquivo, ligado por import com alias: antes do arquivo existir, o sítio fica em notGoBound; depois, entra no conjunto", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    '  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://scheduling:9090"),',
    "};",
    "",
  ].join("\n");

  const helperModule = [
    "export async function reachUpstream(baseUrl: string, path: string) {",
    "  return fetch(`${baseUrl}${path}`);",
    "}",
    "",
    "export async function callFromSameFile() {",
    '  return reachUpstream(env.SCHEDULING_SERVICE_BASE_URL, "/other");',
    "}",
    "",
  ].join("\n");

  it("antes: só o chamador do mesmo arquivo existe, e ele não passa a base do serviço Go — o sítio fica fora do conjunto, contado em notGoBound", () => {
    const beforeTree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/upstream.ts": helperModule,
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, notGoBound } = discoverGoServiceHttpRequests(
        beforeTree,
        emptyTree,
        join(beforeTree, "config/env.ts"),
      );
      expect(requests).toEqual([]);
      expect(notGoBound).toHaveLength(1);
      expect(notGoBound[0].category).toBe("caller_resolved_base_url_via_reachUpstream");
      expect(notGoBound[0].reason).toContain("nenhum deles passa uma chave de base do serviço Go");
    } finally {
      rmSync(beforeTree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("depois: um arquivo novo importa o helper sob alias e chama com a base do serviço Go — a mesma classificação passa a entrar no conjunto alcançado", () => {
    const afterTree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/upstream.ts": helperModule,
      "routes/health.ts": [
        // O import liga a função a outro nome local: o chamador não usa o
        // nome da declaração em lugar nenhum. É a ligação por alias que o
        // par antes/depois deste controle exercita.
        'import { reachUpstream as probeHealth } from "../modules/upstream.js";',
        "",
        "export async function registerHealthRoute() {",
        '  return probeHealth(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, notGoBound } = discoverGoServiceHttpRequests(
        afterTree,
        emptyTree,
        join(afterTree, "config/env.ts"),
      );
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "GET", path: "/health" }]);
      expect(requests[0].filePath).toBe(join(afterTree, "routes", "health.ts"));
      // O motivo escrito nomeia o alias local e a declaração de origem.
      expect(requests[0].reason).toContain("probeHealth");
      expect(requests[0].reason).toContain("reachUpstream");
      expect(notGoBound).toEqual([]);
    } finally {
      rmSync(afterTree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("controle negativo 2 (Goal044 / WU-04) — método público sem fetch próprio, delegando ao membro privado que tem o fetch: sem a delegação a chamada não vira rota; com ela, a rota entra no conjunto", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    "};",
    "",
  ].join("\n");

  /** O chamador é o mesmo nas três árvores: só a declaração do cliente muda. */
  const evolutionClient = [
    'import { InternalHttpClient } from "./internal-http-client.js";',
    "",
    "export class EvolutionClient {",
    "  private http: InternalHttpClient;",
    "  constructor() {",
    "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
    "  }",
    "  async createInstance() {",
    '    return this.http.performPublic({ method: "POST", path: "/instance/create" });',
    "  }",
    "}",
    "",
  ].join("\n");

  const internalClient = (performPublicBody: string): string =>
    [
      "export class InternalHttpClient {",
      "  constructor(private baseUrl: string) {}",
      "  async request(options: { method: string; path: string }) {",
      "    const url = new URL(options.path, this.baseUrl);",
      '    return fetch(url, { method: "GET" });',
      "  }",
      "  async performPublic(options: { method: string; path: string }) {",
      `    ${performPublicBody}`,
      "  }",
      "  private async perform(options: { method: string; path: string }) {",
      "    const url = new URL(options.path, this.baseUrl);",
      "    return fetch(url, { method: options.method });",
      "  }",
      "}",
      "",
    ].join("\n");

  it("antes: o membro público existe mas ainda não delega ao membro privado que tem o fetch — a chamada não vira rota, e é contada fora com o motivo derivado da declaração", () => {
    const beforeTree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient("return { accepted: false, options };"),
      "clients/evolution-client.ts": evolutionClient,
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, nonTransportMemberCalls, internalClientSurfaces } =
        discoverGoServiceHttpRequests(beforeTree, emptyTree, join(beforeTree, "config/env.ts"));

      // Nenhuma rota: o membro chamado não alcança fetch, nem direto nem por
      // delegação, então ele não está na superfície de transporte.
      expect(requests.some((request) => request.pathExpression === "/instance/create")).toBe(false);

      // E a chamada não some: ela é contada fora, com o motivo que a
      // derivação escreveu para o membro.
      expect(nonTransportMemberCalls).toHaveLength(1);
      expect(nonTransportMemberCalls[0].memberName).toBe("performPublic");
      expect(nonTransportMemberCalls[0].filePath).toBe(join(beforeTree, "clients", "evolution-client.ts"));
      expect(nonTransportMemberCalls[0].reason).toContain("não chama fetch nem delega");

      const surface = internalClientSurfaces[0];
      expect(surface.reachingMembers).not.toContain("performPublic");
      expect(surface.excludedMembers.map((member) => member.name)).toContain("performPublic");
    } finally {
      rmSync(beforeTree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("depois: o mesmo membro público passa a delegar ao membro privado que tem o fetch — sem fetch próprio, a rota entra no conjunto alcançado", () => {
    const afterTree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient("return this.perform(options);"),
      "clients/evolution-client.ts": evolutionClient,
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, nonTransportMemberCalls, internalClientSurfaces } =
        discoverGoServiceHttpRequests(afterTree, emptyTree, join(afterTree, "config/env.ts"));

      expect(
        requests
          .filter((request) => request.pathExpression === "/instance/create")
          .map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "POST", path: "/instance/create" }]);
      expect(nonTransportMemberCalls).toEqual([]);

      const surface = internalClientSurfaces[0];
      // O membro entrou na superfície sem ter fetch próprio: o único fetch
      // que ele alcança está no membro privado a que ele delega, e o membro
      // privado continua fora da superfície.
      expect(surface.reachingMembers).toContain("performPublic");
      expect(surface.excludedMembers.map((member) => member.name)).toContain("perform");
      const excludedPrivate = surface.excludedMembers.find((member) => member.name === "perform");
      expect(excludedPrivate?.reason).toContain("private/protected");
    } finally {
      rmSync(afterTree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("antes, no limite: o membro público ainda não foi acrescentado à classe — a chamada não é reconhecida e a leitura derruba nomeando arquivo e linha, em vez de sumir com ela", () => {
    const withoutMemberTree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        '    return fetch(url, { method: "GET" });',
        "  }",
        "  private async perform(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": evolutionClient,
    });
    const emptyTree = makeTempSourceTree({});
    try {
      let thrown: unknown;
      try {
        discoverGoServiceHttpRequests(
          withoutMemberTree,
          emptyTree,
          join(withoutMemberTree, "config/env.ts"),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toMatch(
        /evolution-client\.ts:\d+: chamada this\.http\.performPublic\(\.\.\.\).*não é membro de topo da declaração de InternalHttpClient/u,
      );
    } finally {
      rmSync(withoutMemberTree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("controle negativo 3 (Goal044 / WU-04) — ligação alcançável só por reexportação ou import dinâmico derruba a leitura, sem afirmar que os chamadores não passam chave de base", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    '  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://scheduling:9090"),',
    "};",
    "",
  ].join("\n");

  const checkHealthModule = [
    "export async function checkHealthUpstream(baseUrl: string, path: string) {",
    "  return fetch(`${baseUrl}${path}`);",
    "}",
    "",
    "export async function checkOtherService() {",
    '  return checkHealthUpstream(env.SCHEDULING_SERVICE_BASE_URL, "/status");',
    "}",
    "",
  ].join("\n");

  it("o único chamador real está atrás de uma reexportação — a leitura derruba nomeando o arquivo e a linha da reexportação, não o motivo de notGoBound", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/transport/check-health.ts": checkHealthModule,
      "modules/transport/reexport.ts": [
        'export { checkHealthUpstream } from "./check-health.js";',
        "",
      ].join("\n"),
      "routes/status.ts": [
        'import { checkHealthUpstream } from "../modules/transport/reexport.js";',
        "",
        "export async function registerStatusRoute() {",
        '  return checkHealthUpstream(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      let thrown: unknown;
      try {
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toMatch(
        /reexport\.ts:\d+: "checkHealthUpstream" \(exportado por .*check-health\.ts\) é reexportado daqui/u,
      );
      expect(message).not.toMatch(/passa uma chave de base do serviço Go/u);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("o único chamador real está atrás de um import dinâmico — a leitura derruba nomeando o arquivo e a linha do import, não o motivo de notGoBound", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/transport/check-health.ts": checkHealthModule,
      "routes/lazy-status.ts": [
        "export async function registerLazyStatusRoute() {",
        '  const mod = await import("../modules/transport/check-health.js");',
        '  return mod.checkHealthUpstream(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      let thrown: unknown;
      try {
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toMatch(
        /lazy-status\.ts:\d+: import dinâmico de "\.\.\/modules\/transport\/check-health\.js" pode carregar "checkHealthUpstream"/u,
      );
      expect(message).not.toMatch(/passa uma chave de base do serviço Go/u);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("controle negativo 4 (Goal044 / WU-04) — mover e renomear o helper (WU-01) e a classe do cliente HTTP interno (WU-02) não muda a classificação computada", () => {
  it("a mesma forma, com helper, classe, arquivos e pastas de outro nome, produz exatamente os mesmos método+caminho+categoria", () => {
    const envSchema = [
      "export const env = {",
      '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
      '  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://scheduling:9090"),',
      "};",
      "",
    ].join("\n");

    const before = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/transport/base.ts": [
        "export async function reachUpstream(baseUrl: string, path: string) {",
        "  return fetch(`${baseUrl}${path}`);",
        "}",
        "",
        "export async function callFromSameFile() {",
        '  return reachUpstream(env.SCHEDULING_SERVICE_BASE_URL, "/other");',
        "}",
        "",
      ].join("\n"),
      "routes/status.ts": [
        'import { reachUpstream as probe } from "../modules/transport/base.js";',
        "",
        "export async function registerStatusRoute() {",
        '  return probe(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
      "clients/internal-http-client.ts": [
        "export class HttpGateway {",
        "  constructor(private baseUrl: string) {}",
        "  async send(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": [
        'import { HttpGateway } from "./internal-http-client.js";',
        "",
        "export class ServiceClient {",
        "  private gateway: HttpGateway;",
        "  constructor() {",
        "    this.gateway = new HttpGateway(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createThing() {",
        '    return this.gateway.send({ method: "POST", path: "/thing/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });

    const after = makeTempSourceTree({
      "config/env.ts": envSchema,
      "gateways/lookup.ts": [
        "export async function fetchUpstreamStatus(baseUrl: string, path: string) {",
        "  return fetch(`${baseUrl}${path}`);",
        "}",
        "",
        "export async function unrelatedProbe() {",
        '  return fetchUpstreamStatus(env.SCHEDULING_SERVICE_BASE_URL, "/other");',
        "}",
        "",
      ].join("\n"),
      "entrypoints/health-route.ts": [
        'import { fetchUpstreamStatus as probeAlias } from "../gateways/lookup.js";',
        "",
        "export async function mountHealthRoute() {",
        '  return probeAlias(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
      "infra/transport-client.ts": [
        "export class TransportClient {",
        "  constructor(private baseUrl: string) {}",
        "  async dispatch(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "infra/thing-service.ts": [
        'import { TransportClient } from "./transport-client.js";',
        "",
        "export class ThingService {",
        "  private transport: TransportClient;",
        "  constructor() {",
        "    this.transport = new TransportClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createThing() {",
        '    return this.transport.dispatch({ method: "POST", path: "/thing/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });

    const emptyTree = makeTempSourceTree({});
    try {
      const beforeRequests = discoverGoServiceHttpRequests(before, emptyTree, join(before, "config/env.ts"))
        .requests.map((request) => ({
          method: request.method,
          path: request.pathExpression,
          category: request.category,
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
      const afterRequests = discoverGoServiceHttpRequests(after, emptyTree, join(after, "config/env.ts"))
        .requests.map((request) => ({
          method: request.method,
          path: request.pathExpression,
          category: request.category,
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

      expect(beforeRequests).toEqual([
        { method: "GET", path: "/health", category: "env_var_EVOLUTION_GO_BASE_URL" },
        { method: "POST", path: "/thing/create", category: "env_var_EVOLUTION_GO_BASE_URL" },
      ]);
      expect(afterRequests).toEqual(beforeRequests);
    } finally {
      rmSync(before, { recursive: true, force: true });
      rmSync(after, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

/* =========================================================================
 * As bordas que a rodada 1 deixou abertas, fechadas e exercitadas
 * (Goal044 / WU-03): forma de exportação reconhecida por ligação e não por
 * uma única sintaxe; nome de membro de classe derivado também na forma de
 * propriedade-arrow; chamada a membro fora da superfície lida em vez de
 * ignorada; e a enumeração que §2/§3 exigem saindo do descobridor.
 * ========================================================================= */

describe("WU-01 é fail-closed na forma de exportação: a ligação é reconhecida por lista de export, com alias, e forma não reconhecida derruba (Goal044 / WU-03)", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    '  SCHEDULING_SERVICE_BASE_URL: stringEnv("http://scheduling:9090"),',
    "};",
    "",
  ].join("\n");

  /** O helper e o chamador do mesmo arquivo; só a linha de exportação muda entre os casos. */
  const helperModule = (exportLine: string): string =>
    [
      "async function reachUpstream(baseUrl: string, path: string) {",
      "  return fetch(`${baseUrl}${path}`);",
      "}",
      "",
      "export async function callFromSameFile() {",
      '  return reachUpstream(env.SCHEDULING_SERVICE_BASE_URL, "/other");',
      "}",
      "",
      exportLine,
      "",
    ].join("\n");

  it("declaração sem `export` na própria linha, exportada por `export { reachUpstream };`: o chamador do outro arquivo é lido, e a rota entra no conjunto", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/upstream.ts": helperModule("export { reachUpstream };"),
      "routes/health.ts": [
        'import { reachUpstream } from "../modules/upstream.js";',
        "",
        "export async function registerHealthRoute() {",
        '  return reachUpstream(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, notGoBound, callerResolutions } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "GET", path: "/health" }]);
      expect(notGoBound).toEqual([]);
      // A forma foi reconhecida como ligação nomeada, e a varredura entre
      // arquivos de fato rodou — antes, a forma não reconhecida devolvia
      // "sem export" e desligava essa varredura em silêncio.
      expect(callerResolutions).toHaveLength(1);
      expect(callerResolutions[0].exportForm).toBe("named");
      expect(callerResolutions[0].importingFilePaths).toEqual([join(tree, "routes", "health.ts")]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("exportada sob outro nome (`export { reachUpstream as probeUpstream };`), o import é resolvido pelo nome exportado, não pelo nome da declaração", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/upstream.ts": helperModule("export { reachUpstream as probeUpstream };"),
      "routes/health.ts": [
        'import { probeUpstream } from "../modules/upstream.js";',
        "",
        "export async function registerHealthRoute() {",
        '  return probeUpstream(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, callerResolutions } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "GET", path: "/health" }]);
      expect(callerResolutions[0].callerCount).toBe(2);
      expect(callerResolutions[0].callerFilePaths).toContain(join(tree, "routes", "health.ts"));
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("forma de exportação que a resolução não converte em ligação importável derruba a leitura com arquivo:linha, em vez de desligar a varredura entre arquivos", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/upstream.ts": helperModule("export default { reachUpstream };"),
      "routes/health.ts": [
        'import upstream from "../modules/upstream.js";',
        "",
        "export async function registerHealthRoute() {",
        '  return upstream.reachUpstream(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      let thrown: unknown;
      try {
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toMatch(
        /upstream\.ts:\d+: "reachUpstream" é mencionado por "export default \{ reachUpstream \}"/u,
      );
      expect(message).not.toMatch(/passa uma chave de base do serviço Go/u);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  /** O mesmo helper, exportado duas vezes: pela declaração e pela linha dada. */
  const helperExportedTwice = (secondExportLine: string): string =>
    [
      "export async function reachUpstream(baseUrl: string, path: string) {",
      "  return fetch(`${baseUrl}${path}`);",
      "}",
      "",
      "export async function callFromSameFile() {",
      '  return reachUpstream(env.SCHEDULING_SERVICE_BASE_URL, "/other");',
      "}",
      "",
      secondExportLine,
      "",
    ].join("\n");

  it("o mesmo nome saindo por duas ligações (declaração exportada e `export { reachUpstream as probeUpstream };`): o chamador que importa pela segunda é lido, não silenciado pela primeira", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/upstream.ts": helperExportedTwice("export { reachUpstream as probeUpstream };"),
      "routes/health.ts": [
        'import { probeUpstream } from "../modules/upstream.js";',
        "",
        "export async function registerHealthRoute() {",
        '  return probeUpstream(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, notGoBound, callerResolutions } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      // A primeira ligação (a declaração exportada) não alcança
      // routes/health.ts, que importa pela segunda. Parar na primeira
      // deixaria esta rota fora do conjunto, sem nada escrito a respeito.
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "GET", path: "/health" }]);
      expect(notGoBound).toEqual([]);
      expect(callerResolutions).toHaveLength(1);
      expect(callerResolutions[0].exportForm).toBe("named");
      expect(callerResolutions[0].importingFilePaths).toEqual([join(tree, "routes", "health.ts")]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("segunda construção `export` em forma não convertível derruba a leitura mesmo com a primeira já reconhecida — reconhecer uma ligação não silencia as outras", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "modules/upstream.ts": helperExportedTwice("export default { reachUpstream };"),
      "routes/health.ts": [
        'import upstream from "../modules/upstream.js";',
        "",
        "export async function registerHealthRoute() {",
        '  return upstream.reachUpstream(env.EVOLUTION_GO_BASE_URL, "/health");',
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      let thrown: unknown;
      try {
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toMatch(
        /upstream\.ts:\d+: "reachUpstream" é mencionado por "export default \{ reachUpstream \}"/u,
      );
      expect(message).not.toMatch(/passa uma chave de base do serviço Go/u);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("o egresso genérico é varrido também pelo nome local do import com alias — o motivo escrito nunca afirma zero chamador onde existe um (Goal044 / WU-03)", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    '  THING_URL: stringEnv("http://thing:7070"),',
    "};",
    "",
  ].join("\n");

  const primitiveModule = [
    "export async function requestJson(destino: string, options: RequestInit) {",
    "  return fetch(destino, options);",
    "}",
    "",
  ].join("\n");

  /** O arquivo que chama o primitivo sob alias, com a base dada. */
  const aliasCaller = (baseEnvVar: string): string =>
    [
      'import { requestJson as sendJson } from "./net/send.js";',
      "",
      "export async function fetchThing() {",
      `  return sendJson(env.${baseEnvVar}, {});`,
      "}",
      "",
    ].join("\n");

  it("o chamador em outro arquivo, ligado por import com alias, é lido como chamador do primitivo genérico", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "net/send.ts": primitiveModule,
      "caller.ts": aliasCaller("THING_URL"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const discovery = discoverHttpEgressSites(tree, emptyTree);
      expect(
        discovery.genericEgressCallers.map((caller) => ({
          filePath: caller.filePath,
          line: caller.line,
          category: caller.category,
        })),
      ).toEqual([{ filePath: join(tree, "caller.ts"), line: 4, category: "env_var_THING_URL" }]);
      expect(
        discovery.genericEgressCallersByPrimitive.map((entry) => ({
          functionName: entry.functionName,
          callerCount: entry.callers.length,
        })),
      ).toEqual([{ functionName: "requestJson", callerCount: 1 }]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("o motivo escrito do sítio genérico conta esse chamador, em vez de afirmar zero", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "net/send.ts": primitiveModule,
      "caller.ts": aliasCaller("THING_URL"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, notGoBound } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(requests).toEqual([]);
      expect(notGoBound).toHaveLength(1);
      expect(notGoBound[0].category).toBe(
        "generic_egress_destination_decided_by_caller_requestJson",
      );
      expect(notGoBound[0].reason).toContain('egresso genérico "requestJson": 1 chamador(es)');
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("o chamador sob alias que passa a base do serviço Go derruba a leitura, em vez de sumir da contagem", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "net/send.ts": primitiveModule,
      "caller.ts": aliasCaller("EVOLUTION_GO_BASE_URL"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() =>
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
      ).toThrowError(/o egresso genérico "requestJson" tem chamador com destino no serviço Go/u);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("dois primitivos homônimos em arquivos diferentes não colidem: o chamador sob alias do SEGUNDO arquivo com base do serviço Go também derruba a leitura", () => {
    // Regressão do blocker da rodada 3 (Goal044): a varredura indexava
    // `scannedPrimitiveNames` só pelo nome da função. Com dois arquivos
    // declarando o mesmo nome, o segundo era pulado inteiro — sua varredura
    // de alias nunca rodava, e o relatório final afirmava "0 chamador(es),
    // nenhum com destino no serviço Go" para um chamador que existia e
    // passava a base do serviço Go.
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "net/first.ts": primitiveModule,
      "net/second.ts": primitiveModule,
      "caller.ts": [
        'import { requestJson as probe } from "./net/second.js";',
        "",
        "export async function fetchThing() {",
        "  return probe(env.EVOLUTION_GO_BASE_URL, {});",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() =>
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
      ).toThrowError(/o egresso genérico "requestJson" tem chamador com destino no serviço Go/u);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("WU-02 é fail-closed no nome do membro: a forma de propriedade-arrow dá o nome declarado, e forma sem nome derivável derruba (Goal044 / WU-03)", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    "};",
    "",
  ].join("\n");

  it("membro declarado como propriedade-arrow entra na superfície com o nome da declaração, e a chamada a ele vira rota", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  sendIt = async (options: { method: string; path: string }) => {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  };",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.sendIt({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, internalClientSurfaces } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      // O nome derivado é o da declaração. Antes, a derivação andava para
      // trás do "(" e parava em "async" (ou em nada), e a chamada
      // this.http.sendIt(...) não casava com superfície alguma.
      expect(internalClientSurfaces[0].reachingMembers).toEqual(["sendIt"]);
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "POST", path: "/instance/create" }]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("membro cuja forma não dá nome derivável da declaração derruba a leitura com arquivo:linha", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": [
        'const dynamicMember = "send";',
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "  [dynamicMember](options: { method: string; path: string }) {",
        "    return this.request(options);",
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      let thrown: unknown;
      try {
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toMatch(
        /internal-http-client\.ts:\d+: membro de classe cuja forma não dá nome derivável da declaração/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("WU-02 é fail-closed na chamada: membro fora da superfície é contado fora com motivo, e membro que a classe não declara derruba (Goal044 / WU-03)", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    "};",
    "",
  ].join("\n");

  const internalClient = [
    "export class InternalHttpClient {",
    "  constructor(private baseUrl: string) {}",
    "  async request(options: { method: string; path: string }) {",
    "    const url = new URL(options.path, this.baseUrl);",
    "    return fetch(url, { method: options.method });",
    "  }",
    "  private async perform(options: { method: string; path: string }) {",
    "    return this.request(options);",
    "  }",
    "  describeSelf() {",
    '    return "cliente";',
    "  }",
    "}",
    "",
  ].join("\n");

  it("chamada a membro private e a membro que não alcança fetch: nenhuma rota, e as duas contadas fora com o motivo derivado da declaração", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.perform({ method: "POST", path: "/instance/create" });',
        "  }",
        "  async describe() {",
        "    return this.http.describeSelf();",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, nonTransportMemberCalls } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(requests).toEqual([]);
      // Antes, as duas chamadas simplesmente não casavam com o regex da
      // superfície: nem rota, nem contagem fora, nem recusa.
      expect(
        nonTransportMemberCalls.map((call) => call.memberName).sort((a, b) => a.localeCompare(b)),
      ).toEqual(["describeSelf", "perform"]);
      for (const call of nonTransportMemberCalls) {
        expect(call.className).toBe("InternalHttpClient");
        expect(call.fieldName).toBe("http");
        expect(call.reason.length).toBeGreaterThan(0);
      }
      expect(
        nonTransportMemberCalls.find((call) => call.memberName === "perform")?.reason,
      ).toContain("private/protected");
      expect(
        nonTransportMemberCalls.find((call) => call.memberName === "describeSelf")?.reason,
      ).toContain("não chama fetch nem delega");
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("chamada a membro que a declaração da classe não tem derruba a leitura com arquivo:linha", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.sendAnything({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      let thrown: unknown;
      try {
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toMatch(
        /evolution-client\.ts:\d+: chamada this\.http\.sendAnything\(\.\.\.\).*não é membro de topo da declaração de InternalHttpClient/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("a enumeração que §2 e §3 exigem sai do descobridor e é conferida sobre a árvore real (Goal044 / WU-03)", () => {
  it("a superfície do cliente HTTP interno sai enumerada: quem alcança fetch, quem não alcança, e o motivo escrito de cada um que fica fora", () => {
    const { internalClientSurfaces } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    expect(internalClientSurfaces).toHaveLength(1);
    const [surface] = internalClientSurfaces;

    // Não-vacuidade: a derivação achou ao menos um membro que alcança fetch.
    expect(surface.reachingMembers.length).toBeGreaterThan(0);
    // E os que ficam de fora não desaparecem: cada um traz motivo escrito.
    expect(surface.excludedMembers.length).toBeGreaterThan(0);
    for (const excluded of surface.excludedMembers) {
      expect(excluded.reason).toContain(`"${excluded.name}"`);
      expect(excluded.reason.length).toBeGreaterThan(20);
    }
    // Os dois conjuntos são disjuntos, e nenhum nome se repete.
    const excludedNames = surface.excludedMembers.map((member) => member.name);
    expect(surface.reachingMembers.filter((name) => excludedNames.includes(name))).toEqual([]);
    expect(new Set([...surface.reachingMembers, ...excludedNames]).size).toBe(
      surface.reachingMembers.length + excludedNames.length,
    );
    // Ao menos um membro alcança fetch e fica fora por ser private/protected:
    // é a diferença entre "alcança fetch" e "é chamável de fora".
    expect(surface.excludedMembers.some((member) => member.reason.includes("private/protected"))).toBe(
      true,
    );
    // A superfície derivada é exatamente o conjunto que a varredura usa para
    // reconhecer chamadas: toda chamada lida fora dela está enumerada.
    const { nonTransportMemberCalls, requests } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    for (const call of nonTransportMemberCalls) {
      expect(surface.reachingMembers).not.toContain(call.memberName);
      expect(excludedNames).toContain(call.memberName);
    }
    expect(requests.length).toBeGreaterThan(0);
  });

  it("a resolução de chamadores relata as duas árvores varridas, e o motivo escrito de notGoBound só afirma os números que o relatório traz", () => {
    const { callerResolutions, notGoBound } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    expect(callerResolutions.length).toBeGreaterThan(0);
    // Não-vacuidade: a resolução de chamadores produziu requisição de fato.
    expect(callerResolutions.reduce((total, report) => total + report.requestCount, 0)).toBeGreaterThan(
      0,
    );

    for (const report of callerResolutions) {
      // As duas árvores foram varridas atrás da ligação, e a lista de
      // arquivos varridos é reportada — não é uma afirmação sem lastro.
      expect(
        report.scannedFilePaths.some((filePath) => filePath.startsWith(aiOrchestratorSrcPath)),
      ).toBe(true);
      expect(report.scannedFilePaths.some((filePath) => filePath.startsWith(bffSrcPath))).toBe(true);
      expect(report.scannedFilePaths).toContain(report.siteFilePath);
      // Todo arquivo com chamador lido é um arquivo do conjunto varrido.
      for (const callerFilePath of report.callerFilePaths) {
        expect(report.scannedFilePaths).toContain(callerFilePath);
      }
      // Todo arquivo que importa a ligação foi varrido, e nenhum deles é o
      // próprio arquivo do sítio.
      for (const importingFilePath of report.importingFilePaths) {
        expect(report.scannedFilePaths).toContain(importingFilePath);
        expect(importingFilePath).not.toBe(report.siteFilePath);
      }
      expect(report.callerCount).toBeGreaterThanOrEqual(report.callerFilePaths.length);
      expect(["named", "default", "not_exported"]).toContain(report.exportForm);
    }

    // O motivo escrito de cada sítio contado fora repete exatamente os
    // números do relatório do mesmo sítio — nada afirmado além do lido.
    for (const counted of notGoBound.filter((site) =>
      site.category.startsWith("caller_resolved_base_url_via_"),
    )) {
      const report = callerResolutions.find(
        (candidate) =>
          candidate.siteFilePath === counted.filePath && candidate.siteLine === counted.line,
      );
      expect(report).toBeDefined();
      expect(counted.reason).toContain(
        `${report!.callerCount} chamador(es) lido(s) em ${report!.callerFilePaths.length} arquivo(s)`,
      );
      expect(counted.reason).toContain(
        `varrer ${report!.scannedFilePaths.length} arquivo(s) das duas árvores`,
      );
    }
  });
});

/* =========================================================================
 * Quatro controles negativos obrigatórios (Goal045 / WU-05): cada um sobre
 * árvore sintética montada e removida pelo próprio teste, nenhum tocando a
 * árvore real.
 * ========================================================================= */

describe("controle negativo 1 (Goal045 / WU-05) — classe homônima em outro arquivo: cada declaração é uma entrada distinta em internalClientSurfaces, nenhuma se funde na outra", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    "};",
    "",
  ].join("\n");

  /** Mesmo texto de classe nos dois arquivos: é a chave por declaração, não o nome, que os distingue. */
  const internalClient = [
    "export class InternalHttpClient {",
    "  constructor(private baseUrl: string) {}",
    "  async request(options: { method: string; path: string }) {",
    "    const url = new URL(options.path, this.baseUrl);",
    "    return fetch(url, { method: options.method });",
    "  }",
    "}",
    "",
  ].join("\n");

  const evolutionClient = [
    'import { InternalHttpClient } from "./internal-http-client.js";',
    "",
    "export class EvolutionClient {",
    "  private http: InternalHttpClient;",
    "  constructor() {",
    "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
    "  }",
    "  async createInstance() {",
    '    return this.http.request({ method: "POST", path: "/instance/create" });',
    "  }",
    "}",
    "",
  ].join("\n");

  it("antes: só a classe real existe, numa única declaração — uma entrada em internalClientSurfaces, uma requisição", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient,
      "clients/evolution-client.ts": evolutionClient,
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, internalClientSurfaces } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(internalClientSurfaces).toHaveLength(1);
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "POST", path: "/instance/create" }]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("depois: um segundo arquivo, sem relação alguma com o primeiro, declara uma classe do MESMO nome e também aponta ao serviço Go — as duas entram como entradas distintas em internalClientSurfaces, cada uma com sua própria requisição", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient,
      "clients/evolution-client.ts": evolutionClient,
      "scheduling/internal-http-client.ts": internalClient,
      "scheduling/scheduling-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class SchedulingClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createBooking() {",
        '    return this.http.request({ method: "POST", path: "/booking/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, internalClientSurfaces } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      // Duas declarações de "InternalHttpClient", em arquivos diferentes: a
      // chave é a declaração (arquivo + linha da classe), então as duas
      // entram, nunca uma pisando na outra.
      expect(internalClientSurfaces).toHaveLength(2);
      const declarationKeys = internalClientSurfaces.map(
        (surface) => `${surface.filePath}:${surface.classLine}`,
      );
      expect(new Set(declarationKeys).size).toBe(2);
      expect(
        internalClientSurfaces.every((surface) => surface.className === "InternalHttpClient"),
      ).toBe(true);

      expect(
        requests
          .map((request) => ({ method: request.method, path: request.pathExpression }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      ).toEqual([
        { method: "POST", path: "/booking/create" },
        { method: "POST", path: "/instance/create" },
      ]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("controle negativo 2 (Goal045 / WU-05) — instanciação sob alias `new <Alias>(` com a chave de base do serviço Go: a ligação por alias é resolvida até a declaração", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    "};",
    "",
  ].join("\n");

  const internalClient = [
    "export class InternalHttpClient {",
    "  constructor(private baseUrl: string) {}",
    "  async request(options: { method: string; path: string }) {",
    "    const url = new URL(options.path, this.baseUrl);",
    "    return fetch(url, { method: options.method });",
    "  }",
    "}",
    "",
  ].join("\n");

  it("antes: import sem alias — a instanciação sob o nome da própria declaração entra no conjunto alcançado", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, internalClientSurfaces } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "POST", path: "/instance/create" }]);
      const binding = internalClientSurfaces[0].instantiationBindings.find(
        (candidate) => candidate.localName === "InternalHttpClient" && candidate.form === "named_import",
      );
      expect(binding).toBeDefined();
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("depois: o mesmo arquivo passa a importar sob alias e a instanciar `new HttpAlias(...)` com a base do serviço Go — a ligação por alias é resolvida até a mesma declaração, e a rota entra igual", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient as HttpAlias } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: HttpAlias;",
        "  constructor() {",
        "    this.http = new HttpAlias(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, internalClientSurfaces } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(internalClientSurfaces).toHaveLength(1);
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "POST", path: "/instance/create" }]);
      // A ligação do alias foi de fato resolvida: aparece com o nome local
      // do alias e a forma "aliased_named_import", não com o nome da
      // declaração.
      const binding = internalClientSurfaces[0].instantiationBindings.find(
        (candidate) => candidate.localName === "HttpAlias",
      );
      expect(binding).toBeDefined();
      expect(binding!.form).toBe("aliased_named_import");
      expect(
        internalClientSurfaces[0].instantiationBindings.some(
          (candidate) => candidate.localName === "InternalHttpClient" && candidate.form === "named_import",
        ),
      ).toBe(false);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("controle negativo 3 (Goal045 / WU-05) — destino indireto: base recebida por parâmetro do construtor da classe dona", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    "};",
    "",
  ].join("\n");

  const internalClient = [
    "export class InternalHttpClient {",
    "  constructor(private baseUrl: string) {}",
    "  async request(options: { method: string; path: string }) {",
    "    const url = new URL(options.path, this.baseUrl);",
    "    return fetch(url, { method: options.method });",
    "  }",
    "}",
    "",
  ].join("\n");

  it("antes: a classe dona passa a base do serviço Go direto, sem indireção pelo próprio construtor — a rota entra no conjunto alcançado", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests } = discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "POST", path: "/instance/create" }]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("depois: a classe dona passa a receber a base como parâmetro do PRÓPRIO construtor e repassá-lo sem literal algum — a leitura derruba nomeando arquivo, linha e o texto do destino, em vez de classificar às cegas", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor(baseUrl: string) {",
        "    this.http = new InternalHttpClient(baseUrl);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() =>
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
      ).toThrowError(
        /evolution-client\.ts:\d+: instância de InternalHttpClient \(new InternalHttpClient\(, ligação named_import até .*internal-http-client\.ts:\d+\) tem destino "baseUrl" que não resolve a nenhuma chave de ambiente/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("controle negativo 4 (Goal045 / WU-05) — nome não decide: homônimo não relacionado em outro módulo não entra na superfície do transporte nem acrescenta rota, e mover/renomear a classe real não muda a classificação", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    "};",
    "",
  ].join("\n");

  it("um homônimo sem relação alguma com o transporte, instanciado com a base do serviço Go como argumento, não altera a superfície nem a contagem de requisições da classe real", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
      // Homônimo sem fetch algum: não é sítio de egresso, não é
      // "constructor_base_url_*", e não entra em discoverHttpEgressSites de
      // jeito nenhum. A trapaça é o nome igual e o argumento de instanciação
      // ser a mesma chave de base do serviço Go.
      "unrelated/logger.ts": [
        "export class InternalHttpClient {",
        "  constructor(private label: string) {}",
        "  describe() {",
        "    return `label:${this.label}`;",
        "  }",
        "}",
        "",
      ].join("\n"),
      "unrelated/caller.ts": [
        'import { InternalHttpClient as LoggerClient } from "./logger.js";',
        "",
        "export function makeLogger() {",
        "  return new LoggerClient(env.EVOLUTION_GO_BASE_URL);",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, internalClientSurfaces, nonGoBoundInstantiations } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      // Só a declaração real, apontada ao transporte, entra — o homônimo sem
      // fetch nunca é visto por esta descoberta.
      expect(internalClientSurfaces).toHaveLength(1);
      expect(internalClientSurfaces[0].filePath.replace(/\\/gu, "/")).toContain(
        "clients/internal-http-client.ts",
      );
      expect(
        requests.map((request) => ({ method: request.method, path: request.pathExpression })),
      ).toEqual([{ method: "POST", path: "/instance/create" }]);
      expect(nonGoBoundInstantiations).toEqual([]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("mover e renomear a classe real e a classe dona não muda a classificação: mesmo método, caminho e categoria, em arquivos, pastas e nomes diferentes", () => {
    const before = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const after = makeTempSourceTree({
      "config/env.ts": envSchema,
      "infra/transport-client.ts": [
        "export class TransportClient {",
        "  constructor(private baseUrl: string) {}",
        "  async dispatch(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "infra/thing-service.ts": [
        'import { TransportClient } from "./transport-client.js";',
        "",
        "export class ThingService {",
        "  private transport: TransportClient;",
        "  constructor() {",
        "    this.transport = new TransportClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.transport.dispatch({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const beforeRequests = discoverGoServiceHttpRequests(before, emptyTree, join(before, "config/env.ts"))
        .requests.map((request) => ({
          method: request.method,
          path: request.pathExpression,
          category: request.category,
        }));
      const afterRequests = discoverGoServiceHttpRequests(after, emptyTree, join(after, "config/env.ts"))
        .requests.map((request) => ({
          method: request.method,
          path: request.pathExpression,
          category: request.category,
        }));
      expect(beforeRequests).toEqual([
        { method: "POST", path: "/instance/create", category: "env_var_EVOLUTION_GO_BASE_URL" },
      ]);
      expect(afterRequests).toEqual(beforeRequests);
    } finally {
      rmSync(before, { recursive: true, force: true });
      rmSync(after, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

/**
 * Controles permanentes das correções da rodada 2 (Goal045 / FIX-001). Cada
 * um roda sobre árvore sintética em diretório temporário, removido ao fim, e
 * nunca toca as árvores reais. Os dois fecham borda que a rodada 1 tinha
 * deixado aberta em silêncio — não são reconhecimento novo.
 */
describe("Goal045 / FIX-001 — a construção `export` isenta a ligação, nunca o lado de valor dela", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    "};",
    "",
  ].join("\n");

  const internalClient = [
    "export class InternalHttpClient {",
    "  constructor(private baseUrl: string) {}",
    "  async request(options: { method: string; path: string }) {",
    "    const url = new URL(options.path, this.baseUrl);",
    "    return fetch(url, { method: options.method });",
    "  }",
    "}",
    "",
  ].join("\n");

  /** A mesma árvore em todos os casos, com `trailing` acrescentado ao fim do arquivo que instancia o cliente. */
  function discoverWithTrailingSource(trailing: string) {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": internalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        trailing,
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      return discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  }

  it("sem repasse, a instanciação sob ligação importada é lida e a rota entra — o controle não é vácuo", () => {
    const { requests } = discoverWithTrailingSource("");
    expect(
      requests.map((request) => ({ method: request.method, path: request.pathExpression })),
    ).toEqual([{ method: "POST", path: "/instance/create" }]);
  });

  it("`export const Forwarded = InternalHttpClient;` recusa: o lado DIREITO da construção `export` é posição de valor, não a ligação exportada", () => {
    expect(() => discoverWithTrailingSource("export const Forwarded = InternalHttpClient;")).toThrow(
      /class_binding_reference_forwarded_as_value/,
    );
  });

  it("`export class SubClient extends InternalHttpClient {}` recusa: herança de classe é posição de valor, e estar dentro de um `export` não a isenta", () => {
    expect(() =>
      discoverWithTrailingSource("export class SubClient extends InternalHttpClient {}"),
    ).toThrow(/class_binding_reference_forwarded_as_value/);
  });

  it("`export type ClientAlias = InternalHttpClient;` não recusa: o lado direito de um alias de TIPO é posição de tipo, não captura o construtor como valor", () => {
    const { requests } = discoverWithTrailingSource("export type ClientAlias = InternalHttpClient;");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("`export interface HasClient extends InternalHttpClient {}` não recusa: o `extends` de uma interface é posição de tipo, ao contrário do de uma classe", () => {
    const { requests } = discoverWithTrailingSource(
      "export interface HasClient extends InternalHttpClient {}",
    );
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });
});

describe("Goal045 / FIX-001 — `scannedFilePathsForInstantiation` enumera o que a varredura abriu, nunca o que ela deixaria de abrir", () => {
  const envSchema = [
    "export const env = {",
    '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
    "};",
    "",
  ].join("\n");

  it("classe declarada e não exportada: a varredura entre arquivos não roda, e o relatório enumera só o arquivo da declaração", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/local-client.ts": [
        // Sem `export`: `resolveModuleExportBindings` devolve zero ligação,
        // o laço que chama `findCrossFileCallerBindings` não executa, e
        // nenhum outro arquivo é aberto atrás de instanciação.
        "class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/unrelated-a.ts": "export const unrelatedA = 1;\n",
      "clients/unrelated-b.ts": "export const unrelatedB = 2;\n",
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { internalClientSurfaces } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(internalClientSurfaces).toHaveLength(1);
      // A árvore tem 4 arquivos TypeScript; afirmar os 4 seria relatar
      // varredura não exercida.
      expect(internalClientSurfaces[0].scannedFilePathsForInstantiation).toEqual([
        internalClientSurfaces[0].filePath,
      ]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("classe exportada e importada em outro arquivo: a varredura roda e enumera os arquivos que abriu, o da declaração entre eles, sem repetir caminho", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": envSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { internalClientSurfaces } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(internalClientSurfaces).toHaveLength(1);
      const scanned = internalClientSurfaces[0].scannedFilePathsForInstantiation;
      expect(scanned).toContain(internalClientSurfaces[0].filePath);
      expect(scanned.length).toBeGreaterThan(1);
      expect(new Set(scanned).size).toBe(scanned.length);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

/* =========================================================================
 * Cinco controles negativos obrigatórios (Goal046 / WU-04): cada um monta a
 * própria árvore sintética em diretório temporário e roda o descobridor real
 * sobre ela — nunca a árvore real —, removendo todo diretório no `finally`.
 * O alvo é a allowlist fechada de `exportConstructBindingRange` (WU-01) e a
 * divisão `{found, resolved}` de `findTopLevelAssignmentIndex` (WU-02): cada
 * controle exercita uma forma que cai fora da allowlist, uma cuja
 * profundidade textual não fecha, ou prova que forma já reconhecida continua
 * classificando igual.
 * ========================================================================= */

const wu04EnvSchema = [
  "export const env = {",
  '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
  "};",
  "",
].join("\n");

const wu04InternalClient = [
  "export class InternalHttpClient {",
  "  constructor(private baseUrl: string) {}",
  "  async request(options: { method: string; path: string }) {",
  "    const url = new URL(options.path, this.baseUrl);",
  "    return fetch(url, { method: options.method });",
  "  }",
  "}",
  "",
].join("\n");

/** Árvore com o cliente real e o arquivo CANDIDATO (quem importa e instancia), com `trailing` acrescentado ao fim do arquivo candidato — nunca ao da declaração. */
function discoverWithCandidateTrailing(trailing: string) {
  const tree = makeTempSourceTree({
    "config/env.ts": wu04EnvSchema,
    "clients/internal-http-client.ts": wu04InternalClient,
    "clients/evolution-client.ts": [
      'import { InternalHttpClient } from "./internal-http-client.js";',
      "",
      "export class EvolutionClient {",
      "  private http: InternalHttpClient;",
      "  constructor() {",
      "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
      "  }",
      "  async createInstance() {",
      '    return this.http.request({ method: "POST", path: "/instance/create" });',
      "  }",
      "}",
      trailing,
      "",
    ].join("\n"),
  });
  const emptyTree = makeTempSourceTree({});
  try {
    return discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
  } finally {
    rmSync(tree, { recursive: true, force: true });
    rmSync(emptyTree, { recursive: true, force: true });
  }
}

/** A mesma árvore, mas com `trailing` acrescentado ao arquivo da DECLARAÇÃO — nunca ao candidato. */
function discoverWithDeclarationTrailing(trailing: string) {
  const tree = makeTempSourceTree({
    "config/env.ts": wu04EnvSchema,
    "clients/internal-http-client.ts": [wu04InternalClient, trailing, ""].join("\n"),
    "clients/evolution-client.ts": [
      'import { InternalHttpClient } from "./internal-http-client.js";',
      "",
      "export class EvolutionClient {",
      "  private http: InternalHttpClient;",
      "  constructor() {",
      "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
      "  }",
      "  async createInstance() {",
      '    return this.http.request({ method: "POST", path: "/instance/create" });',
      "  }",
      "}",
      "",
    ].join("\n"),
  });
  const emptyTree = makeTempSourceTree({});
  try {
    return discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
  } finally {
    rmSync(tree, { recursive: true, force: true });
    rmSync(emptyTree, { recursive: true, force: true });
  }
}

describe("controle negativo 1 (Goal046 / WU-04) — `export default { Client: <Classe> };` no arquivo candidato: a allowlist fechada não reconhece a forma, e a ocorrência do nome dentro dela recusa pela categoria nova, com `arquivo:linha`", () => {
  it("antes: sem o objeto default, a instanciação sob ligação importada é lida e a rota entra — o controle não é vácuo", () => {
    const { requests } = discoverWithCandidateTrailing("");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export default { Client: InternalHttpClient };` no mesmo arquivo candidato recusa por `class_binding_export_construct_form_unrecognized` — a forma não é `export default <identificador>` e portanto cai fora da allowlist; a recusa por forma não reconhecida é conferida ANTES da heurística de posição de tipo, porque dentro de uma forma que a leitura não sabe recortar o dois-pontos de `Client: <valor>` separa chave de valor num literal de objeto, não anota tipo", () => {
    expect(() =>
      discoverWithCandidateTrailing("export default { Client: InternalHttpClient };"),
    ).toThrow(/class_binding_export_construct_form_unrecognized/);
  });

  it("depois: a recusa nomeia `arquivo:linha` da ocorrência — o arquivo candidato e a linha do `export default` acrescentado", () => {
    expect(() =>
      discoverWithCandidateTrailing("export default { Client: InternalHttpClient };"),
    ).toThrow(/evolution-client\.ts:12: "InternalHttpClient" aparece dentro de uma construção/);
  });
});

describe("controle negativo 2 (Goal046 / WU-04) — `export namespace N { export const C = <Classe>; }`: a allowlist fechada não reconhece `export namespace`, e a ocorrência dentro dele recusa pela categoria nova", () => {
  it("antes: sem o namespace, a instanciação sob ligação importada é lida e a rota entra — o controle não é vácuo", () => {
    const { requests } = discoverWithCandidateTrailing("");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export namespace N { export const C = InternalHttpClient; }` no arquivo candidato recusa — `export namespace` não está na allowlist, e o `export const` interno não isenta a ocorrência porque ela cai no lado de VALOR do `=`, dentro do range não reconhecido do namespace que o envolve", () => {
    expect(() =>
      discoverWithCandidateTrailing(
        "export namespace N { export const C = InternalHttpClient; }",
      ),
    ).toThrow(/class_binding_export_construct_form_unrecognized/);
  });
});

describe("controle negativo 3 (Goal046 / WU-04) — `export = <Classe>` no arquivo CANDIDATO recusa pela categoria nova da allowlist; a mesma forma no arquivo da DECLARAÇÃO continua recusando por `resolveModuleExportBindings`, categoria antiga", () => {
  it("antes: sem `export =` em lugar nenhum, a instanciação sob ligação importada é lida e a rota entra — o controle não é vácuo", () => {
    const { requests } = discoverWithCandidateTrailing("");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois, no arquivo CANDIDATO: `export = InternalHttpClient;` recusa por `class_binding_export_construct_form_unrecognized` — a allowlist fechada não reconhece `export =`, e a ocorrência do nome ali não cai em nenhuma isenção", () => {
    expect(() =>
      discoverWithCandidateTrailing("export = InternalHttpClient;"),
    ).toThrow(/class_binding_export_construct_form_unrecognized/);
  });

  it("depois, no arquivo da DECLARAÇÃO: `export = InternalHttpClient;` continua recusando por `class_binding_export_form_not_resolved` — esta forma nunca chega à allowlist de `exportConstructBindingRange`, porque `resolveModuleExportBindings` já derruba a leitura antes, e essa recusa mais antiga não muda de categoria", () => {
    expect(() =>
      discoverWithDeclarationTrailing("export = InternalHttpClient;"),
    ).toThrow(/class_binding_export_form_not_resolved/);
  });
});

describe("controle negativo 4 (Goal046 / WU-04) — `export const` que atribui e cuja profundidade textual não fecha: a busca pelo `=` de topo nunca resolve, e a forma fica não reconhecida", () => {
  it("antes: sem a construção de profundidade aberta, a instanciação sob ligação importada é lida e a rota entra — o controle não é vácuo", () => {
    const { requests } = discoverWithCandidateTrailing("");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export const Weird: Array<Foo = [InternalHttpClient];` recusa — o `<` de `Array<Foo` nunca fecha (não há `>` correspondente), `findTopLevelAssignmentIndex` termina com profundidade 1 e devolve `resolved: false`, e `exportConstructBindingRange` classifica a construção inteira como não reconhecida", () => {
    expect(() =>
      discoverWithCandidateTrailing("export const Weird: Array<Foo = [InternalHttpClient];"),
    ).toThrow(/class_binding_export_construct_form_unrecognized/);
  });
});

describe("controle negativo 5 (Goal046 / WU-04) — as formas `export` reais continuam com classificação idêntica à de antes da allowlist fechada: a allowlist não estreitou o que já funcionava", () => {
  it("antes: sem forma real acrescentada, a instanciação sob ligação importada é lida e a rota entra — o controle não é vácuo", () => {
    const { requests } = discoverWithCandidateTrailing("");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export function helper(x: InternalHttpClient) { ... }` no candidato não recusa — cabeçalho de função é a própria ligação exportada, isenta inteira", () => {
    const { requests } = discoverWithCandidateTrailing(
      "export function helper(x: InternalHttpClient) { return x; }",
    );
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export async function helperAsync(x: InternalHttpClient) { ... }` no candidato não recusa, pelo mesmo motivo do `export function`", () => {
    const { requests } = discoverWithCandidateTrailing(
      "export async function helperAsync(x: InternalHttpClient) { return x; }",
    );
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export interface HasClient extends InternalHttpClient {}` no candidato não recusa — `extends` de interface é posição de TIPO, ao contrário do `extends` de classe", () => {
    const { requests } = discoverWithCandidateTrailing(
      "export interface HasClient extends InternalHttpClient {}",
    );
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export type ClientAlias = InternalHttpClient;` no candidato não recusa — lado direito de alias de tipo é posição de TIPO, não captura o construtor como valor", () => {
    const { requests } = discoverWithCandidateTrailing(
      "export type ClientAlias = InternalHttpClient;",
    );
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export class SubClient extends InternalHttpClient {}` no candidato continua recusando por `class_binding_reference_forwarded_as_value` — herança de classe é posição de VALOR, e a allowlist fechada não muda essa categoria", () => {
    expect(() =>
      discoverWithCandidateTrailing("export class SubClient extends InternalHttpClient {}"),
    ).toThrow(/class_binding_reference_forwarded_as_value/);
  });

  it("depois: `export const Forwarded = InternalHttpClient;` no candidato continua recusando por `class_binding_reference_forwarded_as_value` — o lado DIREITO da atribuição é posição de VALOR, e a allowlist fechada não muda essa categoria", () => {
    expect(() =>
      discoverWithCandidateTrailing("export const Forwarded = InternalHttpClient;"),
    ).toThrow(/class_binding_reference_forwarded_as_value/);
  });

  it("depois: `export { InternalHttpClient };` no próprio arquivo da DECLARAÇÃO não recusa — a lista de export é a própria ligação exportada, isenta inteira, e a segunda ligação nomeada da mesma classe não amplia o alcance para nenhum arquivo novo", () => {
    const { requests } = discoverWithDeclarationTrailing("export { InternalHttpClient };");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });
});

describe("Goal046 / WU-04 — o conjunto de categorias de recusa é conferido contra o array em runtime, nunca contra união escrita à mão", () => {
  it("CLASS_BINDING_REFUSAL_CATEGORIES traz a categoria nova da allowlist fechada, e é exatamente o conjunto que os controles negativos desta rodada e das anteriores exercitam", () => {
    expect(CLASS_BINDING_REFUSAL_CATEGORIES).toEqual([
      "class_binding_homonymous_declarations",
      "class_binding_export_form_not_resolved",
      "class_binding_commonjs_export",
      "class_binding_cross_file_form_not_resolved",
      "class_binding_reference_forwarded_as_value",
      "class_binding_export_construct_form_unrecognized",
    ]);
    expect(CLASS_BINDING_REFUSAL_CATEGORIES).toContain(
      "class_binding_export_construct_form_unrecognized",
    );
  });
});

describe("Goal046 / WU-04 — a árvore real produz os números desta rodada, e as invariantes de reconhecimento não são vácuas", () => {
  it("1 superfície, 4 ligações resolvidas, 10 rotas, 2 instanciações fora do transporte, 0 chamadas de membro fora da superfície — os mesmos números da baseline do Goal045, exceto o de arquivos varridos pela resolução de instanciação: com o client do Prisma gerado nas duas árvores (`prisma generate`), elas somam hoje 205 arquivos .ts (118 em apps/ai-orchestrator/src, 87 em apps/bff/src) — o número computado pelo AST (205) prevalece sobre qualquer contagem anterior capturada antes de o client do Prisma do BFF existir na árvore", () => {
    const { requests, internalClientSurfaces, nonGoBoundInstantiations, nonTransportMemberCalls } =
      discoverGoServiceHttpRequests(aiOrchestratorSrcPath, bffSrcPath, envSchemaSourcePath);

    expect(internalClientSurfaces).toHaveLength(1);
    expect(internalClientSurfaces[0].instantiationBindings).toHaveLength(4);
    expect(internalClientSurfaces[0].scannedFilePathsForInstantiation).toHaveLength(205);
    expect(requests).toHaveLength(10);
    expect(nonGoBoundInstantiations).toHaveLength(2);
    expect(nonTransportMemberCalls).toHaveLength(0);
  });

  it("product-transport-routes.txt continua com as mesmas 10 rotas do conjunto que a árvore real alcança", () => {
    const routesFilePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../support/product-transport-routes.txt",
    );
    const routes = readProductTransportRoutesFile(routesFilePath);
    expect(routes).toHaveLength(10);
    const { requests } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    expect(requests).toHaveLength(routes.length);
  });

  it("não vácuo: a resolução por ligação reconheceu ao menos uma instanciação sobre a árvore real", () => {
    const { internalClientSurfaces } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const totalBindings = internalClientSurfaces.reduce(
      (total, surface) => total + surface.instantiationBindings.length,
      0,
    );
    expect(totalBindings).toBeGreaterThan(0);
  });

  it("não vácuo: ao menos uma construção `export` de forma reconhecida foi isenta sobre a árvore real — a declaração de InternalHttpClient sai por `export class`, forma que `exportConstructBindingRange` reconhece, e a leitura não recusa por causa dela", () => {
    const [surface] = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    ).internalClientSurfaces;
    const declarationSource = readFileSync(surface.filePath, "utf8");
    const declarationLine = declarationSource.split(/\r?\n/u)[surface.classLine - 1];
    expect(declarationLine).toMatch(/^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\b/);
  });
});

/* =========================================================================
 * Goal047 / WU-04 — afirmações permanentes: classificação exaustiva das
 * ocorrências do campo cliente (§1), campo provado versus forma não
 * resolvida (§2), simetria das duas saídas de `sourcesByPath` ausente (§3),
 * o controle próprio do critério 3 do Goal046 (§4, observação 1 do
 * review046), o conjunto de categorias de recusa em runtime (§5), e os
 * números da árvore real com as 41 ocorrências de `this.http.` classificadas
 * sem recusa (§6). Cada árvore sintética é montada e removida pelo próprio
 * teste; nenhuma toca a árvore real.
 * ========================================================================= */

const wu047EnvSchema = [
  "export const env = {",
  '  EVOLUTION_GO_BASE_URL: stringEnv("http://localhost:8080"),',
  "};",
  "",
].join("\n");

const wu047InternalClient = [
  "export class InternalHttpClient {",
  "  constructor(private baseUrl: string) {}",
  "  async request(options: { method: string; path: string }) {",
  "    const url = new URL(options.path, this.baseUrl);",
  "    return fetch(url, { method: options.method });",
  "  }",
  "  describeSelf() {",
  '    return "cliente";',
  "  }",
  "}",
  "",
].join("\n");

describe("Goal047 / WU-04 (§1) — toda ocorrência do campo cliente é classificada, nenhuma ignorada por não ser reconhecida", () => {
  it("this.http.request(...) vira rota e this.http.describeSelf(...) — que não alcança fetch — é contado fora com motivo, no mesmo resultado: as duas saídas coexistem, nenhuma ocorrência some", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "  async legacyDescribe() {",
        "    return this.http.describeSelf();",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, nonTransportMemberCalls } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
      expect(nonTransportMemberCalls.map((call) => call.memberName)).toEqual(["describeSelf"]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("this.http?.request(...) — encadeamento opcional — recusa pela categoria nova, com arquivo:linha e o trecho de contexto, em vez de a rota sumir sem recusa alguma", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http?.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() =>
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
      ).toThrow(
        /evolution-client\.ts:\d+:.*encadeamento opcional.*\[categoria: client_field_use_optional_chaining\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("Goal047 / WU-04 (§2) — o alvo da atribuição só vira campo provado nas duas formas reconhecidas; variável local recusa em vez de produzir campo que nunca será encontrado", () => {
  it("declaração de propriedade de classe com inicializador (`http = new InternalHttpClient(...)`, sem passar por construtor) prova campo da classe dona, e a chamada vira rota", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("instância guardada em variável local do construtor — nunca `this.<campo>` — recusa por instance_field_assignment_local_variable, com arquivo:linha, em vez de zero requisição e zero recusa", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  constructor() {",
        "    const http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() =>
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
      ).toThrow(
        /evolution-client\.ts:\d+:.*variável local.*\[categoria: instance_field_assignment_local_variable\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("Goal047 / WU-04 (§3) — as duas saídas de sourcesByPath ausente, no ramo da superfície e no ramo da instanciação, são a mesma: nenhuma pula em silêncio", () => {
  it("as duas recusas terminam com a mesma frase nomeada, e nenhum `continue` silencioso sobrevive no ramo da superfície nem no da instanciação", () => {
    const supportModulePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../support/http-egress-sites.ts",
    );
    const moduleSource = readFileSync(supportModulePath, "utf8");
    expect(moduleSource).toContain(
      'sítio "${site.category}" foi encontrado, mas o texto de ${site.filePath} não está entre os arquivos lidos',
    );
    expect(moduleSource).toContain(
      "a instanciação foi reconhecida pela ligação até ${classDeclarationKey}, mas o texto de ${filePath} não está entre os arquivos lidos",
    );
    expect(moduleSource).not.toMatch(/if \(source === undefined\) continue/u);
    expect(moduleSource).not.toMatch(/if \(candidateSource === undefined\) continue/u);
  });
});

describe("Goal047 / WU-04 (§4) — o critério 3 do Goal046 ganha controle próprio: construção `export` exótica que NÃO menciona a classe não recusa nada (observação 1 do review046)", () => {
  it("antes: sem construção `export` exótica alguma no candidato, a rota entra — o controle não é vácuo", () => {
    const { requests } = discoverWithCandidateTrailing("");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export namespace Unrelated { export const flag = 1; }` no candidato não menciona InternalHttpClient em lugar nenhum — a construção cai fora da allowlist, mas a recusa é escopada à OCORRÊNCIA do nome, e nenhuma ocorrência do nome está dentro dela; a classificação continua idêntica à de antes", () => {
    const { requests } = discoverWithCandidateTrailing(
      "export namespace Unrelated { export const flag = 1; }",
    );
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });
});

describe("Goal047 / WU-04 (§5) — as categorias de recusa deste caminho existem em runtime, conferidas por igualdade contra o array", () => {
  it("CLIENT_FIELD_USE_REFUSAL_CATEGORIES traz as doze categorias do uso do campo cliente — as sete da forma do uso e as cinco da forma do receptor —, na ordem declarada", () => {
    expect(CLIENT_FIELD_USE_REFUSAL_CATEGORIES).toEqual([
      "client_field_use_outside_top_level_method_body",
      "client_field_use_optional_chaining",
      "client_field_use_computed_member_access",
      "client_field_use_destructured",
      "client_field_use_member_not_invoked",
      "client_field_use_member_name_not_derivable",
      "client_field_use_field_forwarded_as_value",
      "client_field_use_receiver_optional_chaining",
      "client_field_use_receiver_computed_member_access",
      "client_field_use_receiver_destructured",
      "client_field_use_receiver_forwarded_as_value",
      "client_field_use_receiver_field_name_not_derivable",
    ]);
  });

  it("INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES traz as seis categorias do alvo da atribuição, na ordem declarada", () => {
    expect(INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES).toEqual([
      "instance_field_assignment_local_variable",
      "instance_field_assignment_destructured",
      "instance_field_assignment_foreign_object_property",
      "instance_field_assignment_array_element",
      "instance_field_assignment_returned_directly",
      "instance_field_assignment_form_not_recognized",
    ]);
  });
});

describe("Goal047 / WU-04 (§6) — a árvore real produz os números desta rodada, e as 41 ocorrências de this.http. são classificadas sem recusa alguma", () => {
  it("1 superfície, 4 ligações, 205 arquivos varridos, 10 rotas, 2 instanciações fora do transporte, 0 chamadas de membro fora da superfície — inalterados pelas correções deste Goal", () => {
    const { requests, internalClientSurfaces, nonGoBoundInstantiations, nonTransportMemberCalls } =
      discoverGoServiceHttpRequests(aiOrchestratorSrcPath, bffSrcPath, envSchemaSourcePath);

    expect(internalClientSurfaces).toHaveLength(1);
    expect(internalClientSurfaces[0].instantiationBindings).toHaveLength(4);
    expect(internalClientSurfaces[0].scannedFilePathsForInstantiation).toHaveLength(205);
    expect(requests).toHaveLength(10);
    expect(nonGoBoundInstantiations).toHaveLength(2);
    expect(nonTransportMemberCalls).toHaveLength(0);
  });

  it("as 41 ocorrências de this.http. em apps/bff/src/clients/ estão todas na forma direta this.http.<membro>(, sem exceção, e a leitura completa não lança recusa alguma sobre a árvore real", () => {
    const clientsRoot = join(bffSrcPath, "clients");
    const files = listTypeScriptSources(clientsRoot);
    let totalOccurrences = 0;
    let totalDirectCalls = 0;
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      totalOccurrences += (source.match(/\bthis\.http\./gu) ?? []).length;
      totalDirectCalls += (source.match(/\bthis\.http\.[A-Za-z_$][\w$]*\(/gu) ?? []).length;
    }
    expect(totalOccurrences).toBe(41);
    expect(totalDirectCalls).toBe(41);
    expect(() =>
      discoverGoServiceHttpRequests(aiOrchestratorSrcPath, bffSrcPath, envSchemaSourcePath),
    ).not.toThrow();
  });

  it("não vácuo: ao menos uma ocorrência do campo cliente é classificada como chamada de transporte, e a enumeração de this.http.<membro>( na árvore real não é vazia", () => {
    const { requests } = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    expect(requests.some((request) => request.reason.includes("this.http."))).toBe(true);
    const evolutionClientSource = readFileSync(
      join(bffSrcPath, "clients/evolution/index.ts"),
      "utf8",
    );
    expect(
      (evolutionClientSource.match(/\bthis\.http\.[A-Za-z_$][\w$]*\(/gu) ?? []).length,
    ).toBeGreaterThan(0);
  });
});

/* =========================================================================
 * Goal047 / WU-05 (§7) — controles negativos com as duas saídas. Os
 * controles 1 (encadeamento opcional), 4 (instância fora de campo de
 * classe) e 7 (herança do Goal046) já têm teste permanente dedicado no
 * bloco WU-04 acima (§1, §2 e §4, respectivamente) — cada um já registra
 * as duas saídas reais e não é duplicado aqui. Este bloco cobre os
 * controles 2 (acesso computado), 3 (alias local), 5 (ocorrência fora de
 * corpo de método de topo) e 6 (formas reais inalteradas), mais o controle
 * de renomeação exigido pelo objetivo desta WU. Cada árvore sintética é
 * criada e removida pelo próprio teste; nenhuma toca a árvore real.
 * ========================================================================= */

describe("Goal047 / WU-05 (§7, controle 2) — acesso computado: this.http[\"request\"](...) recusa em vez de a rota sumir sem recusa alguma", () => {
  it("antes: this.http.request(...) na forma direta entra em requests — o controle não é vácuo", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests } = discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it('depois: this.http["request"](...) — acesso computado — recusa pela categoria client_field_use_computed_member_access, com arquivo:linha, em vez de a rota sumir sem recusa alguma', () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http["request"]({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() =>
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
      ).toThrow(
        /evolution-client\.ts:\d+:.*acesso computado.*\[categoria: client_field_use_computed_member_access\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("Goal047 / WU-05 (§7, controle 3) — alias em variável local: const client = this.http; client.request(...) recusa porque a ocorrência this.http não está na forma de chamada", () => {
  it("antes: sem alias, a chamada direta this.http.request(...) entra em requests — o controle não é vácuo", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests } = discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("depois: const client = this.http; client.request(...) — a ocorrência this.http está em posição de valor, não de acesso a membro — recusa pela categoria client_field_use_field_forwarded_as_value, com arquivo:linha", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        "    const client = this.http;",
        '    return client.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() =>
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
      ).toThrow(
        /evolution-client\.ts:\d+:.*posição de valor.*\[categoria: client_field_use_field_forwarded_as_value\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("Goal047 / WU-05 (§7, controle 5) — ocorrência fora de corpo de método de topo: inicializador de campo que menciona this.http recusa em vez de ficar invisível", () => {
  it("antes: sem inicializador de campo mencionando this.http, a classificação da classe é só a chamada de transporte — o controle não é vácuo", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests } = discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
      expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("depois: `private probe = this.http;` como inicializador de campo — fora de todo corpo de método de topo — recusa pela categoria client_field_use_outside_top_level_method_body, com arquivo:linha, em vez de ficar invisível", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  private probe = this.http;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expect(() =>
        discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
      ).toThrow(
        /evolution-client\.ts:\d+:.*fora de todo corpo de método de topo.*\[categoria: client_field_use_outside_top_level_method_body\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("Goal047 / WU-05 (§7, controle 6) — as três formas reais continuam classificadas igual: chamada de transporte, chamada de membro fora da superfície, e montagem de URL sem chamar o cliente", () => {
  it("this.http.request(...) vira rota, this.http.describeSelf() é contado fora da superfície com motivo, e buildManualUrl() — que só monta valor a partir de env sem chamar this.http — vira assembledUrl nomeada; nenhuma das três recusa, exatamente como antes desta mudança", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "  async legacyDescribe() {",
        "    return this.http.describeSelf();",
        "  }",
        "  buildManualUrl() {",
        "    return `${env.EVOLUTION_GO_BASE_URL}/manual`;",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const { requests, nonTransportMemberCalls, assembledUrls } = discoverGoServiceHttpRequests(
        tree,
        emptyTree,
        join(tree, "config/env.ts"),
      );
      expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
      expect(nonTransportMemberCalls.map((call) => call.memberName)).toEqual(["describeSelf"]);
      // O construtor também referencia env.EVOLUTION_GO_BASE_URL (no próprio
      // `new InternalHttpClient(...)`) e não chama membro algum do campo, então
      // ele também vira assembledUrl — comportamento já existente da máquina,
      // não introduzido por este controle.
      expect(assembledUrls.map((url) => url.functionName)).toEqual(["constructor", "buildManualUrl"]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("Goal047 / WU-05 — controle de renomeação: nenhuma regra decide por nome de arquivo, pasta, classe, campo, cliente, método ou URL literal", () => {
  it("mover e renomear arquivo, pasta, classe, campo e método, e trocar a rota por outra: a classificação (1 rota, 0 chamada fora da superfície, 0 recusa) é idêntica, e a mesma ocorrência exótica recusa pela mesma categoria dos dois lados", () => {
    const before = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const after = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "infra/transport-client.ts": [
        "export class TransportClient {",
        "  constructor(private baseUrl: string) {}",
        "  async dispatch(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "infra/thing-service.ts": [
        'import { TransportClient } from "./transport-client.js";',
        "",
        "export class ThingService {",
        "  private goTransport: TransportClient;",
        "  constructor() {",
        "    this.goTransport = new TransportClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async triggerCreation() {",
        '    return this.goTransport.dispatch({ method: "POST", path: "/pair/setup" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const beforeResult = discoverGoServiceHttpRequests(before, emptyTree, join(before, "config/env.ts"));
      const afterResult = discoverGoServiceHttpRequests(after, emptyTree, join(after, "config/env.ts"));
      expect(beforeResult.requests).toHaveLength(1);
      expect(beforeResult.nonTransportMemberCalls).toHaveLength(0);
      expect(afterResult.requests).toHaveLength(1);
      expect(afterResult.nonTransportMemberCalls).toHaveLength(0);
      expect(afterResult.requests[0].pathExpression).toBe("/pair/setup");
      expect(afterResult.requests[0].method).toBe(beforeResult.requests[0].method);
    } finally {
      rmSync(before, { recursive: true, force: true });
      rmSync(after, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("a mesma ocorrência exótica — encadeamento opcional — recusa pela mesma categoria client_field_use_optional_chaining nos dois lados, ainda que arquivo, pasta, classe, campo, método e rota sejam todos diferentes", () => {
    const before = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  private http: InternalHttpClient;",
        "  constructor() {",
        "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async createInstance() {",
        '    return this.http?.request({ method: "POST", path: "/instance/create" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const after = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "infra/transport-client.ts": [
        "export class TransportClient {",
        "  constructor(private baseUrl: string) {}",
        "  async dispatch(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
      ].join("\n"),
      "infra/thing-service.ts": [
        'import { TransportClient } from "./transport-client.js";',
        "",
        "export class ThingService {",
        "  private goTransport: TransportClient;",
        "  constructor() {",
        "    this.goTransport = new TransportClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "  async triggerCreation() {",
        '    return this.goTransport?.dispatch({ method: "POST", path: "/pair/setup" });',
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    const categoryOf = (error: unknown): string | null =>
      /\[categoria: ([\w]+)\]/u.exec((error as Error).message)?.[1] ?? null;
    try {
      let beforeCategory: string | null = null;
      let afterCategory: string | null = null;
      try {
        discoverGoServiceHttpRequests(before, emptyTree, join(before, "config/env.ts"));
      } catch (error) {
        beforeCategory = categoryOf(error);
      }
      try {
        discoverGoServiceHttpRequests(after, emptyTree, join(after, "config/env.ts"));
      } catch (error) {
        afterCategory = categoryOf(error);
      }
      expect(beforeCategory).toBe("client_field_use_optional_chaining");
      expect(afterCategory).toBe("client_field_use_optional_chaining");
    } finally {
      rmSync(before, { recursive: true, force: true });
      rmSync(after, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

/**
 * Árvore sintética mínima em que `EvolutionClient` guarda o cliente HTTP
 * interno no campo `http` e os membros dados usam (ou deixam de usar) esse
 * campo. A árvore é criada e removida pela própria chamada; nenhuma toca a
 * árvore real. Só o corpo da classe muda entre um controle e outro, então a
 * saída de cada um é atribuível à forma da ocorrência, não à montagem.
 */
function discoverWithEvolutionClientMembers(
  memberLines: string[],
): ReturnType<typeof discoverGoServiceHttpRequests> {
  const tree = makeTempSourceTree({
    "config/env.ts": wu047EnvSchema,
    "clients/internal-http-client.ts": wu047InternalClient,
    "clients/evolution-client.ts": [
      'import { InternalHttpClient } from "./internal-http-client.js";',
      "",
      "export class EvolutionClient {",
      "  private http: InternalHttpClient;",
      "  constructor() {",
      "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
      "  }",
      ...memberLines,
      "}",
      "",
    ].join("\n"),
  });
  const emptyTree = makeTempSourceTree({});
  try {
    return discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts"));
  } finally {
    rmSync(tree, { recursive: true, force: true });
    rmSync(emptyTree, { recursive: true, force: true });
  }
}

/** Os membros de classe do caso normal: uma única chamada de transporte direta, sem forma exótica alguma. É a saída "antes" de cada controle abaixo. */
const wu047DirectTransportMembers = [
  "  async createInstance() {",
  '    return this.http.request({ method: "POST", path: "/instance/create" });',
  "  }",
];

describe("Goal047 / WU-05 (§7) — desestruturação do campo, membro não invocado e nome de membro não derivável recusam, cada um com as duas saídas", () => {
  it("antes: this.http.request(...) direto entra em requests, sem recusa alguma — os três controles abaixo não são vácuos", () => {
    const { requests, nonTransportMemberCalls } = discoverWithEvolutionClientMembers(
      wu047DirectTransportMembers,
    );
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    expect(nonTransportMemberCalls).toHaveLength(0);
  });

  it("depois: const { request } = this.http; request(...) — desestruturação do campo — recusa pela categoria client_field_use_destructured, com arquivo:linha, em vez de a rota sumir sem recusa alguma", () => {
    expect(() =>
      discoverWithEvolutionClientMembers([
        "  async createInstance() {",
        "    const { request } = this.http;",
        '    return request({ method: "POST", path: "/instance/create" });',
        "  }",
      ]),
    ).toThrow(
      /evolution-client\.ts:\d+:.*desestruturado.*\[categoria: client_field_use_destructured\]/u,
    );
  });

  it("depois: const send = this.http.request; send(...) — o membro é repassado como valor, sem invocação nesta ocorrência — recusa pela categoria client_field_use_member_not_invoked, com arquivo:linha", () => {
    expect(() =>
      discoverWithEvolutionClientMembers([
        "  async createInstance() {",
        "    const send = this.http.request;",
        '    return send({ method: "POST", path: "/instance/create" });',
        "  }",
      ]),
    ).toThrow(
      /evolution-client\.ts:\d+:.*não é invocado.*\[categoria: client_field_use_member_not_invoked\]/u,
    );
  });

  it("depois: this.http.#send(...) — depois do ponto não há identificador de membro derivável — recusa pela categoria client_field_use_member_name_not_derivable, com arquivo:linha", () => {
    expect(() =>
      discoverWithEvolutionClientMembers([
        "  async createInstance() {",
        '    return this.http.#send({ method: "POST", path: "/instance/create" });',
        "  }",
      ]),
    ).toThrow(
      /evolution-client\.ts:\d+:.*sem nome de membro derivável.*\[categoria: client_field_use_member_name_not_derivable\]/u,
    );
  });
});

describe("Goal047 / WU-05 (§7) — quando o receptor não é o texto literal `this.`, a ocorrência do campo recusa em vez de ficar invisível", () => {
  it("antes: com o receptor na forma literal this.http, a chamada entra em requests — os cinco controles de receptor abaixo não são vácuos", () => {
    const { requests } = discoverWithEvolutionClientMembers(wu047DirectTransportMembers);
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: this?.http.request(...) — encadeamento opcional no RECEPTOR, e o texto this.http nunca aparece — recusa pela categoria client_field_use_receiver_optional_chaining, com arquivo:linha", () => {
    expect(() =>
      discoverWithEvolutionClientMembers([
        "  async createInstance() {",
        '    return this?.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
      ]),
    ).toThrow(
      /evolution-client\.ts:\d+:.*encadeamento opcional está no receptor.*\[categoria: client_field_use_receiver_optional_chaining\]/u,
    );
  });

  it('depois: this["http"].request(...) — acesso computado sobre o RECEPTOR — recusa pela categoria client_field_use_receiver_computed_member_access, com arquivo:linha', () => {
    expect(() =>
      discoverWithEvolutionClientMembers([
        "  async createInstance() {",
        '    return this["http"].request({ method: "POST", path: "/instance/create" });',
        "  }",
      ]),
    ).toThrow(
      /evolution-client\.ts:\d+:.*índice computado.*\[categoria: client_field_use_receiver_computed_member_access\]/u,
    );
  });

  it("depois: const { http } = this; http.request(...) — o próprio this é desestruturado — recusa pela categoria client_field_use_receiver_destructured, com arquivo:linha", () => {
    expect(() =>
      discoverWithEvolutionClientMembers([
        "  async createInstance() {",
        "    const { http } = this;",
        '    return http.request({ method: "POST", path: "/instance/create" });',
        "  }",
      ]),
    ).toThrow(
      /evolution-client\.ts:\d+:.*this é desestruturado.*\[categoria: client_field_use_receiver_destructured\]/u,
    );
  });

  it("depois: const self = this; self.http.request(...) — a instância inteira escapa por alias — recusa pela categoria client_field_use_receiver_forwarded_as_value, com arquivo:linha", () => {
    expect(() =>
      discoverWithEvolutionClientMembers([
        "  async createInstance() {",
        "    const self = this;",
        '    return self.http.request({ method: "POST", path: "/instance/create" });',
        "  }",
      ]),
    ).toThrow(
      /evolution-client\.ts:\d+:.*posição de valor.*\[categoria: client_field_use_receiver_forwarded_as_value\]/u,
    );
  });

  it("depois: this.#transport.request(...) — depois do ponto sobre this não há nome de campo derivável, e a leitura não decide se o receptor alcança http — recusa pela categoria client_field_use_receiver_field_name_not_derivable, com arquivo:linha", () => {
    expect(() =>
      discoverWithEvolutionClientMembers([
        "  async createInstance() {",
        '    return this.#transport.request({ method: "POST", path: "/instance/create" });',
        "  }",
      ]),
    ).toThrow(
      /evolution-client\.ts:\d+:.*sem nome de campo derivável.*\[categoria: client_field_use_receiver_field_name_not_derivable\]/u,
    );
  });

  it("escopo da recusa: ocorrência de this.<outro campo> na mesma classe — inclusive em método que nunca toca o cliente — não recusa e não conta, e a rota continua saindo igual", () => {
    const { requests, nonTransportMemberCalls } = discoverWithEvolutionClientMembers([
      "  private label = \"evolution\";",
      "  describeLabel() {",
      "    return this.label.trim();",
      "  }",
      ...wu047DirectTransportMembers,
    ]);
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    expect(nonTransportMemberCalls).toHaveLength(0);
  });
});

describe("Goal047 / WU-05 (§7) — ocorrência dentro de interpolação de template literal é código, e é lida como tal; texto de template continua sendo texto", () => {
  it("depois: `${this.http.request(...)}` dentro de template literal entra em requests como chamada de transporte, em vez de ficar invisível atrás da máscara de aspas", () => {
    const { requests, nonTransportMemberCalls } = discoverWithEvolutionClientMembers([
      "  async createInstance() {",
      '    return `${await this.http.request({ method: "POST", path: "/instance/create" })}`;',
      "  }",
    ]);
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    expect(nonTransportMemberCalls).toHaveLength(0);
  });

  it("depois: `${this.http?.request(...)}` dentro de template literal recusa pela categoria client_field_use_optional_chaining, com arquivo:linha — a interpolação não isenta forma exótica", () => {
    expect(() =>
      discoverWithEvolutionClientMembers([
        "  async createInstance() {",
        '    return `${await this.http?.request({ method: "POST", path: "/instance/create" })}`;',
        "  }",
      ]),
    ).toThrow(
      /evolution-client\.ts:\d+:.*encadeamento opcional.*\[categoria: client_field_use_optional_chaining\]/u,
    );
  });

  it("escopo: o mesmo texto `this.http.send(` escrito como TEXTO de template, fora de toda interpolação, não conta e não recusa — a rota real continua saindo sozinha", () => {
    const { requests, nonTransportMemberCalls } = discoverWithEvolutionClientMembers([
      "  describeUsage() {",
      "    return `chame this.http.send( para enviar`;",
      "  }",
      ...wu047DirectTransportMembers,
    ]);
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    expect(nonTransportMemberCalls).toHaveLength(0);
  });

  it("escopo: `${this.http.send(...)}` escrito dentro de STRING COMUM não é interpolação — continua texto, não conta e não recusa; só crase abre interpolação", () => {
    const { requests, nonTransportMemberCalls } = discoverWithEvolutionClientMembers([
      "  describeUsage() {",
      '    return "escreva ${this.http.send(payload)} no template";',
      "  }",
      ...wu047DirectTransportMembers,
    ]);
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    expect(nonTransportMemberCalls).toHaveLength(0);
  });

  it("escopo: string comum DENTRO de uma interpolação continua sendo texto — o texto `this.http.send(` dentro dela não conta e não recusa, e a chamada real da mesma interpolação sai como requisição", () => {
    const { requests, nonTransportMemberCalls } = discoverWithEvolutionClientMembers([
      "  async createInstance() {",
      '    return `${await this.http.request({ method: "POST", path: "/instance/create", note: "chame this.http.send(" })}`;',
      "  }",
    ]);
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
    expect(nonTransportMemberCalls).toHaveLength(0);
  });
});
