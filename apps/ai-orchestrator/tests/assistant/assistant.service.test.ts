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
    // QA A-01 / Goal057: substitui a resposta que afirma efeito nao gravado.
    "Ainda nao ficou registrado na agenda. Posso confirmar agora pra voce?",
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
          line: 1261,
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
          line: 775,
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
      // QA A-01 / Goal057: mesma entrada nova da baseline do fechamento (A-09 / Goal034).
      "Ainda nao ficou registrado na agenda. Posso confirmar agora pra voce?",
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
        // Goal073 (WU-02) acrescentou schema e metodos ao client antes deste
        // ponto (isencao de politica, leitura de antecedencia minima); a
        // linha e o numero real, computado pelo AST, nao um valor escolhido.
        line: 837,
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
  it("1 superfície, 4 ligações resolvidas, 10 rotas, 2 instanciações fora do transporte, 0 chamadas de membro fora da superfície — os mesmos números da baseline do Goal045, exceto o de arquivos varridos pela resolução de instanciação: com o modelo AgendaViewPreference do Goal073 gerado em apps/bff/src/generated/prisma, o modelo HumanTakeover do Goal074 gerado em apps/ai-orchestrator/src/generated/prisma modules/prompts/service-instructions.ts do Goal078 e lib/calendar-source.ts do Goal109, elas somam hoje 210 arquivos .ts (121 em apps/ai-orchestrator/src, 89 em apps/bff/src) — o número computado pelo AST (210) prevalece sobre qualquer contagem anterior capturada antes desse arquivo existir na árvore", () => {
    const { requests, internalClientSurfaces, nonGoBoundInstantiations, nonTransportMemberCalls } =
      discoverGoServiceHttpRequests(aiOrchestratorSrcPath, bffSrcPath, envSchemaSourcePath);

    expect(internalClientSurfaces).toHaveLength(1);
    expect(internalClientSurfaces[0].instantiationBindings).toHaveLength(4);
    expect(internalClientSurfaces[0].scannedFilePathsForInstantiation).toHaveLength(210);
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
 * números da árvore real com as 45 ocorrências de `this.http.` classificadas
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
 * `DISCARD_CANDIDATE_LOOP_FORMS`, abaixo), não mais só a forma
 * idiomática de guarda com que o Goal050 abriu este registro — essa forma
 * continua presente entre as entradas, só deixou de ser o TETO do alcance.
 * A classe **leitura posicional** (laço `for` indexado e `while` de cursor
 * escalar contra limite) permanece de fora de propósito: a isenção dela é
 * o critério computado do Goal052 §2 (`DiscardOccurrence.loopForm`), não
 * um registro por ocorrência — é por isso que o alcance continua PARCIAL,
 * não total sobre `continue;`. O total
 * de ocorrências de `continue;` do módulo NÃO é escrito aqui: quem o
 * conhece é `enumerateDiscardOccurrences` (Goal052 / WU-01, abaixo), que o
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
  /**
   * FORMA de descarte da ocorrência registrada (Goal054 §4). Ausente
   * significa `continue`, a forma de toda entrada que o registro já tinha
   * quando o alfabeto era de uma forma só — as 47 entradas anteriores são
   * adaptadas por omissão, nunca reescritas. A chave carrega a forma, de
   * modo que uma entrada de `break` e uma de `continue` no mesmo ponto
   * âncora nunca colidem nem se fundem em silêncio.
   */
  readonly form?: DiscardForm;
}

/** Colapsa espaços internos e remove bordas, para que o mesmo trecho lido em pontos diferentes normalize à mesma string. */
function normalizeSilentDiscardSnippet(snippet: string): string {
  return snippet.replace(/\s+/gu, " ").trim();
}

/**
 * Chave estável do registro: a função de nível superior que contém a
 * ocorrência (ou `<module-level>`), a FORMA de descarte (Goal054 §4) e o
 * trecho normalizado. Nunca número de linha — proibido desde o Goal050.
 *
 * A forma entra na chave porque o mesmo ponto âncora pode ter ocorrências de
 * formas diferentes cujo trecho normaliza para a MESMA string: `return
 * undefined;` da própria varredura e `return undefined;` de uma função
 * aninhada no corpo do laço são o caso extremo — texto idêntico, exigência
 * oposta. Sem a forma na chave, uma entrada de `break` e uma de `continue` no
 * mesmo âncora se fundiriam dentro da multiplicidade declarada (Goal052 §4),
 * que conta ocorrências legítimas da MESMA forma, não formas diferentes
 * empilhadas.
 *
 * `form` ausente significa `continue`: é a forma de toda entrada anterior ao
 * Goal054, adaptada sem reescrita. Entrada de forma nova declara a sua, e por
 * isso nunca cai na chave de `continue`.
 */
function silentDiscardKey(
  anchor: string | undefined,
  snippet: string,
  form: DiscardForm = "continue",
): string {
  return `${anchor ?? "<module-level>"}::${form}::${normalizeSilentDiscardSnippet(snippet)}`;
}

function buildSilentDiscardRegistry(
  entries: readonly SilentDiscardEntry[],
): ReadonlyMap<string, SilentDiscardEntry> {
  const registry = new Map<string, SilentDiscardEntry>();
  for (const entry of entries) {
    const key = silentDiscardKey(entry.anchor, entry.snippet, entry.form);
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
  // árvore real, computada por `enumerateDiscardOccurrences` +
  // `DISCARD_CANDIDATE_LOOP_FORMS` (abaixo) — não mais só a forma
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
  // ---------------------------------------------------------------------
  // Goal054 / WU-05 — o alfabeto ampliado (§1/§2/§3/§4) passa a exigir
  // registro também de `break` e de saída antecipada (`function-early-exit`)
  // em laço portador de candidato, não mais só `continue`. As 6 entradas
  // abaixo são as 6 ocorrências reais da árvore — 3 de cada forma —, todas
  // computadas por execução (`SILENT_DISCARD_REGISTERED_FORMS`, acima,
  // ampliado para as incluir): `:591`, `:2037` e `:2316` são `break;`;
  // `:576`, `:1144` e `:1161` são saída antecipada. Nenhuma delas larga
  // candidato que importe — cada uma abandona o resto de um laço de busca
  // depois que o candidato procurado NESTA chamada já foi achado.
  // ---------------------------------------------------------------------
  {
    anchor: "findObjectPropertyExpression",
    snippet: "if (match) return match[1].trim();",
    form: "function-early-exit",
    reason:
      "a propriedade `<propertyName>: <expressão>` já foi achada entre as propriedades de nível superior do objeto, e o valor dela é devolvido nesta mesma volta — as propriedades restantes do objeto não são candidatas a ESTE nome de propriedade, que a forma reconhecida só declara uma vez",
  },
  {
    anchor: "findNearestPrecedingDeclarationRhs",
    snippet: "if (match.index >= beforeIndex) break;",
    form: "break",
    reason:
      "a função quer a última declaração de `identifier` ANTES de `beforeIndex`; ao alcançar uma ocorrência na posição dele ou depois, `rhsStart` já guarda a mais próxima anterior — as ocorrências restantes do texto ficam depois do ponto de interesse e não são candidatas à declaração precedente que a busca procura",
  },
  {
    anchor: "readEnvSchemaDefault",
    snippet: "return { filePath: envSchemaPath, line: index + 1, value: captured };",
    form: "function-early-exit",
    reason:
      "a declaração da `key` procurada já foi encontrada e capturada nesta linha do schema — a leitura devolve o valor; as linhas restantes não são candidatas à declaração desta MESMA `key`, que a forma reconhecida só produz uma vez por arquivo",
  },
  {
    anchor: "readEnvFileValue",
    snippet: "return {",
    form: "function-early-exit",
    reason:
      "a linha cuja chave bate com `key` já foi encontrada — o valor é devolvido; as linhas restantes do arquivo `CHAVE=VALOR` não são candidatas a esta MESMA `key`, que um arquivo bem formado declara uma única vez",
  },
  {
    anchor: "discoverCallerResolvedGoBoundRequests",
    snippet: "break;",
    form: "break",
    reason:
      "o parâmetro em trânsito que carrega a base do serviço Go PARA ESTA CHAMADA já foi achado — `baseParam` e `goEnvVar` já estão atribuídos; os parâmetros restantes de `transitParams` não são candidatos a base para a mesma chamada, porque só um parâmetro carrega a base por chamada",
  },
  {
    anchor: "findEnclosingClassSpan",
    snippet: "if (match.index >= index) break;",
    form: "break",
    reason:
      "a busca quer a declaração de classe mais PRÓXIMA que ainda começa antes de `index`; ao alcançar uma declaração na posição dele ou depois, `found` já guarda a mais próxima anterior — as declarações restantes do texto começam depois do ponto de interesse e não podem ser a classe envolvente que a função procura",
  },
  // ---------------------------------------------------------------------
  // Goal055 / FIX-001 — o eixo 5 de `resolveSilentDiscardRequirement` (a
  // região abandonada) RETIRA a isenção de domínio `character-sequence` de
  // 8 ocorrências reais, computadas por execução: a região que cada uma
  // abandona contém operação de `DISCARD_PRODUCING_OPERATIONS` escrita no
  // próprio corpo — nenhuma entra por chamada a função produtora. São as 6
  // da sondagem do Goal (`:225`, `:228`, `:232`, `:236`, `:240`, `:2989`)
  // mais 2 que a sondagem não contou, porque só varreu `continue;`/`break;`:
  // `:1458` (`continue;`) e `:1479` (saída antecipada), ambas em
  // `splitTemplateLiteralParts`. As entradas abaixo são novas; nenhuma
  // anterior foi duplicada, removida ou reescrita.
  // ---------------------------------------------------------------------
  {
    anchor: "splitTopLevelItems",
    snippet: "continue;",
    multiplicity: 5,
    reason:
      "as 5 ocorrências nuas do laço de caractere sobre `content` pulam, cada uma, o resto da volta — e com ele o `items.push(content.slice(start, i).trim())` de :243, a única produção da função. Pular é correto porque o `push` só pode acontecer na vírgula de NÍVEL ZERO fora de aspas: as 5 tratam o caractere seguinte a `\\` dentro de aspas, o próprio caractere dentro de aspas, a aspa que abre, o delimitador que abre (`depth += 1`) e o que fecha (`depth -= 1`) — nenhum deles é vírgula de topo. Se uma delas pulasse uma vírgula de topo, dois itens sairiam fundidos num só, e os laços portadores de candidato de :485 (parâmetros) e :574 (propriedades de objeto) perderiam um candidato inteiro sem recusa",
  },
  {
    anchor: "splitTemplateLiteralParts",
    snippet: "continue;",
    reason:
      "o `\\` de escape já acrescentou os DOIS caracteres (`\\` e o escapado) a `staticText` e avançou `i` em 2 antes de pular; a região pulada contém os `parts.push` de :1480 e :1482, que só pertencem à abertura `${` de uma interpolação — e um caractere escapado nunca a abre. Se o pulo estivesse errado, um `\\${` escapado seria lido como interpolação (parte de expressão espúria) ou uma `${` real seria engolida como texto estático, e o parâmetro em trânsito da URL sumiria do caminho que a resolução por chamadores separa da base",
  },
  {
    anchor: "splitTemplateLiteralParts",
    snippet: "if (depth !== 0) return undefined;",
    form: "function-early-exit",
    reason:
      "`${` sem `}` correspondente até o fim do corpo: o texto não é literal de crase fechado, e o contrato da função é devolver `undefined` nesse caso — a região abandonada contém os `parts.push` de :1480/:1482 e o `push` final, que montariam partes de um literal malformado. O abandono não é mudo: o único chamador (:1984) lança erro nomeando `arquivo:linha` e a URL quando recebe `undefined`, de modo que, se a saída antecipada disparasse sobre um literal bem formado, a descoberta falharia alto em vez de perder a rota",
  },
  {
    anchor: "findTopLevelMethodBodies",
    snippet: "continue;",
    reason:
      "o índice `i` está dentro de aspas pela `quoteMask` — texto de string ou de template, não código; a região pulada contém o `methods.push` de :2994, que só pode acontecer num `{` de CÓDIGO que abre corpo de método, e um `{` dentro de aspas nunca é um. Se o pulo estivesse errado, um corpo de método real seria saltado: o método sumiria de `ClassMethodBody[]` e, com ele, da superfície de membros derivada em :3150 e da enumeração de uso do campo cliente em :3674",
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
  /**
   * Arquivo da ocorrência, para que o resíduo do veredito de exigência
   * (Goal054 §4) reprove nomeando `arquivo:linha`. Ausente só nas
   * ocorrências construídas pelo caminho do Goal050 (`findSilentDiscardLines`),
   * que não computam veredito e portanto não têm resíduo a nomear.
   */
  readonly filePath?: string;
  readonly snippet: string;
  readonly anchor: string | undefined;
  readonly key: string;
  /**
   * Ausente significa `true` — o caso de toda ocorrência construída antes
   * deste campo existir (Goal050/051). Desde o Goal053 §2, o critério é o
   * DOMÍNIO percorrido (`resolveDiscardCursorDomain`), não mais só a
   * classe do cabeçalho: sequência de caracteres e máscara paralela são
   * isentas — cada volta avança leitura, não descarta candidato —, e
   * coleção de elementos EXIGE registro mesmo quando a forma é
   * `for-indexed` (o Goal052 isentava por classe em bloco). Laço sem
   * domínio (`no-domain`) continua decidido por `DISCARD_CANDIDATE_LOOP_FORMS`,
   * porque cada volta dele já é diretamente um candidato, sem cursor a
   * resolver. Ocorrência isenta nunca conta como não registrada nem torna
   * obsoleta uma entrada de outra classe — mas segue contando para achar a
   * chave de uma entrada que porventura a nomeie, sem forçar sua presença.
   */
  readonly requiresRegistration?: boolean;
  /**
   * FORMA de descarte (Goal054 §1). Ausente significa `continue`, o mesmo
   * default da chave — as duas leituras nunca divergem porque a chave é
   * construída a partir deste campo.
   */
  readonly form?: DiscardForm;
  /**
   * O trecho que CONCEDEU a isenção (Goal054 §4), presente só quando
   * `requiresRegistration` é `false`. Isenção sem evidência não é produzida:
   * o resolvedor reprova antes, em `unresolvedRequirementReason`.
   */
  readonly exemptionEvidence?: string;
  /**
   * Motivo escrito de um dos eixos da exigência — forma, fronteira de função,
   * classe de laço ou domínio — não ter resolvido. Presente REPROVA em
   * `findSilentDiscardFindings`, nomeado por `arquivo:linha`, e a ocorrência
   * continua exigindo registro enquanto o resíduo existir (fail-closed).
   */
  readonly unresolvedRequirementReason?: string;
  /** Motivo do eixo 5 (Goal055 §4) para a isenção dos eixos 1 a 4 ter sido RETIRADA: a região abandonada produz. Presente só quando `requiresRegistration` é `true` por esse motivo. */
  readonly retiredExemptionReason?: string;
}

interface SilentDiscardFindings {
  readonly ambiguousKeys: string[];
  readonly unregistered: string[];
  readonly obsolete: string[];
  readonly emptyReason: string[];
  /** Eixo da exigência não resolvido (Goal054 §4): reprova nomeando `arquivo:linha` e o motivo. */
  readonly unresolvedRequirement: string[];
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

  // Resíduo do veredito de exigência (Goal054 §4): forma, fronteira, classe
  // ou domínio que não resolveram reprovam aqui, nomeados por `arquivo:linha`
  // e pelo motivo de não ter resolvido — nunca por exigência presumida em
  // silêncio. Roda sobre TODAS as ocorrências, isentas ou não: uma isenção
  // que não resolveu é exatamente o que não pode passar.
  const unresolvedRequirement: string[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.unresolvedRequirementReason !== undefined) {
      unresolvedRequirement.push(
        `${occurrence.filePath ?? "<arquivo não informado>"}:${occurrence.line}: ${occurrence.unresolvedRequirementReason} — "${occurrence.snippet}"`,
      );
    }
  }

  return { ambiguousKeys, unregistered, obsolete, emptyReason, unresolvedRequirement };
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
 * - um CONTEXTO LÉXICO computado (`DISCARD_LEXICAL_CONTEXTS`), porque a
 *   leitura é textual e pode encontrar `continue;` dentro de literal de
 *   string, de template ou de comentário. Essas ocorrências são reconhecidas
 *   como tais e NOMEADAS, nunca descartadas em silêncio;
 * - uma CLASSE computada pela forma do laço mais próximo que a contém
 *   (`DISCARD_LOOP_FORMS`), vocabulário fechado.
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
 * Classe fora daqui reprova em `findDiscardEnumerationFindings`.
 *
 * `while` é partido em TRÊS, não em dois, e cada uma das três classes tem
 * critério textual próprio em `classifyDiscardLoopForm` — nenhuma delas é
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
const DISCARD_LOOP_FORMS = [
  "for-of",
  "for-in",
  "for-indexed",
  "while-exec-match",
  "while-queue-drain",
  "while-positional-read",
  "do-while",
] as const;

type DiscardLoopForm = (typeof DISCARD_LOOP_FORMS)[number];

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
const DISCARD_CURSOR_DOMAINS = [
  "character-sequence",
  "parallel-mask",
  "element-collection",
  "no-domain",
] as const;

type DiscardCursorDomain = (typeof DISCARD_CURSOR_DOMAINS)[number];

/**
 * Formas de laço que avançam por CURSOR ESCALAR — as únicas que percorrem
 * um domínio indexado, e portanto as únicas em que o domínio é resolvido do
 * corpo. As demais recebem `no-domain` pela própria classe.
 */
const CURSOR_BEARING_LOOP_FORMS: ReadonlySet<DiscardLoopForm> = new Set([
  "for-indexed",
  "while-positional-read",
]);

/** Vocabulário FECHADO dos contextos léxicos em que a leitura textual pode produzir `continue;`. Contexto fora daqui reprova. */
const DISCARD_LEXICAL_CONTEXTS = [
  "code",
  "comment",
  "string-literal",
  "template-literal",
  "regex-literal",
] as const;

type DiscardLexicalContext = (typeof DISCARD_LEXICAL_CONTEXTS)[number];

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
  contexts: DiscardLexicalContext[],
  from: number,
  to: number,
  context: DiscardLexicalContext,
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
  contexts: DiscardLexicalContext[],
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
  contexts: DiscardLexicalContext[],
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
function buildDiscardLexicalContexts(source: string): DiscardLexicalContext[] {
  const contexts: DiscardLexicalContext[] = new Array<DiscardLexicalContext>(source.length).fill(
    "code",
  );
  scanCodeRegionLexicalContexts(source, contexts, 0);
  return contexts;
}

/** Substitui por espaço tudo que não é código, preservando índices e quebras de linha — sobre este texto o casamento de chaves não é enganado por chave dentro de string, comentário ou regex. */
function maskNonCodeText(source: string, contexts: readonly DiscardLexicalContext[]): string {
  const chars = [...source];
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (contexts[index] !== "code" && char !== "\n" && char !== "\r") {
      chars[index] = " ";
    }
  }
  return chars.join("");
}

type DiscardLoopKeyword = "for" | "while" | "do";

interface DiscardLoopSpan {
  readonly keyword: DiscardLoopKeyword;
  readonly header: string;
  readonly headerIndex: number;
  readonly bodyStart: number;
  /** Exclusivo. */
  readonly bodyEnd: number;
  readonly form: DiscardLoopForm | undefined;
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
function classifyDiscardLoopForm(
  keyword: DiscardLoopKeyword,
  header: string,
): { form: DiscardLoopForm | undefined; unresolvedReason: string | undefined } {
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
function findDiscardLoopSpans(masked: string): DiscardLoopSpan[] {
  const spans: DiscardLoopSpan[] = [];
  const skippedKeywordIndices = new Set<number>();
  const keywordPattern = /\b(for|while|do)\b/gu;
  let match = keywordPattern.exec(masked);
  while (match !== null) {
    const keywordIndex = match.index;
    const keyword = match[1] as DiscardLoopKeyword;
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
        const classification = classifyDiscardLoopForm(keyword, header);
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

/** O intervalo do corpo `{…}` de um `switch`, casado por delimitador sobre texto mascarado — o mesmo estilo de `findDiscardLoopSpans`, nunca por indentação. */
interface DiscardSwitchSpan {
  readonly bodyStart: number;
  /** Exclusivo. */
  readonly bodyEnd: number;
}

/**
 * Todo `switch` do texto mascarado, com o intervalo exato do corpo. Usado
 * só para decidir, no Goal054 §3, se um `break` nu termina o `switch` mais
 * próximo em vez de abandonar um laço — `switch` sem corpo em bloco não
 * existe na gramática, então um `switch` sem `{` reconhecido não produz
 * span, e o `break` que ficaria dentro dele é resolvido como se o `switch`
 * não existisse (fail-closed para o LAÇO, nunca uma isenção muda).
 */
function findDiscardSwitchSpans(masked: string): DiscardSwitchSpan[] {
  const spans: DiscardSwitchSpan[] = [];
  const keywordPattern = /\bswitch\b/gu;
  let match = keywordPattern.exec(masked);
  while (match !== null) {
    const parenIndex = skipMaskedWhitespace(masked, match.index + "switch".length);
    const closeParenIndex =
      masked[parenIndex] === "(" ? matchBalancedDelimiter(masked, parenIndex, "(", ")") : -1;
    if (closeParenIndex !== -1) {
      const bodyStart = skipMaskedWhitespace(masked, closeParenIndex + 1);
      if (masked[bodyStart] === "{") {
        const closeBrace = matchBalancedDelimiter(masked, bodyStart, "{", "}");
        spans.push({ bodyStart, bodyEnd: closeBrace === -1 ? masked.length : closeBrace + 1 });
      }
    }
    match = keywordPattern.exec(masked);
  }
  return spans;
}

/** O `switch` mais interno cujo corpo contém `index`, ou `undefined` se nenhum contém — mesmo critério de "mais interno" de `innermostLoopSpanAt`. */
function innermostSwitchSpanAt(
  spans: readonly DiscardSwitchSpan[],
  index: number,
): DiscardSwitchSpan | undefined {
  let innermost: DiscardSwitchSpan | undefined;
  for (const span of spans) {
    if (span.bodyStart <= index && index < span.bodyEnd) {
      if (innermost === undefined || span.bodyStart > innermost.bodyStart) innermost = span;
    }
  }
  return innermost;
}

/**
 * Rótulo de laço (`outer: for (…) {…}`) mapeado ao SPAN do laço que ele
 * nomeia (Goal054 §3). `label` só casa no início de instrução — depois de
 * `;`, `{`, `}` ou início de linha — para não confundir com chave de objeto
 * literal (`{ nome: for }`, sem sentido em JS mas evitado pela mesma
 * âncora) nem com o `?:` do ternário. O `(?=…)` sobre a palavra-chave do
 * laço não consome texto, então `pattern.lastIndex` cai exatamente no
 * índice em que `findDiscardLoopSpans` já registra como `headerIndex` do
 * mesmo laço — o casamento dos dois nunca é por posição contada à parte.
 */
function findDiscardLoopLabels(
  masked: string,
  spans: readonly DiscardLoopSpan[],
): Map<string, DiscardLoopSpan> {
  const labels = new Map<string, DiscardLoopSpan>();
  const pattern = /(?:^|[;{}])\s*([A-Za-z_$][\w$]*)\s*:(?!:)\s*(?=(?:for|while|do)\b)/gmu;
  let match = pattern.exec(masked);
  while (match !== null) {
    const span = spans.find((candidate) => candidate.headerIndex === pattern.lastIndex);
    if (span !== undefined) labels.set(match[1], span);
    match = pattern.exec(masked);
  }
  return labels;
}

/** O que resolver o rótulo de um `break`/`continue` rotulado prova: o laço que ele declara, ou o motivo escrito de nenhum laço o declarar. */
interface DiscardLabelResolution {
  readonly span: DiscardLoopSpan | undefined;
  readonly unresolvedReason: string | undefined;
}

const LABELED_DISCARD_TEXT_PATTERN = /\b(?:continue|break)\s+([A-Za-z_$][\w$]*)\s*;/u;

/** Resolve o rótulo do texto CASADO (`match[0]`) de uma ocorrência rotulada ao laço que `findDiscardLoopLabels` mapeou — nunca ao laço mais interno. */
function resolveDiscardLabelTarget(
  matchedText: string,
  loopLabels: ReadonlyMap<string, DiscardLoopSpan>,
): DiscardLabelResolution {
  const label = LABELED_DISCARD_TEXT_PATTERN.exec(matchedText)?.[1];
  if (label === undefined) {
    return {
      span: undefined,
      unresolvedReason: `rótulo não reconhecido no texto casado "${matchedText.trim()}"`,
    };
  }
  const span = loopLabels.get(label);
  if (span === undefined) {
    return { span: undefined, unresolvedReason: `rótulo \`${label}\` não corresponde a laço algum` };
  }
  return { span, unresolvedReason: undefined };
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

/**
 * Palavras-chave cujo `(…)` é seguido de `{` sem que o bloco aberto seja
 * corpo de função. É a GRAMÁTICA da linguagem, não uma lista de nomes de
 * função: nenhuma delas pode nomear uma função, e nenhuma função pode se
 * chamar assim. A fronteira de função do Goal054 §2 não pode depender de
 * indentação — foi exatamente a técnica em que a sondagem do Goal052 falhou
 * em cinco ocorrências —, nem de nome de função, nem de lista de nomes
 * escrita à mão.
 */
const CONTROL_FLOW_PARENTHESIZED_KEYWORDS: ReadonlySet<string> = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "with",
]);

/** Último índice até `from` (inclusive) cujo caractere não é espaço em branco, ou `-1`. Roda sobre texto já mascarado. */
function skipMaskedWhitespaceBackward(masked: string, from: number): number {
  let index = Math.min(from, masked.length - 1);
  while (index >= 0 && /\s/u.test(masked[index] as string)) index -= 1;
  return index;
}

/** Índice do delimitador que ABRE o fechado em `closeIndex`, ou `-1`. É o casamento de `matchBalancedDelimiter` percorrido para trás, sobre o mesmo texto mascarado. */
function matchBalancedDelimiterBackward(
  masked: string,
  closeIndex: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    const char = masked[index];
    if (char === close) depth += 1;
    else if (char === open) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Identificador que termina em `index` (exclusivo), ignorando espaço antes; vazio quando não há identificador ali (lista de parâmetros anônima, genérico `<T>` fechado antes). */
function wordEndingAtMaskedIndex(masked: string, index: number): string {
  const end = skipMaskedWhitespaceBackward(masked, index - 1) + 1;
  let start = end;
  while (start > 0 && /[\w$]/u.test(masked[start - 1] as string)) start -= 1;
  return masked.slice(start, end);
}

/** O que a resolução conseguiu provar sobre um `{` do texto mascarado. Não há veredito de sobra: o que ela não prova volta com motivo escrito. */
type DiscardBraceVerdict =
  | { readonly kind: "function-body" }
  | { readonly kind: "other-block" }
  | { readonly kind: "unresolved"; readonly reason: string };

/** `{` precedido de uma lista de parâmetros: abre corpo de função, salvo quando o `(…)` pertence a palavra-chave de controle. `)` sem `(` correspondente não é adivinhado — volta como não resolvido. */
function verdictFromParameterList(masked: string, closeParenIndex: number): DiscardBraceVerdict {
  const openParenIndex = matchBalancedDelimiterBackward(masked, closeParenIndex, "(", ")");
  if (openParenIndex === -1) {
    return {
      kind: "unresolved",
      reason: "o `)` que precede o `{` não tem `(` correspondente no texto mascarado",
    };
  }
  if (CONTROL_FLOW_PARENTHESIZED_KEYWORDS.has(wordEndingAtMaskedIndex(masked, openParenIndex))) {
    return { kind: "other-block" };
  }
  return { kind: "function-body" };
}

/**
 * Se o `{` em `braceIndex` abre CORPO DE FUNÇÃO, decidido por casamento de
 * delimitadores sobre o texto mascarado (Goal054 §2). As três maneiras que a
 * linguagem tem de abrir corpo de função são reconhecidas pelo que precede a
 * chave, e só por isso:
 *
 * - `=> {` — arrow com corpo em bloco;
 * - `) {` — declaração, expressão de função, método de objeto literal ou de
 *   classe, acessor;
 * - `) : <tipo> {` — qualquer um dos anteriores com anotação de retorno no
 *   meio, que a varredura atravessa para trás casando os delimitadores do
 *   próprio tipo (`()`, `[]`, `<>`, `{}`) até o `:` de nível zero.
 *
 * O que não casa nenhuma das três é `other-block`: bloco de controle, corpo
 * de classe, objeto literal, bloco nu, interpolação de template. O que a
 * varredura não consegue casar volta como `unresolved`, e o `return` que
 * dependia dele REPROVA nomeado — nunca é classificado por semelhança.
 */
function classifyMaskedOpenBrace(masked: string, braceIndex: number): DiscardBraceVerdict {
  const before = skipMaskedWhitespaceBackward(masked, braceIndex - 1);
  if (before < 0) return { kind: "other-block" };
  if (masked[before] === ">" && masked[before - 1] === "=") return { kind: "function-body" };
  if (masked[before] === ")") return verdictFromParameterList(masked, before);
  let depth = 0;
  for (let index = before; index >= 0; index -= 1) {
    const char = masked[index] as string;
    if (char === ">" && masked[index - 1] === "=") {
      // `=>` DENTRO de um tipo (`(x: T) => U`): seta de tipo, não `>` de
      // genérico — sem isto o casamento procuraria um `<` que não existe.
      index -= 1;
      continue;
    }
    if (char === ">" || char === "]" || char === ")" || char === "}") {
      depth += 1;
      continue;
    }
    if (char === "<" || char === "[" || char === "(" || char === "{") {
      if (depth === 0) return { kind: "other-block" };
      depth -= 1;
      continue;
    }
    if (depth > 0) continue;
    if (char === ":") {
      const beforeColon = skipMaskedWhitespaceBackward(masked, index - 1);
      if (beforeColon < 0 || masked[beforeColon] !== ")") return { kind: "other-block" };
      return verdictFromParameterList(masked, beforeColon);
    }
    if (/[\w$.\s|&?]/u.test(char)) continue;
    return { kind: "other-block" };
  }
  return { kind: "other-block" };
}

/** Um par `{…}` do texto mascarado; `end` é exclusivo. */
interface DiscardBraceSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * Todo par `{…}` do texto mascarado, numa passada só com pilha, mais os
 * índices de chave que ficaram SEM par. Chave sem par não é ignorada: quem
 * vier depois dela tem a fronteira dada como não resolvida, em vez de herdar
 * em silêncio a função de fora.
 */
interface DiscardBraceTopology {
  readonly spans: readonly DiscardBraceSpan[];
  readonly unbalanced: readonly number[];
}

function findMaskedBraceTopology(masked: string): DiscardBraceTopology {
  const spans: DiscardBraceSpan[] = [];
  const unbalanced: number[] = [];
  const openIndices: number[] = [];
  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === "{") openIndices.push(index);
    else if (char === "}") {
      const start = openIndices.pop();
      if (start === undefined) unbalanced.push(index);
      else spans.push({ start, end: index + 1 });
    }
  }
  return {
    spans,
    unbalanced: [...unbalanced, ...openIndices].sort((left, right) => left - right),
  };
}

/** O corpo de função mais interno que contém um índice. `body` ausente sem motivo significa nível do módulo; com motivo, a resolução não provou nada e quem depende dela reprova. */
interface DiscardEnclosingFunctionBody {
  readonly body: DiscardBraceSpan | undefined;
  readonly unresolvedReason: string | undefined;
}

/** Percorre os `{…}` que contêm `index` de DENTRO para FORA e devolve o primeiro que abre corpo de função — casamento de delimitadores, nunca contagem de recuo. */
function resolveEnclosingFunctionBody(
  masked: string,
  topology: DiscardBraceTopology,
  verdicts: Map<number, DiscardBraceVerdict>,
  index: number,
): DiscardEnclosingFunctionBody {
  const strayBefore = topology.unbalanced.find((position) => position < index);
  if (strayBefore !== undefined) {
    return {
      body: undefined,
      unresolvedReason: `há uma chave sem par no índice ${strayBefore} do texto mascarado, antes da ocorrência`,
    };
  }
  const enclosing = topology.spans
    .filter((span) => span.start < index && index < span.end)
    .sort((left, right) => right.start - left.start);
  for (const span of enclosing) {
    let verdict = verdicts.get(span.start);
    if (verdict === undefined) {
      verdict = classifyMaskedOpenBrace(masked, span.start);
      verdicts.set(span.start, verdict);
    }
    if (verdict.kind === "unresolved") return { body: undefined, unresolvedReason: verdict.reason };
    if (verdict.kind === "function-body") return { body: span, unresolvedReason: undefined };
  }
  return { body: undefined, unresolvedReason: undefined };
}

/** Fronteira de função de um `return` que aparece dentro do texto de um laço (Goal054 §2). */
type DiscardFunctionBoundaryKind = "same-function" | "nested-function";

interface DiscardFunctionBoundary {
  readonly kind: DiscardFunctionBoundaryKind | undefined;
  /** O trecho que CONCEDEU o veredito, com `arquivo:linha` — evidência verificável, não rótulo. */
  readonly evidence: string | undefined;
  readonly unresolvedReason: string | undefined;
}

/**
 * Compara a função mais próxima que contém o `return` com a função mais
 * próxima que contém o CABEÇALHO do laço:
 *
 * - iguais: o `return` encerra a função de varredura inteira, e portanto
 *   abandona todo o domínio que faltava — é SAÍDA ANTECIPADA;
 * - diferentes: o `return` volta de uma função ANINHADA no corpo do laço, e
 *   a volta seguinte do laço acontece do mesmo jeito — não abandona nada.
 *
 * Os dois lados vêm do mesmo casamento de delimitadores sobre texto
 * mascarado. O que a resolução não prova volta com motivo escrito e REPROVA
 * nomeado em `findDiscardEnumerationFindings`.
 */
function resolveDiscardFunctionBoundary(
  masked: string,
  topology: DiscardBraceTopology,
  verdicts: Map<number, DiscardBraceVerdict>,
  lineStartOffsets: readonly number[],
  filePath: string,
  occurrenceIndex: number,
  loopSpan: DiscardLoopSpan,
): DiscardFunctionBoundary {
  const unresolved = (reason: string): DiscardFunctionBoundary => ({
    kind: undefined,
    evidence: undefined,
    unresolvedReason: `a fronteira de função deste \`return\` não foi resolvida: ${reason}`,
  });
  const atOccurrence = resolveEnclosingFunctionBody(masked, topology, verdicts, occurrenceIndex);
  if (atOccurrence.unresolvedReason !== undefined) return unresolved(atOccurrence.unresolvedReason);
  if (atOccurrence.body === undefined) {
    return unresolved("nenhum corpo de função o contém no texto mascarado");
  }
  const atLoopHeader = resolveEnclosingFunctionBody(
    masked,
    topology,
    verdicts,
    loopSpan.headerIndex,
  );
  if (atLoopHeader.unresolvedReason !== undefined) return unresolved(atLoopHeader.unresolvedReason);
  const occurrenceBodyLine = lineNumberAtIndex(lineStartOffsets, atOccurrence.body.start);
  const loopHeaderLine = lineNumberAtIndex(lineStartOffsets, loopSpan.headerIndex);
  const loopHeader = `\`${loopSpan.keyword} (${loopSpan.header})\` de ${filePath}:${loopHeaderLine}`;
  if (atLoopHeader.body !== undefined && atLoopHeader.body.start === atOccurrence.body.start) {
    return {
      kind: "same-function",
      evidence: `a função cujo corpo abre em ${filePath}:${occurrenceBodyLine} contém o \`return\` E o cabeçalho ${loopHeader}`,
      unresolvedReason: undefined,
    };
  }
  const loopSide =
    atLoopHeader.body === undefined
      ? "no nível do módulo"
      : `na função cujo corpo abre em ${filePath}:${lineNumberAtIndex(lineStartOffsets, atLoopHeader.body.start)}`;
  return {
    kind: "nested-function",
    evidence: `o \`return\` está na função cujo corpo abre em ${filePath}:${occurrenceBodyLine}, aninhada no corpo do laço ${loopHeader}, cujo cabeçalho está ${loopSide}`,
    unresolvedReason: undefined,
  };
}

/**
 * Vocabulário FECHADO das FORMAS de descarte que a enumeração reconhece
 * (Goal054 §1). O Goal052 e o Goal053 enumeraram e classificaram UMA forma,
 * `continue;`; as outras maneiras de um laço largar candidato não eram
 * varridas, e por isso não tinham classe, domínio, exigência nem resíduo:
 * apareciam e sumiam sem que amarra nenhuma mordesse.
 *
 * - `continue` — descarta o elemento da volta e segue percorrendo o domínio;
 * - `break` — encerra o laço e abandona TODO o resto do domínio percorrido;
 * - `function-early-exit` — `return` cuja função mais próxima é a MESMA que
 *   contém o cabeçalho do laço: não encerra só o laço, encerra a função de
 *   varredura inteira (fronteira computada no Goal054 §2);
 * - `nested-function-return` — `return` cuja função mais próxima é uma
 *   função ANINHADA no corpo do laço (expressão de função, arrow com corpo
 *   em bloco, método de objeto literal): volta da aninhada, o laço segue
 *   percorrendo o domínio, e por isso não abandona candidato nenhum;
 * - `switch-break` (Goal054 §3) — `break` nu cujo bloco de controle mais
 *   PRÓXIMO é um `switch`, não um laço: encerra o `switch`, nunca abandona
 *   domínio percorrido de laço algum, mesmo quando o `switch` está dentro de
 *   um. A distinção vem do mesmo casamento de delimitadores sobre texto
 *   mascarado que já resolve laço e fronteira de função — nunca de lista de
 *   nomes ou de heurística de indentação.
 *
 * `break`/`continue` ROTULADO (`break outer;`, `continue outer;`) continua
 * usando as formas `break`/`continue` — o rótulo muda qual LAÇO a ocorrência
 * abandona, resolvido ao laço que o declara ou reprovado como resíduo
 * nomeado (Goal054 §3); não muda a FORMA do descarte.
 *
 * Forma fora deste vocabulário REPROVA em `findDiscardEnumerationFindings`,
 * nomeando `arquivo:linha`, como já acontece com classe de laço e com
 * domínio percorrido. Não há ramo `else` mudo e não há forma "outra".
 */
const DISCARD_FORMS = [
  "continue",
  "break",
  "function-early-exit",
  "nested-function-return",
  "switch-break",
] as const;

type DiscardForm = (typeof DISCARD_FORMS)[number];

/**
 * Formas que de fato ABANDONAM o laço — as únicas em que o descarte de
 * candidato acontece. `nested-function-return` não está aqui, e a ausência é
 * o critério COMPUTADO da isenção do Goal054 §2: o `return` de uma função
 * aninhada devolve da aninhada, e a volta seguinte do laço acontece do mesmo
 * jeito, de modo que não há candidato largado a registrar. A isenção é da
 * FRONTEIRA, nunca do laço nem do domínio: os dois continuam decididos por
 * `requiresSilentDiscardRegistration` (Goal053 §2).
 *
 * `switch-break` (Goal054 §3) também não está aqui, pela mesma razão: um
 * `break` cujo bloco mais próximo é um `switch` encerra o `switch`, não um
 * laço, e não larga candidato de laço algum, mesmo quando o `switch` está
 * dentro de um.
 */
const DISCARD_FORMS_ABANDONING_LOOP: ReadonlySet<DiscardForm> = new Set<DiscardForm>([
  "continue",
  "break",
  "function-early-exit",
]);

/** Uma forma declarada, com o padrão textual que a produz e a regra de pertencimento ao laço. */
interface DiscardFormPattern {
  readonly form: DiscardForm;
  /** Fonte do padrão, sem flags: entra na alternância ÚNICA da varredura, nunca numa segunda passada. */
  readonly source: string;
  /**
   * `true` quando a forma só é descarte DENTRO de laço. `return` fora de
   * laço devolve da função sem abandonar domínio percorrido algum — não é
   * ocorrência de descarte e não é enumerado. `continue;` e `break;` fora de
   * laço continuam sendo enumerados e REPROVAM como resíduo nomeado, porque
   * ali o laço contenedor é que faltou.
   */
  readonly requiresEnclosingLoop: boolean;
  /**
   * Forma que a MESMA ocorrência recebe quando a fronteira de função
   * (Goal054 §2) prova que o `return` volta de uma função ANINHADA no corpo
   * do laço, e não da função que contém o cabeçalho. `undefined` na entrada
   * cuja forma não depende de fronteira de função — `continue;` e `break;`
   * abandonam o laço mais interno onde quer que estejam escritos.
   */
  readonly formWhenNestedFunction?: DiscardForm;
  /**
   * Forma que a MESMA ocorrência recebe quando o bloco de controle mais
   * PRÓXIMO da ocorrência é um `switch`, não um laço (Goal054 §3).
   * `undefined` na entrada cuja forma não muda por `switch` — só `break` nu
   * pode ser interrompido por um `switch` mais próximo; `continue` não é
   * palavra reservada dentro de `switch` e sempre mira o laço mais interno.
   */
  readonly formWhenSwitch?: DiscardForm;
  /**
   * `true` quando o padrão casa a forma ROTULADA (`break outer;`,
   * `continue outer;`), nunca a nua. O rótulo abandona o laço que ele
   * DECLARA, que pode não ser o mais interno — resolvido por
   * `findDiscardLoopLabels`, nunca por `innermostLoopSpanAt`.
   */
  readonly labeled?: boolean;
}

/**
 * A tabela que a varredura percorre. Uma entrada por forma declarada em
 * `DISCARD_FORMS`, mais uma por forma ROTULADA — que produz a mesma forma
 * (`continue`/`break`), só que resolvida a um laço diferente do mais
 * interno —, e a igualdade entre os dois conjuntos é conferida por execução
 * no teste permanente — forma declarada sem padrão não passaria muda, e
 * padrão sem forma declarada reprova pelo vocabulário.
 *
 * O padrão nu de `break` casa só a forma NUA (`break;`); os dois últimos
 * casam a forma ROTULADA (`break outer;`, `continue outer;`), que o padrão
 * nu não casa — o rótulo abandona um laço que pode não ser o mais interno, e
 * tem critério próprio (`labeled`, acima).
 */
const DISCARD_FORM_PATTERNS: readonly DiscardFormPattern[] = [
  { form: "continue", source: "\\bcontinue\\s*;", requiresEnclosingLoop: false },
  {
    form: "break",
    source: "\\bbreak\\s*;",
    requiresEnclosingLoop: false,
    formWhenSwitch: "switch-break",
  },
  {
    form: "function-early-exit",
    source: "\\breturn\\b",
    requiresEnclosingLoop: true,
    formWhenNestedFunction: "nested-function-return",
  },
  {
    form: "continue",
    source: "\\bcontinue\\s+[A-Za-z_$][\\w$]*\\s*;",
    requiresEnclosingLoop: false,
    labeled: true,
  },
  {
    form: "break",
    source: "\\bbreak\\s+[A-Za-z_$][\\w$]*\\s*;",
    requiresEnclosingLoop: false,
    labeled: true,
  },
];

/**
 * Formas cuja classificação DEPENDE da fronteira de função, derivadas da
 * própria tabela de padrões — nunca uma lista escrita à parte, que poderia
 * divergir dela. Ocorrência de uma destas formas que chegue sem fronteira
 * resolvida REPROVA em `findDiscardEnumerationFindings`, nomeada.
 */
const DISCARD_FUNCTION_BOUNDARY_FORMS: ReadonlySet<DiscardForm> = new Set<DiscardForm>(
  DISCARD_FORM_PATTERNS.flatMap((entry) =>
    entry.formWhenNestedFunction === undefined
      ? []
      : [entry.form, entry.formWhenNestedFunction],
  ),
);

/** O que a resolução provou sobre a região abandonada, com a evidência do fim que a concedeu. */
interface DiscardAbandonedRegionResolution {
  /** Índice, no texto fonte, de onde a região começa: logo DEPOIS da instrução de descarte — o que ela própria executa (a expressão de um `return`, por exemplo) não é abandonado. */
  readonly abandonedRegionStart: number | undefined;
  readonly abandonedRegionEnd: number | undefined;
  readonly evidence: string | undefined;
  readonly unresolvedReason: string | undefined;
}

/**
 * Região (Goal055) que uma ocorrência de descarte abandona — o que ela deixa
 * de executar —, casada por delimitador sobre o MESMO texto mascarado que já
 * resolve laço, domínio e fronteira de função (Goal054 §§1–2), nunca por
 * indentação nem por nome de função:
 *
 * - `continue`/`break` — até o fim do CORPO do laço que `enclosing` já
 *   resolveu (o laço rotulado quando houver rótulo, nunca o mais interno,
 *   porque `enclosing` já vem resolvido assim). Que `break` também abandone
 *   as voltas SEGUINTES do mesmo laço é verdade do runtime declarada aqui em
 *   comentário, não computada: a região provada é só o que falta da volta em
 *   curso, o mesmo texto que `continue` abandona;
 * - `function-early-exit` — até o fim do CORPO DE FUNÇÃO que a fronteira do
 *   Goal054 §2 provou conter o `return` (o lado `same-function`), porque aí o
 *   `return` encerra a varredura inteira, não só o laço;
 * - qualquer forma fora de `DISCARD_FORMS_ABANDONING_LOOP` (`switch-break`,
 *   `nested-function-return`) não abandona laço nem função de varredura
 *   algum (Goal054 §4) — a ausência de região aqui é a mesma isenção
 *   COMPUTADA pela forma, nunca um resíduo mudo.
 *
 * Região não resolvida devolve motivo escrito nomeando o que faltou, para o
 * mesmo resíduo em que classe, domínio e fronteira já reprovam.
 */
function resolveDiscardAbandonedRegion(
  masked: string,
  topology: DiscardBraceTopology,
  verdicts: Map<number, DiscardBraceVerdict>,
  lineStartOffsets: readonly number[],
  filePath: string,
  form: DiscardForm,
  occurrenceIndex: number,
  occurrenceEnd: number,
  enclosing: DiscardLoopSpan | undefined,
): DiscardAbandonedRegionResolution {
  const unresolved = (reason: string): DiscardAbandonedRegionResolution => ({
    abandonedRegionStart: undefined,
    abandonedRegionEnd: undefined,
    evidence: undefined,
    unresolvedReason: `a região abandonada por este \`${form}\` não foi resolvida: ${reason}`,
  });
  if (!DISCARD_FORMS_ABANDONING_LOOP.has(form)) {
    return {
      abandonedRegionStart: undefined,
      abandonedRegionEnd: undefined,
      evidence: undefined,
      unresolvedReason: undefined,
    };
  }
  if (form === "function-early-exit") {
    const atOccurrence = resolveEnclosingFunctionBody(masked, topology, verdicts, occurrenceIndex);
    if (atOccurrence.unresolvedReason !== undefined) return unresolved(atOccurrence.unresolvedReason);
    if (atOccurrence.body === undefined) {
      return unresolved("nenhum corpo de função o contém no texto mascarado");
    }
    const endLine = lineNumberAtIndex(lineStartOffsets, atOccurrence.body.end);
    // A expressão do próprio `return` EXECUTA — só o que vem depois da
    // instrução é abandonado. O fim da instrução é casado por delimitador
    // sobre o texto mascarado e nunca passa do fim do corpo.
    return {
      abandonedRegionStart: Math.min(
        findStatementEnd(masked, occurrenceIndex),
        atOccurrence.body.end,
      ),
      abandonedRegionEnd: atOccurrence.body.end,
      evidence: `o corpo da função de varredura que este \`return\` encerra vai até ${filePath}:${endLine}`,
      unresolvedReason: undefined,
    };
  }
  // `continue`/`break`: até o fim do corpo do laço já resolvido em `enclosing`.
  if (enclosing === undefined) {
    return unresolved("nenhum laço contenedor foi resolvido para esta ocorrência");
  }
  const endLine = lineNumberAtIndex(lineStartOffsets, enclosing.bodyEnd);
  return {
    abandonedRegionStart: occurrenceEnd,
    abandonedRegionEnd: enclosing.bodyEnd,
    evidence: `o corpo do laço \`${enclosing.keyword} (${enclosing.header})\` que esta ocorrência abandona vai até ${filePath}:${endLine}`,
    unresolvedReason: undefined,
  };
}

/**
 * Vocabulário FECHADO (Goal055 §2) das operações que PRODUZEM saída do
 * módulo de varredura: a chamada acrescenta valor a uma estrutura que
 * SOBREVIVE a ela, e é por essa estrutura que o resultado da varredura chega
 * a quem a pediu — `push` de arranjo, `add` de `Set`, `set` de `Map`.
 *
 * O padrão é o de `DISCARD_FORMS`: array declarado, tipo derivado dele,
 * nenhuma união escrita à mão em paralelo. O teste permanente confere o
 * vocabulário nos DOIS sentidos — cada membro declarado tem contagem
 * computada na árvore real, e toda operação que a varredura reconhece
 * pertence ao vocabulário, senão REPROVA nomeada por `arquivo:linha` em
 * `findDiscardProductionFindings`. Não há ramo mudo e não há operação
 * "outra".
 */
const DISCARD_PRODUCING_OPERATIONS = ["push", "add", "set"] as const;

type DiscardProducingOperation = (typeof DISCARD_PRODUCING_OPERATIONS)[number];

/** Pertencimento ao vocabulário conferido em runtime — a única porta pela qual um sítio reconhecido é contado como membro. */
function isDiscardProducingOperation(operation: string): operation is DiscardProducingOperation {
  return (DISCARD_PRODUCING_OPERATIONS as readonly string[]).includes(operation);
}

/**
 * O alfabeto que a VARREDURA reconhece, deliberadamente MAIOR que o
 * vocabulário: os métodos pelos quais as coleções da linguagem aceitam
 * elemento novo — `push`/`unshift`/`splice` de arranjo, `add` de `Set`,
 * `set` de `Map`, `append` de `URLSearchParams`/`Headers`/`FormData`. É o
 * que dá ao vocabulário um lado de FORA: operação reconhecida aqui e ausente
 * de `DISCARD_PRODUCING_OPERATIONS` não passa muda como "não produção" —
 * reprova nomeada em `findDiscardProductionFindings` e, na região abandonada,
 * conta como produção (fail-closed), até o vocabulário decidir sobre ela.
 * Cada membro do vocabulário é membro deste alfabeto, conferido por execução.
 */
const DISCARD_RECOGNIZED_INSERTION_METHODS: readonly string[] = [
  ...DISCARD_PRODUCING_OPERATIONS,
  "unshift",
  "splice",
  "append",
];

/**
 * Um sítio de operação produtora no texto mascarado. `operation` é `string`,
 * e não `DiscardProducingOperation`, de propósito: sítio com operação fora
 * do vocabulário tem de ser REPRESENTÁVEL para poder reprovar nomeado, em
 * vez de impossível de construir e por isso nunca conferido — é o mesmo
 * motivo pelo qual `findDiscardEnumerationFindings` confere `occurrence.form`
 * contra `DISCARD_FORMS` em runtime.
 */
interface DiscardProducingOperationSite {
  readonly filePath: string;
  readonly operation: string;
  readonly index: number;
  readonly line: number;
  /** Receptor da operação, lido do texto mascarado; `undefined` quando o que precede o `.` não é identificador (resultado de chamada, `)` de expressão). A ausência não isenta: a operação continua produzindo. */
  readonly receiver: string | undefined;
  readonly text: string;
}

/**
 * Todo sítio de operação reconhecida do texto mascarado, numa passada só
 * sobre a alternância ÚNICA montada do alfabeto — nunca uma varredura por
 * membro. Comentário e literal não entram porque o texto já vem mascarado
 * por `maskNonCodeText`, o mesmo de laço, domínio, fronteira e região.
 */
function findDiscardProducingOperationSites(
  source: string,
  masked: string,
  lineStartOffsets: readonly number[],
  filePath: string,
): DiscardProducingOperationSite[] {
  const pattern = new RegExp(
    `\\.(${DISCARD_RECOGNIZED_INSERTION_METHODS.map(escapeForRegExp).join("|")})\\s*\\(`,
    "gu",
  );
  const lines = source.split(/\r?\n/u);
  const sites: DiscardProducingOperationSite[] = [];
  let match = pattern.exec(masked);
  while (match !== null) {
    const receiver = wordEndingAtMaskedIndex(masked, match.index);
    const line = lineNumberAtIndex(lineStartOffsets, match.index);
    sites.push({
      filePath,
      operation: match[1] as string,
      index: match.index,
      line,
      receiver: receiver === "" ? undefined : receiver,
      text: (lines[line - 1] ?? "").trim(),
    });
    match = pattern.exec(masked);
  }
  return sites;
}

/** Uma função declarada em COLUNA ZERO do módulo, com o corpo casado por delimitador sobre a topologia de chaves já existente. É a unidade do fecho do Goal055 §3. */
interface DiscardModuleFunction {
  readonly name: string;
  readonly line: number;
  readonly body: DiscardBraceSpan;
}

interface DiscardModuleFunctionScan {
  readonly functions: readonly DiscardModuleFunction[];
  /** Motivo escrito, com `arquivo:linha`, de uma declaração não ter virado função de módulo resolvida. Reprova em `findDiscardProductionFindings` e torna não resolvida a região de toda ocorrência do arquivo — fail-closed, nunca produção presumida ausente. */
  readonly unresolved: readonly string[];
}

/**
 * As funções de módulo de um arquivo: declaração `function` em COLUNA ZERO
 * (com ou sem `export`, `default`, `async`, `*`), corpo obtido da topologia
 * de chaves de `findMaskedBraceTopology` e confirmado por
 * `classifyMaskedOpenBrace` — nunca por contagem de recuo, e nunca pelo
 * primeiro `{` textual, que poderia ser o de uma anotação de retorno com
 * forma de objeto.
 *
 * Chave sem par em qualquer ponto do arquivo torna a topologia inútil para
 * casar corpo, e então NADA é resolvido: o resíduo diz isso com o índice da
 * chave órfã, do mesmo jeito que `resolveEnclosingFunctionBody` já faz. Nome
 * declarado duas vezes também vira resíduo, porque o fecho é indexado por
 * nome e não teria como escolher entre os dois corpos.
 */
function findDiscardModuleFunctions(
  masked: string,
  topology: DiscardBraceTopology,
  verdicts: Map<number, DiscardBraceVerdict>,
  lineStartOffsets: readonly number[],
  filePath: string,
): DiscardModuleFunctionScan {
  const unresolved: string[] = [];
  if (topology.unbalanced.length > 0) {
    return {
      functions: [],
      unresolved: [
        `${filePath}: há chave sem par no índice ${topology.unbalanced[0]} do texto mascarado, e nenhum corpo de função de módulo pode ser casado com segurança`,
      ],
    };
  }
  const declaration =
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/gmu;
  const declarations: { name: string; index: number; line: number }[] = [];
  let match = declaration.exec(masked);
  while (match !== null) {
    declarations.push({
      name: match[1] as string,
      index: match.index,
      line: lineNumberAtIndex(lineStartOffsets, match.index),
    });
    match = declaration.exec(masked);
  }
  const spansByStart = [...topology.spans].sort((left, right) => left.start - right.start);
  const verdictOf = (start: number): DiscardBraceVerdict => {
    let verdict = verdicts.get(start);
    if (verdict === undefined) {
      verdict = classifyMaskedOpenBrace(masked, start);
      verdicts.set(start, verdict);
    }
    return verdict;
  };
  const functions: DiscardModuleFunction[] = [];
  const byName = new Map<string, DiscardModuleFunction>();
  for (const [position, entry] of declarations.entries()) {
    const where = `${filePath}:${entry.line}`;
    const open = masked.indexOf("(", entry.index);
    const close = open === -1 ? -1 : matchBalancedDelimiter(masked, open, "(", ")");
    if (close === -1) {
      unresolved.push(
        `${where}: a lista de parâmetros de \`${entry.name}\` não fecha no texto mascarado`,
      );
      continue;
    }
    // O corpo tem de vir ANTES da próxima declaração de coluna zero: sem esse
    // limite, uma declaração cujo corpo não casasse herdaria em silêncio o
    // corpo da função seguinte.
    const limit = declarations[position + 1]?.index ?? masked.length;
    const body = spansByStart.find(
      (span) =>
        span.start > close && span.start < limit && verdictOf(span.start).kind === "function-body",
    );
    if (body === undefined) {
      unresolved.push(
        `${where}: nenhum \`{\` entre a lista de parâmetros de \`${entry.name}\` e a declaração seguinte abre corpo de função`,
      );
      continue;
    }
    const previous = byName.get(entry.name);
    if (previous !== undefined) {
      unresolved.push(
        `${where}: \`${entry.name}\` já foi declarada em ${filePath}:${previous.line}, e o fecho de produção é indexado por nome — dois corpos com o mesmo nome não têm escolha computável`,
      );
      continue;
    }
    const resolved: DiscardModuleFunction = { name: entry.name, line: entry.line, body };
    byName.set(entry.name, resolved);
    functions.push(resolved);
  }
  return { functions, unresolved };
}

/** Uma chamada de identificador nu (`nome(...)`) no texto mascarado, com a função de módulo que a contém quando há uma. */
interface DiscardModuleCallSite {
  /** Função de módulo que contém a chamada; `undefined` quando a chamada está no nível do módulo. */
  readonly caller: string | undefined;
  readonly callee: string;
  /** `true` quando `callee` é função de módulo declarada no arquivo — o ÚNICO caso que propaga produção pelo fecho do Goal055 §3. */
  readonly calleeIsModuleFunction: boolean;
  readonly index: number;
  readonly line: number;
}

/**
 * Palavras seguidas de `(` sem que isso seja chamada de função: as seis de
 * controle que `CONTROL_FLOW_PARENTHESIZED_KEYWORDS` já declara, mais as de
 * expressão. `function` e `new` entram aqui de propósito: o `(` de
 * `function f(` é a lista de parâmetros da própria declaração, e `new Foo(` é
 * construtor, que o Goal055 §3 declara FORA da produção.
 */
const DISCARD_NON_CALL_PARENTHESIZED_WORDS: ReadonlySet<string> = new Set<string>([
  ...CONTROL_FLOW_PARENTHESIZED_KEYWORDS,
  "function",
  "new",
  "return",
  "typeof",
  "void",
  "delete",
  "await",
  "yield",
  "instanceof",
  "in",
  "of",
  "case",
  "do",
  "else",
]);

/**
 * Toda chamada de identificador NU do texto mascarado, numa passada só, já
 * atribuída à função de módulo que a contém.
 *
 * LIMITE DECLARADO do Goal055 §3, implementado no ramo
 * `calleeIsModuleFunction === false` desta função e consumido no ramo de
 * mesmo nome de `buildDiscardModuleProduction` e de
 * `findDiscardRegionProduction`: chamada cujo destino não é função de módulo
 * — método de `string`, de `Array`, de `RegExp`, construtor, função
 * importada — NÃO é produção por si só. O motivo é que a única via de uma
 * chamada dessas alcançar a saída do módulo é o valor que ela devolve, e
 * atribuir valor não é produzir: quem produz é a operação do vocabulário §2
 * que grava esse valor numa estrutura que sobrevive à chamada, e essa
 * operação é vista pelo sítio dela, no corpo em que está escrita. Chamada de
 * MEMBRO (`a.b(...)`) não chega a ser candidata aqui — o `(?<![\w$.])` a
 * exclui —, e a produção dela, quando existe, é o próprio sítio do
 * vocabulário.
 */
function findDiscardModuleCallSites(
  masked: string,
  functions: readonly DiscardModuleFunction[],
  lineStartOffsets: readonly number[],
): DiscardModuleCallSite[] {
  const moduleFunctionNames = new Set(functions.map((entry) => entry.name));
  const pattern = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/gu;
  const sites: DiscardModuleCallSite[] = [];
  let match = pattern.exec(masked);
  while (match !== null) {
    const callee = match[1] as string;
    const index = match.index;
    if (
      !DISCARD_NON_CALL_PARENTHESIZED_WORDS.has(callee) &&
      !DISCARD_NON_CALL_PARENTHESIZED_WORDS.has(wordEndingAtMaskedIndex(masked, index))
    ) {
      const caller = functions.find(
        (entry) => entry.body.start < index && index < entry.body.end,
      );
      sites.push({
        caller: caller?.name,
        callee,
        calleeIsModuleFunction: moduleFunctionNames.has(callee),
        index,
        line: lineNumberAtIndex(lineStartOffsets, index),
      });
    }
    match = pattern.exec(masked);
  }
  return sites;
}

/** O que a produção do módulo provou, computada UMA vez por arquivo e reaproveitada por toda ocorrência (Goal055 §§2–3). */
interface DiscardModuleProduction {
  readonly filePath: string;
  readonly operationSites: readonly DiscardProducingOperationSite[];
  readonly moduleFunctions: readonly DiscardModuleFunction[];
  readonly callSites: readonly DiscardModuleCallSite[];
  /** Funções de módulo com operação produtora ESCRITA no próprio corpo. */
  readonly directProducers: ReadonlySet<string>;
  /** Fecho transitivo: produtora direta, ou que chama função de módulo produtora. */
  readonly producers: ReadonlySet<string>;
  /** Arestas do fecho: função de módulo chamada por função de módulo. Só estas propagam produção. */
  readonly calleesByCaller: ReadonlyMap<string, readonly string[]>;
  /** Chamadas cujo destino NÃO é função de módulo, contadas por nome — declaradamente fora da produção (§3), registradas para que o limite seja verificável na execução e não apenas afirmado em comentário. */
  readonly nonModuleCallCounts: ReadonlyMap<string, number>;
  /** Voltas em que o fecho AINDA mudou o conjunto; a volta final, que não muda nada, não conta. */
  readonly closureRounds: number;
  /** `true` quando aplicar mais uma volta sobre o fecho não muda o conjunto — terminação conferida por execução, nunca afirmada em prosa. */
  readonly closureStable: boolean;
  readonly unresolved: readonly string[];
}

/**
 * UMA volta do fecho: o conjunto de entrada mais toda função de módulo que
 * chama alguém dele. É a mesma função que computa o fecho e que o teste
 * permanente reaplica sobre o resultado para asserir estabilidade — nunca
 * duas implementações da mesma propagação.
 */
function expandDiscardProducersOnce(
  calleesByCaller: ReadonlyMap<string, readonly string[]>,
  producers: ReadonlySet<string>,
): Set<string> {
  const next = new Set<string>(producers);
  for (const [caller, callees] of calleesByCaller) {
    if (next.has(caller)) continue;
    if (callees.some((callee) => producers.has(callee))) next.add(caller);
  }
  return next;
}

/**
 * A produção do módulo (Goal055 §§2–3), computada UMA vez sobre o MESMO
 * texto mascarado que já resolve laço, domínio, fronteira de função e região
 * abandonada — nunca numa segunda varredura da fonte, e nunca ocorrência a
 * ocorrência. `enumerateDiscardAnalysis` é o único chamador.
 *
 * Uma função de módulo é produtora quando o corpo dela contém sítio de
 * operação reconhecida (§2), ou quando chama função de módulo produtora. O
 * fecho é ponto fixo sobre as arestas de chamada: cada volta só ACRESCENTA
 * nome a um conjunto limitado pelas funções de módulo do arquivo, e por isso
 * termina em no máximo tantas voltas quantas funções existirem. A terminação
 * não fica na prosa — `closureRounds` e `closureStable` saem da execução, e o
 * teste permanente reaplica `expandDiscardProducersOnce` sobre o resultado
 * para conferir que mais uma volta não muda nada.
 */
function buildDiscardModuleProduction(
  source: string,
  masked: string,
  topology: DiscardBraceTopology,
  verdicts: Map<number, DiscardBraceVerdict>,
  lineStartOffsets: readonly number[],
  filePath: string,
): DiscardModuleProduction {
  const operationSites = findDiscardProducingOperationSites(
    source,
    masked,
    lineStartOffsets,
    filePath,
  );
  const scan = findDiscardModuleFunctions(masked, topology, verdicts, lineStartOffsets, filePath);
  const callSites = findDiscardModuleCallSites(masked, scan.functions, lineStartOffsets);

  const directProducers = new Set<string>();
  for (const entry of scan.functions) {
    const produces = operationSites.some(
      (site) => entry.body.start < site.index && site.index < entry.body.end,
    );
    if (produces) directProducers.add(entry.name);
  }

  const calleesByCaller = new Map<string, string[]>();
  const nonModuleCallCounts = new Map<string, number>();
  for (const site of callSites) {
    if (!site.calleeIsModuleFunction) {
      // Ramo nomeado do limite declarado do Goal055 §3: destino que não é
      // função de módulo não propaga produção. Fica CONTADO, para que o
      // limite seja conferível por execução em vez de só afirmado.
      nonModuleCallCounts.set(site.callee, (nonModuleCallCounts.get(site.callee) ?? 0) + 1);
      continue;
    }
    if (site.caller === undefined) continue;
    const callees = calleesByCaller.get(site.caller) ?? [];
    if (!callees.includes(site.callee)) callees.push(site.callee);
    calleesByCaller.set(site.caller, callees);
  }

  let producers: Set<string> = new Set(directProducers);
  let closureRounds = 0;
  for (;;) {
    const next = expandDiscardProducersOnce(calleesByCaller, producers);
    if (next.size === producers.size) break;
    producers = next;
    closureRounds += 1;
  }
  const closureStable =
    expandDiscardProducersOnce(calleesByCaller, producers).size === producers.size;

  return {
    filePath,
    operationSites,
    moduleFunctions: scan.functions,
    callSites,
    directProducers,
    producers,
    calleesByCaller,
    nonModuleCallCounts,
    closureRounds,
    closureStable,
    unresolved: scan.unresolved,
  };
}

/**
 * O caminho do fecho que torna `name` produtora: `name`, a função de módulo
 * que ela chama, e assim por diante até uma produtora DIRETA — busca em
 * largura sobre as mesmas arestas do fecho, nunca uma segunda propagação.
 * `undefined` quando `name` não está no fecho.
 */
function discardProducerPath(
  production: DiscardModuleProduction,
  name: string,
): readonly string[] | undefined {
  if (!production.producers.has(name)) return undefined;
  const previous = new Map<string, string | undefined>([[name, undefined]]);
  const queue: string[] = [name];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (production.directProducers.has(current)) {
      const path: string[] = [];
      let step: string | undefined = current;
      while (step !== undefined) {
        path.unshift(step);
        step = previous.get(step);
      }
      return path;
    }
    for (const callee of production.calleesByCaller.get(current) ?? []) {
      if (previous.has(callee) || !production.producers.has(callee)) continue;
      previous.set(callee, current);
      queue.push(callee);
    }
  }
  return undefined;
}

/** Uma produção achada DENTRO da região que uma ocorrência abandona, com `arquivo:linha`. */
interface DiscardRegionProduction {
  readonly kind: "operation" | "producer-call";
  readonly line: number;
  /** Operação do vocabulário (`push`, `add`, `set`) ou nome da função de módulo produtora chamada. */
  readonly name: string;
  /** Para `producer-call`: o caminho do fecho até a produtora direta. */
  readonly path: readonly string[] | undefined;
  readonly text: string;
}

/**
 * O que a região `[start, end)` de uma ocorrência contém de produção: sítio
 * de operação reconhecida (§2) ou chamada a função de módulo produtora pelo
 * fecho (§3). Lê a produção JÁ computada do módulo — nunca varre a fonte de
 * novo. Chamada a destino que não é função de módulo não entra (limite
 * declarado do §3, ramo `calleeIsModuleFunction === false`).
 */
function findDiscardRegionProduction(
  source: string,
  production: DiscardModuleProduction,
  start: number,
  end: number,
): DiscardRegionProduction[] {
  const lines = source.split(/\r?\n/u);
  const found: DiscardRegionProduction[] = [];
  for (const site of production.operationSites) {
    if (site.index < start || site.index >= end) continue;
    found.push({
      kind: "operation",
      line: site.line,
      name: site.operation,
      path: undefined,
      text: site.text,
    });
  }
  for (const site of production.callSites) {
    if (site.index < start || site.index >= end) continue;
    if (!site.calleeIsModuleFunction || !production.producers.has(site.callee)) continue;
    found.push({
      kind: "producer-call",
      line: site.line,
      name: site.callee,
      path: discardProducerPath(production, site.callee),
      text: (lines[site.line - 1] ?? "").trim(),
    });
  }
  return found.sort((left, right) => left.line - right.line);
}

/** A conta única sobre a produção computada: contagens de execução e resíduo nomeado. O teste permanente a chama sobre a árvore real; os controles a chamam sobre fonte sintética e sobre sítio corrompido. */
interface DiscardProductionFindings {
  readonly moduleFunctionCount: number;
  readonly operationSiteCount: number;
  readonly byOperation: Readonly<Record<string, number>>;
  readonly directProducerCount: number;
  readonly producerCount: number;
  /** Produtoras que só o fecho alcança: nenhuma operação do vocabulário escrita no próprio corpo. */
  readonly closureOnlyProducers: string[];
  readonly nonModuleCallCount: number;
  readonly closureRounds: number;
  readonly closureStable: boolean;
  readonly unresolved: string[];
  readonly outsideVocabulary: string[];
}

function findDiscardProductionFindings(
  production: DiscardModuleProduction,
): DiscardProductionFindings {
  const byOperation: Record<string, number> = {};
  const outsideVocabulary: string[] = [];
  const unresolved: string[] = [...production.unresolved];

  for (const site of production.operationSites) {
    const where = `${site.filePath}:${site.line}`;
    // A OPERAÇÃO é conferida antes de contar: produzir por operação que o
    // vocabulário não declara é o buraco que o Goal055 §2 fecha, e ele
    // reprova nomeado, nunca por ramo mudo.
    if (!isDiscardProducingOperation(site.operation)) {
      outsideVocabulary.push(
        `${where}: operação produtora "${site.operation}" fora de DISCARD_PRODUCING_OPERATIONS — "${site.text}"`,
      );
      continue;
    }
    byOperation[site.operation] = (byOperation[site.operation] ?? 0) + 1;
  }

  // Nome no fecho que não é função de módulo resolvida seria produção de
  // origem desconhecida: reprova, em vez de entrar na conta.
  const moduleFunctionNames = new Set(production.moduleFunctions.map((entry) => entry.name));
  for (const name of production.producers) {
    if (!moduleFunctionNames.has(name)) {
      unresolved.push(
        `${production.filePath}: \`${name}\` está no fecho de produção sem ser função de módulo resolvida`,
      );
    }
  }
  if (!production.closureStable) {
    unresolved.push(
      `${production.filePath}: o fecho de produção não é estável — aplicar mais uma volta ainda muda o conjunto de ${production.producers.size} produtoras`,
    );
  }

  return {
    moduleFunctionCount: production.moduleFunctions.length,
    operationSiteCount: production.operationSites.length,
    byOperation,
    directProducerCount: production.directProducers.size,
    producerCount: production.producers.size,
    closureOnlyProducers: [...production.producers]
      .filter((name) => !production.directProducers.has(name))
      .sort(),
    nonModuleCallCount: [...production.nonModuleCallCounts.values()].reduce(
      (sum, count) => sum + count,
      0,
    ),
    closureRounds: production.closureRounds,
    closureStable: production.closureStable,
    unresolved,
    outsideVocabulary,
  };
}

interface DiscardOccurrence {
  readonly filePath: string;
  /** A FORMA do descarte (Goal054 §1), computada pelo padrão que casou — nunca presumida do contexto. */
  readonly form: DiscardForm;
  readonly line: number;
  readonly context: DiscardLexicalContext;
  readonly loopForm: DiscardLoopForm | undefined;
  readonly loopKeyword: DiscardLoopKeyword | undefined;
  readonly loopHeader: string | undefined;
  /** Guarda normalizada que precede o `continue` na mesma linha, quando há uma — discriminador estrutural disponível para quem chavear ocorrência, sem usar número de linha. */
  readonly guard: string | undefined;
  /** Domínio que o cursor do laço contenedor percorre (Goal053 §1), ou `undefined` quando a resolução não o provou. */
  readonly cursorDomain: DiscardCursorDomain | undefined;
  /** O trecho da árvore que CONCEDEU o domínio, com `arquivo:linha` da ligação — evidência verificável, não rótulo. */
  readonly cursorDomainEvidence: string | undefined;
  /** Motivo escrito de o domínio não ter sido resolvido; reprova em `findDiscardEnumerationFindings`. */
  readonly unresolvedDomainReason: string | undefined;
  /** Fronteira de função (Goal054 §2): só as formas de `DISCARD_FUNCTION_BOUNDARY_FORMS` a têm, e para elas a ausência reprova. */
  readonly functionBoundary: DiscardFunctionBoundaryKind | undefined;
  /** O trecho que CONCEDEU a fronteira, com `arquivo:linha` dos dois lados comparados. */
  readonly functionBoundaryEvidence: string | undefined;
  /** Motivo escrito de a fronteira não ter sido resolvida; reprova em `findDiscardEnumerationFindings`. */
  readonly unresolvedFunctionBoundaryReason: string | undefined;
  /** Índice, no texto fonte, de onde termina a região (Goal055) que esta ocorrência abandona — corpo do laço para `continue`/`break`, corpo da função de varredura para `function-early-exit`. `undefined` sem motivo para `switch-break`/`nested-function-return` (isenção pela FORMA); `undefined` COM motivo em `unresolvedAbandonedRegionReason` quando a resolução falha. */
  readonly abandonedRegionEnd: number | undefined;
  /** Índice, no texto fonte, de onde a região abandonada começa — logo depois da instrução de descarte. Presente exatamente quando `abandonedRegionEnd` está. */
  readonly abandonedRegionStart: number | undefined;
  /** O trecho que CONCEDEU o fim da região, com `arquivo:linha` — evidência verificável, não estimativa. */
  readonly abandonedRegionEvidence: string | undefined;
  /**
   * A produção (Goal055 §§2–3) que a região abandonada contém: operação do
   * vocabulário, ou chamada a função de módulo produtora pelo fecho. Lista
   * vazia é região PROVADA livre de produção; `undefined` é região não
   * computada — sem região (isenção pela forma) ou não resolvida, e então
   * `unresolvedAbandonedRegionReason` diz por quê.
   */
  readonly abandonedRegionProduction: readonly DiscardRegionProduction[] | undefined;
  /** Motivo escrito de a região — a extensão, ou a produção do módulo que a decide — não ter sido resolvida; entra no mesmo resíduo em que domínio e fronteira já reprovam. */
  readonly unresolvedAbandonedRegionReason: string | undefined;
  /**
   * O trecho que CONCEDEU a isenção pela própria FORMA (Goal054 §4), com
   * `arquivo:linha` dos dois lados. Hoje só `switch-break` o preenche: a
   * isenção dele não vem de laço, nem de domínio, nem de fronteira de função
   * — vem do `switch` que o contém —, e sem este campo não teria onde
   * registrar evidência, que é o que separa isenção computada de isenção
   * muda. `nested-function-return` registra a sua em
   * `functionBoundaryEvidence`, porque lá é a fronteira que concede.
   */
  readonly formExemptionEvidence: string | undefined;
  readonly text: string;
  readonly unresolvedReason: string | undefined;
}

/** Laço mais interno cujo corpo contém `index`, ou `undefined` se nenhum contém. */
function innermostLoopSpanAt(
  spans: readonly DiscardLoopSpan[],
  index: number,
): DiscardLoopSpan | undefined {
  let innermost: DiscardLoopSpan | undefined;
  for (const span of spans) {
    if (span.bodyStart <= index && index < span.bodyEnd) {
      if (innermost === undefined || span.bodyStart > innermost.bodyStart) innermost = span;
    }
  }
  return innermost;
}

/** Trecho `if (…)` imediatamente antes do `continue` na mesma linha, normalizado, ou `undefined` quando o `continue` é nu. */
function guardPrecedingDiscard(lineText: string, continueColumn: number): string | undefined {
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
  span: DiscardLoopSpan,
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
interface DiscardValueBinding {
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
): DiscardValueBinding | undefined {
  const escaped = escapeForRegExp(name);
  let best: DiscardValueBinding | undefined;
  const consider = (candidate: DiscardValueBinding): void => {
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
type DiscardBaseShape =
  | { readonly kind: "domain"; readonly domain: DiscardCursorDomain; readonly evidence: string }
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
): DiscardBaseShape {
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
interface DiscardCursorDomainResolution {
  readonly domain: DiscardCursorDomain | undefined;
  readonly evidence: string | undefined;
  readonly unresolvedReason: string | undefined;
}

/** Quantas ligações encadeadas a resolução de domínio percorre antes de devolver motivo escrito. */
const DISCARD_DOMAIN_RESOLUTION_DEPTH = 4;

/** Precedência de APERTO: coleção de elementos vence, porque é a única que carrega candidato. */
const DISCARD_DOMAIN_PRECEDENCE: readonly DiscardCursorDomain[] = [
  "element-collection",
  "character-sequence",
  "parallel-mask",
];

/**
 * O domínio que o cursor do laço percorre, computado do texto do módulo.
 * Nenhum ramo devolve domínio sem evidência: o que a resolução não prova
 * volta como motivo escrito, e `findDiscardEnumerationFindings` reprova
 * nomeando `arquivo:linha`.
 */
function resolveDiscardCursorDomain(
  source: string,
  masked: string,
  lineStartOffsets: readonly number[],
  filePath: string,
  span: DiscardLoopSpan,
): DiscardCursorDomainResolution {
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

  const resolved = new Map<string, { domain: DiscardCursorDomain; evidence: string }>();
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
      DISCARD_DOMAIN_RESOLUTION_DEPTH,
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
        DISCARD_DOMAIN_RESOLUTION_DEPTH,
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
  for (const domain of DISCARD_DOMAIN_PRECEDENCE) {
    const winner = [...resolved].find(([, entry]) => entry.domain === domain);
    if (winner !== undefined) {
      return { domain, evidence: winner[1].evidence, unresolvedReason: undefined };
    }
  }
  return {
    domain: undefined,
    evidence: undefined,
    unresolvedReason: `o domínio percorrido pelo cursor \`${comparison.cursor}\` de \`${span.keyword} (${span.header})\` não caiu em nenhuma classe de DISCARD_CURSOR_DOMAINS`,
  };
}

/**
 * Acha TODA ocorrência das formas de descarte declaradas em `DISCARD_FORMS`
 * no texto e devolve a classificação computada de cada uma. A contagem total
 * é `occurrences.length` — resultado de execução, nunca número escrito à mão.
 *
 * É UMA varredura só: os padrões das formas entram numa alternância única
 * (`DISCARD_FORM_PATTERNS`), e a forma da ocorrência é o grupo que casou.
 * Classe de laço, domínio percorrido e evidência do domínio vêm do mesmo
 * caminho que o Goal052 e o Goal053 já usavam para `continue;` — nenhuma
 * forma nova tem máquina própria à parte.
 */
function enumerateDiscardOccurrences(source: string, filePath: string): DiscardOccurrence[] {
  return enumerateDiscardAnalysis(source, filePath).occurrences;
}

/** A enumeração e a produção do módulo que decidiu o conteúdo de cada região, saídas da MESMA passada (Goal055 §6). */
interface DiscardAnalysis {
  readonly occurrences: DiscardOccurrence[];
  readonly production: DiscardModuleProduction;
}

/**
 * A conta ÚNICA da enumeração (Goal052/053/054) mais a região abandonada e a
 * produção do módulo (Goal055 §§1–3), tudo sobre o MESMO texto mascarado e a
 * MESMA topologia de chaves. `enumerateDiscardOccurrences` é projeção dela;
 * o teste permanente a chama direto para ler a produção que decidiu as
 * regiões — nunca uma segunda varredura para obter contagens.
 */
function enumerateDiscardAnalysis(source: string, filePath: string): DiscardAnalysis {
  const contexts = buildDiscardLexicalContexts(source);
  const masked = maskNonCodeText(source, contexts);
  const spans = findDiscardLoopSpans(masked);
  // `switch` (Goal054 §3): resolvido do MESMO texto mascarado, numa varredura
  // à parte, mas nunca uma segunda passada sobre a fonte — só decide, para
  // `break` nu, se o bloco de controle mais próximo é um `switch` em vez de
  // um laço.
  const switchSpans = findDiscardSwitchSpans(masked);
  // Rótulo de laço (Goal054 §3): mapeado uma vez, reaproveitado por toda
  // ocorrência rotulada — nunca resolvido ocorrência a ocorrência.
  const loopLabels = findDiscardLoopLabels(masked, spans);
  // Topologia de chaves do MESMO texto mascarado, numa passada só, e um
  // veredito por chave resolvido sob demanda: é dela que sai a fronteira de
  // função do Goal054 §2, sem segunda varredura do texto.
  const braceTopology = findMaskedBraceTopology(masked);
  const braceVerdicts = new Map<number, DiscardBraceVerdict>();
  const lineStartOffsets = buildLineStartOffsets(source);
  // Produção do módulo (Goal055 §§2–3): computada UMA vez, sobre o mesmo
  // texto mascarado e a mesma topologia, e reaproveitada por toda ocorrência.
  const production = buildDiscardModuleProduction(
    source,
    masked,
    braceTopology,
    braceVerdicts,
    lineStartOffsets,
    filePath,
  );
  const lines = source.split(/\r?\n/u);
  const occurrences: DiscardOccurrence[] = [];
  // Uma resolução de domínio por LAÇO, reaproveitada por toda ocorrência que
  // ele contém: a conta continua sendo uma só varredura de `continue;`.
  const domainBySpan = new Map<DiscardLoopSpan, DiscardCursorDomainResolution>();
  const domainOf = (span: DiscardLoopSpan): DiscardCursorDomainResolution => {
    const cached = domainBySpan.get(span);
    if (cached !== undefined) return cached;
    const resolution = resolveDiscardCursorDomain(source, masked, lineStartOffsets, filePath, span);
    domainBySpan.set(span, resolution);
    return resolution;
  };
  // Alternância ÚNICA sobre o vocabulário declarado: um grupo de captura por
  // forma, na ordem de `DISCARD_FORM_PATTERNS`. Quem casou diz qual é a
  // forma; nenhum ramo de sobra decide por semelhança.
  const pattern = new RegExp(
    DISCARD_FORM_PATTERNS.map((entry) => `(${entry.source})`).join("|"),
    "gu",
  );
  let match = pattern.exec(source);
  while (match !== null) {
    const index = match.index;
    const line = lineNumberAtIndex(lineStartOffsets, index);
    const lineText = lines[line - 1] ?? "";
    const context = contexts[index] ?? "code";
    const matchedEntry = DISCARD_FORM_PATTERNS.find(
      (_entry, entryIndex) => match?.[entryIndex + 1] !== undefined,
    );
    // Forma é o que o padrão casado declara. Se a alternância produzisse um
    // casamento sem grupo — impossível por construção, e por isso mesmo não
    // silenciado —, a forma seria o próprio lexema, que reprova pelo
    // vocabulário em `findDiscardEnumerationFindings`, nomeado.
    const form = (matchedEntry?.form ?? match[0].trim()) as DiscardForm;
    // Forma ROTULADA (Goal054 §3): resolve ao laço que o rótulo DECLARA,
    // nunca ao mais interno — `innermostLoopSpanAt` é o critério errado aqui
    // por construção, porque o rótulo existe exatamente para abandonar um
    // laço que não é o mais interno.
    const labelResolution =
      matchedEntry?.labeled === true ? resolveDiscardLabelTarget(match[0], loopLabels) : undefined;
    const enclosing =
      labelResolution !== undefined ? labelResolution.span : innermostLoopSpanAt(spans, index);
    if (matchedEntry?.requiresEnclosingLoop === true && enclosing === undefined) {
      // `return` fora de laço encerra a função sem abandonar domínio
      // percorrido algum: não é descarte, e não entra na enumeração.
      match = pattern.exec(source);
      continue;
    }
    // `break` NU cujo bloco de controle mais próximo é um `switch` (Goal054
    // §3): o `switch` é mais interno que qualquer laço candidato, então o
    // `break` encerra o `switch`, nunca abandona o laço — mesmo que o
    // `switch` esteja dentro de um. Forma rotulada nunca cai aqui: o rótulo
    // já resolveu um laço explícito, e `switch` não tem rótulo de laço.
    const nearestSwitch =
      matchedEntry?.formWhenSwitch !== undefined && labelResolution === undefined
        ? innermostSwitchSpanAt(switchSpans, index)
        : undefined;
    const isSwitchBreak =
      nearestSwitch !== undefined &&
      (enclosing === undefined || nearestSwitch.bodyStart > enclosing.bodyStart);
    if (context !== "code") {
      occurrences.push({
        filePath,
        form,
        line,
        context,
        loopForm: undefined,
        loopKeyword: undefined,
        loopHeader: undefined,
        guard: undefined,
        cursorDomain: undefined,
        cursorDomainEvidence: undefined,
        unresolvedDomainReason: undefined,
        functionBoundary: undefined,
        functionBoundaryEvidence: undefined,
        unresolvedFunctionBoundaryReason: undefined,
        abandonedRegionEnd: undefined,
        abandonedRegionStart: undefined,
        abandonedRegionEvidence: undefined,
        abandonedRegionProduction: undefined,
        unresolvedAbandonedRegionReason: undefined,
        formExemptionEvidence: undefined,
        text: lineText.trim(),
        unresolvedReason: undefined,
      });
    } else if (isSwitchBreak) {
      // Isenção COMPUTADA, com a evidência do próprio veredito: não há laço,
      // não há domínio, e não há resíduo — o `switch` resolveu por inteiro
      // para onde este `break` vai.
      const switchLine = lineNumberAtIndex(lineStartOffsets, nearestSwitch.bodyStart);
      occurrences.push({
        filePath,
        form: matchedEntry?.formWhenSwitch as DiscardForm,
        line,
        context,
        loopForm: undefined,
        loopKeyword: undefined,
        loopHeader: undefined,
        guard: undefined,
        cursorDomain: undefined,
        cursorDomainEvidence: undefined,
        unresolvedDomainReason: undefined,
        functionBoundary: undefined,
        functionBoundaryEvidence: undefined,
        unresolvedFunctionBoundaryReason: undefined,
        // `switch-break` não abandona laço algum (Goal054 §4): a ausência de
        // região aqui é a MESMA isenção computada, sem motivo de resíduo.
        abandonedRegionEnd: undefined,
        abandonedRegionStart: undefined,
        abandonedRegionEvidence: undefined,
        abandonedRegionProduction: undefined,
        unresolvedAbandonedRegionReason: undefined,
        // A evidência do veredito, por ocorrência: o corpo do `switch` que a
        // contém, com `arquivo:linha` dos dois lados, e o laço contenedor —
        // quando existe — provado mais externo que ele. É o que torna a
        // isenção do Goal054 §4 verificável em vez de nominal.
        formExemptionEvidence: `${filePath}:${line}: \`break\` encerra o \`switch\` cujo corpo abre em ${filePath}:${switchLine} e cobre esta ocorrência; ${
          enclosing === undefined
            ? "não há laço contenedor"
            : `o laço contenedor abre antes dele, em ${filePath}:${lineNumberAtIndex(lineStartOffsets, enclosing.bodyStart)}`
        }`,
        text: lineText.trim(),
        unresolvedReason: undefined,
      });
    } else {
      const column = index - (lineStartOffsets[line - 1] ?? 0);
      const domain =
        enclosing === undefined
          ? { domain: undefined, evidence: undefined, unresolvedReason: undefined }
          : domainOf(enclosing);
      // Fronteira de função (Goal054 §2): resolvida só para a forma que a
      // declara na tabela de padrões, e só quando há laço contenedor — é ela
      // que decide se este `return` abandona a varredura inteira ou volta de
      // uma função aninhada. A ocorrência muda de FORMA; a contagem e o
      // caminho continuam sendo os mesmos.
      const boundary =
        matchedEntry?.formWhenNestedFunction === undefined || enclosing === undefined
          ? undefined
          : resolveDiscardFunctionBoundary(
              masked,
              braceTopology,
              braceVerdicts,
              lineStartOffsets,
              filePath,
              index,
              enclosing,
            );
      const finalForm: DiscardForm =
        boundary?.kind === "nested-function" && matchedEntry?.formWhenNestedFunction !== undefined
          ? matchedEntry.formWhenNestedFunction
          : form;
      // Região abandonada (Goal055): resolvida da FORMA final — depois da
      // troca por fronteira de função, nunca antes —, porque é a forma final
      // que decide se há região (`continue`/`break`/`function-early-exit`)
      // ou isenção pela forma (`nested-function-return`).
      const abandonedRegion = resolveDiscardAbandonedRegion(
        masked,
        braceTopology,
        braceVerdicts,
        lineStartOffsets,
        filePath,
        finalForm,
        index,
        index + match[0].length,
        enclosing,
      );
      // Produção da região (Goal055 §4): lida da produção do módulo JÁ
      // computada uma vez acima, nunca varrida de novo. Região sem extensão
      // não tem conteúdo a decidir; produção do módulo com resíduo torna a
      // região não resolvida — fail-closed, nunca "sem produção" presumida.
      const regionProduction: {
        production: readonly DiscardRegionProduction[] | undefined;
        unresolvedReason: string | undefined;
      } =
        abandonedRegion.abandonedRegionStart === undefined ||
        abandonedRegion.abandonedRegionEnd === undefined
          ? { production: undefined, unresolvedReason: undefined }
          : production.unresolved.length > 0
            ? {
                production: undefined,
                unresolvedReason: `a produção do módulo que decide o conteúdo da região não foi resolvida: ${production.unresolved[0]}`,
              }
            : {
                production: findDiscardRegionProduction(
                  source,
                  production,
                  abandonedRegion.abandonedRegionStart,
                  abandonedRegion.abandonedRegionEnd,
                ),
                unresolvedReason: undefined,
              };
      occurrences.push({
        filePath,
        form: finalForm,
        line,
        context,
        loopForm: enclosing?.form,
        loopKeyword: enclosing?.keyword,
        loopHeader: enclosing?.header,
        guard: guardPrecedingDiscard(lineText, column),
        cursorDomain: domain.domain,
        cursorDomainEvidence: domain.evidence,
        unresolvedDomainReason: domain.unresolvedReason,
        functionBoundary: boundary?.kind,
        functionBoundaryEvidence: boundary?.evidence,
        unresolvedFunctionBoundaryReason: boundary?.unresolvedReason,
        abandonedRegionEnd: abandonedRegion.abandonedRegionEnd,
        abandonedRegionStart: abandonedRegion.abandonedRegionStart,
        abandonedRegionEvidence: abandonedRegion.evidence,
        abandonedRegionProduction: regionProduction.production,
        unresolvedAbandonedRegionReason:
          abandonedRegion.unresolvedReason ?? regionProduction.unresolvedReason,
        // Isenção por forma sem laço não existe neste caminho: aqui há laço
        // contenedor, e quem concede isenção é a fronteira de função, o
        // domínio ou a classe — nunca a forma sozinha.
        formExemptionEvidence: undefined,
        text: lineText.trim(),
        unresolvedReason:
          enclosing === undefined
            ? (labelResolution?.unresolvedReason ??
              `nenhum laço contenedor encontrado para este \`${match[0].replace(/\s+/gu, " ").trim()}\``)
            : enclosing.unresolvedReason,
      });
    }
    match = pattern.exec(source);
  }
  return { occurrences, production };
}

interface DiscardEnumerationFindings {
  /** Computado, nunca escrito à mão. */
  readonly total: number;
  /**
   * Contagem por FORMA de descarte (Goal054 §1); soma igual à de
   * `byLoopForm`, porque as três partições recortam o mesmo conjunto
   * resolvido — EXCETO `switch-break` (Goal054 §3), que não pertence a laço
   * nem a domínio algum por construção, e por isso entra só aqui.
   */
  readonly byForm: Readonly<Record<string, number>>;
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
function findDiscardEnumerationFindings(
  occurrences: readonly DiscardOccurrence[],
): DiscardEnumerationFindings {
  const formVocabulary = new Set<string>(DISCARD_FORMS);
  const loopVocabulary = new Set<string>(DISCARD_LOOP_FORMS);
  const contextVocabulary = new Set<string>(DISCARD_LEXICAL_CONTEXTS);
  const domainVocabulary = new Set<string>(DISCARD_CURSOR_DOMAINS);
  const byForm: Record<string, number> = {};
  const byContext: Record<string, number> = {};
  const byLoopForm: Record<string, number> = {};
  const byCursorDomain: Record<string, number> = {};
  const unresolved: string[] = [];
  const outsideVocabulary: string[] = [];
  const nonCode: string[] = [];

  for (const occurrence of occurrences) {
    const where = `${occurrence.filePath}:${occurrence.line}`;
    byContext[occurrence.context] = (byContext[occurrence.context] ?? 0) + 1;
    // A FORMA é conferida antes de tudo: enumerar uma forma que o
    // vocabulário não declara é exatamente o buraco que o Goal054 fecha, e
    // ele reprova nomeado, nunca por ramo mudo.
    if (!formVocabulary.has(occurrence.form)) {
      outsideVocabulary.push(
        `${where}: forma de descarte "${occurrence.form}" fora de DISCARD_FORMS — "${occurrence.text}"`,
      );
      continue;
    }
    if (!contextVocabulary.has(occurrence.context)) {
      outsideVocabulary.push(
        `${where}: contexto léxico "${occurrence.context}" fora de DISCARD_LEXICAL_CONTEXTS`,
      );
      continue;
    }
    if (occurrence.context !== "code") {
      nonCode.push(`${where}: ocorrência em ${occurrence.context} — "${occurrence.text}"`);
      continue;
    }
    // `switch-break` (Goal054 §3) não pertence a laço algum por construção —
    // é exatamente a isenção computada que a forma declara. Exigir
    // `loopForm` aqui reprovaria como resíduo uma ocorrência já resolvida;
    // ela entra só na conta POR FORMA, nunca na de classe de laço ou de
    // domínio, porque nenhuma das duas se aplica.
    if (occurrence.form === "switch-break") {
      byForm[occurrence.form] = (byForm[occurrence.form] ?? 0) + 1;
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
        `${where}: classe "${occurrence.loopForm}" fora de DISCARD_LOOP_FORMS — "${occurrence.text}"`,
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
        `${where}: domínio "${occurrence.cursorDomain}" fora de DISCARD_CURSOR_DOMAINS — "${occurrence.text}"`,
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
    // A FRONTEIRA DE FUNÇÃO (Goal054 §2) é conferida no mesmo resíduo: não
    // resolvida reprova com o motivo escrito, e ausente SEM motivo também
    // reprova — seria uma isenção muda, que é o defeito que esta série
    // remove desde o Goal048.
    if (occurrence.unresolvedFunctionBoundaryReason !== undefined) {
      unresolved.push(
        `${where}: ${occurrence.unresolvedFunctionBoundaryReason} — "${occurrence.text}"`,
      );
      continue;
    }
    if (
      DISCARD_FUNCTION_BOUNDARY_FORMS.has(occurrence.form) &&
      occurrence.functionBoundary === undefined
    ) {
      unresolved.push(
        `${where}: a forma "${occurrence.form}" exige fronteira de função e a ocorrência não a traz — "${occurrence.text}"`,
      );
      continue;
    }
    // A REGIÃO ABANDONADA (Goal055 §1) é conferida no mesmo resíduo: não
    // resolvida reprova com o motivo escrito, e forma que abandona laço sem
    // região computada também reprova — região ausente em silêncio seria
    // isenção muda pelo eixo novo.
    if (occurrence.unresolvedAbandonedRegionReason !== undefined) {
      unresolved.push(
        `${where}: ${occurrence.unresolvedAbandonedRegionReason} — "${occurrence.text}"`,
      );
      continue;
    }
    if (
      DISCARD_FORMS_ABANDONING_LOOP.has(occurrence.form) &&
      (occurrence.abandonedRegionEnd === undefined ||
        occurrence.abandonedRegionProduction === undefined)
    ) {
      unresolved.push(
        `${where}: a forma "${occurrence.form}" abandona laço e a ocorrência não traz região abandonada computada — "${occurrence.text}"`,
      );
      continue;
    }
    byForm[occurrence.form] = (byForm[occurrence.form] ?? 0) + 1;
    byLoopForm[occurrence.loopForm] = (byLoopForm[occurrence.loopForm] ?? 0) + 1;
    byCursorDomain[occurrence.cursorDomain] = (byCursorDomain[occurrence.cursorDomain] ?? 0) + 1;
  }

  return {
    total: occurrences.length,
    byForm,
    byContext,
    byLoopForm,
    byCursorDomain,
    unresolved,
    outsideVocabulary,
    nonCode,
  };
}

describe("Goal052 / WU-01 (§1 e §2), ampliado pelo Goal054 §1 — o descarte é enumerado por inteiro num vocabulário FECHADO de formas e classificado pela forma do laço contenedor: resíduo reprova, forma e classe fora do vocabulário reprovam, e os totais são computados em runtime", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");
  const realOccurrences = enumerateDiscardOccurrences(moduleSource, "http-egress-sites.ts");
  const realFindings = findDiscardEnumerationFindings(realOccurrences);
  // O recorte de UMA forma sai da MESMA enumeração e passa pela MESMA conta:
  // é filtro sobre o resultado, nunca uma segunda varredura. É ele que
  // sustenta, inalterado, tudo que o Goal052 e o Goal053 provaram sobre
  // `continue;`.
  const realContinueOccurrences = realOccurrences.filter(
    (occurrence) => occurrence.form === "continue",
  );
  const realContinueFindings = findDiscardEnumerationFindings(realContinueOccurrences);

  it("a contagem total de `continue;` é computada em runtime e bate, ocorrência a ocorrência, com a contagem textual independente — nenhum número escrito à mão em lugar nenhum", () => {
    const textualTotal = (moduleSource.match(/\bcontinue\s*;/gu) ?? []).length;
    expect(realContinueFindings.total).toBe(textualTotal);
    // Não vácuo: o módulo realmente tem ocorrências, senão o teste inteiro
    // passaria sobre lista vazia.
    expect(realContinueFindings.total).toBeGreaterThan(0);
    expect(realContinueOccurrences).toHaveLength(realContinueFindings.total);
    // E o total da enumeração INTEIRA é a soma das formas: o alfabeto novo
    // não diluiu a conta antiga, acrescentou-se a ela.
    expect(realFindings.total).toBeGreaterThan(realContinueFindings.total);
    expect(Object.values(realFindings.byForm).reduce((sum, count) => sum + count, 0)).toBe(
      realFindings.total,
    );
    expect(realFindings.byForm.continue).toBe(textualTotal);
  });

  it("Goal054 §1 — a enumeração percorre um vocabulário FECHADO de formas de descarte, com uma entrada de padrão por forma declarada, e cada forma presente na árvore real é aferida com contagem computada", () => {
    // Vocabulário e tabela de padrões recortam o mesmo conjunto: forma
    // declarada sem padrão não seria varrida, e padrão sem forma declarada
    // reprovaria pelo vocabulário.
    // O conjunto das formas PRODUZÍVEIS pela tabela é igual ao vocabulário: a
    // entrada de `return` produz duas, escolhidas pela fronteira de função
    // (Goal054 §2), e nenhuma forma declarada fica sem padrão que a produza.
    const producibleForms = new Set<DiscardForm>(
      DISCARD_FORM_PATTERNS.flatMap((entry) => [
        entry.form,
        ...(entry.formWhenNestedFunction === undefined ? [] : [entry.formWhenNestedFunction]),
        ...(entry.formWhenSwitch === undefined ? [] : [entry.formWhenSwitch]),
      ]),
    );
    expect([...producibleForms].sort()).toEqual([...DISCARD_FORMS].sort());
    expect(producibleForms.size).toBe(DISCARD_FORMS.length);
    expect(DISCARD_FORMS).toContain("continue");
    expect(DISCARD_FORMS).toContain("break");
    expect(DISCARD_FORMS).toContain("function-early-exit");
    expect(DISCARD_FORMS).toContain("nested-function-return");
    expect(DISCARD_FORMS).toContain("switch-break");

    // Cada forma PRESENTE na árvore real tem contagem computada maior que
    // zero — nenhuma declarada só em prosa. As que a árvore real não tem são
    // asseridas ausentes por execução e exercidas por fonte sintética no
    // Goal054 §2 e §3, abaixo: vacuidade não isenta de prova.
    const formsPresentInRealTree: DiscardForm[] = ["continue", "break", "function-early-exit"];
    for (const form of formsPresentInRealTree) {
      expect(realFindings.byForm[form], form).toBeGreaterThan(0);
    }
    expect(
      DISCARD_FORMS.filter((form) => !formsPresentInRealTree.includes(form)).sort(),
    ).toEqual(["nested-function-return", "switch-break"].sort());
    expect(realFindings.byForm["nested-function-return"]).toBeUndefined();
    expect(realFindings.byForm["switch-break"]).toBeUndefined();

    // `break;`: a contagem textual independente confirma a enumerada, e toda
    // ocorrência da árvore real está dentro de um laço.
    const textualBreaks = (moduleSource.match(/\bbreak\s*;/gu) ?? []).length;
    expect(realFindings.byForm.break).toBe(textualBreaks);
    const breakOccurrences = realOccurrences.filter((occurrence) => occurrence.form === "break");
    expect(breakOccurrences).toHaveLength(textualBreaks);
    for (const occurrence of breakOccurrences) {
      expect(occurrence.loopForm, `${occurrence.filePath}:${occurrence.line}`).toBeDefined();
    }

    // Saída antecipada: é um SUBCONJUNTO próprio dos `return` do arquivo —
    // `return` fora de laço não abandona domínio percorrido algum e não é
    // enumerado. As duas contagens vêm de execução.
    const textualReturns = (moduleSource.match(/\breturn\b/gu) ?? []).length;
    const earlyExits = realOccurrences.filter(
      (occurrence) => occurrence.form === "function-early-exit",
    );
    expect(earlyExits.length).toBeGreaterThan(0);
    expect(earlyExits.length).toBeLessThan(textualReturns);
    for (const occurrence of earlyExits) {
      expect(occurrence.loopForm, `${occurrence.filePath}:${occurrence.line}`).toBeDefined();
    }
  });

  it("Goal054 §1 — cada ocorrência enumerada, em QUALQUER forma, carrega forma, contexto léxico, classe do laço, domínio percorrido e evidência do domínio: o resíduo do alfabeto inteiro é zero", () => {
    expect(realFindings.unresolved).toEqual([]);
    expect(realFindings.outsideVocabulary).toEqual([]);
    for (const occurrence of realOccurrences.filter((item) => item.context === "code")) {
      const where = `${occurrence.filePath}:${occurrence.line} (${occurrence.form})`;
      expect(DISCARD_FORMS, where).toContain(occurrence.form);
      expect(DISCARD_LEXICAL_CONTEXTS, where).toContain(occurrence.context);
      expect(DISCARD_LOOP_FORMS, where).toContain(occurrence.loopForm);
      expect(DISCARD_CURSOR_DOMAINS, where).toContain(occurrence.cursorDomain);
      expect((occurrence.cursorDomainEvidence ?? "").trim().length, where).toBeGreaterThan(0);
    }

    // As três partições — forma, classe de laço e domínio — recortam o mesmo
    // conjunto resolvido, e as somas são iguais por execução.
    const byFormTotal = Object.values(realFindings.byForm).reduce((sum, count) => sum + count, 0);
    const byLoopFormTotal = Object.values(realFindings.byLoopForm).reduce(
      (sum, count) => sum + count,
      0,
    );
    const byDomainTotal = Object.values(realFindings.byCursorDomain).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(byFormTotal).toBe(byLoopFormTotal);
    expect(byFormTotal).toBe(byDomainTotal);
  });

  it("Goal054 §1 — forma fora do vocabulário declarado REPROVA nomeando arquivo:linha, sem ramo `else` mudo: as duas saídas sobre a MESMA ocorrência real", () => {
    const [firstReal] = realOccurrences;
    expect(firstReal).toBeDefined();
    // Antes: a ocorrência real, com a forma que a varredura computou, passa.
    expect(findDiscardEnumerationFindings([firstReal]).outsideVocabulary).toEqual([]);
    // Depois: a MESMA ocorrência com uma forma inventada reprova na MESMA
    // conta, nomeada, e não entra em contagem nenhuma.
    const corrupted: DiscardOccurrence = {
      ...firstReal,
      form: "descarte-inventado" as DiscardForm,
    };
    const corruptedFindings = findDiscardEnumerationFindings([corrupted]);
    expect(corruptedFindings.outsideVocabulary).toEqual([
      `http-egress-sites.ts:${firstReal.line}: forma de descarte "descarte-inventado" fora de DISCARD_FORMS — "${firstReal.text}"`,
    ]);
    expect(corruptedFindings.byForm).toEqual({});
    expect(corruptedFindings.byLoopForm).toEqual({});
    expect(corruptedFindings.byCursorDomain).toEqual({});
  });

  it("Goal054 §1 — as formas novas entram pelo MESMO caminho: `break;` e saída antecipada em fonte sintética recebem classe de laço e domínio pela mesma enumeração, e `return` fora de laço não é descarte", () => {
    const synthetic = [
      "function scan(candidatos, source) {",
      "  for (const candidato of candidatos) {",
      "    if (!candidato) break;",
      "    if (candidato.pronto) return candidato;",
      "  }",
      "  return undefined;",
      "}",
      "",
    ].join("\n");
    const syntheticOccurrences = enumerateDiscardOccurrences(synthetic, "sintetico.ts");
    const syntheticFindings = findDiscardEnumerationFindings(syntheticOccurrences);
    expect(syntheticFindings.unresolved).toEqual([]);
    expect(syntheticFindings.outsideVocabulary).toEqual([]);
    // `return undefined;` da linha 6 está FORA de laço: não abandona domínio
    // percorrido algum e não é enumerado.
    expect(syntheticOccurrences.map((occurrence) => [occurrence.line, occurrence.form])).toEqual([
      [3, "break"],
      [4, "function-early-exit"],
    ]);
    expect(syntheticFindings.byForm).toEqual({ break: 1, "function-early-exit": 1 });
    expect(syntheticFindings.byLoopForm).toEqual({ "for-of": 2 });
    expect(syntheticFindings.byCursorDomain).toEqual({ "no-domain": 2 });
    for (const occurrence of syntheticOccurrences) {
      expect(occurrence.loopHeader).toBe("const candidato of candidatos");
      expect(occurrence.guard).toBeDefined();
      expect((occurrence.cursorDomainEvidence ?? "").trim().length).toBeGreaterThan(0);
    }

    // E `break;` sem laço contenedor algum reprova nomeado, como `continue;`
    // já reprovava — o fail-closed vale para o alfabeto inteiro.
    const withoutLoop = ["function scan() {", "  break;", "}", ""].join("\n");
    expect(
      findDiscardEnumerationFindings(enumerateDiscardOccurrences(withoutLoop, "sintetico.ts"))
        .unresolved,
    ).toEqual(['sintetico.ts:2: nenhum laço contenedor encontrado para este `break;` — "break;"']);
  });

  it("Goal054 §3 — `switch` e forma rotulada são AUSENTES na árvore real, e a ausência é aferida por EXECUÇÃO sobre o texto mascarado, nunca presumida em prosa", () => {
    const realContexts = buildDiscardLexicalContexts(moduleSource);
    const realMasked = maskNonCodeText(moduleSource, realContexts);
    // A única ocorrência textual de `switch` no módulo é dentro de um
    // literal de string (`CONTROL_FLOW_PARENTHESIZED_KEYWORDS`), e por isso
    // já sai mascarada — nenhum `switch` de código sobra no texto mascarado.
    expect(findDiscardSwitchSpans(realMasked)).toEqual([]);
    // Rótulo de laço: nenhum `identificador:` seguido de `for`/`while`/`do`
    // no texto mascarado — computado, não copiado da sondagem do Goal.
    expect(findDiscardLoopLabels(realMasked, findDiscardLoopSpans(realMasked)).size).toBe(0);
    // E, por consequência, a enumeração real não produz `switch-break` nem
    // ocorrência rotulada — nenhuma ocorrência de `break`/`continue` seguida
    // de identificador antes do `;`.
    expect(realOccurrences.filter((occurrence) => occurrence.form === "switch-break")).toEqual([]);
    expect(realFindings.byForm["switch-break"]).toBeUndefined();
    expect((moduleSource.match(/\b(?:break|continue)\s+[A-Za-z_$][\w$]*\s*;/gu) ?? [])).toEqual([]);
  });

  it("Goal054 §3 — `break` cujo bloco mais interno é um `switch` é classificado por CÔMPUTO como `switch-break`, não abandona laço algum e não exige registro — o `break`/`continue` do MESMO laço, fora do `switch`, continua abandonando normalmente", () => {
    const synthetic = [
      "function scan(candidatos) {",
      "  for (const candidato of candidatos) {",
      "    switch (candidato.tipo) {",
      '      case "a":',
      "        break;",
      "      default:",
      "        continue;",
      "    }",
      "    if (candidato.pronto) break;",
      "  }",
      "}",
      "",
    ].join("\n");
    const syntheticOccurrences = enumerateDiscardOccurrences(synthetic, "sintetico.ts");
    const syntheticFindings = findDiscardEnumerationFindings(syntheticOccurrences);
    expect(syntheticOccurrences.map((occurrence) => [occurrence.line, occurrence.form])).toEqual([
      [5, "switch-break"],
      [7, "continue"],
      [9, "break"],
    ]);
    expect(syntheticFindings.unresolved).toEqual([]);
    expect(syntheticFindings.outsideVocabulary).toEqual([]);
    // `switch-break` não conta na conta POR LAÇO nem na de DOMÍNIO — ela não
    // pertence a laço algum por construção —, só na conta por FORMA.
    expect(syntheticFindings.byForm).toEqual({ "switch-break": 1, continue: 1, break: 1 });
    expect(syntheticFindings.byLoopForm).toEqual({ "for-of": 2 });
    expect(syntheticFindings.byCursorDomain).toEqual({ "no-domain": 2 });

    const switchBreak = syntheticOccurrences.find((occurrence) => occurrence.form === "switch-break");
    expect(switchBreak).toBeDefined();
    expect(switchBreak?.loopForm).toBeUndefined();
    expect(switchBreak?.cursorDomain).toBeUndefined();
    expect(switchBreak?.unresolvedReason).toBeUndefined();
    expect(DISCARD_FORMS_ABANDONING_LOOP.has(switchBreak?.form as DiscardForm)).toBe(false);
    expect(requiresSilentDiscardRegistration(switchBreak as DiscardOccurrence)).toBe(false);

    // O `break;` da linha 9 está no MESMO laço, FORA do `switch`: continua
    // abandonando o laço normalmente — a isenção é do `break` de `switch`,
    // nunca de todo `break` que aparece num arquivo que também tem `switch`.
    const loopBreak = syntheticOccurrences.find(
      (occurrence) => occurrence.form === "break" && occurrence.line === 9,
    );
    expect(loopBreak).toBeDefined();
    expect(loopBreak?.loopForm).toBe("for-of");
    expect(requiresSilentDiscardRegistration(loopBreak as DiscardOccurrence)).toBe(true);
  });

  it("Goal054 §3 — `break`/`continue` ROTULADO é resolvido ao laço que o rótulo DECLARA, mesmo quando não é o mais interno, ou REPROVA como resíduo nomeado por arquivo:linha quando o rótulo não corresponde a laço algum", () => {
    const labeled = [
      "function scan(rows) {",
      "  outer: for (const row of rows) {",
      "    for (const cell of row) {",
      "      if (!cell) continue outer;",
      "      if (cell.stop) break outer;",
      "    }",
      "  }",
      "}",
      "",
    ].join("\n");
    const labeledOccurrences = enumerateDiscardOccurrences(labeled, "sintetico.ts");
    const labeledFindings = findDiscardEnumerationFindings(labeledOccurrences);
    expect(labeledFindings.unresolved).toEqual([]);
    expect(labeledOccurrences.map((occurrence) => [occurrence.line, occurrence.form])).toEqual([
      [4, "continue"],
      [5, "break"],
    ]);
    // As duas ocorrências resolvem ao laço EXTERNO, que o rótulo declara —
    // nunca ao `for` interno, que seria o mais próximo por posição.
    for (const occurrence of labeledOccurrences) {
      expect(occurrence.loopHeader, `linha ${occurrence.line}`).toBe("const row of rows");
      expect(occurrence.loopForm, `linha ${occurrence.line}`).toBe("for-of");
    }

    // Rótulo que não corresponde a laço algum reprova como resíduo nomeado,
    // pela MESMA conta que reprova `continue;`/`break;` sem laço contenedor.
    const orphanLabel = [
      "function scan(rows) {",
      "  for (const row of rows) {",
      "    if (!row.ready) continue faltante;",
      "  }",
      "}",
      "",
    ].join("\n");
    const orphanFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(orphanLabel, "sintetico.ts"),
    );
    expect(orphanFindings.unresolved).toEqual([
      'sintetico.ts:3: rótulo `faltante` não corresponde a laço algum — "if (!row.ready) continue faltante;"',
    ]);
    expect(orphanFindings.byForm).toEqual({});
  });

  it("o comentário de alcance parcial de DOCUMENTED_SILENT_DISCARDS não carrega mais número de ocorrências escrito à mão", () => {
    const ownSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const declarationIndex = ownSource.indexOf("interface SilentDiscardEntry");
    expect(declarationIndex).toBeGreaterThan(-1);
    const commentStart = ownSource.lastIndexOf("/**", declarationIndex);
    const commentBlock = ownSource.slice(commentStart, declarationIndex);
    expect(commentBlock).toContain("Alcance DECLARADAMENTE PARCIAL");
    expect(commentBlock).not.toMatch(/\d+\s*ocorrências/u);
    expect(commentBlock).toContain("enumerateDiscardOccurrences");
  });

  it("sobre a árvore real o resíduo é zero: nenhuma ocorrência fica sem classe, nenhuma classe cai fora do vocabulário, e a soma por classe reconstrói o total", () => {
    expect(realFindings.unresolved).toEqual([]);
    expect(realFindings.outsideVocabulary).toEqual([]);
    const classified = Object.values(realFindings.byLoopForm).reduce((sum, count) => sum + count, 0);
    expect(classified + realFindings.nonCode.length).toBe(realFindings.total);
    for (const form of Object.keys(realFindings.byLoopForm)) {
      expect(DISCARD_LOOP_FORMS).toContain(form);
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
    const syntheticFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(synthetic, "sintetico.ts"),
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
    const presentInRealTree: DiscardLoopForm[] = [
      "for-of",
      "for-indexed",
      "while-exec-match",
      "while-queue-drain",
      "while-positional-read",
    ];
    for (const form of presentInRealTree) {
      expect(realFindings.byLoopForm[form]).toBeGreaterThan(0);
    }
    const absentFromRealTree: DiscardLoopForm[] = ["for-in", "do-while"];
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
    const syntheticFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(synthetic, "sintetico.ts"),
    );
    expect(syntheticFindings.unresolved).toEqual([]);
    expect(syntheticFindings.byLoopForm).toEqual({ "for-in": 1, "do-while": 1 });
    // Toda classe do vocabulário está coberta por uma das duas provas.
    expect([...presentInRealTree, ...absentFromRealTree].sort()).toEqual(
      [...DISCARD_LOOP_FORMS].sort(),
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
    const recognizedFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(recognized, "sintetico.ts"),
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
    const unrecognizedFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(unrecognizedLoop, "sintetico.ts"),
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
    const unrecognizedWhileFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(unrecognizedWhile, "sintetico.ts"),
    );
    expect(unrecognizedWhileFindings.byLoopForm).toEqual({});
    expect(unrecognizedWhileFindings.unresolved).toEqual([
      'sintetico.ts:3: cabeçalho de `while` fora das formas reconhecidas (exec-match, drenagem de fila, cursor posicional): "state.ready && state.pending" — "continue;"',
    ]);

    // E `continue;` sem laço contenedor algum também reprova, nomeado.
    const withoutLoop = ["function scan() {", "  continue;", "}", ""].join("\n");
    const withoutLoopFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(withoutLoop, "sintetico.ts"),
    );
    expect(withoutLoopFindings.unresolved).toEqual([
      'sintetico.ts:2: nenhum laço contenedor encontrado para este `continue;` — "continue;"',
    ]);
  });

  it("classe fora do vocabulário declarado REPROVA, nomeando arquivo:linha — o vocabulário é fechado de verdade, não uma lista decorativa", () => {
    const [firstReal] = realOccurrences;
    expect(firstReal).toBeDefined();
    // Antes: a ocorrência real, com a classe que a classificação computou, passa.
    expect(findDiscardEnumerationFindings([firstReal]).outsideVocabulary).toEqual([]);
    // Depois: a MESMA ocorrência com uma classe inventada reprova na mesma conta.
    const corrupted: DiscardOccurrence = {
      ...firstReal,
      loopForm: "loop-inventado" as DiscardLoopForm,
    };
    const corruptedFindings = findDiscardEnumerationFindings([corrupted]);
    expect(corruptedFindings.outsideVocabulary).toHaveLength(1);
    expect(corruptedFindings.outsideVocabulary[0]).toContain(
      `http-egress-sites.ts:${firstReal.line}: classe "loop-inventado" fora de DISCARD_LOOP_FORMS`,
    );
    expect(corruptedFindings.byLoopForm).toEqual({});
  });

  it("a partição do `while` é critério computado, não isenção em bloco: na árvore real as 6 ocorrências de `continue;` em `while` sem `.exec(` se separam em 5 de leitura posicional (`:1458`, `:1484`, `:2989`, `:2996`, `:2999`) e 1 de drenagem de fila (`:1028`), e só esta última exige registro", () => {
    const byLine = new Map(
      realContinueOccurrences.map((occurrence) => [occurrence.line, occurrence]),
    );

    const positionalLines = [1458, 1484, 2989, 2996, 2999];
    for (const line of positionalLines) {
      expect(byLine.get(line)?.loopForm).toBe("while-positional-read");
    }
    expect(byLine.get(1028)?.loopForm).toBe("while-queue-drain");
    expect(byLine.get(1028)?.loopHeader).toBe("pendingPrimitives.length > 0");

    // As duas classes juntas reconstroem exatamente o conjunto de `while`
    // sem `.exec(` da árvore — nenhuma ocorrência sobra fora delas.
    const whileWithoutExec = realContinueOccurrences.filter(
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
      expect(DISCARD_CURSOR_DOMAINS, where).toContain(occurrence.cursorDomain);
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
      expect(DISCARD_CURSOR_DOMAINS).toContain(domain);
    }

    // As duas partições — por classe de laço e por domínio — recortam o
    // MESMO conjunto: só as formas de cursor escalar percorrem domínio, e
    // todas as demais caem em `no-domain`. A igualdade é computada das duas
    // contagens, nunca escrita à mão.
    const cursorBearingTotal = Object.entries(realFindings.byLoopForm)
      .filter(([form]) => CURSOR_BEARING_LOOP_FORMS.has(form as DiscardLoopForm))
      .reduce((sum, [, count]) => sum + count, 0);
    const indexedDomainTotal = byDomainTotal - (realFindings.byCursorDomain["no-domain"] ?? 0);
    expect(indexedDomainTotal).toBe(cursorBearingTotal);
  });

  it("Goal053 §1/§5 — cada domínio do vocabulário fechado tem prova: os três presentes na árvore real são aferidos com contagem maior que zero, e `parallel-mask`, vazio na árvore, é exercido por fonte sintética — nenhum domínio declarado só em prosa", () => {
    const presentInRealTree: DiscardCursorDomain[] = [
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
    const absentFromRealTree: DiscardCursorDomain[] = ["parallel-mask"];
    for (const domain of absentFromRealTree) {
      expect(realFindings.byCursorDomain[domain], domain).toBeUndefined();
    }
    expect([...presentInRealTree, ...absentFromRealTree].sort()).toEqual(
      [...DISCARD_CURSOR_DOMAINS].sort(),
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
    const syntheticOccurrences = enumerateDiscardOccurrences(synthetic, "sintetico.ts");
    const syntheticFindings = findDiscardEnumerationFindings(syntheticOccurrences);
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
        expect(CURSOR_BEARING_LOOP_FORMS.has(occurrence.loopForm as DiscardLoopForm), where).toBe(
          false,
        );
        continue;
      }
      expect(CURSOR_BEARING_LOOP_FORMS.has(occurrence.loopForm as DiscardLoopForm), where).toBe(
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
    const byLine = new Map(
      realContinueOccurrences.map((occurrence) => [occurrence.line, occurrence]),
    );

    // `lines` vem de `source.split(…)` — a evidência é o `.split(`, não o nome.
    const collectionLines = [1141, 1143, 1157, 1159, 1160, 3872];
    for (const line of collectionLines) {
      const occurrence = byLine.get(line);
      expect(occurrence?.cursorDomain, `linha ${line}`).toBe("element-collection");
      expect(occurrence?.cursorDomainEvidence, `linha ${line}`).toContain(".split(…)");
    }
    // E o conjunto é EXATAMENTE esse entre as ocorrências de `continue;`:
    // nenhuma outra cai em coleção de elementos, e o número sai da execução,
    // não deste arquivo.
    expect(
      realContinueOccurrences
        .filter((occurrence) => occurrence.cursorDomain === "element-collection")
        .map((occurrence) => occurrence.line)
        .sort((a, b) => a - b),
    ).toEqual([...collectionLines].sort((a, b) => a - b));

    // Goal054 §1 — o alfabeto ampliado enxerga, no MESMO domínio e pelos
    // MESMOS laços, duas saídas antecipadas que a varredura de `continue;`
    // não via: `:1144` e `:1161` abandonam o resto das linhas dos laços de
    // `readEnvSchemaDefault` e de `readEnvFileValue`, vizinhas das guardas
    // que o Goal053 obrigou a registrar.
    expect(
      realOccurrences
        .filter(
          (occurrence) =>
            occurrence.form === "function-early-exit" &&
            occurrence.cursorDomain === "element-collection",
        )
        .map((occurrence) => occurrence.line)
        .sort((a, b) => a - b),
    ).toEqual([1144, 1161]);

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
    const withoutIndexingFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(withoutIndexing, "sintetico.ts"),
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
    const unprovenFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(unprovenBase, "sintetico.ts"),
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
    expect(findDiscardEnumerationFindings([firstReal]).outsideVocabulary).toEqual([]);
    const corrupted: DiscardOccurrence = {
      ...firstReal,
      cursorDomain: "dominio-inventado" as DiscardCursorDomain,
    };
    const corruptedFindings = findDiscardEnumerationFindings([corrupted]);
    expect(corruptedFindings.outsideVocabulary).toEqual([
      `http-egress-sites.ts:${firstReal.line}: domínio "dominio-inventado" fora de DISCARD_CURSOR_DOMAINS — "${firstReal.text}"`,
    ]);
    expect(corruptedFindings.byCursorDomain).toEqual({});

    // E domínio do vocabulário sem evidência registrada também reprova.
    const withoutEvidence = findDiscardEnumerationFindings([
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
      expect(DISCARD_LOOP_FORMS).toContain(occurrence?.loopForm);
      expect(occurrence?.unresolvedReason).toBeUndefined();
    }
  });
});

/* =========================================================================
 * Goal054 / WU-02 (§2) — a fronteira de função é computada, nunca presumida.
 *
 * `return` dentro do TEXTO de um laço não é, por si, saída antecipada. Só é
 * quando a função mais próxima que o contém é a MESMA que contém o cabeçalho
 * do laço: aí ele encerra a varredura inteira e abandona todo o domínio que
 * faltava. `return` de função ANINHADA no corpo do laço — expressão de
 * função, arrow com corpo em bloco, método de objeto literal — volta da
 * aninhada, e a volta seguinte do laço acontece do mesmo jeito. Contar as
 * duas juntas seria medir texto em vez de fluxo: a mesma família de defeito
 * que o Goal053 removeu ao trocar a forma do cabeçalho pelo domínio
 * percorrido.
 *
 * A resolução é por casamento de delimitadores sobre o texto MASCARADO
 * (`findMaskedBraceTopology` + `classifyMaskedOpenBrace`), no mesmo estilo de
 * `findDiscardLoopSpans`. NUNCA por indentação — foi exatamente a técnica em
 * que a sondagem do Goal052 falhou em cinco ocorrências —, nunca por nome de
 * função e nunca por lista de nomes escrita à mão. O que a resolução não
 * prova REPROVA, nomeando `arquivo:linha` e o motivo.
 * ========================================================================= */

describe("Goal054 / WU-02 (§2) — a fronteira de função separa saída antecipada de `return` de função aninhada, por casamento de delimitadores sobre texto mascarado, e o que não resolve reprova nomeado", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");
  const realOccurrences = enumerateDiscardOccurrences(moduleSource, "http-egress-sites.ts");

  // Fonte sintética com as TRÊS formas de função aninhada que o escopo §2
  // nomeia, e um `return` da própria função de varredura dentro do MESMO
  // laço: as duas saídas da mesma regra, no mesmo texto. A árvore real não
  // tem `return` de função aninhada dentro de laço, e a vacuidade não isenta
  // de prova.
  const nestedSource = [
    "function scan(candidatos) {",
    "  for (const candidato of candidatos) {",
    "    const expressao = function () {",
    "      return candidato.a;",
    "    };",
    "    const seta = () => {",
    "      return candidato.b;",
    "    };",
    "    const literal = {",
    "      metodo(valor) {",
    "        return valor;",
    "      },",
    "    };",
    "    if (expressao() && seta() && literal.metodo(candidato)) return candidato;",
    "  }",
    "  return undefined;",
    "}",
    "",
  ].join("\n");

  it("as duas saídas da MESMA regra: `return` de função aninhada é classe própria do vocabulário, e `return` da função que contém o cabeçalho do laço é saída antecipada", () => {
    const occurrences = enumerateDiscardOccurrences(nestedSource, "sintetico.ts");
    const findings = findDiscardEnumerationFindings(occurrences);
    expect(findings.unresolved).toEqual([]);
    expect(findings.outsideVocabulary).toEqual([]);
    // As três aninhadas (expressão de função, arrow com corpo em bloco,
    // método de objeto literal) e a saída antecipada da própria varredura.
    // `return undefined;` da linha 16 está FORA do laço e não é enumerado.
    expect(occurrences.map((occurrence) => [occurrence.line, occurrence.form])).toEqual([
      [4, "nested-function-return"],
      [7, "nested-function-return"],
      [11, "nested-function-return"],
      [14, "function-early-exit"],
    ]);
    expect(findings.byForm).toEqual({
      "nested-function-return": 3,
      "function-early-exit": 1,
    });
    // As duas classes saem da MESMA enumeração, com classe de laço e domínio
    // pelo mesmo caminho, e cada uma carrega a evidência que a concedeu.
    expect(findings.byLoopForm).toEqual({ "for-of": 4 });
    for (const occurrence of occurrences) {
      const where = `sintetico.ts:${occurrence.line}`;
      expect(occurrence.functionBoundary, where).toBe(
        occurrence.form === "function-early-exit" ? "same-function" : "nested-function",
      );
      expect(occurrence.unresolvedFunctionBoundaryReason, where).toBeUndefined();
      expect(occurrence.functionBoundaryEvidence, where).toContain("sintetico.ts:");
      expect(occurrence.loopHeader, where).toBe("const candidato of candidatos");
    }
  });

  it("a fronteira não vem de indentação, de nome de função nem de lista escrita à mão: a MESMA fonte reindentada e com todos os nomes trocados produz exatamente a mesma classificação", () => {
    const original = enumerateDiscardOccurrences(nestedSource, "sintetico.ts");
    // Recuo constante em toda linha: qualquer resolução por indentação
    // perderia a hierarquia inteira aqui. Nomes trocados por rótulos sem
    // significado: qualquer resolução por nome perderia junto.
    const disguised = nestedSource
      .split("\n")
      .map((lineText) => (lineText.trim() === "" ? lineText : `      ${lineText.trim()}`))
      .join("\n")
      .replace(/scan/gu, "q1")
      .replace(/expressao/gu, "q2")
      .replace(/seta/gu, "q3")
      .replace(/literal/gu, "q4")
      .replace(/metodo/gu, "q5")
      .replace(/candidato/gu, "q6");
    const disguisedOccurrences = enumerateDiscardOccurrences(disguised, "sintetico.ts");
    expect(findDiscardEnumerationFindings(disguisedOccurrences).unresolved).toEqual([]);
    expect(disguisedOccurrences.map((occurrence) => [occurrence.line, occurrence.form])).toEqual(
      original.map((occurrence) => [occurrence.line, occurrence.form]),
    );
  });

  it("`return` cuja fronteira NÃO é resolvida reprova nomeando arquivo:linha e o motivo — e a ocorrência que chega sem fronteira nenhuma reprova na MESMA conta", () => {
    // O `)` da linha 3 não tem `(` correspondente: o casamento de
    // delimitadores não prova que ali abre corpo de função, e não inventa.
    const unresolvableSource = [
      "function scan(itens) {",
      "  for (const item of itens) {",
      "    const fabrica = item) {",
      "      return item;",
      "    };",
      "  }",
      "}",
      "",
    ].join("\n");
    const findings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(unresolvableSource, "sintetico.ts"),
    );
    expect(findings.unresolved).toEqual([
      'sintetico.ts:4: a fronteira de função deste `return` não foi resolvida: o `)` que precede o `{` não tem `(` correspondente no texto mascarado — "return item;"',
    ]);
    expect(findings.byForm).toEqual({});

    // A mesma conta reprova a ocorrência REAL corrompida: saída antecipada
    // sem fronteira e sem motivo seria isenção muda.
    const [realEarlyExit] = realOccurrences.filter(
      (occurrence) => occurrence.form === "function-early-exit",
    );
    expect(realEarlyExit).toBeDefined();
    expect(findDiscardEnumerationFindings([realEarlyExit]).unresolved).toEqual([]);
    const withoutBoundary = findDiscardEnumerationFindings([
      { ...realEarlyExit, functionBoundary: undefined, functionBoundaryEvidence: undefined },
    ]);
    expect(withoutBoundary.unresolved).toEqual([
      `http-egress-sites.ts:${realEarlyExit.line}: a forma "function-early-exit" exige fronteira de função e a ocorrência não a traz — "${realEarlyExit.text}"`,
    ]);
    expect(withoutBoundary.byForm).toEqual({});
  });

  it("`return` de função aninhada NÃO exige registro, porque não abandona o laço, e a isenção é computada da fronteira — o `return` da própria varredura, no mesmo laço, continua exigindo", () => {
    const occurrences = enumerateDiscardOccurrences(nestedSource, "sintetico.ts");
    const nested = occurrences.filter(
      (occurrence) => occurrence.form === "nested-function-return",
    );
    expect(nested.length).toBeGreaterThan(0);
    for (const occurrence of nested) {
      expect(DISCARD_FORMS_ABANDONING_LOOP.has(occurrence.form)).toBe(false);
      expect(requiresSilentDiscardRegistration(occurrence)).toBe(false);
    }
    // Mesmo laço, mesma classe, mesmo domínio: o que muda é a fronteira.
    const earlyExit = occurrences.find(
      (occurrence) => occurrence.form === "function-early-exit",
    ) as DiscardOccurrence;
    expect(earlyExit).toBeDefined();
    expect(earlyExit.loopForm).toBe(nested[0]?.loopForm);
    expect(earlyExit.cursorDomain).toBe(nested[0]?.cursorDomain);
    expect(requiresSilentDiscardRegistration(earlyExit)).toBe(true);
    // A isenção não é de uma forma só — `switch-break` (Goal054 §3) também
    // não abandona laço —, e o conjunto complementar é computado do
    // vocabulário, não escrito à parte.
    expect(
      [...DISCARD_FORMS].filter((form) => !DISCARD_FORMS_ABANDONING_LOOP.has(form)).sort(),
    ).toEqual(["nested-function-return", "switch-break"].sort());
    expect([...DISCARD_FUNCTION_BOUNDARY_FORMS].sort()).toEqual([
      "function-early-exit",
      "nested-function-return",
    ]);
  });

  it("na árvore real, a saída antecipada em laço portador de candidato é identificada por EXECUÇÃO: toda ocorrência tem fronteira resolvida, e o número computado é o que vale", () => {
    const earlyExits = realOccurrences.filter(
      (occurrence) => occurrence.form === "function-early-exit",
    );
    expect(earlyExits.length).toBeGreaterThan(0);
    for (const occurrence of earlyExits) {
      const where = `${occurrence.filePath}:${occurrence.line}`;
      expect(occurrence.functionBoundary, where).toBe("same-function");
      expect(occurrence.unresolvedFunctionBoundaryReason, where).toBeUndefined();
      expect((occurrence.functionBoundaryEvidence ?? "").trim().length, where).toBeGreaterThan(0);
    }
    // A árvore real não tem `return` de função aninhada dentro de laço — e
    // isso é COMPUTADO aqui, não afirmado em prosa.
    expect(
      realOccurrences.filter((occurrence) => occurrence.form === "nested-function-return"),
    ).toEqual([]);

    // As saídas antecipadas em laço PORTADOR DE CANDIDATO pelo critério já
    // aceito do Goal053 são as que de fato largam candidato. A sondagem do
    // Goal054 §2 previu 3 (`:576`, `:1144` e `:1161`); o que vale é este
    // número, computado da mesma enumeração, com âncora pela função de nível
    // superior — nunca por número de linha escrito à mão. O critério lido
    // aqui é o dos quatro eixos do Goal054 §4: o eixo 5 do Goal055 (região
    // abandonada) passa a exigir registro também de `splitTemplateLiteralParts`
    // por PRODUÇÃO na região, não por laço portador de candidato, e é
    // conferido à parte no teste permanente do Goal055.
    const inCandidateBearingLoop = earlyExits.filter(
      (occurrence) => resolveSilentDiscardRequirementByFourAxes(occurrence).requires,
    );
    expect(
      inCandidateBearingLoop.map((occurrence) =>
        resolveEnclosingTopLevelFunctionName(moduleSource, occurrence.line),
      ),
    ).toEqual(["findObjectPropertyExpression", "readEnvSchemaDefault", "readEnvFileValue"]);
    expect(inCandidateBearingLoop).toHaveLength(3);
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
 * classe **iteração sobre candidatos** (`DISCARD_CANDIDATE_LOOP_FORMS`,
 * abaixo — subconjunto de `DISCARD_LOOP_FORMS`), computada pela mesma
 * `enumerateDiscardOccurrences`, nunca uma segunda varredura à parte.
 *
 * O Goal053 §2 aperta o critério: a isenção não é mais decidida só pela
 * classe do cabeçalho, e sim pelo DOMÍNIO que o cursor percorre
 * (`resolveDiscardCursorDomain`, Goal053 §1). Sequência de caracteres e
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
 * subconjunto de `DISCARD_LOOP_FORMS` em que cada volta do laço é um
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
const DISCARD_CANDIDATE_LOOP_FORMS: ReadonlySet<DiscardLoopForm> = new Set([
  "for-of",
  "while-exec-match",
  "while-queue-drain",
]);

/**
 * O critério de isenção de registro (Goal053 §2): o DOMÍNIO que o cursor do
 * laço contenedor percorre (`DiscardOccurrence.cursorDomain`, Goal053 §1),
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
 *   no Goal052, por `DISCARD_CANDIDATE_LOOP_FORMS` — cada volta dessas
 *   formas já é diretamente um candidato, sem cursor indexado a resolver.
 * - domínio não resolvido (Goal053 §1 reprovou a resolução com motivo
 *   escrito, mas a ocorrência ainda assim entra aqui): fail-closed — EXIGE
 *   registro, nunca isenta em silêncio por falta de prova.
 */
interface SilentDiscardRequirement {
  /**
   * `true` quando a ocorrência exige motivo registrado. Eixo não resolvido é
   * fail-closed: continua exigindo, e o resíduo reprova à parte — nunca
   * isenta por falta de prova.
   */
  readonly requires: boolean;
  /**
   * O trecho que CONCEDEU a isenção, presente exatamente quando `requires` é
   * `false`. Isenção sem evidência não é produzida por este resolvedor.
   */
  readonly exemptionEvidence?: string;
  /** Motivo escrito de o eixo não ter resolvido; presente REPROVA, nomeado por `arquivo:linha`. */
  readonly unresolvedReason?: string;
  /**
   * Presente exatamente quando os eixos 1 a 4 concluíram pela isenção e o
   * eixo 5 (Goal055 §4) a RETIROU porque a região abandonada produz: nomeia
   * `arquivo:linha` da ocorrência e da produção encontrada. É o motivo do
   * resolvedor para a ocorrência passar a exigir registro.
   */
  readonly retiredExemptionReason?: string;
}

/**
 * O veredito de exigência de UMA ocorrência, com os quatro eixos computados
 * na ordem em que um decide o outro (Goal054 §4):
 *
 * 1. **FORMA** — fora de `DISCARD_FORMS` não há veredito possível: reprova.
 *    Forma que não ABANDONA o laço (`switch-break`, `nested-function-return`)
 *    é isenta, e a isenção é COMPUTADA com a evidência da própria ocorrência
 *    — o `switch` que a contém ou a fronteira de função que a concedeu.
 *    Isenção que chega sem evidência reprova.
 * 2. **FRONTEIRA DE FUNÇÃO** — não resolvida, ou ausente na forma que depende
 *    dela, reprova; é ela que separa saída antecipada de `return` de função
 *    aninhada, e sem ela a exigência seria adivinhada.
 * 3. **CLASSE DO LAÇO** — sem laço contenedor, reprova com o motivo que a
 *    enumeração escreveu. Classe portadora de candidato
 *    (`DISCARD_CANDIDATE_LOOP_FORMS`) EXIGE registro **independentemente do
 *    domínio**, em qualquer forma: cada volta dela já é um candidato.
 * 4. **DOMÍNIO PERCORRIDO** (Goal053 §2) — `character-sequence` e
 *    `parallel-mask` isentam em qualquer forma, com a evidência do domínio;
 *    `element-collection` exige em qualquer forma; `no-domain` em classe não
 *    portadora isenta pela própria classe; não resolvido ou fora do
 *    vocabulário reprova.
 *
 * A ordem não afrouxa nada do Goal052/053: as classes portadoras de candidato
 * são exatamente as que `resolveDiscardCursorDomain` classifica como
 * `no-domain` por não indexarem cursor algum, de modo que adiantar o eixo 3
 * antes do 4 decide o mesmo caso do mesmo jeito — e passa a decidir também o
 * caso em que uma classe portadora chegasse com domínio isentador, que antes
 * escaparia pelo domínio.
 */
function resolveSilentDiscardRequirementByFourAxes(
  occurrence: DiscardOccurrence,
): SilentDiscardRequirement {
  // Eixo 1 — FORMA.
  if (!(DISCARD_FORMS as readonly string[]).includes(occurrence.form)) {
    return {
      requires: true,
      unresolvedReason: `forma de descarte "${occurrence.form}" fora de DISCARD_FORMS, e sem forma resolvida não há veredito de exigência`,
    };
  }
  if (!DISCARD_FORMS_ABANDONING_LOOP.has(occurrence.form)) {
    // `switch-break` registra a evidência em `formExemptionEvidence` (o
    // `switch` que o encerra); `nested-function-return`, em
    // `functionBoundaryEvidence` (a fronteira que prova a função aninhada).
    // Nenhuma das duas é isenção por nome nem por lista.
    const evidence =
      occurrence.form === "switch-break"
        ? occurrence.formExemptionEvidence
        : occurrence.functionBoundaryEvidence;
    if (evidence === undefined || evidence.trim() === "") {
      return {
        requires: true,
        unresolvedReason: `a forma "${occurrence.form}" não abandona o laço, mas a isenção chegou sem evidência registrada`,
      };
    }
    return { requires: false, exemptionEvidence: evidence };
  }
  // Eixo 2 — FRONTEIRA DE FUNÇÃO.
  if (occurrence.unresolvedFunctionBoundaryReason !== undefined) {
    return { requires: true, unresolvedReason: occurrence.unresolvedFunctionBoundaryReason };
  }
  if (
    DISCARD_FUNCTION_BOUNDARY_FORMS.has(occurrence.form) &&
    occurrence.functionBoundary === undefined
  ) {
    return {
      requires: true,
      unresolvedReason: `a forma "${occurrence.form}" exige fronteira de função e a ocorrência não a traz`,
    };
  }
  // Eixo 3 — CLASSE DO LAÇO.
  if (occurrence.loopForm === undefined) {
    return {
      requires: true,
      unresolvedReason:
        occurrence.unresolvedReason ?? "laço contenedor não resolvido, e sem motivo registrado",
    };
  }
  if (!(DISCARD_LOOP_FORMS as readonly string[]).includes(occurrence.loopForm)) {
    return {
      requires: true,
      unresolvedReason: `classe de laço "${occurrence.loopForm}" fora de DISCARD_LOOP_FORMS`,
    };
  }
  if (DISCARD_CANDIDATE_LOOP_FORMS.has(occurrence.loopForm)) {
    return { requires: true };
  }
  // Eixo 4 — DOMÍNIO PERCORRIDO.
  if (occurrence.cursorDomain === undefined) {
    return {
      requires: true,
      unresolvedReason:
        occurrence.unresolvedDomainReason ??
        "domínio percorrido não resolvido, e sem motivo registrado",
    };
  }
  if (!(DISCARD_CURSOR_DOMAINS as readonly string[]).includes(occurrence.cursorDomain)) {
    return {
      requires: true,
      unresolvedReason: `domínio "${occurrence.cursorDomain}" fora de DISCARD_CURSOR_DOMAINS`,
    };
  }
  if (
    occurrence.cursorDomain === "character-sequence" ||
    occurrence.cursorDomain === "parallel-mask"
  ) {
    const evidence = occurrence.cursorDomainEvidence;
    if (evidence === undefined || evidence.trim() === "") {
      return {
        requires: true,
        unresolvedReason: `o domínio "${occurrence.cursorDomain}" isentaria esta ocorrência, mas chegou sem evidência registrada`,
      };
    }
    return { requires: false, exemptionEvidence: evidence };
  }
  if (occurrence.cursorDomain === "element-collection") {
    return { requires: true };
  }
  if (occurrence.cursorDomain === "no-domain") {
    return {
      requires: false,
      exemptionEvidence: `classe de laço "${occurrence.loopForm}" fora de DISCARD_CANDIDATE_LOOP_FORMS e sem cursor indexado a percorrer, em ${occurrence.filePath}:${occurrence.line}`,
    };
  }
  // Sem ramo mudo: domínio declarado no vocabulário e sem veredito escrito
  // aqui reprova, em vez de cair num `return true` que pareceria decisão. O
  // tipo já está exaurido aqui — por isso a leitura passa por `string`, para
  // que a mensagem continue nomeando o domínio que chegou.
  const domainSemVeredito: string = occurrence.cursorDomain;
  return {
    requires: true,
    unresolvedReason: `domínio "${domainSemVeredito}" está no vocabulário, mas nenhum eixo escreveu veredito de exigência para ele`,
  };
}

/**
 * O veredito de exigência vigente (Goal055 §4): os quatro eixos do Goal054
 * §4, intocados em `resolveSilentDiscardRequirementByFourAxes`, e DEPOIS
 * deles um quinto — a REGIÃO ABANDONADA. Ele só age quando os quatro
 * concluíram pela isenção de uma forma que abandona laço (os ramos de
 * domínio `character-sequence`/`parallel-mask` e de `no-domain` em classe
 * não portadora); a isenção pela FORMA do eixo 1 (`switch-break`,
 * `nested-function-return`) não tem região e não é tocada.
 *
 * 5. **REGIÃO ABANDONADA** — o critério anterior dizia que essas ocorrências
 *    "avançam leitura, nunca descartam candidato", e nada o conferia. Agora
 *    a isenção só é concedida quando a região `[depois da instrução, fim do
 *    corpo abandonado)` não contém operação de `DISCARD_PRODUCING_OPERATIONS`
 *    nem chamada a função de módulo produtora pelo fecho:
 *    - região livre de produção: isenta, com as DUAS evidências — a que os
 *      eixos 1 a 4 já davam e a ausência de produção com a extensão da
 *      região em `arquivo:linha`;
 *    - região com produção: EXIGE registro, com `retiredExemptionReason`
 *      nomeando `arquivo:linha` da ocorrência e da produção;
 *    - região não resolvida (extensão ou produção do módulo): EXIGE
 *      registro, e o motivo vai para o resíduo — nunca isenta por falta de
 *      prova.
 *
 * O eixo só RETIRA: todo ramo dele parte de um veredito de isenção e nenhum
 * transforma exigência em isenção — o teste permanente confere, ocorrência a
 * ocorrência, que quem os quatro eixos mandavam registrar continua exigindo.
 */
function resolveSilentDiscardRequirement(
  occurrence: DiscardOccurrence,
): SilentDiscardRequirement {
  const byFourAxes = resolveSilentDiscardRequirementByFourAxes(occurrence);
  if (byFourAxes.requires || !DISCARD_FORMS_ABANDONING_LOOP.has(occurrence.form)) {
    return byFourAxes;
  }
  // Eixo 5 — REGIÃO ABANDONADA.
  const where = `${occurrence.filePath}:${occurrence.line}`;
  if (occurrence.unresolvedAbandonedRegionReason !== undefined) {
    return { requires: true, unresolvedReason: occurrence.unresolvedAbandonedRegionReason };
  }
  const production = occurrence.abandonedRegionProduction;
  if (
    occurrence.abandonedRegionEnd === undefined ||
    occurrence.abandonedRegionEvidence === undefined ||
    production === undefined
  ) {
    return {
      requires: true,
      unresolvedReason: `a forma "${occurrence.form}" abandona laço, e a isenção dos eixos 1 a 4 chegou sem região abandonada computada que a sustente`,
    };
  }
  if (production.length > 0) {
    const first = production[0] as DiscardRegionProduction;
    const found =
      first.kind === "operation"
        ? `a operação produtora \`.${first.name}(\` em ${occurrence.filePath}:${first.line} — "${first.text}"`
        : `a chamada à função de módulo produtora \`${first.name}\` em ${occurrence.filePath}:${first.line}, produtora pelo fecho ${(first.path ?? [first.name]).join(" → ")}`;
    return {
      requires: true,
      retiredExemptionReason: `${where}: a isenção dos eixos 1 a 4 (${byFourAxes.exemptionEvidence ?? "sem evidência"}) é retirada porque a região que este \`${occurrence.form}\` abandona contém ${found}${production.length > 1 ? `, e mais ${production.length - 1} produção(ões) na mesma região` : ""}`,
    };
  }
  return {
    requires: false,
    exemptionEvidence: `${byFourAxes.exemptionEvidence ?? ""}; e a região abandonada, de ${where} até o fim — ${occurrence.abandonedRegionEvidence} —, não contém operação de DISCARD_PRODUCING_OPERATIONS nem chamada a função de módulo produtora`,
  };
}

/**
 * O mesmo veredito, reduzido ao booleano que os chamadores anteriores ao
 * Goal054 §4 usam. É projeção de `resolveSilentDiscardRequirement`, nunca um
 * segundo critério: quem precisa da evidência da isenção ou do resíduo chama
 * o resolvedor direto.
 */
function requiresSilentDiscardRegistration(occurrence: DiscardOccurrence): boolean {
  return resolveSilentDiscardRequirement(occurrence).requires;
}

/**
 * FORMAS de descarte cujo registro por ocorrência é exigido por
 * `requiresSilentDiscardRegistration` como o Goal053 §2 o deixou. O
 * vocabulário da ENUMERAÇÃO é maior (`DISCARD_FORMS`, Goal054 §1): a
 * enumeração vê `break` e saída antecipada de função, e o conjunto abaixo
 * declara, computado e conferido por execução, quais dessas formas o
 * registro de motivo já cobre. Forma declarada aqui e ausente de
 * `DISCARD_FORMS` reprovaria pela própria conta.
 */
const SILENT_DISCARD_REGISTERED_FORMS: ReadonlySet<DiscardForm> = new Set<DiscardForm>([
  "continue",
  "break",
  "function-early-exit",
]);

/**
 * Toda ocorrência de forma de descarte registrada
 * (`SILENT_DISCARD_REGISTERED_FORMS`) em contexto de código de `source`,
 * convertida para o vocabulário do registro de descarte: âncora pela função
 * de nível superior, chave estável (`silentDiscardKey`, sem número de
 * linha), e `requiresRegistration` computado por
 * `requiresSilentDiscardRegistration` (acima) — o DOMÍNIO percorrido, não
 * mais só a classe do laço contenedor (Goal053 §2). Reusa
 * `enumerateDiscardOccurrences` (Goal052/WU-01, ampliada pelo Goal054 §1);
 * não reimplementa varredura alguma à parte. É a fonte que o teste
 * permanente abaixo e os controles negativos do §8 chamam.
 */
function enumerateSilentDiscardOccurrences(
  source: string,
  filePath: string,
): SilentDiscardOccurrence[] {
  return enumerateDiscardOccurrences(source, filePath)
    .filter(
      (occurrence) =>
        occurrence.context === "code" && SILENT_DISCARD_REGISTERED_FORMS.has(occurrence.form),
    )
    .map((occurrence) => {
      const anchor = resolveEnclosingTopLevelFunctionName(source, occurrence.line);
      // UM veredito por ocorrência, com os quatro eixos computados: o
      // booleano, a evidência da isenção quando isenta, e o resíduo quando
      // algum eixo não resolveu — que `findSilentDiscardFindings` reprova
      // nomeando `arquivo:linha`.
      const requirement = resolveSilentDiscardRequirement(occurrence);
      return {
        line: occurrence.line,
        filePath: occurrence.filePath,
        snippet: occurrence.text,
        anchor,
        form: occurrence.form,
        key: silentDiscardKey(anchor, occurrence.text, occurrence.form),
        requiresRegistration: requirement.requires,
        exemptionEvidence: requirement.exemptionEvidence,
        unresolvedRequirementReason: requirement.unresolvedReason,
        retiredExemptionReason: requirement.retiredExemptionReason,
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

    // Pela CLASSE (e pelos quatro eixos do Goal054 §4), as 5 continuam
    // isentas. Desde o Goal055 §4, o eixo 5 retira a isenção de `:1458` e de
    // `:2989`, cuja região abandonada contém `.push(` — e o motivo do
    // resolvedor nomeia a ocorrência; as outras 3 abandonam região livre de
    // produção e continuam isentas.
    for (const line of [1484, 2996, 2999]) {
      expect(byLine.get(line)?.requiresRegistration).toBe(false);
    }
    for (const line of [1458, 2989]) {
      expect(byLine.get(line)?.requiresRegistration).toBe(true);
      expect(byLine.get(line)?.retiredExemptionReason).toContain(`http-egress-sites.ts:${line}:`);
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

    // O registro real segue vazio nas contas, com as entradas novas —
    // inclusive na do resíduo de exigência do Goal054 §4.
    const findings = findSilentDiscardFindings(realOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(findings.ambiguousKeys).toEqual([]);
    expect(findings.unregistered).toEqual([]);
    expect(findings.obsolete).toEqual([]);
    expect(findings.emptyReason).toEqual([]);
    expect(findings.unresolvedRequirement).toEqual([]);
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
      enumerateDiscardOccurrences(moduleSource, "http-egress-sites.ts")
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

  it("Goal054 §4 — a exigência combina FORMA, CLASSE de laço e DOMÍNIO percorrido, com cada eixo computado sobre a árvore real: domínio de leitura isenta em QUALQUER forma, coleção de elementos exige em QUALQUER forma, e classe portadora de candidato exige INDEPENDENTEMENTE do domínio", () => {
    const realDiscards = enumerateDiscardOccurrences(moduleSource, "http-egress-sites.ts").filter(
      (occurrence) => occurrence.context === "code",
    );
    const byDomain = (domain: DiscardCursorDomain) =>
      realDiscards.filter((occurrence) => occurrence.cursorDomain === domain);

    // Eixo DOMÍNIO — sequência de caracteres e máscara paralela isentam, e a
    // isenção vem com a evidência que o domínio concedeu, nunca nua.
    // `parallel-mask` é vazio na árvore real desde o Goal053 §1/§5 (a
    // precedência de aperto dá o domínio à sequência de caracteres), então
    // ele é exercido pela MESMA fonte sintética que o Goal053 usa — nunca
    // declarado isento só em prosa.
    const parallelMaskSource = [
      "function scan(source: string) {",
      "  const marks = new Array<boolean>(source.length).fill(false);",
      "  for (let i = 0; i < marks.length; i += 1) {",
      "    if (marks[i]) continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(byDomain("parallel-mask")).toEqual([]);
    const readingDomains: { domain: DiscardCursorDomain; bucket: DiscardOccurrence[] }[] = [
      { domain: "character-sequence", bucket: byDomain("character-sequence") },
      {
        domain: "parallel-mask",
        bucket: enumerateDiscardOccurrences(parallelMaskSource, "sintetico.ts").filter(
          (occurrence) => occurrence.cursorDomain === "parallel-mask",
        ),
      },
    ];
    for (const { domain, bucket } of readingDomains) {
      expect(bucket.length, domain).toBeGreaterThan(0);
      for (const occurrence of bucket) {
        const where = `${occurrence.filePath}:${occurrence.line}`;
        // O eixo DOMÍNIO é lido nos quatro eixos do Goal054 §4, intocados:
        // o eixo 5 do Goal055 (região abandonada) pode retirar a isenção
        // depois deles, e é conferido à parte no teste permanente do Goal055.
        const requirement = resolveSilentDiscardRequirementByFourAxes(occurrence);
        expect(requirement.requires, where).toBe(false);
        expect((requirement.exemptionEvidence ?? "").trim().length, where).toBeGreaterThan(0);
        expect(requirement.unresolvedReason, where).toBeUndefined();
        // `em QUALQUER forma`: a MESMA ocorrência, com a forma trocada para
        // `break`, continua isenta — o eixo que decide é o domínio.
        expect(
          resolveSilentDiscardRequirementByFourAxes({ ...occurrence, form: "break" }).requires,
          where,
        ).toBe(false);
      }
    }

    // Eixo DOMÍNIO — coleção de elementos exige, em qualquer forma.
    const elementCollection = byDomain("element-collection");
    expect(elementCollection.length).toBeGreaterThan(0);
    for (const occurrence of elementCollection) {
      const where = `${occurrence.filePath}:${occurrence.line}`;
      expect(requiresSilentDiscardRegistration(occurrence), where).toBe(true);
      expect(
        requiresSilentDiscardRegistration({ ...occurrence, form: "break" }),
        where,
      ).toBe(true);
    }

    // Eixo CLASSE — as três classes portadoras de candidato exigem registro
    // independentemente do domínio: a MESMA ocorrência, com o domínio trocado
    // para o que isentaria uma leitura posicional, continua exigindo.
    const candidateBorne = realDiscards.filter(
      (occurrence) =>
        occurrence.loopForm !== undefined && DISCARD_CANDIDATE_LOOP_FORMS.has(occurrence.loopForm),
    );
    expect(candidateBorne.length).toBeGreaterThan(0);
    expect(
      new Set(candidateBorne.map((occurrence) => occurrence.loopForm)).size,
    ).toBeGreaterThan(1);
    for (const occurrence of candidateBorne) {
      const where = `${occurrence.filePath}:${occurrence.line}`;
      expect(requiresSilentDiscardRegistration(occurrence), where).toBe(true);
      expect(
        requiresSilentDiscardRegistration({
          ...occurrence,
          cursorDomain: "character-sequence",
          cursorDomainEvidence: `${where}: evidência sintética do controle`,
        }),
        where,
      ).toBe(true);
    }

    // Eixo FORMA — a árvore real tem mais de uma forma exigindo registro, e
    // nenhuma delas é decidida por nome: todas passam pelos mesmos eixos.
    const formsRequiring = new Set(
      realDiscards
        .filter((occurrence) => requiresSilentDiscardRegistration(occurrence))
        .map((occurrence) => occurrence.form),
    );
    expect(formsRequiring.size).toBeGreaterThan(1);
    for (const form of formsRequiring) {
      expect(DISCARD_FORMS).toContain(form);
    }
  });

  it("Goal054 §4 — nenhuma ocorrência que já exigia registro no Goal052/053 deixou de exigir: o critério anterior é reescrito em forma computável e comparado ocorrência a ocorrência, sem vácuo", () => {
    // O critério do Goal053 §2, tal como estava antes desta unidade: decidido
    // pelo DOMÍNIO, com `no-domain` caindo na classe. Escrito aqui para ser
    // COMPARADO, não para substituir o de produção.
    const requiredUnderGoal053 = (occurrence: DiscardOccurrence): boolean => {
      if (
        occurrence.cursorDomain === "character-sequence" ||
        occurrence.cursorDomain === "parallel-mask"
      ) {
        return false;
      }
      if (occurrence.cursorDomain === "element-collection") return true;
      if (occurrence.cursorDomain === "no-domain") {
        return (
          occurrence.loopForm !== undefined &&
          DISCARD_CANDIDATE_LOOP_FORMS.has(occurrence.loopForm)
        );
      }
      return true;
    };

    // O alfabeto do Goal052/053 era `continue;` — é sobre ele que a
    // comparação vale, porque as formas novas não tinham veredito anterior.
    const continues = enumerateDiscardOccurrences(moduleSource, "http-egress-sites.ts").filter(
      (occurrence) => occurrence.context === "code" && occurrence.form === "continue",
    );
    expect(continues.length).toBeGreaterThan(0);

    const requiredBefore = continues.filter(requiredUnderGoal053);
    expect(requiredBefore.length).toBeGreaterThan(0);
    const loosened = requiredBefore.filter(
      (occurrence) => !requiresSilentDiscardRegistration(occurrence),
    );
    expect(loosened.map((occurrence) => `${occurrence.filePath}:${occurrence.line}`)).toEqual([]);

    // E o conjunto exigido hoje contém o de antes, nunca o contrário por
    // acaso: a contagem nova é maior ou igual, computada.
    const requiredNow = continues.filter((occurrence) =>
      requiresSilentDiscardRegistration(occurrence),
    );
    expect(requiredNow.length).toBeGreaterThanOrEqual(requiredBefore.length);
  });

  it("Goal054 §4 — domínio, forma, fronteira de função ou laço que não resolvem REPROVAM nomeando arquivo:linha e o motivo, e a ocorrência continua exigindo registro enquanto o resíduo existir", () => {
    const realDiscards = enumerateDiscardOccurrences(moduleSource, "http-egress-sites.ts").filter(
      (occurrence) => occurrence.context === "code",
    );
    const elementCollection = realDiscards.find(
      (occurrence) => occurrence.cursorDomain === "element-collection",
    ) as DiscardOccurrence;
    const earlyExit = realDiscards.find(
      (occurrence) => occurrence.form === "function-early-exit",
    ) as DiscardOccurrence;
    expect(elementCollection).toBeDefined();
    expect(earlyExit).toBeDefined();

    const corrupted: { rotulo: string; occurrence: DiscardOccurrence; motivo: string }[] = [
      {
        rotulo: "domínio",
        occurrence: {
          ...elementCollection,
          cursorDomain: undefined,
          cursorDomainEvidence: undefined,
          unresolvedDomainReason: "a base indexada não foi resolvida por ligação alguma",
        },
        motivo: "a base indexada não foi resolvida por ligação alguma",
      },
      {
        rotulo: "forma",
        occurrence: { ...elementCollection, form: "descarte-inventado" as DiscardForm },
        motivo:
          'forma de descarte "descarte-inventado" fora de DISCARD_FORMS, e sem forma resolvida não há veredito de exigência',
      },
      {
        rotulo: "fronteira de função",
        occurrence: {
          ...earlyExit,
          functionBoundary: undefined,
          functionBoundaryEvidence: undefined,
          unresolvedFunctionBoundaryReason:
            "o casamento de delimitadores não fechou a função que contém este `return`",
        },
        motivo: "o casamento de delimitadores não fechou a função que contém este `return`",
      },
      {
        rotulo: "laço contenedor",
        occurrence: {
          ...elementCollection,
          loopForm: undefined,
          unresolvedReason: "nenhum laço contenedor encontrado para este `continue;`",
        },
        motivo: "nenhum laço contenedor encontrado para este `continue;`",
      },
    ];

    for (const { rotulo, occurrence, motivo } of corrupted) {
      const requirement = resolveSilentDiscardRequirement(occurrence);
      // Fail-closed: o resíduo nunca isenta.
      expect(requirement.requires, rotulo).toBe(true);
      expect(requirement.exemptionEvidence, rotulo).toBeUndefined();
      expect(requirement.unresolvedReason, rotulo).toBe(motivo);

      // E a MESMA conta do registro reprova, nomeando `arquivo:linha` e o
      // motivo de não ter resolvido.
      const findings = findSilentDiscardFindings(
        [
          {
            line: occurrence.line,
            filePath: occurrence.filePath,
            snippet: occurrence.text,
            anchor: resolveEnclosingTopLevelFunctionName(moduleSource, occurrence.line),
            form: occurrence.form,
            key: silentDiscardKey(
              resolveEnclosingTopLevelFunctionName(moduleSource, occurrence.line),
              occurrence.text,
              occurrence.form,
            ),
            requiresRegistration: requirement.requires,
            exemptionEvidence: requirement.exemptionEvidence,
            unresolvedRequirementReason: requirement.unresolvedReason,
          },
        ],
        DOCUMENTED_SILENT_DISCARDS,
      );
      expect(findings.unresolvedRequirement, rotulo).toEqual([
        `${occurrence.filePath}:${occurrence.line}: ${motivo} — "${occurrence.text}"`,
      ]);
    }

    // Não vácuo: a ocorrência intacta, pelo mesmo caminho, não produz resíduo.
    expect(resolveSilentDiscardRequirement(elementCollection).unresolvedReason).toBeUndefined();
    expect(resolveSilentDiscardRequirement(earlyExit).unresolvedReason).toBeUndefined();
  });

  it("Goal054 §4 — a isenção de `break` de `switch` e a de `return` de função aninhada são COMPUTADAS, cada uma com evidência registrada na própria ocorrência; isenção que chega sem evidência reprova em vez de passar muda", () => {
    const synthetic = [
      "function varrer(candidatos) {",
      "  for (const candidato of candidatos) {",
      "    switch (candidato.tipo) {",
      '      case "a":',
      "        break;",
      "      default:",
      "        break;",
      "    }",
      "    const conferir = (valor) => {",
      "      if (valor === undefined) return false;",
      "      return true;",
      "    };",
      "    if (!conferir(candidato)) break;",
      "  }",
      "}",
      "",
    ].join("\n");
    const occurrences = enumerateDiscardOccurrences(synthetic, "sintetico.ts");

    const switchBreaks = occurrences.filter((occurrence) => occurrence.form === "switch-break");
    expect(switchBreaks).toHaveLength(2);
    for (const occurrence of switchBreaks) {
      const requirement = resolveSilentDiscardRequirement(occurrence);
      expect(requirement.requires).toBe(false);
      // A evidência é do próprio veredito, com `arquivo:linha` dos dois
      // lados: o `switch` que o encerra e o laço que ficou por fora.
      expect(requirement.exemptionEvidence).toBe(occurrence.formExemptionEvidence);
      expect(requirement.exemptionEvidence).toContain("sintetico.ts:3");
      expect(requirement.exemptionEvidence).toContain("o laço contenedor abre antes dele");
    }

    const nested = occurrences.filter(
      (occurrence) => occurrence.form === "nested-function-return",
    );
    expect(nested.length).toBeGreaterThan(0);
    for (const occurrence of nested) {
      const requirement = resolveSilentDiscardRequirement(occurrence);
      expect(requirement.requires).toBe(false);
      expect(requirement.exemptionEvidence).toBe(occurrence.functionBoundaryEvidence);
      expect((requirement.exemptionEvidence ?? "").trim().length).toBeGreaterThan(0);
    }

    // Não vácuo: o `break` do MESMO laço, fora do `switch`, continua exigindo.
    const loopBreak = occurrences.find((occurrence) => occurrence.form === "break");
    expect(loopBreak).toBeDefined();
    expect(requiresSilentDiscardRegistration(loopBreak as DiscardOccurrence)).toBe(true);

    // Isenção sem evidência reprova, nas duas formas — é o que separa
    // isenção computada de isenção muda.
    for (const occurrence of [switchBreaks[0], nested[0]]) {
      const semEvidencia = resolveSilentDiscardRequirement({
        ...occurrence,
        formExemptionEvidence: undefined,
        functionBoundaryEvidence: undefined,
      });
      expect(semEvidencia.requires, occurrence.form).toBe(true);
      expect(semEvidencia.unresolvedReason, occurrence.form).toBe(
        `a forma "${occurrence.form}" não abandona o laço, mas a isenção chegou sem evidência registrada`,
      );
    }
  });

  it("Goal054 §4 — a chave do registro distingue FORMA: entrada de `break` e de `continue` no mesmo ponto âncora não colidem nem se fundem, chave duplicada da MESMA forma continua lançando, e a chave não voltou a ser por número de linha", () => {
    const anchor = "mesmoPontoAncora";
    const snippet = "return undefined;";
    const comoSaida = silentDiscardKey(anchor, snippet, "function-early-exit");
    const comoAninhada = silentDiscardKey(anchor, snippet, "nested-function-return");
    const comoBreak = silentDiscardKey(anchor, snippet, "break");
    expect(new Set([comoSaida, comoAninhada, comoBreak, silentDiscardKey(anchor, snippet)]).size).toBe(4);

    // Mesmo âncora, MESMO trecho normalizado, formas diferentes: as entradas
    // convivem no mesmo registro, sem uma engolir a outra.
    const registry = buildSilentDiscardRegistry([
      { anchor, snippet, reason: "controle: saída antecipada da varredura", form: "function-early-exit" },
      { anchor, snippet, reason: "controle: return de função aninhada", form: "nested-function-return" },
      { anchor, snippet, reason: "controle: continue da mesma âncora" },
    ]);
    expect(registry.size).toBe(3);
    expect(registry.get(comoSaida)?.reason).toBe("controle: saída antecipada da varredura");
    expect(registry.get(comoAninhada)?.reason).toBe("controle: return de função aninhada");

    // Duplicada DA MESMA forma continua lançando — a forma na chave não
    // afrouxou a amarra do registro.
    expect(() =>
      buildSilentDiscardRegistry([
        { anchor, snippet, reason: "primeira", form: "break" },
        { anchor, snippet, reason: "segunda", form: "break" },
      ]),
    ).toThrow(/chave duplicada/u);

    // A chave real carrega âncora, forma declarada e trecho — e nenhum
    // número de linha: chavear por linha está proibido desde o Goal050.
    const formAlternation = [...DISCARD_FORMS].join("|");
    const keyShape = new RegExp(`^[^:]+::(?:${formAlternation})::`, "u");
    for (const key of DOCUMENTED_SILENT_DISCARDS.keys()) {
      expect(key, key).toMatch(keyShape);
    }
    for (const occurrence of realOccurrences) {
      expect(occurrence.key, occurrence.key).toBe(
        silentDiscardKey(occurrence.anchor, occurrence.snippet, occurrence.form),
      );
    }

    // E a prova de que a chave não é posicional, computada: deslocar o
    // módulo inteiro em 200 linhas não muda chave alguma.
    const shifted = enumerateSilentDiscardOccurrences(
      `${"\n".repeat(200)}${moduleSource}`,
      "http-egress-sites.ts",
    );
    expect(shifted).toHaveLength(realOccurrences.length);
    expect([...new Set(shifted.map((occurrence) => occurrence.key))].sort()).toEqual(
      [...new Set(realOccurrences.map((occurrence) => occurrence.key))].sort(),
    );
    expect(shifted.map((occurrence) => occurrence.line)).not.toEqual(
      realOccurrences.map((occurrence) => occurrence.line),
    );
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
    // Fonte única: `enumerateDiscardOccurrences` (Goal052/WU-01), a mesma
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
    // Eixo da exigência que não resolveu reprova nomeando arquivo:linha
    // (Goal054 §4) — na árvore real, nenhum.
    expect(findings.unresolvedRequirement).toEqual([]);

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

describe("Goal047 / WU-04 (§6) — a árvore real produz os números desta rodada, e as 45 ocorrências de this.http. são classificadas sem recusa alguma", () => {
  it("1 superfície, 4 ligações, 210 arquivos varridos, 10 rotas, 2 instanciações fora do transporte, 0 chamadas de membro fora da superfície — inalterados pelas correções deste Goal, exceto o de arquivos varridos, pelo modelo AgendaViewPreference do Goal073, pelo modelo HumanTakeover do Goal074, por modules/prompts/service-instructions.ts do Goal078 e por lib/calendar-source.ts do Goal109", () => {
    const { requests, internalClientSurfaces, nonGoBoundInstantiations, nonTransportMemberCalls } =
      discoverGoServiceHttpRequests(aiOrchestratorSrcPath, bffSrcPath, envSchemaSourcePath);

    expect(internalClientSurfaces).toHaveLength(1);
    expect(internalClientSurfaces[0].instantiationBindings).toHaveLength(4);
    expect(internalClientSurfaces[0].scannedFilePathsForInstantiation).toHaveLength(210);
    expect(requests).toHaveLength(10);
    expect(nonGoBoundInstantiations).toHaveLength(2);
    expect(nonTransportMemberCalls).toHaveLength(0);
  });

  it("as 45 ocorrências de this.http. em apps/bff/src/clients/ estão todas na forma direta this.http.<membro>(, sem exceção, e a leitura completa não lança recusa alguma sobre a árvore real", () => {
    const clientsRoot = join(bffSrcPath, "clients");
    const files = listTypeScriptSources(clientsRoot);
    let totalOccurrences = 0;
    let totalDirectCalls = 0;
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      totalOccurrences += (source.match(/\bthis\.http\./gu) ?? []).length;
      totalDirectCalls += (source.match(/\bthis\.http\.[A-Za-z_$][\w$]*\(/gu) ?? []).length;
    }
    expect(totalOccurrences).toBe(45);
    expect(totalDirectCalls).toBe(45);
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
    const before = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(moduleSource, "http-egress-sites.ts"),
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
    const after = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(unrecognizedSource, "sintetico-controle3.ts"),
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
    const afterWhile = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(unrecognizedWhileSource, "sintetico-controle3.ts"),
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
    const unresolvedDomainFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(unresolvedDomainSource, "sintetico-controle3-dominio.ts"),
    );
    expect(unresolvedDomainFindings.byCursorDomain).toEqual({});
    expect(unresolvedDomainFindings.unresolved).toEqual([
      'sintetico-controle3-dominio.ts:3: o cursor `i` do laço `for (let i = 0; i < limit; i += 1)` não indexa valor algum no corpo, então o domínio percorrido não pode ser resolvido — "continue;"',
    ]);

    // E domínio fora do vocabulário declarado (`DISCARD_CURSOR_DOMAINS`)
    // também reprova, nomeada — a mesma ocorrência real, com um domínio
    // inventado, na mesma conta.
    const [firstRealCodeOccurrence] = enumerateDiscardOccurrences(
      moduleSource,
      "http-egress-sites.ts",
    ).filter((occurrence) => occurrence.context === "code");
    expect(firstRealCodeOccurrence).toBeDefined();
    expect(findDiscardEnumerationFindings([firstRealCodeOccurrence]).outsideVocabulary).toEqual([]);
    const outsideDomainVocabularyFindings = findDiscardEnumerationFindings([
      { ...firstRealCodeOccurrence, cursorDomain: "dominio-inventado" as DiscardCursorDomain },
    ]);
    expect(outsideDomainVocabularyFindings.outsideVocabulary).toEqual([
      `http-egress-sites.ts:${firstRealCodeOccurrence.line}: domínio "dominio-inventado" fora de DISCARD_CURSOR_DOMAINS — "${firstRealCodeOccurrence.text}"`,
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

describe("Goal054 / WU-06 (§10) — controles negativos: as dez amarras do alfabeto ampliado do descarte mordem, cada uma chamando a MESMA conta que o teste permanente chama, com as duas saídas no relatório", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");
  // As duas leituras reais, computadas uma vez e compartilhadas pelos dez
  // controles: a enumeração do alfabeto inteiro (Goal052/WU-01 ampliada pelo
  // Goal054 §1) e a projeção dela para o registro de motivo (Goal052/WU-02,
  // ampliada pelo Goal054 §4). Nenhum controle abre varredura própria.
  const realDiscardOccurrences = enumerateDiscardOccurrences(moduleSource, "http-egress-sites.ts");
  const realSilentOccurrences = enumerateSilentDiscardOccurrences(
    moduleSource,
    "http-egress-sites.ts",
  );
  /**
   * O ALCANCE ANTERIOR a este Goal, reconstruído por filtro sobre a MESMA
   * enumeração: só a forma `continue`. É o que torna a saída "antes"
   * verificável em vez de lembrada — as ocorrências de `break` e de saída
   * antecipada simplesmente não existiam para o registro, e por isso remover
   * a entrada de uma delas não produzia acusação alguma.
   */
  const legacyScopeOccurrences = realSilentOccurrences.filter(
    (occurrence) => (occurrence.form ?? "continue") === "continue",
  );

  it("controle 1 (§10.1) — `break;` em laço portador de candidato reprova quando não registrado: a remoção da entrada real nomeia a linha, e no alcance anterior (só `continue`) a MESMA remoção não produzia nada", () => {
    const breakKey = silentDiscardKey("discoverCallerResolvedGoBoundRequests", "break;", "break");
    const breakOccurrence = realSilentOccurrences.find(
      (occurrence) => occurrence.key === breakKey,
    );
    expect(breakOccurrence).toBeDefined();
    expect(breakOccurrence!.form).toBe("break");
    expect(breakOccurrence!.requiresRegistration).toBe(true);

    // Antes: a árvore real, com o registro inteiro, passa verde pela mesma
    // conta que o teste permanente chama.
    const before = findSilentDiscardFindings(realSilentOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(before.unregistered).toEqual([]);
    expect(before.unresolvedRequirement).toEqual([]);

    // Depois: numa CÓPIA do registro, sem a entrada desse `break;` — a mesma
    // conta reprova, nomeando a linha e o trecho.
    const registryWithoutBreak = new Map(DOCUMENTED_SILENT_DISCARDS);
    registryWithoutBreak.delete(breakKey);
    const after = findSilentDiscardFindings(realSilentOccurrences, registryWithoutBreak);
    expect(after.unregistered).toEqual([`${breakOccurrence!.line}: "${breakOccurrence!.snippet}"`]);

    // A saída "antes do diff": no alcance anterior a ocorrência nem era
    // enumerada, então a MESMA remoção não produzia `unregistered` algum —
    // o silêncio que este Goal fecha.
    expect(legacyScopeOccurrences.some((occurrence) => occurrence.key === breakKey)).toBe(false);
    expect(
      findSilentDiscardFindings(legacyScopeOccurrences, registryWithoutBreak).unregistered,
    ).toEqual([]);
  });

  it("controle 2 (§10.2) — saída antecipada em laço de domínio `element-collection` reprova quando não registrada: a porta que ficava aberta ao lado da amarra do Goal053, com as duas saídas", () => {
    const earlyExitKey = silentDiscardKey("readEnvFileValue", "return {", "function-early-exit");
    const earlyExit = realSilentOccurrences.find((occurrence) => occurrence.key === earlyExitKey);
    expect(earlyExit).toBeDefined();
    expect(earlyExit!.form).toBe("function-early-exit");
    expect(earlyExit!.requiresRegistration).toBe(true);
    // O eixo que a exige é o DOMÍNIO percorrido, computado pela mesma
    // enumeração — não a classe do cabeçalho, que aqui é `for-indexed`, a
    // mesma que o Goal052 isentava em bloco.
    const rawEarlyExit = realDiscardOccurrences.find(
      (occurrence) => occurrence.line === earlyExit!.line,
    );
    expect(rawEarlyExit?.loopForm).toBe("for-indexed");
    expect(rawEarlyExit?.cursorDomain).toBe("element-collection");

    // Antes: registro inteiro, nenhuma acusação.
    expect(
      findSilentDiscardFindings(realSilentOccurrences, DOCUMENTED_SILENT_DISCARDS).unregistered,
    ).toEqual([]);

    // Depois: sem a entrada dessa saída antecipada, a mesma conta reprova
    // nomeando a linha.
    const registryWithoutEarlyExit = new Map(DOCUMENTED_SILENT_DISCARDS);
    registryWithoutEarlyExit.delete(earlyExitKey);
    expect(
      findSilentDiscardFindings(realSilentOccurrences, registryWithoutEarlyExit).unregistered,
    ).toEqual([`${earlyExit!.line}: "${earlyExit!.snippet}"`]);

    // E a saída "antes do diff": a amarra de domínio do Goal053 mordia só
    // `continue`, então esta ocorrência, no MESMO laço `element-collection`,
    // passava invisível — a remoção não produzia acusação alguma.
    expect(legacyScopeOccurrences.some((occurrence) => occurrence.key === earlyExitKey)).toBe(
      false,
    );
    expect(
      findSilentDiscardFindings(legacyScopeOccurrences, registryWithoutEarlyExit).unregistered,
    ).toEqual([]);
  });

  it("controle 3 (§10.3) — `break;` em laço de domínio `character-sequence` continua isento, e a MESMA guarda movida para laço sobre coleção de elementos passa a exigir registro — as duas saídas, por fonte sintética", () => {
    // Antes: o cursor percorre uma sequência de caracteres (`text: string`),
    // e cada volta avança leitura — o `break;` não larga candidato algum.
    const charSequenceSource = [
      "function scanControle3Chars(text: string) {",
      "  for (let i = 0; i < text.length; i += 1) {",
      '    if (text[i] === " ") break;',
      "  }",
      "}",
      "",
    ].join("\n");
    const charSequenceRaw = enumerateDiscardOccurrences(
      charSequenceSource,
      "sintetico-wu06-controle3.ts",
    );
    expect(
      charSequenceRaw.map((occurrence) => [occurrence.form, occurrence.cursorDomain]),
    ).toEqual([["break", "character-sequence"]]);
    expect(findDiscardEnumerationFindings(charSequenceRaw).unresolved).toEqual([]);
    const charSequenceOccurrences = enumerateSilentDiscardOccurrences(
      charSequenceSource,
      "sintetico-wu06-controle3.ts",
    );
    expect(charSequenceOccurrences).toHaveLength(1);
    expect(charSequenceOccurrences[0].requiresRegistration).toBe(false);
    // A isenção é COMPUTADA e traz a evidência do domínio, nunca muda.
    expect((charSequenceOccurrences[0].exemptionEvidence ?? "").trim().length).toBeGreaterThan(0);
    const charSequenceFindings = findSilentDiscardFindings(
      charSequenceOccurrences,
      DOCUMENTED_SILENT_DISCARDS,
    );
    expect(charSequenceFindings.unregistered).toEqual([]);
    expect(charSequenceFindings.unresolvedRequirement).toEqual([]);

    // Depois: a MESMA guarda, o MESMO cabeçalho `for` indexado, e só o que o
    // cursor percorre muda — uma coleção de elementos. A mesma conta passa a
    // exigir registro e reprova a ocorrência não registrada.
    const elementCollectionSource = [
      "function scanControle3Elements(source: string) {",
      '  const pending = source.split(",");',
      "  for (let i = 0; i < pending.length; i += 1) {",
      '    if (pending[i] === " ") break;',
      "  }",
      "}",
      "",
    ].join("\n");
    const elementCollectionRaw = enumerateDiscardOccurrences(
      elementCollectionSource,
      "sintetico-wu06-controle3.ts",
    );
    expect(
      elementCollectionRaw.map((occurrence) => [occurrence.form, occurrence.cursorDomain]),
    ).toEqual([["break", "element-collection"]]);
    const elementCollectionOccurrences = enumerateSilentDiscardOccurrences(
      elementCollectionSource,
      "sintetico-wu06-controle3.ts",
    );
    expect(elementCollectionOccurrences).toHaveLength(1);
    expect(elementCollectionOccurrences[0].requiresRegistration).toBe(true);
    expect(
      findSilentDiscardFindings(elementCollectionOccurrences, DOCUMENTED_SILENT_DISCARDS)
        .unregistered,
    ).toEqual([
      `${elementCollectionOccurrences[0].line}: "${elementCollectionOccurrences[0].snippet}"`,
    ]);
  });

  it("controle 4 (§10.4) — `return` de função aninhada dentro do laço não conta como saída antecipada, e o MESMO `return` movido para o corpo do laço passa a contar — as duas saídas, por fonte sintética", () => {
    // Antes: o `return` volta de uma arrow com corpo em bloco declarada
    // DENTRO do corpo do laço — a volta seguinte do laço acontece do mesmo
    // jeito, e não há candidato largado.
    const nestedSource = [
      "function scanControle4Aninhado(candidatos) {",
      "  for (const candidato of candidatos) {",
      "    const avaliar = () => {",
      "      return candidato.valor;",
      "    };",
      "    avaliar();",
      "  }",
      "}",
      "",
    ].join("\n");
    const nestedRaw = enumerateDiscardOccurrences(nestedSource, "sintetico-wu06-controle4.ts");
    expect(nestedRaw.map((occurrence) => [occurrence.line, occurrence.form])).toEqual([
      [4, "nested-function-return"],
    ]);
    expect(nestedRaw[0].functionBoundary).toBe("nested-function");
    expect(findDiscardEnumerationFindings(nestedRaw).unresolved).toEqual([]);
    expect(requiresSilentDiscardRegistration(nestedRaw[0])).toBe(false);
    // A forma aninhada não é projetada para o registro, e a mesma conta não
    // acusa ocorrência alguma — nem como não registrada, nem como resíduo.
    const nestedOccurrences = enumerateSilentDiscardOccurrences(
      nestedSource,
      "sintetico-wu06-controle4.ts",
    );
    expect(nestedOccurrences).toEqual([]);
    const nestedFindings = findSilentDiscardFindings(
      nestedOccurrences,
      new Map<string, SilentDiscardEntry>(),
    );
    expect(nestedFindings.unregistered).toEqual([]);
    expect(nestedFindings.unresolvedRequirement).toEqual([]);

    // Depois: o MESMO `return candidato.valor;`, movido para o corpo do laço
    // — a função mais próxima passa a ser a que contém o cabeçalho, e a
    // ocorrência vira saída antecipada, que exige registro e, não
    // registrada, reprova nomeando a linha.
    const inlinedSource = [
      "function scanControle4Corpo(candidatos) {",
      "  for (const candidato of candidatos) {",
      "    return candidato.valor;",
      "  }",
      "}",
      "",
    ].join("\n");
    const inlinedRaw = enumerateDiscardOccurrences(inlinedSource, "sintetico-wu06-controle4.ts");
    expect(inlinedRaw.map((occurrence) => [occurrence.line, occurrence.form])).toEqual([
      [3, "function-early-exit"],
    ]);
    expect(inlinedRaw[0].functionBoundary).toBe("same-function");
    expect(requiresSilentDiscardRegistration(inlinedRaw[0])).toBe(true);
    const inlinedOccurrences = enumerateSilentDiscardOccurrences(
      inlinedSource,
      "sintetico-wu06-controle4.ts",
    );
    expect(inlinedOccurrences).toHaveLength(1);
    expect(
      findSilentDiscardFindings(inlinedOccurrences, DOCUMENTED_SILENT_DISCARDS).unregistered,
    ).toEqual([`${inlinedOccurrences[0].line}: "${inlinedOccurrences[0].snippet}"`]);
  });

  it("controle 5 (§10.5) — `break` de `switch` não conta como abandono de laço, e a forma ROTULADA é resolvida ao laço que o rótulo declara ou reprova como resíduo nomeado — as duas saídas, por fonte sintética", () => {
    // Antes: o `break;` da linha 5 encerra o `switch`, não o laço — isenção
    // COMPUTADA, com a evidência do `switch` que o contém.
    const switchSource = [
      "function scanControle5Switch(candidatos) {",
      "  for (const candidato of candidatos) {",
      "    switch (candidato.tipo) {",
      '      case "a":',
      "        break;",
      "      default:",
      "        candidato.visto = true;",
      "    }",
      "    if (candidato.pronto) break;",
      "  }",
      "}",
      "",
    ].join("\n");
    const switchRaw = enumerateDiscardOccurrences(switchSource, "sintetico-wu06-controle5.ts");
    const switchFindings = findDiscardEnumerationFindings(switchRaw);
    expect(switchRaw.map((occurrence) => [occurrence.line, occurrence.form])).toEqual([
      [5, "switch-break"],
      [9, "break"],
    ]);
    expect(switchFindings.unresolved).toEqual([]);
    expect(switchFindings.outsideVocabulary).toEqual([]);
    expect(switchFindings.byForm).toEqual({ "switch-break": 1, break: 1 });
    const switchBreak = switchRaw[0];
    expect((switchBreak.formExemptionEvidence ?? "").trim().length).toBeGreaterThan(0);
    expect(requiresSilentDiscardRegistration(switchBreak)).toBe(false);
    // O `break;` do MESMO laço, fora do `switch`, continua abandonando: a
    // isenção é do `break` de `switch`, nunca de todo `break` do arquivo.
    expect(requiresSilentDiscardRegistration(switchRaw[1])).toBe(true);
    const switchSilent = enumerateSilentDiscardOccurrences(
      switchSource,
      "sintetico-wu06-controle5.ts",
    );
    // `switch-break` não é forma registrável e não chega ao registro; o
    // `break` que abandona o laço chega e reprova não registrado — as duas
    // saídas na MESMA conta.
    expect(switchSilent.map((occurrence) => occurrence.line)).toEqual([9]);
    expect(
      findSilentDiscardFindings(switchSilent, DOCUMENTED_SILENT_DISCARDS).unregistered,
    ).toEqual([`${switchSilent[0].line}: "${switchSilent[0].snippet}"`]);

    // Depois: a forma ROTULADA, que abandona um laço que NÃO é o mais
    // interno — resolvida ao laço que o rótulo declara.
    const labeledSource = [
      "function scanControle5Rotulado(linhas) {",
      "  externo: for (const linha of linhas) {",
      "    for (let i = 0; i < linha.length; i += 1) {",
      "      if (linha[i] === undefined) break externo;",
      "    }",
      "  }",
      "}",
      "",
    ].join("\n");
    const labeledRaw = enumerateDiscardOccurrences(labeledSource, "sintetico-wu06-controle5.ts");
    expect(findDiscardEnumerationFindings(labeledRaw).unresolved).toEqual([]);
    expect(labeledRaw.map((occurrence) => [occurrence.form, occurrence.loopHeader])).toEqual([
      ["break", "const linha of linhas"],
    ]);

    // E o rótulo que não corresponde a laço algum reprova como resíduo
    // nomeado por arquivo:linha, na MESMA conta — nunca isenta em silêncio.
    const orphanLabelSource = [
      "function scanControle5Orfao(linhas) {",
      "  for (const linha of linhas) {",
      "    if (!linha) break ausente;",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(
      findDiscardEnumerationFindings(
        enumerateDiscardOccurrences(orphanLabelSource, "sintetico-wu06-controle5.ts"),
      ).unresolved,
    ).toEqual([
      'sintetico-wu06-controle5.ts:3: rótulo `ausente` não corresponde a laço algum — "if (!linha) break ausente;"',
    ]);
  });

  it("controle 6 (§10.6) — forma, domínio ou fronteira de função não resolvidos REPROVAM nomeando arquivo:linha e o motivo, em vez de isentar, e forma fora do vocabulário declarado também reprova — cada um com as duas saídas", () => {
    // Antes, para os três eixos: a árvore real resolve tudo, resíduo zero,
    // pelas duas contas que os testes permanentes chamam.
    const beforeEnumeration = findDiscardEnumerationFindings(realDiscardOccurrences);
    expect(beforeEnumeration.unresolved).toEqual([]);
    expect(beforeEnumeration.outsideVocabulary).toEqual([]);
    expect(
      findSilentDiscardFindings(realSilentOccurrences, DOCUMENTED_SILENT_DISCARDS)
        .unresolvedRequirement,
    ).toEqual([]);

    // Depois (a) — FORMA fora do vocabulário: a MESMA ocorrência real de
    // `break` com uma forma inventada reprova nomeada, não entra em contagem
    // alguma, e o veredito de exigência vira resíduo em vez de isenção.
    const realBreak = realDiscardOccurrences.find((occurrence) => occurrence.form === "break");
    expect(realBreak).toBeDefined();
    const invented: DiscardOccurrence = {
      ...realBreak!,
      form: "descarte-inventado-wu06" as DiscardForm,
    };
    const inventedFindings = findDiscardEnumerationFindings([invented]);
    expect(inventedFindings.outsideVocabulary).toEqual([
      `http-egress-sites.ts:${realBreak!.line}: forma de descarte "descarte-inventado-wu06" fora de DISCARD_FORMS — "${realBreak!.text}"`,
    ]);
    expect(inventedFindings.byForm).toEqual({});
    const inventedRequirement = resolveSilentDiscardRequirement(invented);
    expect(inventedRequirement.requires).toBe(true);
    expect(inventedRequirement.unresolvedReason).toBe(
      'forma de descarte "descarte-inventado-wu06" fora de DISCARD_FORMS, e sem forma resolvida não há veredito de exigência',
    );

    // Depois (b) — DOMÍNIO não resolvido: cabeçalho reconhecido
    // (`for-indexed`), mas o cursor não indexa valor algum no corpo, e o
    // descarte é `break;`, forma que só este Goal enumera.
    const unresolvedDomainSource = [
      "function scanControle6Dominio(limite) {",
      "  for (let i = 0; i < limite; i += 1) {",
      "    break;",
      "  }",
      "}",
      "",
    ].join("\n");
    const unresolvedDomainReason =
      'sintetico-wu06-controle6.ts:3: o cursor `i` do laço `for (let i = 0; i < limite; i += 1)` não indexa valor algum no corpo, então o domínio percorrido não pode ser resolvido — "break;"';
    const unresolvedDomainFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(unresolvedDomainSource, "sintetico-wu06-controle6.ts"),
    );
    expect(unresolvedDomainFindings.unresolved).toEqual([unresolvedDomainReason]);
    expect(unresolvedDomainFindings.byCursorDomain).toEqual({});
    // E o mesmo resíduo atravessa para a conta do registro, nomeado por
    // arquivo:linha, com a ocorrência continuando a EXIGIR registro —
    // fail-closed, nunca isenção por falta de prova.
    const unresolvedDomainSilent = enumerateSilentDiscardOccurrences(
      unresolvedDomainSource,
      "sintetico-wu06-controle6.ts",
    );
    expect(unresolvedDomainSilent).toHaveLength(1);
    expect(unresolvedDomainSilent[0].requiresRegistration).toBe(true);
    expect(
      findSilentDiscardFindings(unresolvedDomainSilent, DOCUMENTED_SILENT_DISCARDS)
        .unresolvedRequirement,
    ).toEqual([unresolvedDomainReason]);

    // Depois (c) — FRONTEIRA DE FUNÇÃO não resolvida: o `)` que precede o
    // `{` não tem `(` correspondente no texto mascarado, e o casamento de
    // delimitadores não inventa fronteira.
    const unresolvedBoundarySource = [
      "function scanControle6Fronteira(itens) {",
      "  for (const item of itens) {",
      "    const fabrica = item) {",
      "      return item;",
      "    };",
      "  }",
      "}",
      "",
    ].join("\n");
    const unresolvedBoundaryReason =
      'sintetico-wu06-controle6.ts:4: a fronteira de função deste `return` não foi resolvida: o `)` que precede o `{` não tem `(` correspondente no texto mascarado — "return item;"';
    const unresolvedBoundaryFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(unresolvedBoundarySource, "sintetico-wu06-controle6.ts"),
    );
    expect(unresolvedBoundaryFindings.unresolved).toEqual([unresolvedBoundaryReason]);
    expect(unresolvedBoundaryFindings.byForm).toEqual({});
    const unresolvedBoundarySilent = enumerateSilentDiscardOccurrences(
      unresolvedBoundarySource,
      "sintetico-wu06-controle6.ts",
    );
    expect(unresolvedBoundarySilent).toHaveLength(1);
    expect(unresolvedBoundarySilent[0].requiresRegistration).toBe(true);
    expect(
      findSilentDiscardFindings(unresolvedBoundarySilent, DOCUMENTED_SILENT_DISCARDS)
        .unresolvedRequirement,
    ).toEqual([unresolvedBoundaryReason]);
  });

  it("controle 7 (§10.7) — entrada registrada que perde a ocorrência reprova como obsoleta, motivo vazio reprova, e a chave de `break` não colide com a de `continue` no mesmo ponto âncora, com o registro continuando a lançar em chave duplicada da MESMA forma", () => {
    const breakKey = silentDiscardKey(
      "findEnclosingClassSpan",
      "if (match.index >= index) break;",
      "break",
    );
    expect(DOCUMENTED_SILENT_DISCARDS.has(breakKey)).toBe(true);

    // Antes: toda entrada tem ocorrência correspondente e motivo escrito.
    const before = findSilentDiscardFindings(realSilentOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(before.obsolete).toEqual([]);
    expect(before.emptyReason).toEqual([]);

    // Depois (a) — numa CÓPIA das ocorrências, sem a que sustenta a entrada
    // de `break`: a mesma conta acusa a entrada como obsoleta.
    const withoutBreakOccurrence = realSilentOccurrences.filter(
      (occurrence) => occurrence.key !== breakKey,
    );
    expect(withoutBreakOccurrence.length).toBe(realSilentOccurrences.length - 1);
    expect(
      findSilentDiscardFindings(withoutBreakOccurrence, DOCUMENTED_SILENT_DISCARDS).obsolete,
    ).toEqual([breakKey]);

    // Depois (b) — numa CÓPIA do registro, com o motivo dessa MESMA entrada
    // esvaziado: a mesma conta reprova, nomeando a chave.
    const emptiedRegistry = new Map(DOCUMENTED_SILENT_DISCARDS);
    emptiedRegistry.set(breakKey, { ...DOCUMENTED_SILENT_DISCARDS.get(breakKey)!, reason: "   " });
    expect(findSilentDiscardFindings(realSilentOccurrences, emptiedRegistry).emptyReason).toEqual([
      breakKey,
    ]);

    // Depois (c) — a chave DISTINGUE forma: o mesmo ponto âncora e o mesmo
    // trecho, em duas formas, produzem duas chaves e duas entradas que
    // convivem no MESMO registro, sem colidir nem se fundir.
    const anchor = "scanControle7";
    const snippet = "if (!candidato) break;";
    expect(silentDiscardKey(anchor, snippet, "break")).not.toBe(
      silentDiscardKey(anchor, snippet, "continue"),
    );
    const mixedRegistry = buildSilentDiscardRegistry([
      { anchor, snippet, reason: "controle: abandono do laço", form: "break" },
      { anchor, snippet, reason: "controle: salto para a próxima volta", form: "continue" },
    ]);
    expect(mixedRegistry.size).toBe(2);
    expect(mixedRegistry.get(silentDiscardKey(anchor, snippet, "break"))?.reason).toBe(
      "controle: abandono do laço",
    );
    expect(mixedRegistry.get(silentDiscardKey(anchor, snippet, "continue"))?.reason).toBe(
      "controle: salto para a próxima volta",
    );

    // E chave duplicada da MESMA forma continua lançando dentro do próprio
    // registro — o que a distinção por forma afrouxaria se fosse nominal.
    expect(() =>
      buildSilentDiscardRegistry([
        { anchor, snippet, reason: "primeira", form: "break" },
        { anchor, snippet, reason: "segunda", form: "break" },
      ]),
    ).toThrow(/chave duplicada/u);
  });

  it("controle 8 (§10.8) — deslocamento de 200 linhas continua não reprovando em massa, agora sobre o alfabeto inteiro: a numeração desloca, a forma e a chave sobrevivem, e nenhuma conta muda", () => {
    // Antes: a árvore real, com as três formas presentes, passa verde nas
    // duas contas.
    const beforeEnumeration = findDiscardEnumerationFindings(realDiscardOccurrences);
    const beforeRegistry = findSilentDiscardFindings(
      realSilentOccurrences,
      DOCUMENTED_SILENT_DISCARDS,
    );
    expect(realSilentOccurrences.length).toBeGreaterThan(0);
    expect(beforeRegistry.unregistered).toEqual([]);
    expect(beforeRegistry.obsolete).toEqual([]);
    expect(beforeRegistry.ambiguousKeys).toEqual([]);
    expect(beforeRegistry.unresolvedRequirement).toEqual([]);

    // Depois: 200 linhas em branco antes de tudo — a numeração inteira
    // desloca, e nada mais muda.
    const shiftedSource = `${"\n".repeat(200)}${moduleSource}`;
    const shiftedEnumeration = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(shiftedSource, "http-egress-sites.ts"),
    );
    expect(shiftedEnumeration.byForm).toEqual(beforeEnumeration.byForm);
    expect(shiftedEnumeration.byLoopForm).toEqual(beforeEnumeration.byLoopForm);
    expect(shiftedEnumeration.byCursorDomain).toEqual(beforeEnumeration.byCursorDomain);
    expect(shiftedEnumeration.unresolved).toEqual([]);
    expect(shiftedEnumeration.outsideVocabulary).toEqual([]);

    const shiftedSilent = enumerateSilentDiscardOccurrences(shiftedSource, "http-egress-sites.ts");
    expect(shiftedSilent.length).toBe(realSilentOccurrences.length);
    for (let index = 0; index < realSilentOccurrences.length; index += 1) {
      expect(shiftedSilent[index].line).toBe(realSilentOccurrences[index].line + 200);
      expect(shiftedSilent[index].key).toBe(realSilentOccurrences[index].key);
      expect(shiftedSilent[index].form).toBe(realSilentOccurrences[index].form);
    }
    const afterRegistry = findSilentDiscardFindings(shiftedSilent, DOCUMENTED_SILENT_DISCARDS);
    expect(afterRegistry.unregistered).toEqual([]);
    expect(afterRegistry.obsolete).toEqual([]);
    expect(afterRegistry.ambiguousKeys).toEqual([]);
    expect(afterRegistry.unresolvedRequirement).toEqual([]);
  });

  it("controle 9 (§10.9) — nada do Goal052 e do Goal053 foi afrouxado: a ocorrência de `continue;` que já exigia registro continua exigindo, e o total por classe e por domínio continua reconstruindo as 120 ocorrências — as duas saídas", () => {
    // O recorte de UMA forma sai da MESMA enumeração: filtro sobre o
    // resultado, nunca segunda varredura.
    const continueOccurrences = realDiscardOccurrences.filter(
      (occurrence) => occurrence.form === "continue",
    );
    const continueFindings = findDiscardEnumerationFindings(continueOccurrences);
    const textualTotal = (moduleSource.match(/\bcontinue\s*;/gu) ?? []).length;
    expect(continueFindings.total).toBe(textualTotal);
    // O número desta rodada, computado em runtime e conferido contra a
    // contagem textual independente: 120, o mesmo que o Goal052 e o Goal053
    // provaram. O alfabeto novo não diluiu nem reclassificou nada dele.
    expect(textualTotal).toBe(120);
    expect(Object.values(continueFindings.byLoopForm).reduce((sum, count) => sum + count, 0)).toBe(
      textualTotal,
    );
    expect(
      Object.values(continueFindings.byCursorDomain).reduce((sum, count) => sum + count, 0),
    ).toBe(textualTotal);
    expect(continueFindings.unresolved).toEqual([]);
    expect(continueFindings.outsideVocabulary).toEqual([]);

    // Antes: a ocorrência de `continue;` de classe portadora de candidato que
    // o Goal052 já exigia registrada continua exigindo, e o registro inteiro
    // passa verde.
    const candidateKey = silentDiscardKey("resolveViaCallers", "if (!argExpression) continue;");
    const candidateOccurrences = realSilentOccurrences.filter(
      (occurrence) => occurrence.key === candidateKey,
    );
    expect(candidateOccurrences.length).toBeGreaterThan(0);
    for (const occurrence of candidateOccurrences) {
      expect(occurrence.form ?? "continue").toBe("continue");
      expect(occurrence.requiresRegistration).toBe(true);
    }
    expect(
      findSilentDiscardFindings(realSilentOccurrences, DOCUMENTED_SILENT_DISCARDS).unregistered,
    ).toEqual([]);

    // Depois: sem a entrada dela, a mesma conta reprova toda ocorrência que a
    // chave cobre — a exigência do Goal052/053 não foi afrouxada por nenhuma
    // das formas novas.
    const registryWithoutCandidate = new Map(DOCUMENTED_SILENT_DISCARDS);
    registryWithoutCandidate.delete(candidateKey);
    expect(
      findSilentDiscardFindings(realSilentOccurrences, registryWithoutCandidate).unregistered,
    ).toEqual(
      candidateOccurrences.map((occurrence) => `${occurrence.line}: "${occurrence.snippet}"`),
    );
  });

  it("controle 10 (§10.10) — a partição do Goal050/051 e a cobertura das 24 categorias do Goal049 continuam mordendo: entrada em balde não permitido pela categoria da origem, chave nova no universo de saída e categoria órfã na cobertura — uma cada, com as duas saídas", () => {
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

    // Amarra A — partição de duas mãos (Goal051). Antes: os baldes reais,
    // limpos, pela mesma conta que o teste permanente chama.
    expect(
      findEgressPartitionFindings(egress.sites, bucketsByName)
        .entriesInBucketNotAllowedByOriginCategory,
    ).toEqual([]);
    // Depois: a PRIMEIRA requisição real movida para `nonTransportMemberCalls`
    // — balde que a categoria da origem não permite — reprova nomeada.
    const [movedRequest] = discovery.requests;
    expect(movedRequest).toBeDefined();
    const originPosition = egressPositionKey(movedRequest.originSite);
    const originCategory = egress.sites.find(
      (site) => egressPositionKey(site) === originPosition,
    )!.category;
    expect(
      findEgressPartitionFindings(egress.sites, {
        ...bucketsByName,
        requests: discovery.requests.filter((request) => request !== movedRequest),
        nonTransportMemberCalls: [...discovery.nonTransportMemberCalls, movedRequest],
      }).entriesInBucketNotAllowedByOriginCategory,
    ).toEqual([
      `nonTransportMemberCalls ${egressPositionKey(movedRequest)} com origem ${originPosition} [${originCategory}]`,
    ]);

    // Amarra B — universo de saída (Goal051). Antes: toda chave declarada.
    expect(findDiscoveryUniverseFindings(Object.keys(discovery).sort()).undeclared).toEqual([]);
    // Depois: uma coleção a mais, que a declaração não nomeia — reprova.
    expect(
      findDiscoveryUniverseFindings(
        Object.keys({ ...discovery, colecaoNovaControle10: [] }).sort(),
      ).undeclared,
    ).toEqual(["colecaoNovaControle10"]);

    // Amarra C — cobertura das 24 categorias (Goal049). Antes: nenhuma órfã.
    const allRefusalCategories: readonly string[] = [
      ...INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES,
      ...CLASS_BINDING_REFUSAL_CATEGORIES,
      ...CLIENT_FIELD_USE_REFUSAL_CATEGORIES,
    ];
    expect(allRefusalCategories.length).toBe(24);
    expect(findUncoveredRefusalCategories(allRefusalCategories, observedRefusalCategories)).toEqual(
      [],
    );
    // Depois: numa CÓPIA das observadas, sem a ÚLTIMA categoria alcançável
    // observada — a mesma conta a acusa como órfã, e as 2 provadas
    // inalcançáveis continuam descontadas pelo registro, nos dois sentidos.
    const reachableObserved = allRefusalCategories.filter(
      (category) =>
        !PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.has(category) &&
        observedRefusalCategories.has(category),
    );
    const removedCategory = reachableObserved[reachableObserved.length - 1];
    expect(removedCategory).toBeDefined();
    const withoutRemovedCategory = new Set(observedRefusalCategories);
    withoutRemovedCategory.delete(removedCategory);
    expect(findUncoveredRefusalCategories(allRefusalCategories, withoutRemovedCategory)).toEqual([
      removedCategory,
    ]);
    expect(PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.size).toBe(2);
  });

  it("Goal054 §7 — vacuidade não é aceita como prova: cada FORMA, cada CLASSE de laço e cada DOMÍNIO do vocabulário tem contagem maior que zero na árvore real ou comportamento exercido por fonte sintética, e presentes mais ausentes igualam o vocabulário declarado", () => {
    const realFindings = findDiscardEnumerationFindings(realDiscardOccurrences);

    // Fonte sintética ÚNICA que povoa o que a árvore real não tem: as duas
    // formas ausentes (`nested-function-return`, `switch-break`) e as duas
    // classes ausentes (`for-in`, `do-while`).
    const syntheticSource = [
      "function scanControleVacuidade(registro, limite, candidatos) {",
      "  for (const chave in registro) {",
      "    if (!chave) continue;",
      "  }",
      "  let i = 0;",
      "  do {",
      "    i += 1;",
      "    continue;",
      "  } while (i < limite);",
      "  for (const candidato of candidatos) {",
      "    switch (candidato.tipo) {",
      '      case "a":',
      "        break;",
      "      default:",
      "        candidato.visto = true;",
      "    }",
      "    const avaliar = () => {",
      "      return candidato.valor;",
      "    };",
      "    avaliar();",
      "  }",
      "}",
      "",
    ].join("\n");
    const syntheticFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(syntheticSource, "sintetico-wu06-vacuidade.ts"),
    );
    expect(syntheticFindings.unresolved).toEqual([]);
    expect(syntheticFindings.outsideVocabulary).toEqual([]);

    // FORMAS: presentes na árvore real com contagem, ausentes exercidas pela
    // fonte sintética com contagem — e a união é o vocabulário declarado.
    const formsPresentInRealTree = [...DISCARD_FORMS].filter(
      (form) => (realFindings.byForm[form] ?? 0) > 0,
    );
    const formsAbsentFromRealTree = [...DISCARD_FORMS].filter(
      (form) => realFindings.byForm[form] === undefined,
    );
    expect([...formsPresentInRealTree].sort()).toEqual(
      ["break", "continue", "function-early-exit"].sort(),
    );
    expect([...formsAbsentFromRealTree].sort()).toEqual(
      ["nested-function-return", "switch-break"].sort(),
    );
    for (const form of formsAbsentFromRealTree) {
      expect(syntheticFindings.byForm[form], form).toBeGreaterThan(0);
    }
    expect([...formsPresentInRealTree, ...formsAbsentFromRealTree].sort()).toEqual(
      [...DISCARD_FORMS].sort(),
    );

    // CLASSES de laço: mesma prova, mesma conta.
    const loopFormsPresent = [...DISCARD_LOOP_FORMS].filter(
      (loopForm) => (realFindings.byLoopForm[loopForm] ?? 0) > 0,
    );
    const loopFormsAbsent = [...DISCARD_LOOP_FORMS].filter(
      (loopForm) => realFindings.byLoopForm[loopForm] === undefined,
    );
    expect([...loopFormsAbsent].sort()).toEqual(["do-while", "for-in"].sort());
    for (const loopForm of loopFormsAbsent) {
      expect(syntheticFindings.byLoopForm[loopForm], loopForm).toBeGreaterThan(0);
    }
    expect([...loopFormsPresent, ...loopFormsAbsent].sort()).toEqual(
      [...DISCARD_LOOP_FORMS].sort(),
    );

    // DOMÍNIOS percorridos: `parallel-mask` é o vazio na árvore real, e é
    // exercido por fonte sintética própria — o cursor indexa só a máscara, e
    // o comprimento dela vem de uma sequência de caracteres.
    const domainsPresent = [...DISCARD_CURSOR_DOMAINS].filter(
      (domain) => (realFindings.byCursorDomain[domain] ?? 0) > 0,
    );
    const domainsAbsent = [...DISCARD_CURSOR_DOMAINS].filter(
      (domain) => realFindings.byCursorDomain[domain] === undefined,
    );
    expect(domainsAbsent).toEqual(["parallel-mask"]);
    const maskSource = [
      "function scanControleVacuidadeMascara(source: string) {",
      "  const marks = new Array<boolean>(source.length).fill(false);",
      "  for (let i = 0; i < marks.length; i += 1) {",
      "    if (marks[i]) break;",
      "  }",
      "}",
      "",
    ].join("\n");
    const maskFindings = findDiscardEnumerationFindings(
      enumerateDiscardOccurrences(maskSource, "sintetico-wu06-vacuidade.ts"),
    );
    expect(maskFindings.unresolved).toEqual([]);
    expect(maskFindings.byCursorDomain).toEqual({ "parallel-mask": 1 });
    expect([...domainsPresent, ...domainsAbsent].sort()).toEqual([...DISCARD_CURSOR_DOMAINS].sort());
  });
});

/* =========================================================================
 * Goal055 — a isenção é provada pelo que o descarte abandona.
 *
 * Até o Goal054, `resolveSilentDiscardRequirement` isentava pelo DOMÍNIO
 * (`character-sequence`/`parallel-mask`) ou pela CLASSE (`no-domain` em
 * classe não portadora) com o consequente "cada volta avança leitura, nunca
 * descarta candidato" escrito em comentário e conferido por nada. Aqui o
 * consequente vira cômputo: a REGIÃO que a ocorrência abandona
 * (`resolveDiscardAbandonedRegion`), a PRODUÇÃO do módulo
 * (`DISCARD_PRODUCING_OPERATIONS` e o fecho de `buildDiscardModuleProduction`)
 * e o eixo 5 de `resolveSilentDiscardRequirement`, que só RETIRA isenção.
 * Tudo sai de `enumerateDiscardAnalysis`, a mesma passada que já enumera,
 * classifica e resolve domínio e fronteira — nenhuma segunda varredura.
 * ========================================================================= */

/** Lista branca de posição: `arquivo:linha` de cada ocorrência em que o eixo 5 retirou a isenção, na ordem da árvore. */
function retiredExemptionLines(occurrences: readonly DiscardOccurrence[]): number[] {
  return occurrences
    .filter(
      (occurrence) =>
        occurrence.context === "code" &&
        SILENT_DISCARD_REGISTERED_FORMS.has(occurrence.form) &&
        resolveSilentDiscardRequirement(occurrence).retiredExemptionReason !== undefined,
    )
    .map((occurrence) => occurrence.line);
}

describe("Goal055 / FIX-001 (§§1–7) — a região abandonada, o vocabulário de produção, o fecho sobre as funções de módulo e o eixo 5 da exigência, computados na MESMA passada da enumeração e conferidos na árvore real", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");
  // UMA análise, compartilhada por todos os testes abaixo: a enumeração e a
  // produção que decidiu o conteúdo de cada região saem da mesma passada.
  const analysis = enumerateDiscardAnalysis(moduleSource, "http-egress-sites.ts");
  const codeOccurrences = analysis.occurrences.filter(
    (occurrence) => occurrence.context === "code",
  );
  const productionFindings = findDiscardProductionFindings(analysis.production);

  it("§2 — o vocabulário de operações produtoras é conferido nos DOIS sentidos contra a árvore real: toda operação reconhecida pertence a DISCARD_PRODUCING_OPERATIONS, cada membro tem contagem > 0, e operação reconhecida fora do vocabulário reprova nomeando arquivo:linha", () => {
    // Sentido 1: nada do que a varredura reconhece fica fora do vocabulário.
    expect(productionFindings.outsideVocabulary).toEqual([]);
    // Sentido 2: cada membro declarado tem ocorrência na árvore real, com a
    // contagem que a execução produziu — não a da sondagem.
    expect(Object.keys(productionFindings.byOperation).sort()).toEqual(
      [...DISCARD_PRODUCING_OPERATIONS].sort(),
    );
    expect(productionFindings.byOperation).toEqual({ push: 51, add: 14, set: 5 });
    expect(productionFindings.operationSiteCount).toBe(70);
    for (const operation of DISCARD_PRODUCING_OPERATIONS) {
      expect(productionFindings.byOperation[operation], operation).toBeGreaterThan(0);
      // Cada membro é membro do alfabeto que a varredura reconhece — senão
      // ele nunca seria encontrado, e a contagem acima seria vácua.
      expect(DISCARD_RECOGNIZED_INSERTION_METHODS).toContain(operation);
    }

    // Operação reconhecida FORA do vocabulário: a mesma conta reprova,
    // nomeando arquivo:linha e o trecho, e não a conta como membro.
    const outsideSource = [
      "function scanControleVocabulario(itens: string[], valor: string) {",
      "  itens.unshift(valor);",
      "  itens.push(valor);",
      "}",
      "",
    ].join("\n");
    const outside = findDiscardProductionFindings(
      enumerateDiscardAnalysis(outsideSource, "sintetico-goal055-vocabulario.ts").production,
    );
    expect(outside.outsideVocabulary).toEqual([
      'sintetico-goal055-vocabulario.ts:2: operação produtora "unshift" fora de DISCARD_PRODUCING_OPERATIONS — "itens.unshift(valor);"',
    ]);
    expect(outside.byOperation).toEqual({ push: 1 });
  });

  it("§3 — o fecho de produção é computado UMA vez sobre as funções de módulo, com contagens vindas da execução, é estável (mais uma volta não muda o conjunto), e toda produtora só pelo fecho tem caminho nomeado até uma produtora direta", () => {
    expect(productionFindings.unresolved).toEqual([]);
    expect(productionFindings.moduleFunctionCount).toBe(89);
    expect(productionFindings.directProducerCount).toBe(23);
    expect(productionFindings.producerCount).toBe(28);
    expect(productionFindings.closureOnlyProducers).toEqual([
      "discoverGoServiceHttpRequests",
      "refuseClassReferencesOutsideInstantiation",
      "siteCarriesProductProseToClientNumber",
      "splitBaseAndPathArguments",
      "staticFetchMethodOfMember",
    ]);
    expect(productionFindings.closureRounds).toBe(1);
    // Estabilidade: a MESMA função que computa uma volta, reaplicada sobre
    // o resultado, não acrescenta ninguém.
    expect(productionFindings.closureStable).toBe(true);
    expect([
      ...expandDiscardProducersOnce(
        analysis.production.calleesByCaller,
        analysis.production.producers,
      ),
    ].sort()).toEqual([...analysis.production.producers].sort());
    for (const name of productionFindings.closureOnlyProducers) {
      const path = discardProducerPath(analysis.production, name);
      expect(path, name).toBeDefined();
      expect(path![0], name).toBe(name);
      expect(path!.length, name).toBeGreaterThan(1);
      expect(analysis.production.directProducers.has(path![path!.length - 1]), name).toBe(true);
    }

    // Limite declarado do §3, ramo `calleeIsModuleFunction === false`: há
    // chamadas a destino que não é função de módulo na árvore real, e
    // NENHUM desses destinos entra no fecho.
    expect(productionFindings.nonModuleCallCount).toBeGreaterThan(0);
    for (const callee of analysis.production.nonModuleCallCounts.keys()) {
      expect(analysis.production.producers.has(callee), callee).toBe(false);
    }
  });

  it("§1 — toda ocorrência de forma que abandona laço tem região computada por casamento de delimitadores, com a evidência do fim em arquivo:linha; na árvore real nenhuma região fica não resolvida, e as formas sem região são ausentes (exercidas no controle 5)", () => {
    const regionByForm: Record<string, number> = {};
    for (const occurrence of codeOccurrences) {
      const where = `${occurrence.filePath}:${occurrence.line}`;
      expect(occurrence.unresolvedAbandonedRegionReason, where).toBeUndefined();
      if (!DISCARD_FORMS_ABANDONING_LOOP.has(occurrence.form)) {
        expect(occurrence.abandonedRegionEnd, where).toBeUndefined();
        continue;
      }
      expect(occurrence.abandonedRegionStart, where).toBeDefined();
      expect(occurrence.abandonedRegionEnd, where).toBeDefined();
      expect(occurrence.abandonedRegionStart!, where).toBeLessThanOrEqual(
        occurrence.abandonedRegionEnd!,
      );
      expect(occurrence.abandonedRegionEvidence ?? "", where).toMatch(
        /http-egress-sites\.ts:\d+/u,
      );
      expect(occurrence.abandonedRegionProduction, where).toBeDefined();
      regionByForm[occurrence.form] = (regionByForm[occurrence.form] ?? 0) + 1;
    }
    // Uma região por ocorrência que abandona laço: a partição por forma
    // reconstrói as 143 do Goal054.
    expect(regionByForm).toEqual({ continue: 120, break: 6, "function-early-exit": 17 });
    expect(
      codeOccurrences.filter((occurrence) => !DISCARD_FORMS_ABANDONING_LOOP.has(occurrence.form)),
    ).toEqual([]);
  });

  it("§4/§6 — o eixo 5 só RETIRA: ocorrência a ocorrência, quem os quatro eixos do Goal054 mandavam registrar continua exigindo; as isentas trazem as DUAS evidências; as desisentadas nomeiam arquivo:linha da produção; e as contagens do Goal054 continuam reconstruídas", () => {
    const registered = codeOccurrences.filter((occurrence) =>
      SILENT_DISCARD_REGISTERED_FORMS.has(occurrence.form),
    );
    let exemptWithFreeRegion = 0;
    let retiredByOperation = 0;
    let retiredByProducerCall = 0;
    let requiredByFourAxes = 0;
    let residue = 0;
    for (const occurrence of registered) {
      const where = `${occurrence.filePath}:${occurrence.line}`;
      const byFourAxes = resolveSilentDiscardRequirementByFourAxes(occurrence);
      const verdict = resolveSilentDiscardRequirement(occurrence);
      if (verdict.unresolvedReason !== undefined) residue += 1;
      if (byFourAxes.requires) {
        // Só retira: nada que exigia passou a ser isento.
        expect(verdict.requires, where).toBe(true);
        expect(verdict.retiredExemptionReason, where).toBeUndefined();
        requiredByFourAxes += 1;
        continue;
      }
      if (verdict.requires) {
        const first = occurrence.abandonedRegionProduction![0];
        expect(verdict.retiredExemptionReason ?? "", where).toContain(`${where}:`);
        expect(verdict.retiredExemptionReason ?? "", where).toContain(
          `http-egress-sites.ts:${first.line}`,
        );
        if (first.kind === "operation") retiredByOperation += 1;
        else retiredByProducerCall += 1;
        continue;
      }
      // Isenta: as DUAS evidências — a dos quatro eixos e a da região livre.
      expect(verdict.exemptionEvidence ?? "", where).toContain(byFourAxes.exemptionEvidence ?? "?");
      expect(verdict.exemptionEvidence ?? "", where).toContain("região abandonada");
      expect(verdict.exemptionEvidence ?? "", where).toContain(occurrence.abandonedRegionEvidence ?? "?");
      exemptWithFreeRegion += 1;
    }
    expect({
      exemptWithFreeRegion,
      retiredByOperation,
      retiredByProducerCall,
      requiredByFourAxes,
      residue,
    }).toEqual({
      exemptWithFreeRegion: 63,
      retiredByOperation: 8,
      retiredByProducerCall: 0,
      requiredByFourAxes: 72,
      residue: 0,
    });
    expect(registered).toHaveLength(143);
    // As 8 que mudaram de lado, pela posição que a execução computou: as 6
    // da sondagem mais `:1458` e `:1479`, que a sondagem não varreu.
    expect(retiredExemptionLines(analysis.occurrences)).toEqual([
      225, 228, 232, 236, 240, 1458, 1479, 2989,
    ]);

    // As contagens do Goal054 continuam reconstruídas pela MESMA conta.
    const enumeration = findDiscardEnumerationFindings(analysis.occurrences);
    expect(enumeration.unresolved).toEqual([]);
    expect(enumeration.outsideVocabulary).toEqual([]);
    expect(enumeration.byForm).toEqual({ continue: 120, break: 6, "function-early-exit": 17 });
    expect(enumeration.byCursorDomain).toEqual({
      "no-domain": 64,
      "character-sequence": 71,
      "element-collection": 8,
    });
    expect([...DISCARD_FORMS].sort()).toEqual(
      ["break", "continue", "function-early-exit", "nested-function-return", "switch-break"],
    );
  });

  it("§5 — as 8 ocorrências desisentadas estão registradas com motivo substantivo em 4 entradas novas, sem duplicar, remover ou reescrever entrada anterior, e a conta do registro fecha sem resíduo", () => {
    const silent = enumerateSilentDiscardOccurrences(moduleSource, "http-egress-sites.ts");
    const findings = findSilentDiscardFindings(silent, DOCUMENTED_SILENT_DISCARDS);
    expect(findings).toEqual({
      ambiguousKeys: [],
      unregistered: [],
      obsolete: [],
      emptyReason: [],
      unresolvedRequirement: [],
    });
    const newKeys = [
      silentDiscardKey("splitTopLevelItems", "continue;"),
      silentDiscardKey("splitTemplateLiteralParts", "continue;"),
      silentDiscardKey(
        "splitTemplateLiteralParts",
        "if (depth !== 0) return undefined;",
        "function-early-exit",
      ),
      silentDiscardKey("findTopLevelMethodBodies", "continue;"),
    ];
    for (const key of newKeys) {
      const entry = DOCUMENTED_SILENT_DISCARDS.get(key);
      expect(entry, key).toBeDefined();
      // Substantivo: nomeia a produção abandonada por `arquivo:linha` curto
      // (`:<linha>`), não só um adjetivo.
      expect(entry!.reason, key).toMatch(/:\d+/u);
      expect(entry!.reason.length, key).toBeGreaterThan(200);
    }
    const retired = silent.filter((occurrence) => occurrence.retiredExemptionReason !== undefined);
    expect(retired.map((occurrence) => occurrence.line)).toEqual([
      225, 228, 232, 236, 240, 1458, 1479, 2989,
    ]);
    expect(new Set(retired.map((occurrence) => occurrence.key))).toEqual(new Set(newKeys));
    // 53 entradas do Goal054 + 4 novas.
    expect(DOCUMENTED_SILENT_DISCARDS.size).toBe(57);
  });

  it("§7 — vacuidade não é aceita como prova: cada ramo novo tem contagem > 0 na árvore real, ou é asserido AUSENTE nela e exercido por fonte sintética; presentes mais ausentes igualam a lista de ramos declarada", () => {
    const registered = codeOccurrences.filter((occurrence) =>
      SILENT_DISCARD_REGISTERED_FORMS.has(occurrence.form),
    );
    const verdicts = registered.map((occurrence) => ({
      occurrence,
      verdict: resolveSilentDiscardRequirement(occurrence),
    }));
    const real: Record<string, number> = {
      "região-continue": codeOccurrences.filter(
        (occurrence) => occurrence.form === "continue" && occurrence.abandonedRegionEnd !== undefined,
      ).length,
      "região-break": codeOccurrences.filter(
        (occurrence) => occurrence.form === "break" && occurrence.abandonedRegionEnd !== undefined,
      ).length,
      "região-function-early-exit": codeOccurrences.filter(
        (occurrence) =>
          occurrence.form === "function-early-exit" && occurrence.abandonedRegionEnd !== undefined,
      ).length,
      "sem-região-switch-break": codeOccurrences.filter(
        (occurrence) => occurrence.form === "switch-break",
      ).length,
      "sem-região-nested-function-return": codeOccurrences.filter(
        (occurrence) => occurrence.form === "nested-function-return",
      ).length,
      "região-não-resolvida": codeOccurrences.filter(
        (occurrence) => occurrence.unresolvedAbandonedRegionReason !== undefined,
      ).length,
      "produção-direta-na-região": verdicts.filter(
        ({ occurrence, verdict }) =>
          verdict.retiredExemptionReason !== undefined &&
          occurrence.abandonedRegionProduction?.[0]?.kind === "operation",
      ).length,
      "produção-por-fecho-na-região": verdicts.filter(
        ({ occurrence, verdict }) =>
          verdict.retiredExemptionReason !== undefined &&
          occurrence.abandonedRegionProduction?.[0]?.kind === "producer-call",
      ).length,
      "produtora-só-pelo-fecho": productionFindings.closureOnlyProducers.length,
      "fecho-estável": productionFindings.closureStable ? 1 : 0,
      "isenção-com-duas-evidências": verdicts.filter(
        ({ occurrence, verdict }) =>
          !verdict.requires &&
          DISCARD_FORMS_ABANDONING_LOOP.has(occurrence.form) &&
          (verdict.exemptionEvidence ?? "").includes("região abandonada"),
      ).length,
      "isenção-retirada": verdicts.filter(
        ({ verdict }) => verdict.retiredExemptionReason !== undefined,
      ).length,
    };
    const present = Object.keys(real).filter((branch) => real[branch] > 0).sort();
    const absent = Object.keys(real).filter((branch) => real[branch] === 0).sort();
    expect(present).toEqual([
      "fecho-estável",
      "isenção-com-duas-evidências",
      "isenção-retirada",
      "produtora-só-pelo-fecho",
      "produção-direta-na-região",
      "região-break",
      "região-continue",
      "região-function-early-exit",
    ].sort());
    expect(absent).toEqual([
      "produção-por-fecho-na-região",
      "região-não-resolvida",
      "sem-região-nested-function-return",
      "sem-região-switch-break",
    ].sort());

    // Os ramos AUSENTES na árvore real, exercidos pela MESMA análise sobre
    // fonte sintética única.
    const syntheticSource = [
      "function registrarVacuidade(itens: string[], valor: string) {",
      "  itens.push(valor);",
      "}",
      "function scanVacuidade(texto: string) {",
      "  const itens: string[] = [];",
      "  for (let i = 0; i < texto.length; i += 1) {",
      "    if (texto[i] === \" \") continue;",
      "    registrarVacuidade(itens, texto[i]);",
      "    const ler = () => {",
      "      return texto[i];",
      "    };",
      "    switch (ler()) {",
      "      case \"a\":",
      "        break;",
      "    }",
      "  }",
      "  return itens;",
      "}",
      "",
    ].join("\n");
    const synthetic = enumerateDiscardAnalysis(syntheticSource, "sintetico-goal055-vacuidade.ts");
    const byForm = (form: DiscardForm) =>
      synthetic.occurrences.filter((occurrence) => occurrence.form === form);
    expect(byForm("switch-break")).toHaveLength(1);
    expect(byForm("switch-break")[0].abandonedRegionEnd).toBeUndefined();
    expect(byForm("nested-function-return")).toHaveLength(1);
    expect(byForm("nested-function-return")[0].abandonedRegionEnd).toBeUndefined();
    const [viaClosure] = byForm("continue");
    expect(viaClosure.abandonedRegionProduction?.[0]?.kind).toBe("producer-call");
    expect(resolveSilentDiscardRequirement(viaClosure).retiredExemptionReason).toContain(
      "registrarVacuidade",
    );
    const unresolvedSource = [
      "function duplicadaVacuidade() {}",
      "function duplicadaVacuidade() {}",
      "function scanVacuidadeResiduo(texto: string) {",
      "  for (let i = 0; i < texto.length; i += 1) {",
      "    if (texto[i] === \" \") continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const unresolvedOccurrences = enumerateDiscardAnalysis(
      unresolvedSource,
      "sintetico-goal055-vacuidade.ts",
    ).occurrences;
    expect(
      unresolvedOccurrences.filter(
        (occurrence) => occurrence.unresolvedAbandonedRegionReason !== undefined,
      ),
    ).toHaveLength(1);
  });
});

describe("Goal055 / FIX-001 (§10) — controles negativos: as dez amarras do eixo da região abandonada mordem, cada uma chamando a MESMA conta que o teste permanente chama, com as duas saídas", () => {
  const supportModulePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../support/http-egress-sites.ts",
  );
  const moduleSource = readFileSync(supportModulePath, "utf8");
  const realAnalysis = enumerateDiscardAnalysis(moduleSource, "http-egress-sites.ts");
  const realSilentOccurrences = enumerateSilentDiscardOccurrences(
    moduleSource,
    "http-egress-sites.ts",
  );
  const onlyOccurrence = (source: string, filePath: string, form: DiscardForm) => {
    const found = enumerateDiscardAnalysis(source, filePath).occurrences.filter(
      (occurrence) => occurrence.form === form,
    );
    expect(found, `${filePath}: uma ocorrência de ${form}`).toHaveLength(1);
    return found[0] as DiscardOccurrence;
  };

  it("controle 1 (§10.1) — `continue` em laço de caractere cuja região contém `.push(` EXIGE registro nomeando a operação e a linha; o MESMO laço sem o `push` é isento, com as duas evidências", () => {
    const withPush = [
      "function scanControle1(texto: string) {",
      "  const itens: string[] = [];",
      "  for (let i = 0; i < texto.length; i += 1) {",
      "    if (texto[i] === \" \") continue;",
      "    itens.push(texto[i]);",
      "  }",
      "  return itens;",
      "}",
      "",
    ].join("\n");
    const withoutPush = withPush.replace("    itens.push(texto[i]);", "    const atual = texto[i];");

    // Saída 1 — com produção na região: os quatro eixos isentavam; o eixo 5
    // retira, nomeando a ocorrência e a operação produtora.
    const produces = onlyOccurrence(withPush, "sintetico-goal055-c1.ts", "continue");
    expect(produces.cursorDomain).toBe("character-sequence");
    expect(resolveSilentDiscardRequirementByFourAxes(produces).requires).toBe(false);
    const retired = resolveSilentDiscardRequirement(produces);
    expect(retired.requires).toBe(true);
    expect(retired.unresolvedReason).toBeUndefined();
    expect(retired.retiredExemptionReason).toContain("sintetico-goal055-c1.ts:4:");
    expect(retired.retiredExemptionReason).toContain(
      'a operação produtora `.push(` em sintetico-goal055-c1.ts:5 — "itens.push(texto[i]);"',
    );
    // E a conta do registro acusa a ocorrência como não registrada.
    expect(
      findSilentDiscardFindings(
        enumerateSilentDiscardOccurrences(withPush, "sintetico-goal055-c1.ts"),
        DOCUMENTED_SILENT_DISCARDS,
      ).unregistered,
    ).toEqual(['4: "if (texto[i] === " ") continue;"']);

    // Saída 2 — sem produção: isenta, com a evidência do domínio E a da
    // região livre, que nomeia a extensão em arquivo:linha.
    const free = onlyOccurrence(withoutPush, "sintetico-goal055-c1.ts", "continue");
    const exempt = resolveSilentDiscardRequirement(free);
    expect(exempt.requires).toBe(false);
    expect(exempt.exemptionEvidence).toContain(
      resolveSilentDiscardRequirementByFourAxes(free).exemptionEvidence ?? "?",
    );
    expect(exempt.exemptionEvidence).toContain(
      "e a região abandonada, de sintetico-goal055-c1.ts:4 até o fim — o corpo do laço `for (let i = 0; i < texto.length; i += 1)` que esta ocorrência abandona vai até sintetico-goal055-c1.ts:6 —, não contém operação de DISCARD_PRODUCING_OPERATIONS nem chamada a função de módulo produtora",
    );
    expect(
      findSilentDiscardFindings(
        enumerateSilentDiscardOccurrences(withoutPush, "sintetico-goal055-c1.ts"),
        DOCUMENTED_SILENT_DISCARDS,
      ).unregistered,
    ).toEqual([]);
  });

  it("controle 2 (§10.2) — a região que chama função de módulo PRODUTORA exige registro; chamar função de módulo NÃO produtora, método de string ou construtor global deixa a região livre — o limite declarado do §3", () => {
    const template = (call: string) =>
      [
        "function registrar(itens: string[], valor: string) {",
        "  itens.push(valor);",
        "}",
        "function medir(valor: string) {",
        "  return valor.length;",
        "}",
        "function scanControle2(texto: string) {",
        "  const itens: string[] = [];",
        "  for (let i = 0; i < texto.length; i += 1) {",
        "    if (texto[i] === \" \") continue;",
        `    ${call}`,
        "  }",
        "  return itens;",
        "}",
        "",
      ].join("\n");

    // Saída 1 — chamada a produtora de módulo: exige, nomeando a chamada.
    const producerCall = onlyOccurrence(
      template("registrar(itens, texto[i]);"),
      "sintetico-goal055-c2.ts",
      "continue",
    );
    expect(producerCall.abandonedRegionProduction).toEqual([
      {
        kind: "producer-call",
        line: 11,
        name: "registrar",
        path: ["registrar"],
        text: "registrar(itens, texto[i]);",
      },
    ]);
    const retired = resolveSilentDiscardRequirement(producerCall);
    expect(retired.requires).toBe(true);
    expect(retired.retiredExemptionReason).toContain(
      "a chamada à função de módulo produtora `registrar` em sintetico-goal055-c2.ts:11, produtora pelo fecho registrar",
    );

    // Saída 2 — chamada a função de módulo NÃO produtora, a método de string
    // e a construtor global: nenhuma é produção, e a ocorrência continua isenta.
    for (const call of [
      "medir(texto[i]);",
      "const pedaco = texto.slice(i).trim();",
      "const marca = String(texto[i]);",
    ]) {
      const free = onlyOccurrence(template(call), "sintetico-goal055-c2.ts", "continue");
      expect(free.abandonedRegionProduction, call).toEqual([]);
      expect(resolveSilentDiscardRequirement(free).requires, call).toBe(false);
    }
  });

  it("controle 3 (§10.3) — função produtora só pelo FECHO (chama quem chama quem produz) é reconhecida, com o caminho nomeado, em tantas voltas quantas o fecho precisou, e o fecho é estável", () => {
    const source = [
      "function gravar(itens: string[]) {",
      "  itens.push(\"x\");",
      "}",
      "function intermediaria(itens: string[]) {",
      "  gravar(itens);",
      "}",
      "function externa(itens: string[]) {",
      "  intermediaria(itens);",
      "}",
      "function scanControle3(texto: string) {",
      "  const itens: string[] = [];",
      "  for (let i = 0; i < texto.length; i += 1) {",
      "    if (texto[i] === \" \") continue;",
      "    externa(itens);",
      "  }",
      "}",
      "",
    ].join("\n");
    const analysis = enumerateDiscardAnalysis(source, "sintetico-goal055-c3.ts");
    const findings = findDiscardProductionFindings(analysis.production);
    // Antes do fecho: só `gravar` produz diretamente.
    expect([...analysis.production.directProducers]).toEqual(["gravar"]);
    // Depois do fecho: as três que chegam a `gravar` por chamada.
    expect(findings.closureOnlyProducers).toEqual(["externa", "intermediaria", "scanControle3"]);
    expect(findings.closureRounds).toBe(3);
    expect(findings.closureStable).toBe(true);
    expect(discardProducerPath(analysis.production, "externa")).toEqual([
      "externa",
      "intermediaria",
      "gravar",
    ]);
    const [occurrence] = analysis.occurrences;
    expect(resolveSilentDiscardRequirement(occurrence).retiredExemptionReason).toContain(
      "produtora pelo fecho externa → intermediaria → gravar",
    );
  });

  it("controle 4 (§10.4) — `break` ROTULADO abandona até o fim do laço que o rótulo declara, não do mais interno: a produção que só existe ENTRE os dois laços o faz exigir registro, e o `break` nu no mesmo ponto, cuja região acaba no laço interno, continua isento", () => {
    const labeled = [
      "function scanControle4(texto: string) {",
      "  const itens: string[] = [];",
      "  externo: for (let i = 0; i < texto.length; i += 1) {",
      "    for (let j = i; j < texto.length; j += 1) {",
      "      if (texto[j] === \";\") break externo;",
      "    }",
      "    itens.push(texto[i]);",
      "  }",
      "  return itens;",
      "}",
      "",
    ].join("\n");
    const bare = labeled.replace("break externo;", "break;");

    const labeledBreak = onlyOccurrence(labeled, "sintetico-goal055-c4.ts", "break");
    expect(labeledBreak.abandonedRegionEvidence).toBe(
      "o corpo do laço `for (let i = 0; i < texto.length; i += 1)` que esta ocorrência abandona vai até sintetico-goal055-c4.ts:8",
    );
    expect(labeledBreak.abandonedRegionProduction?.map((entry) => entry.line)).toEqual([7]);
    expect(resolveSilentDiscardRequirement(labeledBreak).requires).toBe(true);

    const bareBreak = onlyOccurrence(bare, "sintetico-goal055-c4.ts", "break");
    expect(bareBreak.abandonedRegionEvidence).toBe(
      "o corpo do laço `for (let j = i; j < texto.length; j += 1)` que esta ocorrência abandona vai até sintetico-goal055-c4.ts:6",
    );
    expect(bareBreak.abandonedRegionProduction).toEqual([]);
    expect(resolveSilentDiscardRequirement(bareBreak).requires).toBe(false);
  });

  it("controle 5 (§10.5) — saída antecipada cuja região abandona produção exige registro; `return` de função aninhada e `break` de `switch` continuam isentos pela FORMA, sem região computada, com a evidência do Goal054", () => {
    const earlyExitSource = [
      "function scanControle5(texto: string) {",
      "  const itens: string[] = [];",
      "  for (let i = 0; i < texto.length; i += 1) {",
      "    if (texto[i] === \"#\") return itens;",
      "  }",
      "  itens.push(\"fim\");",
      "  return itens;",
      "}",
      "",
    ].join("\n");
    const earlyExit = onlyOccurrence(earlyExitSource, "sintetico-goal055-c5.ts", "function-early-exit");
    expect(earlyExit.abandonedRegionProduction?.map((entry) => entry.line)).toEqual([6]);
    expect(resolveSilentDiscardRequirementByFourAxes(earlyExit).requires).toBe(false);
    expect(resolveSilentDiscardRequirement(earlyExit).requires).toBe(true);
    // A expressão do próprio `return` executa: a mesma saída devolvendo uma
    // chamada produtora não abandona essa produção.
    const returnsProduction = onlyOccurrence(
      earlyExitSource
        .replace("  itens.push(\"fim\");\n", "")
        .replace("return itens;\n  }", "return itens.push(\"#\");\n  }"),
      "sintetico-goal055-c5.ts",
      "function-early-exit",
    );
    expect(returnsProduction.text).toBe("if (texto[i] === \"#\") return itens.push(\"#\");");
    expect(returnsProduction.abandonedRegionProduction).toEqual([]);
    expect(resolveSilentDiscardRequirement(returnsProduction).requires).toBe(false);

    const nestedSource = [
      "function scanControle5Aninhada(texto: string) {",
      "  const itens: string[] = [];",
      "  for (let i = 0; i < texto.length; i += 1) {",
      "    const ler = () => {",
      "      return texto[i];",
      "    };",
      "    itens.push(ler());",
      "  }",
      "  return itens;",
      "}",
      "",
    ].join("\n");
    const nested = onlyOccurrence(nestedSource, "sintetico-goal055-c5.ts", "nested-function-return");
    expect(nested.abandonedRegionEnd).toBeUndefined();
    expect(nested.abandonedRegionProduction).toBeUndefined();
    expect(nested.unresolvedAbandonedRegionReason).toBeUndefined();
    const nestedVerdict = resolveSilentDiscardRequirement(nested);
    expect(nestedVerdict.requires).toBe(false);
    expect(nestedVerdict.exemptionEvidence).toBe(nested.functionBoundaryEvidence);

    const switchSource = [
      "function scanControle5Switch(texto: string) {",
      "  const itens: string[] = [];",
      "  for (let i = 0; i < texto.length; i += 1) {",
      "    switch (texto[i]) {",
      "      case \"a\":",
      "        break;",
      "    }",
      "    itens.push(texto[i]);",
      "  }",
      "  return itens;",
      "}",
      "",
    ].join("\n");
    const switchBreak = onlyOccurrence(switchSource, "sintetico-goal055-c5.ts", "switch-break");
    expect(switchBreak.abandonedRegionEnd).toBeUndefined();
    expect(switchBreak.abandonedRegionProduction).toBeUndefined();
    const switchVerdict = resolveSilentDiscardRequirement(switchBreak);
    expect(switchVerdict.requires).toBe(false);
    expect(switchVerdict.exemptionEvidence).toBe(switchBreak.formExemptionEvidence);
  });

  it("controle 6 (§10.6) — região não resolvível REPROVA como resíduo nomeado em vez de isentar: produção do módulo não resolvida (nome declarado duas vezes) e ocorrência que chega sem região — as duas saídas", () => {
    const clean = [
      "function unica() {}",
      "function scanControle6(texto: string) {",
      "  for (let i = 0; i < texto.length; i += 1) {",
      "    if (texto[i] === \" \") continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const duplicated = clean.replace("function unica() {}", "function dupla() {}\nfunction dupla() {}");

    // Antes: fonte limpa, região resolvida e livre, isenta, resíduo zero.
    const before = enumerateDiscardAnalysis(clean, "sintetico-goal055-c6.ts");
    expect(findDiscardEnumerationFindings(before.occurrences).unresolved).toEqual([]);
    expect(resolveSilentDiscardRequirement(before.occurrences[0]).requires).toBe(false);

    // Depois (a): nome de função de módulo declarado duas vezes — o fecho não
    // tem escolha computável, a produção do módulo reprova, e a região de
    // toda ocorrência do arquivo fica NÃO RESOLVIDA.
    const after = enumerateDiscardAnalysis(duplicated, "sintetico-goal055-c6.ts");
    expect(findDiscardProductionFindings(after.production).unresolved).toEqual([
      "sintetico-goal055-c6.ts:2: `dupla` já foi declarada em sintetico-goal055-c6.ts:1, e o fecho de produção é indexado por nome — dois corpos com o mesmo nome não têm escolha computável",
    ]);
    const residueReason =
      "a produção do módulo que decide o conteúdo da região não foi resolvida: sintetico-goal055-c6.ts:2: `dupla` já foi declarada em sintetico-goal055-c6.ts:1, e o fecho de produção é indexado por nome — dois corpos com o mesmo nome não têm escolha computável";
    expect(findDiscardEnumerationFindings(after.occurrences).unresolved).toEqual([
      `sintetico-goal055-c6.ts:5: ${residueReason} — "if (texto[i] === " ") continue;"`,
    ]);
    const verdict = resolveSilentDiscardRequirement(after.occurrences[0]);
    expect(verdict.requires).toBe(true);
    expect(verdict.unresolvedReason).toBe(residueReason);
    expect(
      findSilentDiscardFindings(
        enumerateSilentDiscardOccurrences(duplicated, "sintetico-goal055-c6.ts"),
        DOCUMENTED_SILENT_DISCARDS,
      ).unresolvedRequirement,
    ).toEqual([`sintetico-goal055-c6.ts:5: ${residueReason} — "if (texto[i] === " ") continue;"`]);

    // Depois (b): uma ocorrência REAL isenta, corrompida para chegar sem
    // região — as duas contas reprovam, e nenhuma isenta por falta de prova.
    const realExempt = realAnalysis.occurrences.find(
      (occurrence) =>
        occurrence.context === "code" &&
        occurrence.form === "continue" &&
        !resolveSilentDiscardRequirement(occurrence).requires,
    )!;
    const withoutRegion: DiscardOccurrence = {
      ...realExempt,
      abandonedRegionEnd: undefined,
      abandonedRegionStart: undefined,
      abandonedRegionProduction: undefined,
    };
    expect(findDiscardEnumerationFindings([withoutRegion]).unresolved).toEqual([
      `http-egress-sites.ts:${realExempt.line}: a forma "continue" abandona laço e a ocorrência não traz região abandonada computada — "${realExempt.text}"`,
    ]);
    const corruptedVerdict = resolveSilentDiscardRequirement(withoutRegion);
    expect(corruptedVerdict.requires).toBe(true);
    expect(corruptedVerdict.unresolvedReason).toBe(
      'a forma "continue" abandona laço, e a isenção dos eixos 1 a 4 chegou sem região abandonada computada que a sustente',
    );
  });

  it("controle 7 (§10.7) — ocorrência que os quatro eixos mandavam registrar continua exigindo depois do eixo 5, mesmo com região LIVRE de produção: o eixo não concede isenção a ninguém — em fonte sintética e em toda a árvore real", () => {
    const source = [
      "function scanControle7(itens: string[]) {",
      "  for (const item of itens) {",
      "    if (!item) continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    const occurrence = onlyOccurrence(source, "sintetico-goal055-c7.ts", "continue");
    expect(occurrence.abandonedRegionProduction).toEqual([]);
    expect(resolveSilentDiscardRequirementByFourAxes(occurrence).requires).toBe(true);
    const verdict = resolveSilentDiscardRequirement(occurrence);
    expect(verdict.requires).toBe(true);
    expect(verdict.retiredExemptionReason).toBeUndefined();

    const stillRequired = realAnalysis.occurrences.filter(
      (candidate) =>
        candidate.context === "code" &&
        resolveSilentDiscardRequirementByFourAxes(candidate).requires,
    );
    expect(stillRequired.length).toBeGreaterThan(0);
    expect(
      stillRequired.filter((candidate) => !resolveSilentDiscardRequirement(candidate).requires),
    ).toEqual([]);
  });

  it("controle 8 (§10.8) — as entradas novas mordem como as do Goal052/054: sem a entrada, as ocorrências reprovam como não registradas; sem as ocorrências, a entrada reprova como obsoleta; motivo vazio reprova; multiplicidade errada reprova", () => {
    const key = silentDiscardKey("splitTopLevelItems", "continue;");
    const before = findSilentDiscardFindings(realSilentOccurrences, DOCUMENTED_SILENT_DISCARDS);
    expect(before.unregistered).toEqual([]);
    expect(before.obsolete).toEqual([]);

    const withoutEntry = new Map(DOCUMENTED_SILENT_DISCARDS);
    withoutEntry.delete(key);
    const missing = findSilentDiscardFindings(realSilentOccurrences, withoutEntry);
    expect(missing.unregistered).toEqual([
      '225: "continue;"',
      '228: "continue;"',
      '232: "continue;"',
      '236: "continue;"',
      '240: "continue;"',
    ]);

    expect(
      findSilentDiscardFindings(
        realSilentOccurrences.filter((occurrence) => occurrence.key !== key),
        DOCUMENTED_SILENT_DISCARDS,
      ).obsolete,
    ).toEqual([key]);

    const emptied = new Map(DOCUMENTED_SILENT_DISCARDS);
    emptied.set(key, { ...DOCUMENTED_SILENT_DISCARDS.get(key)!, reason: "  " });
    expect(findSilentDiscardFindings(realSilentOccurrences, emptied).emptyReason).toEqual([key]);

    const wrongMultiplicity = new Map(DOCUMENTED_SILENT_DISCARDS);
    wrongMultiplicity.set(key, { ...DOCUMENTED_SILENT_DISCARDS.get(key)!, multiplicity: 4 });
    expect(findSilentDiscardFindings(realSilentOccurrences, wrongMultiplicity).ambiguousKeys).toEqual([
      `chave ambígua "${key}" alcançada por 5 ocorrência(s) (linhas 225, 228, 232, 236, 240), mas multiplicidade declarada é 4`,
    ]);
  });

  it("controle 9 (§10.9) — as amarras dos Goals 052, 053 e 054 continuam mordendo depois do eixo 5: forma fora do vocabulário, domínio não resolvido, classe não resolvida e fronteira de função ausente reprovam nomeados, e as 120 de `continue` continuam idênticas", () => {
    const realFindings = findDiscardEnumerationFindings(realAnalysis.occurrences);
    expect(realFindings.byForm.continue).toBe(120);
    expect(realFindings.unresolved).toEqual([]);

    const realContinue = realAnalysis.occurrences.find(
      (occurrence) => occurrence.context === "code" && occurrence.form === "continue",
    )!;
    // Forma fora do vocabulário.
    expect(
      findDiscardEnumerationFindings([
        { ...realContinue, form: "descarte-inventado-goal055" as DiscardForm },
      ]).outsideVocabulary,
    ).toEqual([
      `http-egress-sites.ts:${realContinue.line}: forma de descarte "descarte-inventado-goal055" fora de DISCARD_FORMS — "${realContinue.text}"`,
    ]);

    // Domínio não resolvido.
    const domainSource = [
      "function scanControle9Dominio(limite) {",
      "  for (let i = 0; i < limite; i += 1) {",
      "    continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(
      findDiscardEnumerationFindings(
        enumerateDiscardOccurrences(domainSource, "sintetico-goal055-c9.ts"),
      ).unresolved,
    ).toEqual([
      'sintetico-goal055-c9.ts:3: o cursor `i` do laço `for (let i = 0; i < limite; i += 1)` não indexa valor algum no corpo, então o domínio percorrido não pode ser resolvido — "continue;"',
    ]);

    // Classe não resolvida.
    const classSource = [
      "function scanControle9Classe(candidatos) {",
      "  for (candidatos) {",
      "    continue;",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(
      findDiscardEnumerationFindings(
        enumerateDiscardOccurrences(classSource, "sintetico-goal055-c9.ts"),
      ).unresolved,
    ).toEqual([
      'sintetico-goal055-c9.ts:3: cabeçalho de `for` fora das formas reconhecidas (for-of, for-in, for indexado): "candidatos" — "continue;"',
    ]);

    // Fronteira de função ausente, numa saída antecipada real.
    const realEarlyExit = realAnalysis.occurrences.find(
      (occurrence) => occurrence.form === "function-early-exit",
    )!;
    const withoutBoundary: DiscardOccurrence = { ...realEarlyExit, functionBoundary: undefined };
    expect(findDiscardEnumerationFindings([withoutBoundary]).unresolved).toEqual([
      `http-egress-sites.ts:${realEarlyExit.line}: a forma "function-early-exit" exige fronteira de função e a ocorrência não a traz — "${realEarlyExit.text}"`,
    ]);
    expect(resolveSilentDiscardRequirement(withoutBoundary).requires).toBe(true);
  });

  it("controle 10 (§10.10) — a partição do Goal050/051 e a cobertura das 24 categorias do Goal049 continuam mordendo, com as 2 inalcançáveis descontadas pelo registro nos dois sentidos", () => {
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
    // Partição: antes limpa; depois, requisição movida para balde que a
    // categoria da origem não permite reprova nomeada.
    expect(
      findEgressPartitionFindings(egress.sites, bucketsByName)
        .entriesInBucketNotAllowedByOriginCategory,
    ).toEqual([]);
    const [movedRequest] = discovery.requests;
    expect(movedRequest).toBeDefined();
    expect(
      findEgressPartitionFindings(egress.sites, {
        ...bucketsByName,
        requests: discovery.requests.filter((request) => request !== movedRequest),
        nonTransportMemberCalls: [...discovery.nonTransportMemberCalls, movedRequest],
      }).entriesInBucketNotAllowedByOriginCategory,
    ).toHaveLength(1);

    // Cobertura: antes nenhuma órfã; depois, sem uma categoria alcançável
    // observada, a mesma conta a acusa — e as 2 inalcançáveis seguem
    // descontadas pelo registro conferido.
    const allRefusalCategories: readonly string[] = [
      ...INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES,
      ...CLASS_BINDING_REFUSAL_CATEGORIES,
      ...CLIENT_FIELD_USE_REFUSAL_CATEGORIES,
    ];
    expect(allRefusalCategories.length).toBe(24);
    expect(findUncoveredRefusalCategories(allRefusalCategories, observedRefusalCategories)).toEqual(
      [],
    );
    const reachableObserved = allRefusalCategories.filter(
      (category) =>
        !PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.has(category) &&
        observedRefusalCategories.has(category),
    );
    const removedCategory = reachableObserved[0];
    expect(removedCategory).toBeDefined();
    const withoutRemoved = new Set(observedRefusalCategories);
    withoutRemoved.delete(removedCategory);
    expect(findUncoveredRefusalCategories(allRefusalCategories, withoutRemoved)).toEqual([
      removedCategory,
    ]);
    expect(PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.size).toBe(2);
    for (const category of PROVEN_UNREACHABLE_REFUSAL_CATEGORIES.keys()) {
      expect(allRefusalCategories).toContain(category);
    }
  });
});
