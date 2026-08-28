import type { FastifyInstance } from "fastify";

import { checkDatabaseConnection } from "../infrastructure/database/prisma.js";
import { AppError } from "../shared/errors/app-error.js";

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get("/health", async (request) => {
    try {
      await checkDatabaseConnection();
    } catch {
      throw new AppError(
        "DEPENDENCY_UNAVAILABLE",
        "Database connection is unavailable.",
        503,
      );
    }

    return {
      status: "ok",
      service: "scheduling-service",
      dependencies: { database: "ok" },
      requestId: request.id,
    };
  });
}
