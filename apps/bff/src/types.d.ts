import type { AuthenticatedUser } from "./lib/auth.js";
import type { TenantContext } from "./lib/tenant-context.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    tenantContext?: TenantContext;
  }
}
