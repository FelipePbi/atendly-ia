import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import {
  dataResponse,
  parseBody,
  parseParams,
  parseQuery,
} from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

// Mesmo vocabulario de `KnowledgeDocument.type` fixado pelo WU-01 da IA.
const knowledgeDocumentTypeSchema = z.enum([
  "FAQ",
  "GUIDANCE",
  "CARE",
  "PROCEDURE",
  "BUSINESS_INFO",
  "TEXT_POLICY",
]);

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });

const listQuerySchema = z.object({
  type: knowledgeDocumentTypeSchema.optional(),
  serviceId: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const chunkSchema = z
  .object({
    content: z.string().trim().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const createDocumentSchema = z
  .object({
    type: knowledgeDocumentTypeSchema,
    serviceId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    source: z.string().trim().min(1).optional(),
    chunks: z.array(chunkSchema).min(1),
  })
  .strict();

const editDocumentSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    serviceId: z.string().trim().min(1).nullable().optional(),
    chunks: z.array(chunkSchema).min(1),
  })
  .strict();

const otherInfoSchema = z.object({ content: z.string().trim().min(1) }).strict();

/**
 * Conhecimento do negocio editavel pelo modulo (Goal012, WU-01/WU-06): FAQ
 * geral e por servico, orientacoes, cuidados, procedimentos e politicas
 * textuais, alem do campo livre "Outras informacoes importantes". Cada rota
 * so repassa o contrato fixado pela IA, com tenant da sessao e CSRF.
 */
export async function registerV1KnowledgeRoutes(
  app: FastifyInstance,
): Promise<void> {
  const ai = new AiOrchestratorClient();
  const authenticated = { preHandler: requireTenantContext };

  app.get("/v1/knowledge/documents", authenticated, async (request) => {
    const query = parseQuery(listQuerySchema, request.query);
    return dataResponse(
      request,
      await ai.listKnowledgeDocuments(internalContext(request), query),
    );
  });

  app.post(
    "/v1/knowledge/documents",
    authenticated,
    async (request, reply) => {
      const body = parseBody(createDocumentSchema, request.body);
      const document = await ai.createKnowledgeDocument(
        internalContext(request),
        body,
      );
      return reply.code(201).send(dataResponse(request, document));
    },
  );

  app.get("/v1/knowledge/documents/:id", authenticated, async (request) => {
    const { id } = parseParams(idSchema, request.params);
    return dataResponse(
      request,
      await ai.getKnowledgeDocument(internalContext(request), id),
    );
  });

  app.put("/v1/knowledge/documents/:id", authenticated, async (request) => {
    const { id } = parseParams(idSchema, request.params);
    const body = parseBody(editDocumentSchema, request.body);
    return dataResponse(
      request,
      await ai.editKnowledgeDocument(internalContext(request), id, body),
    );
  });

  app.delete(
    "/v1/knowledge/documents/:id",
    authenticated,
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await ai.deactivateKnowledgeDocument(internalContext(request), id),
      );
    },
  );

  app.put("/v1/knowledge/other-info", authenticated, async (request) => {
    const body = parseBody(otherInfoSchema, request.body);
    return dataResponse(
      request,
      await ai.saveOtherInfo(internalContext(request), body),
    );
  });
}
