import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { dataResponse, parseBody, parseQuery } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { reconcileNotificationCenter } from "./reconcile.js";
import { loadPreferences } from "./store.js";

/**
 * Contrato público da central (Goal022/WU-04).
 *
 * A reconciliação das espécies que dependem dos donos roda **aqui**, sob o
 * throttle persistido do motor: `GET /v1/notifications` e `GET
 * /v1/notifications/summary` tentam convergir antes de ler, mas a leitura que
 * segue vem sempre do que está gravado — fonte fora do ar nunca vira `500`,
 * porque {@link reconcileNotificationCenter} não lança.
 */

const NOTIFICATION_LEVELS = ["INFO", "ATTENTION", "CRITICAL"] as const;

/** Teto de página e janela de histórico: nada de lista sem fim nem de tela
 * despejando anos de notificação resolvida. */
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const HISTORY_WINDOW_DAYS = 90;

const optionalBooleanQuery = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return value;
}, z.boolean().optional());

const listQuerySchema = z.object({
  level: z.enum(NOTIFICATION_LEVELS).optional(),
  unread: optionalBooleanQuery,
  resolved: optionalBooleanQuery,
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

const readBodySchema = z.union([
  z.object({ id: z.string().trim().min(1).max(128) }),
  z.object({ all: z.literal(true) }),
]);

const preferencesBodySchema = z.object({ aiAppointmentCreated: z.boolean() });

export async function registerV1NotificationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const ai = new AiOrchestratorClient();
  const scheduling = new SchedulingClient();

  app.get(
    "/v1/notifications",
    { preHandler: requireTenantContext },
    async (request) => {
      await reconcileNotificationCenter(request, { ai, scheduling });

      const tenant = currentTenantContext(request);
      const query = parseQuery(listQuerySchema, request.query ?? {});
      const prisma = getPrisma();
      const since = new Date(
        Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1_000,
      );
      const where = {
        tenantId: tenant.tenantId,
        occurredAt: { gte: since },
        ...(query.level ? { level: query.level } : {}),
        ...(query.unread !== undefined
          ? { readAt: query.unread ? null : { not: null } }
          : {}),
        ...(query.resolved !== undefined
          ? { resolvedAt: query.resolved ? { not: null } : null }
          : {}),
      };

      const [total, rows] = await Promise.all([
        prisma.tenantNotification.count({ where }),
        prisma.tenantNotification.findMany({
          where,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: query.limit,
          skip: query.offset,
        }),
      ]);

      return dataResponse(request, {
        total,
        limit: query.limit,
        offset: query.offset,
        items: rows.map(publicNotification),
      });
    },
  );

  app.get(
    "/v1/notifications/summary",
    { preHandler: requireTenantContext },
    async (request) => {
      await reconcileNotificationCenter(request, { ai, scheduling });

      const tenant = currentTenantContext(request);
      const prisma = getPrisma();
      const [byLevel, openConditionsCount] = await Promise.all([
        prisma.tenantNotification.groupBy({
          by: ["level"],
          where: { tenantId: tenant.tenantId, readAt: null },
          _count: { _all: true },
        }),
        prisma.tenantNotification.count({
          where: {
            tenantId: tenant.tenantId,
            shape: "CONDITION",
            resolvedAt: null,
          },
        }),
      ]);

      const counts: Record<(typeof NOTIFICATION_LEVELS)[number], number> = {
        INFO: 0,
        ATTENTION: 0,
        CRITICAL: 0,
      };
      for (const row of byLevel) {
        counts[row.level] = row._count._all;
      }

      return dataResponse(request, {
        byLevel: counts,
        unreadCount: counts.INFO + counts.ATTENTION + counts.CRITICAL,
        openConditionsCount,
      });
    },
  );

  // Idempotente: um id que já está lido, que é de outro tenant ou que não
  // existe cai fora do `where` e conta zero nas três situações — não há como
  // um id alheio se distinguir de um id inexistente pela resposta.
  app.post(
    "/v1/notifications/read",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const body = parseBody(readBodySchema, request.body);
      const result = await getPrisma().tenantNotification.updateMany({
        where: {
          tenantId: tenant.tenantId,
          readAt: null,
          ...("id" in body ? { id: body.id } : {}),
        },
        data: { readAt: new Date() },
      });
      return dataResponse(request, { updated: result.count });
    },
  );

  app.get(
    "/v1/notifications/preferences",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      return dataResponse(
        request,
        await loadPreferences(getPrisma(), tenant.tenantId),
      );
    },
  );

  app.patch(
    "/v1/notifications/preferences",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const body = parseBody(preferencesBodySchema, request.body);
      await getPrisma().notificationPreference.upsert({
        where: { tenantId: tenant.tenantId },
        create: {
          tenantId: tenant.tenantId,
          aiAppointmentCreated: body.aiAppointmentCreated,
        },
        update: { aiAppointmentCreated: body.aiAppointmentCreated },
      });
      return dataResponse(request, {
        aiAppointmentCreated: body.aiAppointmentCreated,
      });
    },
  );
}

function publicNotification(row: {
  id: string;
  kind: string;
  level: string;
  shape: string;
  subjectId: string | null;
  occurredAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
  payload: unknown;
}) {
  return {
    id: row.id,
    kind: row.kind,
    level: row.level,
    shape: row.shape,
    subjectId: row.subjectId,
    occurredAt: row.occurredAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    payload: row.payload,
  };
}
