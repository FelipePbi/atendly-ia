import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  SendTextInput,
  SendTextResult,
  WhatsAppProvider,
} from "../../src/modules/channel/ports/WhatsAppProvider.js";

const PLATFORM_INSTANCE = "atendly-platform";
const PLATFORM_CREDENTIAL = "wa_synthetic_platform_credential_01";
const PLATFORM_NUMBER = "5511000000000";
const TENANT_NUMBER = "5511999999999";

function stubPlatformEnv(
  overrides: Partial<{
    instanceId: string;
    credential: string;
    number: string;
  }> = {},
) {
  vi.stubEnv(
    "PLATFORM_WHATSAPP_INSTANCE_ID",
    overrides.instanceId ?? PLATFORM_INSTANCE,
  );
  vi.stubEnv(
    "PLATFORM_WHATSAPP_CREDENTIAL",
    overrides.credential ?? PLATFORM_CREDENTIAL,
  );
  vi.stubEnv("PLATFORM_WHATSAPP_NUMBER", overrides.number ?? PLATFORM_NUMBER);
}

async function load() {
  vi.resetModules();
  const [config, sender] = await Promise.all([
    import("../../src/config/platform-whatsapp.js"),
    import("../../src/modules/channel/platform/PlatformWhatsAppSender.js"),
  ]);
  return { ...config, ...sender };
}

/** Duble da porta de envio: nenhum teste toca transporte real. */
function providerDouble() {
  const sent: SendTextInput[] = [];
  const provider: WhatsAppProvider = {
    async sendText(input): Promise<SendTextResult> {
      sent.push(input);
      return { provider: "evolution-go", messageId: "platform-1", raw: {} };
    },
  };
  return { provider, sent };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("platform WhatsApp configuration", () => {
  it("refuses with PLATFORM_NUMBER_NOT_CONFIGURED when the number is missing", async () => {
    stubPlatformEnv({ number: "" });
    const { requirePlatformWhatsAppConfig, isPlatformWhatsAppConfigured } =
      await load();

    expect(isPlatformWhatsAppConfigured()).toBe(false);
    expect(() => requirePlatformWhatsAppConfig()).toThrowError(
      expect.objectContaining({ code: "PLATFORM_NUMBER_NOT_CONFIGURED" }),
    );
  });

  it("treats a number without digits as absent", async () => {
    stubPlatformEnv({ number: "-- --" });
    const { isPlatformWhatsAppConfigured } = await load();

    expect(isPlatformWhatsAppConfigured()).toBe(false);
  });

  it("names the missing keys without ever exposing the credential", async () => {
    stubPlatformEnv({ instanceId: "" });
    const { requirePlatformWhatsAppConfig } = await load();

    let thrown: unknown;
    try {
      requirePlatformWhatsAppConfig();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: "PLATFORM_NUMBER_NOT_CONFIGURED",
      details: { missing: ["PLATFORM_WHATSAPP_INSTANCE_ID"] },
    });
    expect(JSON.stringify(thrown)).not.toContain(PLATFORM_CREDENTIAL);
  });

  it("reads instance, credential and number when fully configured", async () => {
    stubPlatformEnv({ number: `+55 (11) 00000-0000` });
    const { readPlatformWhatsAppConfig } = await load();

    expect(readPlatformWhatsAppConfig()).toEqual({
      instanceId: PLATFORM_INSTANCE,
      credential: PLATFORM_CREDENTIAL,
      number: "5511000000000",
    });
  });
});

describe("PlatformWhatsAppSender", () => {
  it("sends through the WhatsAppProvider port to the tenant running the test", async () => {
    stubPlatformEnv();
    const { PlatformWhatsAppSender } = await load();
    const { provider, sent } = providerDouble();

    const result = await new PlatformWhatsAppSender(
      undefined,
      () => provider,
    ).sendToTenantUnderTest(
      { tenantId: "tenant-a", runId: "run-1", phone: `+55 11 99999-9999` },
      { text: "oi, aqui e a Atendly", correlationId: "run-1-msg-1" },
    );

    expect(result).toMatchObject({ provider: "evolution-go" });
    expect(sent).toEqual([
      expect.objectContaining({
        to: TENANT_NUMBER,
        text: "oi, aqui e a Atendly",
      }),
    ]);
  });

  it("builds the provider with the platform credential, not with a tenant one", async () => {
    stubPlatformEnv();
    const { PlatformWhatsAppSender } = await load();
    const { provider } = providerDouble();
    const factory = vi.fn(() => provider);

    await new PlatformWhatsAppSender(undefined, factory).sendToTenantUnderTest(
      { tenantId: "tenant-a", runId: "run-1", phone: TENANT_NUMBER },
      { text: "oi" },
    );

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: PLATFORM_INSTANCE,
        credential: PLATFORM_CREDENTIAL,
      }),
      expect.anything(),
    );
  });

  it("refuses before building any provider when the platform is not configured", async () => {
    stubPlatformEnv({ credential: "" });
    const { PlatformWhatsAppSender } = await load();
    const factory = vi.fn(() => providerDouble().provider);

    await expect(
      new PlatformWhatsAppSender(undefined, factory).sendToTenantUnderTest(
        { tenantId: "tenant-a", runId: "run-1", phone: TENANT_NUMBER },
        { text: "oi" },
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_NUMBER_NOT_CONFIGURED" });

    // Sem configuracao nao existe provider inerte: nada e construido e nada e
    // enviado, entao nenhum caminho pode afirmar que o teste aconteceu.
    expect(factory).not.toHaveBeenCalled();
  });

  it("has no generic send path: the only destination comes from a test run", async () => {
    stubPlatformEnv();
    const { PlatformWhatsAppSender } = await load();

    const methods = Object.getOwnPropertyNames(
      PlatformWhatsAppSender.prototype,
    ).filter((name) => name !== "constructor");

    expect(methods).toEqual(["sendToTenantUnderTest"]);
  });

  it("refuses a destination that is not bound to a tenant under test", async () => {
    stubPlatformEnv();
    const { PlatformWhatsAppSender } = await load();
    const { provider, sent } = providerDouble();
    const sender = new PlatformWhatsAppSender(undefined, () => provider);

    await expect(
      sender.sendToTenantUnderTest(
        { tenantId: "tenant-a", runId: "", phone: TENANT_NUMBER },
        { text: "oi" },
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_TEST_RECIPIENT_INVALID" });

    await expect(
      sender.sendToTenantUnderTest(
        { tenantId: "", runId: "run-1", phone: TENANT_NUMBER },
        { text: "oi" },
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_TEST_RECIPIENT_INVALID" });

    await expect(
      sender.sendToTenantUnderTest(
        { tenantId: "tenant-a", runId: "run-1", phone: "" },
        { text: "oi" },
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_TEST_RECIPIENT_INVALID" });

    // O proprio numero da plataforma seria o unico destino alcancavel sem um
    // tenant do outro lado.
    await expect(
      sender.sendToTenantUnderTest(
        { tenantId: "tenant-a", runId: "run-1", phone: PLATFORM_NUMBER },
        { text: "oi" },
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_TEST_RECIPIENT_INVALID" });

    expect(sent).toEqual([]);
  });
});
