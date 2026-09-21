import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import {
  AssistantService,
  PRODUCT_OWN_TEXTS,
} from "../../src/modules/assistant/assistant.service.js";
import { buildStyleGreeting } from "../../src/modules/prompts/style.js";
import { derivePromptVersion } from "../../src/modules/prompts/system.js";
import { AI_CONVERSATION_STYLES } from "../../src/modules/tenant-config/ai-settings.js";
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
