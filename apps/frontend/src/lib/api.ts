import "server-only";

import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new ApiError("Sessao invalida.", 401);
  }

  return session.user;
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
