import type { FastifyInstance } from "fastify";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { dataResponse } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

export async function registerV1DashboardRoutes(
  app: FastifyInstance,
): Promise<void> {
  const ai = new AiOrchestratorClient();
  const scheduling = new SchedulingClient();
  const evolution = new EvolutionClient();

  app.get(
    "/v1/dashboard",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const context = internalContext(request);
      const [platform, aiResult, schedulingResult, whatsappResult] =
        await Promise.all([
          platformSummary(tenant.tenantId),
          settled(ai.dashboard(context)),
          settled(scheduling.dashboard(context)),
          settled(whatsappSummary(tenant.userId, request.id, evolution)),
        ]);
      return dataResponse(request, {
        platform,
        ai: aiResult,
        scheduling: schedulingResult,
        whatsapp: whatsappResult,
        degraded:
          aiResult.status === "error" ||
          schedulingResult.status === "error" ||
          whatsappResult.status === "error",
      });
    },
  );
}

async function platformSummary(tenantId: string) {
  const [tenant, profile] = await Promise.all([
    getPrisma().tenant.findUnique({ where: { id: tenantId } }),
    getPrisma().businessProfile.findUnique({ where: { tenantId } }),
  ]);
  return {
    tenantName: tenant?.name ?? "",
    timezone: profile?.timezone ?? "America/Sao_Paulo",
    onboardingCompleted: Boolean(profile?.onboardingCompletedAt),
  };
}

async function whatsappSummary(
  userId: string,
  requestId: string,
  evolution: EvolutionClient,
) {
  const instance = await getPrisma().whatsAppInstance.findUnique({
    where: { userId },
  });
  if (!instance) return null;
  const status = await evolution.getStatus(
    instance.evolutionInstanceToken,
    requestId,
  );
  return {
    status: status.connected ? "CONNECTED" : "DISCONNECTED",
    phoneNumber: status.phoneNumber ?? instance.phoneNumber,
  };
}

async function settled<T>(
  promise: Promise<T>,
): Promise<
  | { status: "ok"; data: T }
  | { status: "error"; data: null; code: "DEPENDENCY_UNAVAILABLE" }
> {
  try {
    return { status: "ok", data: await promise };
  } catch {
    return {
      status: "error",
      data: null,
      code: "DEPENDENCY_UNAVAILABLE",
    };
  }
}
