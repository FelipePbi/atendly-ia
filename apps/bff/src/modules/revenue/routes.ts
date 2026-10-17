import { revenuePeriodSchema } from "@avenly-ia/public-api-contract";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse } from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";
import { missedMessages } from "./missed-messages.js";

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
 *
 * As mensagens de clientes fora do horário (D-178) vêm da IA, cruzadas aqui
 * com o horário de atendimento. São complemento: se a IA ou o horário não
 * responderem, o faturamento sai igual, com `messages: null`.
 */
export async function registerV1RevenueRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();
  const orchestrator = new AiOrchestratorClient();

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
      const context = internalContext(request);
      const report = await scheduling.revenue(context, parsed.data);
      let messages: ReturnType<typeof missedMessages> = null;
      try {
        const [hours, availability] = await Promise.all([
          orchestrator.inboundHours(context, {
            from: report.window.from,
            to: report.window.to,
            timeZone: report.timezone,
          }),
          scheduling.availabilitySettings(context),
        ]);
        messages = missedMessages(hours, availability.rules);
      } catch (error) {
        request.log.warn(
          { err: error },
          "revenue: inbound message hours unavailable",
        );
      }
      return dataResponse(request, { ...report, messages });
    },
  );
}
