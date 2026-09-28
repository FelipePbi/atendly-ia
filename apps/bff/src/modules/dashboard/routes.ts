import type { FastifyBaseLogger, FastifyInstance } from "fastify";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import type { InternalRequestContext } from "../../clients/internal-http-client.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import {
  activationTestCompleted,
  reconcileAiActivation,
} from "../../lib/ai-activation.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse } from "../../lib/http.js";
import { phoneFromWhatsappJid } from "../../lib/phone.js";
import { getPrisma } from "../../lib/prisma.js";
import type { TenantContext } from "../../lib/tenant-context.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";
import {
  findLinkedInstance,
  resolveInstanceCredential,
} from "../whatsapp/instance-link.js";

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
          settled(
            whatsappSummary(tenant, request.id, evolution),
            request.log,
          ),
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
      source: dashboard.calendar.source === "ATENDLY" ? "ATENDLY" : null,
    },
  };
}

/**
 * Acrescenta `calendar.capabilities.hoursConfigured` ao dashboard do
 * Scheduling: mesmo predicado de `POST /v1/onboarding/complete`
 * (`AVAILABILITY_REQUIRED`) — toda fonte escolhida exige ao menos uma regra
 * de disponibilidade ativa, sem fonte é `false`. Alimenta o checklist
 * pós-onboarding da Home (Goal018/WU-10), que não pode inferir de
 * configuração local, só de leitura real.
 */
async function schedulingDashboardWithReadiness(
  context: InternalRequestContext,
  scheduling: SchedulingClient,
  ai: Pick<AiOrchestratorClient, "getActivationTest">,
) {
  const raw = await scheduling.dashboard(context);
  const hoursConfigured = raw.calendar.source
    ? (await scheduling.availabilitySettings(context)).rules.some(
        (rule) => rule.active,
      )
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

/**
 * Reaproveitada pelo read model `GET /v1/status` (Goal014/WU-02).
 *
 * Goal059/WU-01: o vínculo é resolvido por `findLinkedInstance` (nunca uma
 * segunda leitura direta de `WhatsAppInstance`) e a credencial usada contra a
 * Evolution é sempre a aberta por `resolveInstanceCredential` — nunca o
 * envelope cifrado cru. Vínculo `pending`/`divergent` lança antes de qualquer
 * chamada à Evolution; quem chama trata isso via `settled`.
 */
export async function whatsappSummary(
  tenant: TenantContext,
  requestId: string,
  evolution: EvolutionClient,
): Promise<{
  status: "CONNECTED" | "DISCONNECTED";
  phoneNumber: string | null;
} | null> {
  const instance = await findLinkedInstance(tenant);
  if (!instance) return null;
  const credential = await resolveInstanceCredential(instance);
  const status = await evolution.getStatus(credential, requestId);
  return {
    status: status.connected ? "CONNECTED" : "DISCONNECTED",
    phoneNumber:
      status.phoneNumber ??
      (instance.phoneNumber
        ? phoneFromWhatsappJid(instance.phoneNumber) || null
        : null),
  };
}

/**
 * Reaproveitada pelo read model `GET /v1/status` (Goal014/WU-02).
 *
 * Goal059/WU-01: falha registrada com código e status HTTP, nunca com
 * credencial, envelope, número ou corpo da resposta upstream — a forma da
 * resposta pública não muda.
 */
export async function settled<T>(
  promise: Promise<T>,
  log?: FastifyBaseLogger,
): Promise<
  | { status: "ok"; data: T }
  | { status: "error"; data: null; code: "DEPENDENCY_UNAVAILABLE" }
> {
  try {
    return { status: "ok", data: await promise };
  } catch (error) {
    log?.warn(
      {
        code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
        statusCode: error instanceof AppError ? error.statusCode : undefined,
      },
      "Dependency read failed",
    );
    return {
      status: "error",
      data: null,
      code: "DEPENDENCY_UNAVAILABLE",
    };
  }
}
