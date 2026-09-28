import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import { currentUser } from "../../lib/auth.js";
import { userDto } from "../../lib/dto.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse, parseBody } from "../../lib/http.js";
import { verifyPassword } from "../../lib/password.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { nameSchema } from "../auth/routes.js";
import {
  accountDeletionEffects,
  accountDeletionStore,
  cancelAccountDeletion,
  startAccountDeletion,
} from "./service.js";

/**
 * Rotas públicas do ciclo de vida da conta (Goal025/WU-03).
 *
 * A identidade vem só da sessão (`currentTenantContext`): nenhum dos dois
 * corpos declara `userId` nem `tenantId`, e nenhum dos dois seria lido se
 * declarasse — a decisão e os efeitos moram em `service.ts`, aqui é só a
 * reautenticação de iniciar e a tradução HTTP.
 */

const startAccountDeletionSchema = z.object({
  password: z.string().min(1).max(200),
});

// Mesma validacao do nome de POST /v1/auth/register (Goal067, review064
// observacao 4): aparado, de 1 a 120 caracteres.
const profileSchema = z.object({
  name: nameSchema,
});

export async function registerV1AccountRoutes(
  app: FastifyInstance,
): Promise<void> {
  const store = accountDeletionStore();
  const ai = new AiOrchestratorClient();
  const evolution = new EvolutionClient();

  // Mesmo grau de reautenticação de `PATCH /v1/auth/password`: a senha atual é
  // exigida antes de qualquer efeito. Senha errada recusa com `401` e nenhuma
  // porta de `service.ts` chega a ser tocada.
  app.post(
    "/v1/account/deletion",
    { preHandler: requireTenantContext },
    async (request) => {
      const sessionUser = currentUser(request);
      const tenant = currentTenantContext(request);
      const body = parseBody(startAccountDeletionSchema, request.body);

      const user = await getPrisma().user.findUnique({
        where: { id: sessionUser.id },
      });
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        throw new AppError(
          "UNAUTHORIZED",
          "Current password is incorrect.",
          401,
        );
      }

      const result = await startAccountDeletion(
        { tenant, requestId: request.id, now: new Date() },
        {
          store,
          effects: accountDeletionEffects(request.log, { ai, evolution }),
          log: request.log,
        },
      );

      return dataResponse(request, {
        status: result.deletion.status,
        dueAt: result.deletion.dueAt.toISOString(),
      });
    },
  );

  // Cancelar não pede senha de novo: dentro do prazo, a sessão vigente já
  // basta, exatamente como o resto das mutações sob `requireTenantContext`.
  app.delete(
    "/v1/account/deletion",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const cancelled = await cancelAccountDeletion(
        { tenant, now: new Date() },
        { store, log: request.log },
      );

      return dataResponse(request, {
        status: cancelled.status,
        dueAt: cancelled.dueAt.toISOString(),
      });
    },
  );

  // Mesmos pre-handlers de escrita autenticada de `PATCH /v1/auth/password`
  // (sessao e CSRF, sem reautenticacao por senha): grava so o `User` da
  // sessao, nunca `userId` do corpo (Goal067, review064 observacao 4).
  app.patch(
    "/v1/account/profile",
    { preHandler: requireTenantContext },
    async (request) => {
      const sessionUser = currentUser(request);
      const body = parseBody(profileSchema, request.body);
      const user = await getPrisma().user.update({
        where: { id: sessionUser.id },
        data: { name: body.name },
      });
      return dataResponse(request, { user: userDto(user) });
    },
  );
}
