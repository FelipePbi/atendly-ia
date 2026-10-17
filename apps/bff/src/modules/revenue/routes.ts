import { revenuePeriodSchema } from "@avenly-ia/public-api-contract";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { SchedulingClient } from "../../clients/scheduling/index.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse } from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const revenueQuerySchema = z.object({
  period: revenuePeriodSchema.default("month"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * `GET /v1/revenue` (D-177): faturamento do negócio da sessão no período.
 * A soma é do Scheduling; o BFF só valida a pergunta e repassa o tenant da
 * sessão — nenhum parâmetro escolhe negócio.
 */
export async function registerV1RevenueRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();

  app.get(
    "/v1/revenue",
    { preHandler: requireTenantContext },
    async (request) => {
      const parsed = revenueQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Invalid revenue query.",
          400,
          z.flattenError(parsed.error).fieldErrors,
        );
      }
      return dataResponse(
        request,
        await scheduling.revenue(internalContext(request), parsed.data),
      );
    },
  );
}
