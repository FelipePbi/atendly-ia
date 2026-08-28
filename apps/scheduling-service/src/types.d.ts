import type { InternalRequestContext } from "./shared/auth/internal-auth.js";

declare module "fastify" {
  interface FastifyRequest {
    internalContext?: InternalRequestContext;
  }
}
