import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { returnContactExclusions } from "../../src/modules/customer-return/return-eligibility.js";
import { returnInvitationPromptItem } from "../../src/modules/customer-return/return-invitation.js";
import { buildReturnInvitationPrompt } from "../../src/modules/prompts/customer-return.js";
import { buildSystemPrompt } from "../../src/modules/prompts/system.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";
import { AssistantToolRegistry } from "../../src/modules/tools/assistant-tools.js";

/**
 * A conversa depois do convite de retorno (D-206): a IA sabe o que foi
 * oferecido (rotina, serviço, data, horários, costume da cliente e o
 * incentivo prometido — nenhum outro), registra recusa e pedido para parar
 * por uma tool que só alcança o convite desta conversa, e o BFF consegue
 * tirar da lista quem é contato ignorado ou conversa pessoal.
 */

const invitationRow = {
  id: "invitation-a",
  tenantId: "tenant-1",
  conversationId: "conversation-1",
  targetId: "target-a",
  kind: "WINBACK",
  serviceName: "Manutenção 5D",
  expectedDate: null,
  incentive: "hidratação de brinde na volta",
  offeredSlots: [],
  habit: { weekdays: [5, 6], bandStart: "16:00", bandEnd: "19:00" },
  sentAt: new Date("2026-10-15T12:00:00.000Z"),
  followUpSentAt: null,
  answer: null as string | null,
};

describe("seção do convite no prompt", () => {
  it("leva rotina, serviço, costume e o incentivo prometido, palavra por palavra", () => {
    const lines = buildReturnInvitationPrompt(
      returnInvitationPromptItem(invitationRow),
    ).join("\n");
    expect(lines).toContain("CONVITE DE RETORNO ENVIADO A ESTA CLIENTE:");
    expect(lines).toContain("Resgate");
    expect(lines).toContain("Servico do convite: Manutenção 5D.");
    expect(lines).toContain("nos dias sexta, sabado");
    expect(lines).toContain("entre 16:00 e 19:00");
    expect(lines).toContain('"hidratação de brinde na volta"');
    expect(lines).toContain("Nunca invente outro desconto, brinde ou condicao");
    expect(lines).toContain("answer_return_invitation com answer DECLINED");
    expect(lines).toContain("answer_return_invitation com answer STOPPED");
  });

  it("sem incentivo, proíbe oferecer condição; horários oferecidos pedem nova conferência", () => {
    const lines = buildReturnInvitationPrompt(
      returnInvitationPromptItem({
        ...invitationRow,
        kind: "RENEWAL",
        incentive: null,
        expectedDate: "2026-10-22",
        offeredSlots: [{ date: "2026-10-23", time: "17:30" }],
      }),
    ).join("\n");
    expect(lines).toContain("Nao ha condicao especial neste convite");
    expect(lines).toContain("Data esperada de volta: quinta 22/10.");
    expect(lines).toContain("sexta 23/10 as 17:30");
    expect(lines).toContain("confira com get_availability");
  });

  it("só entra no prompt da conversa com convite", () => {
    const base = {
      businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
      currentDateTime: "2026-10-19T12:00:00.000Z",
    };
    const without = buildSystemPrompt(base);
    const withInvitation = buildSystemPrompt({
      ...base,
      returnInvitation: returnInvitationPromptItem(invitationRow),
    });
    expect(without.text).not.toContain("CONVITE DE RETORNO");
    expect(withInvitation.text).toContain("CONVITE DE RETORNO");
    // A versão do prompt é a mesma: a seção é parte do template (v12).
    expect(withInvitation.version).toBe(without.version);
  });
});

function toolHarness(options: { invitation?: typeof invitationRow | null }) {
  const reported: Array<{ targetId: string; answer: string }> = [];
  const updates: Array<Record<string, unknown>> = [];
  const prisma = {
    returnInvitation: {
      findFirst: async (args: { where: { conversationId: string } }) =>
        args.where.conversationId === "conversation-1"
          ? options.invitation === undefined
            ? invitationRow
            : options.invitation
          : null,
      update: async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
      },
    },
  } as unknown as PrismaClient;
  const agenda = {
    reportReturnAnswer: async (
      _tenantId: string,
      targetId: string,
      answer: "DECLINED" | "STOPPED",
    ) => {
      reported.push({ targetId, answer });
      return {
        customerId: "customer-a",
        blocked: true,
        permanent: answer === "STOPPED",
        blockedUntil: answer === "STOPPED" ? null : "2027-01-13T12:00:00.000Z",
        reason: answer,
        lastMessageAt: "2026-10-15T12:00:00.000Z",
      };
    },
  };
  const registry = new AssistantToolRegistry(prisma, agenda as never);
  return { registry, reported, updates };
}

function context(conversationId = "conversation-1") {
  return {
    turnId: "channel-1:message-1",
    conversationId,
    tenantId: "tenant-1",
    channelId: "channel-1",
    userId: "user-1",
    requestId: "request-1",
    phone: "555596936463",
    customerName: "Joice",
    businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
    aiRunId: "ai-run-1",
  };
}

describe("answer_return_invitation", () => {
  it("recusa: relata ao dono o convite desta conversa e grava a resposta", async () => {
    const world = toolHarness({});
    const result = await world.registry.execute(
      {
        id: "call-1",
        name: "answer_return_invitation",
        args: { answer: "DECLINED" },
      },
      context(),
    );
    expect(result).toMatchObject({
      ok: true,
      data: { recorded: true, answer: "DECLINED", permanent: false },
    });
    expect(world.reported).toEqual([
      { targetId: "target-a", answer: "DECLINED" },
    ]);
    expect(world.updates[0]).toMatchObject({ answer: "DECLINED" });
  });

  it("pedido para parar já registrado não é relatado de novo", async () => {
    const world = toolHarness({
      invitation: { ...invitationRow, answer: "STOPPED" },
    });
    const result = await world.registry.execute(
      {
        id: "call-2",
        name: "answer_return_invitation",
        args: { answer: "DECLINED" },
      },
      context(),
    );
    expect(result).toMatchObject({ ok: true, data: { answer: "STOPPED" } });
    expect(world.reported).toEqual([]);
  });

  it("sem convite nesta conversa, não registra nada", async () => {
    const world = toolHarness({});
    const result = await world.registry.execute(
      {
        id: "call-3",
        name: "answer_return_invitation",
        args: { answer: "STOPPED" },
      },
      context("conversation-2"),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "RETURN_INVITATION_NOT_FOUND" },
    });
    expect(world.reported).toEqual([]);
  });
});

describe("quem a lista do retorno deixa de fora", () => {
  it("contato ignorado e conversa pessoal, com e sem o 9º dígito", async () => {
    const prisma = {
      contact: {
        findMany: async () => [
          {
            id: "contact-ignored",
            externalContactId: "555596936463",
            ignored: true,
            categoryOverride: null,
          },
          {
            id: "contact-personal",
            externalContactId: "5511988880000",
            ignored: false,
            categoryOverride: null,
          },
          {
            id: "contact-ok",
            externalContactId: "5511977770000",
            ignored: false,
            categoryOverride: null,
          },
        ],
      },
      conversationSession: {
        findMany: async () => [
          {
            contactId: "contact-personal",
            category: "PERSONAL",
            categoryOverride: null,
          },
          {
            contactId: "contact-ok",
            category: "PERSONAL",
            categoryOverride: "COMMERCIAL",
          },
        ],
      },
    };
    const excluded = await returnContactExclusions(
      prisma as never,
      "tenant-1",
      [
        "+55 55 99693-6463",
        "11 98888-0000",
        "+55 11 97777-0000",
        "+55 21 96666-0000",
      ],
    );
    expect(excluded).toEqual([
      { phone: "+55 55 99693-6463", reason: "IGNORED" },
      { phone: "11 98888-0000", reason: "PERSONAL" },
    ]);
  });
});
