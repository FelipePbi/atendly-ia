import { randomUUID } from "node:crypto";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { env } from "./config/env.js";
import { sendCsrfToken, sessionCsrfToken } from "./lib/auth.js";
import { AppError, toErrorMessage } from "./lib/errors.js";
import { redactRequestUrl } from "./lib/logging.js";
import { disconnectPrisma, getPrisma } from "./lib/prisma.js";
import { registerResponseContractCheck } from "./lib/response-contract.js";
import { defaultAccountPurgePorts } from "./modules/account/purge.js";
import { registerV1AccountRoutes } from "./modules/account/routes.js";
import { AccountPurgeWorker } from "./modules/account/worker.js";
import { registerV1ActivationTestRoutes } from "./modules/activation-test/routes.js";
import { registerV1ActivityRoutes } from "./modules/activity/routes.js";
import { registerV1AuthRoutes } from "./modules/auth/routes.js";
import { registerV1CalendarRoutes } from "./modules/calendar/routes.js";
import { registerV1ConversationRoutes } from "./modules/conversations/routes.js";
import { registerV1CustomerRoutes } from "./modules/customers/routes.js";
import { registerV1DashboardRoutes } from "./modules/dashboard/routes.js";
import { registerV1KnowledgeRoutes } from "./modules/knowledge/routes.js";
import { registerV1MigrationRoutes } from "./modules/migrations/routes.js";
import { registerV1NotificationRoutes } from "./modules/notifications/routes.js";
import { registerV1OnboardingRoutes } from "./modules/onboarding/routes.js";
import { RetentionSweepWorker } from "./modules/retention/RetentionSweepWorker.js";
import { registerV1RetentionSettingsRoutes } from "./modules/retention/routes.js";
import { defaultRetentionPorts } from "./modules/retention/sweep.js";
import { registerV1ServiceRoutes } from "./modules/services/routes.js";
import { registerV1SettingsRoutes } from "./modules/settings/routes.js";
import { registerV1StatusRoutes } from "./modules/status/routes.js";
import { registerV1WhatsAppRoutes } from "./modules/whatsapp/routes.js";
import { registerHealthRoutes } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY_HOPS || false,
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.apikey",
        "req.headers.instanceToken",
        "body.password",
        "body.currentPassword",
        "body.newPassword",
        "body.token",
        "body.apiKey",
        "body.instanceToken",
        "body.credentials",
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
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "accept",
      "authorization",
      "content-type",
      "idempotency-key",
      "x-csrf-token",
      "x-request-id",
    ],
    // Sem expor o token de CSRF a resposta é ilegível para o adapter quando
    // BFF e frontend estão em hosts distintos, que é o caso do ambiente
    // publicado. A exposição vale só para a origem permitida.
    exposedHeaders: ["x-request-id", env.CSRF_HEADER_NAME],
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  // Toda resposta autenticada por cookie devolve o token de CSRF vigente da
  // sessão. É o que permite ao frontend recuperar o token depois de um reload
  // sem depender de `document.cookie` — impossível de ler quando o cookie foi
  // gravado no host do BFF.
  app.addHook("onSend", async (request, reply, payload) => {
    // Um handler que já estabeleceu sessão nova — troca de senha, por exemplo —
    // devolveu o token dela. Sobrescrever aqui entregaria o token da sessão
    // antiga, que acabou de ser revogada.
    if (
      request.session &&
      request.authCredentialKind === "cookie" &&
      !reply.getHeader(env.CSRF_HEADER_NAME)
    ) {
      sendCsrfToken(reply, sessionCsrfToken(request.session));
    }
    return payload;
  });

  // Goal035/WU-04: hook único que compara o `data` devolvido com a entrada da
  // rota na tabela pública. Registrado antes das rotas para valer para todas
  // elas, e depois do hook de CSRF para ver o payload final. Fora de produção
  // apenas — o motivo está em `lib/response-contract.ts`.
  registerResponseContractCheck(app);

  await registerHealthRoutes(app);
  await registerV1AccountRoutes(app);
  await registerV1AuthRoutes(app);
  await registerV1OnboardingRoutes(app);
  await registerV1DashboardRoutes(app);
  await registerV1StatusRoutes(app);
  await registerV1ConversationRoutes(app);
  await registerV1CalendarRoutes(app);
  await registerV1MigrationRoutes(app);
  await registerV1CustomerRoutes(app);
  await registerV1KnowledgeRoutes(app);
  await registerV1ServiceRoutes(app);
  await registerV1SettingsRoutes(app);
  await registerV1RetentionSettingsRoutes(app);
  await registerV1NotificationRoutes(app);
  await registerV1WhatsAppRoutes(app);
  await registerV1ActivationTestRoutes(app);
  await registerV1ActivityRoutes(app);

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

  // Varredura de retenção (Goal023/WU-05). Desligada por default e por
  // escolha: purga é destrutiva, e ligar por omissão seria apagar conteúdo de
  // negócio sem ninguém ter pedido. Desligada, nada acima muda — nenhuma rota,
  // leitura reconciliada ou tela depende do laço, e as suítes nunca o sobem.
  const retentionSweep = env.RETENTION_SWEEP_ENABLED
    ? new RetentionSweepWorker(
        getPrisma(),
        defaultRetentionPorts(getPrisma()),
        {
          pollIntervalMs: env.RETENTION_SWEEP_INTERVAL_SECONDS * 1_000,
          leaseTtlSeconds: env.RETENTION_SWEEP_LEASE_TTL_SECONDS,
          tenantBatchLimit: env.RETENTION_SWEEP_TENANT_BATCH,
          maxRowsPerStore: env.RETENTION_SWEEP_MAX_ROWS_PER_STORE,
          minTenantIntervalSeconds:
            env.RETENTION_SWEEP_MIN_TENANT_INTERVAL_SECONDS,
        },
        app.log,
      )
    : null;
  retentionSweep?.start();

  // Purga da conta vencida (Goal025/WU-07). Variável própria e também
  // desligada por default: ligar a expiração de conteúdo não pode ligar, por
  // consequência, o apagamento de contas inteiras. Desligada, nada acima muda
  // — nenhuma rota, leitura ou tela depende do laço, e as suítes nunca o
  // sobem, porque chamam `runAccountPurge`/`purgeAccount` diretamente.
  const accountPurge = env.ACCOUNT_PURGE_ENABLED
    ? new AccountPurgeWorker(
        getPrisma(),
        defaultAccountPurgePorts(getPrisma()),
        {
          pollIntervalMs: env.ACCOUNT_PURGE_INTERVAL_SECONDS * 1_000,
          leaseTtlSeconds: env.ACCOUNT_PURGE_LEASE_TTL_SECONDS,
          accountBatchLimit: env.ACCOUNT_PURGE_BATCH,
          maxRowsPerStore: env.ACCOUNT_PURGE_MAX_ROWS_PER_STORE,
        },
        app.log,
      )
    : null;
  accountPurge?.start();

  app.addHook("onClose", async () => {
    // Ordem deliberada: parar o laço antes de soltar o Prisma, para que o
    // ciclo em voo termine com a conexão que ele já estava usando. O `stop`
    // cancela o próximo tick e espera só o ciclo atual, que nunca lança — o
    // desligamento não fica preso por causa de trabalho de fundo.
    await retentionSweep?.stop();
    await accountPurge?.stop();
    await disconnectPrisma();
  });

  return app;
}
