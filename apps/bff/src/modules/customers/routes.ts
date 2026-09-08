import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { SchedulingClient } from "../../clients/scheduling/index.js";
import {
  dataResponse,
  parseBody,
  parseParams,
  parseQuery,
} from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });
const childSchema = z.object({
  id: z.string().trim().min(1).max(128),
  childId: z.string().trim().min(1).max(128),
});
const listQuerySchema = z.object({
  // Busca por telefone devolve candidatos, não uma pessoa: o número não prova
  // identidade (D-005).
  phone: z.string().trim().min(6).max(32).optional(),
});
// Telefone deixou de ser obrigatório: cliente sem telefone existe (criança,
// pessoa agendada presencialmente). O que não pode é nascer sem nada.
const customerSchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable().optional(),
    phone: z.string().trim().min(6).max(32).nullable().optional(),
  })
  .refine((value) => Boolean(value.name ?? value.phone), {
    path: ["name"],
    message: "Informe ao menos um nome ou um telefone.",
  });
const customerPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).nullable().optional(),
    phone: z.string().trim().min(6).max(32).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo.",
  });
const primaryGuardianSchema = z.object({
  guardianCustomerId: z.string().trim().min(1).max(128),
  // O painel é a profissional: a relação criada aqui pode nascer confirmada,
  // mas isso continua sendo uma decisão explícita de quem chamou.
  proposedBy: z.enum(["PROFESSIONAL", "CUSTOMER"]).default("PROFESSIONAL"),
  proposedByActor: z.string().trim().max(200).nullable().optional(),
  confirmedBy: z.enum(["PROFESSIONAL", "CUSTOMER"]).nullable().optional(),
  confirmedByActor: z.string().trim().max(200).nullable().optional(),
});
const primaryGuardianConfirmSchema = z.object({
  confirmedBy: z.enum(["PROFESSIONAL", "CUSTOMER"]).default("PROFESSIONAL"),
  actor: z.string().trim().max(200).nullable().optional(),
});
const noteSchema = z.object({
  body: z.string().trim().min(1).max(2_000),
  // Autorização de uso pela IA nasce negada e é atributo do registro.
  aiAuthorized: z.boolean().default(false),
  actor: z.string().trim().max(200).nullable().optional(),
});
const tagSchema = z.object({
  label: z.string().trim().min(1).max(60),
  aiAuthorized: z.boolean().default(false),
  actor: z.string().trim().max(200).nullable().optional(),
});
const authorizationSchema = z.object({
  aiAuthorized: z.boolean(),
  actor: z.string().trim().max(200).nullable().optional(),
});

export async function registerV1CustomerRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();
  const authenticated = { preHandler: requireTenantContext };

  app.get("/v1/customers", authenticated, async (request) => {
    const query = parseQuery(listQuerySchema, request.query);
    const result = await scheduling.listCustomers(
      internalContext(request),
      query,
    );
    return dataResponse(request, {
      ...result,
      source: result.source === "ATENDLY" ? "ATENDLY" : "EXTERNAL",
    });
  });

  app.get("/v1/customers/:id", authenticated, async (request) => {
    const { id } = parseParams(idSchema, request.params);
    return dataResponse(
      request,
      await scheduling.getCustomer(internalContext(request), id),
    );
  });

  app.post("/v1/customers", authenticated, async (request, reply) => {
    const customer = await scheduling.createCustomer(
      internalContext(request),
      parseBody(customerSchema, request.body),
    );
    return reply.code(201).send(dataResponse(request, customer));
  });

  /** Nome e telefone só mudam aqui. Nenhuma outra rota renomeia uma pessoa. */
  app.patch("/v1/customers/:id", authenticated, async (request) => {
    const { id } = parseParams(idSchema, request.params);
    return dataResponse(
      request,
      await scheduling.updateCustomer(
        internalContext(request),
        id,
        parseBody(customerPatchSchema, request.body),
      ),
    );
  });

  app.put(
    "/v1/customers/:id/primary-guardian",
    authenticated,
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.setCustomerPrimaryGuardian(
          internalContext(request),
          id,
          parseBody(primaryGuardianSchema, request.body),
        ),
      );
    },
  );

  app.post(
    "/v1/customers/:id/primary-guardian/confirm",
    authenticated,
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.confirmCustomerPrimaryGuardian(
          internalContext(request),
          id,
          parseBody(primaryGuardianConfirmSchema, request.body ?? {}),
        ),
      );
    },
  );

  app.delete(
    "/v1/customers/:id/primary-guardian",
    authenticated,
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        await scheduling.clearCustomerPrimaryGuardian(
          internalContext(request),
          id,
        ),
      );
    },
  );

  app.post("/v1/customers/:id/notes", authenticated, async (request, reply) => {
    const { id } = parseParams(idSchema, request.params);
    const note = await scheduling.createCustomerNote(
      internalContext(request),
      id,
      parseBody(noteSchema, request.body),
    );
    return reply.code(201).send(dataResponse(request, note));
  });

  app.patch(
    "/v1/customers/:id/notes/:childId",
    authenticated,
    async (request) => {
      const params = parseParams(childSchema, request.params);
      return dataResponse(
        request,
        await scheduling.updateCustomerNote(
          internalContext(request),
          params.id,
          params.childId,
          parseBody(authorizationSchema, request.body),
        ),
      );
    },
  );

  app.delete(
    "/v1/customers/:id/notes/:childId",
    authenticated,
    async (request) => {
      const params = parseParams(childSchema, request.params);
      return dataResponse(
        request,
        await scheduling.deleteCustomerNote(
          internalContext(request),
          params.id,
          params.childId,
        ),
      );
    },
  );

  app.post("/v1/customers/:id/tags", authenticated, async (request, reply) => {
    const { id } = parseParams(idSchema, request.params);
    const tag = await scheduling.createCustomerTag(
      internalContext(request),
      id,
      parseBody(tagSchema, request.body),
    );
    return reply.code(201).send(dataResponse(request, tag));
  });

  app.patch(
    "/v1/customers/:id/tags/:childId",
    authenticated,
    async (request) => {
      const params = parseParams(childSchema, request.params);
      return dataResponse(
        request,
        await scheduling.updateCustomerTag(
          internalContext(request),
          params.id,
          params.childId,
          parseBody(authorizationSchema, request.body),
        ),
      );
    },
  );

  app.delete(
    "/v1/customers/:id/tags/:childId",
    authenticated,
    async (request) => {
      const params = parseParams(childSchema, request.params);
      return dataResponse(
        request,
        await scheduling.deleteCustomerTag(
          internalContext(request),
          params.id,
          params.childId,
        ),
      );
    },
  );
}
