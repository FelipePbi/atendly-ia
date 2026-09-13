import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { FastifyBaseLogger } from "fastify";

import { env } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AssistantService } from "../assistant/assistant.service.js";
import { PrismaGraphRuntime } from "../graph/graph-runtime.js";
import type { OutboundGate } from "../graph/message-graph.js";
import { HandoffService } from "../handoff/HandoffService.js";
import { IdempotencyStore } from "../idempotency/IdempotencyStore.js";
import { OpenAIEmbeddingProvider } from "../knowledge/embedding-provider.js";
import { PGVectorKnowledgeStore } from "../knowledge/pgvector-knowledge-store.js";
import { CustomerMemoryService } from "../memory/customer-memory-service.js";
import { SchedulingClient } from "../scheduling-service/client.js";
import { SessionService } from "../session/SessionService.js";
import { AssistantToolRegistry } from "../tools/assistant-tools.js";
import {
  type EvolutionInstanceCredential,
  EvolutionProvider,
} from "./adapters/evolution/EvolutionProvider.js";
import { InboundMessageProcessor } from "./InboundMessageProcessor.js";

export interface InboundProcessorInput {
  logger: FastifyBaseLogger;
  prisma: PrismaClient;
  tenantId: string;
  channelId: string;
  instanceId: string;
  instanceToken: EvolutionInstanceCredential;
  checkpointer?: BaseCheckpointSaver;
  /**
   * `false` desliga o buffer em memória: quando o trabalho vem da inbox
   * durável, a janela de fragmentos já foi aplicada no claim e o `Map` deixaria
   * de ser gatilho para virar uma segunda fonte de verdade.
   */
  debounce?: false;
  outboundGate?: OutboundGate;
}

export function buildInboundMessageProcessor(input: InboundProcessorInput) {
  const knowledge = new PGVectorKnowledgeStore(
    input.prisma,
    new OpenAIEmbeddingProvider(),
    env.KNOWLEDGE_SEARCH_MIN_SCORE,
  );
  const tools = new AssistantToolRegistry(
    input.prisma,
    new SchedulingClient(),
    knowledge,
    input.logger,
  );
  const sessions = new SessionService(input.prisma);
  const customerMemory = new CustomerMemoryService(input.prisma);
  const assistant = new AssistantService(
    input.prisma,
    input.logger,
    undefined,
    tools,
    sessions,
    customerMemory,
  );
  const provider = new EvolutionProvider(
    input.logger,
    input.instanceToken,
    input.instanceId,
  );
  const idempotency = new IdempotencyStore(input.prisma);
  const handoff = new HandoffService(
    input.prisma,
    { tenantId: input.tenantId, channelId: input.channelId },
    sessions,
  );
  const runtime = new PrismaGraphRuntime(input.prisma);
  return new InboundMessageProcessor(
    assistant,
    provider,
    idempotency,
    handoff,
    input.logger,
    {
      runtime,
      knowledge,
      checkpointer: input.checkpointer,
      debounce: input.debounce,
      outboundGate: input.outboundGate,
      sessions,
      customerMemory,
    },
  );
}
