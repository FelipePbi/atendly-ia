import type { FastifyInstance, InjectOptions } from "fastify";
import { expect } from "vitest";

import { CURRENT_LEGAL_VERSIONS } from "../../src/config/legal-versions.js";
import { env } from "../../src/config/env.js";
import { getPrisma } from "../../src/lib/prisma.js";

export const RUN_INTEGRATION = process.env.BFF_RUN_INTEGRATION_TESTS === "true";
export const TEST_DATABASE_URL =
  process.env.BFF_TEST_DATABASE_URL?.trim() ?? "";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Confere que a suíte está falando com o banco descartável declarado, e não com
 * `.env` local nem com outro servidor de mesmo nome de banco.
 */
export async function assertDisposableTarget(): Promise<void> {
  if (!TEST_DATABASE_URL) {
    throw new Error(
      "BFF_TEST_DATABASE_URL is required when BFF_RUN_INTEGRATION_TESTS=true.",
    );
  }
  if (env.DATABASE_URL !== TEST_DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be the disposable database named by BFF_TEST_DATABASE_URL.",
    );
  }

  const url = new URL(TEST_DATABASE_URL);
  const [endpoint] = await getPrisma().$queryRaw<
    { database: string; port: number; address: string | null }[]
  >`SELECT current_database() AS database, inet_server_port() AS port, host(inet_server_addr()) AS address`;

  const expectedDatabase = decodeURIComponent(
    url.pathname.replace(/^\//u, ""),
  );
  if (endpoint.database !== expectedDatabase) {
    throw new Error(
      `Connected database ${endpoint.database} is not the declared test database.`,
    );
  }
  if (Number(endpoint.port) !== Number(url.port || "5432")) {
    throw new Error(
      `Connected server port ${endpoint.port} is not the declared test port.`,
    );
  }
  if (endpoint.address !== null && !LOOPBACK_HOSTS.has(endpoint.address)) {
    throw new Error(
      `Connected server address ${endpoint.address} is not loopback.`,
    );
  }
}

export const ALLOWED_ORIGIN = env.FRONTEND_ORIGIN;
export const HOSTILE_ORIGIN = "https://evil.example.invalid";

export interface SessionHandle {
  email: string;
  password: string;
  userId: string;
  tenantId: string;
  sessionCookie: string;
  csrfToken: string;
  bearer: string;
}

export function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? "";
}

/**
 * Token de CSRF como o navegador o obtém em produção: pelo header da resposta.
 *
 * O cookie legível continua sendo emitido, mas fica no host do BFF e o script
 * do frontend não o alcança. As fixtures usam o header de propósito, para que a
 * suíte exercite o canal que o adapter realmente usa.
 */
export function csrfTokenValue(response: {
  headers: Record<string, unknown>;
}): string {
  const value = response.headers[env.CSRF_HEADER_NAME.toLowerCase()];
  return String(Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));
}

/** Cabeçalhos de uma mutação legítima vinda do frontend. */
export function browserMutation(session: SessionHandle): InjectOptions["headers"] {
  return {
    origin: ALLOWED_ORIGIN,
    cookie: `${env.SESSION_COOKIE_NAME}=${session.sessionCookie}`,
    [env.CSRF_HEADER_NAME]: session.csrfToken,
  };
}

export function browserRead(session: SessionHandle): InjectOptions["headers"] {
  return { cookie: `${env.SESSION_COOKIE_NAME}=${session.sessionCookie}` };
}

/**
 * Cadastra um negócio real: usuário, tenant, membership, perfil e sessão. Cada
 * chamada devolve um handle independente, para exercitar A contra B.
 */
export async function registerBusiness(
  app: FastifyInstance,
  label: string,
): Promise<SessionHandle> {
  const email = `goal003-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const password = "Integration-only-123";

  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers: { origin: ALLOWED_ORIGIN },
    payload: {
      email,
      password,
      confirmPassword: password,
      termsAccepted: true,
      ...CURRENT_LEGAL_VERSIONS,
    },
  });
  expect(response.statusCode).toBe(201);

  const user = await getPrisma().user.findUniqueOrThrow({
    where: { email },
    include: { tenantMemberships: true },
  });
  const tenantId = user.tenantMemberships[0]!.tenantId;

  return {
    email,
    password,
    userId: user.id,
    tenantId,
    sessionCookie: cookieValue(response, env.SESSION_COOKIE_NAME),
    csrfToken: csrfTokenValue(response),
    // Mesmo portador, apresentado como credencial de serviço.
    bearer: cookieValue(response, env.SESSION_COOKIE_NAME),
  };
}

export async function login(
  app: FastifyInstance,
  session: SessionHandle,
): Promise<SessionHandle> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { origin: ALLOWED_ORIGIN },
    payload: { email: session.email, password: session.password },
  });
  expect(response.statusCode).toBe(200);

  const sessionCookie = cookieValue(response, env.SESSION_COOKIE_NAME);
  return {
    ...session,
    sessionCookie,
    bearer: sessionCookie,
    csrfToken: csrfTokenValue(response),
  };
}

/** Remove tudo que a fixture criou, incluindo o vínculo WhatsApp sintético. */
export async function cleanupBusinesses(
  sessions: SessionHandle[],
): Promise<void> {
  const prisma = getPrisma();
  for (const session of sessions) {
    await prisma.whatsAppInstance.deleteMany({
      where: { userId: session.userId },
    });
    await prisma.user.deleteMany({ where: { id: session.userId } });
    await prisma.tenant.deleteMany({ where: { id: session.tenantId } });
  }
}
