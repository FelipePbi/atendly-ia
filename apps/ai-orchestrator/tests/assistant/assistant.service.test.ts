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
  type ClassBindingRefusalCategory,
  CLIENT_FIELD_USE_REFUSAL_CATEGORIES,
  type ClientFieldUseRefusalCategory,
  computeBoundaryValueCrossing,
  discoverGoServiceHttpRequests,
  discoverHttpEgressSites,
  type GoServiceHttpRequestDiscovery,
  type HttpEgressDiscovery,
  type HttpEgressSiteCategory,
  type HttpEgressSiteOrigin,
  INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES,
  type InstanceFieldAssignmentRefusalCategory,
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

const observedRefusalCategories = new Set<string>();

type DeclaredRefusalCategory =
  | InstanceFieldAssignmentRefusalCategory
  | ClassBindingRefusalCategory
  | ClientFieldUseRefusalCategory;

const ALL_REFUSAL_CATEGORIES: ReadonlySet<string> = new Set<string>([
  ...INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES,
  ...CLASS_BINDING_REFUSAL_CATEGORIES,
  ...CLIENT_FIELD_USE_REFUSAL_CATEGORIES,
]);

/** Marcador para o único caso legítimo em que a recusa observada não credita categoria: ela nasce fora das quatro fábricas de `http-egress-sites.ts` e portanto não traz `[categoria: ...]`. */
const NO_REFUSAL_CATEGORY = Symbol("expectRefusal: recusa sem categoria a creditar");

function expectRefusal(
  action: () => unknown,
  category: DeclaredRefusalCategory | typeof NO_REFUSAL_CATEGORY,
  matcher: RegExp,
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  const message = (thrown as Error).message;
  expect(message).toMatch(matcher);
  if (category === NO_REFUSAL_CATEGORY) {
    return;
  }
  if (!ALL_REFUSAL_CATEGORIES.has(category)) {
    throw new Error(
      `expectRefusal: categoria declarada "${category}" não pertence a INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES, CLASS_BINDING_REFUSAL_CATEGORIES nem CLIENT_FIELD_USE_REFUSAL_CATEGORIES.`,
    );
  }
  const observed = /\[categoria: ([\w]+)\]/u.exec(message)?.[1];
  if (!observed) {
    throw new Error(
      `expectRefusal: controle declarou a categoria "${category}", mas a mensagem lançada não traz o marcador [categoria: ...]. Mensagem: ${message}`,
    );
  }
  if (observed !== category) {
    throw new Error(
      `expectRefusal: controle declarou a categoria "${category}", mas a mensagem lançada traz "${observed}".`,
    );
  }
  observedRefusalCategories.add(observed);
}

/**
 * Controles negativos da amarra de categoria de `expectRefusal` (Goal049 /
 * WU-03): as três saídas do guard nas linhas acima (§1 do escopo do Goal).
 * Cada `it` chama `expectRefusal` dentro de `expect(...).toThrow(...)`,
 * porque a chamada que o guard reprova É o comportamento sob teste, não um
 * erro de montagem do controle. Confirmado por controle temporário, rodado
 * e desfeito nesta Work Unit (ver relatório do Developer): com o guard
 * revertido para a forma anterior ao Goal049 (sem comparar `category` ao
 * marcador observado), as três reprovam por falta de `toThrow` — nenhuma é
 * vácua.
 */
describe("Goal049 / WU-03 — a amarra de categoria de expectRefusal reprova nos três jeitos em que uma declaração pode divergir da recusa real", () => {
  it("controle cuja categoria declarada não é a observada: expectRefusal reprova nomeando as duas", () => {
    expect(() =>
      expectRefusal(
        () =>
          discoverWithEvolutionClientMembers([
            "  async createInstance() {",
            "    const { request } = this.http;",
            '    return request({ method: "POST", path: "/instance/create" });',
            "  }",
          ]),
        "client_field_use_member_not_invoked",
        /evolution-client\.ts:\d+:.*desestruturado.*\[categoria: client_field_use_destructured\]/u,
      ),
    ).toThrow(
      /controle declarou a categoria "client_field_use_member_not_invoked".*mensagem lançada traz "client_field_use_destructured"/u,
    );
  });

  it("controle sobre recusa sem o marcador [categoria: ...]: expectRefusal reprova, em vez de creditar categoria nenhuma em silêncio", () => {
    expect(() =>
      expectRefusal(
        () => {
          throw new Error("mensagem de erro manual, sem marcador de categoria nenhum");
        },
        "client_field_use_destructured",
        /mensagem de erro manual, sem marcador de categoria nenhum/,
      ),
    ).toThrow(
      /controle declarou a categoria "client_field_use_destructured", mas a mensagem lançada não traz o marcador/u,
    );
  });

  it("categoria declarada que não pertence a nenhum dos três arrays: expectRefusal reprova antes de checar a mensagem observada", () => {
    expect(() =>
      expectRefusal(
        () =>
          discoverWithEvolutionClientMembers([
            "  async createInstance() {",
            "    const { request } = this.http;",
            '    return request({ method: "POST", path: "/instance/create" });',
            "  }",
          ]),
        "categoria_nao_declarada_em_nenhum_array" as unknown as DeclaredRefusalCategory,
        /evolution-client\.ts:\d+:.*desestruturado.*\[categoria: client_field_use_destructured\]/u,
      ),
    ).toThrow(
      /categoria declarada "categoria_nao_declarada_em_nenhum_array" não pertence a INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES, CLASS_BINDING_REFUSAL_CATEGORIES nem CLIENT_FIELD_USE_REFUSAL_CATEGORIES/u,
    );
  });
});

/**
 * Goal050 / WU-03 — o único sítio de uso de `NO_REFUSAL_CATEGORY`: a recusa
 * de `classifySite` quando nenhuma das formas reconhecidas resolve destino
 * (`http-egress-sites.ts:904`), a mesma que os controles de
 * `discoverHttpEgressSites(...).toThrowError(/sítio de egresso HTTP sem
 * categoria/)` já cobrem fora de `expectRefusal`. Ela nasce antes de
 * qualquer categoria ser atribuída, então nunca carrega `[categoria: ...]`
 * — passar por `expectRefusal` sem o marcador é o comportamento correto,
 * não uma omissão a reprovar.
 */
describe("Goal050 / WU-03 — a recusa legitimamente sem categoria exerce o ramo NO_REFUSAL_CATEGORY de expectRefusal", () => {
  it("sítio de fetch cujo destino não resolve por env, campo de instância nem parâmetro de chamador: expectRefusal aceita NO_REFUSAL_CATEGORY sem exigir o marcador [categoria: ...]", () => {
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
      expectRefusal(
        () => discoverHttpEgressSites(tree, emptyTree),
        NO_REFUSAL_CATEGORY,
        /caller\.ts:2: sítio de egresso HTTP sem categoria/,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

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

/**
 * Baldes de saída de `discoverGoServiceHttpRequests` — os cinco, nomeados.
 * A partição liga sítio e balde pelo campo `originSite`, nunca pela prosa do
 * motivo: motivo é texto para quem lê, campo é ligação para quem computa.
 */
const EGRESS_PARTITION_BUCKETS = [
  "requests",
  "notGoBound",
  "assembledUrls",
  "nonTransportMemberCalls",
  "nonGoBoundInstantiations",
] as const;

type EgressPartitionBucket = (typeof EGRESS_PARTITION_BUCKETS)[number];

/** O mínimo que a partição lê de uma entrada de balde: onde ela está e de que sítio ela nasceu. */
interface EgressPartitionEntry {
  filePath: string;
  line: number;
  originSite: HttpEgressSiteOrigin;
  reason: string;
}

const egressPositionKey = (place: { filePath: string; line: number }): string =>
  `${place.filePath}:${place.line}`;

/**
 * Encaminhamento por categoria, com as duas mãos declaradas separadamente
 * (Goal051 / WU-01). O que antes era um conjunto só — e obrigava a exceção de
 * `constructor_base_url_*` a viver em prosa de documento — passa a ser
 * estrutura que o código declara:
 *
 * - `ownOutput`: os baldes em que o **próprio sítio** pode aparecer, isto é,
 *   aqueles em que a entrada ocupa a mesma `arquivo:linha` do sítio. É sobre
 *   este conjunto, e só sobre ele, que continua valendo "exatamente um balde".
 * - `derivedOutput`: os baldes em que podem aparecer entradas **geradas a
 *   partir** do sítio — por instanciação do cliente, por resolução de
 *   chamador ou por montagem de URL —, que declaram o sítio em `originSite`
 *   mas ficam em outra posição.
 *
 * As categorias de `fetch` cru resolvem o destino no próprio sítio: ou ele
 * vira requisição ao serviço Go, ou é contado fora com motivo. Para elas as
 * duas mãos coincidem, porque a entrada derivada (o `fetch` de um chamador
 * que resolve a base) continua sendo requisição ou registro de adiamento. Já
 * `constructor_base_url_*` não resolve destino nenhum sozinho — a URL vem de
 * um parâmetro de construtor —, então a saída *própria* do sítio é só o
 * registro de adiamento em `notGoBound`, com o motivo que manda ler a
 * varredura de instanciação; as entradas que aquela varredura produz são
 * saídas de cada *instanciação* do cliente, e por isso aparecem na mão
 * derivada.
 *
 * Categoria que a partição não sabe encaminhar devolve `null` e reprova —
 * nunca há ramo `else` mudo.
 */
interface EgressPartitionCategoryRouting {
  readonly ownOutput: readonly EgressPartitionBucket[];
  readonly derivedOutput: readonly EgressPartitionBucket[];
}

function egressPartitionBucketsForCategory(
  category: HttpEgressSiteCategory,
): EgressPartitionCategoryRouting | null {
  if (
    category.startsWith("env_var_") ||
    category.startsWith("env_vars_") ||
    category === "product_prose_to_client_number" ||
    category.startsWith("caller_resolved_base_url_via_") ||
    category.startsWith("generic_egress_destination_decided_by_caller_")
  ) {
    return {
      ownOutput: ["requests", "notGoBound"],
      derivedOutput: ["requests", "notGoBound"],
    };
  }
  if (category.startsWith("constructor_base_url_")) {
    return {
      ownOutput: ["notGoBound"],
      derivedOutput: [
        "requests",
        "assembledUrls",
        "nonGoBoundInstantiations",
        "nonTransportMemberCalls",
      ],
    };
  }
  return null;
}

/**
 * O universo de candidatos da partição, declarado. Cada coleção de
 * `HttpEgressDiscovery` entra na partição ou fica de fora com o motivo
 * escrito — ficar de fora em silêncio é exatamente o defeito que a partição
 * existe para remover. A declaração é fail-closed: coleção nova no
 * descobridor, ainda não declarada aqui, reprova.
 */
const EGRESS_CANDIDATE_UNIVERSE: readonly {
  collection: keyof HttpEgressDiscovery;
  inPartition: boolean;
  reason: string;
}[] = [
  {
    collection: "sites",
    inPartition: true,
    reason:
      "é o universo particionado: todo sítio de egresso classificado é candidato a virar requisição ao serviço Go",
  },
  {
    collection: "excluded",
    inPartition: false,
    reason:
      "não é sítio de egresso: é ocorrência textual de `fetch(` descartada antes da classificação por ser chamada de membro, e por isso não é candidata a virar requisição; a partição cobra que nenhuma delas coincida com um sítio lido, para que a exclusão não esconda sítio",
  },
  {
    collection: "genericEgressCallers",
    inPartition: false,
    reason:
      "é chamador de um primitivo genérico, não um `fetch` próprio: é insumo da resolução de destino do primitivo, cujo sítio já está em `sites`; hoje a árvore não tem nenhum, e a partição cobra essa vacuidade de forma fail-closed, para que o primeiro chamador a aparecer obrigue a rever esta declaração em vez de passar em silêncio",
  },
  {
    collection: "genericEgressCallersByPrimitive",
    inPartition: false,
    reason:
      "é reagrupamento de `genericEgressCallers` por primitivo, sem elemento novo; a partição cobra que todo chamador agrupado exista na coleção de origem",
  },
  {
    collection: "genericEgressPrimitives",
    inPartition: true,
    reason:
      "entra pela coleção `sites`: a declaração de cada primitivo genérico é ela própria um sítio classificado na categoria de destino decidido pelo chamador, e a partição cobra essa correspondência posição a posição",
  },
];

/**
 * O universo de saída de `discoverGoServiceHttpRequests`, declarado no
 * precedente exato de `EGRESS_CANDIDATE_UNIVERSE` acima (Goal051 / WU-02).
 * Cada chave de `GoServiceHttpRequestDiscovery` entra na partição de baldes
 * de destino de sítio — e por isso tem de coincidir com
 * `EGRESS_PARTITION_BUCKETS` — ou fica de fora com o motivo escrito. Chave
 * nova que o descobridor devolva e esta declaração não nomeie reprova; chave
 * nomeada aqui que o descobridor deixe de devolver reprova como declaração
 * obsoleta. `internalClientSurfaces` e `callerResolutions` ficam fora: são
 * relatórios do que a resolução leu, não coleções de entradas com
 * `originSite` próprio.
 */
const GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE: readonly {
  collection: keyof GoServiceHttpRequestDiscovery;
  inPartition: boolean;
  reason: string;
}[] = [
  {
    collection: "requests",
    inPartition: true,
    reason:
      "balde de destino de sítio: requisição do conjunto alcançado pelo serviço Go, entrada de EGRESS_PARTITION_BUCKETS",
  },
  {
    collection: "notGoBound",
    inPartition: true,
    reason:
      "balde de destino de sítio: sítio lido e contado fora do conjunto alcançado, com motivo escrito, entrada de EGRESS_PARTITION_BUCKETS",
  },
  {
    collection: "assembledUrls",
    inPartition: true,
    reason:
      "balde de destino de sítio: URL montada a partir do sítio, saída derivada, entrada de EGRESS_PARTITION_BUCKETS",
  },
  {
    collection: "nonTransportMemberCalls",
    inPartition: true,
    reason:
      "balde de destino de sítio: chamada de membro fora da superfície de um cliente apontado ao serviço Go, entrada de EGRESS_PARTITION_BUCKETS",
  },
  {
    collection: "nonGoBoundInstantiations",
    inPartition: true,
    reason:
      "balde de destino de sítio: instanciação de cliente cujo destino resolve a uma chave que não é do serviço Go, saída derivada, entrada de EGRESS_PARTITION_BUCKETS",
  },
  {
    collection: "internalClientSurfaces",
    inPartition: false,
    reason:
      "não é balde de destino de sítio: é o relatório da superfície de cada cliente HTTP interno — os membros de fora e o motivo de cada um —, não uma coleção de entradas com originSite próprio",
  },
  {
    collection: "callerResolutions",
    inPartition: false,
    reason:
      "não é balde de destino de sítio: é o relatório do que a resolução de chamadores leu por sítio resolvido no chamador, não uma coleção de entradas de destino com origem própria",
  },
];

interface DiscoveryUniverseFindings {
  readonly undeclared: string[];
  readonly obsolete: string[];
  readonly emptyReason: string[];
  readonly partitionMismatch: string[];
}

/**
 * A mesma conta que o teste permanente do universo de saída (`:3253` abaixo)
 * roda sobre `Object.keys(discovery)` da execução real — ambos chamam esta
 * função, nunca a reimplementam à parte. Os controles negativos 3 e 4 do §8
 * (Goal051 / WU-04) a chamam sobre um conjunto de chaves corrompido (chave
 * acrescentada ao objeto devolvido pela leitura, chave declarada que some) e
 * conferem que a mesma conta reprova, nomeando a chave.
 */
function findDiscoveryUniverseFindings(
  discoveredKeys: readonly string[],
): DiscoveryUniverseFindings {
  const declaredCollections = GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE.map(
    (entry) => entry.collection as string,
  );
  const declared = new Set(declaredCollections);
  const discovered = new Set(discoveredKeys);

  // Chave nova que o descobridor devolva e a declaração não nomeie reprova.
  const undeclared = [...discovered].filter((key) => !declared.has(key)).sort();
  // Chave nomeada aqui que o descobridor deixe de devolver reprova como
  // declaração obsoleta — o mesmo fail-closed nos dois sentidos de
  // EGRESS_CANDIDATE_UNIVERSE.
  const obsolete = declaredCollections.filter((key) => !discovered.has(key)).sort();
  // Coleção declarada sem motivo escrito não conta como declarada: ficar de
  // fora em silêncio é o defeito que a declaração existe para remover.
  const emptyReason = GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE.filter(
    (entry) => entry.reason.trim().length === 0,
  ).map((entry) => entry.collection as string);

  // As duas declarações não podem divergir: dentro-da-partição aqui é
  // exatamente o conjunto nomeado por EGRESS_PARTITION_BUCKETS.
  const declaredInPartition = GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE.filter(
    (entry) => entry.inPartition,
  ).map((entry) => entry.collection as string);
  const inPartitionSet = new Set(declaredInPartition);
  const partitionMismatch = [
    ...EGRESS_PARTITION_BUCKETS.filter((bucket) => !inPartitionSet.has(bucket)).map(
      (bucket) =>
        `balde ${bucket} de EGRESS_PARTITION_BUCKETS sem declaração inPartition no universo de saída`,
    ),
    ...declaredInPartition
      .filter(
        (collection) =>
          !(EGRESS_PARTITION_BUCKETS as readonly string[]).includes(collection),
      )
      .map(
        (collection) =>
          `coleção ${collection} declarada dentro da partição sem ser balde de EGRESS_PARTITION_BUCKETS`,
      ),
  ];

  return { undeclared, obsolete, emptyReason, partitionMismatch };
}

describe("o universo de saída de discoverGoServiceHttpRequests é declarado, fail-closed (Goal051 / WU-02)", () => {
  it("cada chave de GoServiceHttpRequestDiscovery está declarada, com motivo não vazio, e a declaração não diverge da execução real nem de EGRESS_PARTITION_BUCKETS", () => {
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    const discoveredKeys = Object.keys(discovery).sort();

    // Fail-closed nos dois sentidos: chave nova no descobridor reprova;
    // chave declarada aqui que o descobridor deixe de devolver reprova. A
    // conta é a mesma que os controles 3 e 4 do §8 (Goal051 / WU-04,
    // `:8173` abaixo) chamam sobre um conjunto de chaves corrompido — nunca
    // uma segunda implementação à parte.
    const findings = findDiscoveryUniverseFindings(discoveredKeys);
    expect(findings.undeclared).toEqual([]);
    expect(findings.obsolete).toEqual([]);
    expect(findings.emptyReason).toEqual([]);

    // Contagem por execução, não copiada de plano nenhum: divergência em
    // relação às 7 chaves conhecidas nesta baseline é achado, não suposição.
    expect(discoveredKeys).toEqual([
      "assembledUrls",
      "callerResolutions",
      "internalClientSurfaces",
      "nonGoBoundInstantiations",
      "nonTransportMemberCalls",
      "notGoBound",
      "requests",
    ]);

    // As duas declarações não podem divergir: dentro-da-partição aqui é
    // exatamente o conjunto nomeado por EGRESS_PARTITION_BUCKETS, conferido
    // nos dois sentidos pela mesma conta.
    expect(findings.partitionMismatch).toEqual([]);

    // internalClientSurfaces e callerResolutions estão fora, com motivo.
    const outOfPartition = GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE.filter(
      (entry) => !entry.inPartition,
    );
    expect(outOfPartition.map((entry) => entry.collection).sort()).toEqual([
      "callerResolutions",
      "internalClientSurfaces",
    ]);
    expect(outOfPartition.every((entry) => entry.reason.trim().length > 0)).toBe(true);
  });
});

describe("nenhum sítio de egresso é descartado em silêncio: ou vira requisição ao serviço Go, ou é contado fora com motivo escrito (Goal043 / WU-02)", () => {
  it("a conservação é uma partição computada: todo sítio lido cai em exatamente um balde, ligado pelo campo de origem", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    const bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      requests: discovery.requests,
      notGoBound: discovery.notGoBound,
      assembledUrls: discovery.assembledUrls,
      nonTransportMemberCalls: discovery.nonTransportMemberCalls,
      nonGoBoundInstantiations: discovery.nonGoBoundInstantiations,
    };

    // Não-vacuidade: a partição roda sobre a árvore real, nunca sobre o vazio.
    expect(egress.sites.length).toBeGreaterThan(0);

    // A mesma conta que os controles negativos do §8 (`:7444` abaixo) chamam
    // sobre baldes corrompidos — nunca uma segunda implementação à parte.
    const findings = findEgressPartitionFindings(egress.sites, bucketsByName);

    // Categoria que a partição não sabe encaminhar reprova, em vez de sumir.
    expect(findings.unroutable).toEqual([]);
    // Sítio que não termina em balde algum reprova, com arquivo:linha e categoria.
    expect(findings.withoutBucket).toEqual([]);
    // Sítio em mais de um balde reprova: conservação é partição, não cobertura.
    expect(findings.inMoreThanOneBucket).toEqual([]);
    // Sentido inverso: balde não inventa entrada. Toda entrada dos cinco
    // baldes declara uma origem, e essa origem é um sítio de fato lido.
    expect(findings.entriesWithoutReadOrigin).toEqual([]);
    // Motivo não vazio: toda entrada dos cinco baldes declara motivo, no
    // precedente de PROVEN_UNREACHABLE_REFUSAL_CATEGORIES de D-064 — sítio
    // creditado por prosa vazia não conta como declarado.
    expect(findings.entriesWithEmptyReason).toEqual([]);
    // A outra mão da partição (Goal051 / WU-01): toda entrada dos cinco
    // baldes está num balde que a categoria da sua origem permite — saída
    // própria quando a entrada ocupa a posição do sítio, saída derivada
    // quando não. Entrada de categoria `env_var_*` que aparecesse em
    // `assembledUrls` reprovaria aqui, em vez de passar verde.
    expect(findings.entriesInBucketNotAllowedByOriginCategory).toEqual([]);
  });

  it("a exceção declarada de egressPartitionBucketsForCategory não é vácua: um sítio constructor_base_url_* tem saída própria em notGoBound e saída derivada num balde de instanciação, sem reprovar em nenhuma das duas mãos (Goal050, adaptado no Goal051)", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    const constructorSites = egress.sites.filter((site) =>
      site.category.startsWith("constructor_base_url_"),
    );
    // Não-vacuidade do sítio em si: a categoria existe na árvore real.
    expect(constructorSites.length).toBeGreaterThan(0);

    // A exceção deixou de ser prosa e passou a ser estrutura: para esta
    // categoria as duas mãos são declaradas e são distintas, e a mão
    // derivada é exatamente a dos quatro baldes de instanciação.
    const constructorRouting = egressPartitionBucketsForCategory(constructorSites[0].category);
    expect(constructorRouting).not.toBeNull();
    expect(constructorRouting!.ownOutput).toEqual(["notGoBound"]);
    expect([...constructorRouting!.derivedOutput].sort()).toEqual([
      "assembledUrls",
      "nonGoBoundInstantiations",
      "nonTransportMemberCalls",
      "requests",
    ]);

    const bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      requests: discovery.requests,
      notGoBound: discovery.notGoBound,
      assembledUrls: discovery.assembledUrls,
      nonTransportMemberCalls: discovery.nonTransportMemberCalls,
      nonGoBoundInstantiations: discovery.nonGoBoundInstantiations,
    };

    // Não-vacuidade da exceção: pelo menos um desses sítios tem saída
    // própria em `notGoBound` **e** saída derivada em um balde de
    // instanciação ao mesmo tempo — a condição que as duas mãos de
    // `egressPartitionBucketsForCategory` existem para permitir. A saída
    // derivada é cobrada como derivada de fato: a entrada declara o sítio em
    // `originSite` e ocupa outra `arquivo:linha`. Sem este sítio real, a
    // exceção seria prosa nunca confrontada com dado, a mesma classe de
    // defeito que o Goal fecha. A conta é a mesma que o controle 5 do §8
    // (Goal051 / WU-04, `:8173` abaixo) chama sobre baldes corrompidos.
    const dualMembership = findConstructorBaseUrlDualMembershipSites(egress.sites, bucketsByName);
    expect(dualMembership.length).toBeGreaterThan(0);

    // A mesma conta permanente (`:3099` acima) não reprova esses sítios em
    // mão nenhuma: a duplicidade é checada sobre a saída própria, e as
    // entradas derivadas caem em baldes que a saída derivada da categoria
    // permite. A dupla presença acima é legítima, não um achado.
    const findings = findEgressPartitionFindings(egress.sites, bucketsByName);
    expect(findings.inMoreThanOneBucket).toEqual([]);
    expect(findings.entriesInBucketNotAllowedByOriginCategory).toEqual([]);
  });

  it("o universo de candidatos da partição está declarado: cada coleção do descobridor entra, ou fica de fora com motivo escrito", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);

    // Fail-closed: coleção nova no descobridor reprova até ser declarada.
    expect(EGRESS_CANDIDATE_UNIVERSE.map((entry) => entry.collection).sort()).toEqual(
      Object.keys(egress).sort(),
    );
    expect(EGRESS_CANDIDATE_UNIVERSE.every((entry) => entry.reason.trim().length > 0)).toBe(true);

    const sitePositions = new Set(egress.sites.map(egressPositionKey));

    // `excluded`: fora da partição, e a exclusão não encobre sítio nenhum.
    expect(
      egress.excluded.filter((occurrence) => sitePositions.has(egressPositionKey(occurrence))),
    ).toEqual([]);

    // `genericEgressCallers`: fora da partição e hoje vazio — o primeiro
    // chamador a aparecer obriga a rever a declaração, em vez de passar.
    expect(egress.genericEgressCallers).toEqual([]);

    // `genericEgressCallersByPrimitive`: reagrupamento, sem elemento novo.
    const declaredCallers = new Set(egress.genericEgressCallers.map(egressPositionKey));
    expect(
      egress.genericEgressCallersByPrimitive
        .flatMap((primitive) => primitive.callers)
        .filter((caller) => !declaredCallers.has(egressPositionKey(caller))),
    ).toEqual([]);

    // `genericEgressPrimitives`: dentro da partição, pela coleção `sites`.
    expect(egress.genericEgressPrimitives.length).toBeGreaterThan(0);
    expect(
      egress.genericEgressPrimitives.filter((primitive) => {
        const site = egress.sites.find(
          (candidate) => egressPositionKey(candidate) === egressPositionKey(primitive),
        );
        return (
          site === undefined ||
          !site.category.startsWith("generic_egress_destination_decided_by_caller_")
        );
      }),
    ).toEqual([]);
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

/**
 * Entradas cujo motivo cita `o fetch está em arquivo:linha` mas o par que ele
 * cita diverge do campo `originSite` — a mesma conta que o teste permanente e
 * o controle negativo de WU-03 chamam (Goal051 / §5). Vazio prova
 * correspondência; não vazio nomeia cada entrada divergente.
 */
function requestsWithReasonDivergentFromOriginSite(
  requests: readonly { filePath: string; line: number; reason: string; originSite: HttpEgressSiteOrigin }[],
): string[] {
  return requests
    .filter((request) => request.reason.includes("o fetch está em"))
    .filter(
      (request) =>
        !request.reason.includes(
          `o fetch está em ${request.originSite.filePath}:${request.originSite.line}`,
        ),
    )
    .map(
      (request) => `${egressPositionKey(request)} com origem ${egressPositionKey(request.originSite)}`,
    );
}

describe("Goal051 / WU-03 — vacuidade por balde declarada ou exercida, e o motivo de env_var_* ligado ao campo originSite", () => {
  it("requests, notGoBound, assembledUrls e nonGoBoundInstantiations não são vazios na árvore real; nonTransportMemberCalls é vazio hoje, e o sentido inverso (balde populado) já é exercido por árvore sintética no controle negativo 2 (Goal044 / WU-04, \"antes\", `:4314` acima)", () => {
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    // Não-vacuidade real, balde a balde: cada um tem entrada de fato na
    // árvore real, nunca suposição declarada em prosa.
    expect(discovery.requests.length).toBeGreaterThan(0);
    expect(discovery.notGoBound.length).toBeGreaterThan(0);
    expect(discovery.assembledUrls.length).toBeGreaterThan(0);
    expect(discovery.nonGoBoundInstantiations.length).toBeGreaterThan(0);

    // O quinto balde é vazio nesta baseline. A vacuidade é conferida aqui
    // sobre a árvore real, não só declarada; o sentido inverso (balde
    // populado) é exercido por árvore sintética no controle negativo 2
    // (Goal044 / WU-04, cenário "antes"), que afirma `nonTransportMemberCalls`
    // com uma entrada.
    expect(discovery.nonTransportMemberCalls).toEqual([]);
  });

  it("o trecho do motivo de env_var_* que cita a posição de origem é computado do campo originSite (Goal051 / WU-03), e a árvore real confere a correspondência", () => {
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    const originCited = discovery.requests.filter((request) =>
      request.reason.includes("o fetch está em"),
    );
    // Não-vacuidade do próprio controle: ao menos um motivo desta forma
    // existe na árvore real — sem isso a asserção abaixo confere o vazio.
    expect(originCited.length).toBeGreaterThan(0);
    for (const request of originCited) {
      expect(request.reason).toContain(
        `o fetch está em ${request.originSite.filePath}:${request.originSite.line}`,
      );
    }
    // Antes: a árvore real não diverge — a mesma conta do controle negativo
    // abaixo confere isso.
    expect(requestsWithReasonDivergentFromOriginSite(discovery.requests)).toEqual([]);
  });

  it("controle negativo (Goal051 / WU-03, §5) — motivo e campo originSite divergentes reprovam: uma origem trocada faz a mesma conta acusar a entrada", () => {
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const originCited = discovery.requests.filter((request) =>
      request.reason.includes("o fetch está em"),
    );
    expect(originCited.length).toBeGreaterThan(0);
    const target = originCited[0]!;

    // Depois: a mesma requisição real, com originSite trocado por uma
    // posição diferente da que o motivo cita — motivo e campo agora
    // divergem, e a conta que provou o vazio acima acusa a entrada.
    const divergent = {
      ...target,
      originSite: { filePath: target.originSite.filePath, line: target.originSite.line + 1 },
    };
    expect(requestsWithReasonDivergentFromOriginSite([divergent])).toEqual([
      `${egressPositionKey(divergent)} com origem ${egressPositionKey(divergent.originSite)}`,
    ]);
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
    expectRefusal(
      () => discoverWithTrailingSource("export const Forwarded = InternalHttpClient;"),
      "class_binding_reference_forwarded_as_value",
      /class_binding_reference_forwarded_as_value/,
    );
  });

  it("`export class SubClient extends InternalHttpClient {}` recusa: herança de classe é posição de valor, e estar dentro de um `export` não a isenta", () => {
    expectRefusal(
      () => discoverWithTrailingSource("export class SubClient extends InternalHttpClient {}"),
      "class_binding_reference_forwarded_as_value",
      /class_binding_reference_forwarded_as_value/,
    );
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
    expectRefusal(
      () => discoverWithCandidateTrailing("export default { Client: InternalHttpClient };"),
      "class_binding_export_construct_form_unrecognized",
      /class_binding_export_construct_form_unrecognized/,
    );
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
    expectRefusal(
      () =>
        discoverWithCandidateTrailing(
          "export namespace N { export const C = InternalHttpClient; }",
        ),
      "class_binding_export_construct_form_unrecognized",
      /class_binding_export_construct_form_unrecognized/,
    );
  });
});

describe("controle negativo 3 (Goal046 / WU-04) — `export = <Classe>` no arquivo CANDIDATO recusa pela categoria nova da allowlist; a mesma forma no arquivo da DECLARAÇÃO continua recusando por `resolveModuleExportBindings`, categoria antiga", () => {
  it("antes: sem `export =` em lugar nenhum, a instanciação sob ligação importada é lida e a rota entra — o controle não é vácuo", () => {
    const { requests } = discoverWithCandidateTrailing("");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois, no arquivo CANDIDATO: `export = InternalHttpClient;` recusa por `class_binding_export_construct_form_unrecognized` — a allowlist fechada não reconhece `export =`, e a ocorrência do nome ali não cai em nenhuma isenção", () => {
    expectRefusal(
      () => discoverWithCandidateTrailing("export = InternalHttpClient;"),
      "class_binding_export_construct_form_unrecognized",
      /class_binding_export_construct_form_unrecognized/,
    );
  });

  it("depois, no arquivo da DECLARAÇÃO: `export = InternalHttpClient;` continua recusando por `class_binding_export_form_not_resolved` — esta forma nunca chega à allowlist de `exportConstructBindingRange`, porque `resolveModuleExportBindings` já derruba a leitura antes, e essa recusa mais antiga não muda de categoria", () => {
    expectRefusal(
      () => discoverWithDeclarationTrailing("export = InternalHttpClient;"),
      "class_binding_export_form_not_resolved",
      /class_binding_export_form_not_resolved/,
    );
  });
});

describe("controle negativo 4 (Goal046 / WU-04) — `export const` que atribui e cuja profundidade textual não fecha: a busca pelo `=` de topo nunca resolve, e a forma fica não reconhecida", () => {
  it("antes: sem a construção de profundidade aberta, a instanciação sob ligação importada é lida e a rota entra — o controle não é vácuo", () => {
    const { requests } = discoverWithCandidateTrailing("");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });

  it("depois: `export const Weird: Array<Foo = [InternalHttpClient];` recusa — o `<` de `Array<Foo` nunca fecha (não há `>` correspondente), `findTopLevelAssignmentIndex` termina com profundidade 1 e devolve `resolved: false`, e `exportConstructBindingRange` classifica a construção inteira como não reconhecida", () => {
    expectRefusal(
      () => discoverWithCandidateTrailing("export const Weird: Array<Foo = [InternalHttpClient];"),
      "class_binding_export_construct_form_unrecognized",
      /class_binding_export_construct_form_unrecognized/,
    );
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
    expectRefusal(
      () => discoverWithCandidateTrailing("export class SubClient extends InternalHttpClient {}"),
      "class_binding_reference_forwarded_as_value",
      /class_binding_reference_forwarded_as_value/,
    );
  });

  it("depois: `export const Forwarded = InternalHttpClient;` no candidato continua recusando por `class_binding_reference_forwarded_as_value` — o lado DIREITO da atribuição é posição de VALOR, e a allowlist fechada não muda essa categoria", () => {
    expectRefusal(
      () => discoverWithCandidateTrailing("export const Forwarded = InternalHttpClient;"),
      "class_binding_reference_forwarded_as_value",
      /class_binding_reference_forwarded_as_value/,
    );
  });

  it("depois: `export { InternalHttpClient };` no próprio arquivo da DECLARAÇÃO não recusa — a lista de export é a própria ligação exportada, isenta inteira, e a segunda ligação nomeada da mesma classe não amplia o alcance para nenhum arquivo novo", () => {
    const { requests } = discoverWithDeclarationTrailing("export { InternalHttpClient };");
    expect(requests.map((request) => request.pathExpression)).toEqual(["/instance/create"]);
  });
});

describe("Goal046 / WU-04 — o conjunto de categorias de recusa é conferido contra o array em runtime, nunca contra união escrita à mão", () => {
  it("CLASS_BINDING_REFUSAL_CATEGORIES traz a categoria nova da allowlist fechada, na ordem declarada — a cobertura por controle é conferida à parte, no bloco de cobertura computada", () => {
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
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "client_field_use_optional_chaining",
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
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "instance_field_assignment_local_variable",
        /evolution-client\.ts:\d+:.*variável local.*\[categoria: instance_field_assignment_local_variable\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

/**
 * Registro nomeado de todo descarte silencioso de candidato hoje presente em
 * `http-egress-sites.ts`: condição sobre valor ausente (`=== undefined`,
 * `=== null` ou `!<identificador>`) seguida de `continue;` na mesma linha —
 * a mesma forma dos dois exemplos que abriram esta Work Unit. A chave é o
 * trecho normalizado (o próprio `if (...) continue;`, com espaços internos
 * colapsados) mais a função de nível superior que o envolve, não o número da
 * linha — número de linha se desloca a cada edição do módulo alvo e não é
 * identidade estável. Morde nos dois sentidos, como
 * PROVEN_UNREACHABLE_REFUSAL_CATEGORIES acima: ocorrência que a varredura
 * encontra e não está aqui reprova nomeando arquivo:linha e o trecho; entrada
 * aqui que a varredura não encontra mais reprova como obsoleta. Duas
 * ocorrências que normalizam para a mesma chave (mesmo trecho, mesma função)
 * reprovam por ambiguidade, em vez de uma engolir silenciosamente a outra no
 * `Map`.
 *
 * Alcance DECLARADAMENTE PARCIAL, na forma que o Goal052 / WU-02 deixou:
 * este registro cobre toda ocorrência da classe **iteração sobre
 * candidatos** (`for…of`, `while ((match = pattern.exec(…)))` e `while`
 * que drena uma fila — vocabulário fechado em
 * `CONTINUE_CANDIDATE_LOOP_FORMS`, abaixo), não mais só a forma
 * idiomática de guarda com que o Goal050 abriu este registro — essa forma
 * continua presente entre as entradas, só deixou de ser o TETO do alcance.
 * A classe **leitura posicional** (laço `for` indexado e `while` de cursor
 * escalar contra limite) permanece de fora de propósito: a isenção dela é
 * o critério computado do Goal052 §2 (`ContinueOccurrence.loopForm`), não
 * um registro por ocorrência — é por isso que o alcance continua PARCIAL,
 * não total sobre `continue;`. O total
 * de ocorrências de `continue;` do módulo NÃO é escrito aqui: quem o
 * conhece é `enumerateContinueOccurrences` (Goal052 / WU-01, abaixo), que o
 * computa em runtime do texto do módulo e classifica cada ocorrência pela
 * forma do laço contenedor. Número de ocorrências escrito à mão em prosa
 * foi exatamente o que este comentário fazia antes do Goal052, e o que o
 * Goal052 removeu. Este registro não é prova de conservação de candidatos,
 * só de que toda ocorrência da classe portadora de candidato está nomeada e
 * justificada.
 *
 * `continue;` nu normaliza sempre para a mesma string, então duas ou mais
 * ocorrências nuas na mesma função (mesmo quando estão em laços diferentes)
 * colidem na mesma chave — a sondagem do Goal052 achou isso de fato na
 * árvore real (`resolveModuleExportBindings` chega a sete pela mesma
 * chave; `discoverGoBoundRawFetchRequests`, a seis; `resolveDestination`, a
 * cinco; e outras). Discriminar a chave por cabeçalho de laço não resolve o caso
 * predominante, porque a repetição típica é várias ocorrências nuas
 * **dentro do mesmo laço** (mesmo cabeçalho, mesma guarda ausente) — só um
 * discriminador posicional resolveria essas, e chave por posição é
 * exatamente o que o Goal050 proibiu. Por isso o Goal052 / WU-02 resolve a
 * colisão pela segunda opção que o próprio Goal autoriza:
 * `SilentDiscardEntry.multiplicity` declara quantas ocorrências
 * legitimamente compartilham a chave, e `findSilentDiscardFindings` reprova
 * quando a contagem real diverge da declarada — nos dois sentidos, sem ler
 * linha alguma.
 */
interface SilentDiscardEntry {
  readonly anchor: string | undefined;
  readonly snippet: string;
  readonly reason: string;
  /**
   * Quantas ocorrências reais devem compartilhar esta chave. Ausente
   * significa `1`, o caso comum. `findSilentDiscardFindings` reprova por
   * ambiguidade quando a contagem real diverge deste número, em qualquer
   * direção — é o discriminador que substitui número de linha para a forma
   * nua repetida dentro da mesma função (Goal052 §4).
   */
  readonly multiplicity?: number;
}

/** Colapsa espaços internos e remove bordas, para que o mesmo trecho lido em pontos diferentes normalize à mesma string. */
function normalizeSilentDiscardSnippet(snippet: string): string {
  return snippet.replace(/\s+/gu, " ").trim();
}

/** Chave estável do registro: trecho normalizado mais a função de nível superior que o contém (ou `<module-level>` se nenhuma). */
function silentDiscardKey(anchor: string | undefined, snippet: string): string {
  return `${anchor ?? "<module-level>"}::${normalizeSilentDiscardSnippet(snippet)}`;
}

function buildSilentDiscardRegistry(
  entries: readonly SilentDiscardEntry[],
): ReadonlyMap<string, SilentDiscardEntry> {
  const registry = new Map<string, SilentDiscardEntry>();
  for (const entry of entries) {
    const key = silentDiscardKey(entry.anchor, entry.snippet);
    if (registry.has(key)) {
      throw new Error(`DOCUMENTED_SILENT_DISCARDS: chave duplicada "${key}" no próprio registro`);
    }
    registry.set(key, entry);
  }
  return registry;
}

const DOCUMENTED_SILENT_DISCARDS: ReadonlyMap<string, SilentDiscardEntry> = buildSilentDiscardRegistry([
  {
    anchor: "resolveViaCallers",
    snippet: "if (!argExpression) continue;",
    reason:
      "posição de parâmetro sem argumento nesta chamada real específica — outras chamadas do mesmo `functionName` continuam sendo varridas; não é candidato descartado, é ausência de argumento numa chamada que genuinamente não o passa",
  },
  {
    anchor: "readEnvSchemaDefault",
    snippet: "if (match === null) continue;",
    reason:
      "linha do arquivo cujo regex de declaração não casou — segue para a próxima linha à procura da declaração real; despejar aqui derrubaria a leitura em toda linha que não é a declaração",
  },
  {
    anchor: "readEnvSchemaDefault",
    snippet: "if (captured === undefined) continue;",
    reason:
      "nenhum dos três grupos de aspas (\", ', `) capturou depois de já ter casado o regex de declaração — defensivo, porque a regex exige um dos três; mesmo assim documentado para não ficar não-nomeado",
  },
  {
    anchor: "findCrossFileCallerBindings",
    snippet: "if (localAlias === undefined) continue;",
    reason:
      "`import { X }` sem alias local para o nome exportado rastreado nesta declaração de import — essa declaração não é um binding real do nome que a varredura persegue, então não há chamador para perder",
  },
  {
    anchor: "discoverCallerResolvedGoBoundRequests",
    snippet: "if (baseParam === undefined || goEnvVar === undefined) continue;",
    reason:
      "nenhum parâmetro desta chamada resolve a env var de base do serviço Go — este chamador não determina base, então não contribui caminho; outros chamadores continuam sendo varridos",
  },
  // ---------------------------------------------------------------------
  // Goal052 / WU-02 — as entradas acima são as 5 da baseline, absorvidas
  // sem alteração. As entradas abaixo ampliam o registro a TODA ocorrência
  // da classe iteração sobre candidatos (`for…of`, `while-exec-match` e
  // `while-queue-drain`) da
  // árvore real, computada por `enumerateContinueOccurrences` +
  // `CONTINUE_CANDIDATE_LOOP_FORMS` (abaixo) — não mais só a forma
  // idiomática de guarda de linha única. `multiplicity` só aparece quando
  // mais de uma ocorrência real, nu ou não, compartilha a mesma chave.
  // ---------------------------------------------------------------------
  {
    anchor: "listTypeScriptSources",
    snippet: "continue;",
    reason:
      "depois de descer recursivamente num subdiretório e acrescentar os arquivos achados nele, o `continue` evita reavaliar a própria entrada como arquivo `.ts` — ela é diretório, já tratado",
  },
  {
    anchor: "parseParameterNames",
    snippet: "continue;",
    reason:
      "parâmetro desestruturado (`{…}` ou `[…]`) já teve cada nome extraído e empurrado para `names` no laço interno; o `continue` evita cair na checagem de identificador solto, que não se aplica a um padrão",
  },
  {
    anchor: "resolveDestination",
    snippet: "continue;",
    multiplicity: 5,
    reason:
      "as 5 ocorrências nuas do `for…of` sobre `extractLeadingIdentifiers` gravam o resultado do identificador antes de pular para o próximo — em `unresolvedParams` (parâmetro em trânsito, ou sem declaração precedente, ou parâmetro mencionado no lado direito), em `envVars` (o lado direito resolve a env var), ou marcando `constructorFieldReference` (lado direito referencia `this.<campo>`); nenhuma delas descarta identificador sem contabilizar",
  },
  {
    anchor: "findRealCallSites",
    snippet:
      "if (isMemberDeclarationOrImplementationPosition(source, match.index, openParenIndex)) continue;",
    reason:
      "o casamento de `<nome>(` está na posição de DECLARAÇÃO do método (`<nome>(...): T {`), não numa chamada real — `isMemberDeclarationOrImplementationPosition` já prova isso; contar aqui inflaria `findRealCallSites` com a própria assinatura",
  },
  {
    anchor: "findRawFetchOccurrences",
    snippet: "continue;",
    reason:
      "o caractere antes de `fetch(` é `.` — é `algumaCoisa.fetch(...)`, um método, não o `fetch` global; a ocorrência é gravada em `excluded` com o motivo `method_call_not_global_fetch` antes do `continue`, nunca descartada muda",
  },
  {
    anchor: "classifyGenericEgressCallersInSource",
    snippet:
      "if (isMemberDeclarationOrImplementationPosition(source, match.index, openParenIndex)) continue;",
    reason:
      "mesma exclusão de `findRealCallSites` acima, aplicada à varredura de chamadores do egresso genérico: a posição casada é a declaração do primitivo, não uma chamada real dele",
  },
  {
    anchor: "discoverHttpEgressSites",
    snippet: "if (scannedPrimitiveDeclarations.has(declarationKey)) continue;",
    reason:
      "a DECLARAÇÃO deste primitivo (`arquivo:linha`, não o nome) já foi desenfileirada e varrida numa volta anterior de `pendingPrimitives` — deduplicação por declaração, não descarte de candidato: o mesmo primitivo reenfileirado por um segundo chamador não acrescentaria chamador algum, e dois homônimos em arquivos diferentes têm chaves diferentes e os dois são varridos",
  },
  {
    anchor: "discoverHttpEgressSites",
    snippet: "if (callerBinding.localName === functionName) continue;",
    reason:
      "o chamador importa o primitivo pelo próprio nome da declaração, sem alias — a varredura pelo nome solto (sem alias) já o alcança; registrar o mesmo nome como \"alias\" seria redundante, não um chamador a mais",
  },
  {
    anchor: "findImportDeclarations",
    snippet: "continue;",
    multiplicity: 2,
    reason:
      "as 2 ocorrências nuas do `for…of` sobre a cláusula de import gravam a parte já reconhecida — `{ ... }` explode em bindings nomeados no laço interno, `* as X` vira `namespaceAlias` — antes de pular para a próxima parte da cláusula; nenhuma parte reconhecida é perdida",
  },
  {
    anchor: "findLocalExportListBindings",
    snippet: 'if (after.startsWith("from")) continue;',
    reason:
      '`export { ... } from "especificador"` é reexportação, não uma lista de export LOCAL — esta função só lê listas locais (usadas por `findForwardedExportLine`); a reexportação é lida por outra varredura (`findReexportDeclarations`), nunca aqui',
  },
  {
    anchor: "findExportConstructs",
    snippet: "if (quoteMask[match.index]) continue;",
    reason:
      'a palavra "export" casada está dentro de literal de string ou de comentário (`quoteMask`), não é a palavra-chave — não é construção de export alguma, então não há binding a perder',
  },
  {
    anchor: "resolveModuleExportBindings",
    snippet: "if (!mentionsName.test(construct.text)) continue;",
    reason:
      "a construção `export` deste `for…of` não menciona o nome da função procurada em texto algum — não pode ser a ligação dela, então não é convertida nem recusada, só ignorada para este nome",
  },
  {
    anchor: "resolveModuleExportBindings",
    snippet: "continue;",
    multiplicity: 7,
    reason:
      "as 7 ocorrências nuas do `for…of` sobre `findExportConstructs` são as 7 formas de export reconhecidas para o nome — default function, default identifier, default class, named class, named function, named const/let/var, e lista `export { ... }` — cada uma chama `addBinding(...)` antes do `continue`; nenhuma forma reconhecida descarta a ligação sem registrar",
  },
  {
    anchor: "findCrossFileCallerBindings",
    snippet: "if (otherFilePath === siteFilePath) continue;",
    reason:
      "o próprio arquivo do sítio não é um ARQUIVO OUTRO capaz de importar a ligação dele — a varredura deste laço é por definição sobre os demais arquivos das duas árvores",
  },
  {
    anchor: "findCrossFileCallerBindings",
    snippet:
      "if (resolveModuleSpecifierToFilePath(reexport.specifier, otherFilePath, sourcesByPath) !== siteFilePath) continue;",
    reason:
      "a reexportação encontrada neste arquivo aponta para um arquivo diferente do sítio — não é uma reexportação da ligação que esta resolução persegue, então não estende alcance algum aqui",
  },
  {
    anchor: "findCrossFileCallerBindings",
    snippet: "if (importDecl.typeOnly) continue;",
    reason:
      '`import type { X }` não traz valor em runtime — um chamador real de "X" não pode vir desta declaração; type-only é isenção por forma, não por ausência de dado',
  },
  {
    anchor: "findCrossFileCallerBindings",
    snippet: "continue;",
    multiplicity: 2,
    reason:
      "as 2 ocorrências nuas deste `for…of` sobre `findImportDeclarations(otherSource)` pulam o import quando ele não pode ser o chamador desta ligação: especificador não relativo (pacote/alias) sem o nome na cláusula — não resolve a arquivo algum —, e especificador relativo que resolve a um arquivo diferente do sítio; nenhum candidato de chamador de fato é perdido, é excluído por não apontar para o arquivo do sítio",
  },
  {
    anchor: "discoverCallerResolvedGoBoundRequests",
    snippet: "continue;",
    reason:
      "a parte do literal de crase sem `${...}` (texto puro) já foi acrescentada a `pathExpression` antes do `continue` — não é uma parte de expressão que precise resolver a parâmetro, e nada dela é perdido",
  },
  {
    anchor: "discoverCallerResolvedGoBoundRequests",
    snippet: "if (parameterName === baseParam) continue;",
    reason:
      "o parâmetro em trânsito já foi escolhido como base da URL (`baseParam`, achado antes neste mesmo chamador) — ele vira host, não caminho; contar de novo aqui duplicaria a base dentro do caminho",
  },
  {
    anchor: "discoverGoBoundRawFetchRequests",
    snippet: "continue;",
    multiplicity: 6,
    reason:
      "as 6 ocorrências nuas do `for…of` sobre `discovery.sites` são os 6 pontos em que o sítio já foi gravado — como `requests` (destino resolvido ao serviço Go) ou como `notGoBound` via `countOut(...)` com motivo (destino não é base do Go, campo de instância de construtor, chamadores resolvidos sem base do Go, ou egresso genérico sem chamador ligado ao Go) — antes do `continue`; a partição do Goal049/050/051 é exatamente a prova de que nenhum sítio sai deste laço sem cair em exatamente um balde",
  },
  {
    anchor: "findClassInstantiations",
    snippet: 'if (wordEndingAt(source, match.index) !== "new") continue;',
    reason:
      'o identificador casado não é precedido da palavra "new" — é uma referência ao nome (tipo, valor repassado, etc.), não uma instanciação; `refuseClassReferencesOutsideInstantiation` trata essas referências à parte, não esta função',
  },
  {
    anchor: "findClassInstantiations",
    snippet:
      "if (isMemberDeclarationOrImplementationPosition(source, match.index, openParenIndex)) continue;",
    reason:
      "mesma exclusão de declaração/implementação de método das outras varreduras acima: a posição casada é onde um MÉTODO homônimo é declarado, não onde a classe é instanciada",
  },
  {
    anchor: "findClassDeclarationLines",
    snippet: "if (quoteMask[match.index]) continue;",
    reason:
      '"class <nome>" casado está dentro de literal de string ou de comentário — não é declaração de classe alguma, então não conta como uma das linhas de declaração',
  },
  {
    anchor: "resolveClassInstantiationBindings",
    snippet: "if (already) continue;",
    reason:
      "a ligação (`filePath` + `localName`) já foi acrescentada a `bindings` por uma exportação anterior do mesmo nome — deduplicação de ligação já contabilizada, não perda de chamador novo",
  },
  {
    anchor: "refuseClassReferencesOutsideInstantiation",
    snippet: "if (quoteMask[index]) continue;",
    reason:
      "o nome da classe casado está dentro de literal de string ou de comentário — não é uma referência de código ao identificador ligado à declaração",
  },
  {
    anchor: "refuseClassReferencesOutsideInstantiation",
    snippet: "if (instantiationIndexes.has(index)) continue;",
    reason:
      "este índice já foi contado como sítio de instanciação (`new <Id>(`) por `findClassInstantiations` — esta função só recusa referência FORA de instanciação; a própria instanciação não é a referência que ela procura",
  },
  {
    anchor: "refuseClassReferencesOutsideInstantiation",
    snippet: 'if (precedingWord === "class") continue;',
    reason:
      "a palavra imediatamente anterior é \"class\" — é a própria declaração da classe no arquivo, ligação local, não uma referência a ela",
  },
  {
    anchor: "refuseClassReferencesOutsideInstantiation",
    snippet: "if (importRanges.some(inRange)) continue;",
    reason:
      "a ocorrência está dentro do range de uma declaração de import — é o nome sendo importado, não uma referência de valor no corpo do arquivo",
  },
  {
    anchor: "refuseClassReferencesOutsideInstantiation",
    snippet: "if (TYPE_POSITION_PRECEDING_WORDS.has(precedingWord)) continue;",
    reason:
      "a palavra anterior marca posição de TIPO (a mesma allowlist fechada que a partição de egresso já usa) — o nome está anotando um tipo, não sendo repassado como valor",
  },
  {
    anchor: "refuseClassReferencesOutsideInstantiation",
    snippet:
      "if (before > 0 && TYPE_POSITION_PRECEDING_CHARS.has(source[before - 1])) continue;",
    reason:
      "o caractere anterior (ignorando espaço) marca posição de TIPO pela mesma allowlist fechada — mesma isenção da checagem por palavra acima, só que pelo caractere anterior",
  },
  {
    anchor: "refuseClassReferencesOutsideInstantiation",
    snippet: "if (exportRanges.some(inRange)) continue;",
    reason:
      "a ocorrência está dentro do range de uma construção `export` já RECONHECIDA (`exportConstructBindingRange`) — é o nome sendo exportado, não repassado como valor; construção não reconhecida já recusou antes, mais acima nesta mesma função",
  },
  {
    anchor: "computeInternalClientMemberSurface",
    snippet: "continue;",
    multiplicity: 2,
    reason:
      "as 2 ocorrências nuas do `for…of` sobre `spans` gravam o membro em `excludedMembers` com motivo — não alcança fetch nem delega, ou alcança mas é private/protected — antes do `continue`; todo membro cai em `reachingMembers` ou em `excludedMembers`, nenhum se perde entre os dois",
  },
  {
    anchor: "enumerateClientFieldMemberCalls",
    snippet: "if (quoteMask[index]) continue;",
    reason:
      '"this" casado está dentro de literal de string ou de comentário — não é uma ocorrência de código do receptor, então não é candidato a uso do campo',
  },
  {
    anchor: "enumerateClientFieldMemberCalls",
    snippet: "if (receiverFieldName !== fieldName) continue;",
    reason:
      "`this.<outroCampo>` prova alcançar um campo diferente do que esta chamada enumera — não é uso do campo procurado; a recusa fica escopada à ocorrência, não ao arquivo inteiro (é o precedente do Goal047/WU-04 §4 acima)",
  },
  {
    anchor: "enumerateClientFieldMemberCalls",
    snippet:
      "if (/^\\s*=\\s*new\\s+$/u.test(scan.slice(occurrenceEnd, instantiationCallIndex))) continue;",
    reason:
      "o texto entre esta ocorrência e a instanciação é só `= new `— é a própria atribuição que guarda a instância no campo, já provada como instanciação mais acima; não é um USO do campo, é a escrita dele",
  },
  {
    anchor: "discoverGoBoundInternalClientRequests",
    snippet: "if (classSurfaces.has(classDeclarationKey)) continue;",
    reason:
      "a superfície de membros desta declaração de classe (`arquivo:linha`) já foi computada por um sítio `constructor_base_url_*` anterior — memoização por declaração, não por nome; recomputar não acrescentaria membro novo",
  },
  {
    anchor: "discoverGoBoundInternalClientRequests",
    snippet: "continue;",
    multiplicity: 2,
    reason:
      "as 2 ocorrências nuas, em laços diferentes desta função, gravam o candidato antes de pular: a instanciação cujo destino não é base do serviço Go vai para `nonGoBoundInstantiations` com motivo, e a chamada de campo fora da superfície vai para `nonTransportMemberCalls` com motivo — as duas coleções cuja conservação a partição do Goal050/051 já prova",
  },
  {
    anchor: "discoverGoBoundInternalClientRequests",
    snippet: "if (envVarsInMethod.length === 0) continue;",
    reason:
      "nenhuma env var de base do serviço Go aparece nas requisições que este método já mapeou — o método não contribui caminho do Go, então não gera entrada de requisição para ele; outros métodos do mesmo cliente continuam sendo varridos",
  },
  // ---------------------------------------------------------------------
  // Goal053 / WU-02 — a isenção de registro passa a seguir o DOMÍNIO
  // percorrido (§2), não mais só a forma sintática do cabeçalho: as 6
  // ocorrências reais sobre `lines` (arranjo produzido por `.split(…)`,
  // portanto `element-collection`) exigem registro mesmo sendo
  // `for-indexed` — classe que o Goal052 isentava em bloco por leitura
  // posicional. As duas entradas de `readEnvSchemaDefault` já estavam na
  // baseline acima (Goal050), agora reaproveitadas sem duplicar: a mesma
  // chave, o mesmo motivo, passam a ser de fato exigidas e conferidas. As
  // 4 entradas abaixo são novas, para as 4 ocorrências restantes.
  // ---------------------------------------------------------------------
  {
    anchor: "readEnvFileValue",
    snippet: 'if (trimmed === "" || trimmed.startsWith("#")) continue;',
    reason:
      "linha em branco ou comentário (`#`) do arquivo `CHAVE=VALOR` — não é candidato a par chave/valor algum; a varredura segue para a próxima linha à procura da declaração real, mesma forma da guarda irmã de `readEnvSchemaDefault` acima",
  },
  {
    anchor: "readEnvFileValue",
    snippet: "if (separator === -1) continue;",
    reason:
      "linha sem `=` — não tem a forma `CHAVE=VALOR`, então não é um par a considerar; despejar aqui derrubaria a leitura em toda linha do arquivo que não declara um valor",
  },
  {
    anchor: "readEnvFileValue",
    snippet: "if (trimmed.slice(0, separator).trim() !== key) continue;",
    reason:
      "a linha declara uma chave diferente da procurada — não é o par que esta chamada busca; outras chaves do mesmo arquivo continuam sendo varridas pelas chamadas que as procuram",
  },
  {
    anchor: "readProductTransportRoutesFile",
    snippet: 'if (trimmed === "" || trimmed.startsWith("#")) continue;',
    reason:
      "linha em branco ou comentário no arquivo de rotas de transporte do produto — não é candidato a rota; a varredura segue para a próxima linha, e o arquivo sem rota reconhecida alguma já reprova depois do laço, então nenhuma rota de fato se perde aqui",
  },
]);

/** Acha, em `source`, toda linha na forma `if (<condição sobre valor ausente>) continue;`, com a condição em qualquer forma idiomática reconhecida (`=== undefined`, `=== null`, `!<identificador>`), combinável por `||`, com qualquer identificador. */
function findSilentDiscardLines(source: string): { line: number; snippet: string }[] {
  const clause = "(?:![A-Za-z_$][\\w$.]*|[A-Za-z_$][\\w$.]*\\s*===\\s*(?:undefined|null))";
  const pattern = new RegExp(`if \\(\\s*${clause}(?:\\s*\\|\\|\\s*${clause})*\\s*\\)\\s*continue;`, "gu");
  const lines = source.split(/\r?\n/u);
  const found: { line: number; snippet: string }[] = [];
  lines.forEach((text, index) => {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) found.push({ line: index + 1, snippet: match[0] });
  });
  return found;
}

/** Nome da função de nível superior (declarada sem indentação, não aninhada) que contém `line`, ou `undefined` no nível do módulo — âncora estável porque duas ocorrências do mesmo trecho em funções diferentes não colidem. */
function resolveEnclosingTopLevelFunctionName(source: string, line: number): string | undefined {
  const declaration = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/u;
  const lines = source.split(/\r?\n/u);
  for (let index = line - 2; index >= 0; index -= 1) {
    const match = declaration.exec(lines[index] as string);
    if (match) return match[1];
  }
  return undefined;
}

interface SilentDiscardOccurrence {
  readonly line: number;
  readonly snippet: string;
  readonly anchor: string | undefined;
  readonly key: string;
  /**
   * Ausente significa `true` — o caso de toda ocorrência construída antes
   * deste campo existir (Goal050/051). Desde o Goal053 §2, o critério é o
   * DOMÍNIO percorrido (`resolveContinueCursorDomain`), não mais só a
   * classe do cabeçalho: sequência de caracteres e máscara paralela são
   * isentas — cada volta avança leitura, não descarta candidato —, e
   * coleção de elementos EXIGE registro mesmo quando a forma é
   * `for-indexed` (o Goal052 isentava por classe em bloco). Laço sem
   * domínio (`no-domain`) continua decidido por `CONTINUE_CANDIDATE_LOOP_FORMS`,
   * porque cada volta dele já é diretamente um candidato, sem cursor a
   * resolver. Ocorrência isenta nunca conta como não registrada nem torna
   * obsoleta uma entrada de outra classe — mas segue contando para achar a
   * chave de uma entrada que porventura a nomeie, sem forçar sua presença.
   */
  readonly requiresRegistration?: boolean;
}

interface SilentDiscardFindings {
  readonly ambiguousKeys: string[];
  readonly unregistered: string[];
  readonly obsolete: string[];
  readonly emptyReason: string[];
}

/**
 * A mesma conta que o teste permanente do Goal050/WU-04 (`:6238` abaixo) roda
 * sobre a leitura real de http-egress-sites.ts — ambos chamam esta função,
 * nunca a reimplementam à parte. Os controles negativos do §8 a chamam sobre
 * ocorrências ou registro corrompidos, e conferem que a mesma conta reprova.
 */
function findSilentDiscardFindings(
  occurrences: readonly SilentDiscardOccurrence[],
  registry: ReadonlyMap<string, SilentDiscardEntry>,
): SilentDiscardFindings {
  // A leitura posicional (`requiresRegistration: false`) não exige registro
  // e não é contada para ambiguidade — ela só evita que uma entrada que a
  // nomeie vire obsoleta, no `foundKeys` abaixo, que roda sobre TODAS as
  // ocorrências, registráveis ou não.
  const registrable = occurrences.filter((occurrence) => occurrence.requiresRegistration ?? true);

  const occurrencesByKey = new Map<string, SilentDiscardOccurrence[]>();
  for (const occurrence of registrable) {
    const bucket = occurrencesByKey.get(occurrence.key) ?? [];
    bucket.push(occurrence);
    occurrencesByKey.set(occurrence.key, bucket);
  }

  // A chave nua colide de propósito (mesma função, mesmo trecho
  // normalizado). O que decide ambiguidade não é mais "mais de uma
  // ocorrência": é a contagem real divergir da multiplicidade declarada na
  // entrada — ausente vale `1`, o caso comum de antes do Goal052/WU-02.
  const ambiguousKeys: string[] = [];
  for (const [key, group] of occurrencesByKey) {
    const entry = registry.get(key);
    const expectedMultiplicity = entry?.multiplicity ?? 1;
    if (group.length !== expectedMultiplicity) {
      const expectedDescription =
        entry === undefined
          ? "não registrada, então 1 é esperado"
          : `multiplicidade declarada é ${expectedMultiplicity}`;
      ambiguousKeys.push(
        `chave ambígua "${key}" alcançada por ${group.length} ocorrência(s) (linhas ${group
          .map((occurrence) => occurrence.line)
          .join(", ")}), mas ${expectedDescription}`,
      );
    }
  }

  const unregistered: string[] = [];
  for (const occurrence of registrable) {
    if (!registry.has(occurrence.key)) {
      unregistered.push(`${occurrence.line}: "${occurrence.snippet}"`);
    }
  }

  const foundKeys = new Set(occurrences.map((occurrence) => occurrence.key));
  const obsolete: string[] = [];
  for (const key of registry.keys()) {
    if (!foundKeys.has(key)) {
      obsolete.push(key);
    }
  }

  const emptyReason: string[] = [];
  for (const [key, entry] of registry) {
    if (entry.reason.trim().length === 0) {
      emptyReason.push(key);
    }
  }

  return { ambiguousKeys, unregistered, obsolete, emptyReason };
}

/* =========================================================================
 * Goal052 / WU-01 (§1 e §2) — o descarte é enumerado por inteiro.
 *
 * O mecanismo do Goal050 (`findSilentDiscardLines` acima) reconhecia UMA
 * forma de `continue;`: a guarda idiomática sobre valor ausente. Toda
 * ocorrência fora dessa forma — `continue;` nu dentro de bloco, guarda com
 * condição de outra forma, laço de leitura posicional — ficava isenta por
 * simplesmente não ser vista, e o número total vivia escrito à mão num
 * comentário.
 *
 * Aqui a enumeração passa a achar TODA ocorrência de `continue;` no texto do
 * módulo, e a contagem total é resultado de execução, nunca prosa. Cada
 * ocorrência recebe:
 *
 * - um CONTEXTO LÉXICO computado (`CONTINUE_LEXICAL_CONTEXTS`), porque a
 *   leitura é textual e pode encontrar `continue;` dentro de literal de
 *   string, de template ou de comentário. Essas ocorrências são reconhecidas
 *   como tais e NOMEADAS, nunca descartadas em silêncio;
 * - uma CLASSE computada pela forma do laço mais próximo que a contém
 *   (`CONTINUE_LOOP_FORMS`), vocabulário fechado.
 *
 * A resolução do laço contenedor NÃO usa recuo por indentação: a sondagem do
 * Goal052 falhou em 5 ocorrências (`http-egress-sites.ts:1761`, `:1765`,
 * `:1769`, `:1773`, `:1796`) exatamente por tentar isso. Aqui o texto é
 * primeiro mapeado caractere a caractere em contextos léxicos, depois o que
 * não é código vira espaço (preservando índices e linhas), e os laços são
 * achados por casamento de parênteses e chaves sobre esse texto mascarado.
 * A ocorrência pertence ao laço mais interno cujo corpo a contém.
 *
 * Fail-closed nos dois sentidos que importam: ocorrência de código cujo laço
 * contenedor não é resolvido REPROVA nomeando `arquivo:linha` e o motivo, em
 * vez de ser isentada; e classe fora do vocabulário declarado REPROVA. Não há
 * ramo `else` mudo nem classe "desconhecida" que passe.
 *
 * Limite declarado, herdado de D-065/D-066/D-067 e não afrouxado aqui:
 * classificar um `continue;` diz em que forma de laço ele está, não que o
 * candidato descartado não importava.
 * ========================================================================= */

/**
 * Vocabulário FECHADO das formas de laço que a classificação reconhece.
 * Classe fora daqui reprova em `findContinueEnumerationFindings`.
 *
 * `while` é partido em TRÊS, não em dois, e cada uma das três classes tem
 * critério textual próprio em `classifyContinueLoopForm` — nenhuma delas é
 * o ramo de sobra das outras:
 *
 * - `while-exec-match` — o cabeçalho atribui o resultado de um `.exec(`;
 *   cada volta é um candidato casado, e o `continue` o descarta;
 * - `while-queue-drain` — o cabeçalho testa a NÃO-VAZIEZ da própria
 *   coleção (`<coleção>.length > 0`, `.size !== 0`, e formas irmãs);
 *   cada volta consome um elemento da coleção, então cada volta é um
 *   candidato e o `continue` o descarta, exatamente como num `for…of`;
 * - `while-positional-read` — o cabeçalho compara um CURSOR escalar
 *   (identificador nu) com um limite (`i < body.length`, `i < bodyEnd`,
 *   `i >= 0`); o `continue` avança a leitura, não descarta candidato.
 *
 * A partição nasceu de execução, não de prosa: a rodada 1 do Goal052
 * classificava as seis ocorrências como um único `while-condition` e as
 * isentava em bloco. Rodando o enumerador sobre a árvore real,
 * `http-egress-sites.ts:1458`, `:1484`, `:2989`, `:2996` e `:2999` são
 * cursor contra limite, mas `:1028` é `while (pendingPrimitives.length > 0)`
 * com `pendingPrimitives.shift()` na primeira linha do corpo — fila de
 * candidatos drenada, não posição de leitura. A isenção em bloco era,
 * portanto, fail-open sobre um descarte de candidato real.
 *
 * `while` cujo cabeçalho não casa NENHUM dos três critérios REPROVA
 * nomeando `arquivo:linha`, como já acontece com `for` fora das formas
 * reconhecidas. Não há classe de sobra para `while`.
 */
const CONTINUE_LOOP_FORMS = [
  "for-of",
  "for-in",
  "for-indexed",
  "while-exec-match",
  "while-queue-drain",
  "while-positional-read",
  "do-while",
] as const;

type ContinueLoopForm = (typeof CONTINUE_LOOP_FORMS)[number];

/**
 * Vocabulário FECHADO do DOMÍNIO que o cursor de um laço percorre
 * (Goal053 §1). A classe de laço do Goal052 mede a FORMA do cabeçalho; o
 * domínio mede o que o cursor de fato indexa, resolvido do texto do módulo
 * por evidência nomeada — nunca por lista de nomes de variável escrita à
 * mão, nunca por recuo e nunca por nome de função.
 *
 * - `character-sequence`: o cursor indexa um valor provado `string` no
 *   próprio texto (anotação `: string`, `readFileSync(…, "utf8")`,
 *   `.trim()`/`.slice(…)`/`.join(…)` sobre sequência de caracteres, ou
 *   retorno `: string` de função do módulo). Cada volta avança LEITURA.
 * - `parallel-mask`: o cursor indexa um arranjo cujo comprimento vem do
 *   comprimento de uma sequência de caracteres (`new Array<…>(s.length)`),
 *   ou um arranjo indexado pelo MESMO cursor que indexa uma sequência de
 *   caracteres no mesmo corpo — cada posição é uma posição de caractere.
 * - `element-collection`: o cursor indexa uma coleção cujos elementos são
 *   candidatos (`source.split(…)` é o caso concreto da árvore). Cada volta
 *   é um CANDIDATO.
 * - `no-domain`: o laço não avança por cursor escalar indexado — `for…of`,
 *   `for…in`, `while` de `exec` e de drenagem de fila e `do/while` consomem
 *   o que percorrem diretamente, sem indexar domínio algum.
 *
 * Domínio que a resolução não conclui REPROVA nomeando `arquivo:linha` e o
 * motivo, como já acontece com a classe de laço: não há ramo `else` mudo e
 * não há domínio "desconhecido" que passe.
 */
const CONTINUE_CURSOR_DOMAINS = [
  "character-sequence",
  "parallel-mask",
  "element-collection",
  "no-domain",
] as const;

type ContinueCursorDomain = (typeof CONTINUE_CURSOR_DOMAINS)[number];

/**
 * Formas de laço que avançam por CURSOR ESCALAR — as únicas que percorrem
 * um domínio indexado, e portanto as únicas em que o domínio é resolvido do
 * corpo. As demais recebem `no-domain` pela própria classe.
 */
const CURSOR_BEARING_LOOP_FORMS: ReadonlySet<ContinueLoopForm> = new Set([
  "for-indexed",
  "while-positional-read",
]);

/** Vocabulário FECHADO dos contextos léxicos em que a leitura textual pode produzir `continue;`. Contexto fora daqui reprova. */
const CONTINUE_LEXICAL_CONTEXTS = [
  "code",
  "comment",
  "string-literal",
  "template-literal",
  "regex-literal",
] as const;

type ContinueLexicalContext = (typeof CONTINUE_LEXICAL_CONTEXTS)[number];

/** Tokens depois dos quais um `/` abre literal de expressão regular, não divisão — sem isso a máscara confunde `/\s/` com divisão e desalinha todo o resto. */
const REGEX_LITERAL_PRECEDING_TOKENS: ReadonlySet<string> = new Set([
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "~",
  "^",
  "<",
  ">",
  "return",
  "case",
  "typeof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "instanceof",
  "do",
  "else",
  "yield",
  "await",
]);

function markLexicalRange(
  contexts: ContinueLexicalContext[],
  from: number,
  to: number,
  context: ContinueLexicalContext,
): void {
  for (let index = Math.max(from, 0); index < to && index < contexts.length; index += 1) {
    contexts[index] = context;
  }
}

/** Índice imediatamente depois do literal de string aberto em `start` (aspas simples ou duplas). */
function scanQuotedStringEnd(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    if (char === "\n") return index;
    index += 1;
  }
  return source.length;
}

/** Índice imediatamente depois do literal de expressão regular aberto em `start`, incluindo as flags. */
function scanRegexLiteralEnd(source: string, start: number): number {
  let index = start + 1;
  let insideClass = false;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "[") insideClass = true;
    else if (char === "]") insideClass = false;
    else if (char === "\n") return index;
    else if (char === "/" && !insideClass) {
      let end = index + 1;
      while (end < source.length && /[a-z]/u.test(source[end])) end += 1;
      return end;
    }
    index += 1;
  }
  return source.length;
}

/** Marca o template literal aberto em `start`; cada interpolação `${…}` volta a ser código, recursivamente. Devolve o índice depois da crase de fechamento. */
function scanTemplateLiteralLexicalContexts(
  source: string,
  contexts: ContinueLexicalContext[],
  start: number,
): number {
  contexts[start] = "template-literal";
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      markLexicalRange(contexts, index, index + 2, "template-literal");
      index += 2;
      continue;
    }
    if (char === "`") {
      contexts[index] = "template-literal";
      return index + 1;
    }
    if (char === "$" && source[index + 1] === "{") {
      markLexicalRange(contexts, index, index + 2, "code");
      const closeIndex = scanCodeRegionLexicalContexts(source, contexts, index + 2);
      if (closeIndex >= source.length) return source.length;
      contexts[closeIndex] = "code";
      index = closeIndex + 1;
      continue;
    }
    contexts[index] = "template-literal";
    index += 1;
  }
  return source.length;
}

/**
 * Percorre código a partir de `from`, marcando o contexto léxico de cada
 * caractere. Para no `}` sem `{` correspondente — o fim de uma interpolação
 * `${…}` — e devolve esse índice; devolve `source.length` se o texto acabar.
 */
function scanCodeRegionLexicalContexts(
  source: string,
  contexts: ContinueLexicalContext[],
  from: number,
): number {
  let index = from;
  let braceDepth = 0;
  let previousToken = "";
  while (index < source.length) {
    const char = source[index];
    const pair = source.slice(index, index + 2);
    if (pair === "//") {
      const lineEnd = source.indexOf("\n", index);
      const stop = lineEnd === -1 ? source.length : lineEnd;
      markLexicalRange(contexts, index, stop, "comment");
      index = stop;
      continue;
    }
    if (pair === "/*") {
      const commentEnd = source.indexOf("*/", index + 2);
      const stop = commentEnd === -1 ? source.length : commentEnd + 2;
      markLexicalRange(contexts, index, stop, "comment");
      index = stop;
      continue;
    }
    if (char === '"' || char === "'") {
      const stop = scanQuotedStringEnd(source, index);
      markLexicalRange(contexts, index, stop, "string-literal");
      index = stop;
      previousToken = "<literal>";
      continue;
    }
    if (char === "`") {
      index = scanTemplateLiteralLexicalContexts(source, contexts, index);
      previousToken = "<literal>";
      continue;
    }
    if (char === "/" && REGEX_LITERAL_PRECEDING_TOKENS.has(previousToken)) {
      const stop = scanRegexLiteralEnd(source, index);
      markLexicalRange(contexts, index, stop, "regex-literal");
      index = stop;
      previousToken = "<literal>";
      continue;
    }
    if (/[A-Za-z_$]/u.test(char)) {
      let wordEnd = index;
      while (wordEnd < source.length && /[\w$]/u.test(source[wordEnd])) wordEnd += 1;
      previousToken = source.slice(index, wordEnd);
      index = wordEnd;
      continue;
    }
    if (char === "{") {
      braceDepth += 1;
      previousToken = char;
      index += 1;
      continue;
    }
    if (char === "}") {
      if (braceDepth === 0) return index;
      braceDepth -= 1;
      previousToken = char;
      index += 1;
      continue;
    }
    if (!/\s/u.test(char)) previousToken = char;
    index += 1;
  }
  return source.length;
}

/** Contexto léxico de cada caractere de `source`, computado numa passada só. */
function buildContinueLexicalContexts(source: string): ContinueLexicalContext[] {
  const contexts: ContinueLexicalContext[] = new Array<ContinueLexicalContext>(source.length).fill(
    "code",
  );
  scanCodeRegionLexicalContexts(source, contexts, 0);
  return contexts;
}

/** Substitui por espaço tudo que não é código, preservando índices e quebras de linha — sobre este texto o casamento de chaves não é enganado por chave dentro de string, comentário ou regex. */
function maskNonCodeText(source: string, contexts: readonly ContinueLexicalContext[]): string {
  const chars = [...source];
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (contexts[index] !== "code" && char !== "\n" && char !== "\r") {
      chars[index] = " ";
    }
  }
  return chars.join("");
}

type ContinueLoopKeyword = "for" | "while" | "do";

interface ContinueLoopSpan {
  readonly keyword: ContinueLoopKeyword;
  readonly header: string;
  readonly headerIndex: number;
  readonly bodyStart: number;
  /** Exclusivo. */
  readonly bodyEnd: number;
  readonly form: ContinueLoopForm | undefined;
  readonly unresolvedReason: string | undefined;
}

/** Índice do delimitador que fecha o aberto em `openIndex`, ou `-1`. Roda sobre texto já mascarado. */
function matchBalancedDelimiter(
  masked: string,
  openIndex: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  for (let index = openIndex; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Primeiro índice a partir de `from` cujo caractere não é espaço em branco, ou `masked.length`. */
function skipMaskedWhitespace(masked: string, from: number): number {
  let index = from;
  while (index < masked.length && /\s/u.test(masked[index])) index += 1;
  return index;
}

/** Índice depois do `;` que fecha a instrução iniciada em `from` — corpo de laço sem bloco. */
function findStatementEnd(masked: string, from: number): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = from; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth -= 1;
    else if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth -= 1;
    else if (char === ";" && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      return index + 1;
    }
  }
  return masked.length;
}

/**
 * Remove parênteses redundantes em volta da condição inteira — `while ((a))`
 * e `while (a)` têm a mesma condição, e o casamento por forma não pode
 * depender de quantos parênteses o autor escreveu.
 */
function stripRedundantParentheses(condition: string): string {
  let text = condition.trim();
  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "(") depth += 1;
      else if (text[index] === ")") {
        depth -= 1;
        if (depth === 0 && index < text.length - 1) {
          wraps = false;
          break;
        }
      }
    }
    if (!wraps) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

/** Condição de DRENAGEM DE FILA: a não-vaziez da própria coleção, em qualquer das formas idiomáticas — `xs.length > 0`, `xs.size !== 0`, `xs.length` nu, `!!xs.length`. */
const WHILE_QUEUE_DRAIN_CONDITION =
  /^!*[A-Za-z_$][\w$.]*\.(?:length|size)(?:\s*(?:>|!==|!=)\s*0)?$/u;

/** Condição de LEITURA POSICIONAL: um cursor escalar (identificador nu à esquerda, nunca `.length`/`.size`) comparado com um limite. */
const WHILE_POSITIONAL_READ_CONDITION =
  /^[A-Za-z_$][\w$]*\s*(?:<|<=|>|>=)\s*[^<>=].*$/u;

/** A classe do laço, computada só do cabeçalho — nenhuma heurística de indentação, nenhum ramo mudo: o que não casa volta com motivo escrito. */
function classifyContinueLoopForm(
  keyword: ContinueLoopKeyword,
  header: string,
): { form: ContinueLoopForm | undefined; unresolvedReason: string | undefined } {
  const normalized = header.replace(/\s+/gu, " ").trim();
  if (keyword === "do") return { form: "do-while", unresolvedReason: undefined };
  if (keyword === "while") {
    if (normalized.length === 0) {
      return {
        form: undefined,
        unresolvedReason: "cabeçalho de `while` vazio, sem condição a classificar",
      };
    }
    if (/=\s*[A-Za-z_$][\w$.]*\.exec\s*\(/u.test(normalized)) {
      return { form: "while-exec-match", unresolvedReason: undefined };
    }
    // Fila de candidatos: a condição testa a não-vaziez da PRÓPRIA coleção,
    // e cada volta consome um elemento dela. `:1028` da árvore real.
    if (WHILE_QUEUE_DRAIN_CONDITION.test(stripRedundantParentheses(normalized))) {
      return { form: "while-queue-drain", unresolvedReason: undefined };
    }
    // Leitura posicional: a condição compara um CURSOR escalar (identificador
    // nu, sem `.length`/`.size` à esquerda) com um limite.
    if (WHILE_POSITIONAL_READ_CONDITION.test(stripRedundantParentheses(normalized))) {
      return { form: "while-positional-read", unresolvedReason: undefined };
    }
    return {
      form: undefined,
      unresolvedReason: `cabeçalho de \`while\` fora das formas reconhecidas (exec-match, drenagem de fila, cursor posicional): "${normalized}"`,
    };
  }
  const binding = "(?:\\[[^\\]]*\\]|\\{[^}]*\\}|[A-Za-z_$][\\w$]*)";
  if (new RegExp(`^(?:const |let |var )?${binding} of `, "u").test(normalized)) {
    return { form: "for-of", unresolvedReason: undefined };
  }
  if (new RegExp(`^(?:const |let |var )?${binding} in `, "u").test(normalized)) {
    return { form: "for-in", unresolvedReason: undefined };
  }
  if (normalized.includes(";")) return { form: "for-indexed", unresolvedReason: undefined };
  return {
    form: undefined,
    unresolvedReason: `cabeçalho de \`for\` fora das formas reconhecidas (for-of, for-in, for indexado): "${normalized}"`,
  };
}

/** Todo laço do texto mascarado, com o intervalo exato do corpo — com bloco `{…}` ou instrução única sem chaves. */
function findContinueLoopSpans(masked: string): ContinueLoopSpan[] {
  const spans: ContinueLoopSpan[] = [];
  const skippedKeywordIndices = new Set<number>();
  const keywordPattern = /\b(for|while|do)\b/gu;
  let match = keywordPattern.exec(masked);
  while (match !== null) {
    const keywordIndex = match.index;
    const keyword = match[1] as ContinueLoopKeyword;
    if (!skippedKeywordIndices.has(keywordIndex)) {
      let header = "";
      let bodyCandidate = keywordIndex + keyword.length;
      let recognizedHeader = true;
      if (keyword === "for" || keyword === "while") {
        const parenIndex = skipMaskedWhitespace(masked, keywordIndex + keyword.length);
        const closeIndex =
          masked[parenIndex] === "(" ? matchBalancedDelimiter(masked, parenIndex, "(", ")") : -1;
        if (closeIndex === -1) recognizedHeader = false;
        else {
          header = masked.slice(parenIndex + 1, closeIndex);
          bodyCandidate = closeIndex + 1;
        }
      }
      if (recognizedHeader) {
        const bodyStart = skipMaskedWhitespace(masked, bodyCandidate);
        let bodyEnd: number;
        if (masked[bodyStart] === "{") {
          const closeBrace = matchBalancedDelimiter(masked, bodyStart, "{", "}");
          bodyEnd = closeBrace === -1 ? masked.length : closeBrace + 1;
        } else {
          bodyEnd = findStatementEnd(masked, bodyStart);
        }
        const classification = classifyContinueLoopForm(keyword, header);
        spans.push({
          keyword,
          header: header.replace(/\s+/gu, " ").trim(),
          headerIndex: keywordIndex,
          bodyStart,
          bodyEnd,
          form: classification.form,
          unresolvedReason: classification.unresolvedReason,
        });
        if (keyword === "do") {
          // O `while (...)` de cauda de um do/while não abre laço próprio:
          // sem isto ele viraria um `while` fantasma cujo corpo é o
          // `;` seguinte.
          const tailIndex = masked.indexOf("while", bodyEnd);
          if (tailIndex !== -1 && masked.slice(bodyEnd, tailIndex).trim().length === 0) {
            skippedKeywordIndices.add(tailIndex);
          }
        }
      }
    }
    match = keywordPattern.exec(masked);
  }
  return spans;
}

/** Deslocamento inicial de cada linha, para converter índice em número de linha sem refatiar o texto a cada ocorrência. */
function buildLineStartOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") offsets.push(index + 1);
  }
  return offsets;
}

function lineNumberAtIndex(lineStartOffsets: readonly number[], index: number): number {
  let low = 0;
  let high = lineStartOffsets.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStartOffsets[middle] <= index) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

interface ContinueOccurrence {
  readonly filePath: string;
  readonly line: number;
  readonly context: ContinueLexicalContext;
  readonly loopForm: ContinueLoopForm | undefined;
  readonly loopKeyword: ContinueLoopKeyword | undefined;
  readonly loopHeader: string | undefined;
  /** Guarda normalizada que precede o `continue` na mesma linha, quando há uma — discriminador estrutural disponível para quem chavear ocorrência, sem usar número de linha. */
  readonly guard: string | undefined;
  /** Domínio que o cursor do laço contenedor percorre (Goal053 §1), ou `undefined` quando a resolução não o provou. */
  readonly cursorDomain: ContinueCursorDomain | undefined;
  /** O trecho da árvore que CONCEDEU o domínio, com `arquivo:linha` da ligação — evidência verificável, não rótulo. */
  readonly cursorDomainEvidence: string | undefined;
  /** Motivo escrito de o domínio não ter sido resolvido; reprova em `findContinueEnumerationFindings`. */
  readonly unresolvedDomainReason: string | undefined;
  readonly text: string;
  readonly unresolvedReason: string | undefined;
}

/** Laço mais interno cujo corpo contém `index`, ou `undefined` se nenhum contém. */
function innermostLoopSpanAt(
  spans: readonly ContinueLoopSpan[],
  index: number,
): ContinueLoopSpan | undefined {
  let innermost: ContinueLoopSpan | undefined;
  for (const span of spans) {
    if (span.bodyStart <= index && index < span.bodyEnd) {
      if (innermost === undefined || span.bodyStart > innermost.bodyStart) innermost = span;
    }
  }
  return innermost;
}

/** Trecho `if (…)` imediatamente antes do `continue` na mesma linha, normalizado, ou `undefined` quando o `continue` é nu. */
function guardPrecedingContinue(lineText: string, continueColumn: number): string | undefined {
  const before = lineText.slice(0, continueColumn);
  const match = /(if\s*\([\s\S]*\))\s*$/u.exec(before);
  if (match === null) return undefined;
  return match[1].replace(/\s+/gu, " ").trim();
}

/** Escapa um identificador lido da árvore antes de entrar numa expressão regular — `$` é válido em identificador e metacaractere em regex. */
function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Divide o cabeçalho de um `for` nas suas cláusulas, respeitando parênteses, colchetes e chaves aninhados. */
function splitTopLevelSemicolons(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === ";" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/** Índice do primeiro `char` em profundidade zero a partir de `from`, ou `-1` quando o delimitador que contém `from` fecha antes. Roda sobre texto já mascarado. */
function indexOfTopLevelChar(masked: string, from: number, char: string): number {
  let depth = 0;
  for (let index = from; index < masked.length; index += 1) {
    const current = masked[index];
    if (depth === 0 && current === char) return index;
    if (current === "(" || current === "[" || current === "{") depth += 1;
    else if (current === ")" || current === "]" || current === "}") {
      if (depth === 0) return -1;
      depth -= 1;
    }
  }
  return -1;
}

/** Cursor escalar e limite do cabeçalho, quando ele compara um identificador nu com um limite. */
function cursorComparisonOfSpan(
  span: ContinueLoopSpan,
): { cursor: string; limit: string } | undefined {
  const condition =
    span.keyword === "for" ? (splitTopLevelSemicolons(span.header)[1] ?? "") : span.header;
  const match = /^([A-Za-z_$][\w$]*)\s*(?:<=|>=|<|>)\s*(.+)$/u.exec(
    stripRedundantParentheses(condition.trim()),
  );
  if (match === null) return undefined;
  return { cursor: match[1], limit: match[2].trim() };
}

/** Acesso indexado (`X[…]`) e leitura posicional de caractere (`X.charCodeAt(…)`, `X.slice(…)`) cujo argumento usa o cursor. */
const CURSOR_INDEXED_ACCESS_PATTERNS: readonly RegExp[] = [
  /([A-Za-z_$][\w$]*)\s*\[([^[\]]*)\]/gu,
  /([A-Za-z_$][\w$]*)\s*\.\s*(?:charCodeAt|charAt|codePointAt|slice|substring)\s*\(([^()]*)\)/gu,
];

/**
 * Todo identificador que o CURSOR indexa dentro do corpo do laço, com o
 * trecho da árvore real que provou o acesso. Roda sobre o texto mascarado,
 * então acesso escrito dentro de string, template ou comentário não conta.
 */
function cursorIndexedBases(
  source: string,
  masked: string,
  bodyStart: number,
  bodyEnd: number,
  cursor: string,
): Map<string, string> {
  const maskedBody = masked.slice(bodyStart, bodyEnd);
  const cursorUse = new RegExp(`(?<![\\w$])${escapeForRegExp(cursor)}(?![\\w$])`, "u");
  const bases = new Map<string, string>();
  for (const pattern of CURSOR_INDEXED_ACCESS_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(maskedBody);
    while (match !== null) {
      if (match[1] !== cursor && cursorUse.test(match[2]) && !bases.has(match[1])) {
        const from = bodyStart + match.index;
        bases.set(match[1], source.slice(from, from + match[0].length).replace(/\s+/gu, " ").trim());
      }
      match = pattern.exec(maskedBody);
    }
  }
  return bases;
}

/** Ligação de um identificador a um valor: declaração `const`/`let`/`var`, ou parâmetro anotado. */
interface ContinueValueBinding {
  readonly index: number;
  readonly line: number;
  readonly typeAnnotation: string | undefined;
  readonly initializer: string | undefined;
}

/**
 * A ligação de `name` mais próxima ANTES de `beforeIndex` — declaração ou
 * parâmetro. É posição léxica computada sobre o texto mascarado, nunca uma
 * lista de nomes conhecidos.
 */
function findNearestValueBinding(
  source: string,
  masked: string,
  lineStartOffsets: readonly number[],
  name: string,
  beforeIndex: number,
): ContinueValueBinding | undefined {
  const escaped = escapeForRegExp(name);
  let best: ContinueValueBinding | undefined;
  const consider = (candidate: ContinueValueBinding): void => {
    if (best === undefined || candidate.index > best.index) best = candidate;
  };

  const declaration = new RegExp(`\\b(?:const|let|var)\\s+${escaped}(?![\\w$])`, "gu");
  let match = declaration.exec(masked);
  while (match !== null && match.index < beforeIndex) {
    let cursor = skipMaskedWhitespace(masked, match.index + match[0].length);
    let typeAnnotation: string | undefined;
    let initializer: string | undefined;
    if (masked[cursor] === ":") {
      const assign = indexOfTopLevelChar(masked, cursor + 1, "=");
      const end = assign === -1 ? indexOfTopLevelChar(masked, cursor + 1, ";") : assign;
      if (end !== -1) {
        typeAnnotation = source.slice(cursor + 1, end).replace(/\s+/gu, " ").trim();
        cursor = end;
      }
    }
    if (masked[cursor] === "=") {
      const end = indexOfTopLevelChar(masked, cursor + 1, ";");
      initializer = source
        .slice(cursor + 1, end === -1 ? source.length : end)
        .replace(/\s+/gu, " ")
        .trim();
    }
    consider({
      index: match.index,
      line: lineNumberAtIndex(lineStartOffsets, match.index),
      typeAnnotation,
      initializer,
    });
    match = declaration.exec(masked);
  }

  const parameter = new RegExp(`[(,]\\s*(?:readonly\\s+)?${escaped}\\s*:`, "gu");
  match = parameter.exec(masked);
  while (match !== null && match.index < beforeIndex) {
    const colon = match.index + match[0].length - 1;
    const comma = indexOfTopLevelChar(masked, colon + 1, ",");
    const close = indexOfTopLevelChar(masked, colon + 1, ")");
    const end = comma !== -1 && (close === -1 || comma < close) ? comma : close;
    if (end !== -1) {
      consider({
        index: match.index,
        line: lineNumberAtIndex(lineStartOffsets, match.index),
        typeAnnotation: source.slice(colon + 1, end).replace(/\s+/gu, " ").trim(),
        initializer: undefined,
      });
    }
    match = parameter.exec(masked);
  }
  return best;
}

/** Tipo de retorno anotado de uma função declarada no módulo, quando há um. */
function moduleFunctionReturnType(masked: string, name: string): string | undefined {
  const declaration = new RegExp(`\\bfunction\\s+${escapeForRegExp(name)}\\s*\\(`, "u").exec(masked);
  if (declaration === null) return undefined;
  const open = masked.indexOf("(", declaration.index);
  const close = matchBalancedDelimiter(masked, open, "(", ")");
  if (close === -1) return undefined;
  const returnType = /^\s*:\s*([^{;]+)\{/u.exec(masked.slice(close + 1));
  return returnType === null ? undefined : returnType[1].replace(/\s+/gu, " ").trim();
}

/** Um tipo anotado é de arranjo quando termina em `[]` ou abre `Array<`/`ReadonlyArray<`. */
function isArrayTypeAnnotation(annotation: string): boolean {
  const normalized = annotation.trim();
  return normalized.endsWith("[]") || /^(?:Readonly)?Array\s*</u.test(normalized);
}

/** O que a resolução conseguiu provar sobre um identificador indexado pelo cursor. */
type ContinueBaseShape =
  | { readonly kind: "domain"; readonly domain: ContinueCursorDomain; readonly evidence: string }
  | {
      readonly kind: "array";
      readonly evidence: string;
      readonly lengthArgument: string | undefined;
    }
  | { readonly kind: "unresolved"; readonly reason: string };

/** Métodos de `String` que devolvem `string` quando o receptor é sequência de caracteres. */
const STRING_PRESERVING_METHODS =
  /^([A-Za-z_$][\w$]*)\s*\.\s*(trim|trimStart|trimEnd|slice|substring|toLowerCase|toUpperCase|replace|replaceAll|normalize|padStart|padEnd|concat|repeat)\s*\(/u;

/**
 * O domínio que `name` representa, provado pela sua ligação mais próxima no
 * texto do módulo. `depth` limita a cadeia de receptores (`body` vem de
 * `trimmed`, que vem do parâmetro `text: string`) e o que a cadeia não
 * fecha volta como motivo escrito, nunca como classe de sobra.
 */
function resolveIndexedBaseShape(
  source: string,
  masked: string,
  lineStartOffsets: readonly number[],
  filePath: string,
  name: string,
  beforeIndex: number,
  depth: number,
): ContinueBaseShape {
  if (depth <= 0) {
    return {
      kind: "unresolved",
      reason: `a cadeia de ligações de \`${name}\` excedeu a profundidade de resolução`,
    };
  }
  const binding = findNearestValueBinding(source, masked, lineStartOffsets, name, beforeIndex);
  if (binding === undefined) {
    return {
      kind: "unresolved",
      reason: `\`${name}\` não tem declaração nem parâmetro anotado antes do laço, então o domínio que ele representa não pode ser provado`,
    };
  }
  const where = `${filePath}:${binding.line}`;
  const initializer = binding.initializer ?? "";
  const annotation = binding.typeAnnotation;

  if (/(?:^|[\w$)\]])\s*\.\s*split\s*\(/u.test(initializer)) {
    return {
      kind: "domain",
      domain: "element-collection",
      evidence: `${where}: \`${name}\` recebe \`${initializer}\`, e \`.split(…)\` produz uma coleção cujos elementos são candidatos`,
    };
  }
  if (/\breadFileSync\s*\([^)]*["']utf8["']/u.test(initializer)) {
    return {
      kind: "domain",
      domain: "character-sequence",
      evidence: `${where}: \`${name}\` recebe \`${initializer}\`, leitura de arquivo em "utf8", que é sequência de caracteres`,
    };
  }
  if (/(?:^|[\w$)\]])\s*\.\s*join\s*\(/u.test(initializer)) {
    return {
      kind: "domain",
      domain: "character-sequence",
      evidence: `${where}: \`${name}\` recebe \`${initializer}\`, e \`.join(…)\` produz sequência de caracteres`,
    };
  }
  const preserving = STRING_PRESERVING_METHODS.exec(initializer);
  if (preserving !== null) {
    const receiver = resolveIndexedBaseShape(
      source,
      masked,
      lineStartOffsets,
      filePath,
      preserving[1],
      binding.index,
      depth - 1,
    );
    if (receiver.kind === "domain" && receiver.domain === "character-sequence") {
      return {
        kind: "domain",
        domain: "character-sequence",
        evidence: `${where}: \`${name}\` recebe \`${initializer}\`, e \`.${preserving[2]}(…)\` preserva a sequência de caracteres de \`${preserving[1]}\` — ${receiver.evidence}`,
      };
    }
  }
  const allocation = /^new\s+Array\s*(?:<[^<>]*>)?\s*\(([^)]*)\)/u.exec(initializer);
  if (allocation !== null) {
    return {
      kind: "array",
      evidence: `${where}: \`${name}\` recebe \`${initializer}\``,
      lengthArgument: allocation[1].replace(/\s+/gu, " ").trim(),
    };
  }
  if (annotation !== undefined && /^(?:readonly\s+)?string$/u.test(annotation)) {
    return {
      kind: "domain",
      domain: "character-sequence",
      evidence: `${where}: \`${name}\` é anotado \`: ${annotation}\``,
    };
  }
  const call = /^([A-Za-z_$][\w$]*)\s*\(/u.exec(initializer);
  if (call !== null) {
    const returnType = moduleFunctionReturnType(masked, call[1]);
    if (returnType !== undefined && /^(?:readonly\s+)?string$/u.test(returnType)) {
      return {
        kind: "domain",
        domain: "character-sequence",
        evidence: `${where}: \`${name}\` recebe \`${initializer}\`, e \`${call[1]}\` é declarada com retorno \`: ${returnType}\``,
      };
    }
    if (returnType !== undefined && isArrayTypeAnnotation(returnType)) {
      return {
        kind: "array",
        evidence: `${where}: \`${name}\` recebe \`${initializer}\`, e \`${call[1]}\` é declarada com retorno \`: ${returnType}\``,
        lengthArgument: undefined,
      };
    }
  }
  if (annotation !== undefined && isArrayTypeAnnotation(annotation)) {
    return {
      kind: "array",
      evidence: `${where}: \`${name}\` é anotado \`: ${annotation}\``,
      lengthArgument: undefined,
    };
  }
  if (/(?:^|[\w$)\]])\s*\.\s*map\s*\(/u.test(initializer)) {
    return {
      kind: "array",
      evidence: `${where}: \`${name}\` recebe \`${initializer}\`, e \`.map(…)\` produz arranjo`,
      lengthArgument: undefined,
    };
  }
  return {
    kind: "unresolved",
    reason: `a ligação de \`${name}\` em ${where}${annotation === undefined ? "" : ` (\`: ${annotation}\`)`}${initializer === "" ? "" : ` (\`= ${initializer}\`)`} não prova sequência de caracteres, máscara paralela nem coleção de elementos`,
  };
}

/** Domínio percorrido por um laço, com a evidência que o concedeu ou o motivo de não ter resolvido. */
interface ContinueCursorDomainResolution {
  readonly domain: ContinueCursorDomain | undefined;
  readonly evidence: string | undefined;
  readonly unresolvedReason: string | undefined;
}

/** Quantas ligações encadeadas a resolução de domínio percorre antes de devolver motivo escrito. */
const CONTINUE_DOMAIN_RESOLUTION_DEPTH = 4;

/** Precedência de APERTO: coleção de elementos vence, porque é a única que carrega candidato. */
const CONTINUE_DOMAIN_PRECEDENCE: readonly ContinueCursorDomain[] = [
  "element-collection",
  "character-sequence",
  "parallel-mask",
];

/**
 * O domínio que o cursor do laço percorre, computado do texto do módulo.
 * Nenhum ramo devolve domínio sem evidência: o que a resolução não prova
 * volta como motivo escrito, e `findContinueEnumerationFindings` reprova
 * nomeando `arquivo:linha`.
 */
function resolveContinueCursorDomain(
  source: string,
  masked: string,
  lineStartOffsets: readonly number[],
  filePath: string,
  span: ContinueLoopSpan,
): ContinueCursorDomainResolution {
  if (span.form === undefined) {
    // A classe do laço já reprovou com motivo próprio; não se empilha um
    // segundo motivo sobre a mesma ocorrência.
    return { domain: undefined, evidence: undefined, unresolvedReason: undefined };
  }
  if (!CURSOR_BEARING_LOOP_FORMS.has(span.form)) {
    return {
      domain: "no-domain",
      evidence: `laço \`${span.form}\` não avança por cursor escalar indexado: consome o que percorre diretamente (\`${span.keyword} (${span.header})\`)`,
      unresolvedReason: undefined,
    };
  }
  const comparison = cursorComparisonOfSpan(span);
  if (comparison === undefined) {
    return {
      domain: undefined,
      evidence: undefined,
      unresolvedReason: `laço \`${span.form}\` cujo cabeçalho \`${span.header}\` não expõe cursor escalar comparado a limite, então o domínio percorrido não pode ser resolvido`,
    };
  }
  const bases = cursorIndexedBases(source, masked, span.bodyStart, span.bodyEnd, comparison.cursor);
  if (bases.size === 0) {
    return {
      domain: undefined,
      evidence: undefined,
      unresolvedReason: `o cursor \`${comparison.cursor}\` do laço \`${span.keyword} (${span.header})\` não indexa valor algum no corpo, então o domínio percorrido não pode ser resolvido`,
    };
  }

  const resolved = new Map<string, { domain: ContinueCursorDomain; evidence: string }>();
  const arrays = new Map<string, { evidence: string; lengthArgument: string | undefined }>();
  const failures: string[] = [];
  for (const [base, access] of bases) {
    const shape = resolveIndexedBaseShape(
      source,
      masked,
      lineStartOffsets,
      filePath,
      base,
      span.headerIndex,
      CONTINUE_DOMAIN_RESOLUTION_DEPTH,
    );
    if (shape.kind === "domain") {
      resolved.set(base, { domain: shape.domain, evidence: `\`${access}\` — ${shape.evidence}` });
    } else if (shape.kind === "array") {
      arrays.set(base, {
        evidence: `\`${access}\` — ${shape.evidence}`,
        lengthArgument: shape.lengthArgument,
      });
    } else {
      failures.push(`\`${access}\`: ${shape.reason}`);
    }
  }

  // Máscara paralela: ou o comprimento do arranjo vem do comprimento de uma
  // sequência de caracteres, ou o MESMO cursor indexa o arranjo e uma
  // sequência de caracteres no mesmo corpo — cada posição é uma posição de
  // caractere. Nenhuma das duas provas cita nome de variável escrito à mão.
  const characterBase = [...resolved].find(([, entry]) => entry.domain === "character-sequence");
  for (const [base, entry] of arrays) {
    const lengthOf = /^([A-Za-z_$][\w$]*)\s*\.\s*length$/u.exec(entry.lengthArgument ?? "");
    if (lengthOf !== null) {
      const receiver = resolveIndexedBaseShape(
        source,
        masked,
        lineStartOffsets,
        filePath,
        lengthOf[1],
        span.headerIndex,
        CONTINUE_DOMAIN_RESOLUTION_DEPTH,
      );
      if (receiver.kind === "domain" && receiver.domain === "character-sequence") {
        resolved.set(base, {
          domain: "parallel-mask",
          evidence: `${entry.evidence}, cujo comprimento é \`${entry.lengthArgument}\` — ${receiver.evidence}`,
        });
        continue;
      }
    }
    if (characterBase !== undefined) {
      resolved.set(base, {
        domain: "parallel-mask",
        evidence: `${entry.evidence}, indexado pelo mesmo cursor \`${comparison.cursor}\` que indexa a sequência de caracteres \`${characterBase[0]}\` — ${characterBase[1].evidence}`,
      });
      continue;
    }
    failures.push(
      `${entry.evidence}: arranjo cujo comprimento não vem do comprimento de uma sequência de caracteres e que não é indexado pelo mesmo cursor de uma sequência de caracteres`,
    );
  }

  if (failures.length > 0) {
    return {
      domain: undefined,
      evidence: undefined,
      unresolvedReason: `o domínio percorrido pelo cursor \`${comparison.cursor}\` de \`${span.keyword} (${span.header})\` não foi resolvido: ${failures.join("; ")}`,
    };
  }
  for (const domain of CONTINUE_DOMAIN_PRECEDENCE) {
    const winner = [...resolved].find(([, entry]) => entry.domain === domain);
    if (winner !== undefined) {
      return { domain, evidence: winner[1].evidence, unresolvedReason: undefined };
    }
  }
  return {
    domain: undefined,
    evidence: undefined,
    unresolvedReason: `o domínio percorrido pelo cursor \`${comparison.cursor}\` de \`${span.keyword} (${span.header})\` não caiu em nenhuma classe de CONTINUE_CURSOR_DOMAINS`,
  };
}

/**
 * Acha TODA ocorrência de `continue;` no texto e devolve a classificação
 * computada de cada uma. A contagem total é `occurrences.length` — resultado
 * de execução, nunca número escrito à mão.
 */
function enumerateContinueOccurrences(source: string, filePath: string): ContinueOccurrence[] {
  const contexts = buildContinueLexicalContexts(source);
  const masked = maskNonCodeText(source, contexts);
  const spans = findContinueLoopSpans(masked);
  const lineStartOffsets = buildLineStartOffsets(source);
  const lines = source.split(/\r?\n/u);
  const occurrences: ContinueOccurrence[] = [];
  // Uma resolução de domínio por LAÇO, reaproveitada por toda ocorrência que
  // ele contém: a conta continua sendo uma só varredura de `continue;`.
  const domainBySpan = new Map<ContinueLoopSpan, ContinueCursorDomainResolution>();
  const domainOf = (span: ContinueLoopSpan): ContinueCursorDomainResolution => {
    const cached = domainBySpan.get(span);
    if (cached !== undefined) return cached;
    const resolution = resolveContinueCursorDomain(source, masked, lineStartOffsets, filePath, span);
    domainBySpan.set(span, resolution);
    return resolution;
  };
  const pattern = /\bcontinue\s*;/gu;
  let match = pattern.exec(source);
  while (match !== null) {
    const index = match.index;
    const line = lineNumberAtIndex(lineStartOffsets, index);
    const lineText = lines[line - 1] ?? "";
    const context = contexts[index] ?? "code";
    if (context !== "code") {
      occurrences.push({
        filePath,
        line,
        context,
        loopForm: undefined,
        loopKeyword: undefined,
        loopHeader: undefined,
        guard: undefined,
        cursorDomain: undefined,
        cursorDomainEvidence: undefined,
        unresolvedDomainReason: undefined,
        text: lineText.trim(),
        unresolvedReason: undefined,
      });
    } else {
      const enclosing = innermostLoopSpanAt(spans, index);
      const column = index - (lineStartOffsets[line - 1] ?? 0);
      const domain =
        enclosing === undefined
          ? { domain: undefined, evidence: undefined, unresolvedReason: undefined }
          : domainOf(enclosing);
      occurrences.push({
        filePath,
        line,
        context,
        loopForm: enclosing?.form,
        loopKeyword: enclosing?.keyword,
        loopHeader: enclosing?.header,
        guard: guardPrecedingContinue(lineText, column),
        cursorDomain: domain.domain,
        cursorDomainEvidence: domain.evidence,
        unresolvedDomainReason: domain.unresolvedReason,
        text: lineText.trim(),
        unresolvedReason:
          enclosing === undefined
            ? "nenhum laço contenedor encontrado para este `continue;`"
            : enclosing.unresolvedReason,
      });
    }
    match = pattern.exec(source);
  }
  return occurrences;
}

interface ContinueEnumerationFindings {
  /** Computado, nunca escrito à mão. */
  readonly total: number;
  readonly byContext: Readonly<Record<string, number>>;
  readonly byLoopForm: Readonly<Record<string, number>>;
  /** Contagem por DOMÍNIO percorrido (Goal053 §1); soma igual à de `byLoopForm` quando o resíduo é zero. */
  readonly byCursorDomain: Readonly<Record<string, number>>;
  readonly unresolved: string[];
  readonly outsideVocabulary: string[];
  readonly nonCode: string[];
}

/**
 * A conta única sobre as ocorrências enumeradas. O teste permanente a chama
 * sobre a leitura real de `http-egress-sites.ts`; os controles negativos a
 * chamam sobre fonte sintética e sobre ocorrência corrompida, e conferem que
 * a MESMA conta reprova — nunca uma segunda implementação à parte.
 */
function findContinueEnumerationFindings(
  occurrences: readonly ContinueOccurrence[],
): ContinueEnumerationFindings {
  const loopVocabulary = new Set<string>(CONTINUE_LOOP_FORMS);
  const contextVocabulary = new Set<string>(CONTINUE_LEXICAL_CONTEXTS);
  const domainVocabulary = new Set<string>(CONTINUE_CURSOR_DOMAINS);
  const byContext: Record<string, number> = {};
  const byLoopForm: Record<string, number> = {};
  const byCursorDomain: Record<string, number> = {};
  const unresolved: string[] = [];
  const outsideVocabulary: string[] = [];
  const nonCode: string[] = [];

  for (const occurrence of occurrences) {
    const where = `${occurrence.filePath}:${occurrence.line}`;
    byContext[occurrence.context] = (byContext[occurrence.context] ?? 0) + 1;
    if (!contextVocabulary.has(occurrence.context)) {
      outsideVocabulary.push(
        `${where}: contexto léxico "${occurrence.context}" fora de CONTINUE_LEXICAL_CONTEXTS`,
      );
      continue;
    }
    if (occurrence.context !== "code") {
      nonCode.push(`${where}: ocorrência em ${occurrence.context} — "${occurrence.text}"`);
      continue;
    }
    if (occurrence.loopForm === undefined) {
      unresolved.push(
        `${where}: ${occurrence.unresolvedReason ?? "laço contenedor não resolvido, e sem motivo registrado"} — "${occurrence.text}"`,
      );
      continue;
    }
    if (!loopVocabulary.has(occurrence.loopForm)) {
      outsideVocabulary.push(
        `${where}: classe "${occurrence.loopForm}" fora de CONTINUE_LOOP_FORMS — "${occurrence.text}"`,
      );
      continue;
    }
    // O domínio percorrido é conferido no MESMO resíduo da classe de laço:
    // não resolvido reprova com motivo escrito, fora do vocabulário reprova
    // nomeado, e domínio sem evidência que o conceda também reprova.
    if (occurrence.cursorDomain === undefined) {
      unresolved.push(
        `${where}: ${occurrence.unresolvedDomainReason ?? "domínio percorrido não resolvido, e sem motivo registrado"} — "${occurrence.text}"`,
      );
      continue;
    }
    if (!domainVocabulary.has(occurrence.cursorDomain)) {
      outsideVocabulary.push(
        `${where}: domínio "${occurrence.cursorDomain}" fora de CONTINUE_CURSOR_DOMAINS — "${occurrence.text}"`,
      );
      continue;
    }
    if (
      occurrence.cursorDomainEvidence === undefined ||
      occurrence.cursorDomainEvidence.trim() === ""
    ) {
      unresolved.push(
        `${where}: domínio "${occurrence.cursorDomain}" sem evidência registrada — "${occurrence.text}"`,
      );
      continue;
    }
    byLoopForm[occurrence.loopForm] = (byLoopForm[occurrence.loopForm] ?? 0) + 1;
    byCursorDomain[occurrence.cursorDomain] = (byCursorDomain[occurrence.cursorDomain] ?? 0) + 1;
  }

  return {
    total: occurrences.length,
    byContext,
    byLoopForm,
    byCursorDomain,
    unresolved,
    outsideVocabulary,
    nonCode,
  };
}

describe("Goal052 / WU-01 (§1 e §2) — `continue;` é enumerado por inteiro e classificado pela forma do laço contenedor: resíduo reprova, classe fora do vocabulário reprova, e o total é computado em runtime", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");
  const realOccurrences = enumerateContinueOccurrences(moduleSource, "http-egress-sites.ts");
  const realFindings = findContinueEnumerationFindings(realOccurrences);

  it("a contagem total é computada em runtime e bate, ocorrência a ocorrência, com a contagem textual independente de `continue;` — nenhum número escrito à mão em lugar nenhum", () => {
    const textualTotal = (moduleSource.match(/\bcontinue\s*;/gu) ?? []).length;
    expect(realFindings.total).toBe(textualTotal);
    // Não vácuo: o módulo realmente tem ocorrências, senão o teste inteiro
    // passaria sobre lista vazia.
    expect(realFindings.total).toBeGreaterThan(0);
    expect(realOccurrences).toHaveLength(realFindings.total);
  });

  it("o comentário de alcance parcial de DOCUMENTED_SILENT_DISCARDS não carrega mais número de ocorrências escrito à mão", () => {
    const ownSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const declarationIndex = ownSource.indexOf("interface SilentDiscardEntry");
    expect(declarationIndex).toBeGreaterThan(-1);
    const commentStart = ownSource.lastIndexOf("/**", declarationIndex);
    const commentBlock = ownSource.slice(commentStart, declarationIndex);
    expect(commentBlock).toContain("Alcance DECLARADAMENTE PARCIAL");
    expect(commentBlock).not.toMatch(/\d+\s*ocorrências/u);
    expect(commentBlock).toContain("enumerateContinueOccurrences");
  });

  it("sobre a árvore real o resíduo é zero: nenhuma ocorrência fica sem classe, nenhuma classe cai fora do vocabulário, e a soma por classe reconstrói o total", () => {
    expect(realFindings.unresolved).toEqual([]);
    expect(realFindings.outsideVocabulary).toEqual([]);
    const classified = Object.values(realFindings.byLoopForm).reduce((sum, count) => sum + count, 0);
    expect(classified + realFindings.nonCode.length).toBe(realFindings.total);
    for (const form of Object.keys(realFindings.byLoopForm)) {
      expect(CONTINUE_LOOP_FORMS).toContain(form);
    }
  });

  it("ocorrência em literal de string, em template ou em comentário é reconhecida pelo contexto léxico e NOMEADA — na árvore real a lista é vazia, computada, e a fonte sintética prova que o ramo não é morto", () => {
    expect(realFindings.nonCode).toEqual([]);
    expect(realFindings.byContext.code).toBe(realFindings.total);

    const synthetic = [
      'const literal = "if (!x) continue;";',
      "// comentário de linha com continue; dentro",
      "/* comentário de bloco com continue; dentro */",
      "const template = `texto com continue; dentro`;",
      "function scan(items) {",
      "  for (const item of items) {",
      "    if (!item) continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const syntheticFindings = findContinueEnumerationFindings(
      enumerateContinueOccurrences(synthetic, "sintetico.ts"),
    );
    expect(syntheticFindings.total).toBe(5);
    expect(syntheticFindings.byContext).toEqual({
      "string-literal": 1,
      comment: 2,
      "template-literal": 1,
      code: 1,
    });
    expect(syntheticFindings.nonCode).toEqual([
      'sintetico.ts:1: ocorrência em string-literal — "const literal = "if (!x) continue;";"',
      'sintetico.ts:2: ocorrência em comment — "// comentário de linha com continue; dentro"',
      'sintetico.ts:3: ocorrência em comment — "/* comentário de bloco com continue; dentro */"',
      'sintetico.ts:4: ocorrência em template-literal — "const template = `texto com continue; dentro`;"',
    ]);
    expect(syntheticFindings.unresolved).toEqual([]);
    expect(syntheticFindings.byLoopForm).toEqual({ "for-of": 1 });
  });

  it("cada classe do vocabulário fechado tem prova: as cinco presentes na árvore real são aferidas com contagem maior que zero, e as duas ausentes são exercidas por fonte sintética — nenhuma classe declarada só em prosa", () => {
    const presentInRealTree: ContinueLoopForm[] = [
      "for-of",
      "for-indexed",
      "while-exec-match",
      "while-queue-drain",
      "while-positional-read",
    ];
    for (const form of presentInRealTree) {
      expect(realFindings.byLoopForm[form]).toBeGreaterThan(0);
    }
    const absentFromRealTree: ContinueLoopForm[] = ["for-in", "do-while"];
    for (const form of absentFromRealTree) {
      expect(realFindings.byLoopForm[form]).toBeUndefined();
    }
    // As duas classes vazias na árvore real são povoadas por fonte sintética,
    // com as duas saídas: ausente no real, presente e classificada aqui.
    const synthetic = [
      "function scan(record, limit) {",
      "  for (const key in record) {",
      "    if (!key) continue;",
      "  }",
      "  let i = 0;",
      "  do {",
      "    i += 1;",
      "    continue;",
      "  } while (i < limit);",
      "}",
      "",
    ].join("\n");
    const syntheticFindings = findContinueEnumerationFindings(
      enumerateContinueOccurrences(synthetic, "sintetico.ts"),
    );
    expect(syntheticFindings.unresolved).toEqual([]);
    expect(syntheticFindings.byLoopForm).toEqual({ "for-in": 1, "do-while": 1 });
    // Toda classe do vocabulário está coberta por uma das duas provas.
    expect([...presentInRealTree, ...absentFromRealTree].sort()).toEqual(
      [...CONTINUE_LOOP_FORMS].sort(),
    );
  });

  it("ocorrência cujo laço contenedor não é resolvido REPROVA nomeando arquivo:linha e o motivo, em vez de ser isentada — nas duas formas: laço de forma não reconhecida e `continue;` sem laço algum", () => {
    // Antes: a mesma ocorrência dentro de um laço reconhecido não reprova.
    const recognized = [
      "function scan(candidatos) {",
      "  for (const candidato of candidatos) {",
      "    continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const recognizedFindings = findContinueEnumerationFindings(
      enumerateContinueOccurrences(recognized, "sintetico.ts"),
    );
    expect(recognizedFindings.unresolved).toEqual([]);
    expect(recognizedFindings.byLoopForm).toEqual({ "for-of": 1 });

    // Depois: cabeçalho de `for` fora das formas reconhecidas reprova.
    const unrecognizedLoop = [
      "function scan(candidatos) {",
      "  for (candidatos) {",
      "    continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const unrecognizedFindings = findContinueEnumerationFindings(
      enumerateContinueOccurrences(unrecognizedLoop, "sintetico.ts"),
    );
    expect(unrecognizedFindings.byLoopForm).toEqual({});
    expect(unrecognizedFindings.unresolved).toHaveLength(1);
    expect(unrecognizedFindings.unresolved[0]).toMatch(
      /^sintetico\.ts:3: cabeçalho de `for` fora das formas reconhecidas \(for-of, for-in, for indexado\): "candidatos" — "continue;"$/u,
    );

    // E cabeçalho de `while` fora dos três critérios também reprova: não há
    // classe de sobra para `while` desde a rodada 2 do Goal052.
    const unrecognizedWhile = [
      "function scan(state) {",
      "  while (state.ready && state.pending) {",
      "    continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const unrecognizedWhileFindings = findContinueEnumerationFindings(
      enumerateContinueOccurrences(unrecognizedWhile, "sintetico.ts"),
    );
    expect(unrecognizedWhileFindings.byLoopForm).toEqual({});
    expect(unrecognizedWhileFindings.unresolved).toEqual([
      'sintetico.ts:3: cabeçalho de `while` fora das formas reconhecidas (exec-match, drenagem de fila, cursor posicional): "state.ready && state.pending" — "continue;"',
    ]);

    // E `continue;` sem laço contenedor algum também reprova, nomeado.
    const withoutLoop = ["function scan() {", "  continue;", "}", ""].join("\n");
    const withoutLoopFindings = findContinueEnumerationFindings(
      enumerateContinueOccurrences(withoutLoop, "sintetico.ts"),
    );
    expect(withoutLoopFindings.unresolved).toEqual([
      'sintetico.ts:2: nenhum laço contenedor encontrado para este `continue;` — "continue;"',
    ]);
  });

  it("classe fora do vocabulário declarado REPROVA, nomeando arquivo:linha — o vocabulário é fechado de verdade, não uma lista decorativa", () => {
    const [firstReal] = realOccurrences;
    expect(firstReal).toBeDefined();
    // Antes: a ocorrência real, com a classe que a classificação computou, passa.
    expect(findContinueEnumerationFindings([firstReal]).outsideVocabulary).toEqual([]);
    // Depois: a MESMA ocorrência com uma classe inventada reprova na mesma conta.
    const corrupted: ContinueOccurrence = {
      ...firstReal,
      loopForm: "loop-inventado" as ContinueLoopForm,
    };
    const corruptedFindings = findContinueEnumerationFindings([corrupted]);
    expect(corruptedFindings.outsideVocabulary).toHaveLength(1);
    expect(corruptedFindings.outsideVocabulary[0]).toContain(
      `http-egress-sites.ts:${firstReal.line}: classe "loop-inventado" fora de CONTINUE_LOOP_FORMS`,
    );
    expect(corruptedFindings.byLoopForm).toEqual({});
  });

  it("a partição do `while` é critério computado, não isenção em bloco: na árvore real as 6 ocorrências de `while` sem `.exec(` se separam em 5 de leitura posicional (`:1458`, `:1484`, `:2989`, `:2996`, `:2999`) e 1 de drenagem de fila (`:1028`), e só esta última exige registro", () => {
    const byLine = new Map(realOccurrences.map((occurrence) => [occurrence.line, occurrence]));

    const positionalLines = [1458, 1484, 2989, 2996, 2999];
    for (const line of positionalLines) {
      expect(byLine.get(line)?.loopForm).toBe("while-positional-read");
    }
    expect(byLine.get(1028)?.loopForm).toBe("while-queue-drain");
    expect(byLine.get(1028)?.loopHeader).toBe("pendingPrimitives.length > 0");

    // As duas classes juntas reconstroem exatamente o conjunto de `while`
    // sem `.exec(` da árvore — nenhuma ocorrência sobra fora delas.
    const whileWithoutExec = realOccurrences.filter(
      (occurrence) =>
        occurrence.loopKeyword === "while" && occurrence.loopForm !== "while-exec-match",
    );
    expect(whileWithoutExec.map((occurrence) => occurrence.line).sort((a, b) => a - b)).toEqual(
      [...positionalLines, 1028].sort((a, b) => a - b),
    );
  });

  it("Goal053 §1 — toda ocorrência em contexto de código recebe um DOMÍNIO percorrido do vocabulário fechado, com a evidência que o concedeu registrada: o resíduo é zero e a soma por domínio reconstrói o total de código", () => {
    const codeOccurrences = realOccurrences.filter((occurrence) => occurrence.context === "code");
    expect(codeOccurrences).toHaveLength(realFindings.total - realFindings.nonCode.length);
    expect(codeOccurrences.length).toBeGreaterThan(0);

    for (const occurrence of codeOccurrences) {
      const where = `${occurrence.filePath}:${occurrence.line}`;
      expect(occurrence.unresolvedDomainReason, where).toBeUndefined();
      expect(CONTINUE_CURSOR_DOMAINS, where).toContain(occurrence.cursorDomain);
      expect(occurrence.cursorDomainEvidence, where).toBeDefined();
      expect((occurrence.cursorDomainEvidence ?? "").trim().length, where).toBeGreaterThan(0);
    }

    expect(realFindings.unresolved).toEqual([]);
    expect(realFindings.outsideVocabulary).toEqual([]);
    const byDomainTotal = Object.values(realFindings.byCursorDomain).reduce(
      (sum, count) => sum + count,
      0,
    );
    const byFormTotal = Object.values(realFindings.byLoopForm).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(byDomainTotal).toBe(codeOccurrences.length);
    expect(byDomainTotal).toBe(byFormTotal);
    for (const domain of Object.keys(realFindings.byCursorDomain)) {
      expect(CONTINUE_CURSOR_DOMAINS).toContain(domain);
    }

    // As duas partições — por classe de laço e por domínio — recortam o
    // MESMO conjunto: só as formas de cursor escalar percorrem domínio, e
    // todas as demais caem em `no-domain`. A igualdade é computada das duas
    // contagens, nunca escrita à mão.
    const cursorBearingTotal = Object.entries(realFindings.byLoopForm)
      .filter(([form]) => CURSOR_BEARING_LOOP_FORMS.has(form as ContinueLoopForm))
      .reduce((sum, [, count]) => sum + count, 0);
    const indexedDomainTotal = byDomainTotal - (realFindings.byCursorDomain["no-domain"] ?? 0);
    expect(indexedDomainTotal).toBe(cursorBearingTotal);
  });

  it("Goal053 §1/§5 — cada domínio do vocabulário fechado tem prova: os três presentes na árvore real são aferidos com contagem maior que zero, e `parallel-mask`, vazio na árvore, é exercido por fonte sintética — nenhum domínio declarado só em prosa", () => {
    const presentInRealTree: ContinueCursorDomain[] = [
      "character-sequence",
      "element-collection",
      "no-domain",
    ];
    for (const domain of presentInRealTree) {
      expect(realFindings.byCursorDomain[domain], domain).toBeGreaterThan(0);
    }
    // Vazio na árvore real porque toda máscara paralela que a árvore indexa
    // é percorrida pelo MESMO cursor de uma sequência de caracteres, e a
    // precedência de aperto dá o domínio à sequência.
    const absentFromRealTree: ContinueCursorDomain[] = ["parallel-mask"];
    for (const domain of absentFromRealTree) {
      expect(realFindings.byCursorDomain[domain], domain).toBeUndefined();
    }
    expect([...presentInRealTree, ...absentFromRealTree].sort()).toEqual(
      [...CONTINUE_CURSOR_DOMAINS].sort(),
    );

    // Fonte sintética que povoa o domínio vazio: o cursor indexa SÓ a
    // máscara, e o comprimento dela vem do comprimento de uma sequência de
    // caracteres — a prova de paralelismo não cita nome de variável.
    const synthetic = [
      "function scan(source: string) {",
      "  const marks = new Array<boolean>(source.length).fill(false);",
      "  for (let i = 0; i < marks.length; i += 1) {",
      "    if (marks[i]) continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const syntheticOccurrences = enumerateContinueOccurrences(synthetic, "sintetico.ts");
    const syntheticFindings = findContinueEnumerationFindings(syntheticOccurrences);
    expect(syntheticFindings.unresolved).toEqual([]);
    expect(syntheticFindings.outsideVocabulary).toEqual([]);
    expect(syntheticFindings.byCursorDomain).toEqual({ "parallel-mask": 1 });
    expect(syntheticOccurrences[0]?.cursorDomainEvidence).toContain(
      "cujo comprimento é `source.length`",
    );
  });

  it("Goal053 §1 — a evidência que concedeu o domínio é VERIFICÁVEL: ela cita `arquivo:linha` da ligação que provou o valor indexado, ou a classe de laço que dispensa cursor", () => {
    const codeOccurrences = realOccurrences.filter((occurrence) => occurrence.context === "code");
    for (const occurrence of codeOccurrences) {
      const where = `${occurrence.filePath}:${occurrence.line}`;
      const evidence = occurrence.cursorDomainEvidence ?? "";
      if (occurrence.cursorDomain === "no-domain") {
        expect(evidence, where).toContain("não avança por cursor escalar indexado");
        expect(CURSOR_BEARING_LOOP_FORMS.has(occurrence.loopForm as ContinueLoopForm), where).toBe(
          false,
        );
        continue;
      }
      expect(CURSOR_BEARING_LOOP_FORMS.has(occurrence.loopForm as ContinueLoopForm), where).toBe(
        true,
      );
      // `http-egress-sites.ts:318` e afins: a evidência aponta a linha da
      // ligação, e a linha existe no módulo lido.
      const cited = new RegExp(`${occurrence.filePath}:(\\d+)`, "gu");
      const lines = [...evidence.matchAll(cited)].map((match) => Number(match[1]));
      expect(lines.length, `${where}: ${evidence}`).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line, `${where}: ${evidence}`).toBeGreaterThan(0);
        expect(line, `${where}: ${evidence}`).toBeLessThanOrEqual(
          moduleSource.split(/\r?\n/u).length,
        );
      }
    }
  });

  it("Goal053 §1 — o domínio não vem de lista de nomes de variável, de recuo nem de nome de função: as ocorrências sobre `lines` são coleção de elementos e as sobre `source`/`text`/`body` são sequência de caracteres, cada uma pela ligação que a provou", () => {
    const byLine = new Map(realOccurrences.map((occurrence) => [occurrence.line, occurrence]));

    // `lines` vem de `source.split(…)` — a evidência é o `.split(`, não o nome.
    const collectionLines = [1141, 1143, 1157, 1159, 1160, 3872];
    for (const line of collectionLines) {
      const occurrence = byLine.get(line);
      expect(occurrence?.cursorDomain, `linha ${line}`).toBe("element-collection");
      expect(occurrence?.cursorDomainEvidence, `linha ${line}`).toContain(".split(…)");
    }
    // E o conjunto é EXATAMENTE esse: nenhuma outra ocorrência da árvore cai
    // em coleção de elementos, e o número sai da execução, não deste arquivo.
    expect(
      realOccurrences
        .filter((occurrence) => occurrence.cursorDomain === "element-collection")
        .map((occurrence) => occurrence.line)
        .sort((a, b) => a - b),
    ).toEqual([...collectionLines].sort((a, b) => a - b));

    // `:1458` e `:1484` percorrem `body`, que vem de `trimmed.slice(1, -1)`,
    // que vem de `text.trim()`, que vem do parâmetro `text: string`.
    for (const line of [1458, 1484]) {
      const occurrence = byLine.get(line);
      expect(occurrence?.loopForm, `linha ${line}`).toBe("while-positional-read");
      expect(occurrence?.cursorDomain, `linha ${line}`).toBe("character-sequence");
    }

    // A classe `while-queue-drain` de `:1028` não indexa nada: `no-domain`.
    expect(byLine.get(1028)?.cursorDomain).toBe("no-domain");
  });

  it("Goal053 §1 — domínio não resolvido REPROVA nomeando arquivo:linha e o motivo, e domínio fora do vocabulário também reprova — nenhum ramo else mudo", () => {
    // Laço de cursor escalar cujo corpo não indexa valor algum: a forma do
    // cabeçalho é reconhecida, mas o domínio não, e isso reprova.
    const withoutIndexing = [
      "function scan(limit) {",
      "  let total = 0;",
      "  for (let i = 0; i < limit; i += 1) {",
      "    total += 1;",
      "    continue;",
      "  }",
      "  return total;",
      "}",
      "",
    ].join("\n");
    const withoutIndexingFindings = findContinueEnumerationFindings(
      enumerateContinueOccurrences(withoutIndexing, "sintetico.ts"),
    );
    expect(withoutIndexingFindings.byLoopForm).toEqual({});
    expect(withoutIndexingFindings.byCursorDomain).toEqual({});
    expect(withoutIndexingFindings.unresolved).toEqual([
      'sintetico.ts:5: o cursor `i` do laço `for (let i = 0; i < limit; i += 1)` não indexa valor algum no corpo, então o domínio percorrido não pode ser resolvido — "continue;"',
    ]);

    // Cursor que indexa um valor cuja ligação não prova domínio algum.
    const unprovenBase = [
      "function scan(limit, bucket) {",
      "  for (let i = 0; i < limit; i += 1) {",
      "    if (bucket[i]) continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const unprovenFindings = findContinueEnumerationFindings(
      enumerateContinueOccurrences(unprovenBase, "sintetico.ts"),
    );
    expect(unprovenFindings.byCursorDomain).toEqual({});
    expect(unprovenFindings.unresolved).toHaveLength(1);
    expect(unprovenFindings.unresolved[0]).toMatch(
      /^sintetico\.ts:3: o domínio percorrido pelo cursor `i` de `for \(let i = 0; i < limit; i \+= 1\)` não foi resolvido: /u,
    );
    expect(unprovenFindings.unresolved[0]).toContain("`bucket[i]`");

    // Depois: a MESMA ocorrência com domínio inventado reprova na mesma conta.
    const [firstReal] = realOccurrences.filter((occurrence) => occurrence.context === "code");
    expect(firstReal).toBeDefined();
    expect(findContinueEnumerationFindings([firstReal]).outsideVocabulary).toEqual([]);
    const corrupted: ContinueOccurrence = {
      ...firstReal,
      cursorDomain: "dominio-inventado" as ContinueCursorDomain,
    };
    const corruptedFindings = findContinueEnumerationFindings([corrupted]);
    expect(corruptedFindings.outsideVocabulary).toEqual([
      `http-egress-sites.ts:${firstReal.line}: domínio "dominio-inventado" fora de CONTINUE_CURSOR_DOMAINS — "${firstReal.text}"`,
    ]);
    expect(corruptedFindings.byCursorDomain).toEqual({});

    // E domínio do vocabulário sem evidência registrada também reprova.
    const withoutEvidence = findContinueEnumerationFindings([
      { ...firstReal, cursorDomainEvidence: undefined },
    ]);
    expect(withoutEvidence.unresolved).toEqual([
      `http-egress-sites.ts:${firstReal.line}: domínio "${firstReal.cursorDomain}" sem evidência registrada — "${firstReal.text}"`,
    ]);
    expect(withoutEvidence.byCursorDomain).toEqual({});
  });

  it("a classificação não depende de recuo por indentação: as cinco ocorrências em que a sondagem do Goal052 falhou (:1761, :1765, :1769, :1773, :1796) estão classificadas, cada uma com a forma do laço que de fato a contém", () => {
    const probeFailures = [1761, 1765, 1769, 1773, 1796];
    const byLine = new Map(realOccurrences.map((occurrence) => [occurrence.line, occurrence]));
    for (const line of probeFailures) {
      const occurrence = byLine.get(line);
      expect(occurrence).toBeDefined();
      expect(occurrence?.context).toBe("code");
      expect(occurrence?.loopForm).toBeDefined();
      expect(CONTINUE_LOOP_FORMS).toContain(occurrence?.loopForm);
      expect(occurrence?.unresolvedReason).toBeUndefined();
    }
  });
});

/* =========================================================================
 * Goal052 / WU-02 (§3 e §4) — o registro unificado de descarte: chave que
 * sobrevive à forma nua.
 *
 * O Goal050 registrava só a forma idiomática de guarda de linha única. O
 * Goal052/WU-01 (acima) passou a enumerar e classificar TODA ocorrência de
 * `continue;`, mas sem ligar essa enumeração ao registro. Aqui as duas se
 * juntam: `DOCUMENTED_SILENT_DISCARDS` passa a cobrir toda ocorrência da
 * classe **iteração sobre candidatos** (`CONTINUE_CANDIDATE_LOOP_FORMS`,
 * abaixo — subconjunto de `CONTINUE_LOOP_FORMS`), computada pela mesma
 * `enumerateContinueOccurrences`, nunca uma segunda varredura à parte.
 *
 * O Goal053 §2 aperta o critério: a isenção não é mais decidida só pela
 * classe do cabeçalho, e sim pelo DOMÍNIO que o cursor percorre
 * (`resolveContinueCursorDomain`, Goal053 §1). Sequência de caracteres e
 * máscara paralela continuam isentas — cada volta avança leitura, nunca
 * descarta candidato —, mas coleção de elementos passa a EXIGIR registro
 * mesmo quando a forma do cabeçalho é `for-indexed`: a árvore real tem 6
 * ocorrências assim, sobre `lines` (produzido por `.split(…)`), que o
 * Goal052 isentava em bloco só por ler como leitura posicional.
 *
 * `SilentDiscardOccurrence.requiresRegistration` (acima) é o campo que
 * carrega o resultado; `requiresSilentDiscardRegistration` (abaixo) é onde
 * o critério é de fato computado.
 *
 * A chave continua `<função>::<trecho normalizado>` (Goal050), sem número
 * de linha (proibido desde o Goal050). `continue;` nu normaliza sempre para
 * a mesma string, e a sondagem desta Work Unit achou a colisão de fato na
 * árvore real — várias ocorrências nuas dentro do MESMO laço da mesma
 * função (`resolveModuleExportBindings`, 7; `discoverGoBoundRawFetchRequests`,
 * 6; `resolveDestination`, 5; entre outras), onde nenhum discriminador
 * estrutural (cabeçalho de laço, guarda) as distingue — só a posição as
 * distinguiria, e posição é exatamente o que está proibido. O Goal052
 * entrega a segunda opção que o próprio Goal autoriza:
 * `SilentDiscardEntry.multiplicity` declara quantas ocorrências legítimas
 * compartilham a chave, e `findSilentDiscardFindings` (acima) reprova por
 * ambiguidade quando a contagem real diverge da declarada, nos dois
 * sentidos, sem ler linha alguma.
 * ========================================================================= */

/**
 * Vocabulário da classe **iteração sobre candidatos** (Goal052 §2/§3):
 * subconjunto de `CONTINUE_LOOP_FORMS` em que cada volta do laço é um
 * candidato, e o `continue` o descarta — `for-of`, `while-exec-match` e
 * `while-queue-drain`.
 *
 * `while-queue-drain` está aqui por critério computado, não por prosa: o
 * cabeçalho testa a não-vaziez da própria coleção e cada volta consome um
 * elemento dela, que é a mesma relação entre volta e candidato do `for…of`.
 * Na árvore real a classe tem uma ocorrência —
 * `discoverHttpEgressSites::if (scannedPrimitiveDeclarations.has(declarationKey)) continue;`
 * — e ela EXIGE registro como qualquer outra da classe. Até a rodada 1 do
 * Goal052 ela ficava isenta por cair num único `while-condition` sem
 * critério, que era o fail-open que esta rodada fecha.
 *
 * `for-indexed` e `while-positional-read` (as duas formas de leitura
 * posicional) continuam FORA deste vocabulário por forma — mas, desde o
 * Goal053 §2, isso não basta mais para isentar do registro: quando o
 * domínio que o cursor de uma delas percorre é `element-collection`, a
 * ocorrência exige registro do mesmo jeito que `for-of` exige — só que
 * pelo domínio, não pela classe (`requiresSilentDiscardRegistration`,
 * abaixo). A isenção genuína por forma sintática — sequência de caracteres
 * e máscara paralela — continua sem registro por ocorrência.
 *
 * `for-in` e `do-while` também ficam de fora deste vocabulário — ausentes
 * da árvore real (provado pelo Goal052/WU-01 acima), e o Goal declara
 * alcance mínimo sobre o que a árvore de fato contém, ampliável se a
 * execução exigir.
 */
const CONTINUE_CANDIDATE_LOOP_FORMS: ReadonlySet<ContinueLoopForm> = new Set([
  "for-of",
  "while-exec-match",
  "while-queue-drain",
]);

/**
 * O critério de isenção de registro (Goal053 §2): o DOMÍNIO que o cursor do
 * laço contenedor percorre (`ContinueOccurrence.cursorDomain`, Goal053 §1),
 * não mais só a classe sintática do cabeçalho.
 *
 * - `character-sequence` e `parallel-mask`: isentas — cada volta avança
 *   leitura, nunca descarta candidato.
 * - `element-collection`: EXIGE registro — cada volta é um candidato,
 *   mesmo quando a forma do cabeçalho é `for-indexed` (o Goal052 isentava
 *   em bloco por essa forma; a árvore real tem 6 ocorrências assim, sobre
 *   `lines`, produzido por `.split(…)`).
 * - `no-domain` (laço que não indexa nada — `for-of`, `while-exec-match`,
 *   `while-queue-drain`, `for-in`, `do-while`): decidido pela classe, como
 *   no Goal052, por `CONTINUE_CANDIDATE_LOOP_FORMS` — cada volta dessas
 *   formas já é diretamente um candidato, sem cursor indexado a resolver.
 * - domínio não resolvido (Goal053 §1 reprovou a resolução com motivo
 *   escrito, mas a ocorrência ainda assim entra aqui): fail-closed — EXIGE
 *   registro, nunca isenta em silêncio por falta de prova.
 */
function requiresSilentDiscardRegistration(occurrence: ContinueOccurrence): boolean {
  if (occurrence.cursorDomain === "character-sequence" || occurrence.cursorDomain === "parallel-mask") {
    return false;
  }
  if (occurrence.cursorDomain === "element-collection") {
    return true;
  }
  if (occurrence.cursorDomain === "no-domain") {
    return occurrence.loopForm !== undefined && CONTINUE_CANDIDATE_LOOP_FORMS.has(occurrence.loopForm);
  }
  return true;
}

/**
 * Toda ocorrência de `continue;` em contexto de código de `source`,
 * convertida para o vocabulário do registro de descarte: âncora pela função
 * de nível superior, chave estável (`silentDiscardKey`, sem número de
 * linha), e `requiresRegistration` computado por
 * `requiresSilentDiscardRegistration` (acima) — o DOMÍNIO percorrido, não
 * mais só a classe do laço contenedor (Goal053 §2). Reusa
 * `enumerateContinueOccurrences` (Goal052/WU-01); não reimplementa a
 * varredura de `continue;` à parte. É a fonte que o teste permanente
 * abaixo e os controles negativos do §8 chamam.
 */
function enumerateSilentDiscardOccurrences(
  source: string,
  filePath: string,
): SilentDiscardOccurrence[] {
  return enumerateContinueOccurrences(source, filePath)
    .filter((occurrence) => occurrence.context === "code")
    .map((occurrence) => {
      const anchor = resolveEnclosingTopLevelFunctionName(source, occurrence.line);
      return {
        line: occurrence.line,
        snippet: occurrence.text,
        anchor,
        key: silentDiscardKey(anchor, occurrence.text),
        requiresRegistration: requiresSilentDiscardRegistration(occurrence),
      };
    });
}

describe("Goal052 / WU-02 (§3 e §4) — o registro unificado de descarte cobre toda a classe portadora de candidato, e a chave sobrevive à forma nua por multiplicidade declarada", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");
  const realOccurrences = enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts");

  it("a exigência de registro segue a CLASSE do laço, não a forma da guarda: na árvore real as 5 ocorrências `while-positional-read` não exigem registro e a única `while-queue-drain` (`:1028`) exige, e está registrada com motivo escrito", () => {
    const byLine = new Map(realOccurrences.map((occurrence) => [occurrence.line, occurrence]));

    for (const line of [1458, 1484, 2989, 2996, 2999]) {
      expect(byLine.get(line)?.requiresRegistration).toBe(false);
    }

    const queueDrain = byLine.get(1028);
    expect(queueDrain?.requiresRegistration).toBe(true);
    expect(queueDrain?.key).toBe(
      silentDiscardKey(
        "discoverHttpEgressSites",
        "if (scannedPrimitiveDeclarations.has(declarationKey)) continue;",
      ),
    );
    const entry = DOCUMENTED_SILENT_DISCARDS.get(queueDrain?.key ?? "");
    expect(entry).toBeDefined();
    expect((entry?.reason ?? "").trim().length).toBeGreaterThan(0);

    // A mesma conta do teste permanente reprova se a entrada sair: a
    // ocorrência de fila passa a ser descarte não registrado, nomeada por
    // `arquivo:linha`.
    const withoutQueueDrainEntry = new Map(DOCUMENTED_SILENT_DISCARDS);
    withoutQueueDrainEntry.delete(queueDrain?.key ?? "");
    const findings = findSilentDiscardFindings(realOccurrences, withoutQueueDrainEntry);
    expect(findings.unregistered).toHaveLength(1);
    expect(findings.unregistered[0]).toContain("1028");
  });

  it("as 5 entradas da baseline (Goal050) continuam no registro, sem duplicação e sem segunda conta — as 3 da classe candidato batem 1 para 1, e as 2 de readEnvSchemaDefault, embora `for-indexed`, exigem registro de verdade desde o Goal053 §2 (domínio `element-collection`, não mais leitura posicional isenta)", () => {
    const candidateBaselineKeys = [
      silentDiscardKey("resolveViaCallers", "if (!argExpression) continue;"),
      silentDiscardKey("findCrossFileCallerBindings", "if (localAlias === undefined) continue;"),
      silentDiscardKey(
        "discoverCallerResolvedGoBoundRequests",
        "if (baseParam === undefined || goEnvVar === undefined) continue;",
      ),
    ];
    for (const key of candidateBaselineKeys) {
      expect(DOCUMENTED_SILENT_DISCARDS.has(key)).toBe(true);
      const matches = realOccurrences.filter((occurrence) => occurrence.key === key);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.requiresRegistration).toBe(true);
    }

    // `readEnvSchemaDefault` lê `lines = source.split(/\r?\n/u)` com `for`
    // indexado: a FORMA do cabeçalho é `for-indexed` (leitura posicional),
    // mas o DOMÍNIO que o cursor percorre é `element-collection` — cada
    // linha é um candidato a declaração, exatamente como `for…of` sobre
    // `lines.split(…)` em outra função qualquer. As duas entradas, já
    // registradas desde o Goal050, agora são de fato exigidas.
    const readEnvSchemaDefaultKeys = [
      silentDiscardKey("readEnvSchemaDefault", "if (match === null) continue;"),
      silentDiscardKey("readEnvSchemaDefault", "if (captured === undefined) continue;"),
    ];
    for (const key of readEnvSchemaDefaultKeys) {
      expect(DOCUMENTED_SILENT_DISCARDS.has(key)).toBe(true);
      const matches = realOccurrences.filter((occurrence) => occurrence.key === key);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.requiresRegistration).toBe(true);
    }

    // Uma coleção só: nenhuma âncora da baseline aparece registrada duas
    // vezes (isso já lançaria em buildSilentDiscardRegistry, mas a suíte
    // também confere o efeito: o Map tem uma entrada por chave).
    const allBaselineKeys = [...candidateBaselineKeys, ...readEnvSchemaDefaultKeys];
    expect(new Set(allBaselineKeys).size).toBe(allBaselineKeys.length);
  });

  it("Goal053 §2 — a exigência de registro segue o DOMÍNIO percorrido, não mais só a forma do cabeçalho: as 6 ocorrências `element-collection` reais sobre `lines` (:1141, :1143, :1157, :1159, :1160, :3872) exigem registro, mesmo três delas sendo `for-indexed`, e cada uma tem entrada com motivo escrito substantivo — remover qualquer uma produz `unregistered` nomeando a linha", () => {
    const byLine = new Map(realOccurrences.map((occurrence) => [occurrence.line, occurrence]));
    const elementCollectionKeys = [
      { line: 1141, key: silentDiscardKey("readEnvSchemaDefault", "if (match === null) continue;") },
      {
        line: 1143,
        key: silentDiscardKey("readEnvSchemaDefault", "if (captured === undefined) continue;"),
      },
      {
        line: 1157,
        key: silentDiscardKey(
          "readEnvFileValue",
          'if (trimmed === "" || trimmed.startsWith("#")) continue;',
        ),
      },
      {
        line: 1159,
        key: silentDiscardKey("readEnvFileValue", "if (separator === -1) continue;"),
      },
      {
        line: 1160,
        key: silentDiscardKey(
          "readEnvFileValue",
          "if (trimmed.slice(0, separator).trim() !== key) continue;",
        ),
      },
      {
        line: 3872,
        key: silentDiscardKey(
          "readProductTransportRoutesFile",
          'if (trimmed === "" || trimmed.startsWith("#")) continue;',
        ),
      },
    ];

    for (const { line, key } of elementCollectionKeys) {
      const occurrence = byLine.get(line);
      expect(occurrence?.requiresRegistration, `linha ${line}`).toBe(true);
      expect(occurrence?.key, `linha ${line}`).toBe(key);
      const entry = DOCUMENTED_SILENT_DISCARDS.get(key);
      expect(entry, `linha ${line}`).toBeDefined();
      expect((entry?.reason ?? "").trim().length, `linha ${line}`).toBeGreaterThan(0);
    }

    // Conjunto exato: nenhuma outra ocorrência da árvore real exige
    // registro por domínio `element-collection` fora dessas 6.
    expect(
      realOccurrences
        .filter((occurrence) => occurrence.requiresRegistration === true)
        .map((occurrence) => occurrence.key),
    ).toEqual(expect.arrayContaining(elementCollectionKeys.map(({ key }) => key)));

    // Remover cada entrada nova, uma de cada vez, produz `unregistered`
    // nomeando exatamente a linha — nenhum ramo silencioso.
    for (const { line, key } of elementCollectionKeys) {
      const withoutEntry = new Map(DOCUMENTED_SILENT_DISCARDS);
      withoutEntry.delete(key);
      const findings = findSilentDiscardFindings(realOccurrences, withoutEntry);
      expect(findings.unregistered, `linha ${line}`).toHaveLength(1);
      expect(findings.unregistered[0], `linha ${line}`).toContain(`${line}:`);
    }

    // Nenhuma ocorrência que já exigia registro no Goal052 (classe
    // candidata) deixou de exigir com o critério novo.
    const candidateBaselineKeys = [
      silentDiscardKey("resolveViaCallers", "if (!argExpression) continue;"),
      silentDiscardKey("findCrossFileCallerBindings", "if (localAlias === undefined) continue;"),
      silentDiscardKey(
        "discoverCallerResolvedGoBoundRequests",
        "if (baseParam === undefined || goEnvVar === undefined) continue;",
      ),
      silentDiscardKey(
        "discoverHttpEgressSites",
        "if (scannedPrimitiveDeclarations.has(declarationKey)) continue;",
      ),
    ];
    for (const key of candidateBaselineKeys) {
      const matches = realOccurrences.filter((occurrence) => occurrence.key === key);
      expect(matches.length, key).toBeGreaterThan(0);
      for (const match of matches) {
        expect(match.requiresRegistration, key).toBe(true);
      }
    }

    // O registro real segue vazio nas quatro contas, com as entradas novas.
    const findings = findSilentDiscardFindings(realOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(findings.ambiguousKeys).toEqual([]);
    expect(findings.unregistered).toEqual([]);
    expect(findings.obsolete).toEqual([]);
    expect(findings.emptyReason).toEqual([]);
  });

  it("buildSilentDiscardRegistry continua lançando em chave duplicada dentro do próprio registro", () => {
    expect(() =>
      buildSilentDiscardRegistry([
        { anchor: "duplicataControle", snippet: "if (!x) continue;", reason: "primeira entrada" },
        { anchor: "duplicataControle", snippet: "if (!x) continue;", reason: "segunda entrada" },
      ]),
    ).toThrow(/chave duplicada/u);
  });

  it("a colisão de chave da forma nua, real na árvore, é resolvida por multiplicidade declarada — a contagem real bate com a declarada nas 4 âncoras que a sondagem achou colidindo (7, 6, 5 e 2 ocorrências), sem usar número de linha em lugar algum", () => {
    const collidingRealAnchors: { anchor: string; snippet: string; expectedCount: number }[] = [
      { anchor: "resolveModuleExportBindings", snippet: "continue;", expectedCount: 7 },
      { anchor: "discoverGoBoundRawFetchRequests", snippet: "continue;", expectedCount: 6 },
      { anchor: "resolveDestination", snippet: "continue;", expectedCount: 5 },
      { anchor: "discoverGoBoundInternalClientRequests", snippet: "continue;", expectedCount: 2 },
    ];
    for (const { anchor, snippet, expectedCount } of collidingRealAnchors) {
      const key = silentDiscardKey(anchor, snippet);
      const entry = DOCUMENTED_SILENT_DISCARDS.get(key);
      expect(entry).toBeDefined();
      expect(entry?.multiplicity).toBe(expectedCount);
      const matches = realOccurrences.filter((occurrence) => occurrence.key === key);
      expect(matches).toHaveLength(expectedCount);
    }

    // `discoverGoBoundInternalClientRequests::continue;` é o caso em que as
    // 2 ocorrências nuas estão em LAÇOS DIFERENTES da mesma função — prova
    // de que discriminar a chave por cabeçalho de laço não teria separado
    // as outras 3 âncoras acima (cujas repetições estão dentro do MESMO
    // laço), então a multiplicidade é a forma que resolve todas de modo
    // uniforme, não só as que um discriminador estrutural alcançaria.
    const differentLoopKey = silentDiscardKey(
      "discoverGoBoundInternalClientRequests",
      "continue;",
    );
    const differentLoopOccurrences = realOccurrences.filter(
      (occurrence) => occurrence.key === differentLoopKey,
    );
    const loopHeadersInvolved = new Set(
      enumerateContinueOccurrences(moduleSource, "http-egress-sites.ts")
        .filter((occurrence) => differentLoopOccurrences.some((o) => o.line === occurrence.line))
        .map((occurrence) => occurrence.loopHeader),
    );
    expect(loopHeadersInvolved.size).toBe(2);
  });

  it("chave cuja contagem real diverge da multiplicidade declarada reprova nos dois sentidos, sem usar número de linha — ocorrência a menos e ocorrência a mais no mesmo grupo real de resolveDestination (multiplicidade 5)", () => {
    const key = silentDiscardKey("resolveDestination", "continue;");
    const soloRegistry = buildSilentDiscardRegistry([
      {
        anchor: "resolveDestination",
        snippet: "continue;",
        reason: "controle: mesma entrada do registro real, isolada para o teste de multiplicidade",
        multiplicity: 5,
      },
    ]);
    const group = realOccurrences.filter((occurrence) => occurrence.key === key);
    expect(group).toHaveLength(5);

    // Antes: a árvore real bate com a multiplicidade declarada.
    expect(findSilentDiscardFindings(group, soloRegistry).ambiguousKeys).toEqual([]);

    // Depois A: uma ocorrência a menos — a contagem diverge, e a mesma conta
    // reprova, nomeando a chave e as duas contagens, sem olhar linha.
    const missingOne = group.slice(0, 4);
    const afterMissing = findSilentDiscardFindings(missingOne, soloRegistry);
    expect(afterMissing.ambiguousKeys).toHaveLength(1);
    expect(afterMissing.ambiguousKeys[0]).toContain(key);
    expect(afterMissing.ambiguousKeys[0]).toContain("4 ocorrência");
    expect(afterMissing.ambiguousKeys[0]).toContain("multiplicidade declarada é 5");

    // Depois B: uma ocorrência a mais (a primeira duplicada) — diverge no
    // sentido oposto, e a mesma conta reprova também.
    const extraOne = [...group, group[0]];
    const afterExtra = findSilentDiscardFindings(extraOne, soloRegistry);
    expect(afterExtra.ambiguousKeys).toHaveLength(1);
    expect(afterExtra.ambiguousKeys[0]).toContain("6 ocorrência");
  });
});

describe("Goal047 / WU-04 (§3) — as duas saídas de sourcesByPath ausente, no ramo da superfície e no ramo da instanciação, são a mesma: nenhuma pula em silêncio", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");

  it("as duas recusas terminam com a mesma frase nomeada", () => {
    expect(moduleSource).toContain(
      'sítio "${site.category}" foi encontrado, mas o texto de ${site.filePath} não está entre os arquivos lidos',
    );
    expect(moduleSource).toContain(
      "a instanciação foi reconhecida pela ligação até ${classDeclarationKey}, mas o texto de ${filePath} não está entre os arquivos lidos",
    );
  });

  it("Goal050 / WU-04, ampliado pelo Goal052 / WU-02 — todo descarte silencioso de candidato da classe iteração sobre candidatos (não mais só a forma idiomática de guarda) está no registro nomeado por trecho normalizado mais função que o envolve, com arquivo:linha e motivo não vazio — ocorrência não registrada reprova nomeando arquivo:linha e o trecho, entrada registrada que a varredura não encontra mais reprova como obsoleta, e chave cuja contagem real diverge da multiplicidade declarada reprova em vez de uma engolir a outra", () => {
    // Fonte única: `enumerateContinueOccurrences` (Goal052/WU-01), a mesma
    // que o teste permanente do §1/§2 acima chama — nunca uma segunda
    // varredura à parte de `continue;`.
    const found = enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts");

    // A mesma conta que os controles negativos do §8 (controle 5 e controle
    // 8, abaixo) chamam sobre ocorrências e registro corrompidos — nunca uma
    // segunda implementação à parte.
    const findings = findSilentDiscardFindings(found, DOCUMENTED_SILENT_DISCARDS);

    // Chave cuja contagem real diverge da multiplicidade declarada reprova
    // em vez de uma engolir a outra.
    expect(findings.ambiguousKeys).toEqual([]);
    // Ocorrência da classe portadora de candidato não registrada reprova
    // nomeando arquivo:linha e o trecho.
    expect(findings.unregistered).toEqual([]);
    // Entrada registrada que a varredura não encontra mais reprova como obsoleta.
    expect(findings.obsolete).toEqual([]);
    // Entrada de DOCUMENTED_SILENT_DISCARDS com motivo vazio reprova.
    expect(findings.emptyReason).toEqual([]);

    // Não vácuo: a classe portadora de candidato de fato exige registro na
    // árvore real — a leitura posicional não isenta tudo por engano.
    const requiringRegistration = found.filter(
      (occurrence) => occurrence.requiresRegistration ?? true,
    );
    expect(requiringRegistration.length).toBeGreaterThan(0);
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
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "client_field_use_computed_member_access",
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
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "client_field_use_field_forwarded_as_value",
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
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "client_field_use_outside_top_level_method_body",
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
    expectRefusal(
      () =>
        discoverWithEvolutionClientMembers([
          "  async createInstance() {",
          "    const { request } = this.http;",
          '    return request({ method: "POST", path: "/instance/create" });',
          "  }",
        ]),
      "client_field_use_destructured",
      /evolution-client\.ts:\d+:.*desestruturado.*\[categoria: client_field_use_destructured\]/u,
    );
  });

  it("depois: const send = this.http.request; send(...) — o membro é repassado como valor, sem invocação nesta ocorrência — recusa pela categoria client_field_use_member_not_invoked, com arquivo:linha", () => {
    expectRefusal(
      () =>
        discoverWithEvolutionClientMembers([
          "  async createInstance() {",
          "    const send = this.http.request;",
          '    return send({ method: "POST", path: "/instance/create" });',
          "  }",
        ]),
      "client_field_use_member_not_invoked",
      /evolution-client\.ts:\d+:.*não é invocado.*\[categoria: client_field_use_member_not_invoked\]/u,
    );
  });

  it("depois: this.http.#send(...) — depois do ponto não há identificador de membro derivável — recusa pela categoria client_field_use_member_name_not_derivable, com arquivo:linha", () => {
    expectRefusal(
      () =>
        discoverWithEvolutionClientMembers([
          "  async createInstance() {",
          '    return this.http.#send({ method: "POST", path: "/instance/create" });',
          "  }",
        ]),
      "client_field_use_member_name_not_derivable",
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
    expectRefusal(
      () =>
        discoverWithEvolutionClientMembers([
          "  async createInstance() {",
          '    return this?.http.request({ method: "POST", path: "/instance/create" });',
          "  }",
        ]),
      "client_field_use_receiver_optional_chaining",
      /evolution-client\.ts:\d+:.*encadeamento opcional está no receptor.*\[categoria: client_field_use_receiver_optional_chaining\]/u,
    );
  });

  it('depois: this["http"].request(...) — acesso computado sobre o RECEPTOR — recusa pela categoria client_field_use_receiver_computed_member_access, com arquivo:linha', () => {
    expectRefusal(
      () =>
        discoverWithEvolutionClientMembers([
          "  async createInstance() {",
          '    return this["http"].request({ method: "POST", path: "/instance/create" });',
          "  }",
        ]),
      "client_field_use_receiver_computed_member_access",
      /evolution-client\.ts:\d+:.*índice computado.*\[categoria: client_field_use_receiver_computed_member_access\]/u,
    );
  });

  it("depois: const { http } = this; http.request(...) — o próprio this é desestruturado — recusa pela categoria client_field_use_receiver_destructured, com arquivo:linha", () => {
    expectRefusal(
      () =>
        discoverWithEvolutionClientMembers([
          "  async createInstance() {",
          "    const { http } = this;",
          '    return http.request({ method: "POST", path: "/instance/create" });',
          "  }",
        ]),
      "client_field_use_receiver_destructured",
      /evolution-client\.ts:\d+:.*this é desestruturado.*\[categoria: client_field_use_receiver_destructured\]/u,
    );
  });

  it("depois: const self = this; self.http.request(...) — a instância inteira escapa por alias — recusa pela categoria client_field_use_receiver_forwarded_as_value, com arquivo:linha", () => {
    expectRefusal(
      () =>
        discoverWithEvolutionClientMembers([
          "  async createInstance() {",
          "    const self = this;",
          '    return self.http.request({ method: "POST", path: "/instance/create" });',
          "  }",
        ]),
      "client_field_use_receiver_forwarded_as_value",
      /evolution-client\.ts:\d+:.*posição de valor.*\[categoria: client_field_use_receiver_forwarded_as_value\]/u,
    );
  });

  it("depois: this.#transport.request(...) — depois do ponto sobre this não há nome de campo derivável, e a leitura não decide se o receptor alcança http — recusa pela categoria client_field_use_receiver_field_name_not_derivable, com arquivo:linha", () => {
    expectRefusal(
      () =>
        discoverWithEvolutionClientMembers([
          "  async createInstance() {",
          '    return this.#transport.request({ method: "POST", path: "/instance/create" });',
          "  }",
        ]),
      "client_field_use_receiver_field_name_not_derivable",
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
    expectRefusal(
      () =>
        discoverWithEvolutionClientMembers([
          "  async createInstance() {",
          '    return `${await this.http?.request({ method: "POST", path: "/instance/create" })}`;',
          "  }",
        ]),
      "client_field_use_optional_chaining",
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

/* =========================================================================
 * Goal048 / WU-02 — controle das cinco categorias do alvo de atribuição sem
 * prova ainda sem controle depois do WU-01: destructured, foreign_object_
 * property, array_element, returned_directly e form_not_recognized. Cada
 * árvore sintética é montada e removida pelo próprio teste; nenhuma toca a
 * árvore real.
 *
 * `instance_field_assignment_array_element` e
 * `instance_field_assignment_returned_directly` são, por construção do
 * código de `resolveProvenClassFieldAssignment` (http-egress-sites.ts),
 * inalcançáveis por árvore sintética alguma — não por lacuna de teste:
 *   - array_element: seu regex (`\b<id>\[[^\]]*\]\s*=\s*new\s*$`) é
 *     subconjunto estrito do regex de destructured (`[}\]]\s*=\s*new\s*$`),
 *     testado ANTES na cadeia de `if`. Todo `<id>[i] = new ...` termina em
 *     `]` logo antes de `= new`, então o `if` de destructured sempre casa
 *     e lança primeiro; o `if` de array_element é código morto.
 *   - returned_directly: seu regex (`\breturn\s*$`) exige que a janela
 *     termine em "return", mas `findClassInstantiations` só reconhece um
 *     sítio quando a palavra imediatamente anterior ao nome da classe é
 *     "new" (`wordEndingAt(...) !== "new") continue`). A janela passada a
 *     `resolveProvenClassFieldAssignment` termina, portanto, sempre em
 *     "new" (mais espaço), nunca em "return" — o `if` de returned_directly
 *     nunca é alcançado; toda forma `return new X(...)` cai no
 *     `form_not_recognized` final.
 * Os dois controles abaixo provam essa inalcançabilidade em vez de
 * contorná-la: constroem exatamente a forma nomeada pela categoria e
 * observam, por árvore sintética, que a recusa sai sob a OUTRA categoria.
 * ========================================================================= */

describe("Goal048 / WU-02 — o alvo da atribuição sem prova nas formas ainda sem controle recusa pela categoria exata, com arquivo:linha", () => {
  it("padrão de desestruturação (`({ campo } = new ...)`) recusa por instance_field_assignment_destructured, com arquivo:linha, em vez de zero requisição e zero recusa", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  constructor() {",
        "    ({ http } = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL));",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "instance_field_assignment_destructured",
        /evolution-client\.ts:\d+:.*padrão de desestruturação.*\[categoria: instance_field_assignment_destructured\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("instância atribuída a propriedade de OUTRO objeto (`<id>.<campo> = new ...`, `<id>` diferente de `this`) recusa por instance_field_assignment_foreign_object_property, com arquivo:linha, em vez de zero requisição e zero recusa", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  constructor() {",
        "    const container: { http?: InternalHttpClient } = {};",
        "    container.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "instance_field_assignment_foreign_object_property",
        /evolution-client\.ts:\d+:.*"container\.http".*propriedade de outro objeto.*\[categoria: instance_field_assignment_foreign_object_property\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("instanciação passada como ARGUMENTO (`configureClient(new ...)`) — nenhuma das formas reconhecidas casa — recusa por instance_field_assignment_form_not_recognized, com arquivo:linha, em vez de zero requisição e zero recusa", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "function configureClient(client: InternalHttpClient): void {",
        "  void client;",
        "}",
        "",
        "export class EvolutionClient {",
        "  constructor() {",
        "    configureClient(new InternalHttpClient(env.EVOLUTION_GO_BASE_URL));",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "instance_field_assignment_form_not_recognized",
        /evolution-client\.ts:\d+:.*nem em declaração de propriedade de classe.*\[categoria: instance_field_assignment_form_not_recognized\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("instance_field_assignment_array_element é INALCANÇÁVEL: `<id>[<expr>] = new ...` termina em \"]\" antes de \"= new\", e o `if` de destructured — testado antes, com regex que é superconjunto — sempre casa primeiro; a recusa sai sob instance_field_assignment_destructured, nunca sob array_element", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  constructor() {",
        "    const clients: InternalHttpClient[] = [];",
        "    clients[0] = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
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
      const message = (thrown as Error).message;
      expect(message).toMatch(/\[categoria: instance_field_assignment_destructured\]/u);
      expect(message).not.toContain("instance_field_assignment_array_element");
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("instance_field_assignment_returned_directly é INALCANÇÁVEL: todo sítio reconhecido tem \"new\" como palavra imediatamente anterior ao nome da classe, então a janela de resolveProvenClassFieldAssignment sempre termina em \"new\", nunca em \"return\"; `return new ...` recusa sob instance_field_assignment_form_not_recognized, nunca sob returned_directly", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": [
        'import { InternalHttpClient } from "./internal-http-client.js";',
        "",
        "export class EvolutionClient {",
        "  createClient(): InternalHttpClient {",
        "    return new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
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
      const message = (thrown as Error).message;
      expect(message).toMatch(/\[categoria: instance_field_assignment_form_not_recognized\]/u);
      expect(message).not.toContain("instance_field_assignment_returned_directly");
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("Goal048 / WU-03 — controle das três categorias de ligação de classe sem prova ainda sem controle depois do WU-01: class_binding_homonymous_declarations, class_binding_commonjs_export e class_binding_cross_file_form_not_resolved", () => {
  it("duas declarações `class InternalHttpClient` no arquivo da declaração recusam por class_binding_homonymous_declarations, com arquivo:linha, porque o nome exportado não identifica qual das duas é instanciada", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu04EnvSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
        "class InternalHttpClient {}",
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
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "class_binding_homonymous_declarations",
        /internal-http-client\.ts:\d+:.*"InternalHttpClient" é declarada 2 vezes neste arquivo \(linhas 1, 9\).*\[categoria: class_binding_homonymous_declarations\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("`exports.Alt = InternalHttpClient;` no arquivo da declaração recusa por class_binding_commonjs_export, com arquivo:linha, porque esta resolução não segue exportação CommonJS", () => {
    const tree = makeTempSourceTree({
      "config/env.ts": wu04EnvSchema,
      "clients/internal-http-client.ts": [
        "export class InternalHttpClient {",
        "  constructor(private baseUrl: string) {}",
        "  async request(options: { method: string; path: string }) {",
        "    const url = new URL(options.path, this.baseUrl);",
        "    return fetch(url, { method: options.method });",
        "  }",
        "}",
        "",
        "exports.Alt = InternalHttpClient;",
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
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "class_binding_commonjs_export",
        /internal-http-client\.ts:\d+:.*sai do módulo por "exports\.Alt = InternalHttpClient".*\[categoria: class_binding_commonjs_export\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });

  it("import de namespace (`* as NS`), num terceiro arquivo, para o módulo da declaração recusa por class_binding_cross_file_form_not_resolved, com arquivo:linha, porque chamada por `NS.InternalHttpClient` não é forma que esta resolução segue", () => {
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
        "",
      ].join("\n"),
      "callers/via-namespace.ts": [
        'import * as InternalHttpClientNS from "../clients/internal-http-client.js";',
        "",
        "export function unusedNamespaceCaller(): void {",
        "  void InternalHttpClientNS;",
        "}",
        "",
      ].join("\n"),
    });
    const emptyTree = makeTempSourceTree({});
    try {
      expectRefusal(
        () => discoverGoServiceHttpRequests(tree, emptyTree, join(tree, "config/env.ts")),
        "class_binding_cross_file_form_not_resolved",
        /via-namespace\.ts:\d+:.*import de namespace.*\[categoria: class_binding_cross_file_form_not_resolved\]/u,
      );
    } finally {
      rmSync(tree, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

describe("Goal048 / WU-04 — ocorrência exótica do campo cliente escrita dentro de comentário não recusa e não conta", () => {
  it("`this.http?.request(...)` (encadeamento opcional, categoria client_field_use_optional_chaining) dentro de comentário de linha é apagada por blankComments antes da varredura: classificação idêntica à árvore sem o comentário, e a rota real continua saindo", () => {
    const commentedEvolutionClient = [
      'import { InternalHttpClient } from "./internal-http-client.js";',
      "",
      "export class EvolutionClient {",
      "  private http: InternalHttpClient;",
      "  constructor() {",
      "    this.http = new InternalHttpClient(env.EVOLUTION_GO_BASE_URL);",
      "  }",
      "  async createInstance() {",
      "    // this.http?.request({ method: \"POST\", path: \"/instance/create\" });",
      '    return this.http.request({ method: "POST", path: "/instance/create" });',
      "  }",
      "}",
      "",
    ].join("\n");
    const plainEvolutionClient = [
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
    const treeWithComment = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": commentedEvolutionClient,
    });
    const treeWithoutComment = makeTempSourceTree({
      "config/env.ts": wu047EnvSchema,
      "clients/internal-http-client.ts": wu047InternalClient,
      "clients/evolution-client.ts": plainEvolutionClient,
    });
    const emptyTree = makeTempSourceTree({});
    try {
      const withComment = discoverGoServiceHttpRequests(
        treeWithComment,
        emptyTree,
        join(treeWithComment, "config/env.ts"),
      );
      const withoutComment = discoverGoServiceHttpRequests(
        treeWithoutComment,
        emptyTree,
        join(treeWithoutComment, "config/env.ts"),
      );
      expect(withComment.requests.map((request) => request.pathExpression)).toEqual([
        "/instance/create",
      ]);
      expect(withComment.requests.map((request) => request.pathExpression)).toEqual(
        withoutComment.requests.map((request) => request.pathExpression),
      );
      expect(withComment.nonTransportMemberCalls).toEqual(withoutComment.nonTransportMemberCalls);
    } finally {
      rmSync(treeWithComment, { recursive: true, force: true });
      rmSync(treeWithoutComment, { recursive: true, force: true });
      rmSync(emptyTree, { recursive: true, force: true });
    }
  });
});

/**
 * A mesma conta que o teste permanente "a conservação é uma partição
 * computada" (Goal043 / WU-02, `:3099` acima) roda sobre a árvore real —
 * ambos chamam esta função, nunca a reimplementam à parte. Os controles
 * negativos abaixo a chamam sobre uma cópia corrompida dos baldes reais
 * (sítio removido, duplicado ou com origem inventada), sem tocar a árvore
 * real nem o mecanismo de produção, e conferem que a mesma conta reprova.
 */
function findEgressPartitionFindings(
  sites: readonly { filePath: string; line: number; category: HttpEgressSiteCategory }[],
  bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]>,
): {
  unroutable: string[];
  withoutBucket: string[];
  inMoreThanOneBucket: string[];
  entriesWithoutReadOrigin: string[];
  entriesWithEmptyReason: string[];
  entriesInBucketNotAllowedByOriginCategory: string[];
} {
  const unroutable: string[] = [];
  const withoutBucket: string[] = [];
  const inMoreThanOneBucket: string[] = [];
  for (const site of sites) {
    const position = egressPositionKey(site);
    const routing = egressPartitionBucketsForCategory(site.category);
    if (routing === null) {
      unroutable.push(`${position} [${site.category}]`);
      continue;
    }
    // "Exatamente um balde" vale sobre a **saída própria** da categoria, que
    // é onde ele sempre valeu: os baldes de instanciação recebem entradas
    // derivadas do sítio, não segundas saídas dele.
    const landed = routing.ownOutput.filter((bucket) =>
      bucketsByName[bucket].some((entry) => egressPositionKey(entry.originSite) === position),
    );
    if (landed.length === 0) {
      withoutBucket.push(`${position} [${site.category}]`);
      continue;
    }
    if (landed.length > 1) {
      inMoreThanOneBucket.push(`${position} [${site.category}] em [${landed.join(", ")}]`);
    }
  }

  const readSitePositions = new Set(sites.map(egressPositionKey));
  const categoryByReadSitePosition = new Map(
    sites.map((site) => [egressPositionKey(site), site.category] as const),
  );
  const entriesWithoutReadOrigin: string[] = [];
  const entriesWithEmptyReason: string[] = [];
  const entriesInBucketNotAllowedByOriginCategory: string[] = [];
  for (const bucket of EGRESS_PARTITION_BUCKETS) {
    for (const entry of bucketsByName[bucket]) {
      const entryPosition = egressPositionKey(entry);
      const originPosition = egressPositionKey(entry.originSite);
      if (!readSitePositions.has(originPosition)) {
        entriesWithoutReadOrigin.push(
          `${bucket} ${entryPosition} com origem ${originPosition}`,
        );
      } else {
        // O outro sentido da partição: o balde em que a entrada está tem de
        // pertencer ao conjunto que a categoria da **origem** permite. A
        // categoria que roteia é sempre a do sítio de origem, nunca a da
        // entrada: `requests` derivada de `constructor_base_url_requestBinary`
        // tem categoria própria `env_var_*`, `assembledUrls` fala o
        // vocabulário `assembled_url_for_delivery_*` e as instanciações não
        // têm campo `category` nenhum. Entrada na mesma posição da origem é
        // saída própria; qualquer outra posição é saída derivada. Categoria
        // que a partição não sabe encaminhar não permite balde algum — o
        // sítio já reprova em `unroutable`, e a entrada reprova aqui, em vez
        // de passar por falta de conjunto declarado.
        const originCategory = categoryByReadSitePosition.get(originPosition)!;
        const routing = egressPartitionBucketsForCategory(originCategory);
        const allowed =
          routing === null
            ? []
            : originPosition === entryPosition
              ? routing.ownOutput
              : routing.derivedOutput;
        if (!allowed.includes(bucket)) {
          entriesInBucketNotAllowedByOriginCategory.push(
            `${bucket} ${entryPosition} com origem ${originPosition} [${originCategory}]`,
          );
        }
      }
      if (entry.reason.trim().length === 0) {
        entriesWithEmptyReason.push(`${bucket} ${entryPosition}`);
      }
    }
  }
  return {
    unroutable,
    withoutBucket,
    inMoreThanOneBucket,
    entriesWithoutReadOrigin,
    entriesWithEmptyReason,
    entriesInBucketNotAllowedByOriginCategory,
  };
}

/**
 * A mesma conta que o teste permanente da exceção de `constructor_base_url_*`
 * (`:3343` acima) roda sobre os baldes reais — ambos chamam esta função,
 * nunca a reimplementam à parte. O controle 5 do §8 (Goal051 / WU-04) a chama
 * sobre uma cópia dos baldes de onde o dado que justifica a exceção foi
 * removido, e confere que a mesma conta deixa de encontrá-lo.
 *
 * Dual membership é o que a exceção existe para permitir: o sítio tem saída
 * **própria** em um balde de `ownOutput`, na sua própria `arquivo:linha`, e
 * saída **derivada** em um balde de `derivedOutput`, em outra posição.
 */
function findConstructorBaseUrlDualMembershipSites(
  sites: readonly { filePath: string; line: number; category: HttpEgressSiteCategory }[],
  bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]>,
): string[] {
  return sites
    .filter((site) => site.category.startsWith("constructor_base_url_"))
    .filter((site) => {
      const routing = egressPartitionBucketsForCategory(site.category);
      const position = egressPositionKey(site);
      const inOwnOutput = (routing?.ownOutput ?? []).some((bucket) =>
        bucketsByName[bucket].some(
          (entry) =>
            egressPositionKey(entry.originSite) === position &&
            egressPositionKey(entry) === position,
        ),
      );
      const inDerivedOutput = (routing?.derivedOutput ?? []).some((bucket) =>
        bucketsByName[bucket].some(
          (entry) =>
            egressPositionKey(entry.originSite) === position &&
            egressPositionKey(entry) !== position,
        ),
      );
      return inOwnOutput && inDerivedOutput;
    })
    .map((site) => `${egressPositionKey(site)} [${site.category}]`);
}

describe("Goal050 / WU-05 (§8) — controles negativos: as oito amarras mordem, cada uma com as duas saídas no relatório", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");

  it("controle 1 (§8.1) — crédito por prosa deixa de contar: motivo sem arquivo:linha do sítio de origem não muda a partição, que liga pelo campo; campo de origem esvaziado reprova, nomeando o sítio", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      requests: discovery.requests,
      notGoBound: discovery.notGoBound,
      assembledUrls: discovery.assembledUrls,
      nonTransportMemberCalls: discovery.nonTransportMemberCalls,
      nonGoBoundInstantiations: discovery.nonGoBoundInstantiations,
    };
    const target = discovery.requests.find(
      (request) => request.method === "GET" && request.pathExpression === "/health",
    );
    expect(target).toBeDefined();
    const originPosition = egressPositionKey(target!.originSite);
    // A categoria que decide o balde é a do SÍTIO de origem (o `fetch` cru
    // dentro de `checkHealth`), não a do request derivado — as duas
    // divergem de propósito neste caso (`caller_resolved_base_url_via_*`
    // no sítio, `env_var_*` no request), e a partição roteia pela do sítio.
    const originSiteCategory = egress.sites.find(
      (site) => egressPositionKey(site) === originPosition,
    )!.category;
    // O motivo hoje ainda nomeia o sítio — é prosa para quem lê, não mais
    // dado de prova; a linha abaixo só confirma o cenário do controle.
    expect(target!.reason).toContain(originPosition);

    // Saída 1 — motivo reescrito sem o arquivo:linha do sítio de origem: a
    // partição continua verde, porque ela nunca lê `reason`.
    const reasonRewritten = { ...target!, reason: "motivo reescrito, sem o arquivo:linha de origem" };
    const bucketsWithRewrittenReason: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      requests: discovery.requests.map((request) => (request === target ? reasonRewritten : request)),
    };
    const findingsAfterRewrite = findEgressPartitionFindings(egress.sites, bucketsWithRewrittenReason);
    expect(findingsAfterRewrite.withoutBucket).toEqual([]);
    expect(findingsAfterRewrite.inMoreThanOneBucket).toEqual([]);

    // Saída 2 — com o campo de origem esvaziado (em vez do motivo), a mesma
    // checagem reprova: sem o campo, nada mais liga o sítio ao balde.
    const originEmptied = { ...target!, originSite: { filePath: "", line: 0 } };
    const bucketsWithEmptiedOrigin: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      requests: discovery.requests.map((request) => (request === target ? originEmptied : request)),
    };
    const findingsAfterEmptyOrigin = findEgressPartitionFindings(egress.sites, bucketsWithEmptiedOrigin);
    expect(findingsAfterEmptyOrigin.withoutBucket).toEqual([
      `${originPosition} [${originSiteCategory}]`,
    ]);
  });

  it("controle 2 (§8.2) — sítio perdido reprova, nomeando arquivo:linha e a categoria", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      requests: discovery.requests,
      notGoBound: discovery.notGoBound,
      assembledUrls: discovery.assembledUrls,
      nonTransportMemberCalls: discovery.nonTransportMemberCalls,
      nonGoBoundInstantiations: discovery.nonGoBoundInstantiations,
    };
    const target = discovery.requests.find(
      (request) => request.method === "GET" && request.pathExpression === "/health",
    );
    expect(target).toBeDefined();
    const position = egressPositionKey(target!.originSite);
    const originSiteCategory = egress.sites.find((site) => egressPositionKey(site) === position)!
      .category;

    // Antes: baldes reais — o sítio aparece em exatamente um balde.
    expect(findEgressPartitionFindings(egress.sites, bucketsByName).withoutBucket).toEqual([]);

    // Depois: remover a entrada do balde, sem substituí-la, simula o sítio
    // perdido — nenhum balde mais reclama essa origem.
    const bucketsWithoutTarget: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      requests: discovery.requests.filter((request) => request !== target),
    };
    expect(findEgressPartitionFindings(egress.sites, bucketsWithoutTarget).withoutBucket).toEqual([
      `${position} [${originSiteCategory}]`,
    ]);
  });

  it("controle 3 (§8.3) — sítio em dois baldes reprova, nomeando os baldes", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      requests: discovery.requests,
      notGoBound: discovery.notGoBound,
      assembledUrls: discovery.assembledUrls,
      nonTransportMemberCalls: discovery.nonTransportMemberCalls,
      nonGoBoundInstantiations: discovery.nonGoBoundInstantiations,
    };
    const target = discovery.requests.find(
      (request) => request.method === "GET" && request.pathExpression === "/health",
    );
    expect(target).toBeDefined();
    const position = egressPositionKey(target!.originSite);
    const originSiteCategory = egress.sites.find((site) => egressPositionKey(site) === position)!
      .category;

    // Antes: baldes reais — o sítio não se repete em balde nenhum.
    expect(findEgressPartitionFindings(egress.sites, bucketsByName).inMoreThanOneBucket).toEqual([]);

    // Depois: a mesma origem aparece também em `notGoBound` — conservação é
    // partição, não cobertura, e a duplicata reprova nomeando os dois.
    const duplicatedEntry: EgressPartitionEntry = {
      filePath: target!.filePath,
      line: target!.line,
      originSite: target!.originSite,
      reason: "controle negativo: duplicata deliberada do mesmo sítio em segundo balde",
    };
    const bucketsWithDuplicate: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      notGoBound: [...discovery.notGoBound, duplicatedEntry],
    };
    expect(findEgressPartitionFindings(egress.sites, bucketsWithDuplicate).inMoreThanOneBucket).toEqual([
      `${position} [${originSiteCategory}] em [requests, notGoBound]`,
    ]);
  });

  it("controle 4 (§8.4) — balde sem origem reprova: entrada cuja origem declarada não corresponde a sítio lido algum", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      requests: discovery.requests,
      notGoBound: discovery.notGoBound,
      assembledUrls: discovery.assembledUrls,
      nonTransportMemberCalls: discovery.nonTransportMemberCalls,
      nonGoBoundInstantiations: discovery.nonGoBoundInstantiations,
    };

    // Antes: baldes reais — toda origem declarada corresponde a sítio lido.
    expect(findEgressPartitionFindings(egress.sites, bucketsByName).entriesWithoutReadOrigin).toEqual([]);

    // Depois: uma entrada cuja origem a leitura de sítios nunca produziu —
    // balde não inventa; reprova nomeando o balde e a origem inventada.
    const entryWithoutRealOrigin: EgressPartitionEntry = {
      filePath: "apps/ai-orchestrator/src/inventado.ts",
      line: 1,
      originSite: { filePath: "apps/ai-orchestrator/src/inventado.ts", line: 999999 },
      reason: "controle negativo: origem que a leitura de sítios nunca produziu",
    };
    const bucketsWithInventedOrigin: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      notGoBound: [...discovery.notGoBound, entryWithoutRealOrigin],
    };
    expect(
      findEgressPartitionFindings(egress.sites, bucketsWithInventedOrigin).entriesWithoutReadOrigin,
    ).toEqual([
      `notGoBound ${egressPositionKey(entryWithoutRealOrigin)} com origem ${egressPositionKey(entryWithoutRealOrigin.originSite)}`,
    ]);
  });

  it("controle 5 (§8.5) — deslocamento de linha não reprova em massa: inserir linhas acima dos descartes registrados desloca a numeração, mas a chave por trecho normalizado mais âncora continua batendo", () => {
    // As 5 ocorrências da forma idiomática de guarda que `findSilentDiscardLines`
    // reconhece (Goal050) — o Goal052/WU-02 ampliou `DOCUMENTED_SILENT_DISCARDS`
    // para além delas (§3/§4 acima), então o tamanho do registro não é mais
    // proxy do tamanho desta lista; a contagem de referência é `before.length`
    // em si, computada, não `DOCUMENTED_SILENT_DISCARDS.size`.
    const before = findSilentDiscardLines(moduleSource).map((occurrence) => {
      const anchor = resolveEnclosingTopLevelFunctionName(moduleSource, occurrence.line);
      return { ...occurrence, anchor, key: silentDiscardKey(anchor, occurrence.snippet) };
    });
    expect(before.length).toBeGreaterThan(0);
    const lineKeyedRegistry = new Set(before.map((occurrence) => occurrence.line));

    // Desloca toda a numeração do módulo inserindo 200 linhas em branco no
    // topo — o mesmo efeito prático de editar http-egress-sites.ts acima
    // dos descartes registrados, sem tocar o arquivo real em disco.
    const shiftedSource = `${"\n".repeat(200)}${moduleSource}`;
    const after = findSilentDiscardLines(shiftedSource).map((occurrence) => {
      const anchor = resolveEnclosingTopLevelFunctionName(shiftedSource, occurrence.line);
      return { ...occurrence, anchor, key: silentDiscardKey(anchor, occurrence.snippet) };
    });
    expect(after.length).toBe(before.length);

    // Saída 1 — chave por número de linha, a forma de antes do Goal050: as
    // mesmas N entradas viram obsoletas, e as N ocorrências deslocadas viram
    // não registradas, todas de uma vez.
    const shiftedLineKeys = new Set(after.map((occurrence) => occurrence.line));
    const obsoleteByLineKey = [...lineKeyedRegistry].filter((line) => !shiftedLineKeys.has(line));
    const unregisteredByLineKey = after.filter((occurrence) => !lineKeyedRegistry.has(occurrence.line));
    expect(obsoleteByLineKey.length).toBe(before.length);
    expect(unregisteredByLineKey.length).toBe(before.length);

    // Saída 2 — chave por trecho normalizado mais âncora, a forma de hoje:
    // trecho e função não mudam com o deslocamento, então o registro
    // continua verde nos dois sentidos, para as chaves que este controle de
    // fato exercita (as da forma idiomática de guarda).
    for (const occurrence of after) {
      expect(DOCUMENTED_SILENT_DISCARDS.has(occurrence.key)).toBe(true);
    }
    const afterKeys = new Set(after.map((occurrence) => occurrence.key));
    for (const occurrence of before) {
      expect(afterKeys.has(occurrence.key)).toBe(true);
    }
  });

  it("controle 6 (§8.6) — descarte mudo novo continua reprovando: ocorrência nova, não registrada, reprova — a amarra do Goal049 não afrouxou", () => {
    const injectedSnippet = "if (novoValorInexistente === undefined) continue;";
    const mutatedSource = `function novoDescarteNaoRegistrado() {\n  ${injectedSnippet}\n}\n\n${moduleSource}`;
    expect(mutatedSource).not.toBe(moduleSource);

    const mutatedOccurrences: SilentDiscardOccurrence[] = findSilentDiscardLines(mutatedSource).map(
      (occurrence) => {
        const anchor = resolveEnclosingTopLevelFunctionName(mutatedSource, occurrence.line);
        return { ...occurrence, anchor, key: silentDiscardKey(anchor, occurrence.snippet) };
      },
    );
    const injected = mutatedOccurrences.find((occurrence) => occurrence.snippet === injectedSnippet);
    expect(injected).toBeDefined();
    expect(injected!.anchor).toBe("novoDescarteNaoRegistrado");

    // A amarra reprova: a mesma conta que o teste permanente do
    // Goal050/WU-04 (`:6238` acima) roda acusa a ocorrência nova como não
    // registrada no registro real, nomeando linha e trecho.
    const findings = findSilentDiscardFindings(mutatedOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(findings.unregistered).toContain(`${injected!.line}: "${injectedSnippet}"`);
  });

  it("controle 7 (§8.7) — motivo vazio reprova, em balde e no registro", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      requests: discovery.requests,
      notGoBound: discovery.notGoBound,
      assembledUrls: discovery.assembledUrls,
      nonTransportMemberCalls: discovery.nonTransportMemberCalls,
      nonGoBoundInstantiations: discovery.nonGoBoundInstantiations,
    };
    // Antes: nenhuma entrada real tem motivo vazio.
    expect(findEgressPartitionFindings(egress.sites, bucketsByName).entriesWithEmptyReason).toEqual([]);

    const target = discovery.requests[0];
    expect(target).toBeDefined();
    const withEmptyReason = { ...target, reason: "   " };
    const bucketsWithEmptyReason: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      requests: discovery.requests.map((request) => (request === target ? withEmptyReason : request)),
    };
    // Depois: motivo vazio (só espaço) reprova no balde, nomeando a posição.
    expect(
      findEgressPartitionFindings(egress.sites, bucketsWithEmptyReason).entriesWithEmptyReason,
    ).toEqual([`requests ${egressPositionKey(withEmptyReason)}`]);

    // No registro de descarte, o mesmo precedente de D-064 vale para
    // SilentDiscardEntry: motivo vazio reprova, antes mesmo de a chave
    // importar — pela mesma conta que o teste permanente do Goal050/WU-04
    // (`:6238` acima) roda, não por checagem própria sobre o valor de entrada.
    const emptyReasonAnchor = "controleNegativo7";
    const emptyReasonSnippet = "if (x === undefined) continue;";
    const emptyReasonRegistry = buildSilentDiscardRegistry([
      { anchor: emptyReasonAnchor, snippet: emptyReasonSnippet, reason: "" },
    ]);
    const emptyReasonKey = silentDiscardKey(emptyReasonAnchor, emptyReasonSnippet);
    const emptyReasonOccurrences: SilentDiscardOccurrence[] = [
      { line: 1, snippet: emptyReasonSnippet, anchor: emptyReasonAnchor, key: emptyReasonKey },
    ];
    const findings = findSilentDiscardFindings(emptyReasonOccurrences, emptyReasonRegistry);
    expect(findings.emptyReason).toContain(emptyReasonKey);
  });

  it("controle 8 (§8.8) — a cobertura e a amarra de categoria do Goal049 continuam mordendo: remover a observação de uma categoria a acusa como órfã", () => {
    const allRefusalCategories: readonly string[] = [
      ...INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES,
      ...CLASS_BINDING_REFUSAL_CATEGORIES,
      ...CLIENT_FIELD_USE_REFUSAL_CATEGORIES,
    ];
    const removedCategory = allRefusalCategories.find(
      (category) => !PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.has(category),
    );
    expect(removedCategory).toBeDefined();

    // Antes: a categoria escolhida está coberta — algum controle no arquivo
    // já a observou via expectRefusal em runtime, até este ponto da suíte.
    expect(observedRefusalCategories.has(removedCategory!)).toBe(true);

    // Depois: removendo essa observação de uma cópia do conjunto, a mesma
    // conta que Goal048/WU-01 roda (`:7405` acima) acusa a categoria órfã.
    const withoutRemovedCategory = new Set(observedRefusalCategories);
    withoutRemovedCategory.delete(removedCategory!);
    const uncoveredCategories = allRefusalCategories.filter(
      (category) =>
        !withoutRemovedCategory.has(category) && !PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.has(category),
    );
    expect(uncoveredCategories).toEqual([removedCategory]);

    // A amarra de categoria do Goal049 (expectRefusal, `:70`–`104` acima)
    // também segue mordendo: categoria fora dos três arrays reprova antes
    // de checar a mensagem observada.
    expect(() =>
      expectRefusal(
        () => {
          throw new Error("mensagem qualquer, com [categoria: client_field_use_destructured]");
        },
        "categoria_que_nao_existe_em_array_nenhum" as unknown as DeclaredRefusalCategory,
        /mensagem qualquer/u,
      ),
    ).toThrow(/não pertence a INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES/u);
  });
});

/*
 * As duas categorias que nenhum controle pode fazer acontecer, com o motivo
 * computado pelos dois controles de inalcançabilidade do WU-02 acima — não
 * "cobertas pela igualdade do array", que é a afirmação que este Goal existe
 * para remover, mas resíduo NOMEADO, e nomeado num só lugar: a cobertura
 * abaixo desconta exatamente estas, e só enquanto elas continuarem
 * inalcançáveis de fato.
 */
const PROVEN_UNREACHABLE_REFUSAL_CATEGORIES: ReadonlyMap<string, string> = new Map([
  [
    "instance_field_assignment_array_element",
    'regex subconjunto estrito do de instance_field_assignment_destructured, testado antes na mesma cadeia de `if`: todo `<id>[<expr>] = new ...` termina em "]" e casa primeiro no de destructured',
  ],
  [
    "instance_field_assignment_returned_directly",
    'a janela lida por resolveProvenClassFieldAssignment termina sempre em "new", porque findClassInstantiations só reconhece sítio quando a palavra anterior ao nome da classe é "new": ela nunca termina em "return"',
  ],
]);

/**
 * A cobertura de recusa, computada em runtime a partir dos três arrays: as
 * categorias que nenhum controle observou e que o registro de inalcançáveis
 * não desconta. A mesma conta que o teste permanente do Goal048/WU-01 roda
 * sobre `observedRefusalCategories` e que o controle 8 do §8 (Goal051 /
 * WU-04) roda sobre uma CÓPIA daquele conjunto com uma observação removida —
 * nunca duas implementações da mesma conta.
 */
function findUncoveredRefusalCategories(
  allRefusalCategories: readonly string[],
  observed: ReadonlySet<string>,
): string[] {
  return allRefusalCategories.filter(
    (category) => !observed.has(category) && !PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.has(category),
  );
}

describe("Goal051 / WU-04 (§8) — controles negativos: as oito amarras da partição de duas mãos mordem, cada uma com as duas saídas no relatório", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");

  /**
   * A árvore real, lida uma vez por controle: os sítios, o descobridor e os
   * cinco baldes nomeados. Cada controle corrompe uma **cópia** destes baldes
   * — nunca a árvore em disco, nunca o mecanismo de produção — e chama a
   * mesma conta que o teste permanente chama.
   */
  const readRealTree = (): {
    egress: HttpEgressDiscovery;
    discovery: GoServiceHttpRequestDiscovery;
    bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]>;
  } => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    return {
      egress,
      discovery,
      bucketsByName: {
        requests: discovery.requests,
        notGoBound: discovery.notGoBound,
        assembledUrls: discovery.assembledUrls,
        nonTransportMemberCalls: discovery.nonTransportMemberCalls,
        nonGoBoundInstantiations: discovery.nonGoBoundInstantiations,
      },
    };
  };

  const categoryOfSiteAt = (egress: HttpEgressDiscovery, position: string): HttpEgressSiteCategory =>
    egress.sites.find((site) => egressPositionKey(site) === position)!.category;

  it("controle 1 (§8.1) — entrada em balde que a categoria da origem não roteia reprova, nomeando balde, entrada, origem e categoria", () => {
    const { egress, discovery, bucketsByName } = readRealTree();

    const target = discovery.requests.find(
      (request) => request.method === "GET" && request.pathExpression === "/health",
    );
    expect(target).toBeDefined();
    const originPosition = egressPositionKey(target!.originSite);
    const originCategory = categoryOfSiteAt(egress, originPosition);

    // O cenário do controle, conferido em vez de suposto: `assembledUrls`
    // não está em nenhuma das duas mãos desta categoria, então a entrada
    // movida para lá é ilegítima nos dois sentidos.
    const routing = egressPartitionBucketsForCategory(originCategory);
    expect(routing).not.toBeNull();
    expect(routing!.ownOutput).not.toContain("assembledUrls");
    expect(routing!.derivedOutput).not.toContain("assembledUrls");

    // Saída 1 — baldes reais: nenhuma entrada fora do conjunto que a
    // categoria da sua origem roteia, e nenhum sítio sem balde.
    const before = findEgressPartitionFindings(egress.sites, bucketsByName);
    expect(before.entriesInBucketNotAllowedByOriginCategory).toEqual([]);
    expect(before.withoutBucket).toEqual([]);

    // Saída 2 — a MESMA entrada movida de `requests` para `assembledUrls`
    // numa cópia dos baldes: a mesma conta reprova, nomeando balde, entrada,
    // origem e categoria da origem.
    const moved: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      requests: discovery.requests.filter((request) => request !== target),
      assembledUrls: [...discovery.assembledUrls, target!],
    };
    const after = findEgressPartitionFindings(egress.sites, moved);
    expect(after.entriesInBucketNotAllowedByOriginCategory).toEqual([
      `assembledUrls ${egressPositionKey(target!)} com origem ${originPosition} [${originCategory}]`,
    ]);
    // E o movimento aparece também na outra mão: o sítio deixou de ter saída
    // própria em balde algum. Uma corrupção, duas amarras.
    expect(after.withoutBucket).toEqual([`${originPosition} [${originCategory}]`]);
  });

  it("controle 2 (§8.2) — as duas mãos são distintas, não a união: entrada derivada em balde de saída própria reprova, e entrada própria em balde de saída derivada também", () => {
    const { egress, discovery, bucketsByName } = readRealTree();

    // Uma entrada derivada real: declara um sítio em `originSite` e ocupa
    // outra `arquivo:linha`.
    const derivedEntry = discovery.assembledUrls.find(
      (entry) => egressPositionKey(entry) !== egressPositionKey(entry.originSite),
    );
    expect(derivedEntry).toBeDefined();
    const sitePosition = egressPositionKey(derivedEntry!.originSite);
    const siteCategory = categoryOfSiteAt(egress, sitePosition);
    expect(siteCategory.startsWith("constructor_base_url_")).toBe(true);

    // A entrada de saída própria do mesmo sítio: ocupa a posição do sítio.
    const ownEntry = discovery.notGoBound.find(
      (entry) =>
        egressPositionKey(entry.originSite) === sitePosition &&
        egressPositionKey(entry) === sitePosition,
    );
    expect(ownEntry).toBeDefined();

    // A união das duas mãos conteria os dois baldes — é exatamente por isso
    // que a checagem não pode ser feita sobre a união: as duas corrupções
    // abaixo passariam verdes por ela.
    const routing = egressPartitionBucketsForCategory(siteCategory);
    expect(routing).not.toBeNull();
    const union = new Set<string>([...routing!.ownOutput, ...routing!.derivedOutput]);
    expect(union.has("notGoBound")).toBe(true);
    expect(union.has("assembledUrls")).toBe(true);

    // Saída 1 — baldes reais, cada entrada na mão a que pertence: verde.
    expect(
      findEgressPartitionFindings(egress.sites, bucketsByName)
        .entriesInBucketNotAllowedByOriginCategory,
    ).toEqual([]);

    // Saída 2a — a entrada DERIVADA movida para o balde de saída PRÓPRIA:
    // `notGoBound` não está na mão derivada da categoria, e reprova.
    const derivedIntoOwnOutput: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      assembledUrls: discovery.assembledUrls.filter((entry) => entry !== derivedEntry),
      notGoBound: [...discovery.notGoBound, derivedEntry!],
    };
    expect(
      findEgressPartitionFindings(egress.sites, derivedIntoOwnOutput)
        .entriesInBucketNotAllowedByOriginCategory,
    ).toEqual([
      `notGoBound ${egressPositionKey(derivedEntry!)} com origem ${sitePosition} [${siteCategory}]`,
    ]);

    // Saída 2b — o inverso: a entrada PRÓPRIA movida para um balde de saída
    // DERIVADA. `assembledUrls` não está na mão própria da categoria, e
    // reprova. As duas mãos mordem em sentidos opostos.
    const ownIntoDerivedOutput: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      notGoBound: discovery.notGoBound.filter((entry) => entry !== ownEntry),
      assembledUrls: [...discovery.assembledUrls, ownEntry!],
    };
    const afterOwnMoved = findEgressPartitionFindings(egress.sites, ownIntoDerivedOutput);
    expect(afterOwnMoved.entriesInBucketNotAllowedByOriginCategory).toEqual([
      `assembledUrls ${sitePosition} com origem ${sitePosition} [${siteCategory}]`,
    ]);
    // E, como no controle 1, o sítio perde a saída própria: a outra amarra
    // acusa o mesmo movimento.
    expect(afterOwnMoved.withoutBucket).toEqual([`${sitePosition} [${siteCategory}]`]);
  });

  it("controle 3 (§8.3) — chave nova de saída reprova, nomeando a chave que a declaração não conhece", () => {
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    // Saída 1 — as chaves reais da execução: a declaração cobre todas, nos
    // dois sentidos, pela mesma conta que o teste permanente roda.
    const before = findDiscoveryUniverseFindings(Object.keys(discovery).sort());
    expect(before.undeclared).toEqual([]);
    expect(before.obsolete).toEqual([]);
    expect(before.emptyReason).toEqual([]);
    expect(before.partitionMismatch).toEqual([]);

    // Saída 2 — o descobridor passa a devolver uma coleção a mais, que a
    // declaração não nomeia: a mesma conta reprova, nomeando a chave.
    const grownDiscovery = { ...discovery, deferredByBudget: [] };
    const after = findDiscoveryUniverseFindings(Object.keys(grownDiscovery).sort());
    expect(after.undeclared).toEqual(["deferredByBudget"]);
    expect(after.obsolete).toEqual([]);
  });

  it("controle 4 (§8.4) — chave declarada que some reprova como declaração obsoleta, nomeando a chave", () => {
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );

    // Saída 1 — chaves reais: declaração nem obsoleta nem incompleta.
    const before = findDiscoveryUniverseFindings(Object.keys(discovery).sort());
    expect(before.undeclared).toEqual([]);
    expect(before.obsolete).toEqual([]);

    // Saída 2 — a leitura deixa de devolver `assembledUrls`, que a
    // declaração continua nomeando: a mesma conta reprova a declaração como
    // obsoleta, em vez de deixar a coleção sumir em silêncio.
    const shrunkDiscovery: Record<string, unknown> = { ...discovery };
    delete shrunkDiscovery.assembledUrls;
    const after = findDiscoveryUniverseFindings(Object.keys(shrunkDiscovery).sort());
    expect(after.obsolete).toEqual(["assembledUrls"]);
    expect(after.undeclared).toEqual([]);
  });

  it("controle 5 (§8.5) — a exceção de constructor_base_url_* continua não sendo vácua na forma nova: sumir o dado que a justifica reprova", () => {
    const { egress, discovery, bucketsByName } = readRealTree();

    // Saída 1 — árvore real: a exceção das duas mãos é justificada por sítio
    // de fato, pela mesma conta que o teste permanente da exceção roda.
    const before = findConstructorBaseUrlDualMembershipSites(egress.sites, bucketsByName);
    expect(before.length).toBeGreaterThan(0);
    for (const entry of before) {
      expect(entry).toContain("[constructor_base_url_");
    }

    // Saída 2 — numa cópia dos baldes sem as entradas DERIVADAS daqueles
    // sítios (as que declaram o sítio em `originSite` e ocupam outra
    // posição), o dado que justifica a exceção some. A mesma conta não acha
    // mais nada, e a asserção permanente reprova.
    const constructorSitePositions = new Set(
      egress.sites
        .filter((site) => site.category.startsWith("constructor_base_url_"))
        .map(egressPositionKey),
    );
    const withoutDerivedEntries = (
      entries: readonly EgressPartitionEntry[],
    ): readonly EgressPartitionEntry[] =>
      entries.filter(
        (entry) =>
          !(
            constructorSitePositions.has(egressPositionKey(entry.originSite)) &&
            egressPositionKey(entry) !== egressPositionKey(entry.originSite)
          ),
      );
    const withoutJustification: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      requests: withoutDerivedEntries(discovery.requests),
      notGoBound: withoutDerivedEntries(discovery.notGoBound),
      assembledUrls: withoutDerivedEntries(discovery.assembledUrls),
      nonTransportMemberCalls: withoutDerivedEntries(discovery.nonTransportMemberCalls),
      nonGoBoundInstantiations: withoutDerivedEntries(discovery.nonGoBoundInstantiations),
    };
    const after = findConstructorBaseUrlDualMembershipSites(egress.sites, withoutJustification);
    expect(after).toEqual([]);
    // A reprovação com a mensagem real da asserção permanente, não só o
    // vazio: sem o dado, o teste da exceção cai.
    expect(() => expect(after.length).toBeGreaterThan(0)).toThrow(/greater than 0/u);
  });

  it("controle 6 (§8.6) — as quatro saídas da partição do Goal050 continuam mordendo na forma nova: sítio perdido, sítio em mais de um balde de saída própria, origem inventada e motivo vazio", () => {
    const { egress, discovery, bucketsByName } = readRealTree();

    const target = discovery.requests.find(
      (request) => request.method === "GET" && request.pathExpression === "/health",
    );
    expect(target).toBeDefined();
    const originPosition = egressPositionKey(target!.originSite);
    const originCategory = categoryOfSiteAt(egress, originPosition);

    // Saída 1 — baldes reais: as quatro saídas vazias.
    const before = findEgressPartitionFindings(egress.sites, bucketsByName);
    expect(before.withoutBucket).toEqual([]);
    expect(before.inMoreThanOneBucket).toEqual([]);
    expect(before.entriesWithoutReadOrigin).toEqual([]);
    expect(before.entriesWithEmptyReason).toEqual([]);

    // Saída 2a — sítio perdido: a entrada sai do balde e nenhum outro
    // reclama a origem.
    const withoutTarget: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      requests: discovery.requests.filter((request) => request !== target),
    };
    expect(findEgressPartitionFindings(egress.sites, withoutTarget).withoutBucket).toEqual([
      `${originPosition} [${originCategory}]`,
    ]);

    // Saída 2b — sítio em mais de um balde de SAÍDA PRÓPRIA: a mesma origem
    // reclamada por `requests` e por `notGoBound`, os dois baldes da mão
    // própria desta categoria.
    const duplicated: EgressPartitionEntry = {
      filePath: target!.filePath,
      line: target!.line,
      originSite: target!.originSite,
      reason:
        "controle negativo: duplicata deliberada da mesma origem em segundo balde de saída própria",
    };
    const withDuplicate: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      notGoBound: [...discovery.notGoBound, duplicated],
    };
    expect(findEgressPartitionFindings(egress.sites, withDuplicate).inMoreThanOneBucket).toEqual([
      `${originPosition} [${originCategory}] em [requests, notGoBound]`,
    ]);

    // Saída 2c — entrada com origem inventada: balde não inventa sítio.
    const inventedOrigin: EgressPartitionEntry = {
      filePath: "apps/bff/src/clients/inventado.ts",
      line: 1,
      originSite: { filePath: "apps/bff/src/clients/inventado.ts", line: 999999 },
      reason: "controle negativo: origem que a leitura de sítios nunca produziu",
    };
    const withInventedOrigin: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      notGoBound: [...discovery.notGoBound, inventedOrigin],
    };
    expect(
      findEgressPartitionFindings(egress.sites, withInventedOrigin).entriesWithoutReadOrigin,
    ).toEqual([
      `notGoBound ${egressPositionKey(inventedOrigin)} com origem ${egressPositionKey(inventedOrigin.originSite)}`,
    ]);

    // Saída 2d — motivo vazio: sítio creditado por prosa vazia não conta.
    const emptyReasonEntry = { ...target!, reason: "   " };
    const withEmptyReason: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      requests: discovery.requests.map((request) =>
        request === target ? emptyReasonEntry : request,
      ),
    };
    expect(
      findEgressPartitionFindings(egress.sites, withEmptyReason).entriesWithEmptyReason,
    ).toEqual([`requests ${egressPositionKey(emptyReasonEntry)}`]);
  });

  it("controle 7 (§8.7) — o balde vazio na árvore real não vira vacuidade nova: povoado por árvore sintética, o sentido inverso passa com entrada legítima e reprova de fato com entrada inválida", () => {
    const { egress, discovery, bucketsByName } = readRealTree();

    // O balde é vazio de fato nesta baseline — é isto que tornaria a
    // checagem do sentido inverso vácua se ninguém a exercesse.
    expect(discovery.nonTransportMemberCalls).toEqual([]);

    const constructorSite = egress.sites.find((site) =>
      site.category.startsWith("constructor_base_url_"),
    );
    expect(constructorSite).toBeDefined();
    const envVarSite = egress.sites.find((site) => site.category.startsWith("env_var_"));
    expect(envVarSite).toBeDefined();

    // Saída 1 — árvore sintética que POVOA o balde com entrada LEGÍTIMA:
    // saída derivada de um sítio `constructor_base_url_*`, que a mão derivada
    // daquela categoria permite. Verde, e agora não por vacuidade.
    const legitimate: EgressPartitionEntry = {
      filePath: "apps/bff/src/clients/evolution/index.ts",
      line: 900001,
      originSite: { filePath: constructorSite!.filePath, line: constructorSite!.line },
      reason:
        "árvore sintética: chamada de membro fora da superfície de um cliente instanciado a partir do sítio",
    };
    const populatedLegitimately: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      nonTransportMemberCalls: [legitimate],
    };
    const afterLegitimate = findEgressPartitionFindings(egress.sites, populatedLegitimately);
    expect(afterLegitimate.entriesInBucketNotAllowedByOriginCategory).toEqual([]);
    expect(afterLegitimate.entriesWithoutReadOrigin).toEqual([]);

    // Saída 2 — a mesma árvore sintética povoada com entrada INVÁLIDA: a
    // origem é de categoria `env_var_*`, cuja mão derivada não contém este
    // balde. A mesma conta reprova, nomeando balde, entrada, origem e
    // categoria — prova de que o balde vazio passou a ser exercido.
    const invalid: EgressPartitionEntry = {
      ...legitimate,
      originSite: { filePath: envVarSite!.filePath, line: envVarSite!.line },
      reason: "árvore sintética: origem env_var_*, cuja mão derivada não roteia este balde",
    };
    const populatedInvalidly: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      nonTransportMemberCalls: [invalid],
    };
    expect(
      findEgressPartitionFindings(egress.sites, populatedInvalidly)
        .entriesInBucketNotAllowedByOriginCategory,
    ).toEqual([
      `nonTransportMemberCalls ${egressPositionKey(invalid)} com origem ${egressPositionKey(invalid.originSite)} [${envVarSite!.category}]`,
    ]);
  });

  it("controle 8 (§8.8) — a enumeração de descarte e a cobertura de categoria do Goal049/050 continuam mordendo: descarte não registrado reprova com a linha e o trecho, e categoria sem controle é acusada como órfã", () => {
    // Parte A — a enumeração de descarte mudo, fail-closed nos três sentidos.
    // Fonte ampliada pelo Goal052/WU-02 (`enumerateSilentDiscardOccurrences`,
    // acima): toda ocorrência de `continue;` em código, não mais só a forma
    // idiomática de guarda que `findSilentDiscardLines` reconhecia.
    const realOccurrences = enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts");
    // O tamanho exato do registro é provado pelo teste permanente do
    // Goal052/WU-02 acima; aqui só a não-vacuidade importa, para não
    // duplicar o número escrito à mão em dois lugares.
    expect(DOCUMENTED_SILENT_DISCARDS.size).toBeGreaterThan(0);

    // Saída 1 — leitura real do módulo: nada não registrado, nada obsoleto,
    // nada com motivo vazio, nenhuma chave ambígua.
    const beforeDiscard = findSilentDiscardFindings(realOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(beforeDiscard.unregistered).toEqual([]);
    expect(beforeDiscard.obsolete).toEqual([]);
    expect(beforeDiscard.emptyReason).toEqual([]);
    expect(beforeDiscard.ambiguousKeys).toEqual([]);

    // Saída 2 — descarte guardado por valor ausente em ponto não registrado,
    // inserido numa CÓPIA do fonte, dentro de um `for…of` (classe iteração
    // sobre candidatos, para que a classificação o exija registrado): a
    // mesma conta reprova, com a linha e o trecho na mensagem.
    const injectedSnippet = "if (valorAusenteNaoRegistrado === undefined) continue;";
    const mutatedSource = `function descarteNaoRegistradoDoControle8(candidatos) {\n  for (const candidato of candidatos) {\n    ${injectedSnippet}\n  }\n}\n\n${moduleSource}`;
    const mutatedOccurrences = enumerateSilentDiscardOccurrences(mutatedSource, "http-egress-sites.ts");
    const injected = mutatedOccurrences.find((occurrence) => occurrence.snippet === injectedSnippet);
    expect(injected).toBeDefined();
    expect(injected!.anchor).toBe("descarteNaoRegistradoDoControle8");
    expect(injected!.requiresRegistration).toBe(true);
    const afterDiscard = findSilentDiscardFindings(mutatedOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(afterDiscard.unregistered).toEqual([`${injected!.line}: "${injectedSnippet}"`]);
    // Deslocamento não é achado: as entradas reais continuam registradas,
    // porque a chave é trecho normalizado mais função envolvente.
    expect(afterDiscard.obsolete).toEqual([]);

    // Parte B — a cobertura das categorias, computada dos arrays em runtime.
    const allRefusalCategories: readonly string[] = [
      ...INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES,
      ...CLASS_BINDING_REFUSAL_CATEGORIES,
      ...CLIENT_FIELD_USE_REFUSAL_CATEGORIES,
    ];
    expect(allRefusalCategories.length).toBe(24);
    // As 2 inalcançáveis são descontadas por registro nomeado, e continuam
    // pertencendo aos arrays — entrada obsoleta reprovaria.
    expect(PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.size).toBe(2);
    for (const category of PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.keys()) {
      expect(allRefusalCategories).toContain(category);
      expect(observedRefusalCategories.has(category)).toBe(false);
    }

    const removedCategory = allRefusalCategories.find(
      (category) =>
        !PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.has(category) &&
        observedRefusalCategories.has(category),
    );
    expect(removedCategory).toBeDefined();

    // Saída 1 — a categoria escolhida está coberta: algum controle a observou
    // via expectRefusal em runtime, até este ponto da suíte.
    expect(observedRefusalCategories.has(removedCategory!)).toBe(true);

    // Saída 2 — removida a observação de uma CÓPIA do conjunto, a mesma conta
    // que o teste permanente do Goal048/WU-01 roda acusa a categoria órfã.
    const withoutRemovedCategory = new Set(observedRefusalCategories);
    withoutRemovedCategory.delete(removedCategory!);
    const uncoveredCategories = findUncoveredRefusalCategories(
      allRefusalCategories,
      withoutRemovedCategory,
    );
    expect(uncoveredCategories).toEqual([removedCategory]);

    // E a amarra de categoria do Goal049 segue mordendo: categoria fora dos
    // três arrays reprova antes mesmo de a mensagem observada importar.
    expect(() =>
      expectRefusal(
        () => {
          throw new Error("mensagem qualquer, com [categoria: client_field_use_destructured]");
        },
        "categoria_que_nao_existe_em_array_nenhum_no_controle_8" as unknown as DeclaredRefusalCategory,
        /mensagem qualquer/u,
      ),
    ).toThrow(/não pertence a INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES/u);
  });
});

describe("Goal048 / WU-01 — a cobertura de recusa é computada em runtime a partir dos três arrays, nunca contra lista literal", () => {
  it("toda categoria de INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES, CLASS_BINDING_REFUSAL_CATEGORIES e CLIENT_FIELD_USE_REFUSAL_CATEGORIES tem ao menos um controle que a observou via expectRefusal em runtime — categoria sem controle reprova nomeando qual ficou descoberta, e as duas provadas INALCANÇÁVEIS são descontadas por registro nomeado que o próprio teste confere", () => {
    const allRefusalCategories: readonly string[] = [
      ...INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES,
      ...CLASS_BINDING_REFUSAL_CATEGORIES,
      ...CLIENT_FIELD_USE_REFUSAL_CATEGORIES,
    ];
    for (const [category, reason] of PROVEN_UNREACHABLE_REFUSAL_CATEGORIES) {
      // Resíduo declarado é resíduo PROVADO: a categoria tem de continuar
      // existindo no array (entrada obsoleta reprova) e tem de continuar
      // nunca sendo observada (categoria que volta a acontecer reprova, em
      // vez de ficar isenta para sempre por uma linha escrita à mão).
      expect(allRefusalCategories).toContain(category);
      expect(reason.length).toBeGreaterThan(0);
      expect([...observedRefusalCategories].filter((observed) => observed === category)).toEqual(
        [],
      );
    }
    // A mesma conta que o controle 8 do §8 (Goal051 / WU-04) roda sobre uma
    // cópia de observedRefusalCategories com uma observação removida.
    const uncoveredCategories = findUncoveredRefusalCategories(
      allRefusalCategories,
      observedRefusalCategories,
    );
    expect(uncoveredCategories).toEqual([]);
  });
});

describe("Goal052 / WU-04 (§9) — controles negativos: as oito amarras do descarte enumerado por inteiro mordem, cada uma chamando a mesma conta que o teste permanente chama, com as duas saídas no relatório", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");

  it("controle 1 (§9.1) — descarte novo em laço de candidatos, guardado por condição fora da regex antiga, reprova nomeando arquivo:linha; a classe iteração sobre candidatos é a que exige o registro", () => {
    const injectedSnippet = "if (candidato.length === 0) continue;";
    // A regex antiga (findSilentDiscardLines, Goal050) só reconhece
    // `=== undefined`, `=== null` ou `!identificador` — `.length === 0` está
    // genuinamente fora dela: a forma antiga nunca veria este descarte.
    expect(findSilentDiscardLines(injectedSnippet)).toEqual([]);

    // Antes: a árvore real, sem a injeção, passa verde pela mesma conta que
    // o teste permanente do Goal052/WU-02 chama.
    const before = findSilentDiscardFindings(
      enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts"),
      DOCUMENTED_SILENT_DISCARDS,
    );
    expect(before.unregistered).toEqual([]);

    // Depois: a mesma injeção, dentro de um `for…of` (classe iteração sobre
    // candidatos), numa CÓPIA do fonte — a mesma conta reprova, nomeando
    // arquivo:linha e o trecho; a classe computada (requiresRegistration)
    // é o que a exige registrada.
    const mutatedSource = `function descarteControle1(candidatos) {\n  for (const candidato of candidatos) {\n    ${injectedSnippet}\n  }\n}\n\n${moduleSource}`;
    const mutatedOccurrences = enumerateSilentDiscardOccurrences(
      mutatedSource,
      "http-egress-sites.ts",
    );
    const injected = mutatedOccurrences.find(
      (occurrence) => occurrence.snippet === injectedSnippet,
    );
    expect(injected).toBeDefined();
    expect(injected!.anchor).toBe("descarteControle1");
    // A classe: iteração sobre candidatos (for-of), a única que exige registro.
    expect(injected!.requiresRegistration).toBe(true);
    const after = findSilentDiscardFindings(mutatedOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(after.unregistered).toEqual([`${injected!.line}: "${injectedSnippet}"`]);

    // Goal053 §9.1 — sobre a árvore real: remover a entrada de uma das seis
    // ocorrências reais de domínio `element-collection` (escopo §3) produz
    // `unregistered` nomeando a linha. Antes deste Goal, `for-indexed`
    // isentava em bloco por classe, e a mesma remoção não produzia nada.
    const realOccurrences = enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts");
    const elementCollectionOccurrence = realOccurrences.find(
      (occurrence) =>
        occurrence.key ===
        silentDiscardKey(
          "readEnvFileValue",
          'if (trimmed === "" || trimmed.startsWith("#")) continue;',
        ),
    );
    expect(elementCollectionOccurrence).toBeDefined();
    expect(elementCollectionOccurrence!.requiresRegistration).toBe(true);
    const beforeRealRemoval = findSilentDiscardFindings(realOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(beforeRealRemoval.unregistered).toEqual([]);
    const registryWithoutEntry = new Map(DOCUMENTED_SILENT_DISCARDS);
    registryWithoutEntry.delete(elementCollectionOccurrence!.key);
    const afterRealRemoval = findSilentDiscardFindings(realOccurrences, registryWithoutEntry);
    expect(afterRealRemoval.unregistered).toEqual([
      `${elementCollectionOccurrence!.line}: "${elementCollectionOccurrence!.snippet}"`,
    ]);
  });

  it("controle 2 (§9.2) — `continue;` nu em laço de candidatos não registrado reprova — a forma que a regex antiga nunca via", () => {
    const injectedSnippet = "continue;";

    // Antes: a árvore real passa verde pela mesma conta.
    const before = findSilentDiscardFindings(
      enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts"),
      DOCUMENTED_SILENT_DISCARDS,
    );
    expect(before.unregistered).toEqual([]);

    // Depois: `continue;` nu (sem guarda alguma) dentro de um `for…of`
    // novo, não registrado — a mesma conta reprova.
    const mutatedSource = `function descarteControle2(candidatos) {\n  for (const candidato of candidatos) {\n    if (candidato) {\n      ${injectedSnippet}\n    }\n  }\n}\n\n${moduleSource}`;
    const mutatedOccurrences = enumerateSilentDiscardOccurrences(
      mutatedSource,
      "http-egress-sites.ts",
    );
    const injected = mutatedOccurrences.find(
      (occurrence) => occurrence.anchor === "descarteControle2" && occurrence.snippet === injectedSnippet,
    );
    expect(injected).toBeDefined();
    expect(injected!.requiresRegistration).toBe(true);
    const after = findSilentDiscardFindings(mutatedOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(after.unregistered).toEqual([`${injected!.line}: "${injectedSnippet}"`]);

    // Goal053 §9.7 — nada do Goal052 foi afrouxado: um `continue;` dentro de
    // um `for…of` (classe candidata) continua exigindo registro mesmo com o
    // corpo tendo a cara de sequência de caracteres (`text: string`) — a
    // classe do laço já basta, e o domínio (sempre `no-domain` para
    // `for…of`) nunca isenta essa classe.
    const candidateLikeTextSource = [
      "function descarteControle2NadaAfrouxado(text: string) {",
      "  for (const char of text) {",
      '    if (char === " ") continue;',
      "  }",
      "}",
      "",
    ].join("\n");
    const candidateLikeTextOccurrences = enumerateSilentDiscardOccurrences(
      candidateLikeTextSource,
      "sintetico-controle2.ts",
    );
    expect(candidateLikeTextOccurrences).toHaveLength(1);
    expect(candidateLikeTextOccurrences[0].requiresRegistration).toBe(true);
  });

  it("controle 3 (§9.3) — laço de forma não reconhecida reprova, nomeando arquivo:linha e dizendo que a classe não resolveu, em vez de isentar", () => {
    // Antes: a árvore real inteira resolve toda ocorrência, resíduo zero —
    // a mesma conta que o teste permanente do Goal052/WU-01 chama.
    const before = findContinueEnumerationFindings(
      enumerateContinueOccurrences(moduleSource, "http-egress-sites.ts"),
    );
    expect(before.unresolved).toEqual([]);

    // Depois: `for (candidatos) continue;` — cabeçalho fora das três formas
    // reconhecidas (for-of, for-in, for indexado) — reprova nomeando
    // arquivo:linha e o motivo, em vez de cair num "else" mudo que isenta.
    const unrecognizedSource = [
      "function scanControle3(candidatos) {",
      "  for (candidatos) {",
      "    continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const after = findContinueEnumerationFindings(
      enumerateContinueOccurrences(unrecognizedSource, "sintetico-controle3.ts"),
    );
    expect(after.unresolved).toEqual([
      'sintetico-controle3.ts:3: cabeçalho de `for` fora das formas reconhecidas (for-of, for-in, for indexado): "candidatos" — "continue;"',
    ]);
    expect(after.byLoopForm).toEqual({});

    // E o mesmo vale para `while`: desde a rodada 2 deste Goal não há classe
    // de sobra para `while`, então cabeçalho que não é exec-match, nem
    // drenagem de fila, nem cursor posicional REPROVA em vez de virar uma
    // classe genérica isenta — que era exatamente o fail-open da rodada 1.
    const unrecognizedWhileSource = [
      "function scanControle3While(state) {",
      "  while (state.ready && state.pending) {",
      "    continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const afterWhile = findContinueEnumerationFindings(
      enumerateContinueOccurrences(unrecognizedWhileSource, "sintetico-controle3.ts"),
    );
    expect(afterWhile.unresolved).toEqual([
      'sintetico-controle3.ts:3: cabeçalho de `while` fora das formas reconhecidas (exec-match, drenagem de fila, cursor posicional): "state.ready && state.pending" — "continue;"',
    ]);
    expect(afterWhile.byLoopForm).toEqual({});

    // Goal053 §9.4 — domínio não resolvido reprova, nomeando arquivo:linha e
    // o motivo, em vez de isentar: cabeçalho reconhecido (`for-indexed`),
    // mas o cursor não indexa valor algum no corpo.
    const unresolvedDomainSource = [
      "function scanControle3Domain(limit) {",
      "  for (let i = 0; i < limit; i += 1) {",
      "    continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const unresolvedDomainFindings = findContinueEnumerationFindings(
      enumerateContinueOccurrences(unresolvedDomainSource, "sintetico-controle3-dominio.ts"),
    );
    expect(unresolvedDomainFindings.byCursorDomain).toEqual({});
    expect(unresolvedDomainFindings.unresolved).toEqual([
      'sintetico-controle3-dominio.ts:3: o cursor `i` do laço `for (let i = 0; i < limit; i += 1)` não indexa valor algum no corpo, então o domínio percorrido não pode ser resolvido — "continue;"',
    ]);

    // E domínio fora do vocabulário declarado (`CONTINUE_CURSOR_DOMAINS`)
    // também reprova, nomeada — a mesma ocorrência real, com um domínio
    // inventado, na mesma conta.
    const [firstRealCodeOccurrence] = enumerateContinueOccurrences(
      moduleSource,
      "http-egress-sites.ts",
    ).filter((occurrence) => occurrence.context === "code");
    expect(firstRealCodeOccurrence).toBeDefined();
    expect(findContinueEnumerationFindings([firstRealCodeOccurrence]).outsideVocabulary).toEqual([]);
    const outsideDomainVocabularyFindings = findContinueEnumerationFindings([
      { ...firstRealCodeOccurrence, cursorDomain: "dominio-inventado" as ContinueCursorDomain },
    ]);
    expect(outsideDomainVocabularyFindings.outsideVocabulary).toEqual([
      `http-egress-sites.ts:${firstRealCodeOccurrence.line}: domínio "dominio-inventado" fora de CONTINUE_CURSOR_DOMAINS — "${firstRealCodeOccurrence.text}"`,
    ]);
    expect(outsideDomainVocabularyFindings.byCursorDomain).toEqual({});
  });

  it("controle 4 (§9.4) — entrada registrada que perde a ocorrência reprova como obsoleta", () => {
    const realOccurrences = enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts");

    // Antes: toda entrada do registro tem ocorrência correspondente.
    const before = findSilentDiscardFindings(realOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(before.obsolete).toEqual([]);

    // Depois: numa CÓPIA das ocorrências, sem a única que sustenta a chave
    // de `resolveViaCallers` — a mesma conta reprova a entrada como obsoleta.
    const targetKey = silentDiscardKey("resolveViaCallers", "if (!argExpression) continue;");
    const target = realOccurrences.find((occurrence) => occurrence.key === targetKey);
    expect(target).toBeDefined();
    const withoutTarget = realOccurrences.filter((occurrence) => occurrence !== target);
    const after = findSilentDiscardFindings(withoutTarget, DOCUMENTED_SILENT_DISCARDS);
    expect(after.obsolete).toEqual([targetKey]);
  });

  it("controle 5 (§9.5) — motivo vazio reprova, e o registro continua lançando em chave duplicada dentro de si", () => {
    const realOccurrences = enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts");

    // Antes: nenhuma entrada do registro tem motivo vazio.
    const before = findSilentDiscardFindings(realOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(before.emptyReason).toEqual([]);

    // Depois: numa CÓPIA do registro, com o motivo de uma entrada real
    // esvaziado — a mesma conta reprova, nomeando a chave.
    const targetKey = silentDiscardKey("resolveViaCallers", "if (!argExpression) continue;");
    const entry = DOCUMENTED_SILENT_DISCARDS.get(targetKey);
    expect(entry).toBeDefined();
    const corruptedRegistry = new Map(DOCUMENTED_SILENT_DISCARDS);
    corruptedRegistry.set(targetKey, { ...entry!, reason: "" });
    const after = findSilentDiscardFindings(realOccurrences, corruptedRegistry);
    expect(after.emptyReason).toEqual([targetKey]);

    // E o registro continua lançando em chave duplicada dentro de si.
    expect(() =>
      buildSilentDiscardRegistry([
        { anchor: "controle5", snippet: "continue;", reason: "primeira entrada" },
        { anchor: "controle5", snippet: "continue;", reason: "segunda entrada" },
      ]),
    ).toThrow(/chave duplicada/u);
  });

  it("controle 6 (§9.6) — deslocamento de linha continua não reprovando em massa, na forma nova: inserir linhas acima dos descartes desloca a numeração, mas a chave sobrevive", () => {
    const before = enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts");
    expect(before.length).toBeGreaterThan(0);
    const beforeFindings = findSilentDiscardFindings(before, DOCUMENTED_SILENT_DISCARDS);
    expect(beforeFindings.unregistered).toEqual([]);
    expect(beforeFindings.obsolete).toEqual([]);
    expect(beforeFindings.ambiguousKeys).toEqual([]);

    // Desloca toda a numeração do módulo inserindo 200 linhas em branco no
    // início — mesma prova do controle de :8056, sobre o mecanismo novo.
    const shiftedSource = `${"\n".repeat(200)}${moduleSource}`;
    const after = enumerateSilentDiscardOccurrences(shiftedSource, "http-egress-sites.ts");
    expect(after.length).toBe(before.length);
    for (let index = 0; index < before.length; index += 1) {
      expect(after[index].line).toBe(before[index].line + 200);
      expect(after[index].key).toBe(before[index].key);
    }

    // O deslocamento não reprova em massa: a chave (trecho normalizado mais
    // função envolvente) não depende do número de linha.
    const afterFindings = findSilentDiscardFindings(after, DOCUMENTED_SILENT_DISCARDS);
    expect(afterFindings.unregistered).toEqual([]);
    expect(afterFindings.obsolete).toEqual([]);
    expect(afterFindings.ambiguousKeys).toEqual([]);
  });

  it("controle 7 (§9.7), adaptado pelo Goal053 §2 — mover um `continue;` entre classes muda a exigência de registro nos dois sentidos: leitura posicional sobre sequência de caracteres não exige (domínio `character-sequence` provado pela anotação `: string`), iteração sobre candidatos exige", () => {
    // A mesma guarda, dentro de um laço `for` indexado (leitura posicional):
    // `text: string` prova o domínio `character-sequence` — não é candidato
    // descartado, não exige registro.
    const positionalSource = [
      "function scanControle7Positional(text: string) {",
      "  for (let i = 0; i < text.length; i += 1) {",
      '    if (text[i] === " ") continue;',
      "  }",
      "}",
      "",
    ].join("\n");
    const positionalOccurrences = enumerateSilentDiscardOccurrences(
      positionalSource,
      "sintetico-controle7.ts",
    );
    expect(positionalOccurrences).toHaveLength(1);
    expect(positionalOccurrences[0].requiresRegistration).toBe(false);
    const positionalFindings = findSilentDiscardFindings(
      positionalOccurrences,
      DOCUMENTED_SILENT_DISCARDS,
    );
    // Não registrado, mas a classe leitura posicional não exige — a mesma
    // conta não acusa.
    expect(positionalFindings.unregistered).toEqual([]);

    // A MESMA guarda, movida para dentro de um `for…of`: a classificação
    // muda para iteração sobre candidatos, e passa a exigir registro — não
    // registrada, a mesma conta reprova.
    const candidateSource = [
      "function scanControle7Candidate(items) {",
      "  for (const item of items) {",
      '    if (item === " ") continue;',
      "  }",
      "}",
      "",
    ].join("\n");
    const candidateOccurrences = enumerateSilentDiscardOccurrences(
      candidateSource,
      "sintetico-controle7.ts",
    );
    expect(candidateOccurrences).toHaveLength(1);
    expect(candidateOccurrences[0].requiresRegistration).toBe(true);
    const candidateFindings = findSilentDiscardFindings(
      candidateOccurrences,
      DOCUMENTED_SILENT_DISCARDS,
    );
    expect(candidateFindings.unregistered).toEqual([
      `${candidateOccurrences[0].line}: "${candidateOccurrences[0].snippet}"`,
    ]);

    // E a mesma troca dentro de `while`, que é onde a rodada 1 deste Goal
    // falhava: cursor escalar contra limite sobre sequência de caracteres
    // (`text: string`) não exige registro; a MESMA guarda dentro de um
    // `while` que drena uma fila passa a exigir.
    const whilePositionalSource = [
      "function scanControle7WhilePositional(text: string) {",
      "  let i = 0;",
      "  while (i < text.length) {",
      "    i += 1;",
      '    if (text[i] === " ") continue;',
      "  }",
      "}",
      "",
    ].join("\n");
    const whilePositionalOccurrences = enumerateSilentDiscardOccurrences(
      whilePositionalSource,
      "sintetico-controle7.ts",
    );
    expect(whilePositionalOccurrences).toHaveLength(1);
    expect(whilePositionalOccurrences[0].requiresRegistration).toBe(false);
    expect(
      findSilentDiscardFindings(whilePositionalOccurrences, DOCUMENTED_SILENT_DISCARDS)
        .unregistered,
    ).toEqual([]);

    const whileQueueSource = [
      "function scanControle7WhileQueue(pending) {",
      "  while (pending.length > 0) {",
      "    const item = pending.shift();",
      '    if (item === " ") continue;',
      "  }",
      "}",
      "",
    ].join("\n");
    const whileQueueOccurrences = enumerateSilentDiscardOccurrences(
      whileQueueSource,
      "sintetico-controle7.ts",
    );
    expect(whileQueueOccurrences).toHaveLength(1);
    expect(whileQueueOccurrences[0].requiresRegistration).toBe(true);
    expect(
      findSilentDiscardFindings(whileQueueOccurrences, DOCUMENTED_SILENT_DISCARDS).unregistered,
    ).toEqual([
      `${whileQueueOccurrences[0].line}: "${whileQueueOccurrences[0].snippet}"`,
    ]);

    // Goal053 §9.3 — fecha a observação 2 do review052: `while (i <
    // pending.length)` que consome elementos (`pending.splice(…)`) passa a
    // exigir registro (domínio `element-collection`, provado por
    // `pending = source.split(…)`), e a MESMA forma `while (i < X.length)`
    // sobre sequência de caracteres continua isenta.
    const whileIndexedStringSource = [
      "function scanControle7WhileIndexedString(body: string) {",
      "  let i = 0;",
      "  while (i < body.length) {",
      '    if (body[i] === " ") continue;',
      "    i += 1;",
      "  }",
      "}",
      "",
    ].join("\n");
    const whileIndexedStringOccurrences = enumerateSilentDiscardOccurrences(
      whileIndexedStringSource,
      "sintetico-controle7.ts",
    );
    expect(whileIndexedStringOccurrences).toHaveLength(1);
    expect(whileIndexedStringOccurrences[0].requiresRegistration).toBe(false);

    const whileIndexedElementsSource = [
      "function scanControle7WhileIndexedElements(source: string) {",
      '  const pending = source.split(",");',
      "  let i = 0;",
      "  while (i < pending.length) {",
      '    if (pending[i] === "") continue;',
      "    pending.splice(i, 1);",
      "  }",
      "}",
      "",
    ].join("\n");
    const whileIndexedElementsOccurrences = enumerateSilentDiscardOccurrences(
      whileIndexedElementsSource,
      "sintetico-controle7.ts",
    );
    expect(whileIndexedElementsOccurrences).toHaveLength(1);
    expect(whileIndexedElementsOccurrences[0].requiresRegistration).toBe(true);
  });

  it("controle 8 (§9.8) — a partição do Goal050/051 e a cobertura das 24 categorias do Goal049 continuam mordendo: entrada em balde não permitido pela categoria da origem, chave nova no universo de saída, e categoria órfã na cobertura — uma cada, com as duas saídas", () => {
    const egress = discoverHttpEgressSites(aiOrchestratorSrcPath, bffSrcPath);
    const discovery = discoverGoServiceHttpRequests(
      aiOrchestratorSrcPath,
      bffSrcPath,
      envSchemaSourcePath,
    );
    const bucketsByName: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      requests: discovery.requests,
      notGoBound: discovery.notGoBound,
      assembledUrls: discovery.assembledUrls,
      nonTransportMemberCalls: discovery.nonTransportMemberCalls,
      nonGoBoundInstantiations: discovery.nonGoBoundInstantiations,
    };

    // Amarra A — entriesInBucketNotAllowedByOriginCategory (Goal051).
    // Antes: baldes reais, limpos.
    const beforePartition = findEgressPartitionFindings(egress.sites, bucketsByName);
    expect(beforePartition.entriesInBucketNotAllowedByOriginCategory).toEqual([]);
    // Depois: a mesma entrada real movida de `requests` para `assembledUrls`
    // — nenhuma das duas mãos da categoria de origem permite — reprova.
    const target = discovery.requests.find(
      (request) => request.method === "GET" && request.pathExpression === "/health",
    );
    expect(target).toBeDefined();
    const originPosition = egressPositionKey(target!.originSite);
    const originCategory = egress.sites.find(
      (site) => egressPositionKey(site) === originPosition,
    )!.category;
    const movedBuckets: Record<EgressPartitionBucket, readonly EgressPartitionEntry[]> = {
      ...bucketsByName,
      requests: discovery.requests.filter((request) => request !== target),
      assembledUrls: [...discovery.assembledUrls, target!],
    };
    const afterPartition = findEgressPartitionFindings(egress.sites, movedBuckets);
    expect(afterPartition.entriesInBucketNotAllowedByOriginCategory).toEqual([
      `assembledUrls ${egressPositionKey(target!)} com origem ${originPosition} [${originCategory}]`,
    ]);

    // Amarra B — chave nova no universo de saída (GO_SERVICE_HTTP_REQUEST_DISCOVERY_UNIVERSE, Goal051).
    // Antes: as chaves reais, todas declaradas.
    const beforeUniverse = findDiscoveryUniverseFindings(Object.keys(discovery).sort());
    expect(beforeUniverse.undeclared).toEqual([]);
    // Depois: uma coleção a mais que a declaração não nomeia — reprova.
    const grownDiscovery = { ...discovery, unknownCollectionControle8: [] };
    const afterUniverse = findDiscoveryUniverseFindings(Object.keys(grownDiscovery).sort());
    expect(afterUniverse.undeclared).toEqual(["unknownCollectionControle8"]);

    // Amarra C — categoria órfã na cobertura das 24 categorias (Goal049).
    const allRefusalCategories: readonly string[] = [
      ...INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES,
      ...CLASS_BINDING_REFUSAL_CATEGORIES,
      ...CLIENT_FIELD_USE_REFUSAL_CATEGORIES,
    ];
    expect(allRefusalCategories.length).toBe(24);
    // Antes: cobertura real, sem categoria descoberta.
    const beforeCoverage = findUncoveredRefusalCategories(
      allRefusalCategories,
      observedRefusalCategories,
    );
    expect(beforeCoverage).toEqual([]);
    // Depois: numa CÓPIA de observedRefusalCategories, sem a observação de
    // uma categoria alcançável — a mesma conta a acusa como órfã.
    const removedCategory = allRefusalCategories.find(
      (category) =>
        !PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.has(category) &&
        observedRefusalCategories.has(category),
    );
    expect(removedCategory).toBeDefined();
    const withoutRemovedCategory = new Set(observedRefusalCategories);
    withoutRemovedCategory.delete(removedCategory!);
    const afterCoverage = findUncoveredRefusalCategories(
      allRefusalCategories,
      withoutRemovedCategory,
    );
    expect(afterCoverage).toEqual([removedCategory]);
  });
});
