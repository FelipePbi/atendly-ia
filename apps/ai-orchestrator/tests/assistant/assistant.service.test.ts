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
  computeBoundaryValueCrossing,
  discoverGoServiceHttpRequests,
  discoverHttpEgressSites,
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
