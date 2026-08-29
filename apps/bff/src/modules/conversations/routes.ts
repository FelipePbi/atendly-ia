import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { AppError } from "../../lib/errors.js";
import {
  dataResponse,
  parseBody,
  parseParams,
  parseQuery,
} from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });
const querySchema = z.object({
  status: z.enum(["ACTIVE", "HUMAN_HANDOFF", "CLOSED"]).optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const messageSchema = z.object({ text: z.string().trim().min(1).max(4_000) });

export async function registerV1ConversationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const ai = new AiOrchestratorClient();

  app.get(
    "/v1/conversations",
    { preHandler: requireTenantContext },
    async (request) => {
      const query = parseQuery(querySchema, request.query);
      return dataResponse(
        request,
        await ai.listConversations(internalContext(request), query),
      );
    },
  );

  app.get(
    "/v1/conversations/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await ai.getConversation(internalContext(request), id),
      );
    },
  );

  app.get(
    "/v1/conversations/:id/messages",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await ai.listMessages(internalContext(request), id),
      );
    },
  );

  app.post(
    "/v1/conversations/:id/messages",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const { id } = parseParams(idSchema, request.params);
      const body = parseBody(messageSchema, request.body);
      const tenant = currentTenantContext(request);
      const instance = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: tenant.userId },
      });
      if (!instance || instance.status !== "CONNECTED") {
        throw new AppError("CONFLICT", "WhatsApp is not connected.", 409);
      }
      const message = await ai.sendMessage(internalContext(request), id, {
        text: body.text,
        instanceToken: instance.evolutionInstanceToken,
      });
      return reply.code(201).send(dataResponse(request, message));
    },
  );

  for (const action of ["takeover", "release", "resolve"] as const) {
    app.post(
      `/v1/conversations/:id/${action}`,
      { preHandler: requireTenantContext },
      async (request) => {
        const { id } = parseParams(idSchema, request.params);
        const context = internalContext(request);
        const conversation =
          action === "takeover"
            ? await ai.takeover(context, id)
            : action === "release"
              ? await ai.release(context, id)
              : await ai.resolve(context, id);
        return dataResponse(request, conversation);
      },
    );
  }
}
