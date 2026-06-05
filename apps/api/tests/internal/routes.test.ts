import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("internal routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("resumes paused bot conversations for normalized phones", async () => {
    vi.stubEnv("ADMIN_API_TOKEN", "admin-token");
    vi.resetModules();

    const conversationFindUnique = vi.fn().mockResolvedValue({ id: "conversation-1" });
    const conversationUpdate = vi.fn().mockResolvedValue({});
    const handoffUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const prisma = {
      conversation: {
        findUnique: conversationFindUnique,
        update: conversationUpdate
      },
      handoff: {
        updateMany: handoffUpdateMany
      }
    };

    const { registerInternalRoutes } = await import("../../src/modules/internal/routes.js");
    const app = Fastify();
    await registerInternalRoutes(app, prisma as never);

    const response = await app.inject({
      method: "POST",
      url: "/internal/bot/resume",
      headers: {
        authorization: "Bearer admin-token"
      },
      payload: {
        phones: ["5511999999999", "5511999999999"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, resumed: 1 });
    expect(conversationFindUnique).toHaveBeenCalledWith({
      where: { whatsappPhone: "5511999999999" }
    });
    expect(conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: {
        humanHandoff: false,
        status: "ACTIVE",
        handoffPausedUntil: null
      }
    });
    expect(handoffUpdateMany).toHaveBeenCalledWith({
      where: {
        phone: "5511999999999",
        status: "OPEN"
      },
      data: {
        status: "RESOLVED",
        resolvedAt: expect.any(Date)
      }
    });

    await app.close();
  });

  it("rejects bot resume requests without the internal token", async () => {
    vi.stubEnv("ADMIN_API_TOKEN", "admin-token");
    vi.resetModules();

    const { registerInternalRoutes } = await import("../../src/modules/internal/routes.js");
    const app = Fastify();
    await registerInternalRoutes(app, {} as never);

    const response = await app.inject({
      method: "POST",
      url: "/internal/bot/resume",
      payload: {
        phones: ["5511999999999"]
      }
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("returns active human handoff status for paused bot conversations", async () => {
    vi.stubEnv("ADMIN_API_TOKEN", "admin-token");
    vi.resetModules();

    const pauseUntil = new Date("9999-12-31T23:59:59.000Z");
    const conversationFindUnique = vi
      .fn()
      .mockResolvedValueOnce({
        id: "conversation-1",
        humanHandoff: true,
        handoffPausedUntil: pauseUntil
      })
      .mockResolvedValueOnce({
        id: "conversation-1",
        humanHandoff: true,
        handoffPausedUntil: pauseUntil,
        handoffs: [
          {
            id: "handoff-1",
            reason: "Atendimento humano detectado pelo WhatsApp",
            summary: "Mensagem fromMe=true recebida do Evolution Go."
          }
        ]
      })
      .mockResolvedValueOnce({
        id: "conversation-2",
        humanHandoff: false,
        handoffPausedUntil: null
      });

    const prisma = {
      conversation: {
        findUnique: conversationFindUnique,
        update: vi.fn()
      }
    };

    const { registerInternalRoutes } = await import("../../src/modules/internal/routes.js");
    const app = Fastify();
    await registerInternalRoutes(app, prisma as never);

    const response = await app.inject({
      method: "POST",
      url: "/internal/bot/status",
      headers: {
        authorization: "Bearer admin-token"
      },
      payload: {
        phones: ["5511999999999", "5511888888888"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      statuses: [
        {
          phone: "5511999999999",
          humanHandoff: true,
          reason: "Atendimento humano detectado pelo WhatsApp",
          summary: "Mensagem fromMe=true recebida do Evolution Go.",
          pauseUntil: "9999-12-31T23:59:59.000Z",
          handoffId: "handoff-1"
        }
      ]
    });

    await app.close();
  });

  it("rejects bot status requests without the internal token", async () => {
    vi.stubEnv("ADMIN_API_TOKEN", "admin-token");
    vi.resetModules();

    const { registerInternalRoutes } = await import("../../src/modules/internal/routes.js");
    const app = Fastify();
    await registerInternalRoutes(app, {} as never);

    const response = await app.inject({
      method: "POST",
      url: "/internal/bot/status",
      payload: {
        phones: ["5511999999999"]
      }
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
