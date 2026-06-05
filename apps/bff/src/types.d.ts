import type { AuthenticatedUser } from "./lib/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
