import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { ContentPurgeService } from "../../src/modules/retention/content-purge-service.js";

// Purga de conteúdo de conversa contra PostgreSQL real (Goal023/WU-02).
//
// Mesmo alvo descartável das demais suítes de banco, preparado pelos ensaios de
// migration. Sem AI_TEST_DATABASE_URL a suíte é pulada, para que o gate local
// não dependa de banco pessoal; validate:integration a fornece.
//
// Apagar dado de cliente é a operação de menor reversibilidade da plataforma:
// o que este arquivo prova não é que a purga funciona, e sim **o que ela não
// alcança** — não classificado sem o terceiro cutoff, janela ambígua com uma
// categoria no prazo, órfão de sessão, dentro do prazo, e o negócio vizinho.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT_A = "tenant-purge-a";
const TENANT_B = "tenant-purge-b";
const CHANNEL_A = "channel-purge-a";
const CHANNEL_B = "channel-purge-b";
const CONTACT = "5511966666666";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const day = (offset: number) =>
  new Date(NOW.getTime() - offset * 24 * 60 * 60 * 1000);

// Os cutoffs chegam calculados: comercial 90 dias, pessoal 30 — os defaults do
// produto. A rota não os deriva de relógio próprio.
const COMMERCIAL_CUTOFF = day(90);
const PERSONAL_CUTOFF = day(30);
// U-01 (Goal080): em produção o BFF manda aqui o mesmo instante do cutoff
// comercial. O teste usa um valor distinto de propósito: um ramo que
// reaproveitasse `commercialCutoff` para `UNCLASSIFIED` pouparia a linha de 70
// dias e reprovaria.
const UNCLASSIFIED_CUTOFF = day(60);

describe.skipIf(!databaseUrl)(
  "conversation content purge against PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let purge: ContentPurgeService;

    const purgeA = (maxRows = 500) =>
      purge.purge({
        tenantId: TENANT_A,
        commercialCutoff: COMMERCIAL_CUTOFF,
        personalCutoff: PERSONAL_CUTOFF,
        maxRows,
        now: NOW,
      });

    /** A mesma passada, agora com o terceiro cutoff que o BFF passa a mandar. */
    const purgeWithUnclassified = (tenantId = TENANT_A, maxRows = 500) =>
      purge.purge({
        tenantId,
        commercialCutoff: COMMERCIAL_CUTOFF,
        personalCutoff: PERSONAL_CUTOFF,
        unclassifiedCutoff: UNCLASSIFIED_CUTOFF,
        maxRows,
        now: NOW,
      });

    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
      });
      purge = new ContentPurgeService(prisma);

      for (const [tenantId, channelId] of [
        [TENANT_A, CHANNEL_A],
        [TENANT_B, CHANNEL_B],
      ] as const) {
        await prisma.channelConnection.upsert({
          where: { tenantId_id: { tenantId, id: channelId } },
          update: {},
          create: {
            id: channelId,
            tenantId,
            userId: `user-${tenantId}`,
            provider: "EVOLUTION_GO",
            externalInstanceId: `instance-${tenantId}`,
          },
        });
      }
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      const tenants = { in: [TENANT_A, TENANT_B] };
      await prisma.aiToolCall.deleteMany({ where: { tenantId: tenants } });
      await prisma.customerMemory.deleteMany({ where: { tenantId: tenants } });
      await prisma.knowledgeDocument.deleteMany({
        where: { tenantId: tenants },
      });
      await prisma.aiRun.deleteMany({ where: { tenantId: tenants } });
      await prisma.messageAttachment.deleteMany({
        where: { tenantId: tenants },
      });
      await prisma.message.deleteMany({ where: { tenantId: tenants } });
      await prisma.handoff.deleteMany({ where: { tenantId: tenants } });
      await prisma.conversationSession.deleteMany({
        where: { tenantId: tenants },
      });
      await prisma.conversation.deleteMany({ where: { tenantId: tenants } });
      await prisma.contact.deleteMany({ where: { tenantId: tenants } });
    });

    /** Conversa com uma sessão já encerrada cobrindo `[from, to)`. */
    async function seedConversation(input: {
      tenantId: string;
      channelId: string;
      conversationId: string;
      category: "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL";
      from: Date;
      to: Date | null;
    }): Promise<void> {
      const { tenantId, channelId, conversationId } = input;
      await prisma.conversation.create({
        data: {
          id: conversationId,
          tenantId,
          channelId,
          externalContactId: `${CONTACT}-${conversationId}`,
          state: {},
        },
      });
      const contact = await prisma.contact.create({
        data: {
          tenantId,
          channelId,
          externalContactId: `${CONTACT}-${conversationId}`,
        },
      });
      await prisma.conversationSession.create({
        data: {
          tenantId,
          channelId,
          conversationId,
          contactId: contact.id,
          startedAt: input.from,
          expiresAt: input.to ?? new Date(NOW.getTime() + 60_000),
          endedAt: input.to,
          category: input.category,
        },
      });
    }

    /**
     * Sessão adicional, já encerrada, na conversa criada por
     * `seedConversation`. É o que monta uma janela ambígua: duas sessões
     * governando o mesmo instante.
     */
    async function seedExtraSession(input: {
      tenantId: string;
      channelId: string;
      conversationId: string;
      category: "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL";
      from: Date;
      to: Date;
    }): Promise<void> {
      const contact = await prisma.contact.findFirstOrThrow({
        where: {
          tenantId: input.tenantId,
          externalContactId: `${CONTACT}-${input.conversationId}`,
        },
      });
      await prisma.conversationSession.create({
        data: {
          tenantId: input.tenantId,
          channelId: input.channelId,
          conversationId: input.conversationId,
          contactId: contact.id,
          startedAt: input.from,
          expiresAt: input.to,
          endedAt: input.to,
          category: input.category,
        },
      });
    }

    async function seedMessage(input: {
      tenantId: string;
      channelId: string;
      conversationId: string;
      id: string;
      createdAt: Date;
      withAttachment?: boolean;
    }): Promise<void> {
      await prisma.message.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          channelId: input.channelId,
          conversationId: input.conversationId,
          direction: "INBOUND",
          role: "user",
          body: "conteudo de conversa",
          createdAt: input.createdAt,
        },
      });
      if (input.withAttachment) {
        await prisma.messageAttachment.create({
          data: {
            tenantId: input.tenantId,
            messageId: input.id,
            kind: "AUDIO",
            transcript: "transcricao do audio",
            transcriptStatus: "DONE",
          },
        });
      }
    }

    async function seedAiRun(input: {
      tenantId: string;
      channelId: string;
      conversationId: string;
      id: string;
      startedAt: Date;
      withToolCall?: boolean;
    }): Promise<void> {
      await prisma.aiRun.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          channelId: input.channelId,
          conversationId: input.conversationId,
          provider: "openai",
          model: "test-model",
          promptVersion: "v1",
          inputMessageIds: [],
          outputText: "resposta dita ao cliente",
          startedAt: input.startedAt,
        },
      });
      if (input.withToolCall) {
        await prisma.aiToolCall.create({
          data: {
            tenantId: input.tenantId,
            aiRunId: input.id,
            name: "check_availability",
            arguments: { date: "2026-01-01" },
            result: { slots: [] },
          },
        });
      }
    }

    const messageIds = async (tenantId: string) =>
      (
        await prisma.message.findMany({
          where: { tenantId },
          orderBy: { id: "asc" },
          select: { id: true },
        })
      ).map((row) => row.id);

    it("apaga mensagem comercial fora do prazo e preserva a que esta dentro", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-commercial",
        category: "COMMERCIAL",
        from: day(400),
        to: null,
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-commercial",
        id: "msg-commercial-old",
        createdAt: day(120),
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-commercial",
        id: "msg-commercial-fresh",
        createdAt: day(45),
      });

      const result = await purgeA();

      expect(result.messages).toBe(1);
      expect(await messageIds(TENANT_A)).toEqual(["msg-commercial-fresh"]);
    });

    it("governa mensagem pessoal pelo prazo pessoal, nao pelo comercial", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-personal",
        category: "PERSONAL",
        from: day(400),
        to: null,
      });
      // 45 dias sobrevive ao prazo comercial de 90 e morre no pessoal de 30:
      // é exatamente a linha que distingue as duas categorias.
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-personal",
        id: "msg-personal-old",
        createdAt: day(45),
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-personal",
        id: "msg-personal-fresh",
        createdAt: day(10),
      });

      const result = await purgeA();

      expect(result.messages).toBe(1);
      expect(await messageIds(TENANT_A)).toEqual(["msg-personal-fresh"]);
    });

    // Guarda de deploy fora de ordem (Goal080 §6.2): um BFF antigo não manda o
    // terceiro cutoff, e a IA nova não pode tirar dele — nem do comercial —
    // licença para apagar o que antes sobrevivia.
    it("sem o cutoff de nao classificadas, nunca apaga conteudo de sessao nao classificada (U-01)", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-unclassified",
        category: "UNCLASSIFIED",
        from: day(2_000),
        to: null,
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-unclassified",
        id: "msg-unclassified-ancient",
        createdAt: day(1_800),
      });
      await seedAiRun({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-unclassified",
        id: "run-unclassified-ancient",
        startedAt: day(1_800),
      });

      const result = await purgeA();

      expect(result).toMatchObject({ messages: 0, aiRuns: 0 });
      expect(await messageIds(TENANT_A)).toEqual(["msg-unclassified-ancient"]);
      expect(await prisma.aiRun.count({ where: { tenantId: TENANT_A } })).toBe(
        1,
      );
      const conversation = await prisma.conversation.findFirstOrThrow({
        where: { tenantId: TENANT_A, id: "conv-unclassified" },
      });
      expect(conversation.contentExpiredThrough).toBeNull();
    });

    it("com o cutoff de nao classificadas, apaga o conteudo vencido com os filhos e preserva o do prazo (U-01)", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-unclassified-expiring",
        category: "UNCLASSIFIED",
        from: day(2_000),
        to: null,
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-unclassified-expiring",
        id: "msg-unclassified-old",
        createdAt: day(300),
        withAttachment: true,
      });
      // 70 dias: vencida pelo cutoff de não classificadas (60), ainda dentro do
      // comercial (90). Só sai se o ramo usar o cutoff que recebeu.
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-unclassified-expiring",
        id: "msg-unclassified-newest-expired",
        createdAt: day(70),
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-unclassified-expiring",
        id: "msg-unclassified-fresh",
        createdAt: day(45),
        withAttachment: true,
      });
      await seedAiRun({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-unclassified-expiring",
        id: "run-unclassified-old",
        startedAt: day(300),
        withToolCall: true,
      });
      await seedAiRun({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-unclassified-expiring",
        id: "run-unclassified-fresh",
        startedAt: day(10),
        withToolCall: true,
      });

      const result = await purgeWithUnclassified();

      expect(result).toMatchObject({
        messages: 2,
        messageAttachments: 1,
        aiRuns: 1,
        aiToolCalls: 1,
        conversationsMarked: 1,
        hasMore: false,
      });
      expect(await messageIds(TENANT_A)).toEqual(["msg-unclassified-fresh"]);
      expect(
        await prisma.messageAttachment.count({ where: { tenantId: TENANT_A } }),
      ).toBe(1);
      expect(
        await prisma.messageAttachment.count({
          where: { tenantId: TENANT_A, messageId: "msg-unclassified-fresh" },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.aiRun.findMany({
            where: { tenantId: TENANT_A },
            select: { id: true },
          })
        ).map((row) => row.id),
      ).toEqual(["run-unclassified-fresh"]);
      expect(
        await prisma.aiToolCall.count({
          where: { tenantId: TENANT_A, aiRunId: "run-unclassified-old" },
        }),
      ).toBe(0);
      expect(
        await prisma.aiToolCall.count({
          where: { tenantId: TENANT_A, aiRunId: "run-unclassified-fresh" },
        }),
      ).toBe(1);
      // A marca vai até a linha mais nova apagada (70 dias), não até o cutoff
      // (60 dias): entre os dois não houve perda a anunciar.
      const conversation = await prisma.conversation.findFirstOrThrow({
        where: { tenantId: TENANT_A, id: "conv-unclassified-expiring" },
      });
      expect(conversation.contentExpiredThrough?.toISOString()).toBe(
        day(70).toISOString(),
      );
    });

    it("janela ambigua: nao classificada vencida com comercial no prazo sobrevive", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-ambiguous-commercial",
        category: "UNCLASSIFIED",
        from: day(400),
        to: null,
      });
      await seedExtraSession({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-ambiguous-commercial",
        category: "COMMERCIAL",
        from: day(100),
        to: day(50),
      });
      // 75 dias: a não classificada já venceu (60), a comercial ainda não (90).
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-ambiguous-commercial",
        id: "msg-ambiguous-commercial",
        createdAt: day(75),
      });
      await seedAiRun({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-ambiguous-commercial",
        id: "run-ambiguous-commercial",
        startedAt: day(75),
      });
      // Controle da mesma passada: governada só pela não classificada, sai.
      // Sem ele, a sobrevivência acima poderia ser só o ramo ausente.
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-ambiguous-commercial",
        id: "msg-unclassified-only",
        createdAt: day(200),
      });

      const result = await purgeWithUnclassified();

      expect(result).toMatchObject({ messages: 1, aiRuns: 0 });
      expect(await messageIds(TENANT_A)).toEqual(["msg-ambiguous-commercial"]);
      expect(await prisma.aiRun.count({ where: { tenantId: TENANT_A } })).toBe(
        1,
      );
    });

    it("janela ambigua: nao classificada e pessoal ambas vencidas sai", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-ambiguous-personal",
        category: "UNCLASSIFIED",
        from: day(400),
        to: null,
      });
      await seedExtraSession({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-ambiguous-personal",
        category: "PERSONAL",
        from: day(100),
        to: day(50),
      });
      // 75 dias: vencida para a não classificada (60) e para a pessoal (30).
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-ambiguous-personal",
        id: "msg-ambiguous-personal",
        createdAt: day(75),
      });
      await seedAiRun({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-ambiguous-personal",
        id: "run-ambiguous-personal",
        startedAt: day(75),
      });

      const result = await purgeWithUnclassified();

      expect(result).toMatchObject({ messages: 1, aiRuns: 1 });
      expect(await messageIds(TENANT_A)).toEqual([]);
      expect(await prisma.aiRun.count({ where: { tenantId: TENANT_A } })).toBe(
        0,
      );
    });

    it("linha orfa de sessao sobrevive mesmo com os tres cutoffs no passado", async () => {
      // Sessão não classificada curta e antiga; a mensagem e o AiRun são
      // anteriores a ela. U-01 trata de sessão não classificada, não de
      // conteúdo sem sessão.
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-orphan-unclassified",
        category: "UNCLASSIFIED",
        from: day(500),
        to: day(480),
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-orphan-unclassified",
        id: "msg-orphan-unclassified",
        createdAt: day(900),
      });
      await seedAiRun({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-orphan-unclassified",
        id: "run-orphan-unclassified",
        startedAt: day(900),
      });

      const result = await purgeWithUnclassified();

      expect(result).toMatchObject({ messages: 0, aiRuns: 0 });
      expect(await messageIds(TENANT_A)).toEqual(["msg-orphan-unclassified"]);
      expect(await prisma.aiRun.count({ where: { tenantId: TENANT_A } })).toBe(
        1,
      );
      const conversation = await prisma.conversation.findFirstOrThrow({
        where: { tenantId: TENANT_A, id: "conv-orphan-unclassified" },
      });
      expect(conversation.contentExpiredThrough).toBeNull();
    });

    it("nunca apaga mensagem que nao cai em nenhuma janela de sessao", async () => {
      // Sessão comercial curta e antiga; a mensagem é anterior a ela.
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-orphan",
        category: "COMMERCIAL",
        from: day(500),
        to: day(480),
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-orphan",
        id: "msg-orphan",
        createdAt: day(900),
      });

      const result = await purgeA();

      expect(result.messages).toBe(0);
      expect(await messageIds(TENANT_A)).toEqual(["msg-orphan"]);
    });

    it("leva attachment e transcript com a mensagem, e AiToolCall com o AiRun", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-cascade",
        category: "COMMERCIAL",
        from: day(400),
        to: null,
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-cascade",
        id: "msg-cascade-old",
        createdAt: day(200),
        withAttachment: true,
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-cascade",
        id: "msg-cascade-fresh",
        createdAt: day(5),
        withAttachment: true,
      });
      await seedAiRun({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-cascade",
        id: "run-cascade-old",
        startedAt: day(200),
        withToolCall: true,
      });
      await seedAiRun({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-cascade",
        id: "run-cascade-fresh",
        startedAt: day(5),
        withToolCall: true,
      });

      const result = await purgeA();

      expect(result).toMatchObject({
        messages: 1,
        messageAttachments: 1,
        aiRuns: 1,
        aiToolCalls: 1,
      });
      expect(
        await prisma.messageAttachment.count({ where: { tenantId: TENANT_A } }),
      ).toBe(1);
      expect(
        await prisma.messageAttachment.count({
          where: { tenantId: TENANT_A, messageId: "msg-cascade-old" },
        }),
      ).toBe(0);
      expect(
        await prisma.aiToolCall.count({
          where: { tenantId: TENANT_A, aiRunId: "run-cascade-old" },
        }),
      ).toBe(0);
      expect(
        await prisma.aiToolCall.count({
          where: { tenantId: TENANT_A, aiRunId: "run-cascade-fresh" },
        }),
      ).toBe(1);
    });

    it("preserva conversa, sessao, contato e handoff", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-survivors",
        category: "COMMERCIAL",
        from: day(400),
        to: null,
      });
      await prisma.handoff.create({
        data: {
          tenantId: TENANT_A,
          channelId: CHANNEL_A,
          conversationId: "conv-survivors",
          externalContactId: `${CONTACT}-conv-survivors`,
          reason: "customer asked for a human",
          createdAt: day(300),
        },
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-survivors",
        id: "msg-survivors",
        createdAt: day(300),
      });

      // Memória autorizada e conhecimento não são conteúdo de conversa: eles
      // sobrevivem por não estarem no alcance da purga, e o teste afirma isso
      // em vez de deixar a ausência de código valer como garantia.
      await prisma.customerMemory.create({
        data: {
          tenantId: TENANT_A,
          customerId: "customer-survivors",
          kind: "PREFERRED_PERIOD",
          value: "manha",
          origin: "CUSTOMER_STATED",
          sourceConversationId: "conv-survivors",
          observedAt: day(300),
        },
      });
      await prisma.knowledgeDocument.create({
        data: {
          tenantId: TENANT_A,
          type: "FAQ",
          title: "Horario de atendimento",
          source: "manual",
          version: "v1",
          checksum: "checksum-survivors",
        },
      });

      const before = await prisma.conversation.findFirstOrThrow({
        where: { tenantId: TENANT_A, id: "conv-survivors" },
      });

      const result = await purgeA();

      expect(result.messages).toBe(1);
      expect(
        await prisma.conversation.count({
          where: { tenantId: TENANT_A, id: "conv-survivors" },
        }),
      ).toBe(1);
      expect(
        await prisma.conversationSession.count({
          where: { tenantId: TENANT_A },
        }),
      ).toBe(1);
      expect(
        await prisma.contact.count({ where: { tenantId: TENANT_A } }),
      ).toBe(1);
      expect(
        await prisma.handoff.count({ where: { tenantId: TENANT_A } }),
      ).toBe(1);
      expect(
        await prisma.customerMemory.count({ where: { tenantId: TENANT_A } }),
      ).toBe(1);
      expect(
        await prisma.knowledgeDocument.count({ where: { tenantId: TENANT_A } }),
      ).toBe(1);
      const after = await prisma.conversation.findFirstOrThrow({
        where: { tenantId: TENANT_A, id: "conv-survivors" },
      });
      // Purgar não é atividade na conversa: a inbox não pode ver uma conversa
      // morta subir ao topo porque o conteúdo dela expirou.
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it("avanca a marca de expiracao e nunca a faz retroceder", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-mark",
        category: "COMMERCIAL",
        from: day(900),
        to: null,
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-mark",
        id: "msg-mark-older",
        createdAt: day(800),
      });
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-mark",
        id: "msg-mark-newer",
        createdAt: day(400),
      });

      await purgeA();
      const first = await prisma.conversation.findFirstOrThrow({
        where: { tenantId: TENANT_A, id: "conv-mark" },
      });
      expect(first.contentExpiredThrough?.toISOString()).toBe(
        day(400).toISOString(),
      );

      // Conteúdo novo, mas mais antigo que a marca já gravada: a segunda
      // passada apaga e a marca fica onde estava, em vez de retroceder.
      await seedMessage({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-mark",
        id: "msg-mark-late-arrival",
        createdAt: day(700),
      });
      const second = await purgeA();

      expect(second.messages).toBe(1);
      expect(second.conversationsMarked).toBe(0);
      const marked = await prisma.conversation.findFirstOrThrow({
        where: { tenantId: TENANT_A, id: "conv-mark" },
      });
      expect(marked.contentExpiredThrough?.toISOString()).toBe(
        day(400).toISOString(),
      );
    });

    it("respeita o teto, sinaliza resto e nao apaga nada na segunda passada", async () => {
      await seedConversation({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        conversationId: "conv-batch",
        category: "COMMERCIAL",
        from: day(400),
        to: null,
      });
      for (let index = 0; index < 5; index += 1) {
        await seedMessage({
          tenantId: TENANT_A,
          channelId: CHANNEL_A,
          conversationId: "conv-batch",
          id: `msg-batch-${index}`,
          createdAt: day(300 - index),
        });
      }

      const first = await purgeA(2);
      expect(first.messages).toBe(2);
      expect(first.hasMore).toBe(true);

      const second = await purgeA(2);
      expect(second.messages).toBe(2);
      expect(second.hasMore).toBe(true);

      const third = await purgeA(10);
      expect(third.messages).toBe(1);
      expect(third.hasMore).toBe(false);

      // Rodar de novo, imediatamente, não apaga nem marca nada.
      const fourth = await purgeA(10);
      expect(fourth).toMatchObject({
        messages: 0,
        messageAttachments: 0,
        aiRuns: 0,
        aiToolCalls: 0,
        conversationsMarked: 0,
        hasMore: false,
      });
    });

    it("nao apaga nem marca nada do negocio vizinho", async () => {
      for (const [tenantId, channelId] of [
        [TENANT_A, CHANNEL_A],
        [TENANT_B, CHANNEL_B],
      ] as const) {
        await seedConversation({
          tenantId,
          channelId,
          conversationId: `conv-isolation-${tenantId}`,
          category: "COMMERCIAL",
          from: day(400),
          to: null,
        });
        await seedMessage({
          tenantId,
          channelId,
          conversationId: `conv-isolation-${tenantId}`,
          id: `msg-isolation-${tenantId}`,
          createdAt: day(300),
          withAttachment: true,
        });
        await seedAiRun({
          tenantId,
          channelId,
          conversationId: `conv-isolation-${tenantId}`,
          id: `run-isolation-${tenantId}`,
          startedAt: day(300),
          withToolCall: true,
        });
      }

      const result = await purgeA();

      expect(result).toMatchObject({ messages: 1, aiRuns: 1 });
      expect(await messageIds(TENANT_A)).toEqual([]);
      expect(await messageIds(TENANT_B)).toEqual([`msg-isolation-${TENANT_B}`]);
      expect(
        await prisma.messageAttachment.count({ where: { tenantId: TENANT_B } }),
      ).toBe(1);
      expect(await prisma.aiRun.count({ where: { tenantId: TENANT_B } })).toBe(
        1,
      );
      expect(
        await prisma.aiToolCall.count({ where: { tenantId: TENANT_B } }),
      ).toBe(1);
      const neighbour = await prisma.conversation.findFirstOrThrow({
        where: { tenantId: TENANT_B, id: `conv-isolation-${TENANT_B}` },
      });
      expect(neighbour.contentExpiredThrough).toBeNull();
    });

    it("nao apaga nem marca conteudo nao classificado do negocio vizinho", async () => {
      for (const [tenantId, channelId] of [
        [TENANT_A, CHANNEL_A],
        [TENANT_B, CHANNEL_B],
      ] as const) {
        await seedConversation({
          tenantId,
          channelId,
          conversationId: `conv-unclassified-isolation-${tenantId}`,
          category: "UNCLASSIFIED",
          from: day(400),
          to: null,
        });
        await seedMessage({
          tenantId,
          channelId,
          conversationId: `conv-unclassified-isolation-${tenantId}`,
          id: `msg-unclassified-isolation-${tenantId}`,
          createdAt: day(300),
          withAttachment: true,
        });
        await seedAiRun({
          tenantId,
          channelId,
          conversationId: `conv-unclassified-isolation-${tenantId}`,
          id: `run-unclassified-isolation-${tenantId}`,
          startedAt: day(300),
          withToolCall: true,
        });
      }

      const result = await purgeWithUnclassified(TENANT_A);

      expect(result).toMatchObject({ messages: 1, aiRuns: 1 });
      expect(await messageIds(TENANT_A)).toEqual([]);
      expect(await messageIds(TENANT_B)).toEqual([
        `msg-unclassified-isolation-${TENANT_B}`,
      ]);
      expect(
        await prisma.messageAttachment.count({ where: { tenantId: TENANT_B } }),
      ).toBe(1);
      expect(await prisma.aiRun.count({ where: { tenantId: TENANT_B } })).toBe(
        1,
      );
      expect(
        await prisma.aiToolCall.count({ where: { tenantId: TENANT_B } }),
      ).toBe(1);
      const neighbour = await prisma.conversation.findFirstOrThrow({
        where: {
          tenantId: TENANT_B,
          id: `conv-unclassified-isolation-${TENANT_B}`,
        },
      });
      expect(neighbour.contentExpiredThrough).toBeNull();
    });
  },
);
