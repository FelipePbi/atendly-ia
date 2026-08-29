import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { SchedulingClient } from "../../clients/scheduling/index.js";
import { dataResponse, parseBody, parseParams } from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });
const customerSchema = z.object({
  name: z.string().trim().min(1).max(200).nullable().optional(),
  phone: z.string().trim().min(6).max(32),
});

export async function registerV1CustomerRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();

  app.get(
    "/v1/customers",
    { preHandler: requireTenantContext },
    async (request) => {
      const result = await scheduling.listCustomers(internalContext(request));
      return dataResponse(request, {
        ...result,
        source: result.source === "ATENDLY" ? "ATENDLY" : "EXTERNAL",
      });
    },
  );

  app.get(
    "/v1/customers/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.getCustomer(internalContext(request), id),
      );
    },
  );

  app.post(
    "/v1/customers",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const customer = await scheduling.createCustomer(
        internalContext(request),
        parseBody(customerSchema, request.body),
      );
      return reply.code(201).send(dataResponse(request, customer));
    },
  );
}
