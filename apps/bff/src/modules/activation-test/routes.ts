import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse, parseBody } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

// Mesmo limite de `startActivationTestSchema` na IA
// (`apps/ai-orchestrator/src/modules/internal/routes.ts`): validar aqui falha
// rápido, sem depender de uma viagem à IA para um corpo obviamente inválido.
const startActivationTestBodySchema = z
  .object({ tenantPhone: z.string().trim().min(8).max(20) })
  .strict();

/**
 * Rotas públicas do teste real (Goal019/WU-05).
 *
 * O BFF é proxy fino do estado que a IA guarda: nenhuma rota aqui inventa
 * progresso, estado ou sucesso quando a leitura upstream falha — o erro sobe
 * como `UPSTREAM_ERROR`, nunca vira `null` nem estado fabricado. A única
 * recusa própria do BFF é a IA já estar ativa: as demais (número da
 * plataforma ausente, WhatsApp não conectado, sem serviço apto, sem
 * disponibilidade, execução já em andamento) são decisão da IA e chegam pelo
 * mesmo mecanismo de `UPSTREAM_ERROR`/`upstreamCode` de todo proxy do BFF.
 */
export async function registerV1ActivationTestRoutes(
  app: FastifyInstance,
): Promise<void> {
  const ai = new AiOrchestratorClient();

  app.get(
    "/v1/activation-test",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(request, await ai.getActivationTest(internalContext(request))),
  );

  app.post(
    "/v1/activation-test",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const body = parseBody(startActivationTestBodySchema, request.body);
      await refuseIfAiAlreadyActive(request);
      const { run, status } = await ai.startActivationTest(
        internalContext(request),
        body,
      );
      return reply.code(status).send(dataResponse(request, run));
    },
  );

  app.post(
    "/v1/activation-test/restart",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const body = parseBody(startActivationTestBodySchema, request.body);
      await refuseIfAiAlreadyActive(request);
      const { run, status } = await ai.restartActivationTest(
        internalContext(request),
        body,
      );
      return reply.code(status).send(dataResponse(request, run));
    },
  );
}

/**
 * Recusa própria do BFF: testar não é ferramenta recorrente depois que a IA
 * já está ativa para o negócio (vault, seção 7). `AiSettings.enabled` é o
 * desejado gravado pelo próprio BFF (D-010) — não depende da IA responder
 * para ser avaliada, e por isso nunca vira `UPSTREAM_ERROR`.
 */
async function refuseIfAiAlreadyActive(request: FastifyRequest): Promise<void> {
  const tenant = currentTenantContext(request);
  const aiSettings = await getPrisma().aiSettings.findUnique({
    where: { tenantId: tenant.tenantId },
  });
  if (aiSettings?.enabled) {
    throw new AppError(
      "ACTIVATION_TEST_AI_ALREADY_ACTIVE",
      "The AI is already active for this tenant; the activation test is not available while it is on.",
      409,
    );
  }
}
