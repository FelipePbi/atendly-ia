import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  login,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * D-181 — aparência da conta, contra PostgreSQL real.
 *
 * - sem linha, `GET /v1/settings/appearance` devolve o padrão do produto
 *   (`VERDE`, `LIGHT`) e não grava nada;
 * - `PATCH` grava, preserva o campo ausente e recusa valor fora da lista ou
 *   campo desconhecido;
 * - a escolha é da pessoa: uma nova sessão (outro aparelho) lê a mesma, e
 *   outra conta não é tocada;
 * - sem sessão, `401`; com cookie e sem CSRF, recusado.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function account(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function getAppearance(owner: SessionHandle) {
  return app.inject({
    method: "GET",
    url: "/v1/settings/appearance",
    headers: browserRead(owner),
  });
}

function patchAppearance(owner: SessionHandle, payload: unknown) {
  return app.inject({
    method: "PATCH",
    url: "/v1/settings/appearance",
    headers: browserMutation(owner),
    payload: payload as Record<string, unknown>,
  });
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("D-181: aparência da conta", () => {
  it("sem linha devolve o padrão e não grava", async () => {
    const owner = await account("appearance-default");

    const response = await getAppearance(owner);

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ accent: "VERDE", mode: "LIGHT" });
    expect(
      await getPrisma().appearancePreference.count({
        where: { userId: owner.userId },
      }),
    ).toBe(0);
  });

  it("grava, preserva o campo ausente e vale numa sessão nova", async () => {
    const owner = await account("appearance-save");

    const first = await patchAppearance(owner, { accent: "CHAMPANHE" });
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toEqual({ accent: "CHAMPANHE", mode: "LIGHT" });

    const second = await patchAppearance(owner, { mode: "DARK" });
    expect(second.json().data).toEqual({ accent: "CHAMPANHE", mode: "DARK" });

    // Outro aparelho: outra sessão da mesma pessoa.
    const otherDevice = await login(app, owner);
    const read = await getAppearance(otherDevice);
    expect(read.json().data).toEqual({ accent: "CHAMPANHE", mode: "DARK" });
  });

  it("não toca outra conta", async () => {
    const owner = await account("appearance-owner");
    const neighbor = await account("appearance-neighbor");

    await patchAppearance(owner, { accent: "ROSE", mode: "SYSTEM" });

    const read = await getAppearance(neighbor);
    expect(read.json().data).toEqual({ accent: "VERDE", mode: "LIGHT" });
  });

  it("recusa valor fora da lista e campo desconhecido", async () => {
    const owner = await account("appearance-invalid");

    for (const payload of [
      { accent: "VERDE_LIMAO" },
      { mode: "AUTO" },
      { accent: "ROSE", color: "#ff00ff" },
    ]) {
      const response = await patchAppearance(owner, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
    const read = await getAppearance(owner);
    expect(read.json().data).toEqual({ accent: "VERDE", mode: "LIGHT" });
  });

  it("sem sessão é 401 e sem CSRF não grava", async () => {
    const owner = await account("appearance-auth");

    const anonymous = await app.inject({
      method: "GET",
      url: "/v1/settings/appearance",
    });
    expect(anonymous.statusCode).toBe(401);

    const withoutCsrf = await app.inject({
      method: "PATCH",
      url: "/v1/settings/appearance",
      headers: { ...browserRead(owner), "content-type": "application/json" },
      payload: { mode: "DARK" },
    });
    expect(withoutCsrf.statusCode).toBeGreaterThanOrEqual(400);
    const read = await getAppearance(owner);
    expect(read.json().data.mode).toBe("LIGHT");
  });
});
