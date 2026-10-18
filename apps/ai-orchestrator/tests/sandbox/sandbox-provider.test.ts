import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SendTextInput } from "../../src/modules/channel/ports/WhatsAppProvider.js";
import type { TenantSandboxState } from "../../src/modules/sandbox/tenant-sandbox.js";

vi.stubEnv("EVOLUTION_BASE_URL", "http://evolution.invalid");

const [
  { env },
  { AppError },
  { EvolutionProvider },
  { dispatchAiReply },
  { classifySendFailure },
  { isSandboxException, normalizeSandboxPhone },
  { SandboxGate, tenantSandboxGate },
  {
    normalizeExceptionPhones,
    readTenantSandbox,
    resolveSandboxRecipientPhone,
    writeTenantSandbox,
  },
] = await Promise.all([
  import("../../src/config/env.js"),
  import("../../src/lib/errors.js"),
  import("../../src/modules/channel/adapters/evolution/EvolutionProvider.js"),
  import("../../src/modules/outbox/ai-reply-dispatch.js"),
  import("../../src/modules/outbox/outbox-policy.js"),
  import("../../src/modules/sandbox/sandbox-phone.js"),
  import("../../src/modules/sandbox/SandboxGate.js"),
  import("../../src/modules/sandbox/tenant-sandbox.js"),
]);
type AppErrorType = InstanceType<typeof AppError>;

/**
 * Modo sandbox (D-199): o gate fica no proprio `EvolutionProvider`, antes do
 * transporte. Sem banco e sem rede: o estado e o resolvedor de LID sao
 * dubles e o `fetch` e espionado — chamar o `fetch` e o que faria a mensagem
 * chegar ao WhatsApp da cliente.
 */

const CUSTOMER = "5511988887777";
const OWNER = "5511912345678";

function sandbox(state: Partial<TenantSandboxState> = {}): TenantSandboxState {
  return {
    enabled: true,
    exceptionPhones: [OWNER],
    updatedAt: null,
    ...state,
  };
}

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string | undefined) ?? "{}") as { id?: string };
    return new Response(
      JSON.stringify({ messageId: `wa-${body.id ?? "x"}` }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function gate(
  state: TenantSandboxState | (() => Promise<TenantSandboxState>),
  resolve: (to: string) => Promise<string | null> = async (to) => to,
) {
  return new SandboxGate({
    tenantId: "tenant-a",
    loadState: typeof state === "function" ? state : async () => state,
    resolveRecipientPhone: resolve,
    now: () => new Date("2026-10-18T12:00:00.000Z"),
  });
}

function gated(
  state: TenantSandboxState | (() => Promise<TenantSandboxState>),
  resolve?: (to: string) => Promise<string | null>,
) {
  return new EvolutionProvider(
    undefined,
    "wa_credential",
    "instance-a",
    gate(state, resolve),
  );
}

/** Corpos dos pedidos que chegaram ao Evolution Go. */
const sentBodies = () =>
  fetchSpy.mock.calls.map(
    ([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
  );

const textTo = (to: string, correlationId = "corr-1"): SendTextInput => ({
  to,
  text: "Seu horário está confirmado.",
  correlationId,
});

describe("D-199: o sandbox decide antes do transporte", () => {
  it("desligado, envia de verdade com o mesmo pedido (e o digitando…)", async () => {
    const provider = gated(sandbox({ enabled: false }));

    const sent = await provider.sendText({ ...textTo(CUSTOMER), typingDelayMs: 900 });

    expect(sentBodies()).toEqual([
      { number: CUSTOMER, text: "Seu horário está confirmado.", id: "corr-1", delay: 900 },
    ]);
    expect(sent.messageId).toBe("wa-corr-1");
  });

  it("ligado, nao chama o Evolution para a cliente e devolve envio feito com marca", async () => {
    const provider = gated(sandbox());

    const sent = await provider.sendText({ ...textTo(CUSTOMER), typingDelayMs: 900 });

    // Nem a mensagem nem o "digitando…" (que vai no mesmo pedido) saem.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sent).toEqual({
      provider: "evolution-go",
      messageId: "sandbox-corr-1",
      raw: {
        avenlySandbox: {
          suppressed: true,
          reason: "not_exception",
          suppressedAt: "2026-10-18T12:00:00.000Z",
        },
      },
    });
  });

  it("ligado sem excecoes, suprime tudo sem resolver o destinatario", async () => {
    const resolve = vi.fn(async (to: string) => to);
    const provider = gated(sandbox({ exceptionPhones: [] }), resolve);

    const sent = await provider.sendText(textTo(OWNER));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(sent.raw).toMatchObject({ avenlySandbox: { reason: "no_exceptions" } });
  });

  it("ligado, a excecao recebe de verdade", async () => {
    const sent = await gated(sandbox()).sendText(textTo(OWNER));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sent.messageId).toBe("wa-corr-1");
  });

  it.each([
    ["sem o 9o digito", "551112345678"],
    ["sem o 55", "11912345678"],
    ["com mascara", "+55 (11) 91234-5678"],
    ["como JID", "5511912345678@s.whatsapp.net"],
  ])("a excecao casa %s", async (_label, to) => {
    await gated(sandbox()).sendText(textTo(to));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("chat por LID: resolve para o telefone e libera a excecao", async () => {
    const lid = "123456789012345";
    const provider = gated(sandbox(), async (to) => (to === lid ? OWNER : to));

    await provider.sendText(textTo(lid));

    // O envio real segue para o destino do chat; so a decisao usou o telefone.
    expect(sentBodies()).toEqual([expect.objectContaining({ number: lid })]);
  });

  it("chat por LID sem telefone conhecido: bloqueia", async () => {
    const provider = gated(sandbox(), async () => null);

    const sent = await provider.sendText(textTo("123456789012345"));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sent.raw).toMatchObject({
      avenlySandbox: { reason: "recipient_phone_unknown" },
    });
  });

  it("falha ao resolver o destinatario: bloqueia como desconhecido", async () => {
    const provider = gated(sandbox(), async () => {
      throw new Error("db down");
    });

    const sent = await provider.sendText(textTo(OWNER));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sent.raw).toMatchObject({
      avenlySandbox: { reason: "recipient_phone_unknown" },
    });
  });

  it("fecha na falha: sem ler o estado, nao envia nem finge envio", async () => {
    const provider = gated(async () => {
      throw new Error('column "sandboxEnabled" does not exist');
    });

    const failure: unknown = await provider
      .sendText(textTo(CUSTOMER))
      .catch((error: unknown) => error);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppErrorType).code).toBe("AI_SANDBOX_STATE_UNAVAILABLE");
    expect(classifySendFailure(failure)).toEqual({
      state: "FAILED",
      detail: "sandbox_state_unavailable",
      retryable: false,
    });
  });

  it("sem correlationId, o id suprimido continua com o prefixo e unico", async () => {
    const provider = gated(sandbox());
    const first = await provider.sendText({ to: CUSTOMER, text: "a" });
    const second = await provider.sendText({ to: CUSTOMER, text: "b" });
    expect(first.messageId).toMatch(/^sandbox-/u);
    expect(first.messageId).not.toBe(second.messageId);
  });

  it("o download de midia nao passa pelo gate, com sandbox ligado", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "success", data: { base64: "data:audio/ogg;base64,AA" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const loadState = vi.fn(async () => sandbox());
    const provider = gated(loadState);

    await provider.downloadMedia({ message: { audioMessage: {} } });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(loadState).not.toHaveBeenCalled();
  });

  it("le o estado a cada envio: desligar vale no proximo envio", async () => {
    let enabled = true;
    const provider = gated(async () => sandbox({ enabled }));

    await provider.sendText(textTo(CUSTOMER, "c1"));
    enabled = false;
    await provider.sendText(textTo(CUSTOMER, "c2"));

    expect(sentBodies()).toEqual([expect.objectContaining({ id: "c2" })]);
  });

  it("sem gate (teste real entre plataforma e negocio), envia como sempre", async () => {
    await new EvolutionProvider(undefined, "wa_credential", "instance-a").sendText(
      textTo(CUSTOMER),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("D-199: as travas globais continuam valendo para a excecao", () => {
  const original = env.WHATSAPP_OUTBOUND_DISABLED;
  afterEach(() => {
    (env as { WHATSAPP_OUTBOUND_DISABLED: boolean }).WHATSAPP_OUTBOUND_DISABLED =
      original;
  });

  it("WHATSAPP_OUTBOUND_DISABLED recusa o envio real da excecao", async () => {
    (env as { WHATSAPP_OUTBOUND_DISABLED: boolean }).WHATSAPP_OUTBOUND_DISABLED =
      true;

    const failure: unknown = await gated(sandbox())
      .sendText(textTo(OWNER))
      .catch((error: unknown) => error);

    expect((failure as AppErrorType).code).toBe("WHATSAPP_OUTBOUND_DISABLED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("D-199: resposta da IA em partes", () => {
  it("todas as partes sao suprimidas e a linha fica com o id sandbox da ultima", async () => {
    const outcome = await dispatchAiReply(
      gated(sandbox()),
      {
        to: CUSTOMER,
        text: "Oi, Ana!\n\nTenho terça às 10h ou quarta às 15h.",
        correlationId: "reply-1",
      },
      { sleep: async () => undefined },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      status: "sent",
      providerMessageId: "sandbox-reply-1",
      partsSent: 2,
      totalParts: 2,
      raw: { avenlySandbox: { suppressed: true, reason: "not_exception" } },
    });
  });
});

describe("D-199: telefone das excecoes", () => {
  it.each([
    ["11912345678", "5511912345678"],
    ["(11) 91234-5678", "5511912345678"],
    ["+55 11 3333-4444", "551133334444"],
    ["011912345678", "5511912345678"],
  ])("normaliza %s", (input, expected) => {
    expect(normalizeSandboxPhone(input)).toBe(expected);
  });

  it.each(["123", "5520912345678", "123456789012345@lid", "120363@g.us", "5511812345678"])(
    "recusa %s",
    (input) => {
      expect(normalizeSandboxPhone(input)).toBeNull();
    },
  );

  it("um LID nunca casa com excecao", () => {
    expect(isSandboxException("123456789012345", [OWNER])).toBe(false);
  });

  it("a lista e normalizada, sem repeticao (com ou sem o 9o digito)", () => {
    expect(
      normalizeExceptionPhones(["(11) 91234-5678", "551112345678", "21 99999-0000"]),
    ).toEqual([OWNER, "5521999990000"]);
  });

  it("numero invalido e recusado, nunca descartado em silencio", () => {
    expect(() => normalizeExceptionPhones(["12345678"])).toThrow(
      expect.objectContaining({ code: "AI_SANDBOX_INVALID_PHONE" }),
    );
  });

  it("mais de 20 excecoes e recusado", () => {
    const phones = Array.from(
      { length: 21 },
      (_, i) => `55119${String(10000000 + i)}`,
    );
    expect(() => normalizeExceptionPhones(phones)).toThrow(
      expect.objectContaining({ code: "AI_SANDBOX_TOO_MANY_EXCEPTIONS" }),
    );
  });
});

describe("D-199: resolucao do telefone por LID (mesma regra do mapper)", () => {
  function prismaWith(rows: unknown[]) {
    const findMany = vi.fn(async () => rows.map((rawPayload) => ({ rawPayload })));
    return { prisma: { message: { findMany } } as never, findMany };
  }
  const info = (fields: Record<string, unknown>) => ({ data: { Info: fields } });

  it("sem mensagem com aquele LID, os digitos sao o telefone", async () => {
    const { prisma, findMany } = prismaWith([]);
    await expect(
      resolveSandboxRecipientPhone(prisma, "tenant-a", CUSTOMER),
    ).resolves.toBe(CUSTOMER);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          OR: [
            { rawPayload: { path: ["data", "Info", "Chat"], equals: `${CUSTOMER}@lid` } },
            { rawPayload: { path: ["data", "Info", "Sender"], equals: `${CUSTOMER}@lid` } },
          ],
        },
      }),
    );
  });

  it("LID com SenderAlt na mensagem recebida devolve o telefone", async () => {
    const { prisma } = prismaWith([
      info({ Chat: "999@lid", Sender: "999@lid", IsFromMe: false, SenderAlt: `${OWNER}@s.whatsapp.net` }),
    ]);
    await expect(resolveSandboxRecipientPhone(prisma, "tenant-a", "999")).resolves.toBe(OWNER);
  });

  it("LID com RecipientAlt na mensagem enviada pelo proprio numero devolve o telefone", async () => {
    const { prisma } = prismaWith([
      info({ Chat: "999@lid", IsFromMe: true, RecipientAlt: `${CUSTOMER}:3@s.whatsapp.net` }),
    ]);
    await expect(resolveSandboxRecipientPhone(prisma, "tenant-a", "999")).resolves.toBe(CUSTOMER);
  });

  it("nunca usa o telefone da profissional (SenderAlt de mensagem enviada por ela)", async () => {
    const { prisma } = prismaWith([
      info({ Chat: "999@lid", IsFromMe: true, SenderAlt: `${OWNER}@s.whatsapp.net` }),
    ]);
    await expect(resolveSandboxRecipientPhone(prisma, "tenant-a", "999")).resolves.toBeNull();
  });

  it("LID sem telefone em nenhuma mensagem e desconhecido", async () => {
    const { prisma } = prismaWith([info({ Chat: "999@lid", Sender: "999@lid" }), null]);
    await expect(resolveSandboxRecipientPhone(prisma, "tenant-a", "999")).resolves.toBeNull();
  });

  it("tenantSandboxGate liga as tres pecas: estado, LID e excecao", async () => {
    const prisma = {
      aiTenantConfig: {
        findUnique: async () => ({
          sandboxEnabled: true,
          sandboxExceptionPhones: [OWNER],
          sandboxUpdatedAt: null,
        }),
      },
      message: {
        findMany: async () => [
          { rawPayload: info({ Chat: "999@lid", SenderAlt: `${OWNER}@s.whatsapp.net` }) },
        ],
      },
    } as never;
    const provider = new EvolutionProvider(
      undefined,
      "wa_credential",
      "instance-a",
      tenantSandboxGate({ prisma, tenantId: "tenant-a" }),
    );

    await provider.sendText(textTo("999"));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("D-199: estado gravado", () => {
  it("sem linha de configuracao, o sandbox esta desligado", async () => {
    const prisma = { aiTenantConfig: { findUnique: async () => null } } as never;
    await expect(readTenantSandbox(prisma, "tenant-a")).resolves.toEqual({
      enabled: false,
      exceptionPhones: [],
      updatedAt: null,
    });
  });

  it("campo ausente nao liga o sandbox", async () => {
    const prisma = {
      aiTenantConfig: { findUnique: async () => ({ enabled: true, tone: "BALANCED" }) },
    } as never;
    await expect(readTenantSandbox(prisma, "tenant-a")).resolves.toMatchObject({
      enabled: false,
      exceptionPhones: [],
    });
  });

  it("escrita sem linha projetada e recusada com codigo proprio", async () => {
    const update = vi.fn();
    const prisma = {
      aiTenantConfig: { findUnique: async () => null, update },
    } as never;
    await expect(
      writeTenantSandbox(prisma, "tenant-a", { enabled: true }),
    ).rejects.toMatchObject({ code: "AI_TENANT_CONFIG_NOT_PROJECTED", statusCode: 409 });
    expect(update).not.toHaveBeenCalled();
  });

  it("ausente preserva: so o campo enviado e gravado, com a lista normalizada", async () => {
    const now = new Date("2026-10-18T12:00:00.000Z");
    const update = vi.fn(async (args: { data: Record<string, unknown> }) => ({
      sandboxEnabled: true,
      sandboxExceptionPhones: (args.data.sandboxExceptionPhones as string[]) ?? [],
      sandboxUpdatedAt: now,
    }));
    const prisma = {
      aiTenantConfig: { findUnique: async () => ({ tenantId: "tenant-a" }), update },
    } as never;

    await writeTenantSandbox(prisma, "tenant-a", { enabled: true }, now);
    await writeTenantSandbox(prisma, "tenant-a", { exceptionPhones: ["(11) 91234-5678"] }, now);

    expect(update.mock.calls[0]?.[0].data).toEqual({ sandboxEnabled: true, sandboxUpdatedAt: now });
    expect(update.mock.calls[1]?.[0].data).toEqual({
      sandboxExceptionPhones: [OWNER],
      sandboxUpdatedAt: now,
    });
  });
});

describe("D-199: todo envio a cliente passa pelo sandbox", () => {
  // Guarda estrutural: quem monta um EvolutionProvider para falar com
  // cliente precisa passar o gate do negocio. Os outros dois sao do teste real (numero da
  // plataforma <-> numero do negocio), que nao fala com cliente.
  const src = join(fileURLToPath(new URL("../../src", import.meta.url)));
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return files(full);
      return full.endsWith(".ts") ? [full] : [];
    });
  }
  const rel = (path: string) => path.replace(/\\/g, "/").split("/src/")[1];

  it("so os pontos conhecidos montam o provedor, e os de cliente passam o gate", () => {
    const builders = files(src)
      .filter((file) => readFileSync(file, "utf8").includes("new EvolutionProvider("))
      .map(rel)
      .sort();
    expect(builders).toEqual([
      "modules/activation-test/ActivationTestReplySender.ts",
      "modules/channel/inbound-processor-factory.ts",
      "modules/channel/platform/PlatformWhatsAppSender.ts",
      "modules/internal/routes.ts",
      "modules/reminders/NotificationDeliveryService.ts",
    ]);
    for (const customerSender of [
      "modules/channel/inbound-processor-factory.ts",
      "modules/internal/routes.ts",
      "modules/reminders/NotificationDeliveryService.ts",
    ]) {
      expect(
        readFileSync(join(src, customerSender), "utf8"),
        customerSender,
      ).toContain("tenantSandboxGate(");
    }
  });
});
