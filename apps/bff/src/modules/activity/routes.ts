import { activityAreaSchema, activityKindSchema } from "@avenly-ia/public-api-contract";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";
import { listActivity } from "./activity-log.js";
import { type ActivitySource, readActivityPage } from "./service.js";

const ACTIVITY_PAGE_DEFAULT_LIMIT = 30;

/** Lista separada por vírgula, cada item validado. */
const commaList = <T extends z.ZodType<string, string>>(item: T) =>
  z
    .string()
    .trim()
    .max(200)
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).max(10))
    .optional();

const activityQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    actor: z.enum(["AI", "USER"]).optional(),
    area: commaList(activityAreaSchema),
    kind: commaList(activityKindSchema),
    q: z.string().trim().max(100).optional(),
    cursor: z.string().trim().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .refine((query) => !query.from || !query.to || query.from < query.to, {
    path: ["to"],
    message: "`to` must be after `from`.",
  });

/**
 * `GET /v1/activity` (D-176): registro de atividade do negócio da sessão,
 * intercalando Scheduling, IA e o próprio BFF. O negócio vem só da sessão —
 * nenhum parâmetro escolhe tenant.
 */
export async function registerV1ActivityRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();
  const ai = new AiOrchestratorClient();

  app.get(
    "/v1/activity",
    { preHandler: requireTenantContext },
    async (request) => {
      const parsed = activityQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Invalid activity query.",
          400,
          z.flattenError(parsed.error).fieldErrors,
        );
      }
      const query = parsed.data;
      const tenant = currentTenantContext(request);
      const context = internalContext(request);
      const sources: ActivitySource[] = [
        {
          name: "scheduling",
          areas: ["AGENDA", "CUSTOMERS", "SERVICES", "SETTINGS", "IMPORT"],
          read: (sourceQuery) => scheduling.activity(context, sourceQuery),
        },
        {
          name: "ai",
          areas: ["CONVERSATIONS", "CUSTOMERS", "SERVICES", "SETTINGS"],
          read: (sourceQuery) => ai.activity(context, sourceQuery),
        },
        {
          name: "bff",
          areas: ["SETTINGS"],
          read: (sourceQuery) =>
            listActivity(getPrisma(), tenant.tenantId, {
              from: sourceQuery.from ? new Date(sourceQuery.from) : undefined,
              to: sourceQuery.to ? new Date(sourceQuery.to) : undefined,
              actor: sourceQuery.actor,
              areas: query.area,
              actions: sourceQuery.action?.split(","),
              q: sourceQuery.q,
              before: sourceQuery.beforeAt
                ? {
                    occurredAt: new Date(sourceQuery.beforeAt),
                    sequence:
                      sourceQuery.beforeSequence !== undefined
                        ? BigInt(sourceQuery.beforeSequence)
                        : undefined,
                    inclusive: sourceQuery.inclusive,
                  }
                : undefined,
              limit: sourceQuery.limit,
            }),
        },
      ];
      return dataResponse(
        request,
        await readActivityPage(
          sources,
          {
            from: query.from,
            to: query.to,
            actor: query.actor,
            areas: query.area,
            kinds: query.kind,
            q: query.q,
          },
          query.cursor,
          query.limit ?? ACTIVITY_PAGE_DEFAULT_LIMIT,
        ),
      );
    },
  );
}
