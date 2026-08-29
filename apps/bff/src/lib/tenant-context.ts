import type { FastifyRequest } from "fastify";

import { currentUser, requireAuth } from "./auth.js";
import { AppError } from "./errors.js";
import { getPrisma } from "./prisma.js";

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: "OWNER";
}

export async function resolveTenantContext(
  request: FastifyRequest,
): Promise<void> {
  const user = currentUser(request);
  const memberships = await getPrisma().tenantMember.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 2,
    select: {
      tenantId: true,
      userId: true,
      role: true,
      tenant: { select: { id: true } },
    },
  });

  if (memberships.length === 0) {
    throw new AppError(
      "FORBIDDEN",
      "No tenant membership is associated with this session.",
      403,
    );
  }

  if (memberships.length > 1) {
    throw new AppError(
      "CONFLICT",
      "Session is associated with more than one tenant.",
      409,
    );
  }

  const [membership] = memberships;
  if (!membership || membership.role !== "OWNER") {
    throw new AppError(
      "FORBIDDEN",
      "Tenant membership role is not supported.",
      403,
    );
  }

  request.tenantContext = {
    userId: membership.userId,
    tenantId: membership.tenant.id,
    role: membership.role,
  };
}

export async function requireTenantContext(
  request: FastifyRequest,
): Promise<void> {
  await requireAuth(request);
  await resolveTenantContext(request);
}

export function currentTenantContext(request: FastifyRequest): TenantContext {
  if (!request.tenantContext) {
    throw new AppError("FORBIDDEN", "Tenant context is required.", 403);
  }

  return request.tenantContext;
}
