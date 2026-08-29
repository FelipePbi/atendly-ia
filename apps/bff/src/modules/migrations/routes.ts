import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { SchedulingClient } from "../../clients/scheduling/index.js";
import { dataResponse, parseBody, parseParams } from "../../lib/http.js";
import { requireTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const idSchema = z.object({ id: z.string().trim().min(1).max(128) });
const migrationSchema = z.object({ target: z.enum(["ATENDLY", "EXTERNAL"]) });

export async function registerV1MigrationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();

  app.post(
    "/v1/calendar/migrations/diagnose",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(migrationSchema, request.body);
      return dataResponse(
        request,
        publicMigration(
          await scheduling.diagnoseMigration(internalContext(request), {
            target: internalSource(body.target),
          }),
        ),
      );
    },
  );

  app.post(
    "/v1/calendar/migrations",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const body = parseBody(migrationSchema, request.body);
      const migration = await scheduling.createMigration(
        internalContext(request),
        { target: internalSource(body.target) },
      );
      return reply
        .code(201)
        .send(dataResponse(request, publicMigration(migration)));
    },
  );

  app.get(
    "/v1/calendar/migrations/:id",
    { preHandler: requireTenantContext },
    async (request) => {
      const { id } = parseParams(idSchema, request.params);
      return dataResponse(
        request,
        publicMigration(
          await scheduling.getMigration(internalContext(request), id),
        ),
      );
    },
  );
}

function publicMigration<T extends Record<string, unknown>>(migration: T) {
  return {
    ...migration,
    ...(typeof migration.source === "string"
      ? { source: publicSource(migration.source) }
      : {}),
    ...(typeof migration.target === "string"
      ? { target: publicSource(migration.target) }
      : {}),
  };
}

function internalSource(source: "ATENDLY" | "EXTERNAL") {
  return source === "ATENDLY"
    ? ("ATENDLY" as const)
    : ("MINHA_AGENDA" as const);
}

function publicSource(source: string) {
  return source === "ATENDLY" ? "ATENDLY" : "EXTERNAL";
}
