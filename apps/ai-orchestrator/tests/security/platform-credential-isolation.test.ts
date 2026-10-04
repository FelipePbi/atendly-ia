import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  SendTextResult,
  WhatsAppProvider,
} from "../../src/modules/channel/ports/WhatsAppProvider.js";

const KEY_V1 = randomBytes(32).toString("base64");
const TENANT_CREDENTIAL = "wa_synthetic_credential_tenant_a_01";
const PLATFORM_CREDENTIAL = "wa_synthetic_platform_credential_01";
const PLATFORM_INSTANCE = "atendly-platform";
const PLATFORM_NUMBER = "5511000000000";
const TENANT_NUMBER = "5511999999999";

async function load() {
  vi.resetModules();
  vi.stubEnv("CHANNEL_CREDENTIAL_KEYS", `v1:${KEY_V1}`);
  vi.stubEnv("CHANNEL_CREDENTIAL_ACTIVE_KEY_ID", "v1");
  // A plataforma esta **completamente configurada** em todos os cenarios deste
  // arquivo: se existisse queda para ela, o caminho de negocio teria para onde
  // cair, e os testes abaixo passariam a ver a credencial da plataforma.
  vi.stubEnv("PLATFORM_WHATSAPP_INSTANCE_ID", PLATFORM_INSTANCE);
  vi.stubEnv("PLATFORM_WHATSAPP_CREDENTIAL", PLATFORM_CREDENTIAL);
  vi.stubEnv("PLATFORM_WHATSAPP_NUMBER", PLATFORM_NUMBER);

  const [{ ChannelConnectionService }, cipher, platform, sender, reply] =
    await Promise.all([
      import("../../src/modules/channel/ChannelConnectionService.js"),
      import("../../src/lib/channel-credentials.js"),
      import("../../src/config/platform-whatsapp.js"),
      import("../../src/modules/channel/platform/PlatformWhatsAppSender.js"),
      import("../../src/modules/activation-test/ActivationTestReplySender.js"),
    ]);
  return { ChannelConnectionService, cipher, ...platform, ...sender, ...reply };
}

/**
 * Prisma minimo das conexoes de negocio. Qualquer escrita explode: a plataforma
 * nao pode virar linha de `ChannelConnection` nem de passagem.
 */
function prismaWith(connections: Record<string, unknown>) {
  const forbidden = (operation: string) => async () => {
    throw new Error(`unexpected channelConnection.${operation}`);
  };
  return {
    channelConnection: {
      findUnique: async ({
        where,
      }: {
        where: {
          provider_externalInstanceId?: { externalInstanceId: string };
          tenantId_provider?: { tenantId: string };
          tenantId_id?: { tenantId: string; id: string };
        };
      }) => {
        if (where.tenantId_id) {
          return (
            Object.values(connections).find(
              (row) =>
                (row as { id?: string }).id === where.tenantId_id?.id &&
                (row as { tenantId?: string }).tenantId ===
                  where.tenantId_id?.tenantId,
            ) ?? null
          );
        }
        return (
          connections[
            where.provider_externalInstanceId?.externalInstanceId ?? ""
          ] ?? null
        );
      },
      findMany: async () => Object.values(connections),
      create: forbidden("create"),
      upsert: forbidden("upsert"),
      update: forbidden("update"),
    },
    aiTenantConfig: { findUnique: async () => null },
  } as never;
}

function sealedTenantConnection(cipher: {
  sealChannelCredential: (
    plaintext: string,
    binding: { tenantId: string; externalInstanceId: string },
  ) => { envelope: string; keyId: string; version: number };
}) {
  const sealed = cipher.sealChannelCredential(TENANT_CREDENTIAL, {
    tenantId: "tenant-a",
    externalInstanceId: "instance-a",
  });
  return {
    id: "channel-a",
    tenantId: "tenant-a",
    userId: "user-a",
    externalInstanceId: "instance-a",
    status: "ACTIVE",
    credentialCipher: sealed.envelope,
    credentialKeyId: sealed.keyId,
    credentialVersion: sealed.version,
  };
}

/** Fonte sem comentarios: prosa de doc nao conta como acoplamento. */
function codeOf(relativePath: string): string {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^[ \t]*\/\/.*$/gmu, "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("platform credential isolation", () => {
  it("keeps the business path refusing when the tenant connection has no credential", async () => {
    const { ChannelConnectionService } = await load();
    const service = new ChannelConnectionService(prismaWith({}));

    // Plataforma configurada e, ainda assim, ausencia de projecao continua
    // sendo recusa. Fundir os caminhos faria este envio sair assinado pela
    // Avenly em vez de falhar.
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

  it("resolves the tenant credential and never the platform one", async () => {
    const { ChannelConnectionService, cipher } = await load();
    const connection = sealedTenantConnection(cipher);
    const service = new ChannelConnectionService(
      prismaWith({ "instance-a": connection }),
    );

    const resolved = service.resolveChannelCredential(connection);

    expect(resolved).toBe(TENANT_CREDENTIAL);
    expect(resolved).not.toBe(PLATFORM_CREDENTIAL);
  });

  it("does not accept the platform credential on a tenant connection", async () => {
    const { ChannelConnectionService, cipher } = await load();
    const service = new ChannelConnectionService(prismaWith({}));
    // A credencial da plataforma nao tem vinculo: mesmo selada a mao para outro
    // vinculo, ela nao abre no caminho de negocio.
    const sealedForAnother = cipher.sealChannelCredential(PLATFORM_CREDENTIAL, {
      tenantId: "tenant-b",
      externalInstanceId: PLATFORM_INSTANCE,
    });

    expect(() =>
      service.resolveChannelCredential({
        tenantId: "tenant-a",
        externalInstanceId: "instance-a",
        credentialCipher: sealedForAnother.envelope,
        credentialVersion: sealedForAnother.version,
      }),
    ).toThrowError(/could not be decrypted/u);
  });

  it("treats the platform instance as no tenant connection at all", async () => {
    const { ChannelConnectionService, cipher } = await load();
    const service = new ChannelConnectionService(
      prismaWith({ "instance-a": sealedTenantConnection(cipher) }),
    );

    await expect(
      service.findActiveEvolutionConnection(PLATFORM_INSTANCE),
    ).rejects.toMatchObject({ code: "CHANNEL_CONNECTION_NOT_FOUND" });
  });

  it("sends from the platform without creating or listing a business connection", async () => {
    const { ChannelConnectionService, cipher, PlatformWhatsAppSender } =
      await load();
    const connections = { "instance-a": sealedTenantConnection(cipher) };
    const prisma = prismaWith(connections);
    const service = new ChannelConnectionService(prisma);

    const provider: WhatsAppProvider = {
      async sendText(): Promise<SendTextResult> {
        return { provider: "evolution-go", messageId: "platform-1", raw: {} };
      },
    };
    await new PlatformWhatsAppSender(
      undefined,
      () => provider,
    ).sendToTenantUnderTest(
      { tenantId: "tenant-a", runId: "run-1", phone: TENANT_NUMBER },
      { text: "oi" },
    );

    // Toda escrita em `channelConnection` explode no duble: o envio da
    // plataforma passou sem criar linha nenhuma, e a listagem de conexoes de
    // negocio continua so com o vinculo do tenant.
    const listing = await (
      prisma as unknown as {
        channelConnection: {
          findMany: () => Promise<Array<{ externalInstanceId: string }>>;
        };
      }
    ).channelConnection.findMany();
    expect(listing.map((row) => row.externalInstanceId)).toEqual([
      "instance-a",
    ]);
    await expect(
      service.findActiveEvolutionConnection(PLATFORM_INSTANCE),
    ).rejects.toMatchObject({ code: "CHANNEL_CONNECTION_NOT_FOUND" });
  });

  /**
   * A resposta da IA no teste real sai pelo canal **do tenant** (Goal019,
   * blocker 2 da rodada 2): mesma credencial do vinculo do negocio, nunca a da
   * plataforma. A plataforma so fala como cliente simulado.
   */
  it("sends the AI reply with the tenant credential, never the platform one", async () => {
    const { cipher, TenantChannelReplySender } = await load();
    const connection = sealedTenantConnection(cipher);
    const prisma = prismaWith({ "instance-a": connection });

    const credentials: string[] = [];
    const instances: string[] = [];
    const delivered: Array<{ messageRecordId: string }> = [];
    const sender = new TenantChannelReplySender(
      prisma,
      undefined,
      ({ credential, externalInstanceId }) => {
        credentials.push(credential);
        instances.push(externalInstanceId);
        return {
          async sendText(): Promise<SendTextResult> {
            return { provider: "evolution-go", messageId: "tenant-1", raw: {} };
          },
        } satisfies WhatsAppProvider;
      },
      {
        outbox: {
          async markSent(input: { messageRecordId: string }) {
            delivered.push(input);
          },
          async markUndelivered() {
            throw new Error("unexpected markUndelivered");
          },
        },
      },
    );

    const result = await sender.sendAiReply({
      tenantId: "tenant-a",
      channelId: "channel-a",
      conversationId: "conversation-a",
      messageRecordId: "message-ai-1",
      text: "Corte custa R$ 120,00.",
      correlationId: "ai-1",
      to: PLATFORM_NUMBER,
    });

    expect(result.state).toBe("SENT");
    expect(credentials).toEqual([TENANT_CREDENTIAL]);
    expect(credentials).not.toContain(PLATFORM_CREDENTIAL);
    expect(instances).toEqual(["instance-a"]);
    expect(instances).not.toContain(PLATFORM_INSTANCE);
    // A linha que a IA gravou sai de `PENDING`: e isso que prova o envio.
    expect(delivered).toEqual([
      expect.objectContaining({ messageRecordId: "message-ai-1" }),
    ]);
  });

  it("does not fall back to the platform when the tenant link has no credential", async () => {
    const { TenantChannelReplySender } = await load();
    const prisma = prismaWith({
      "instance-a": {
        id: "channel-a",
        tenantId: "tenant-a",
        userId: "user-a",
        externalInstanceId: "instance-a",
        status: "ACTIVE",
        credentialCipher: null,
        credentialVersion: 0,
      },
    });

    const undelivered: Array<{ state: string; detail: string }> = [];
    const sender = new TenantChannelReplySender(
      prisma,
      undefined,
      () => {
        throw new Error("provider must not be built without a credential");
      },
      {
        outbox: {
          async markSent() {
            throw new Error("unexpected markSent");
          },
          async markUndelivered(input: { state: string; detail: string }) {
            undelivered.push(input);
          },
        },
      },
    );

    const result = await sender.sendAiReply({
      tenantId: "tenant-a",
      channelId: "channel-a",
      conversationId: "conversation-a",
      messageRecordId: "message-ai-1",
      text: "oi",
      correlationId: "ai-1",
      to: PLATFORM_NUMBER,
    });

    // Ausencia de vinculo continua sendo recusa, nunca queda para a
    // plataforma: a resposta fica registrada como nao entregue.
    expect(result.state).toBe("FAILED");
    expect(undelivered).toEqual([
      expect.objectContaining({
        messageRecordId: "message-ai-1",
        state: "FAILED",
        detail: "channel_credential_not_projected",
      }),
    ]);
  });

  it("keeps the two resolvers unmergeable at the source level", async () => {
    const businessResolvers = [
      "../../src/modules/channel/ChannelConnectionService.ts",
      "../../src/lib/channel-credentials.ts",
    ];
    for (const path of businessResolvers) {
      const code = codeOf(path);
      expect(code).not.toContain("PLATFORM_WHATSAPP");
      expect(code).not.toContain("platform-whatsapp");
    }

    const platformModules = [
      "../../src/config/platform-whatsapp.ts",
      "../../src/modules/channel/platform/PlatformWhatsAppSender.ts",
    ];
    for (const path of platformModules) {
      const code = codeOf(path);
      // Sem banco: a plataforma nao le, nao escreve e nao lista conexao de
      // negocio. Sem a projecao do vinculo: ela nao entra no caminho de negocio.
      expect(code).not.toContain("prisma");
      expect(code).not.toContain("Prisma");
      expect(code).not.toContain("channelConnection");
      expect(code).not.toContain("ChannelConnection");
      expect(code).not.toContain("channel-credentials");
    }
  });
});
