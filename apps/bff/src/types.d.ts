import type { AuthCredentialKind, AuthenticatedUser } from "./lib/auth.js";
import type { ActiveSession } from "./lib/session.js";
import type { TenantContext } from "./lib/tenant-context.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    session?: ActiveSession;
    authCredentialKind?: AuthCredentialKind;
    tenantContext?: TenantContext;
  }
}
