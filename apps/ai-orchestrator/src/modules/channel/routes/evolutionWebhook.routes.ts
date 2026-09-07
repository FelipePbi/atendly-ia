import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { env } from "../../../config/env.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { channelMessageLogContext } from "../../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../../lib/errors.js";
import { redactSensitive } from "../../../lib/redact.js";
import { AssistantService } from "../../assistant/assistant.service.js";
import { PrismaGraphRuntime } from "../../graph/graph-runtime.js";
import { HandoffService } from "../../handoff/HandoffService.js";
import { IdempotencyStore } from "../../idempotency/IdempotencyStore.js";
import { OpenAIEmbeddingProvider } from "../../knowledge/embedding-provider.js";
import { PGVectorKnowledgeStore } from "../../knowledge/pgvector-knowledge-store.js";
import { SchedulingClient } from "../../scheduling-service/client.js";
import { AssistantToolRegistry } from "../../tools/assistant-tools.js";
import {
  inspectEvolutionInboundPayload,
  mapEvolutionInbound,
} from "../adapters/evolution/EvolutionInboundMapper.js";
import {
  type EvolutionInstanceCredential,
  EvolutionProvider,
} from "../adapters/evolution/EvolutionProvider.js";
import { ChannelConnectionService } from "../ChannelConnectionService.js";
import { InboundMessageProcessor } from "../InboundMessageProcessor.js";

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

      // Saneamento antes de qualquer mapeamento: o payload que segue adiante —
      // e que termina em `rawPayload` de Message/ProcessedEvent — já não
      // carrega token, apikey nem authorization. Nada aqui é tratado como
      // autoridade: `instanceToken` no corpo é descartado junto.
      const payload = redactSensitive(request.body);
      const inspection = inspectEvolutionInboundPayload(payload);
      const mappedMessage = mapEvolutionInbound(payload);
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

      const { message, connection } =
        await channelConnections.resolveEvolutionInboundContext({
          message: mappedMessage,
          requestId: request.id,
        });
      const processor = buildInboundMessageProcessor({
        app,
        prisma,
        tenantId: message.tenantId,
        channelId: message.channelId,
        instanceId: message.instanceId,
        // Resolução preguiçosa, no momento do envio. Recepção e persistência
        // não dependem do estado da projeção da credencial: um vínculo ainda
        // não reprovisionado — `credentialVersion` 0 logo após a migration —
        // grava a mensagem do cliente normalmente e só falha ao responder, com
        // erro explícito e logado. Um token adulterado no corpo do evento
        // continua sem influência sobre o que é usado para responder.
        instanceToken: () =>
          channelConnections.resolveChannelCredential(connection),
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

      void processor
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

export function buildInboundMessageProcessor(input: {
  app: FastifyInstance;
  prisma: PrismaClient;
  tenantId: string;
  channelId: string;
  instanceId: string;
  instanceToken: EvolutionInstanceCredential;
  checkpointer?: BaseCheckpointSaver;
}) {
  const knowledge = new PGVectorKnowledgeStore(
    input.prisma,
    new OpenAIEmbeddingProvider(),
    env.KNOWLEDGE_SEARCH_MIN_SCORE,
  );
  const tools = new AssistantToolRegistry(
    input.prisma,
    new SchedulingClient(),
    knowledge,
  );
  const assistant = new AssistantService(
    input.prisma,
    input.app.log,
    undefined,
    tools,
  );
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
  return new InboundMessageProcessor(
    assistant,
    provider,
    idempotency,
    handoff,
    input.app.log,
    {
      runtime,
      knowledge,
      checkpointer: input.checkpointer,
    },
  );
}

function isValidWebhookToken(request: FastifyRequest): boolean {
  if (!env.EVOLUTION_WEBHOOK_TOKEN) return false;

  const query = request.query as Record<string, string | undefined>;
  return query.token === env.EVOLUTION_WEBHOOK_TOKEN;
}
