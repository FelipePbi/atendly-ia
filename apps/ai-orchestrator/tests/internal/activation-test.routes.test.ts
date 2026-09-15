import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [
  { registerInternalRoutes },
  { expectedToken },
  { AppError, toErrorMessage },
  { ACTIVATION_TEST_MILESTONES, ACTIVATION_TEST_REFUSALS },
] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
  import("../../src/lib/errors.js"),
  import("../../src/modules/activation-test/activation-test-run.js"),
]);

const TENANT = "tenant-activation";

const RUN = {
  id: "run-1",
  tenantId: TENANT,
  state: "RUNNING" as const,
  startedAt: new Date("2026-09-14T12:00:00.000Z"),
  finishedAt: null,
  currentStep: null,
  completedStep: null,
  attempts: 0,
  maxAttempts: 3,
  lastError: null,
  lastErrorAt: null,
  failedStep: null,
  failureCode: null,
  failureReason: null,
  pausedAt: null,
  pausedByMessageId: null,
  channelId: "channel-1",
  channelInstanceId: "instance-1",
  tenantPhone: "5511988887777",
  platformNumber: "5511911112222",
  serviceId: "service-1",
  serviceName: "Corte",
  slotDate: null,
  slotStartTime: null,
  conversationId: "conversation-1",
  contactId: "contact-1",
  createdMessageIds: [],
  appointmentId: null,
  customerId: null,
  createdConversationId: null,
  createdContactId: null,
  cleanupState: "PENDING" as const,
  cleanupAt: null,
  cleanupResidue: [],
  updatedAt: new Date("2026-09-14T12:00:00.000Z"),
};

interface ActivationTestDouble {
  current: ReturnType<typeof vi.fn>;
  milestones: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  activeChannel: ReturnType<typeof vi.fn>;
}

function double(overrides: Partial<ActivationTestDouble> = {}) {
  return {
    current: vi.fn(async () => null),
    milestones: vi.fn(async () => []),
    start: vi.fn(async () => RUN),
    restart: vi.fn(async () => RUN),
    execute: vi.fn(async () => RUN),
    // Por padrao o vinculo ativo e o mesmo contra o qual o teste rodou.
    activeChannel: vi.fn(async () => ({
      id: RUN.channelId,
      externalInstanceId: RUN.channelInstanceId,
      displayName: null,
    })),
    ...overrides,
  };
}

function headers(tenantId = TENANT, token = expectedToken("command")) {
  return {
    authorization: `Bearer ${token}`,
    "x-tenant-id": tenantId,
    "x-user-id": "user-1",
  };
}

async function buildApp(activationTest: ReturnType<typeof double>) {
  const app = Fastify();
  await registerInternalRoutes(app, {} as never, {
    inbox: { countDeadLetters: async () => 0 },
    activationTest: activationTest as never,
  });
  // Mesmo envelope de erro de `buildApp()` (src/app.ts).
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        ok: false,
        error: error.message,
        code: error.code,
        requestId: request.id,
      });
    }
    return reply
      .code(500)
      .send({ ok: false, error: toErrorMessage(error), requestId: request.id });
  });
  await app.ready();
  return app;
}

describe("rotas internas do teste real (Goal019/WU-03)", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("tenant que nunca testou nao tem execucao fabricada", async () => {
    const activationTest = double();
    app = await buildApp(activationTest);

    const response = await app.inject({
      method: "GET",
      url: "/internal/activation-test",
      headers: headers(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toBeNull();
  });

  it("iniciar devolve 202 com os seis marcos, nenhum concluido sem fonte", async () => {
    const activationTest = double();
    app = await buildApp(activationTest);

    const response = await app.inject({
      method: "POST",
      url: "/internal/activation-test",
      headers: headers(),
      payload: { tenantPhone: "5511988887777" },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json().data;
    expect(body.state).toBe("RUNNING");
    expect(body.terminal).toBe(false);
    expect(body.maxAttempts).toBe(3);
    expect(
      body.milestones.map((item: { milestone: string }) => item.milestone),
    ).toEqual([...ACTIVATION_TEST_MILESTONES]);
    for (const item of body.milestones) {
      expect(item.reached).toBe(false);
      expect(item.sourceId).toBeNull();
    }
    // A execucao e tocada no servidor, fora da requisicao: ela nao depende da
    // tela que pediu o inicio.
    expect(activationTest.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, runId: RUN.id }),
    );
  });

  it("recusa de inicio chega com codigo proprio e sem virar 500", async () => {
    const activationTest = double({
      start: vi.fn(async () => {
        throw new AppError("no whatsapp", {
          statusCode: 409,
          code: ACTIVATION_TEST_REFUSALS.WHATSAPP_NOT_CONNECTED,
        });
      }),
    });
    app = await buildApp(activationTest);

    const response = await app.inject({
      method: "POST",
      url: "/internal/activation-test",
      headers: headers(),
      payload: { tenantPhone: "5511988887777" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.statusCode).not.toBe(500);
    expect(response.json().code).toBe(
      ACTIVATION_TEST_REFUSALS.WHATSAPP_NOT_CONNECTED,
    );
    expect(activationTest.execute).not.toHaveBeenCalled();
  });

  it("falha da execucao nao vira 500 no inicio: o resultado fica na execucao", async () => {
    const activationTest = double({
      execute: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    app = await buildApp(activationTest);

    const response = await app.inject({
      method: "POST",
      url: "/internal/activation-test",
      headers: headers(),
      payload: { tenantPhone: "5511988887777" },
    });

    expect(response.statusCode).toBe(202);
  });

  it("reiniciar usa a operacao de reinicio, nao a de inicio", async () => {
    const activationTest = double();
    app = await buildApp(activationTest);

    const response = await app.inject({
      method: "POST",
      url: "/internal/activation-test/restart",
      headers: headers(),
      payload: { tenantPhone: "5511988887777" },
    });

    expect(response.statusCode).toBe(202);
    expect(activationTest.restart).toHaveBeenCalledTimes(1);
    expect(activationTest.start).not.toHaveBeenCalled();
  });

  it("exige credencial de comando: sem ela nao ha efeito", async () => {
    const activationTest = double();
    app = await buildApp(activationTest);

    const anonymous = await app.inject({
      method: "POST",
      url: "/internal/activation-test",
      headers: { "x-tenant-id": TENANT, "x-user-id": "user-1" },
      payload: { tenantPhone: "5511988887777" },
    });
    expect(anonymous.statusCode).toBe(401);

    const wrongUse = await app.inject({
      method: "POST",
      url: "/internal/activation-test",
      headers: headers(TENANT, expectedToken("provisioning")),
      payload: { tenantPhone: "5511988887777" },
    });
    expect(wrongUse.statusCode).toBe(403);
    expect(activationTest.start).not.toHaveBeenCalled();
  });
});

/**
 * §6 do Goal019: "a tela diz o que ficou".
 *
 * O resíduo da limpeza é gravado na execução, mas só serve de alguma coisa se
 * chegar ao consumidor. Este bloco falha se o DTO parar de expor o estado da
 * limpeza — que é exatamente o caminho por onde a tela voltaria a poder
 * afirmar limpeza completa sem ter lido nada.
 */
describe("o resíduo da limpeza chega ao consumidor", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("execucao limpa sai com CLEAN e residuo vazio", async () => {
    const activationTest = double({
      current: vi.fn(async () => ({
        ...RUN,
        state: "SUCCEEDED" as const,
        finishedAt: new Date("2026-09-14T12:10:00.000Z"),
        cleanupState: "CLEAN" as const,
        cleanupAt: new Date("2026-09-14T12:09:00.000Z"),
        cleanupResidue: [],
      })),
    });
    app = await buildApp(activationTest);

    const body = (
      await app.inject({
        method: "GET",
        url: "/internal/activation-test",
        headers: headers(),
      })
    ).json().data;

    expect(body.cleanupState).toBe("CLEAN");
    expect(body.cleanupAt).toBe("2026-09-14T12:09:00.000Z");
    expect(body.cleanupResidue).toEqual([]);
  });

  it("o que sobrou sai nomeado, com o ID gravado e a razao em linguagem do negocio", async () => {
    const activationTest = double({
      current: vi.fn(async () => ({
        ...RUN,
        state: "SUCCEEDED" as const,
        cleanupState: "RESIDUAL" as const,
        cleanupAt: new Date("2026-09-14T12:09:00.000Z"),
        cleanupResidue: [
          {
            target: "CUSTOMER" as const,
            id: "customer-1",
            reason: "OPERATION_UNAVAILABLE" as const,
          },
        ],
      })),
    });
    app = await buildApp(activationTest);

    const body = (
      await app.inject({
        method: "GET",
        url: "/internal/activation-test",
        headers: headers(),
      })
    ).json().data;

    expect(body.cleanupState).toBe("RESIDUAL");
    expect(body.cleanupResidue).toEqual([
      {
        target: "CUSTOMER",
        // O ID gravado pela execucao: e por ele que a tela nomeia o que ficou.
        id: "customer-1",
        reason: "OPERATION_UNAVAILABLE",
        label: "pessoa de teste",
        explanation:
          "nao existe operacao de remocao para este dado; ele precisa ser removido a mao",
      },
    ]);
  });

  it("execucao que ainda nao limpou sai PENDING, nunca CLEAN por omissao", async () => {
    const activationTest = double({
      current: vi.fn(async () => RUN),
    });
    app = await buildApp(activationTest);

    const body = (
      await app.inject({
        method: "GET",
        url: "/internal/activation-test",
        headers: headers(),
      })
    ).json().data;

    expect(body.cleanupState).toBe("PENDING");
    expect(body.cleanupAt).toBeNull();
  });
});

/**
 * §7 do Goal019 e o vault: "novo teste e necessario ao vincular
 * novamente/trocar o WhatsApp".
 *
 * A supersecao e **derivada** da comparacao entre o vinculo gravado na
 * execucao e o vinculo ativo agora. Este bloco falha se a derivacao voltar a
 * olhar so o `id` da linha: `ChannelConnection` e unica por
 * `(tenantId, provider)`, entao revincular atualiza a mesma linha e troca a
 * instancia sem mudar o `id` — e o teste do numero antigo continuaria valendo
 * para o numero novo.
 */
describe("teste nao sobrevive a troca do WhatsApp", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const SUCCEEDED = {
    ...RUN,
    state: "SUCCEEDED" as const,
    finishedAt: new Date("2026-09-14T12:10:00.000Z"),
  };

  async function read(activeChannel: unknown) {
    const activationTest = double({
      current: vi.fn(async () => SUCCEEDED),
      activeChannel: vi.fn(async () => activeChannel),
    });
    app = await buildApp(activationTest);
    return (
      await app.inject({
        method: "GET",
        url: "/internal/activation-test",
        headers: headers(),
      })
    ).json().data;
  }

  it("mesmo vinculo e mesma instancia: o teste continua valendo", async () => {
    const body = await read({
      id: RUN.channelId,
      externalInstanceId: RUN.channelInstanceId,
      displayName: null,
    });
    expect(body.state).toBe("SUCCEEDED");
    expect(body.supersededByChannelChange).toBe(false);
  });

  it("mesma linha de vinculo com instancia nova: o teste deixa de valer", async () => {
    const body = await read({
      // Revincular atualiza a MESMA linha: o `id` nao muda, a instancia muda.
      id: RUN.channelId,
      externalInstanceId: "instance-2",
      displayName: null,
    });
    expect(body.supersededByChannelChange).toBe(true);
  });

  it("outro vinculo: o teste deixa de valer", async () => {
    const body = await read({
      id: "channel-2",
      externalInstanceId: RUN.channelInstanceId,
      displayName: null,
    });
    expect(body.supersededByChannelChange).toBe(true);
  });

  it("sem vinculo ativo nenhum: nao ha numero para o qual aquele teste sirva", async () => {
    const body = await read(null);
    expect(body.supersededByChannelChange).toBe(true);
  });
});
