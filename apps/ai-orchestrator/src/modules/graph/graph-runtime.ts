import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import { resolveAiConversationStyle } from "../tenant-config/ai-settings.js";
import type {
  GraphConversationContext,
  GraphTenantConfig,
  GraphToolResult,
} from "./graph-state.js";

export interface GraphRuntimePort {
  resolveConversationId(message: ChannelInboundMessage): Promise<string>;
  loadTenantConfig(message: ChannelInboundMessage): Promise<{
    channelConnected: boolean;
    tenantConfig: GraphTenantConfig;
  }>;
  loadConversation(input: {
    tenantId: string;
    channelId: string;
    conversationId: string;
  }): Promise<GraphConversationContext>;
  loadToolResults(input: {
    tenantId: string;
    channelId: string;
    conversationId: string;
    invocationStartedAt: string;
  }): Promise<GraphToolResult[]>;
}

export class PrismaGraphRuntime implements GraphRuntimePort {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveConversationId(message: ChannelInboundMessage): Promise<string> {
    const conversation = await this.prisma.conversation.upsert({
      where: {
        tenantId_channelId_externalContactId: {
          tenantId: message.tenantId,
          channelId: message.channelId,
          externalContactId: message.customerPhone,
        },
      },
      update: {
        customerName: message.customerName ?? undefined,
      },
      create: {
        tenantId: message.tenantId,
        channelId: message.channelId,
        externalContactId: message.customerPhone,
        customerName: message.customerName ?? null,
        state: {},
      },
    });
    return conversation.id;
  }

  async loadTenantConfig(message: ChannelInboundMessage): Promise<{
    channelConnected: boolean;
    tenantConfig: GraphTenantConfig;
  }> {
    const [channel, config] = await Promise.all([
      this.prisma.channelConnection.findUnique({
        where: {
          tenantId_id: { tenantId: message.tenantId, id: message.channelId },
        },
        select: { tenantId: true, status: true },
      }),
      this.prisma.aiTenantConfig.findUnique({
        where: { tenantId: message.tenantId },
      }),
    ]);

    const trustedChannel = channel?.tenantId === message.tenantId;
    return {
      channelConnected: trustedChannel && channel.status === "ACTIVE",
      tenantConfig: {
        aiEnabled: config?.enabled ?? message.aiSettings?.aiEnabled ?? false,
        // Config do banco vence o payload; estilo legado ou ausente vira o
        // equilibrado antes de chegar ao grafo.
        tone: resolveAiConversationStyle(
          config?.tone ?? message.aiSettings?.tone,
        ),
        promptVersion: config?.promptVersion ?? "scheduling_v1.0.0",
      },
    };
  }

  async loadConversation(input: {
    tenantId: string;
    channelId: string;
    conversationId: string;
  }): Promise<GraphConversationContext> {
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        tenantId_channelId_id: {
          tenantId: input.tenantId,
          channelId: input.channelId,
          id: input.conversationId,
        },
      },
      select: {
        status: true,
        humanHandoff: true,
        externalContactId: true,
        contactId: true,
        state: true,
      },
    });
    if (!conversation) {
      throw new Error("Conversation was not found for LangGraph execution.");
    }
    const { state, ...rest } = conversation;
    return { ...rest, focusServiceIds: resolveFocusServiceIds(state) };
  }

  async loadToolResults(input: {
    tenantId: string;
    channelId: string;
    conversationId: string;
    invocationStartedAt: string;
  }): Promise<GraphToolResult[]> {
    const run = await this.prisma.aiRun.findFirst({
      where: {
        tenantId: input.tenantId,
        channelId: input.channelId,
        conversationId: input.conversationId,
        startedAt: { gte: new Date(input.invocationStartedAt) },
      },
      orderBy: { startedAt: "desc" },
      include: {
        toolCalls: { orderBy: { createdAt: "asc" } },
      },
    });

    return (run?.toolCalls ?? []).map((call) => ({
      name: call.name,
      status: call.status,
      result: call.result ?? undefined,
      error: call.error ?? undefined,
    }));
  }
}

/**
 * Extrai o servico em foco do `state` persistido da conversa: servicos do
 * rascunho de agendamento (`appointmentDraft`) e da acao pendente
 * (`pendingAction`), nunca texto livre. `state` e JSON de forma livre e pode
 * vir vazio, nulo ou com formato inesperado de um binario anterior.
 */
function resolveFocusServiceIds(state: unknown): string[] {
  if (!state || typeof state !== "object") return [];
  const record = state as Record<string, unknown>;
  const ids = new Set<string>();

  const draft = record.appointmentDraft;
  if (draft && typeof draft === "object") {
    const services = (draft as Record<string, unknown>).services;
    if (Array.isArray(services)) {
      for (const service of services) {
        const serviceId = (service as Record<string, unknown> | null)
          ?.serviceId;
        if (typeof serviceId === "string" || typeof serviceId === "number") {
          ids.add(String(serviceId));
        }
      }
    }
  }

  const pendingAction = record.pendingAction;
  if (pendingAction && typeof pendingAction === "object") {
    const pending = pendingAction as Record<string, unknown>;
    if (typeof pending.serviceId === "string" || typeof pending.serviceId === "number") {
      ids.add(String(pending.serviceId));
    }
    if (Array.isArray(pending.serviceIds)) {
      for (const serviceId of pending.serviceIds) {
        if (typeof serviceId === "string" || typeof serviceId === "number") {
          ids.add(String(serviceId));
        }
      }
    }
  }

  return [...ids];
}
