import "server-only";

import { z } from "zod";
import { bffFetch } from "@/lib/bff";
import type { ApiUser } from "@/types/domain";

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorResponse(message: string, status = 400, details?: unknown): Response {
  return Response.json({ ok: false, error: message, details }, { status });
}

export async function readJson<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError("Dados invalidos.", 400, parsed.error.flatten());
  }

  return parsed.data;
}

export async function requireSessionUser() {
  const { response, envelope } = await bffFetch<{ user: ApiUser }>("/auth/me");
  if (!response.ok || !envelope?.data?.user?.id) {
    throw new ApiError("Sessao invalida.", 401);
  }

  return envelope.data.user;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.message, error.status, error.details);
  }

  return errorResponse("Nao foi possivel concluir a operacao agora.", 500);
}
