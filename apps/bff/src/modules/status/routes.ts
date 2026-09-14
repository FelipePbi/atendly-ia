import type { FastifyInstance } from "fastify";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import { dataResponse } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { settled, whatsappSummary } from "../dashboard/routes.js";
import { internalContext } from "../tenant/context.js";

type WhatsAppStatus = "CONNECTED" | "DISCONNECTED" | "UNKNOWN";
type AiState = "ACTIVE" | "OFF" | "PENDING" | "UNKNOWN";

/**
 * Goal014/WU-02: read model honesto de status.
 *
 * `whatsapp` e `ai` nunca chegam a `CONNECTED`/`ACTIVE` sem verificação real
 * contra Evolution e a IA nesta própria requisição; dependência indisponível
 * vira `UNKNOWN`, com o erro registrado no `settled` de cada uma — nunca
 * `500`. Reconciliação e autoativação são do Goal018; esta rota só lê.
 */
export async function registerV1StatusRoutes(
  app: FastifyInstance,
): Promise<void> {
  const ai = new AiOrchestratorClient();
  const evolution = new EvolutionClient();

  app.get(
    "/v1/status",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const context = internalContext(request);
      const [whatsappResult, aiConfigResult, aiSettings] = await Promise.all([
        settled(whatsappSummary(tenant.userId, request.id, evolution)),
        settled(ai.getAiTenantConfig(context)),
        getPrisma().aiSettings.findUnique({
          where: { tenantId: tenant.tenantId },
        }),
      ]);

      const checkedAt = new Date().toISOString();
      const whatsapp: {
        status: WhatsAppStatus;
        phoneNumber: string | null;
        checkedAt: string;
      } =
        whatsappResult.status === "error"
          ? { status: "UNKNOWN", phoneNumber: null, checkedAt }
          : {
              status: whatsappResult.data?.status ?? "DISCONNECTED",
              phoneNumber: whatsappResult.data?.phoneNumber ?? null,
              checkedAt,
            };

      const desiredEnabled = Boolean(aiSettings?.enabled);
      const effectiveEnabled =
        aiConfigResult.status === "ok"
          ? (aiConfigResult.data?.enabled ?? null)
          : null;
      const ai_ = {
        desiredEnabled,
        effectiveEnabled,
        state: aiState(
          desiredEnabled,
          effectiveEnabled,
          aiConfigResult.status === "ok",
        ),
      };

      return dataResponse(request, {
        whatsapp,
        ai: ai_,
        degraded:
          whatsappResult.status === "error" ||
          aiConfigResult.status === "error",
      });
    },
  );
}

function aiState(
  desiredEnabled: boolean,
  effectiveEnabled: boolean | null,
  dependencyOk: boolean,
): AiState {
  if (!dependencyOk) return "UNKNOWN";
  if (!desiredEnabled) return "OFF";
  return effectiveEnabled === true ? "ACTIVE" : "PENDING";
}
