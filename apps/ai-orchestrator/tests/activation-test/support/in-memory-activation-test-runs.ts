import { randomUUID } from "node:crypto";

import {
  ACTIVATION_TEST_REFUSALS,
  type ActivationTestFact,
  type ActivationTestMilestoneName,
  type ActivationTestMilestoneRecord,
  activationTestRefusal,
  type ActivationTestRunState,
  assertActivationTestFact,
} from "../../../src/modules/activation-test/activation-test-run.js";
import type {
  ActivationTestAiReply,
  ActivationTestChannel,
  ActivationTestRunPatch,
  ActivationTestRunRecord,
  ActivationTestRunRepository,
  CreateActivationTestRunInput,
  OpenedTestConversation,
  RecordConversationMessageInput,
} from "../../../src/modules/activation-test/ActivationTestRunStore.js";
import { ACTIVATION_TEST_CONTACT_NAME } from "../../../src/modules/activation-test/ActivationTestRunStore.js";
import {
  type BusinessContext,
  DEFAULT_BUSINESS_CONTEXT,
} from "../../../src/modules/tenant-config/business-context.js";

export interface RecordedMessage {
  id: string;
  tenantId: string;
  conversationId: string;
  author: "CLIENT" | "AI" | "OWNER";
  body: string;
  createdAt: Date;
  /**
   * Estado de entrega da linha, como em `Message.deliveryState`.
   *
   * A resposta da IA nasce sem entrega confirmada — no banco ela nasce
   * `PENDING`, gravada por `completeGraphTurn` — e so vira `SENT` quando o
   * envio pelo canal do tenant acontece. O dublê guarda isto porque e a
   * diferenca entre a IA ter respondido e o negocio ter visto a resposta.
   *
   * Opcional para as fixtures que nao falam de entrega; ausente conta como
   * nao entregue, que e a leitura honesta.
   */
  deliveryState?: string | null;
}

/**
 * Contato e conversa como linhas de verdade, com telefone e nome.
 *
 * O duble guarda esses campos **so** para que um teste possa plantar uma linha
 * preexistente identica a um dado de teste (mesmo numero, mesmo nome) e provar
 * que a limpeza nao a toca. A limpeza nunca os le: ela so recebe ID.
 */
export interface RecordedContactRow {
  id: string;
  tenantId: string;
  channelId: string;
  externalContactId: string;
  displayName: string;
}

export interface RecordedConversationRow {
  id: string;
  tenantId: string;
  channelId: string;
  externalContactId: string;
  customerName: string;
  contactId: string;
}

/**
 * Persistencia em memoria da execucao do teste.
 *
 * Reproduz as duas garantias que no banco sao indice: no maximo uma execucao
 * viva por tenant (unico parcial em `finishedAt IS NULL`) e um marco por
 * execucao. Sem elas o duble deixaria passar exatamente o que o produto nao
 * pode deixar passar.
 */
export class InMemoryActivationTestRuns implements ActivationTestRunRepository {
  readonly runs: ActivationTestRunRecord[] = [];
  readonly milestoneRows: (ActivationTestMilestoneRecord & {
    runId: string;
  })[] = [];
  readonly messages: RecordedMessage[] = [];
  readonly contacts: RecordedContactRow[] = [];
  readonly conversations: RecordedConversationRow[] = [];
  /** Quantas linhas cada remocao apagou, somadas. Torna o no-op observavel. */
  readonly removals: { target: string; ids: string[]; deleted: number }[] = [];
  channel: ActivationTestChannel | null = {
    id: "channel-1",
    externalInstanceId: "instance-1",
    displayName: "Studio",
  };
  context: BusinessContext = DEFAULT_BUSINESS_CONTEXT;
  /**
   * Relogio do duble, para o teste conseguir envelhecer uma execucao viva sem
   * esperar de verdade. Por padrao e o relogio real.
   */
  clock: () => Date = () => new Date();

  /**
   * Chamadas de ferramenta que a IA registrou, por conversa.
   *
   * Existe aqui porque o marco depende **da linha gravada**, nao do retorno do
   * agente: o duble da IA acrescenta a linha quando a IA chama a ferramenta, e
   * o servico so as le. Um teste que quisesse marcar progresso sem a IA teria
   * de escrever aqui de proposito — que e o ponto.
   */
  readonly aiToolCalls: Array<{
    conversationId: string;
    id: string;
    name: string;
    status: string;
    result: unknown;
    createdAt: Date;
  }> = [];

  async findAiReply(input: {
    tenantId: string;
    conversationId: string;
    since: Date;
  }): Promise<ActivationTestAiReply | null> {
    const found = [...this.messages]
      .reverse()
      .find(
        (message) =>
          message.tenantId === input.tenantId &&
          message.conversationId === input.conversationId &&
          message.author === "AI",
      );
    return found
      ? {
          id: found.id,
          body: found.body,
          deliveryState: found.deliveryState ?? null,
        }
      : null;
  }

  /**
   * Reconciliacao da linha depois do envio, como o outbox faz.
   *
   * Existe para o dublê da IA poder representar os dois desfechos do
   * transporte do tenant sem inventar caminho novo: a resposta que saiu
   * (`SENT`) e a que ficou parada (`PENDING`, `FAILED`, `UNKNOWN`).
   */
  markDelivery(messageId: string, state: string | null): void {
    const message = this.messages.find((row) => row.id === messageId);
    if (message) message.deliveryState = state;
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
    const found = [...this.aiToolCalls]
      .reverse()
      .find(
        (call) =>
          call.conversationId === input.conversationId &&
          call.name === input.name &&
          call.createdAt >= input.since,
      );
    return found
      ? {
          id: found.id,
          name: found.name,
          status: found.status,
          result: found.result,
        }
      : null;
  }

  async findActiveChannel(): Promise<ActivationTestChannel | null> {
    return this.channel;
  }

  async businessContext(): Promise<BusinessContext> {
    return this.context;
  }

  async createRun(
    input: CreateActivationTestRunInput,
  ): Promise<ActivationTestRunRecord> {
    const live = this.runs.find(
      (run) => run.tenantId === input.tenantId && run.finishedAt === null,
    );
    if (live) {
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.ALREADY_RUNNING,
        "There is already a live activation test for this tenant.",
      );
    }
    const run: ActivationTestRunRecord = {
      id: `run-${this.runs.length + 1}`,
      tenantId: input.tenantId,
      state: "RUNNING",
      startedAt: new Date("2026-09-14T12:00:00.000Z"),
      finishedAt: null,
      currentStep: null,
      completedStep: null,
      attempts: 0,
      maxAttempts: input.maxAttempts,
      lastError: null,
      lastErrorAt: null,
      failedStep: null,
      failureCode: null,
      failureReason: null,
      pausedAt: null,
      pausedByMessageId: null,
      channelId: input.channelId,
      channelInstanceId: input.channelInstanceId,
      tenantPhone: input.tenantPhone,
      platformNumber: input.platformNumber,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      slotDate: null,
      slotStartTime: null,
      conversationId: null,
      contactId: null,
      createdMessageIds: [],
      appointmentId: null,
      customerId: null,
      createdConversationId: null,
      createdContactId: null,
      cleanupState: "PENDING",
      cleanupAt: null,
      cleanupResidue: [],
      updatedAt: this.clock(),
    };
    this.runs.push(run);
    return { ...run };
  }

  async findLiveRun(tenantId: string): Promise<ActivationTestRunRecord | null> {
    const run = this.runs.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.finishedAt === null,
    );
    return run ? { ...run } : null;
  }

  async findRun(
    tenantId: string,
    runId: string,
  ): Promise<ActivationTestRunRecord | null> {
    const run = this.runs.find(
      (candidate) => candidate.tenantId === tenantId && candidate.id === runId,
    );
    return run ? { ...run } : null;
  }

  async latestRun(tenantId: string): Promise<ActivationTestRunRecord | null> {
    const run = [...this.runs]
      .reverse()
      .find((candidate) => candidate.tenantId === tenantId);
    return run ? { ...run } : null;
  }

  async patchRun(
    tenantId: string,
    runId: string,
    patch: ActivationTestRunPatch,
  ): Promise<ActivationTestRunRecord> {
    const run = this.require(tenantId, runId);
    const { appendMessageIds, ...fields } = patch;
    Object.assign(run, fields);
    if (appendMessageIds?.length) {
      run.createdMessageIds = [...run.createdMessageIds, ...appendMessageIds];
    }
    // `@updatedAt` no banco move a coluna em toda escrita; aqui tambem, senao
    // o duble deixaria passar uma execucao viva que parece abandonada.
    run.updatedAt = this.clock();
    return { ...run };
  }

  async finishRun(
    tenantId: string,
    runId: string,
    state: ActivationTestRunState,
    patch: ActivationTestRunPatch = {},
  ): Promise<ActivationTestRunRecord> {
    await this.patchRun(tenantId, runId, patch);
    const stored = this.require(tenantId, runId);
    stored.state = state;
    stored.currentStep = null;
    stored.finishedAt = new Date("2026-09-14T12:30:00.000Z");
    stored.updatedAt = this.clock();
    return { ...stored };
  }

  async pauseRun(
    tenantId: string,
    runId: string,
    pausedByMessageId: string,
    pausedAt: Date,
  ): Promise<ActivationTestRunRecord> {
    const run = this.require(tenantId, runId);
    run.state = "PAUSED_BY_HUMAN";
    run.pausedAt = pausedAt;
    run.pausedByMessageId = pausedByMessageId;
    run.currentStep = null;
    run.updatedAt = this.clock();
    return { ...run };
  }

  async recordMilestone(
    tenantId: string,
    runId: string,
    milestone: ActivationTestMilestoneName,
    fact: ActivationTestFact,
  ): Promise<ActivationTestMilestoneRecord> {
    const checked = assertActivationTestFact(milestone, fact);
    const existing = this.milestoneRows.find(
      (row) => row.runId === runId && row.milestone === milestone,
    );
    if (existing) return { ...existing };
    const row = {
      runId,
      milestone,
      reachedAt: new Date(),
      factKind: checked.kind,
      factId: checked.id,
    };
    this.milestoneRows.push(row);
    return { ...row };
  }

  async listMilestones(
    _tenantId: string,
    runId: string,
  ): Promise<ActivationTestMilestoneRecord[]> {
    return this.milestoneRows
      .filter((row) => row.runId === runId)
      .map((row) => ({ ...row }));
  }

  async openTestConversation(input: {
    tenantId: string;
    channelId: string;
    platformNumber: string;
  }): Promise<OpenedTestConversation> {
    const existingContact = this.contacts.find(
      (row) =>
        row.tenantId === input.tenantId &&
        row.channelId === input.channelId &&
        row.externalContactId === input.platformNumber,
    );
    const contact =
      existingContact ??
      this.plantContact({
        id: `contact-${input.tenantId}`,
        tenantId: input.tenantId,
        channelId: input.channelId,
        externalContactId: input.platformNumber,
        displayName: ACTIVATION_TEST_CONTACT_NAME,
      });

    const existingConversation = this.conversations.find(
      (row) =>
        row.tenantId === input.tenantId &&
        row.channelId === input.channelId &&
        row.externalContactId === input.platformNumber,
    );
    const conversation =
      existingConversation ??
      this.plantConversation({
        id: `conversation-${input.tenantId}`,
        tenantId: input.tenantId,
        channelId: input.channelId,
        externalContactId: input.platformNumber,
        customerName: ACTIVATION_TEST_CONTACT_NAME,
        contactId: contact.id,
      });

    return {
      conversationId: conversation.id,
      contactId: contact.id,
      createdConversation: existingConversation === undefined,
      createdContact: existingContact === undefined,
    };
  }

  async removeCreatedMessages(
    tenantId: string,
    messageIds: readonly string[],
  ): Promise<number> {
    let deleted = 0;
    for (const id of messageIds) {
      const index = this.messages.findIndex(
        (message) => message.tenantId === tenantId && message.id === id,
      );
      if (index >= 0) {
        this.messages.splice(index, 1);
        deleted += 1;
      }
    }
    this.removals.push({ target: "MESSAGE", ids: [...messageIds], deleted });
    return deleted;
  }

  async removeCreatedConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<number> {
    const index = this.conversations.findIndex(
      (row) => row.tenantId === tenantId && row.id === conversationId,
    );
    const deleted = index >= 0 ? 1 : 0;
    if (index >= 0) this.conversations.splice(index, 1);
    this.removals.push({
      target: "CONVERSATION",
      ids: [conversationId],
      deleted,
    });
    return deleted;
  }

  async removeCreatedContact(
    tenantId: string,
    contactId: string,
  ): Promise<number> {
    const index = this.contacts.findIndex(
      (row) => row.tenantId === tenantId && row.id === contactId,
    );
    const deleted = index >= 0 ? 1 : 0;
    if (index >= 0) this.contacts.splice(index, 1);
    this.removals.push({ target: "CONTACT", ids: [contactId], deleted });
    return deleted;
  }

  async findSurvivingMessageIds(
    tenantId: string,
    messageIds: readonly string[],
  ): Promise<string[]> {
    return this.messages
      .filter(
        (message) =>
          message.tenantId === tenantId && messageIds.includes(message.id),
      )
      .map((message) => message.id);
  }

  async conversationExists(
    tenantId: string,
    conversationId: string,
  ): Promise<boolean> {
    return this.conversations.some(
      (row) => row.tenantId === tenantId && row.id === conversationId,
    );
  }

  async contactExists(tenantId: string, contactId: string): Promise<boolean> {
    return this.contacts.some(
      (row) => row.tenantId === tenantId && row.id === contactId,
    );
  }

  async conversationDependents(
    tenantId: string,
    conversationId: string,
  ): Promise<number> {
    return this.messages.filter(
      (message) =>
        message.tenantId === tenantId &&
        message.conversationId === conversationId,
    ).length;
  }

  async contactDependents(
    tenantId: string,
    contactId: string,
  ): Promise<number> {
    return this.conversations.filter(
      (row) => row.tenantId === tenantId && row.contactId === contactId,
    ).length;
  }

  /** Linha preexistente, criada por outro caminho que nao a execucao. */
  plantContact(row: RecordedContactRow): RecordedContactRow {
    this.contacts.push(row);
    return row;
  }

  plantConversation(row: RecordedConversationRow): RecordedConversationRow {
    this.conversations.push(row);
    return row;
  }

  plantMessage(row: RecordedMessage): RecordedMessage {
    this.messages.push(row);
    return row;
  }

  async recordConversationMessage(
    input: RecordConversationMessageInput,
  ): Promise<{ id: string }> {
    const message: RecordedMessage = {
      id: `message-${randomUUID()}`,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      author: input.author,
      body: input.body,
      createdAt: new Date(),
      // Mesma regra do store: a linha da IA nasce sem entrega confirmada. Quem
      // confirma e o envio pelo canal do tenant, depois.
      deliveryState: input.author === "AI" ? "PENDING" : null,
    };
    this.messages.push(message);
    return { id: message.id };
  }

  async findHumanMessage(input: {
    tenantId: string;
    conversationId: string;
    since: Date;
  }): Promise<{ id: string; createdAt: Date } | null> {
    const human = this.messages.find(
      (message) =>
        message.tenantId === input.tenantId &&
        message.conversationId === input.conversationId &&
        message.author === "OWNER" &&
        message.createdAt >= input.since,
    );
    return human ? { id: human.id, createdAt: human.createdAt } : null;
  }

  /** Resposta manual da profissional na conversa de teste. */
  humanReplies(tenantId: string, conversationId: string, body: string): string {
    const message: RecordedMessage = {
      id: `message-owner-${this.messages.length + 1}`,
      tenantId,
      conversationId,
      author: "OWNER",
      body,
      createdAt: new Date(),
    };
    this.messages.push(message);
    return message.id;
  }

  private require(tenantId: string, runId: string): ActivationTestRunRecord {
    const run = this.runs.find(
      (candidate) => candidate.tenantId === tenantId && candidate.id === runId,
    );
    if (!run) throw new Error(`run ${runId} not found for tenant ${tenantId}`);
    return run;
  }
}
