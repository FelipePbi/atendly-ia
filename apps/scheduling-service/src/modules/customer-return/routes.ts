import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import {
  currentInternalContext,
  requireDeliveryCaller,
  requireHumanCaller,
  requireInternalAuth,
} from "../../shared/auth/internal-auth.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  claimDueReturnTargets,
  settleReturnTarget,
} from "./return-dispatch.js";
import { RETURN_DAILY_LIMIT_MAX } from "./return-rules.js";
import { CustomerReturnService } from "./return-service.js";

/**
 * Rotas internas do retorno de clientes (D-202).
 *
 * Tres donos, como nos lembretes: o **BFF** (pessoa) le a lista, simula o
 * ritmo, aprova, pausa, cancela e configura; a **IA** reivindica, liquida e
 * relata resposta e recusa. A reivindicacao e a unica que atravessa negocios.
 */

const clockSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/u, "Expected HH:MM.");
const templateSchema = z.string().trim().max(600).nullable();

const settingsBodySchema = z
  .object({
    dailyLimit: z.number().int().min(1).max(RETURN_DAILY_LIMIT_MAX).optional(),
    windowDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .optional(),
    windowStart: clockSchema.optional(),
    windowEnd: clockSchema.optional(),
    leadDays: z.number().int().min(1).max(5).optional(),
    winbackDays: z.number().int().min(14).max(365).optional(),
    winbackIncentive: z.string().trim().max(300).nullable().optional(),
    renewalMessage: templateSchema.optional(),
    winbackMessage: templateSchema.optional(),
  })
  .strict();

const kindSchema = z.enum(["RENEWAL", "WINBACK"]);
const candidatesQuerySchema = z.object({
  kind: kindSchema,
  week: z.enum(["this", "next"]).optional(),
  days: z.coerce.number().int().min(14).max(365).optional(),
});
const planBodySchema = z.object({
  kind: kindSchema,
  week: z.enum(["this", "next"]).optional(),
  days: z.number().int().min(14).max(365).optional(),
  customerIds: z.array(z.string().min(1).max(128)).min(1).max(500),
  dailyLimit: z.number().int().min(1).max(RETURN_DAILY_LIMIT_MAX).optional(),
});
const createBodySchema = planBodySchema.extend({
  acceptNotFitting: z.boolean().optional(),
});
const idParamsSchema = z.object({ id: z.string().min(1).max(128) });
const targetParamsSchema = z.object({
  id: z.string().min(1).max(128),
  targetId: z.string().min(1).max(128),
});
const stateParamsSchema = z.object({
  id: z.string().min(1).max(128),
  action: z.enum(["pause", "resume", "cancel"]),
});
const blockBodySchema = z.object({ blocked: z.boolean() });
const claimBodySchema = z.object({
  owner: z.string().min(1).max(200).optional(),
  leaseTtlSeconds: z.number().int().min(10).max(900).optional(),
  tenantLimit: z.number().int().min(1).max(500).optional(),
});
const settleBodySchema = z.object({
  leaseToken: z.string().min(1).max(200),
  outcome: z.enum(["SENT", "FAILED", "SKIPPED", "DEFERRED"]),
  reason: z.string().min(1).max(64).nullable().optional(),
  messageBody: z.string().max(4_000).nullable().optional(),
});
const answerBodySchema = z.object({ answer: z.enum(["DECLINED", "STOPPED"]) });

function parse<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Request validation failed.",
      400,
      z.flattenError(parsed.error).fieldErrors,
    );
  }
  return parsed.data;
}

function data<T>(request: FastifyRequest, value: T) {
  return { data: value, requestId: request.id };
}

export async function registerCustomerReturnRoutes(
  app: FastifyInstance,
  prismaClient: PrismaClient = getPrisma(),
): Promise<void> {
  const prisma = prismaClient;
  const internalOnly = { preHandler: requireInternalAuth };
  const service = (request: FastifyRequest) =>
    new CustomerReturnService(prisma, currentInternalContext(request).tenantId);

  // --- Pessoa (BFF) ---------------------------------------------------------

  app.get("/internal/customer-return/settings", internalOnly, async (request) =>
    data(request, await service(request).settings()),
  );

  app.patch(
    "/internal/customer-return/settings",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const body = parse(settingsBodySchema, request.body ?? {});
      return data(
        request,
        await service(request).updateSettings(body, context),
      );
    },
  );

  app.get(
    "/internal/customer-return/candidates",
    internalOnly,
    async (request) => {
      const query = parse(candidatesQuerySchema, request.query ?? {});
      return data(request, await service(request).candidates(query));
    },
  );

  app.post("/internal/customer-return/plan", internalOnly, async (request) => {
    const body = parse(planBodySchema, request.body ?? {});
    return data(request, await service(request).plan(body));
  });

  app.post(
    "/internal/customer-return/campaigns",
    internalOnly,
    async (request, reply) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const body = parse(createBodySchema, request.body ?? {});
      const campaign = await service(request).createCampaign(body, context);
      return reply.code(201).send(data(request, campaign));
    },
  );

  app.get(
    "/internal/customer-return/campaigns",
    internalOnly,
    async (request) => data(request, await service(request).listCampaigns()),
  );

  app.get(
    "/internal/customer-return/campaigns/:id",
    internalOnly,
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      return data(request, await service(request).campaign(id));
    },
  );

  app.post(
    "/internal/customer-return/campaigns/:id/:action",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const { id, action } = parse(stateParamsSchema, request.params);
      return data(
        request,
        await service(request).changeCampaignState(id, action, context),
      );
    },
  );

  app.post(
    "/internal/customer-return/campaigns/:id/targets/:targetId/skip",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const { id, targetId } = parse(targetParamsSchema, request.params);
      return data(
        request,
        await service(request).skipTarget(id, targetId, context),
      );
    },
  );

  app.get(
    "/internal/customers/:id/return-status",
    internalOnly,
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      return data(request, await service(request).customerStatus(id));
    },
  );

  app.put(
    "/internal/customers/:id/return-status",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireHumanCaller(context);
      const { id } = parse(idParamsSchema, request.params);
      const { blocked } = parse(blockBodySchema, request.body ?? {});
      return data(
        request,
        await service(request).setCustomerBlocked(id, blocked, context),
      );
    },
  );

  // --- Entregador (IA) ------------------------------------------------------

  app.post("/internal/customer-return/claim", internalOnly, async (request) => {
    requireDeliveryCaller(currentInternalContext(request));
    const body = parse(claimBodySchema, request.body ?? {});
    return data(request, await claimDueReturnTargets(prisma, body));
  });

  app.post(
    "/internal/customer-return/targets/:id/settle",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireDeliveryCaller(context);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(settleBodySchema, request.body ?? {});
      return data(
        request,
        await settleReturnTarget(prisma, {
          tenantId: context.tenantId,
          targetId: id,
          ...body,
        }),
      );
    },
  );

  app.post(
    "/internal/customer-return/targets/:id/replied",
    internalOnly,
    async (request) => {
      requireDeliveryCaller(currentInternalContext(request));
      const { id } = parse(idParamsSchema, request.params);
      return data(request, await service(request).recordReply(id));
    },
  );

  app.post(
    "/internal/customer-return/targets/:id/answer",
    internalOnly,
    async (request) => {
      const context = currentInternalContext(request);
      requireDeliveryCaller(context);
      const { id } = parse(idParamsSchema, request.params);
      const { answer } = parse(answerBodySchema, request.body ?? {});
      return data(
        request,
        await service(request).recordAnswer(id, answer, context),
      );
    },
  );
}
