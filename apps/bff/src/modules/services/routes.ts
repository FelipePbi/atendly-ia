import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import type { InternalRequestContext } from "../../clients/internal-http-client.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { CALENDAR_SOURCE } from "../../lib/calendar-source.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse, parseBody, parseParams } from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });
const serviceColorTokenSchema = z.enum([
  "ROSE",
  "AMBER",
  "EMERALD",
  "SKY",
  "VIOLET",
  "SLATE",
]);
const serviceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // Ausente vira pendencia de revisao (Goal007); nunca zero/duracao inventada.
  durationMinutes: z.number().int().positive().max(1_440).nullable().optional(),
  priceType: z.enum(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"]),
  price: z.number().nonnegative().nullable().optional(),
  active: z.boolean().default(true),
  description: z.string().trim().max(1_000).nullable().optional(),
  colorToken: serviceColorTokenSchema.nullable().optional(),
  bufferBeforeMinutes: z.number().int().nonnegative().max(240).nullable().optional(),
  bufferAfterMinutes: z.number().int().nonnegative().max(240).nullable().optional(),
  recurrenceIntervalDays: z.number().int().positive().max(365).nullable().optional(),
});
const patchSchema = serviceSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one service field is required.",
  );

// Instrucao privada por servico (Goal078): texto vazio remove, sem `min`,
// ao contrario dos outros campos de conhecimento. Limite de 2000 caracteres
// aqui, antes de chamar a IA.
const aiInstructionSchema = z
  .object({ content: z.string().trim().max(2_000) })
  .strict();

export async function registerV1ServiceRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();
  const ai = new AiOrchestratorClient();

  /**
   * Confere a posse do servico por `scheduling.listServices` antes de
   * chamar a IA (Goal078): servico de outro negocio ou inexistente vira
   * `404 SERVICE_NOT_FOUND` sem a IA ser chamada. Servico inativo continua
   * sendo do negocio.
   */
  async function requireOwnService(
    context: InternalRequestContext,
    serviceId: string,
  ): Promise<void> {
    const services = await scheduling.listServices(context);
    if (!services.some((service) => service.id === serviceId)) {
      throw new AppError("SERVICE_NOT_FOUND", "Service was not found.", 404);
    }
  }

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
        source: CALENDAR_SOURCE,
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

  app.get(
    "/v1/services/:id/ai-instruction",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      const context = internalContext(request);
      await requireOwnService(context, id);
      return dataResponse(request, await ai.getServiceInstruction(context, id));
    },
  );

  app.put(
    "/v1/services/:id/ai-instruction",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      const body = parseBody(aiInstructionSchema, request.body);
      const context = internalContext(request);
      await requireOwnService(context, id);
      return dataResponse(
        request,
        await ai.saveServiceInstruction(context, id, body),
      );
    },
  );
}
