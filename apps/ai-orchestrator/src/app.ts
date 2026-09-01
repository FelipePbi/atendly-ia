import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import Fastify from "fastify";

import { env, requireEnv } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { AppError, toErrorMessage } from "./lib/errors.js";
import { redactSensitive } from "./lib/redact.js";
import { registerEvolutionWebhookRoutes } from "./modules/channel/routes/evolutionWebhook.routes.js";
import { createPostgresGraphCheckpointer } from "./modules/graph/checkpointer.js";
import { registerInternalRoutes } from "./modules/internal/routes.js";

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

  await registerEvolutionWebhookRoutes(app, prisma, graphCheckpointer);
  await registerInternalRoutes(app, prisma);

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
    await graphCheckpointer.end();
    await prisma.$disconnect();
  });

  return app;
}
