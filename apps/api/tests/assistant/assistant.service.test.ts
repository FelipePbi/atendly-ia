import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AssistantService } from "../../src/modules/assistant/assistant.service.js";
import { DEFAULT_BUSINESS_SETTINGS } from "../../src/modules/business-settings/business-settings.js";

const phone = "5511999999999";

describe("AssistantService conversational decisions", () => {
  it("answers a first generic greeting without calling the model or offering services", async () => {
    const { prisma, store } = createPrismaMock();
    const openAi = { createResponse: vi.fn() };
    const assistant = new AssistantService(prisma, undefined, openAi as never);

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Oi",
      businessSettings: configuredBusinessSettings()
    });

    expect(reply.text).toBe("Oii, tudo bem? Como posso te ajudar hoje?");
    expect(openAi.createResponse).not.toHaveBeenCalled();
    expect(store.state.aiConversation).toMatchObject({
      stage: "QUALIFYING_CONTACT",
      classification: "unknown"
    });
    expect(store.state.aiDecisionLogs[0]).toMatchObject({
      action: "send_message",
      promptVersion: "scheduling_v1.0.0"
    });
  });

  it("introduces a separate female assistant on the first automatic reply", async () => {
    const { prisma } = createPrismaMock();
    const openAi = { createResponse: vi.fn() };
    const assistant = new AssistantService(prisma, undefined, openAi as never);

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Oi",
      businessSettings: configuredBusinessSettings(),
      virtualAttendantSettings: {
        aiEnabled: true,
        identityMode: "SEPARATE_ASSISTANT",
        assistantName: "Bea",
        assistantSex: "FEMALE",
        personaType: "WARM",
        customInstructions: "",
        activationMode: "ALWAYS",
        awayTimeoutMinutes: null,
        awayScope: null,
        customPersonaStatus: "NOT_STARTED",
        customPersonaProfile: null
      }
    });

    expect(reply.text).toBe(
      "Oii, sou a Bea, atendente pessoal da Camili Krauser Beauty.\n\nOii, tudo bem? Como posso te ajudar hoje?"
    );
    expect(openAi.createResponse).not.toHaveBeenCalled();
  });

  it("introduces a separate male corporate assistant with a formal greeting", async () => {
    const { prisma } = createPrismaMock();
    const openAi = { createResponse: vi.fn() };
    const assistant = new AssistantService(prisma, undefined, openAi as never);

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Olá",
      businessSettings: configuredBusinessSettings(),
      virtualAttendantSettings: {
        aiEnabled: true,
        identityMode: "SEPARATE_ASSISTANT",
        assistantName: "Leo",
        assistantSex: "MALE",
        personaType: "CORPORATE",
        customInstructions: "",
        activationMode: "ALWAYS",
        awayTimeoutMinutes: null,
        awayScope: null,
        customPersonaStatus: "NOT_STARTED",
        customPersonaProfile: null
      }
    });

    expect(reply.text).toBe(
      "Olá, sou o Leo, atendente pessoal da Camili Krauser Beauty.\n\nOlá, tudo bem? Como posso te ajudar hoje?"
    );
    expect(openAi.createResponse).not.toHaveBeenCalled();
  });

  it("introduces a separate assistant when resuming after an owner message", async () => {
    const { prisma, store } = createPrismaMock();
    store.messages.push({
      id: "owner-message-1",
      conversationId: store.conversation.id,
      direction: "OUTBOUND",
      source: "OWNER",
      role: "assistant",
      body: "Oi Maria, pode me mandar o horário que você prefere?",
      createdAt: new Date(Date.UTC(2026, 5, 4, 12, 0))
    });
    const openAi = {
      createResponse: vi.fn().mockResolvedValue({
        id: "response-1",
        output_text: JSON.stringify({
          action: "send_message",
          messages: ["Claro, consigo te ajudar com isso."],
          conversationStage: "GENERAL_CONVERSATION",
          classification: "potential_customer",
          confidence: 0.9
        })
      })
    };
    const assistant = new AssistantService(prisma, undefined, openAi as never);

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Pode ser amanhã?",
      businessSettings: configuredBusinessSettings(),
      virtualAttendantSettings: {
        aiEnabled: true,
        identityMode: "SEPARATE_ASSISTANT",
        assistantName: "Bea",
        assistantSex: "FEMALE",
        personaType: "WARM",
        customInstructions: "",
        activationMode: "ALWAYS",
        awayTimeoutMinutes: null,
        awayScope: null,
        customPersonaStatus: "NOT_STARTED",
        customPersonaProfile: null
      }
    });

    expect(reply.text).toBe(
      "Oii, sou a Bea, atendente pessoal da Camili Krauser Beauty.\n\nClaro, consigo te ajudar com isso."
    );
  });

  it("pauses the chat for supplier-like messages without calling the model", async () => {
    const { prisma, store } = createPrismaMock();
    const openAi = { createResponse: vi.fn() };
    const assistant = new AssistantService(prisma, undefined, openAi as never);

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Oi, aqui e da distribuidora. Chegou o pedido dos produtos?",
      businessSettings: configuredBusinessSettings()
    });

    expect(reply.text).toBe("Oi! Vou deixar essa mensagem para a equipe verificar e te responder direitinho, ta bom?");
    expect(openAi.createResponse).not.toHaveBeenCalled();
    expect(store.conversation).toMatchObject({
      humanHandoff: true,
      status: "HUMAN_HANDOFF"
    });
    expect(store.handoffs).toEqual([
      expect.objectContaining({
        reason: "supplier_or_partner",
        phone
      })
    ]);
    expect(store.state.aiConversation).toMatchObject({
      aiEnabledForChat: false,
      stage: "AI_PAUSED",
      classification: "supplier_or_partner"
    });
  });

  it("persists multi-service appointment draft totals from a structured AI decision", async () => {
    const { prisma, store } = createPrismaMock();
    const openAi = {
      createResponse: vi.fn().mockResolvedValue({
        id: "response-1",
        output_text: JSON.stringify({
          action: "update_appointment_draft",
          messages: [
            "Perfeito, cilios + sobrancelha fica R$ 220,00 no total.",
            "Se comecar as 14:00, termina por volta de 16:30. Posso confirmar esse horario pra voce?"
          ],
          appointmentDraftPatch: {
            services: [
              {
                serviceId: 1,
                name: "Extensao de cilios",
                durationMinutes: 120,
                price: 180
              },
              {
                serviceId: 2,
                name: "Design de sobrancelha",
                durationMinutes: 30,
                price: 40
              }
            ],
            selectedStartDateTime: "2026-08-12T14:00:00-03:00",
            status: "waiting_confirmation"
          },
          conversationStage: "CONFIRMING_APPOINTMENT",
          classification: "potential_customer",
          confidence: 0.94
        })
      })
    };
    const assistant = new AssistantService(prisma, undefined, openAi as never);

    const reply = await assistant.handleIncomingText({
      phone,
      text: "Quero fazer cilios e sobrancelha amanha as 14h",
      businessSettings: configuredBusinessSettings()
    });

    expect(reply.text).toContain("cilios + sobrancelha");
    expect(store.state.appointmentDraft).toMatchObject({
      customerPhone: phone,
      totalDurationMinutes: 150,
      totalPrice: 220,
      selectedEndDateTime: "2026-08-12T19:30:00.000Z",
      status: "waiting_confirmation"
    });
    expect(store.state.conversationMemory.knownCustomerInfo.interestedServices).toEqual([
      "Extensao de cilios",
      "Design de sobrancelha"
    ]);
  });
});

function createPrismaMock() {
  const store = {
    state: {} as Record<string, any>,
    conversation: {
      id: "conversation-1",
      whatsappPhone: phone,
      customerName: null as string | null,
      humanHandoff: false,
      status: "ACTIVE",
      handoffPausedUntil: null as Date | null
    },
    messages: [] as Array<{
      id: string;
      conversationId: string;
      direction: "INBOUND" | "OUTBOUND";
      source?: "CUSTOMER" | "AI" | "OWNER" | null;
      role: string;
      body: string;
      createdAt: Date;
    }>,
    handoffs: [] as unknown[]
  };

  let messageCounter = 0;
  const prisma = {
    conversation: {
      upsert: async (args: any) => {
        store.conversation = {
          ...store.conversation,
          customerName: args.update.customerName ?? store.conversation.customerName,
          humanHandoff: args.update.humanHandoff ?? store.conversation.humanHandoff,
          status: args.update.status ?? store.conversation.status,
          handoffPausedUntil: args.update.handoffPausedUntil ?? store.conversation.handoffPausedUntil
        };
        return { ...store.conversation, state: store.state };
      },
      findUnique: async () => ({ ...store.conversation, state: store.state }),
      update: async (args: any) => {
        if (args.data.state) store.state = args.data.state;
        store.conversation = {
          ...store.conversation,
          humanHandoff: args.data.humanHandoff ?? store.conversation.humanHandoff,
          status: args.data.status ?? store.conversation.status,
          handoffPausedUntil: args.data.handoffPausedUntil ?? store.conversation.handoffPausedUntil
        };
        return { ...store.conversation, state: store.state };
      }
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
          createdAt: new Date(Date.UTC(2026, 5, 4, 12, messageCounter))
        };
        store.messages.push(message);
        return message;
      },
      findMany: async () => [...store.messages].reverse(),
      update: async (args: any) => {
        const message = store.messages.find((item) => item.id === args.where.id);
        return { ...message, ...args.data };
      }
    },
    toolCall: {
      create: vi.fn(),
      update: vi.fn()
    },
    handoff: {
      create: async (args: any) => {
        store.handoffs.push(args.data);
        return { id: `handoff-${store.handoffs.length}`, ...args.data };
      }
    }
  } as unknown as PrismaClient;

  return { prisma, store };
}

function configuredBusinessSettings() {
  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    businessName: "Camili Krauser Beauty",
    configured: true
  };
}
