import {
  customerReturnStatusInputSchema,
  returnCampaignInputSchema,
  type ReturnCandidateList,
  returnPlanInputSchema,
  returnSettingsInputSchema,
} from "@avenly-ia/public-api-contract";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import type { InternalRequestContext } from "../../clients/internal-http-client.js";
import {
  type ReturnCandidateListInternal,
  SchedulingClient,
} from "../../clients/scheduling/index.js";
import {
  dataResponse,
  parseBody,
  parseParams,
  parseQuery,
} from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

/**
 * Retorno de clientes: Renovação e Resgate (D-202).
 *
 * O Scheduling decide quem entra, simula o ritmo e guarda as rodadas; a IA
 * diz quem é contato ignorado ou conversa pessoal, e essas pessoas saem da
 * lista antes de chegar à tela — e de novo na aprovação, para que nenhuma
 * entre na rodada por uma lista velha. Nada sai sem a profissional aprovar.
 */

const candidatesQuerySchema = z.object({
  kind: z.enum(["RENEWAL", "WINBACK"]),
  week: z.enum(["this", "next"]).optional(),
  days: z.coerce.number().int().min(14).max(365).optional(),
});
const idParamsSchema = z.object({ id: z.string().min(1).max(128) });
const actionParamsSchema = z.object({
  id: z.string().min(1).max(128),
  action: z.enum(["pause", "resume", "cancel"]),
});
const targetParamsSchema = z.object({
  id: z.string().min(1).max(128),
  targetId: z.string().min(1).max(128),
});

interface FilteredCandidates {
  list: ReturnCandidateList;
  allowedIds: Set<string>;
}

async function filteredCandidates(
  scheduling: SchedulingClient,
  orchestrator: AiOrchestratorClient,
  context: InternalRequestContext,
  query: z.output<typeof candidatesQuerySchema>,
  request: FastifyRequest,
): Promise<FilteredCandidates> {
  const internal = await scheduling.returnCandidates(context, {
    kind: query.kind,
    week: query.week,
    days: query.days,
  });
  let excludedPhones = new Map<string, "IGNORED" | "PERSONAL">();
  if (internal.candidates.length > 0) {
    try {
      const excluded = await orchestrator.returnContactExclusions(
        context,
        internal.candidates.map((candidate) => candidate.phone),
      );
      excludedPhones = new Map(
        excluded.map((item) => [item.phone, item.reason]),
      );
    } catch (error) {
      // A IA fora do ar nao esconde a lista: a entrega confere de novo o
      // contato ignorado e a conversa pessoal antes de cada envio.
      request.log.warn(
        { err: error },
        "customer-return: contact exclusions unavailable",
      );
    }
  }
  return {
    list: publicCandidateList(internal, excludedPhones),
    allowedIds: new Set(
      internal.candidates
        .filter((candidate) => !excludedPhones.has(candidate.phone))
        .map((candidate) => candidate.customerId),
    ),
  };
}

function publicCandidateList(
  internal: ReturnCandidateListInternal,
  excludedPhones: Map<string, "IGNORED" | "PERSONAL">,
): ReturnCandidateList {
  let ignored = 0;
  let personal = 0;
  const candidates: ReturnCandidateList["candidates"] = [];
  for (const candidate of internal.candidates) {
    const reason = excludedPhones.get(candidate.phone);
    if (reason === "IGNORED") {
      ignored += 1;
      continue;
    }
    if (reason === "PERSONAL") {
      personal += 1;
      continue;
    }
    candidates.push({
      customerId: candidate.customerId,
      name: candidate.name,
      phone: candidate.phone,
      serviceName: candidate.serviceName,
      expectedDate: candidate.expectedDate,
      intervalDays: candidate.intervalDays,
      intervalSource: candidate.intervalSource,
      lastVisitDate: candidate.lastVisitDate,
      daysSinceLastVisit: candidate.daysSinceLastVisit,
      sendBy: candidate.sendBy,
      habit: candidate.habit
        ? {
            weekdays: candidate.habit.weekdays,
            bandStart: candidate.habit.bandStart,
            bandEnd: candidate.habit.bandEnd,
          }
        : null,
    });
  }
  return {
    kind: internal.kind,
    timezone: internal.timezone,
    today: internal.today,
    weekStart: internal.weekStart,
    weekEnd: internal.weekEnd,
    days: internal.days,
    candidates,
    excluded: {
      deactivated: internal.excluded.deactivated,
      noPhone: internal.excluded.noPhone,
      futureAppointment: internal.excluded.futureAppointment,
      blocked: internal.excluded.blocked,
      recentlyContacted: internal.excluded.recentlyContacted,
      queued: internal.excluded.queued,
      ignored,
      personal,
    },
  };
}

export async function registerV1CustomerReturnRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();
  const orchestrator = new AiOrchestratorClient();

  app.get(
    "/v1/customer-return/settings",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        await scheduling.returnSettings(internalContext(request)),
      ),
  );

  app.patch(
    "/v1/customer-return/settings",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        await scheduling.updateReturnSettings(
          internalContext(request),
          parseBody(returnSettingsInputSchema, request.body ?? {}),
        ),
      ),
  );

  app.get(
    "/v1/customer-return/candidates",
    { preHandler: requireTenantContext },
    async (request) => {
      const query = parseQuery(candidatesQuerySchema, request.query ?? {});
      const { list } = await filteredCandidates(
        scheduling,
        orchestrator,
        internalContext(request),
        query,
        request,
      );
      return dataResponse(request, list);
    },
  );

  app.post(
    "/v1/customer-return/plan",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(returnPlanInputSchema, request.body ?? {});
      const context = internalContext(request);
      const { allowedIds } = await filteredCandidates(
        scheduling,
        orchestrator,
        context,
        body,
        request,
      );
      const customerIds = body.customerIds.filter((id) => allowedIds.has(id));
      if (customerIds.length === 0) {
        return dataResponse(request, {
          dailyLimit: body.dailyLimit ?? 0,
          total: 0,
          notFitting: [],
          minimumDailyLimit: null,
          lastPlannedDate: null,
        });
      }
      return dataResponse(
        request,
        await scheduling.returnPlan(context, { ...body, customerIds }),
      );
    },
  );

  app.post(
    "/v1/customer-return/campaigns",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const body = parseBody(returnCampaignInputSchema, request.body ?? {});
      const context = internalContext(request);
      const { allowedIds } = await filteredCandidates(
        scheduling,
        orchestrator,
        context,
        body,
        request,
      );
      const campaign = await scheduling.createReturnCampaign(context, {
        ...body,
        customerIds: body.customerIds.filter((id) => allowedIds.has(id)),
      });
      return reply.code(201).send(dataResponse(request, campaign));
    },
  );

  app.get(
    "/v1/customer-return/campaigns",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        await scheduling.returnCampaigns(internalContext(request)),
      ),
  );

  app.get(
    "/v1/customer-return/campaigns/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idParamsSchema, request.params);
      return dataResponse(
        request,
        await scheduling.returnCampaign(internalContext(request), id),
      );
    },
  );

  app.post(
    "/v1/customer-return/campaigns/:id/:action",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id, action } = parseParams(actionParamsSchema, request.params);
      return dataResponse(
        request,
        await scheduling.changeReturnCampaign(
          internalContext(request),
          id,
          action,
        ),
      );
    },
  );

  app.post(
    "/v1/customer-return/campaigns/:id/targets/:targetId/skip",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id, targetId } = parseParams(targetParamsSchema, request.params);
      return dataResponse(
        request,
        await scheduling.skipReturnTarget(
          internalContext(request),
          id,
          targetId,
        ),
      );
    },
  );

  app.get(
    "/v1/customers/:id/return-messages",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idParamsSchema, request.params);
      return dataResponse(
        request,
        await scheduling.customerReturnStatus(internalContext(request), id),
      );
    },
  );

  app.put(
    "/v1/customers/:id/return-messages",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idParamsSchema, request.params);
      const { blocked } = parseBody(
        customerReturnStatusInputSchema,
        request.body ?? {},
      );
      return dataResponse(
        request,
        await scheduling.setCustomerReturnStatus(
          internalContext(request),
          id,
          blocked,
        ),
      );
    },
  );
}
