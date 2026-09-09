import { randomUUID } from "node:crypto";

import Fastify from "fastify";

import { env } from "../config/env.js";
import {
  disconnectPrisma,
  getPrisma,
} from "../infrastructure/database/prisma.js";
import { AutoCompleteLoop } from "../modules/appointments/auto-complete-loop.js";
import { registerCalendarRoutes } from "../modules/calendar/routes.js";
import { registerManagementRoutes } from "../modules/internal-api/routes.js";
import { AppError, toErrorMessage } from "../shared/errors/app-error.js";
import { registerHealthRoute } from "./health.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.apikey",
        "body.password",
        "body.token",
        "body.apiKey",
        "body.credentials",
        "body.integrationCredentials",
      ],
    },
    genReqId: (request) => {
      const requestId = request.headers["x-request-id"];
      return Array.isArray(requestId)
        ? requestId[0]
        : requestId || randomUUID();
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  await registerHealthRoute(app);
  await registerCalendarRoutes(app);
  await registerManagementRoutes(app);

  // Conclusao automatica (Goal008, D-008): loop no proprio processo, sem
  // fila nem servico novo. Desligavel por variavel para operacao e para a
  // suite de integracao que precisa do relogio do banco parado no cenario.
  const autoCompleteLoop = new AutoCompleteLoop(
    getPrisma(),
    {
      pollIntervalMs: env.CALENDAR_AUTO_COMPLETE_POLL_INTERVAL_MS,
      graceMinutes: env.CALENDAR_AUTO_COMPLETE_GRACE_MINUTES,
    },
    app.log,
  );
  if (env.CALENDAR_AUTO_COMPLETE_ENABLED) autoCompleteLoop.start();

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        requestId: request.id,
      });
    }

    app.log.error({ err: toErrorMessage(error) }, "Unhandled request error");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
      requestId: request.id,
    });
  });

  app.addHook("onClose", async () => {
    await autoCompleteLoop.stop();
    await disconnectPrisma();
  });

  return app;
}
