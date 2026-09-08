import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import Fastify from "fastify";

import { env, requireEnv } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { AppError, toErrorMessage } from "./lib/errors.js";
import { redactSensitive } from "./lib/redact.js";
import { ChannelConnectionService } from "./modules/channel/ChannelConnectionService.js";
import { registerEvolutionWebhookRoutes } from "./modules/channel/routes/evolutionWebhook.routes.js";
import { createPostgresGraphCheckpointer } from "./modules/graph/checkpointer.js";
import { InboundEventDispatcher } from "./modules/inbox/InboundEventDispatcher.js";
import {
  inboxRetryPolicyFromEnv,
  InboxStore,
} from "./modules/inbox/InboxStore.js";
import { InboxWorker } from "./modules/inbox/InboxWorker.js";
import { registerInternalRoutes } from "./modules/internal/routes.js";
import { OutboxStore } from "./modules/outbox/OutboxStore.js";

export async function buildApp() {
  requireEnv(["DATABASE_URL"]);
  const graphCheckpointer = await createPostgresGraphCheckpointer(
    env.DATABASE_URL,
  );
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.apikey",
        "req.headers.instanceToken",
        "body.password",
        "body.token",
        "body.apiKey",
        "body.instanceToken",
        "body.credentials",
      ],
    },
    genReqId: (request) => {
      const requestId = request.headers["x-request-id"];
      return Array.isArray(requestId)
        ? requestId[0]
        : requestId || randomUUID();
    },
  });

  await app.register(cors, { origin: false });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.get("/health", async () => ({
    ok: true,
    service: "ai-orchestrator",
    provider: "evolution-go",
  }));

  app.get("/healthy", async () => ({
    ok: true,
    service: "ai-orchestrator",
    provider: "evolution-go",
  }));

  // Inbox duravel e loop de processamento no proprio processo da IA: o
  // trabalho fica no PostgreSQL do dono, sem broker novo e sem servico novo.
  const inbox = new InboxStore(prisma, inboxRetryPolicyFromEnv());
  const worker = new InboxWorker(
    inbox,
    new InboundEventDispatcher({
      prisma,
      logger: app.log,
      inbox,
      outbox: new OutboxStore(prisma),
      channelConnections: new ChannelConnectionService(prisma),
      checkpointer: graphCheckpointer,
    }),
    {
      pollIntervalMs: env.INBOX_POLL_INTERVAL_MS,
      leaseMs: env.INBOX_LEASE_SECONDS * 1000,
      groupWindowMs: env.AI_DEBOUNCE_MIN_SECONDS * 1000,
      batchLimit: env.INBOX_GROUP_BATCH_LIMIT,
      maxConcurrentConversations: env.INBOX_MAX_CONCURRENT_CONVERSATIONS,
      leaseHeartbeatMs: env.INBOX_LEASE_HEARTBEAT_SECONDS * 1000,
    },
    app.log,
  );

  await registerEvolutionWebhookRoutes(app, prisma, {
    inbox,
    onEventStored: () => worker.nudge(),
  });
  await registerInternalRoutes(app, prisma, { inbox });

  if (env.INBOX_WORKER_ENABLED) worker.start();

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        ok: false,
        error: error.message,
        code: error.code,
        details: redactSensitive(error.details),
        requestId: request.id,
      });
    }

    app.log.error({ err: toErrorMessage(error) }, "Unhandled request error");
    return reply.code(500).send({
      ok: false,
      error: "Internal server error",
      requestId: request.id,
    });
  });

  app.addHook("onClose", async () => {
    await worker.stop();
    await graphCheckpointer.end();
    await prisma.$disconnect();
  });

  return app;
}
