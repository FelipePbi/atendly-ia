import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { SchedulingClient } from "../../clients/scheduling/index.js";
import { dataResponse, parseBody, parseParams } from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });
const serviceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  durationMinutes: z.number().int().positive().max(1_440),
  priceType: z.enum(["FIXED", "ON_REQUEST"]),
  price: z.number().nonnegative().nullable().optional(),
  active: z.boolean().default(true),
});
const patchSchema = serviceSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one service field is required.",
  );

export async function registerV1ServiceRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();

  app.get(
    "/v1/services",
    { preHandler: requireTenantContext },
    async (request) => {
      const context = internalContext(request);
      const [items, calendar] = await Promise.all([
        scheduling.listServices(context),
        scheduling.calendar(context),
      ]);
      return dataResponse(request, {
        items,
        source: calendar.source === "ATENDLY" ? "ATENDLY" : "EXTERNAL",
        editable: calendar.capabilities.manageServices,
      });
    },
  );

  app.post(
    "/v1/services",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const service = await scheduling.createService(
        internalContext(request),
        parseBody(serviceSchema, request.body),
      );
      return reply.code(201).send(dataResponse(request, service));
    },
  );

  app.patch(
    "/v1/services/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.updateService(
          internalContext(request),
          id,
          parseBody(patchSchema, request.body),
        ),
      );
    },
  );
}
