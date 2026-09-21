import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { AppError } from "../../lib/errors.js";
import {
  dataResponse,
  parseBody,
  parseParams,
  parseQuery,
} from "../../lib/http.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";
import { findLinkedInstance } from "../whatsapp/instance-link.js";

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });
const mediaParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
  messageId: z.string().trim().min(1).max(128),
});
const querySchema = z.object({
  status: z.enum(["ACTIVE", "HUMAN_HANDOFF", "CLOSED"]).optional(),
  // Organizacao da inbox e estado de atendimento. A inbox em tres abas e do
  // Goal017; aqui o contrato so passa a aceitar o filtro.
  category: z.enum(["COMMERCIAL", "UNCLASSIFIED", "PERSONAL"]).optional(),
  handling: z.enum(["AI", "HUMAN"]).optional(),
  ignored: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const messageSchema = z.object({ text: z.string().trim().min(1).max(4_000) });
const categorySchema = z.object({
  category: z.enum(["COMMERCIAL", "UNCLASSIFIED", "PERSONAL"]).nullable(),
});
const ignoreSchema = z.object({ ignored: z.boolean() });
// Goal019/WU-07: mesmo limite de `tenantPhone` do teste real — validar aqui
// falha rápido, sem depender de uma viagem à IA para um corpo obviamente
// inválido.
const ignoreByPhoneSchema = z.object({
  phone: z.string().trim().min(8).max(20),
  ignored: z.boolean(),
});

export async function registerV1ConversationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const ai = new AiOrchestratorClient();

  app.get(
    "/v1/conversations",
    { preHandler: requireTenantContext },
    async (request) => {
      const query = parseQuery(querySchema, request.query);
      return dataResponse(
        request,
        await ai.listConversations(internalContext(request), query),
      );
    },
  );

  app.get(
    "/v1/conversations/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await ai.getConversation(internalContext(request), id),
      );
    },
  );

  app.get(
    "/v1/conversations/:id/messages",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await ai.listMessages(internalContext(request), id),
      );
    },
  );

  /**
   * Bytes de mídia de um attachment, sob demanda (Goal013/WU-06). Proxy fino
   * para a rota interna equivalente da IA: repassa o tenant da sessão, os
   * bytes e os cabeçalhos (`content-type`, nome). Recusas próprias da IA
   * (sem attachment, `tooLarge`, origem indisponível) chegam pelo mesmo
   * envelope de `UPSTREAM_ERROR` que as demais rotas, nunca `500` genérico.
   */
  app.get(
    "/v1/conversations/:id/messages/:messageId/media",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const { id, messageId } = parseParams(mediaParamsSchema, request.params);
      const media = await ai.getMedia(internalContext(request), id, messageId);
      reply.header("content-type", media.contentType);
      if (media.fileName) {
        reply.header(
          "content-disposition",
          `inline; filename="${media.fileName.replace(/"/gu, "")}"`,
        );
      }
      return reply.send(media.body);
    },
  );

  app.post(
    "/v1/conversations/:id/messages",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const { id } = parseParams(idSchema, request.params);
      const body = parseBody(messageSchema, request.body);
      const tenant = currentTenantContext(request);
      // O vínculo é resolvido pelo tenant autenticado, e a credencial não sai
      // daqui: quem envia é a IA, com a projeção que ela já guarda cifrada.
      const instance = await findLinkedInstance(tenant);
      if (!instance || instance.status !== "CONNECTED") {
        throw new AppError("CONFLICT", "WhatsApp is not connected.", 409);
      }
      const { message, status } = await ai.sendMessage(
        internalContext(request),
        id,
        { text: body.text },
      );
      // 201 e 202 sao os dois sucessos da rota interna, com sentidos
      // distintos: gravado e despachado ao transporte, ou gravado com a
      // entrega ainda nao confirmada. O BFF repassa o que a IA respondeu em
      // vez de apresentar o segundo como o primeiro; o estado real continua
      // em `deliveryState`.
      return reply
        .code(status === 202 ? 202 : 201)
        .send(dataResponse(request, message));
    },
  );

  // O tenant sai da sessao autenticada e o CSRF ja e exigido por
  // `requireTenantContext` nas mutacoes por cookie: nenhuma das rotas abaixo
  // aceita tenant por header, body ou query.
  app.put(
    "/v1/conversations/:id/category",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      const body = parseBody(categorySchema, request.body);
      return dataResponse(
        request,
        await ai.setCategory(internalContext(request), id, body),
      );
    },
  );

  app.put(
    "/v1/conversations/:id/ignore",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      const body = parseBody(ignoreSchema, request.body);
      return dataResponse(
        request,
        await ai.setIgnored(internalContext(request), id, body),
      );
    },
  );

  /**
   * Contato ignorado por telefone, sem conversa aberta ainda (Goal019/WU-07):
   * a etapa opcional de onboarding entre conectar e testar também aceita
   * número informado manualmente, criando o contato quando ele não existe.
   */
  app.put(
    "/v1/conversations/ignored-contacts",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(ignoreByPhoneSchema, request.body);
      return dataResponse(
        request,
        await ai.ignoreContactByPhone(internalContext(request), body),
      );
    },
  );

  /**
   * Sugestoes de resposta no atendimento humano (Goal012), sem autoenvio: a
   * profissional edita ou nao e envia pelo caminho humano ja existente
   * (`POST /v1/conversations/:id/messages`). Recusas proprias da IA (contato
   * ignorado, sessao pessoal, sem atendimento humano vigente, IA desligada)
   * chegam como qualquer outro erro da IA, pelo envelope de `UPSTREAM_ERROR`.
   */
  app.post(
    "/v1/conversations/:id/suggestions",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await ai.generateSuggestions(internalContext(request), id),
      );
    },
  );

  app.post(
    "/v1/conversations/:id/takeover",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      const conversation = await ai.takeover(internalContext(request), id);
      return dataResponse(request, conversation);
    },
  );

  app.post(
    "/v1/conversations/:id/release",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      const conversation = await ai.release(internalContext(request), id);
      return dataResponse(request, conversation);
    },
  );

  app.post(
    "/v1/conversations/:id/resolve",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      const conversation = await ai.resolve(internalContext(request), id);
      return dataResponse(request, conversation);
    },
  );
}
