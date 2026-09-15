import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  type BusinessContext,
  normalizeBusinessContext,
} from "../tenant-config/business-context.js";
import {
  type ActivationTestCleanupState,
  type ActivationTestResidueItem,
  parseActivationTestResidue,
} from "./activation-test-cleanup.js";
import {
  ACTIVATION_TEST_REFUSALS,
  type ActivationTestFact,
  type ActivationTestMilestoneName,
  type ActivationTestMilestoneRecord,
  activationTestRefusal,
  type ActivationTestRunState,
  type ActivationTestStep,
  assertActivationTestFact,
} from "./activation-test-run.js";

/** Execucao como o resto do servico a le. */
export interface ActivationTestRunRecord {
  id: string;
  tenantId: string;
  state: ActivationTestRunState;
  startedAt: Date;
  finishedAt: Date | null;
  currentStep: ActivationTestStep | null;
  completedStep: ActivationTestStep | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastErrorAt: Date | null;
  failedStep: ActivationTestStep | null;
  failureCode: string | null;
  failureReason: string | null;
  pausedAt: Date | null;
  pausedByMessageId: string | null;
  channelId: string;
  /**
   * Instancia de WhatsApp contra a qual o teste rodou.
   *
   * Revincular o WhatsApp atualiza a mesma linha de `ChannelConnection` e
   * troca a instancia sem mudar o `id`, entao e este campo — nao o `channelId`
   * — que diz se o teste ainda vale para o numero que o negocio usa hoje.
   */
  channelInstanceId: string | null;
  tenantPhone: string;
  platformNumber: string;
  serviceId: string | null;
  serviceName: string | null;
  slotDate: string | null;
  slotStartTime: string | null;
  conversationId: string | null;
  contactId: string | null;
  createdMessageIds: string[];
  appointmentId: string | null;
  customerId: string | null;
  /**
   * Criado **por esta execucao**. Nulo quando a linha ja existia: a limpeza so
   * apaga o que nasceu aqui.
   */
  createdConversationId: string | null;
  createdContactId: string | null;
  cleanupState: ActivationTestCleanupState;
  cleanupAt: Date | null;
  cleanupResidue: ActivationTestResidueItem[];
  /**
   * Ultima escrita na linha.
   *
   * E o unico sinal de vida da execucao, e por isso ele sobe ate o dominio:
   * cada passo, tentativa e erro gravado o move, entao uma execucao `RUNNING`
   * parada aqui ha muito tempo e uma execucao que ninguem esta mais tocando.
   */
  updatedAt: Date;
}

export interface CreateActivationTestRunInput {
  tenantId: string;
  channelId: string;
  channelInstanceId: string;
  tenantPhone: string;
  platformNumber: string;
  maxAttempts: number;
  serviceId: string;
  serviceName: string;
}

export type ActivationTestRunPatch = Partial<
  Pick<
    ActivationTestRunRecord,
    | "currentStep"
    | "completedStep"
    | "attempts"
    | "lastError"
    | "lastErrorAt"
    | "failedStep"
    | "failureCode"
    | "failureReason"
    | "pausedAt"
    | "pausedByMessageId"
    | "serviceId"
    | "serviceName"
    | "slotDate"
    | "slotStartTime"
    | "conversationId"
    | "contactId"
    | "appointmentId"
    | "customerId"
    | "createdConversationId"
    | "createdContactId"
    | "cleanupState"
    | "cleanupAt"
    | "cleanupResidue"
  >
> & { appendMessageIds?: string[] };

export interface ActivationTestChannel {
  id: string;
  externalInstanceId: string;
  displayName: string | null;
}

/**
 * Resposta que a IA gravou, com o estado de entrega da linha.
 *
 * `deliveryState` faz parte da leitura porque o marco "preco informado" nao e
 * a IA ter escrito: e a resposta dela ter **saido** pelo canal do negocio.
 * Uma linha em `PENDING` significa que o envio nunca aconteceu.
 */
export interface ActivationTestAiReply {
  id: string;
  body: string;
  /** `null` em linha antiga, gravada antes de a coluna existir. */
  deliveryState: string | null;
}

export interface RecordConversationMessageInput {
  tenantId: string;
  channelId: string;
  conversationId: string;
  /** `CLIENT` e o cliente simulado (entra pelo canal); `AI` e a resposta. */
  author: "CLIENT" | "AI";
  body: string;
  correlationId: string;
  externalMessageId?: string;
}

/**
 * Persistencia da execucao do teste.
 *
 * A interface existe para que a maquina de estados seja testavel sem banco e
 * para que o caminho real seja um unico lugar auditavel — nao para trocar de
 * banco.
 */
export interface ActivationTestRunRepository {
  findActiveChannel(tenantId: string): Promise<ActivationTestChannel | null>;
  businessContext(tenantId: string): Promise<BusinessContext>;
  createRun(
    input: CreateActivationTestRunInput,
  ): Promise<ActivationTestRunRecord>;
  findLiveRun(tenantId: string): Promise<ActivationTestRunRecord | null>;
  findRun(
    tenantId: string,
    runId: string,
  ): Promise<ActivationTestRunRecord | null>;
  latestRun(tenantId: string): Promise<ActivationTestRunRecord | null>;
  patchRun(
    tenantId: string,
    runId: string,
    patch: ActivationTestRunPatch,
  ): Promise<ActivationTestRunRecord>;
  finishRun(
    tenantId: string,
    runId: string,
    state: ActivationTestRunState,
    patch?: ActivationTestRunPatch,
  ): Promise<ActivationTestRunRecord>;
  /** Pausa por interferencia humana: nao terminal, logo sem `finishedAt`. */
  pauseRun(
    tenantId: string,
    runId: string,
    pausedByMessageId: string,
    pausedAt: Date,
  ): Promise<ActivationTestRunRecord>;
  recordMilestone(
    tenantId: string,
    runId: string,
    milestone: ActivationTestMilestoneName,
    fact: ActivationTestFact,
  ): Promise<ActivationTestMilestoneRecord>;
  listMilestones(
    tenantId: string,
    runId: string,
  ): Promise<ActivationTestMilestoneRecord[]>;
  openTestConversation(input: {
    tenantId: string;
    channelId: string;
    platformNumber: string;
  }): Promise<OpenedTestConversation>;
  recordConversationMessage(
    input: RecordConversationMessageInput,
  ): Promise<{ id: string }>;
  /** Mensagem de origem humana na conversa de teste, depois do inicio. */
  findHumanMessage(input: {
    tenantId: string;
    conversationId: string;
    since: Date;
  }): Promise<{ id: string; createdAt: Date } | null>;

  /**
   * Remocao dos dados de teste da conversa, **exclusivamente por ID**.
   *
   * As tres assinaturas abaixo so aceitam `tenantId` e ID. Nao ha parametro de
   * telefone, nome, data ou padrao em nenhuma delas, de proposito: o caminho de
   * limpeza nao consegue expressar uma busca heuristica nem por engano, e
   * trocar isto por uma busca exigiria mudar o contrato aqui — onde o teste
   * repara.
   *
   * Cada uma devolve quantas linhas apagou. E esse numero que torna a
   * idempotencia observavel: na segunda passada ele e zero.
   */
  /**
   * Ultima resposta que a **IA** gravou na conversa de teste.
   *
   * `source: AI` e o que o sistema ja sabe distinguir, e e o unico criterio
   * aqui: nao ha filtro por texto, por prefixo nem por qualquer marca que a
   * execucao pudesse ter posto na mensagem. Se a IA nao respondeu, isto e
   * `null` — e o marco correspondente nao acontece.
   */
  findAiReply(input: {
    tenantId: string;
    conversationId: string;
    since: Date;
  }): Promise<ActivationTestAiReply | null>;
  /**
   * Chamada de ferramenta que a IA registrou nesta conversa depois de `since`.
   *
   * E a linha de `AiToolCall`, gravada pelo caminho normal do agente. A
   * execucao do teste nao cria essa linha em lugar nenhum, entao um marco que
   * dependa dela nao pode ser fabricado.
   */
  findAiToolCall(input: {
    tenantId: string;
    conversationId: string;
    name: string;
    since: Date;
  }): Promise<{
    id: string;
    name: string;
    status: string;
    result: unknown;
  } | null>;
  removeCreatedMessages(
    tenantId: string,
    messageIds: readonly string[],
  ): Promise<number>;
  removeCreatedConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<number>;
  removeCreatedContact(tenantId: string, contactId: string): Promise<number>;

  /**
   * Leitura de prova, depois da remocao: o que ainda existe com aqueles IDs.
   *
   * Sobra aqui vira residuo — nunca silencio.
   */
  findSurvivingMessageIds(
    tenantId: string,
    messageIds: readonly string[],
  ): Promise<string[]>;
  conversationExists(
    tenantId: string,
    conversationId: string,
  ): Promise<boolean>;
  contactExists(tenantId: string, contactId: string): Promise<boolean>;

  /**
   * Linhas de terceiro que a remocao arrastaria junto, por cascade.
   *
   * `Message` e `ConversationSession` apontam para `Conversation` com
   * `onDelete: Cascade`, e `ConversationSession` aponta para `Contact` do
   * mesmo jeito. Apagar a conversa de teste com uma mensagem de outra origem
   * dentro dela **removeria essa mensagem**, e a regra desta unidade diz que
   * linha que a execucao nao criou nao e tocada. Por isso a limpeza pergunta
   * antes: sobrando dependente, ela nao apaga e registra residuo.
   *
   * Ambas sao chamadas depois das remocoes anteriores, entao o que elas contam
   * ja e, por construcao, o que **nao** e da execucao.
   */
  conversationDependents(
    tenantId: string,
    conversationId: string,
  ): Promise<number>;
  contactDependents(tenantId: string, contactId: string): Promise<number>;
}

/**
 * Conversa de teste aberta.
 *
 * `created` diz se a linha **nasceu nesta chamada**. A limpeza depende disso:
 * conversa ou contato que ja existiam nao sao removidos por uma execucao que
 * apenas os encontrou.
 */
export interface OpenedTestConversation {
  conversationId: string;
  contactId: string;
  createdConversation: boolean;
  createdContact: boolean;
}

/** Nome do contato de teste. Nao e heuristica de limpeza: a limpeza usa IDs. */
export const ACTIVATION_TEST_CONTACT_NAME = "Atendly (teste)";

export class ActivationTestRunStore implements ActivationTestRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveChannel(
    tenantId: string,
  ): Promise<ActivationTestChannel | null> {
    const channel = await this.prisma.channelConnection.findFirst({
      where: { tenantId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, externalInstanceId: true, displayName: true },
    });
    return channel ?? null;
  }

  async businessContext(tenantId: string): Promise<BusinessContext> {
    const config = await this.prisma.aiTenantConfig.findUnique({
      where: { tenantId },
      select: { settings: true },
    });
    return normalizeBusinessContext(config?.settings);
  }

  /**
   * Cria a execucao.
   *
   * O indice unico parcial (uma viva por tenant) e quem decide a corrida: duas
   * chamadas simultaneas nao geram duas execucoes, a perdedora vira recusa
   * `ACTIVATION_TEST_ALREADY_RUNNING` em vez de erro de servidor.
   */
  async createRun(
    input: CreateActivationTestRunInput,
  ): Promise<ActivationTestRunRecord> {
    try {
      const created = await this.prisma.activationTestRun.create({
        data: {
          tenantId: input.tenantId,
          channelId: input.channelId,
          channelInstanceId: input.channelInstanceId,
          tenantPhone: input.tenantPhone,
          platformNumber: input.platformNumber,
          maxAttempts: input.maxAttempts,
          serviceId: input.serviceId,
          serviceName: input.serviceName,
        },
      });
      return toRunRecord(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.ALREADY_RUNNING,
        "There is already a live activation test for this tenant.",
      );
    }
  }

  async findLiveRun(tenantId: string): Promise<ActivationTestRunRecord | null> {
    const run = await this.prisma.activationTestRun.findFirst({
      where: { tenantId, finishedAt: null },
      orderBy: { startedAt: "desc" },
    });
    return run ? toRunRecord(run) : null;
  }

  async findRun(
    tenantId: string,
    runId: string,
  ): Promise<ActivationTestRunRecord | null> {
    const run = await this.prisma.activationTestRun.findFirst({
      where: { tenantId, id: runId },
    });
    return run ? toRunRecord(run) : null;
  }

  async latestRun(tenantId: string): Promise<ActivationTestRunRecord | null> {
    const run = await this.prisma.activationTestRun.findFirst({
      where: { tenantId },
      orderBy: { startedAt: "desc" },
    });
    return run ? toRunRecord(run) : null;
  }

  async patchRun(
    tenantId: string,
    runId: string,
    patch: ActivationTestRunPatch,
  ): Promise<ActivationTestRunRecord> {
    const updated = await this.prisma.activationTestRun.update({
      where: { tenantId_id: { tenantId, id: runId } },
      data: patchData(patch),
    });
    return toRunRecord(updated);
  }

  /**
   * Termina a execucao.
   *
   * `finishedAt` e o que libera o tenant para uma execucao nova, entao ele e
   * gravado no mesmo update do estado terminal — nunca depois.
   */
  async finishRun(
    tenantId: string,
    runId: string,
    state: ActivationTestRunState,
    patch: ActivationTestRunPatch = {},
  ): Promise<ActivationTestRunRecord> {
    const updated = await this.prisma.activationTestRun.update({
      where: { tenantId_id: { tenantId, id: runId } },
      data: {
        ...patchData(patch),
        state,
        currentStep: null,
        finishedAt: new Date(),
      },
    });
    return toRunRecord(updated);
  }

  /**
   * Pausa a execucao.
   *
   * Pausada continua viva — `finishedAt` segue nulo, o tenant continua ocupado
   * e reiniciar e decisao explicita da pessoa. Pausa nao e falha e nao libera
   * o tenant para uma execucao nova por conta propria.
   */
  async pauseRun(
    tenantId: string,
    runId: string,
    pausedByMessageId: string,
    pausedAt: Date,
  ): Promise<ActivationTestRunRecord> {
    const updated = await this.prisma.activationTestRun.update({
      where: { tenantId_id: { tenantId, id: runId } },
      data: {
        state: "PAUSED_BY_HUMAN",
        pausedAt,
        pausedByMessageId,
        currentStep: null,
      },
    });
    return toRunRecord(updated);
  }

  /**
   * Grava o marco com a fonte do fato.
   *
   * Primeira observacao vence: repetir o mesmo marco (retentativa, replay) nao
   * duplica progresso nem reescreve a fonte original.
   */
  async recordMilestone(
    tenantId: string,
    runId: string,
    milestone: ActivationTestMilestoneName,
    fact: ActivationTestFact,
  ): Promise<ActivationTestMilestoneRecord> {
    const checked = assertActivationTestFact(milestone, fact);
    try {
      const created = await this.prisma.activationTestMilestone.create({
        data: {
          tenantId,
          runId,
          milestone,
          factKind: checked.kind,
          factId: checked.id,
          factDetail: (checked.detail ?? null) as never,
        },
      });
      return toMilestoneRecord(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing =
        await this.prisma.activationTestMilestone.findFirstOrThrow({
          where: { tenantId, runId, milestone },
        });
      return toMilestoneRecord(existing);
    }
  }

  async listMilestones(
    tenantId: string,
    runId: string,
  ): Promise<ActivationTestMilestoneRecord[]> {
    const rows = await this.prisma.activationTestMilestone.findMany({
      where: { tenantId, runId },
      orderBy: { reachedAt: "asc" },
    });
    return rows.map(toMilestoneRecord);
  }

  /**
   * Abre a conversa de teste: contato e conversa do numero da plataforma no
   * canal do tenant.
   *
   * Os dois IDs voltam para serem gravados na execucao **no momento da
   * criacao** — e por eles que a limpeza vai remover depois, nunca por busca
   * por telefone ou nome.
   */
  async openTestConversation(input: {
    tenantId: string;
    channelId: string;
    platformNumber: string;
  }): Promise<OpenedTestConversation> {
    // Le antes de gravar **so** para saber se a linha ja existia. O upsert
    // continua sendo quem resolve a corrida; esta leitura nao decide nada
    // sobre a conversa, decide sobre a limpeza: o que a execucao encontrou
    // pronto ela nao pode apagar depois.
    const key = {
      tenantId_channelId_externalContactId: {
        tenantId: input.tenantId,
        channelId: input.channelId,
        externalContactId: input.platformNumber,
      },
    };
    const [existingContact, existingConversation] = await Promise.all([
      this.prisma.contact.findUnique({ where: key, select: { id: true } }),
      this.prisma.conversation.findUnique({ where: key, select: { id: true } }),
    ]);

    const contact = await this.prisma.contact.upsert({
      where: key,
      update: {},
      create: {
        tenantId: input.tenantId,
        channelId: input.channelId,
        externalContactId: input.platformNumber,
        displayName: ACTIVATION_TEST_CONTACT_NAME,
      },
    });

    const conversation = await this.prisma.conversation.upsert({
      where: key,
      update: { contactId: contact.id },
      create: {
        tenantId: input.tenantId,
        channelId: input.channelId,
        externalContactId: input.platformNumber,
        customerName: ACTIVATION_TEST_CONTACT_NAME,
        contactId: contact.id,
        state: {},
      },
    });

    return {
      conversationId: conversation.id,
      contactId: contact.id,
      createdConversation: existingConversation === null,
      createdContact: existingContact === null,
    };
  }

  /**
   * Apaga as mensagens da execucao pelos IDs gravados.
   *
   * `tenantId` **e** `id in (...)`: as duas condicoes, sempre. Um ID de outro
   * tenant nao apaga nada, e nao ha aqui nenhum criterio alem do ID — sem
   * telefone, sem nome, sem janela de data.
   */
  async findAiReply(input: {
    tenantId: string;
    conversationId: string;
    since: Date;
  }): Promise<ActivationTestAiReply | null> {
    const message = await this.prisma.message.findFirst({
      where: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        source: "AI",
        createdAt: { gte: input.since },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, deliveryState: true },
    });
    return message
      ? {
          id: message.id,
          body: message.body ?? "",
          deliveryState: message.deliveryState,
        }
      : null;
  }

  async findAiToolCall(input: {
    tenantId: string;
    conversationId: string;
    name: string;
    since: Date;
  }): Promise<{
    id: string;
    name: string;
    status: string;
    result: unknown;
  } | null> {
    const toolCall = await this.prisma.aiToolCall.findFirst({
      where: {
        tenantId: input.tenantId,
        name: input.name,
        createdAt: { gte: input.since },
        aiRun: { conversationId: input.conversationId },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, result: true },
    });
    return toolCall ?? null;
  }

  async removeCreatedMessages(
    tenantId: string,
    messageIds: readonly string[],
  ): Promise<number> {
    if (messageIds.length === 0) return 0;
    const deleted = await this.prisma.message.deleteMany({
      where: { tenantId, id: { in: [...messageIds] } },
    });
    return deleted.count;
  }

  async removeCreatedConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<number> {
    const deleted = await this.prisma.conversation.deleteMany({
      where: { tenantId, id: conversationId },
    });
    return deleted.count;
  }

  async removeCreatedContact(
    tenantId: string,
    contactId: string,
  ): Promise<number> {
    const deleted = await this.prisma.contact.deleteMany({
      where: { tenantId, id: contactId },
    });
    return deleted.count;
  }

  async findSurvivingMessageIds(
    tenantId: string,
    messageIds: readonly string[],
  ): Promise<string[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.prisma.message.findMany({
      where: { tenantId, id: { in: [...messageIds] } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async conversationExists(
    tenantId: string,
    conversationId: string,
  ): Promise<boolean> {
    const row = await this.prisma.conversation.findFirst({
      where: { tenantId, id: conversationId },
      select: { id: true },
    });
    return row !== null;
  }

  async contactExists(tenantId: string, contactId: string): Promise<boolean> {
    const row = await this.prisma.contact.findFirst({
      where: { tenantId, id: contactId },
      select: { id: true },
    });
    return row !== null;
  }

  async conversationDependents(
    tenantId: string,
    conversationId: string,
  ): Promise<number> {
    const [messages, sessions] = await Promise.all([
      this.prisma.message.count({ where: { tenantId, conversationId } }),
      this.prisma.conversationSession.count({
        where: { tenantId, conversationId },
      }),
    ]);
    return messages + sessions;
  }

  async contactDependents(
    tenantId: string,
    contactId: string,
  ): Promise<number> {
    const [conversations, sessions] = await Promise.all([
      this.prisma.conversation.count({ where: { tenantId, contactId } }),
      this.prisma.conversationSession.count({ where: { tenantId, contactId } }),
    ]);
    return conversations + sessions;
  }

  /**
   * Grava a mensagem da conversa de teste.
   *
   * A mensagem do cliente simulado entra como `INBOUND/CUSTOMER` porque e isso
   * que ela e do ponto de vista do canal do tenant; a resposta entra como
   * `OUTBOUND/AI` com entrega `UNKNOWN` — o transporte de saida do tenant e o
   * caminho normal do produto, e esta execucao nao vai afirmar entrega que ela
   * nao fez.
   */
  async recordConversationMessage(
    input: RecordConversationMessageInput,
  ): Promise<{ id: string }> {
    const fromClient = input.author === "CLIENT";
    const message = await this.prisma.message.create({
      data: {
        tenantId: input.tenantId,
        channelId: input.channelId,
        conversationId: input.conversationId,
        externalMessageId: input.externalMessageId ?? input.correlationId,
        correlationId: input.correlationId,
        direction: fromClient ? "INBOUND" : "OUTBOUND",
        source: fromClient ? "CUSTOMER" : "AI",
        role: fromClient ? "user" : "assistant",
        body: input.body,
        ...(fromClient
          ? {}
          : {
              deliveryState: "UNKNOWN" as const,
              deliveryDetail: "activation_test_reply",
              deliveryUpdatedAt: new Date(),
            }),
      },
      select: { id: true },
    });
    return message;
  }

  /**
   * Interferencia humana na conversa de teste.
   *
   * A deteccao usa o que o sistema ja sabe distinguir — `source: OWNER`, que e
   * como a plataforma marca a mensagem escrita pela pessoa, pelo painel ou
   * pelo proprio WhatsApp. Nao ha heuristica de texto aqui.
   */
  async findHumanMessage(input: {
    tenantId: string;
    conversationId: string;
    since: Date;
  }): Promise<{ id: string; createdAt: Date } | null> {
    const message = await this.prisma.message.findFirst({
      where: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        source: "OWNER",
        createdAt: { gte: input.since },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true },
    });
    return message ?? null;
  }
}

/**
 * Traduz o patch para o `data` do Prisma.
 *
 * Duas colunas nao sao atribuicao simples: `createdMessageIds` acumula (a
 * execucao **acrescenta** IDs, nunca reescreve a lista do que ja criou) e
 * `cleanupResidue` e JSON.
 */
function patchData(patch: ActivationTestRunPatch) {
  const { appendMessageIds, cleanupResidue, ...fields } = patch;
  return {
    ...fields,
    ...(appendMessageIds?.length
      ? { createdMessageIds: { push: appendMessageIds } }
      : {}),
    ...(cleanupResidue === undefined
      ? {}
      : { cleanupResidue: cleanupResidue as never }),
  };
}

function toRunRecord(row: {
  id: string;
  tenantId: string;
  state: string;
  startedAt: Date;
  finishedAt: Date | null;
  currentStep: string | null;
  completedStep: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastErrorAt: Date | null;
  failedStep: string | null;
  failureCode: string | null;
  failureReason: string | null;
  pausedAt: Date | null;
  pausedByMessageId: string | null;
  channelId: string;
  channelInstanceId: string | null;
  tenantPhone: string;
  platformNumber: string;
  serviceId: string | null;
  serviceName: string | null;
  slotDate: string | null;
  slotStartTime: string | null;
  conversationId: string | null;
  contactId: string | null;
  createdMessageIds: string[];
  appointmentId: string | null;
  customerId: string | null;
  createdConversationId: string | null;
  createdContactId: string | null;
  cleanupState: string;
  cleanupAt: Date | null;
  cleanupResidue: unknown;
  updatedAt: Date;
}): ActivationTestRunRecord {
  return {
    ...row,
    state: row.state as ActivationTestRunState,
    currentStep: row.currentStep as ActivationTestStep | null,
    completedStep: row.completedStep as ActivationTestStep | null,
    failedStep: row.failedStep as ActivationTestStep | null,
    cleanupState: row.cleanupState as ActivationTestCleanupState,
    cleanupResidue: parseActivationTestResidue(row.cleanupResidue),
  };
}

function toMilestoneRecord(row: {
  milestone: string;
  reachedAt: Date;
  factKind: string;
  factId: string;
}): ActivationTestMilestoneRecord {
  return {
    milestone: row.milestone as ActivationTestMilestoneName,
    reachedAt: row.reachedAt,
    factKind: row.factKind as ActivationTestMilestoneRecord["factKind"],
    factId: row.factId,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  if (record.code === "P2002" || record.code === "23505") return true;
  const meta = record.meta;
  return (
    typeof meta === "object" &&
    meta !== null &&
    (meta as Record<string, unknown>).code === "23505"
  );
}
