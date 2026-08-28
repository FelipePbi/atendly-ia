import { randomUUID } from "node:crypto";

import Fastify from "fastify";

import { disconnectPrisma } from "../infrastructure/database/prisma.js";
import { registerCalendarRoutes } from "../modules/calendar/routes.js";
import { AppError, toErrorMessage } from "../shared/errors/app-error.js";
import { registerHealthRoute } from "./health.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      redact: ["req.headers.authorization"],
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
    await disconnectPrisma();
  });

  return app;
}
