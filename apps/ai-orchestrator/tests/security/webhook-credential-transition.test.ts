import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GraphRuntimePort } from "../../src/modules/graph/graph-runtime.js";

/**
 * Transição da projeção da credencial de canal.
 *
 * A migration deixa todo vínculo já existente com `credentialVersion` 0 até que
 * o BFF reprovisione. O que estes casos fixam é a ordem: receber e persistir o
 * inbound não pode depender desse reprovisionamento. A mensagem do cliente é
 * gravada; só a resposta falha, com erro explícito, e em nenhum momento a chave
 * global assina o envio.
 */
const KEY_V1 = randomBytes(32).toString("base64");
const GLOBAL_API_KEY = "global_key_that_must_never_sign_a_send";
const INSTANCE_CREDENTIAL = "wa_synthetic_credential_tenant_a_01";

async function load() {
  vi.resetModules();
  vi.stubEnv("CHANNEL_CREDENTIAL_KEYS", `v1:${KEY_V1}`);
  vi.stubEnv("CHANNEL_CREDENTIAL_ACTIVE_KEY_ID", "v1");
  vi.stubEnv("EVOLUTION_BASE_URL", "https://evolution.example.invalid");
  vi.stubEnv("EVOLUTION_API_KEY", GLOBAL_API_KEY);
  vi.stubEnv("EVOLUTION_IGNORE_GROUPS", "true");

  const [
    { ChannelConnectionService },
    { EvolutionProvider },
    { InboundMessageProcessor },
    cipher,
  ] = await Promise.all([
    import("../../src/modules/channel/ChannelConnectionService.js"),
    import("../../src/modules/channel/adapters/evolution/EvolutionProvider.js"),
    import("../../src/modules/channel/InboundMessageProcessor.js"),
    import("../../src/lib/channel-credentials.js"),
  ]);
  return {
    ChannelConnectionService,
    EvolutionProvider,
    InboundMessageProcessor,
    cipher,
  };
}

/** Vínculo como a migration o deixa: sem projeção, versão 0. */
function unprovisionedConnection() {
  return {
    id: "channel-a",
    tenantId: "tenant-a",
    userId: "user-a",
    externalInstanceId: "instance-a",
    status: "ACTIVE",
    credentialCipher: null,
    credentialKeyId: null,
    credentialVersion: 0,
  };
}

function prismaWith(connection: Record<string, unknown>) {
  return {
    channelConnection: {
      findUnique: async () => connection,
    },
    aiTenantConfig: {
      findUnique: async () => null,
    },
  } as never;
}

const inbound = {
  provider: "evolution-go" as const,
  instanceId: "instance-a",
  externalMessageId: "message-1",
  externalContactId: "5511999999999@s.whatsapp.net",
  messageId: "message-1",
  chatId: "5511999999999@s.whatsapp.net",
  customerPhone: "5511999999999",
  customerName: "Maria",
  fromMe: false,
  isGroup: false,
  kind: "text" as const,
  text: "Oi",
  raw: {},
};

function ports() {
  const automation = {
    handleIncomingText: vi.fn().mockResolvedValue({
      text: "Resposta",
      conversationId: "conversation-1",
      messageRecordId: "outbound-1",
    }),
    markOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
    markOutboundDelivery: vi.fn().mockResolvedValue(undefined),
    recordManualOutboundText: vi.fn().mockResolvedValue({
      conversationId: "conversation-1",
      messageRecordId: "manual-1",
    }),
    recordInboundText: vi.fn().mockResolvedValue({
      conversationId: "conversation-1",
      messageRecordId: "inbound-1",
    }),
  };
  const idempotency = { remember: vi.fn().mockResolvedValue(true) };
  const handoff = {
    isBotPaused: vi.fn().mockResolvedValue(false),
    isBotOutboundMessage: vi.fn().mockResolvedValue(false),
    getBotPauseContext: vi.fn().mockResolvedValue(null),
    pauseForHuman: vi.fn().mockResolvedValue(undefined),
    pauseIndefinitely: vi.fn().mockResolvedValue(undefined),
    resumeBot: vi.fn().mockResolvedValue(undefined),
  };
  const runtime: GraphRuntimePort = {
    resolveConversationId: vi.fn().mockResolvedValue("conversation-1"),
    loadTenantConfig: vi.fn().mockResolvedValue({
      channelConnected: true,
      tenantConfig: {
        aiEnabled: true,
        tone: "LIGHT_CLOSE",
        promptVersion: "scheduling_v1.0.0",
      },
    }),
    loadConversation: vi
      .fn()
      .mockResolvedValue({ status: "ACTIVE", humanHandoff: false }),
    loadToolResults: vi.fn().mockResolvedValue([]),
  };
  return { automation, idempotency, handoff, runtime };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("inbound during the channel credential transition", () => {
  it("persists the inbound of a connection still on credentialVersion 0 and refuses to answer with the global key", async () => {
    const {
      ChannelConnectionService,
      EvolutionProvider,
      InboundMessageProcessor,
    } = await load();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const connection = unprovisionedConnection();
    const service = new ChannelConnectionService(prismaWith(connection));
    const resolved = await service.resolveEvolutionInboundContext({
      message: inbound as never,
      requestId: "request-1",
    });

    // Resolver o vínculo continua funcionando: o inbound tem tenant e canal.
    expect(resolved.message.tenantId).toBe("tenant-a");

    const { automation, idempotency, handoff, runtime } = ports();
    const processor = new InboundMessageProcessor(
      automation,
      // Exatamente o que o webhook monta: resolução preguiçosa.
      new EvolutionProvider(
        undefined,
        () => service.resolveChannelCredential(resolved.connection),
        resolved.message.instanceId,
      ),
      idempotency,
      handoff,
      undefined,
      { debounce: false, runtime },
    );

    // Goal004: a resposta gerada nesta janela nao se perde nem estoura para
    // fora. A tentativa fica registrada como falha, com motivo explicito, e o
    // processamento termina dizendo que nao houve envio.
    await expect(
      processor.handleInboundMessage(resolved.message),
    ).resolves.toMatchObject({ ok: true, action: "send_failed" });
    expect(automation.markOutboundDelivery).toHaveBeenCalledWith({
      messageRecordId: "outbound-1",
      state: "FAILED",
      detail: "channel_credential_not_projected",
    });

    // A mensagem do cliente foi processada e gravada antes da falha de envio.
    expect(automation.handleIncomingText).toHaveBeenCalledTimes(1);
    // E nada saiu: nenhuma chamada ao transporte, muito menos com a chave
    // global que continua configurada no ambiente.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers with the instance credential once the link is reprovisioned", async () => {
    const {
      ChannelConnectionService,
      EvolutionProvider,
      InboundMessageProcessor,
      cipher,
    } = await load();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: { id: "sent-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const sealed = cipher.sealChannelCredential(INSTANCE_CREDENTIAL, {
      tenantId: "tenant-a",
      externalInstanceId: "instance-a",
    });
    const connection = {
      ...unprovisionedConnection(),
      credentialCipher: sealed.envelope,
      credentialKeyId: sealed.keyId,
      credentialVersion: sealed.version,
    };
    const service = new ChannelConnectionService(prismaWith(connection));
    const resolved = await service.resolveEvolutionInboundContext({
      message: inbound as never,
      requestId: "request-1",
    });

    const { automation, idempotency, handoff, runtime } = ports();
    const processor = new InboundMessageProcessor(
      automation,
      new EvolutionProvider(
        undefined,
        () => service.resolveChannelCredential(resolved.connection),
        resolved.message.instanceId,
      ),
      idempotency,
      handoff,
      undefined,
      { debounce: false, runtime },
    );

    await expect(
      processor.handleInboundMessage(resolved.message),
    ).resolves.toMatchObject({ action: "replied" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = fetchSpy.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers.apikey).toBe(INSTANCE_CREDENTIAL);
    expect(headers.apikey).not.toBe(GLOBAL_API_KEY);
  });
});
