/**
 * Erro de infraestrutura do Scheduling (autenticacao interna, timeout,
 * indisponibilidade, 5xx) nunca chega ao contexto do modelo nem a uma
 * mensagem enviada (Goal011, WU-04). O detalhe real so aparece no log, com
 * requestId e aiRunId; a conversa segue pelo caminho generico de falha de
 * tool ja existente em `AssistantService`.
 *
 * Erro de dominio (`DomainError`), ao contrario, chega ao modelo com o
 * codigo proprio, para poder oferecer alternativa.
 */
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type { DiagnosticLogger } from "../../src/lib/diagnostic-log.js";
import { DomainError, InfrastructureError } from "../../src/lib/errors.js";
import {
  AssistantService,
  type AssistantGraphSession,
} from "../../src/modules/assistant/assistant.service.js";
import type { ModelToolCall } from "../../src/modules/model/model-provider.js";
import type { SchedulingGateway } from "../../src/modules/scheduling-service/client.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

const requestId = "request-1";
const aiRunId = "ai-run-1";

function session(): AssistantGraphSession {
  return {
    conversationId: "conversation-1",
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId,
    inputMessageIds: ["message-1"],
    turnId: "channel-1:message-1",
    phone: "5511999999999",
    businessContext: DEFAULT_BUSINESS_CONTEXT,
    instructions: "",
    promptVersion: "v1",
    input: [],
    turns: [],
    iteration: 0,
    aiRunId,
  };
}

function listServicesCall(): ModelToolCall {
  return { id: "call-1", name: "list_services", args: {} };
}

function createFakePrisma() {
  const toolCalls: Array<Record<string, unknown>> = [];
  const prisma = {
    aiToolCall: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        const record = { id: `tool-call-${toolCalls.length + 1}`, ...args.data };
        toolCalls.push(record);
        return record;
      },
      update: async (args: { data: Record<string, unknown> }) => {
        Object.assign(toolCalls[toolCalls.length - 1], args.data);
      },
    },
  } as unknown as PrismaClient;
  return { prisma, toolCalls };
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } satisfies DiagnosticLogger;
}

function createGateway(fail: () => never): SchedulingGateway {
  return {
    listActiveServices: async () => fail(),
  } as unknown as SchedulingGateway;
}

describe("infrastructure vs domain tool failures reaching the model", () => {
  it("never puts infrastructure detail in the model-facing tool result, and logs it with requestId/aiRunId", async () => {
    const { prisma } = createFakePrisma();
    const logger = createLogger();
    const rawMessage = "Scheduling Service authentication is not configured.";
    const gateway = createGateway(() => {
      throw new InfrastructureError(rawMessage, {
        code: "SCHEDULING_AUTH_NOT_CONFIGURED",
      });
    });
    const tools = new AssistantToolRegistry(prisma, gateway);
    const assistant = new AssistantService(
      prisma,
      logger,
      { invoke: vi.fn() } as never,
      tools,
    );

    const { toolResults } = await assistant.executeGraphTools(session(), [
      listServicesCall(),
    ]);

    const content = toolResults[0]!.content;
    expect(content).not.toContain(rawMessage);
    expect(content).not.toContain("authentication");
    const parsed = JSON.parse(content) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("TOOL_INFRASTRUCTURE_ERROR");
    expect(parsed.error.message).not.toContain(rawMessage);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        aiRunId,
        infrastructure: true,
        error: expect.stringContaining(rawMessage),
      }),
      expect.any(String),
    );
  });

  it("lets a domain failure reach the model with its own code and message", async () => {
    const { prisma } = createFakePrisma();
    const logger = createLogger();
    const domainMessage = "Slot is unavailable for the service duration.";
    const gateway = createGateway(() => {
      throw new DomainError(domainMessage, { code: "SLOT_UNAVAILABLE" });
    });
    const tools = new AssistantToolRegistry(prisma, gateway);
    const assistant = new AssistantService(
      prisma,
      logger,
      { invoke: vi.fn() } as never,
      tools,
    );

    const { toolResults } = await assistant.executeGraphTools(session(), [
      listServicesCall(),
    ]);

    const parsed = JSON.parse(toolResults[0]!.content) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("SLOT_UNAVAILABLE");
    expect(parsed.error.message).toBe(domainMessage);
  });
});
