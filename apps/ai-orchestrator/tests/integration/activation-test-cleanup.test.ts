import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { ActivationTestCleanupService } from "../../src/modules/activation-test/ActivationTestCleanupService.js";
import {
  ACTIVATION_TEST_CONTACT_NAME,
  ActivationTestRunStore,
} from "../../src/modules/activation-test/ActivationTestRunStore.js";

// Remocao dos dados de teste contra PostgreSQL de verdade.
//
// O que so o banco prova: que a remocao apaga **exatamente** as linhas cujos
// IDs a execucao gravou. O duble em memoria nao consegue provar isso sozinho,
// porque quem escreve o `WHERE` e o Prisma. Aqui existe uma linha preexistente
// identica em telefone, nome e data a um dado de teste: qualquer remocao que
// deixe de ser por ID a leva junto, e o teste cai.
// Sem AI_TEST_DATABASE_URL a suite e pulada; validate:integration a fornece.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT = "tenant-activation-cleanup";
const CHANNEL = "channel-activation-cleanup";
const CHANNEL_INSTANCE = "instance-activation-cleanup";
const PLATFORM_NUMBER = "5511911113333";
const OTHER_NUMBER = "5511911114444";

/** Agenda dublada: a limpeza nao fala com rede nenhuma neste teste. */
const scheduling = {
  async cancelAppointment(appointmentId: string) {
    return { appointmentId, cancelled: true as const };
  },
  async findFutureAppointmentsForCustomer() {
    return [];
  },
  async findFutureAppointmentsForPhone() {
    return [];
  },
  async findCustomerCandidatesByPhone() {
    return [];
  },
};

describe.skipIf(!databaseUrl)(
  "activation test cleanup against PostgreSQL",
  () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    const store = new ActivationTestRunStore(prisma);
    const cleanup = new ActivationTestCleanupService({
      runs: store,
      scheduling: scheduling as never,
      now: () => new Date("2026-09-14T13:00:00.000Z"),
    });

    async function reset() {
      await prisma.activationTestRun.deleteMany({
        where: { tenantId: TENANT },
      });
      await prisma.message.deleteMany({ where: { tenantId: TENANT } });
      await prisma.conversation.deleteMany({ where: { tenantId: TENANT } });
      await prisma.contact.deleteMany({ where: { tenantId: TENANT } });
      await prisma.channelConnection.upsert({
        where: { tenantId_id: { tenantId: TENANT, id: CHANNEL } },
        update: {},
        create: {
          id: CHANNEL,
          tenantId: TENANT,
          userId: `user-${TENANT}`,
          provider: "EVOLUTION_GO",
          externalInstanceId: `instance-${TENANT}`,
        },
      });
    }

    beforeEach(reset);

    afterAll(async () => {
      await reset();
      await prisma.channelConnection.deleteMany({
        where: { tenantId: TENANT },
      });
      await prisma.$disconnect();
    });

    /**
     * Linha preexistente que **parece** dado de teste em tudo: mesmo nome de
     * contato, numero da plataforma no mesmo formato e mensagem do mesmo dia.
     * Ela nasce por outro caminho, nao pela execucao.
     */
    async function plantLookAlike() {
      const contact = await prisma.contact.create({
        data: {
          tenantId: TENANT,
          channelId: CHANNEL,
          externalContactId: OTHER_NUMBER,
          displayName: ACTIVATION_TEST_CONTACT_NAME,
        },
      });
      const conversation = await prisma.conversation.create({
        data: {
          tenantId: TENANT,
          channelId: CHANNEL,
          externalContactId: OTHER_NUMBER,
          customerName: ACTIVATION_TEST_CONTACT_NAME,
          contactId: contact.id,
          state: {},
        },
      });
      const message = await prisma.message.create({
        data: {
          tenantId: TENANT,
          channelId: CHANNEL,
          conversationId: conversation.id,
          externalMessageId: "look-alike-1",
          correlationId: "look-alike-1",
          direction: "INBOUND",
          source: "CUSTOMER",
          role: "user",
          body: "Oi! Quanto custa Corte?",
        },
      });
      return { contact, conversation, message };
    }

    async function executionThatCreatedTestData() {
      const run = await store.createRun({
        tenantId: TENANT,
        channelId: CHANNEL,
    channelInstanceId: CHANNEL_INSTANCE,
        tenantPhone: "5511988887777",
        platformNumber: PLATFORM_NUMBER,
        maxAttempts: 3,
        serviceId: "service-1",
        serviceName: "Corte",
      });
      const opened = await store.openTestConversation({
        tenantId: TENANT,
        channelId: CHANNEL,
        platformNumber: PLATFORM_NUMBER,
      });
      const first = await store.recordConversationMessage({
        tenantId: TENANT,
        channelId: CHANNEL,
        conversationId: opened.conversationId,
        author: "CLIENT",
        body: "Oi! Quanto custa Corte?",
        correlationId: `activation-${run.id}-1`,
      });
      const second = await store.recordConversationMessage({
        tenantId: TENANT,
        channelId: CHANNEL,
        conversationId: opened.conversationId,
        author: "AI",
        body: "Corte: R$ 120,00.",
        correlationId: `activation-${run.id}-2`,
      });
      return store.patchRun(TENANT, run.id, {
        conversationId: opened.conversationId,
        contactId: opened.contactId,
        createdConversationId: opened.createdConversation
          ? opened.conversationId
          : null,
        createdContactId: opened.createdContact ? opened.contactId : null,
        appendMessageIds: [first.id, second.id],
      });
    }

    it("apaga so o que a execucao criou e nao encosta na linha parecida", async () => {
      const lookAlike = await plantLookAlike();
      const run = await executionThatCreatedTestData();
      expect(run.createdConversationId).toBe(run.conversationId);
      expect(run.createdContactId).toBe(run.contactId);
      expect(run.createdMessageIds).toHaveLength(2);

      const result = await cleanup.clean({
        tenantId: TENANT,
        runId: run.id,
        userId: "user-1",
        requestId: "request-1",
      });

      expect(result?.state).toBe("CLEAN");
      expect(result?.removed).toEqual({
        MESSAGE: 2,
        CONVERSATION: 1,
        CONTACT: 1,
      });

      // Leitura dos read models: o dado de teste saiu.
      expect(
        await prisma.message.findMany({
          where: { tenantId: TENANT, id: { in: run.createdMessageIds } },
        }),
      ).toEqual([]);
      expect(
        await prisma.conversation.findUnique({
          where: { id: run.conversationId ?? "" },
        }),
      ).toBeNull();
      expect(
        await prisma.contact.findUnique({ where: { id: run.contactId ?? "" } }),
      ).toBeNull();

      // E a linha preexistente continua inteira.
      expect(
        await prisma.contact.findUnique({
          where: { id: lookAlike.contact.id },
        }),
      ).not.toBeNull();
      expect(
        await prisma.conversation.findUnique({
          where: { id: lookAlike.conversation.id },
        }),
      ).not.toBeNull();
      expect(
        await prisma.message.findUnique({
          where: { id: lookAlike.message.id },
        }),
      ).not.toBeNull();
    });

    it("nao apaga mensagem da propria conversa de teste que a execucao nao criou", async () => {
      const run = await executionThatCreatedTestData();
      // Mensagem dentro da conversa de teste, do mesmo dia, com o mesmo corpo
      // de uma mensagem do cliente simulado — e que a execucao nao criou.
      // Remocao por conversa, por data ou por padrao de texto a levaria junto.
      const alheia = await prisma.message.create({
        data: {
          tenantId: TENANT,
          channelId: CHANNEL,
          conversationId: run.conversationId ?? "",
          externalMessageId: "outside-1",
          correlationId: "outside-1",
          direction: "INBOUND",
          source: "OWNER",
          role: "user",
          body: "Oi! Quanto custa Corte?",
        },
      });

      const result = await cleanup.clean({
        tenantId: TENANT,
        runId: run.id,
        userId: "user-1",
        requestId: "request-1",
      });

      // As duas mensagens da execucao sairam; a terceira nao e dela.
      expect(result?.removed.MESSAGE).toBe(2);
      expect(
        await prisma.message.findUnique({ where: { id: alheia.id } }),
      ).not.toBeNull();
      // A conversa nao pode ser apagada com uma mensagem alheia dentro: a
      // remocao dela sobra como residuo em vez de arrastar a linha de
      // terceiro.
      expect(
        result?.residue.some((item) => item.target === "CONVERSATION"),
      ).toBe(true);
      expect(result?.state).toBe("RESIDUAL");
    });

    it("conversa que a execucao apenas encontrou nao e apagada", async () => {
      // A conversa do numero da plataforma ja existia antes do teste.
      const contact = await prisma.contact.create({
        data: {
          tenantId: TENANT,
          channelId: CHANNEL,
          externalContactId: PLATFORM_NUMBER,
          displayName: ACTIVATION_TEST_CONTACT_NAME,
        },
      });
      const conversation = await prisma.conversation.create({
        data: {
          tenantId: TENANT,
          channelId: CHANNEL,
          externalContactId: PLATFORM_NUMBER,
          customerName: ACTIVATION_TEST_CONTACT_NAME,
          contactId: contact.id,
          state: {},
        },
      });

      const run = await executionThatCreatedTestData();
      expect(run.conversationId).toBe(conversation.id);
      expect(run.createdConversationId).toBeNull();
      expect(run.createdContactId).toBeNull();

      const result = await cleanup.clean({
        tenantId: TENANT,
        runId: run.id,
        userId: "user-1",
        requestId: "request-1",
      });

      expect(result?.removed).toEqual({
        MESSAGE: 2,
        CONVERSATION: 0,
        CONTACT: 0,
      });
      expect(
        await prisma.conversation.findUnique({
          where: { id: conversation.id },
        }),
      ).not.toBeNull();
      expect(
        await prisma.contact.findUnique({ where: { id: contact.id } }),
      ).not.toBeNull();
    });

    it("repetir a limpeza nao apaga mais nada e nao falha", async () => {
      const lookAlike = await plantLookAlike();
      const run = await executionThatCreatedTestData();

      await cleanup.clean({
        tenantId: TENANT,
        runId: run.id,
        userId: "user-1",
        requestId: "request-1",
      });
      const second = await cleanup.clean({
        tenantId: TENANT,
        runId: run.id,
        userId: "user-1",
        requestId: "request-2",
      });

      expect(second?.removed).toEqual({
        MESSAGE: 0,
        CONVERSATION: 0,
        CONTACT: 0,
      });
      expect(second?.state).toBe("CLEAN");
      expect(
        await prisma.message.findUnique({
          where: { id: lookAlike.message.id },
        }),
      ).not.toBeNull();
    });

    it("grava o estado da limpeza na propria execucao", async () => {
      const run = await executionThatCreatedTestData();
      expect(run.cleanupState).toBe("PENDING");

      await cleanup.clean({
        tenantId: TENANT,
        runId: run.id,
        userId: "user-1",
        requestId: "request-1",
      });

      const stored = await store.findRun(TENANT, run.id);
      expect(stored?.cleanupState).toBe("CLEAN");
      expect(stored?.cleanupAt).toEqual(new Date("2026-09-14T13:00:00.000Z"));
      expect(stored?.cleanupResidue).toEqual([]);
    });
  },
);
