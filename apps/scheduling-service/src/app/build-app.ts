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
import {
  ImportBackgroundWork,
  importWorkFailure,
} from "../modules/migrations/index.js";
import { AppError, toErrorMessage } from "../shared/errors/app-error.js";
import { registerHealthRoute } from "./health.js";

export interface BuildAppOptions {
  /** Destino do log; so os testes passam algo. Em producao o log sai no stdout. */
  logStream?: NodeJS.WritableStream;
}

// Recusas que a operacao precisa ver no log: a falha e da configuracao da
// Avenly, nao dos dados da pessoa (Goal082 §2).
const OPERATOR_VISIBLE_REFUSALS = new Set([
  "MINHA_AGENDA_NOT_CONFIGURED",
  "MINHA_AGENDA_CLIENT_REJECTED",
]);

/** Codigo da origem que causou a falha em segundo plano; nunca texto do erro. */
export function importWorkOriginCode(error: unknown): string | undefined {
  if (!(error instanceof AppError)) return undefined;
  const cause = (error.details as { cause?: unknown } | undefined)?.cause;
  return error.code === "MINHA_AGENDA_IMPORT_CATEGORY_FAILED" &&
    typeof cause === "string"
    ? cause
    : error.code;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      ...(options.logStream ? { stream: options.logStream } : {}),
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

  if (!env.MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL) {
    app.log.warn(
      "MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL is not set; the Minha Agenda import is unavailable.",
    );
  }

  // Analise e execucao da importacao terminam no proprio processo (Goal061,
  // D-008): o conjunto so existe para o `onClose` esperar o que ja comecou.
  // Quem decide quem trabalha e o lease do banco.
  const importWork = new ImportBackgroundWork((error) => {
    app.log.error(
      {
        errorCode: importWorkFailure(error).errorCode,
        originCode: importWorkOriginCode(error),
      },
      "Import work failed",
    );
  });

  await registerHealthRoute(app);
  await registerCalendarRoutes(app);
  await registerManagementRoutes(app, getPrisma(), { importWork });

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
      if (OPERATOR_VISIBLE_REFUSALS.has(error.code)) {
        request.log.error(
          {
            errorCode: error.code,
            originStatus: (
              error.details as { originStatus?: number } | undefined
            )?.originStatus,
          },
          "Minha Agenda refused the connection",
        );
      }
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
    await importWork.drain();
    await disconnectPrisma();
  });

  return app;
}
