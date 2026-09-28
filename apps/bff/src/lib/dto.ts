import type {
  BusinessProfile,
  Tenant,
  User,
} from "../generated/prisma/client.js";

export function userDto(
  user: Pick<User, "id" | "email" | "name" | "createdAt">,
) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: toIso(user.createdAt),
  };
}

export function tenantDto(
  tenant: Pick<Tenant, "id" | "name" | "createdAt" | "updatedAt">,
  role: "OWNER",
) {
  return {
    id: tenant.id,
    name: tenant.name,
    role,
    createdAt: toIso(tenant.createdAt),
    updatedAt: toIso(tenant.updatedAt),
  };
}

export function businessProfileDto(profile: BusinessProfile | null) {
  if (!profile) return null;

  return {
    id: profile.id,
    businessName: profile.businessName,
    category: profile.category,
    timezone: profile.timezone,
    language: profile.language,
    currency: profile.currency,
    modalities: profile.modalities,
    address: profile.address,
    createdAt: toIso(profile.createdAt),
    updatedAt: toIso(profile.updatedAt),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
