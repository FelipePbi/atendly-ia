import { describe, expect, it } from "vitest";

import type { ActivityRecord } from "../../src/modules/activity/activity-log.js";
import {
  recordConversationActivity,
  withCurrentContactNames,
} from "../../src/modules/activity/orchestrator-activity.js";

/**
 * Nome do contato no registro de atividade (D-200): a conversa sem nome
 * grava o nome do contato do WhatsApp, e a leitura troca o número pelo nome
 * que o contato ganhou depois. Sem nome em lugar nenhum, fica o número.
 */

function record(overrides: Partial<ActivityRecord>): ActivityRecord {
  return {
    id: "a1",
    sequence: "1",
    occurredAt: "2026-10-18T12:00:00.000Z",
    actorType: "USER",
    actorId: "owner",
    area: "CONVERSATIONS",
    action: "conversation.contact_ignored",
    entityType: "conversation",
    entityId: "conv-1",
    entityLabel: "555596936463",
    changes: [],
    details: null,
    ...overrides,
  };
}

describe("nome do contato no registro", () => {
  it("grava o nome do contato quando a conversa não tem nome", async () => {
    const created: Array<Record<string, unknown>> = [];
    const writer = {
      activityLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        },
      },
      contact: {
        findFirst: async () => ({ displayName: "Maria" }),
        findUnique: async () => null,
      },
    };
    await recordConversationActivity(
      writer as never,
      "tenant-1",
      { type: "USER", id: "owner" },
      { id: "conv-1", customerName: null, externalContactId: "555596936463" },
      "conversation.contact_ignored",
    );
    expect(created[0]).toMatchObject({ entityLabel: "Maria" });
  });

  it("sem nome em lugar nenhum, grava o número", async () => {
    const created: Array<Record<string, unknown>> = [];
    const writer = {
      activityLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        },
      },
      contact: { findFirst: async () => null, findUnique: async () => null },
    };
    await recordConversationActivity(
      writer as never,
      "tenant-1",
      { type: "USER", id: "owner" },
      { id: "conv-1", customerName: "  ", externalContactId: "555596936463" },
      "conversation.contact_ignored",
    );
    expect(created[0]).toMatchObject({ entityLabel: "555596936463" });
  });

  it("na leitura, troca só o número pelo nome que o contato tem hoje", async () => {
    const prisma = {
      conversation: {
        findMany: async () => [
          { id: "conv-1", customerName: null, contact: { displayName: "Maria" } },
        ],
      },
      contact: {
        findMany: async () => [{ id: "contact-9", displayName: "Felipe" }],
      },
    };
    const items = [
      record({}),
      record({
        id: "a2",
        action: "conversation.contact_unignored",
        entityType: "contact",
        entityId: "contact-9",
        entityLabel: "555596513889",
      }),
      record({ id: "a3", entityId: "conv-2", entityLabel: "Ana" }),
      record({
        id: "a4",
        area: "CUSTOMERS",
        entityType: "customer",
        entityId: "conv-1",
      }),
    ];
    const named = await withCurrentContactNames(prisma as never, "tenant-1", items);
    expect(named.map((item) => item.entityLabel)).toEqual([
      "Maria",
      "Felipe",
      "Ana",
      "555596936463",
    ]);
  });

  it("sem rótulo numérico, nem consulta o banco", async () => {
    const prisma = {
      conversation: {
        findMany: async () => {
          throw new Error("não devia consultar");
        },
      },
      contact: {
        findMany: async () => {
          throw new Error("não devia consultar");
        },
      },
    };
    const items = [record({ entityLabel: "Ana" })];
    expect(await withCurrentContactNames(prisma as never, "t", items)).toBe(items);
  });
});
