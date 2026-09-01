import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
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
        tone: config?.tone ?? message.aiSettings?.tone ?? "LIGHT_CLOSE",
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
      select: { status: true, humanHandoff: true },
    });
    if (!conversation) {
      throw new Error("Conversation was not found for LangGraph execution.");
    }
    return conversation;
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
