import type { FastifyInstance } from "fastify";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import type { InternalRequestContext } from "../../clients/internal-http-client.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { reconcileAiActivation } from "../../lib/ai-activation.js";
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
      // Mesma reconciliação limitada de `GET /v1/status` (Goal019 §7): uma
      // tentativa por requisição, nunca lança. A Home é onde o checklist
      // pós-onboarding vive, então é aqui que a autoativação por teste
      // bem-sucedido chega ao negócio sem ele precisar apertar nada.
      await reconcileAiActivation(request, { ai, scheduling });
      const [platform, aiResult, schedulingResult, whatsappResult] =
        await Promise.all([
          platformSummary(tenant.tenantId),
          settled(ai.dashboard(context)),
          settled(
            schedulingDashboardWithReadiness(context, scheduling, ai),
          ),
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

function publicSchedulingDashboard<
  T extends {
    calendar: { source: "ATENDLY" | "MINHA_AGENDA" | null };
  },
>(dashboard: T) {
  return {
    ...dashboard,
    calendar: {
      ...dashboard.calendar,
      source:
        dashboard.calendar.source === null
          ? null
          : dashboard.calendar.source === "ATENDLY"
            ? ("ATENDLY" as const)
            : ("EXTERNAL" as const),
    },
  };
}

/**
 * Acrescenta `calendar.capabilities.hoursConfigured` ao dashboard do
 * Scheduling: mesmo predicado de `POST /v1/onboarding/complete`
 * (`AVAILABILITY_REQUIRED`/`CALENDAR_INTEGRATION_NOT_CONNECTED`) — fonte
 * ATENDLY exige ao menos uma regra de disponibilidade ativa, fonte EXTERNAL
 * exige integração `CONNECTED`, sem fonte é `false`. Alimenta o checklist
 * pós-onboarding da Home (Goal018/WU-10), que não pode inferir de
 * configuração local, só de leitura real.
 */
async function schedulingDashboardWithReadiness(
  context: InternalRequestContext,
  scheduling: SchedulingClient,
  ai: Pick<AiOrchestratorClient, "getActivationTest">,
) {
  const raw = await scheduling.dashboard(context);
  const hoursConfigured =
    raw.calendar.source === "ATENDLY"
      ? (await scheduling.availabilitySettings(context)).rules.some(
          (rule) => rule.active,
        )
      : raw.calendar.source === "MINHA_AGENDA"
        ? raw.calendar.integration?.status === "CONNECTED"
        : false;
  const dashboard = publicSchedulingDashboard(raw);
  return {
    ...dashboard,
    calendar: {
      ...dashboard.calendar,
      capabilities: {
        ...dashboard.calendar.capabilities,
        hoursConfigured,
        activationTestCompleted: await activationTestCompleted(context, ai),
      },
    },
  };
}

/**
 * Quarto item do checklist pós-onboarding: "teste concluído" (Goal019 §9).
 *
 * `true` **só** com execução em `SUCCEEDED` que ainda vale — teste feito
 * contra um vínculo de WhatsApp que já não é o do negócio não conta, porque o
 * vault exige teste novo ao trocar/revincular. Sem execução é `false`, que é
 * "nunca testou", não "falhou": o produtor não fabrica conclusão nenhuma.
 */
async function activationTestCompleted(
  context: InternalRequestContext,
  ai: Pick<AiOrchestratorClient, "getActivationTest">,
): Promise<boolean> {
  const run = await ai.getActivationTest(context);
  return run?.state === "SUCCEEDED" && !run.supersededByChannelChange;
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

/** Reaproveitada pelo read model `GET /v1/status` (Goal014/WU-02). */
export async function whatsappSummary(
  userId: string,
  requestId: string,
  evolution: EvolutionClient,
): Promise<{
  status: "CONNECTED" | "DISCONNECTED";
  phoneNumber: string | null;
} | null> {
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

/** Reaproveitada pelo read model `GET /v1/status` (Goal014/WU-02). */
export async function settled<T>(
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
