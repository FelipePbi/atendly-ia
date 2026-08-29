import { randomUUID } from "node:crypto";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { env } from "./config/env.js";
import { AppError, toErrorMessage } from "./lib/errors.js";
import { redactRequestUrl } from "./lib/logging.js";
import { disconnectPrisma } from "./lib/prisma.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIgnoredContactsRoutes } from "./routes/ignored-contacts.js";
import { registerOnboardingRoutes } from "./routes/onboarding.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerWhatsAppRoutes } from "./routes/whatsapp.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "body.password",
        "body.currentPassword",
        "body.newPassword",
      ],
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: redactRequestUrl(request.url),
            host: request.headers.host,
            remoteAddress: request.socket?.remoteAddress,
            remotePort: request.socket?.remotePort,
          };
        },
      },
    },
    genReqId: (request) => {
      const header = request.headers["x-request-id"];
      return Array.isArray(header) ? header[0] : header || randomUUID();
    },
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: env.FRONTEND_ORIGIN ? [env.FRONTEND_ORIGIN] : false,
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  await registerHealthRoutes(app);
  await registerWebhookRoutes(app);
  await registerAuthRoutes(app);
  await registerOnboardingRoutes(app);
  await registerWhatsAppRoutes(app);
  await registerSettingsRoutes(app);
  await registerIgnoredContactsRoutes(app);
  await registerConversationRoutes(app);

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

    if (
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 429
    ) {
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message:
            "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
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
