import type { FastifyInstance } from "fastify";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { reconcileAiActivation } from "../../lib/ai-activation.js";
import { dataResponse } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { accountDeletionStore } from "../account/service.js";
import { settled, whatsappSummary } from "../dashboard/routes.js";
import { reconcileStatusConditions } from "../notifications/reconcile.js";
import { internalContext } from "../tenant/context.js";

type WhatsAppStatus = "CONNECTED" | "DISCONNECTED" | "UNKNOWN";
type AiState = "ACTIVE" | "OFF" | "PENDING" | "UNKNOWN";

/**
 * Goal014/WU-02: read model honesto de status.
 *
 * `whatsapp` e `ai` nunca chegam a `CONNECTED`/`ACTIVE` sem verificação real
 * contra Evolution e a IA nesta própria requisição; dependência indisponível
 * vira `UNKNOWN`, com o erro registrado no `settled` de cada uma — nunca
 * `500`.
 *
 * Goal019 §7: esta rota deixa de apenas relatar `PENDING` e passa a **tentar
 * convergir** antes de ler. A reconciliação é limitada (uma tentativa por
 * requisição), idempotente, nunca lança e nunca entra em laço; a leitura que
 * vem depois dela é a leitura real do que ficou, não uma promessa do que foi
 * tentado. `ai.reconciled` diz o que aconteceu, para o estado continuar
 * honesto mesmo quando a convergência não deu certo.
 *
 * Goal025/WU-03: `accountDeletion` lê a mesma linha que `POST`/`DELETE
 * /v1/account/deletion` gravam, pela mesma loja (`accountDeletionStore`) —
 * não uma segunda leitura reinventada aqui. `status: "NONE"` é o negócio sem
 * exclusão nenhuma; `dueAt` é o vencimento que a tela usa para contar os
 * sete dias.
 */
export async function registerV1StatusRoutes(
  app: FastifyInstance,
): Promise<void> {
  const ai = new AiOrchestratorClient();
  const evolution = new EvolutionClient();
  const scheduling = new SchedulingClient();
  const accountDeletion = accountDeletionStore();

  app.get(
    "/v1/status",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const context = internalContext(request);
      // Antes de ler: uma tentativa de convergir. Ela nunca lança, então a
      // leitura abaixo acontece sempre, com ou sem sucesso da convergência.
      const reconciled = await reconcileAiActivation(request, {
        ai,
        scheduling,
      });
      const [whatsappResult, aiConfigResult, aiSettings, deletion] =
        await Promise.all([
          settled(whatsappSummary(tenant, request.id, evolution), request.log),
          settled(ai.getAiTenantConfig(context)),
          getPrisma().aiSettings.findUnique({
            where: { tenantId: tenant.tenantId },
          }),
          accountDeletion.find(tenant.tenantId),
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
        reconciled,
      };

      // Goal022 §6: as condições de canal da central reconciliam **aqui**,
      // reusando os valores que esta requisição já computou — zero chamada
      // remota a mais. A escrita é local, nunca lança e não muda a forma da
      // resposta: consumidor de status não passa a depender da central.
      await reconcileStatusConditions(request, {
        whatsapp: whatsapp.status,
        ai: ai_.state,
      });

      return dataResponse(request, {
        whatsapp,
        ai: ai_,
        // Goal025/WU-03: o estado da exclusão de conta, para a tela contar os
        // dias até a purga. `dueAt` só existe junto de uma linha; sem exclusão
        // pedida nunca houve o que vencer.
        accountDeletion: deletion
          ? { status: deletion.status, dueAt: deletion.dueAt.toISOString() }
          : { status: "NONE" as const, dueAt: null },
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
