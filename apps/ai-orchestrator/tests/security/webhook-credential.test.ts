import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

const KEY_V1 = randomBytes(32).toString("base64");
const CREDENTIAL_A = "wa_synthetic_credential_tenant_a_01";
const CREDENTIAL_B = "wa_synthetic_credential_tenant_b_02";

async function load() {
  vi.resetModules();
  vi.stubEnv("CHANNEL_CREDENTIAL_KEYS", `v1:${KEY_V1}`);
  vi.stubEnv("CHANNEL_CREDENTIAL_ACTIVE_KEY_ID", "v1");
  const [{ ChannelConnectionService }, cipher, { redactSensitive }] =
    await Promise.all([
      import("../../src/modules/channel/ChannelConnectionService.js"),
      import("../../src/lib/channel-credentials.js"),
      import("../../src/lib/redact.js"),
    ]);
  return { ChannelConnectionService, cipher, redactSensitive };
}

/** Prisma mínimo: só o que a resolução do inbound consulta. */
function prismaWith(connections: Record<string, unknown>) {
  return {
    channelConnection: {
      findUnique: async ({
        where,
      }: {
        where: { provider_externalInstanceId?: { externalInstanceId: string } };
      }) => connections[where.provider_externalInstanceId?.externalInstanceId ?? ""] ?? null,
    },
    aiTenantConfig: {
      findUnique: async () => null,
    },
  } as never;
}

const inbound = (instanceId: string, token: string) => ({
  provider: "evolution-go" as const,
  instanceId,
  externalMessageId: "message-1",
  externalContactId: "5511999999999@s.whatsapp.net",
  text: "oi",
  fromMe: false,
  raw: { instanceToken: token, apikey: token, event: "Message" },
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("evolution webhook credential resolution", () => {
  it("uses the credential bound to the connection, not the one in the payload", async () => {
    const { ChannelConnectionService, cipher } = await load();
    const sealedA = cipher.sealChannelCredential(CREDENTIAL_A, {
      tenantId: "tenant-a",
      externalInstanceId: "instance-a",
    });
    const connectionA = {
      id: "channel-a",
      tenantId: "tenant-a",
      userId: "user-a",
      externalInstanceId: "instance-a",
      status: "ACTIVE",
      credentialCipher: sealedA.envelope,
      credentialKeyId: sealedA.keyId,
      credentialVersion: sealedA.version,
    };

    const service = new ChannelConnectionService(
      prismaWith({ "instance-a": connectionA }),
    );

    const resolved = await service.resolveEvolutionInboundContext({
      message: inbound("instance-a", "attacker-supplied-token") as never,
      requestId: "request-1",
    });

    expect(resolved.message.tenantId).toBe("tenant-a");
    expect(service.resolveChannelCredential(resolved.connection)).toBe(
      CREDENTIAL_A,
    );
  });

  it("does not let the connection of A obtain the credential of B", async () => {
    const { ChannelConnectionService, cipher } = await load();
    const sealedB = cipher.sealChannelCredential(CREDENTIAL_B, {
      tenantId: "tenant-b",
      externalInstanceId: "instance-b",
    });

    const service = new ChannelConnectionService(prismaWith({}));

    // Envelope de B copiado para o vínculo de A não abre: a cifra está ligada
    // ao vínculo, não apenas à chave.
    expect(() =>
      service.resolveChannelCredential({
        tenantId: "tenant-a",
        externalInstanceId: "instance-a",
        credentialCipher: sealedB.envelope,
        credentialVersion: sealedB.version,
      }),
    ).toThrowError(/could not be decrypted/u);
  });

  it("refuses to send when the connection has no provisioned credential", async () => {
    const { ChannelConnectionService } = await load();
    const service = new ChannelConnectionService(prismaWith({}));

    expect(() =>
      service.resolveChannelCredential({
        tenantId: "tenant-a",
        externalInstanceId: "instance-a",
        credentialCipher: null,
        credentialVersion: 0,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "CHANNEL_CREDENTIAL_NOT_PROVISIONED" }),
    );
  });

  it("strips secrets from the payload before it can be persisted as raw", async () => {
    const { redactSensitive } = await load();

    const sanitized = redactSensitive({
      event: "Message",
      instanceToken: "wa_secret_from_webhook",
      apikey: "wa_secret_from_webhook",
      headers: { authorization: "Bearer wa_secret_from_webhook" },
      data: {
        credentials: { token: "wa_secret_from_webhook" },
        Info: { ID: "message-1" },
      },
    });

    expect(JSON.stringify(sanitized)).not.toContain("wa_secret_from_webhook");
    // O saneamento não destrói o payload: o que não é segredo continua lá.
    expect(sanitized).toMatchObject({
      event: "Message",
      data: { Info: { ID: "message-1" } },
    });
  });
});
