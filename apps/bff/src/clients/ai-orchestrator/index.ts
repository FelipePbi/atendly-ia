import { z } from "zod";

import { env } from "../../config/env.js";
import {
  InternalHttpClient,
  type InternalRequestContext,
} from "../internal-http-client.js";

const messageSchema = z.object({
  id: z.string(),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  source: z.enum(["CUSTOMER", "AI", "OWNER"]).nullable(),
  body: z.string(),
  createdAt: z.string(),
});

const conversationSchema = z.object({
  id: z.string(),
  externalContactId: z.string(),
  customerName: z.string().nullable(),
  status: z.enum(["ACTIVE", "HUMAN_HANDOFF", "CLOSED"]),
  humanHandoff: z.boolean(),
  handoffReason: z.string().nullable(),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

const envelope = <T extends z.ZodType>(schema: T) =>
  z.object({ data: schema, requestId: z.string() });

export class AiOrchestratorClient {
  private readonly http = new InternalHttpClient(
    env.AI_ORCHESTRATOR_BASE_URL,
    "ai-orchestrator",
  );

  async listConversations(
    context: InternalRequestContext,
    query: { status?: string; search?: string; limit?: number },
  ) {
    return (
      await this.http.request({
        method: "GET",
        path: "/internal/conversations",
        context,
        query,
        schema: envelope(z.array(conversationSchema)),
      })
    ).data;
  }

  async getConversation(context: InternalRequestContext, id: string) {
    return (
      await this.http.request({
        method: "GET",
        path: `/internal/conversations/${encodeURIComponent(id)}`,
        context,
        schema: envelope(conversationSchema),
      })
    ).data;
  }

  async listMessages(context: InternalRequestContext, id: string) {
    return (
      await this.http.request({
        method: "GET",
        path: `/internal/conversations/${encodeURIComponent(id)}/messages`,
        context,
        schema: envelope(z.array(messageSchema)),
      })
    ).data;
  }

  async sendMessage(
    context: InternalRequestContext,
    id: string,
    input: { text: string; instanceToken: string },
  ) {
    return (
      await this.http.request({
        method: "POST",
        path: `/internal/conversations/${encodeURIComponent(id)}/messages`,
        context,
        body: input,
        schema: envelope(messageSchema),
      })
    ).data;
  }

  async takeover(context: InternalRequestContext, id: string) {
    return this.mutateConversation(context, id, "takeover");
  }

  async release(context: InternalRequestContext, id: string) {
    return this.mutateConversation(context, id, "release");
  }

  async resolve(context: InternalRequestContext, id: string) {
    return this.mutateConversation(context, id, "resolve");
  }

  async dashboard(context: InternalRequestContext) {
    return (
      await this.http.request({
        method: "GET",
        path: "/internal/dashboard",
        context,
        schema: envelope(
          z.object({
            conversationsNeedingAttention: z.number().int().nonnegative(),
            aiAppointmentsToday: z.number().int().nonnegative(),
            automatedConversationsToday: z.number().int().nonnegative(),
          }),
        ),
      })
    ).data;
  }

  async updateTenantConfig(
    context: InternalRequestContext,
    input: unknown,
  ): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: "/internal/ai-tenant-config",
      context,
      body: input,
      schema: z.object({ ok: z.literal(true), config: z.unknown() }),
    });
  }

  async provisionEvolutionChannel(
    context: InternalRequestContext,
    input: { externalInstanceId: string; displayName?: string },
  ): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: "/internal/channel-connections/evolution",
      context,
      body: input,
      schema: z.object({ ok: z.literal(true), connection: z.unknown() }),
    });
  }

  private async mutateConversation(
    context: InternalRequestContext,
    id: string,
    action: "takeover" | "release" | "resolve",
  ) {
    return (
      await this.http.request({
        method: "POST",
        path: `/internal/conversations/${encodeURIComponent(id)}/${action}`,
        context,
        schema: envelope(conversationSchema),
      })
    ).data;
  }
}

export type { InternalRequestContext };
