import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  connect: vi.fn(),
  status: vi.fn(),
  pair: vi.fn(),
  syncChannel: vi.fn(),
  syncConfig: vi.fn(),
}));

vi.mock("../src/lib/auth.js", () => ({
  requireAuth: vi.fn(),
  currentUser: () => ({ id: "user-1", email: "owner@example.com" }),
}));

vi.mock("../src/lib/tenant-context.js", () => ({
  requireTenantContext: vi.fn(),
  currentTenantContext: () => ({
    tenantId: "tenant-1",
    userId: "user-1",
    role: "OWNER",
  }),
}));

vi.mock("../src/services/ai-orchestrator.js", () => ({
  syncEvolutionChannelToAiOrchestrator: mocks.syncChannel,
  syncAiTenantConfig: mocks.syncConfig,
}));

vi.mock("../src/lib/prisma.js", () => ({
  getPrisma: () => ({
    whatsAppInstance: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
    userProfile: {
      updateMany: mocks.updateMany,
    },
    businessSettings: {
      upsert: vi.fn().mockResolvedValue({
        id: "business-settings-1",
        userId: "user-1",
        businessName: "Atendly Beauty",
        professionalName: "Maria",
        businessAddress: "Rua 1",
        timezone: "America/Sao_Paulo",
        maxSlotsToOffer: 3,
        availabilityDays: 14,
        slotStepMinutes: 30,
        appointmentLookupDays: 90,
        delayPolicy: "",
        cancellationPolicy: "",
        depositPolicy: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    userSettings: {
      upsert: vi.fn().mockResolvedValue({
        userId: "user-1",
        aiEnabled: true,
        personaType: "WARM",
      }),
    },
  }),
}));

vi.mock("../src/services/evolution-go.js", () => ({
  buildWebhookUrl: () =>
    "https://ai.example.com/webhooks/evolution?token=redacted",
  connectEvolutionInstance: mocks.connect,
  createEvolutionInstance: vi.fn(),
  deleteEvolutionInstance: vi.fn(),
  getEvolutionContacts: vi.fn(),
  getEvolutionQr: vi.fn(),
  getEvolutionStatus: mocks.status,
  logoutEvolutionInstance: vi.fn(),
  pairEvolutionInstance: mocks.pair,
}));

const pendingInstance = {
  id: "instance-1",
  userId: "user-1",
  evolutionInstanceId: "evo-1",
  evolutionInstanceName: "atendly_owner",
  evolutionInstanceToken: "instance-secret",
  phoneNumber: null,
  status: "CONNECTING",
  qrcode: null,
  connectedAt: null,
  lastOwnerActivityAt: null,
  createdAt: new Date("2026-08-14T00:00:00.000Z"),
  updatedAt: new Date("2026-08-14T00:00:00.000Z"),
};

async function pairingApp() {
  const { registerWhatsAppRoutes } = await import("../src/routes/whatsapp.js");
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("INTERNAL_ERROR", "Internal error.", 500);
    void reply.code(appError.statusCode).send({
      error: { code: appError.code, message: appError.message },
      requestId: request.id,
    });
  });
  await registerWhatsAppRoutes(app);
  return app;
}

beforeEach(() => {
  mocks.findUnique.mockResolvedValue(pendingInstance);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.connect.mockResolvedValue({});
  mocks.status.mockResolvedValue({ connected: false, phoneNumber: null });
  mocks.pair.mockResolvedValue({ pairingCode: "ABCD-1234" });
  mocks.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...pendingInstance,
      ...data,
    }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /whatsapp/pair", () => {
  it("isolates by authenticated user, normalizes the phone and reuses the pending instance", async () => {
    const app = await pairingApp();
    const response = await app.inject({
      method: "POST",
      url: "/whatsapp/pair",
      payload: { phone: "(11) 99999-9999" },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        whatsappPhoneRaw: "(11) 99999-9999",
        whatsappPhoneNormalized: "5511999999999",
      },
    });
    expect(mocks.connect).toHaveBeenCalledWith(
      "instance-secret",
      expect.stringContaining("/webhooks/evolution"),
    );
    expect(mocks.pair).toHaveBeenCalledWith("instance-secret", "5511999999999");
    expect(response.json().data).toMatchObject({
      pairingCode: "ABCD-1234",
      connected: false,
      whatsappInstance: { id: "instance-1", status: "CONNECTING" },
    });
    expect(response.body).not.toContain("instance-secret");
    await app.close();
  });

  it("returns the connected state without generating another code", async () => {
    mocks.status.mockResolvedValue({
      connected: true,
      phoneNumber: "5511999999999",
    });
    mocks.update.mockResolvedValue({
      ...pendingInstance,
      status: "CONNECTED",
      phoneNumber: "5511999999999",
      connectedAt: new Date("2026-08-14T00:01:00.000Z"),
    });
    const app = await pairingApp();
    const response = await app.inject({
      method: "POST",
      url: "/whatsapp/pair",
      payload: { phone: "5511999999999" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      pairingCode: null,
      connected: true,
    });
    expect(mocks.pair).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects invalid Brazilian DDDs before calling Evolution", async () => {
    const app = await pairingApp();
    const response = await app.inject({
      method: "POST",
      url: "/whatsapp/pair",
      payload: { phone: "(10) 99999-9999" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.pair).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns a safe upstream failure without exposing the pairing code or token", async () => {
    mocks.pair.mockRejectedValue(
      new AppError("UPSTREAM_ERROR", "Evolution unavailable.", 502),
    );
    const app = await pairingApp();
    const response = await app.inject({
      method: "POST",
      url: "/whatsapp/pair",
      payload: { phone: "5511999999999" },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: {
        code: "UPSTREAM_ERROR",
        message: "Não foi possível gerar o código de conexão.",
      },
    });
    expect(response.body).not.toContain("instance-secret");
    await app.close();
  });
});
