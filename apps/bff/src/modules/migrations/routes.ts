import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { SchedulingClient } from "../../clients/scheduling/index.js";
import { AppError } from "../../lib/errors.js";
import {
  dataResponse,
  parseBody,
  parseParams,
  parseQuery,
} from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });
const migrationSchema = z.object({ target: z.enum(["ATENDLY", "EXTERNAL"]) });

// --- Importacao unica (Goal010, WU-09) --------------------------------------
// Uma rota por operacao do ciclo de importacao, todas so humano: nao existe
// contrato de importacao para a IA. `source`/`target` nunca aparecem aqui —
// a unica origem suportada e a integracao Minha Agenda ja conectada do
// negocio (Goal010, WU-07), e nenhum corpo abaixo aceita `tenantId` ou
// `userId`: o negocio e o ator vem sempre da sessao (`internalContext`).
const importCategorySchema = z.enum([
  "SERVICE",
  "CUSTOMER",
  "AVAILABILITY",
  "TIME_BLOCK",
  "FUTURE_APPOINTMENT",
  "PAST_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "NO_SHOW_APPOINTMENT",
]);
const importItemStatusSchema = z.enum([
  "PENDING",
  "IMPORTED",
  "SKIPPED",
  "FAILED",
  "NEEDS_REVIEW",
]);
const importDecisionKindSchema = z.enum([
  "INCLUDE",
  "EXCLUDE",
  "MERGE_WITH_EXISTING",
  "CREATE_NEW",
  "KEEP_EXISTING",
]);
const importSessionParamsSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
});
const importCategoryParamsSchema = importSessionParamsSchema.extend({
  category: importCategorySchema,
});
const importItemParamsSchema = importSessionParamsSchema.extend({
  itemId: z.string().trim().min(1).max(128),
});
const importItemsQuerySchema = z.object({
  status: importItemStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const startImportBodySchema = z.object({
  sourceAccountId: z.string().trim().min(1).max(200),
  sourceAccountLabel: z.string().trim().max(200).nullable().optional(),
  replace: z.boolean().optional(),
});
// `previewVersion` e obrigatoria: executar e sempre executar o preview que o
// negocio aprovou. Fosse opcional, omitir o campo executaria a versao vigente
// qualquer que fosse ela — a recusa de preview obsoleto viraria opt-in.
const executeImportBodySchema = z.object({
  previewVersion: z.number().int().nonnegative(),
  maxItems: z.number().int().positive().max(5_000).optional(),
});
const completeImportBodySchema = z.object({
  acceptPending: z.boolean().optional(),
});
const importDecisionBodySchema = z
  .object({
    decision: importDecisionKindSchema,
    targetInternalId: z.string().trim().min(1).max(128).optional(),
    noteCode: z.string().trim().min(1).max(100).optional(),
  })
  .refine(
    (value) =>
      (value.decision !== "MERGE_WITH_EXISTING" &&
        value.decision !== "KEEP_EXISTING") ||
      Boolean(value.targetInternalId),
    {
      path: ["targetInternalId"],
      message:
        "MERGE_WITH_EXISTING and KEEP_EXISTING require a targetInternalId.",
    },
  );

export async function registerV1MigrationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();

  app.post(
    "/v1/calendar/migrations/diagnose",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(migrationSchema, request.body);
      return dataResponse(
        request,
        publicMigration(
          await scheduling.diagnoseMigration(internalContext(request), {
            target: internalSource(body.target),
          }),
        ),
      );
    },
  );

  app.post(
    "/v1/calendar/migrations",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const body = parseBody(migrationSchema, request.body);
      const migration = await scheduling.createMigration(
        internalContext(request),
        { target: internalSource(body.target) },
      );
      return reply
        .code(201)
        .send(dataResponse(request, { migrationId: migration.migrationId }));
    },
  );

  app.get(
    "/v1/calendar/migrations/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        publicMigration(
          await scheduling.getMigration(internalContext(request), id),
        ),
      );
    },
  );

  // --- Importacao unica (Goal010, WU-09) -----------------------------------

  app.post(
    "/v1/calendar/imports",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const body = parseBody(startImportBodySchema, request.body);
      const result = await scheduling.startImport(
        internalContext(request),
        body,
        idempotencyKey(request),
      );
      return reply.code(201).send(dataResponse(request, result));
    },
  );

  app.post(
    "/v1/calendar/imports/:sessionId/analyze",
    { preHandler: requireTenantContext },
    async (request) => {
      const { sessionId } = parseParams(
        importSessionParamsSchema,
        request.params,
      );
      return dataResponse(
        request,
        await scheduling.analyzeImport(
          internalContext(request),
          sessionId,
          idempotencyKey(request),
        ),
      );
    },
  );

  app.get(
    "/v1/calendar/imports/:sessionId/categories/:category/items",
    { preHandler: requireTenantContext },
    async (request) => {
      const { sessionId, category } = parseParams(
        importCategoryParamsSchema,
        request.params,
      );
      const query = parseQuery(importItemsQuerySchema, request.query ?? {});
      return dataResponse(
        request,
        await scheduling.listImportItems(
          internalContext(request),
          sessionId,
          category,
          query,
        ),
      );
    },
  );

  app.post(
    "/v1/calendar/imports/:sessionId/items/:itemId/decision",
    { preHandler: requireTenantContext },
    async (request) => {
      const { sessionId, itemId } = parseParams(
        importItemParamsSchema,
        request.params,
      );
      const body = parseBody(importDecisionBodySchema, request.body);
      return dataResponse(
        request,
        await scheduling.decideImportItem(
          internalContext(request),
          sessionId,
          itemId,
          body,
          idempotencyKey(request),
        ),
      );
    },
  );

  app.post(
    "/v1/calendar/imports/:sessionId/execute",
    { preHandler: requireTenantContext },
    async (request) => {
      const { sessionId } = parseParams(
        importSessionParamsSchema,
        request.params,
      );
      const body = parseBody(executeImportBodySchema, request.body ?? {});
      return dataResponse(
        request,
        await scheduling.executeImport(
          internalContext(request),
          sessionId,
          body,
          idempotencyKey(request),
        ),
      );
    },
  );

  app.get(
    "/v1/calendar/imports/:sessionId/progress",
    { preHandler: requireTenantContext },
    async (request) => {
      const { sessionId } = parseParams(
        importSessionParamsSchema,
        request.params,
      );
      return dataResponse(
        request,
        await scheduling.importProgress(internalContext(request), sessionId),
      );
    },
  );

  app.post(
    "/v1/calendar/imports/:sessionId/complete",
    { preHandler: requireTenantContext },
    async (request) => {
      const { sessionId } = parseParams(
        importSessionParamsSchema,
        request.params,
      );
      const body = parseBody(completeImportBodySchema, request.body ?? {});
      return dataResponse(
        request,
        await scheduling.completeImport(
          internalContext(request),
          sessionId,
          body,
          idempotencyKey(request),
        ),
      );
    },
  );
}

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || key.length > 200) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A valid Idempotency-Key header is required.",
      400,
    );
  }
  return key;
}

function publicMigration<T extends Record<string, unknown>>(migration: T) {
  return {
    ...migration,
    ...(typeof migration.source === "string"
      ? { source: publicSource(migration.source) }
      : {}),
    ...(typeof migration.target === "string"
      ? { target: publicSource(migration.target) }
      : {}),
  };
}

function internalSource(source: "ATENDLY" | "EXTERNAL") {
  return source === "ATENDLY"
    ? ("ATENDLY" as const)
    : ("MINHA_AGENDA" as const);
}

function publicSource(source: string) {
  return source === "ATENDLY" ? "ATENDLY" : "EXTERNAL";
}
