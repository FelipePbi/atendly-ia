import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { env } from "../../../config/env.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { channelMessageLogContext } from "../../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../../lib/errors.js";
import { AssistantService } from "../../assistant/assistant.service.js";
import { MessageOrchestrator } from "../../automation/MessageOrchestrator.js";
import { PrismaGraphRuntime } from "../../graph/graph-runtime.js";
import { HandoffService } from "../../handoff/HandoffService.js";
import { IdempotencyStore } from "../../idempotency/IdempotencyStore.js";
import {
  inspectEvolutionInboundPayload,
  mapEvolutionInbound,
} from "../adapters/evolution/EvolutionInboundMapper.js";
import { EvolutionProvider } from "../adapters/evolution/EvolutionProvider.js";
import { ChannelConnectionService } from "../ChannelConnectionService.js";

export async function registerEvolutionWebhookRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  checkpointer?: BaseCheckpointSaver,
): Promise<void> {
  const channelConnections = new ChannelConnectionService(prisma);

  app.post(
    "/webhooks/evolution",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isValidWebhookToken(request)) {
        app.log.warn(
          { requestId: request.id },
          "Evolution webhook rejected: invalid token",
        );
        return reply.code(401).send({ ok: false, error: "Unauthorized" });
      }

      const inspection = inspectEvolutionInboundPayload(request.body);
      const mappedMessage = mapEvolutionInbound(request.body);
      if (!mappedMessage) {
        app.log.warn(
          { requestId: request.id, ...inspection },
          "Evolution webhook ignored: payload did not map to inbound message",
        );
        return reply.code(400).send({
          ok: false,
          error: "Payload did not map to inbound message",
          inspection,
        });
      }

      const message = await channelConnections.resolveEvolutionInbound({
        message: mappedMessage,
        requestId: request.id,
      });
      const orchestrator = buildOrchestrator({
        app,
        prisma,
        tenantId: message.tenantId,
        channelId: message.channelId,
        instanceId: message.instanceId,
        instanceToken: readInstanceToken(request.body),
        checkpointer,
      });

      app.log.info(
        {
          requestId: request.id,
          ...channelMessageLogContext(message),
        },
        "Evolution webhook resolved to tenant channel",
      );
      reply.code(202).send({ ok: true, received: true });

      void orchestrator
        .handleInboundMessage(message)
        .then((result) => {
          app.log.info(
            {
              requestId: request.id,
              action: result.action,
              ...channelMessageLogContext(message),
            },
            "Evolution webhook processing completed",
          );
        })
        .catch((error) => {
          app.log.error(
            {
              requestId: request.id,
              err: toErrorMessage(error),
              ...channelMessageLogContext(message),
            },
            "Failed to process Evolution webhook",
          );
        });
    },
  );
}

export function buildOrchestrator(input: {
  app: FastifyInstance;
  prisma: PrismaClient;
  tenantId: string;
  channelId: string;
  instanceId: string;
  instanceToken?: string;
  checkpointer?: BaseCheckpointSaver;
}) {
  const assistant = new AssistantService(input.prisma, input.app.log);
  const provider = new EvolutionProvider(
    input.app.log,
    input.instanceToken,
    input.instanceId,
  );
  const idempotency = new IdempotencyStore(input.prisma);
  const handoff = new HandoffService(input.prisma, {
    tenantId: input.tenantId,
    channelId: input.channelId,
  });
  const runtime = new PrismaGraphRuntime(input.prisma);
  return new MessageOrchestrator(
    assistant,
    provider,
    idempotency,
    handoff,
    input.app.log,
    {
      runtime,
      checkpointer: input.checkpointer,
    },
  );
}

function isValidWebhookToken(request: FastifyRequest): boolean {
  if (!env.EVOLUTION_WEBHOOK_TOKEN) return false;

  const query = request.query as Record<string, string | undefined>;
  return query.token === env.EVOLUTION_WEBHOOK_TOKEN;
}

function readInstanceToken(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const value = (payload as Record<string, unknown>).instanceToken;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
