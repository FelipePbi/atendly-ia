import { randomBytes } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { AppError } from "../src/lib/errors.js";
import {
  openInstanceCredential,
  sealInstanceCredential,
} from "../src/lib/instance-credentials.js";
import { getPrisma } from "../src/lib/prisma.js";
import type { TenantContext } from "../src/lib/tenant-context.js";
import {
  findLinkedInstance,
  resolveInstanceCredential,
  sealedInstanceCredentialData,
} from "../src/modules/whatsapp/instance-link.js";
import {
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Vínculo tenant/instância e credencial cifrada — contra persistência real.
 *
 * Dois negócios completos e independentes: A usa os seus objetos, B usa os
 * dele, e nenhum consulta o vínculo do outro. Estados ambíguos são recusados
 * antes de qualquer uso.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

const SYNTHETIC_CREDENTIAL_A = "wa_synthetic_credential_business_a";
const SYNTHETIC_CREDENTIAL_B = "wa_synthetic_credential_business_b";

function context(session: SessionHandle): TenantContext {
  return {
    userId: session.userId,
    tenantId: session.tenantId,
    role: "OWNER",
  };
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

async function linkInstance(
  session: SessionHandle,
  credential: string,
  name: string,
) {
  return getPrisma().whatsAppInstance.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      evolutionInstanceId: `${name}-id`,
      evolutionInstanceName: name,
      status: "CONNECTED",
      ...sealedInstanceCredentialData(credential, {
        tenantId: session.tenantId,
        evolutionInstanceName: name,
      }),
    },
  });
}

describe.skipIf(!RUN_INTEGRATION)("tenant to WhatsApp instance link", () => {
  beforeAll(async () => {
    app = await buildApp();
    await assertDisposableTarget();
  });

  afterAll(async () => {
    if (!app) return;
    await cleanupBusinesses(created);
    for (const session of created) {
      expect(
        await getPrisma().whatsAppInstance.count({
          where: { userId: session.userId },
        }),
      ).toBe(0);
    }
    await app.close();
  });

  it("resolves each business to its own instance and never to the other one", async () => {
    const a = await business("link-a");
    const b = await business("link-b");
    const suffix = randomBytes(3).toString("hex");
    await linkInstance(a, SYNTHETIC_CREDENTIAL_A, `link_a_${suffix}`);
    await linkInstance(b, SYNTHETIC_CREDENTIAL_B, `link_b_${suffix}`);

    const forA = await findLinkedInstance(context(a));
    const forB = await findLinkedInstance(context(b));

    expect(forA?.tenantId).toBe(a.tenantId);
    expect(forA?.userId).toBe(a.userId);
    expect(forB?.tenantId).toBe(b.tenantId);
    expect(forA?.id).not.toBe(forB?.id);

    // Proveniência do usuário é conservada junto com o dono de negócio.
    expect(await resolveInstanceCredential(forA!)).toBe(SYNTHETIC_CREDENTIAL_A);
    expect(await resolveInstanceCredential(forB!)).toBe(SYNTHETIC_CREDENTIAL_B);
  });

  it("refuses a tenant whose link is absent", async () => {
    const a = await business("link-absent");
    expect(await findLinkedInstance(context(a))).toBeNull();

    const response = await app.inject({
      method: "GET",
      url: "/v1/whatsapp",
      headers: browserRead(a),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toBeNull();
  });

  it("refuses a link whose business owner was left pending by the backfill", async () => {
    const a = await business("link-pending");
    const suffix = randomBytes(3).toString("hex");
    const instance = await linkInstance(
      a,
      SYNTHETIC_CREDENTIAL_A,
      `link_pending_${suffix}`,
    );
    // Estoque legado ambíguo: a linha existe para o usuário, mas sem dono.
    await getPrisma().whatsAppInstance.update({
      where: { id: instance.id },
      data: { tenantId: null },
    });

    await expect(findLinkedInstance(context(a))).rejects.toThrowError(AppError);
    const response = await app.inject({
      method: "GET",
      url: "/v1/whatsapp",
      headers: browserRead(a),
    });
    expect(response.statusCode).toBe(409);
  });

  it("lets the owner of a pending link discard it and link the number again", async () => {
    const a = await business("link-pending-discard");
    const suffix = randomBytes(3).toString("hex");
    const instance = await linkInstance(
      a,
      SYNTHETIC_CREDENTIAL_A,
      `link_discard_${suffix}`,
    );
    await getPrisma().whatsAppInstance.update({
      where: { id: instance.id },
      data: { tenantId: null },
    });

    // A recusa aponta o caminho que existe de verdade.
    const blocked = await app.inject({
      method: "GET",
      url: "/v1/whatsapp",
      headers: browserRead(a),
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.message).toContain("DELETE /v1/whatsapp");

    // Descarte pelo próprio dono: userId da linha é o do contexto autenticado
    // e nenhum outro negócio a reivindica.
    const discarded = await app.inject({
      method: "DELETE",
      url: "/v1/whatsapp",
      headers: browserMutation(a),
    });
    expect(discarded.statusCode).toBe(200);
    expect(discarded.json().data.disconnected).toBe(true);
    expect(
      await getPrisma().whatsAppInstance.count({ where: { id: instance.id } }),
    ).toBe(0);

    // E o negócio volta a poder vincular um número.
    expect(await findLinkedInstance(context(a))).toBeNull();
    const relinked = await linkInstance(
      a,
      SYNTHETIC_CREDENTIAL_A,
      `link_relinked_${suffix}`,
    );
    expect((await findLinkedInstance(context(a)))?.id).toBe(relinked.id);
  });

  it("does not let the disconnect route resolve a divergence between two businesses", async () => {
    const a = await business("link-divergent-delete-a");
    const b = await business("link-divergent-delete-b");
    const suffix = randomBytes(3).toString("hex");
    const instance = await linkInstance(
      b,
      SYNTHETIC_CREDENTIAL_B,
      `link_div_delete_${suffix}`,
    );
    await getPrisma().whatsAppInstance.update({
      where: { id: instance.id },
      data: { tenantId: a.tenantId },
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/whatsapp",
      headers: browserMutation(a),
    });
    expect(response.statusCode).toBe(409);
    // Nada foi apagado: resolver aqui seria decidir pelo negócio de B.
    expect(
      await getPrisma().whatsAppInstance.count({ where: { id: instance.id } }),
    ).toBe(1);
  });

  it("refuses a link whose business owner diverges from the authenticated user", async () => {
    const a = await business("link-divergent-a");
    const b = await business("link-divergent-b");
    const suffix = randomBytes(3).toString("hex");
    const instance = await linkInstance(
      b,
      SYNTHETIC_CREDENTIAL_B,
      `link_divergent_${suffix}`,
    );
    // Instância de B remapeada para o tenant de A: divergência, não adoção.
    await getPrisma().whatsAppInstance.update({
      where: { id: instance.id },
      data: { tenantId: a.tenantId },
    });

    // Nem A nem B usam o vínculo enquanto a divergência não for resolvida
    // explicitamente: A não vira dono por estar no campo, e B não continua dono
    // por proveniência. Nenhum dos dois recebe a instância do outro.
    await expect(findLinkedInstance(context(a))).rejects.toThrowError(AppError);
    await expect(findLinkedInstance(context(b))).rejects.toThrowError(AppError);
  });

  it("keeps one number per business at the database level", async () => {
    const a = await business("link-cardinality-a");
    const b = await business("link-cardinality-b");
    const suffix = randomBytes(3).toString("hex");
    await linkInstance(a, SYNTHETIC_CREDENTIAL_A, `link_card_${suffix}`);

    await expect(
      getPrisma().whatsAppInstance.create({
        data: {
          userId: b.userId,
          tenantId: a.tenantId,
          evolutionInstanceName: `link_card_dup_${suffix}`,
          status: "CREATED",
          ...sealedInstanceCredentialData(SYNTHETIC_CREDENTIAL_B, {
            tenantId: a.tenantId,
            evolutionInstanceName: `link_card_dup_${suffix}`,
          }),
        },
      }),
    ).rejects.toThrowError();
  });

  it("does not let the browser choose a tenant by header or body", async () => {
    const a = await business("tenant-selection-a");
    const b = await business("tenant-selection-b");

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        ...browserRead(a),
        "x-tenant-id": b.tenantId,
        "x-user-id": b.userId,
      },
      query: { tenantId: b.tenantId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.tenant.id).toBe(a.tenantId);
    expect(response.json().data.user.id).toBe(a.userId);
  });

  it("stores the instance credential sealed and bound to the business", async () => {
    const a = await business("credential-sealed");
    const suffix = randomBytes(3).toString("hex");
    const name = `credential_${suffix}`;
    const created = await linkInstance(a, SYNTHETIC_CREDENTIAL_A, name);

    expect(created.evolutionInstanceToken).not.toContain(
      SYNTHETIC_CREDENTIAL_A,
    );
    expect(created.credentialVersion).toBe(1);
    expect(created.credentialKeyId).not.toBeNull();

    const binding = { tenantId: a.tenantId, evolutionInstanceName: name };
    expect(openInstanceCredential(created.evolutionInstanceToken, binding)).toBe(
      SYNTHETIC_CREDENTIAL_A,
    );

    // O envelope de A não abre no vínculo de outro negócio.
    expect(() =>
      openInstanceCredential(created.evolutionInstanceToken, {
        tenantId: "another-tenant",
        evolutionInstanceName: name,
      }),
    ).toThrowError(/could not be decrypted/u);
  });

  it("seals legacy plain-text stock on first read, without ever falling back", async () => {
    const a = await business("credential-legacy");
    const suffix = randomBytes(3).toString("hex");
    const name = `legacy_${suffix}`;
    const legacy = await getPrisma().whatsAppInstance.create({
      data: {
        userId: a.userId,
        tenantId: a.tenantId,
        evolutionInstanceName: name,
        evolutionInstanceToken: SYNTHETIC_CREDENTIAL_A,
        credentialVersion: 0,
        status: "CREATED",
      },
    });

    const linked = await findLinkedInstance(context(a));
    expect(await resolveInstanceCredential(linked!)).toBe(
      SYNTHETIC_CREDENTIAL_A,
    );

    const sanitised = await getPrisma().whatsAppInstance.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(sanitised.credentialVersion).toBe(1);
    expect(sanitised.evolutionInstanceToken).not.toContain(
      SYNTHETIC_CREDENTIAL_A,
    );
  });

  it("refuses a credential that was sealed for another instance name", async () => {
    const a = await business("credential-rebound");
    const suffix = randomBytes(3).toString("hex");
    const name = `rebound_${suffix}`;
    const foreign = sealInstanceCredential(SYNTHETIC_CREDENTIAL_B, {
      tenantId: a.tenantId,
      evolutionInstanceName: `other_${suffix}`,
    });

    const instance = await getPrisma().whatsAppInstance.create({
      data: {
        userId: a.userId,
        tenantId: a.tenantId,
        evolutionInstanceName: name,
        evolutionInstanceToken: foreign.envelope,
        credentialKeyId: foreign.keyId,
        credentialVersion: foreign.version,
        status: "CREATED",
      },
    });

    const linked = await findLinkedInstance(context(a));
    expect(linked?.id).toBe(instance.id);
    await expect(resolveInstanceCredential(linked!)).rejects.toThrowError(
      /could not be decrypted/u,
    );
  });
});
