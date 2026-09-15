import { beforeEach, describe, expect, it } from "vitest";

import { AppError } from "../../src/lib/errors.js";
import {
  ACTIVATION_TEST_CLEANUP_TARGET_LABELS,
  activationTestCleanupState,
  activationTestResidueReport,
  parseActivationTestResidue,
} from "../../src/modules/activation-test/activation-test-cleanup.js";
import { ActivationTestCleanupService } from "../../src/modules/activation-test/ActivationTestCleanupService.js";
import { ACTIVATION_TEST_CONTACT_NAME } from "../../src/modules/activation-test/ActivationTestRunStore.js";
import type {
  SchedulingAppointment,
  SchedulingCustomerCandidate,
} from "../../src/modules/scheduling-service/types.js";
import { InMemoryActivationTestRuns } from "./support/in-memory-activation-test-runs.js";

const TENANT = "tenant-activation";
const OTHER_TENANT = "tenant-vizinho";
const CHANNEL = "channel-1";
const CHANNEL_INSTANCE = "instance-1";
const PLATFORM_NUMBER = "5511911112222";
const TENANT_PHONE = "5511988887777";

function testAppointment(id: string): SchedulingAppointment {
  return {
    id,
    title: null,
    date: "2026-09-16",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    customerId: "customer-1",
    customer: {
      id: "customer-1",
      name: ACTIVATION_TEST_CONTACT_NAME,
      phone: null,
    },
    services: [],
    price: 120,
    totalPriceType: "FIXED",
    comments: null,
    status: "CONFIRMED",
    serviceId: "service-1",
    serviceIds: ["service-1"],
    serviceName: "Corte",
    customerName: ACTIVATION_TEST_CONTACT_NAME,
  };
}

/**
 * Agenda dublada.
 *
 * Ela modela o que a agenda de verdade faz: **cancelar nao e remover**.
 * Cancelar e idempotente e deixa o atendimento listado, com `status:
 * CANCELLED` — `GET /internal/appointments` nao filtra cancelado, de
 * proposito. Quem tira a linha da agenda e `deleteAppointment`, e quem tira a
 * pessoa da lista de clientes e `deleteCustomer`; as duas so aceitam ID, e
 * `deleteCustomer` recusa enquanto sobrar atendimento da pessoa, como o banco
 * recusa (`onDelete: Restrict`).
 */
class CleanupSchedulingDouble {
  cancelCalls: { appointmentId: string; idempotencyKey?: string }[] = [];
  agenda: SchedulingAppointment[] = [testAppointment("appointment-1")];
  customers: SchedulingCustomerCandidate[] = [
    {
      id: "customer-1",
      name: ACTIVATION_TEST_CONTACT_NAME,
      phone: PLATFORM_NUMBER,
    },
  ];
  failCancelWith: Error | null = null;
  failDeleteAppointmentWith: Error | null = null;
  failDeleteCustomerWith: Error | null = null;
  deleteAppointmentCalls: string[] = [];
  deleteCustomerCalls: string[] = [];
  agendaReadsByCustomerId: string[] = [];
  customerReadsByPhone: string[] = [];

  async cancelAppointment(
    appointmentId: string,
    _context?: unknown,
    idempotencyKey?: string,
  ) {
    this.cancelCalls.push({ appointmentId, idempotencyKey });
    if (this.failCancelWith) throw this.failCancelWith;
    // Cancelar marca; nao tira da agenda. E por isso que a remocao existe.
    const found = this.agenda.find((item) => item.id === appointmentId);
    if (found) found.status = "CANCELLED";
    return { appointmentId, cancelled: true as const };
  }

  async deleteAppointment(appointmentId: string) {
    this.deleteAppointmentCalls.push(appointmentId);
    if (this.failDeleteAppointmentWith) throw this.failDeleteAppointmentWith;
    const before = this.agenda.length;
    this.agenda = this.agenda.filter((item) => item.id !== appointmentId);
    return { appointmentId, removed: this.agenda.length < before };
  }

  async deleteCustomer(customerId: string) {
    this.deleteCustomerCalls.push(customerId);
    if (this.failDeleteCustomerWith) throw this.failDeleteCustomerWith;
    // Mesma recusa do banco: pessoa com atendimento nao sai.
    if (this.agenda.some((item) => item.customerId === customerId)) {
      throw new AppError("customer still has appointments", {
        statusCode: 409,
        code: "CUSTOMER_HAS_APPOINTMENTS",
      });
    }
    const before = this.customers.length;
    this.customers = this.customers.filter(
      (candidate) => candidate.id !== customerId,
    );
    return { customerId, removed: this.customers.length < before };
  }

  async findFutureAppointmentsForCustomer(customerId: string) {
    this.agendaReadsByCustomerId.push(customerId);
    return this.agenda.filter((item) => item.customerId === customerId);
  }

  async findFutureAppointmentsForPhone() {
    return this.agenda;
  }

  async findCustomerCandidatesByPhone(phone: string) {
    this.customerReadsByPhone.push(phone);
    return this.customers.filter((candidate) => candidate.phone === phone);
  }
}

/** Execucao ja terminada, com os IDs que ela gravou no momento da criacao. */
async function runThatCreatedTestData(runs: InMemoryActivationTestRuns) {
  const run = await runs.createRun({
    tenantId: TENANT,
    channelId: CHANNEL,
    channelInstanceId: CHANNEL_INSTANCE,
    tenantPhone: TENANT_PHONE,
    platformNumber: PLATFORM_NUMBER,
    maxAttempts: 3,
    serviceId: "service-1",
    serviceName: "Corte",
  });
  const opened = await runs.openTestConversation({
    tenantId: TENANT,
    channelId: CHANNEL,
    platformNumber: PLATFORM_NUMBER,
  });
  const first = await runs.recordConversationMessage({
    tenantId: TENANT,
    channelId: CHANNEL,
    conversationId: opened.conversationId,
    author: "CLIENT",
    body: "Oi! Quanto custa Corte?",
    correlationId: "c-1",
  });
  const second = await runs.recordConversationMessage({
    tenantId: TENANT,
    channelId: CHANNEL,
    conversationId: opened.conversationId,
    author: "AI",
    body: "Corte: R$ 120,00.",
    correlationId: "c-2",
  });
  return runs.patchRun(TENANT, run.id, {
    conversationId: opened.conversationId,
    contactId: opened.contactId,
    createdConversationId: opened.createdConversation
      ? opened.conversationId
      : null,
    createdContactId: opened.createdContact ? opened.contactId : null,
    appendMessageIds: [first.id, second.id],
    appointmentId: "appointment-1",
    customerId: "customer-1",
  });
}

function build(overrides: { runs?: InMemoryActivationTestRuns } = {}) {
  const runs = overrides.runs ?? new InMemoryActivationTestRuns();
  const scheduling = new CleanupSchedulingDouble();
  const cleanup = new ActivationTestCleanupService({
    runs,
    scheduling: scheduling as never,
    now: () => new Date("2026-09-14T13:00:00.000Z"),
  });
  return { runs, scheduling, cleanup };
}

const cleanInput = (runId: string) => ({
  tenantId: TENANT,
  runId,
  userId: "user-1",
  requestId: "request-1",
});

describe("limpeza dos dados de teste: remove pelos IDs gravados", () => {
  let runs: InMemoryActivationTestRuns;
  let scheduling: CleanupSchedulingDouble;
  let cleanup: ActivationTestCleanupService;

  beforeEach(() => {
    ({ runs, scheduling, cleanup } = build());
  });

  it("remove exatamente as linhas cujos IDs a execucao gravou", async () => {
    const run = await runThatCreatedTestData(runs);
    expect(runs.messages).toHaveLength(2);

    const result = await cleanup.clean(cleanInput(run.id));

    expect(result?.removed).toEqual({
      MESSAGE: 2,
      CONVERSATION: 1,
      CONTACT: 1,
    });
    expect(runs.messages).toHaveLength(0);
    expect(runs.conversations).toHaveLength(0);
    expect(runs.contacts).toHaveLength(0);

    // A prova de que a selecao foi por ID: cada remocao recebeu exatamente os
    // IDs gravados na execucao, e nada alem deles. Se a limpeza passar a
    // buscar por telefone, nome ou data, ela deixa de conseguir apontar esses
    // IDs e este teste cai.
    const messageRemoval = runs.removals.find(
      (entry) => entry.target === "MESSAGE",
    );
    expect(messageRemoval?.ids).toEqual(run.createdMessageIds);
    expect(
      runs.removals.find((entry) => entry.target === "CONVERSATION")?.ids,
    ).toEqual([run.createdConversationId]);
    expect(
      runs.removals.find((entry) => entry.target === "CONTACT")?.ids,
    ).toEqual([run.createdContactId]);
  });

  it("nao toca em linha preexistente parecida com dado de teste", async () => {
    // Uma conversa que ja existia com o numero da plataforma, o mesmo nome do
    // contato de teste e uma mensagem do mesmo dia. Tudo nela parece dado de
    // teste; nada nela foi criado pela execucao.
    runs.plantContact({
      id: "contact-preexistente",
      tenantId: TENANT,
      channelId: CHANNEL,
      externalContactId: PLATFORM_NUMBER,
      displayName: ACTIVATION_TEST_CONTACT_NAME,
    });
    runs.plantConversation({
      id: "conversation-preexistente",
      tenantId: TENANT,
      channelId: CHANNEL,
      externalContactId: PLATFORM_NUMBER,
      customerName: ACTIVATION_TEST_CONTACT_NAME,
      contactId: "contact-preexistente",
    });
    runs.plantMessage({
      id: "message-preexistente",
      tenantId: TENANT,
      conversationId: "conversation-preexistente",
      author: "CLIENT",
      body: "Oi! Quanto custa Corte?",
      createdAt: new Date("2026-09-14T12:10:00.000Z"),
    });

    const run = await runThatCreatedTestData(runs);
    // A execucao reaproveitou a conversa que ja existia: ela nao criou nada
    // aqui, entao nao tem nada aqui para apagar.
    expect(run.conversationId).toBe("conversation-preexistente");
    expect(run.createdConversationId).toBeNull();
    expect(run.createdContactId).toBeNull();

    const result = await cleanup.clean(cleanInput(run.id));

    expect(result?.removed).toEqual({
      MESSAGE: 2,
      CONVERSATION: 0,
      CONTACT: 0,
    });
    // A linha preexistente continua inteira, com nome, telefone e data
    // identicos aos do dado de teste.
    expect(runs.conversations.map((row) => row.id)).toEqual([
      "conversation-preexistente",
    ]);
    expect(runs.contacts.map((row) => row.id)).toEqual([
      "contact-preexistente",
    ]);
    expect(runs.messages.map((row) => row.id)).toEqual([
      "message-preexistente",
    ]);
  });

  it("nao apaga a conversa de teste se ela levaria junto mensagem de terceiro", async () => {
    const run = await runThatCreatedTestData(runs);
    // Mensagem que a execucao nao criou, dentro da conversa de teste.
    // `Message` aponta para `Conversation` com `onDelete: Cascade`: apagar a
    // conversa a levaria junto.
    runs.plantMessage({
      id: "message-de-terceiro",
      tenantId: TENANT,
      conversationId: run.conversationId ?? "",
      author: "OWNER",
      body: "Oi! Quanto custa Corte?",
      createdAt: new Date("2026-09-14T12:20:00.000Z"),
    });

    const result = await cleanup.clean(cleanInput(run.id));

    expect(result?.removed.MESSAGE).toBe(2);
    expect(result?.removed.CONVERSATION).toBe(0);
    expect(result?.removed.CONTACT).toBe(0);
    expect(runs.messages.map((row) => row.id)).toEqual(["message-de-terceiro"]);
    expect(runs.conversations).toHaveLength(1);
    expect(
      result?.residue.filter(
        (item) => item.reason === "WOULD_TOUCH_OTHER_ROWS",
      ),
    ).toEqual([
      {
        target: "CONVERSATION",
        id: run.createdConversationId,
        reason: "WOULD_TOUCH_OTHER_ROWS",
      },
      {
        target: "CONTACT",
        id: run.createdContactId,
        reason: "WOULD_TOUCH_OTHER_ROWS",
      },
    ]);
    expect(result?.state).toBe("RESIDUAL");
  });

  it("nao alcanca linha de outro tenant, mesmo com o ID em maos", async () => {
    const run = await runThatCreatedTestData(runs);
    runs.plantMessage({
      id: run.createdMessageIds[0] ?? "message-1",
      tenantId: OTHER_TENANT,
      conversationId: "conversation-vizinha",
      author: "CLIENT",
      body: "Oi! Quanto custa Corte?",
      createdAt: new Date("2026-09-14T12:10:00.000Z"),
    });

    await cleanup.clean(cleanInput(run.id));

    expect(runs.messages.map((row) => row.tenantId)).toEqual([OTHER_TENANT]);
  });
});

describe("limpeza dos dados de teste: agenda e lista de clientes", () => {
  it("remove o agendamento e a pessoa pelos IDs gravados e confere os read models", async () => {
    const { runs, scheduling, cleanup } = build();
    const run = await runThatCreatedTestData(runs);

    const result = await cleanup.clean(cleanInput(run.id));

    expect(scheduling.cancelCalls).toEqual([
      {
        appointmentId: "appointment-1",
        idempotencyKey: `activation-test-cleanup-${run.id}`,
      },
    ]);
    // O vault e literal: o agendamento de teste e a pessoa de teste sao
    // **removidos**, nao apenas cancelados. Este teste falha se a limpeza
    // voltar a parar no cancelamento.
    expect(scheduling.deleteAppointmentCalls).toEqual(["appointment-1"]);
    expect(scheduling.deleteCustomerCalls).toEqual(["customer-1"]);
    expect(result?.appointmentCancelled).toBe(true);
    // Provado por leitura dos read models, nao pela escrita.
    expect(scheduling.agendaReadsByCustomerId).toEqual(["customer-1"]);
    expect(scheduling.customerReadsByPhone).toEqual([PLATFORM_NUMBER]);
    expect(
      await scheduling.findFutureAppointmentsForCustomer("customer-1"),
    ).toEqual([]);
    expect(
      await scheduling.findCustomerCandidatesByPhone(PLATFORM_NUMBER),
    ).toEqual([]);
    expect(result?.state).toBe("CLEAN");
    expect(result?.residue).toEqual([]);
  });

  it("cancelar sem remover nao basta: o que fica listado vira residuo", async () => {
    const { runs, scheduling, cleanup } = build();
    // Mundo em que a remocao nao pode acontecer: o cancelamento sozinho deixa
    // o atendimento listado, e a pessoa fica presa a ele. Este teste falha se
    // a limpeza voltar a chamar `CLEAN` o que ficou.
    scheduling.failDeleteAppointmentWith = new AppError("calendar unavailable", {
      statusCode: 503,
    });
    const run = await runThatCreatedTestData(runs);

    const result = await cleanup.clean(cleanInput(run.id));

    expect(result?.state).toBe("RESIDUAL");
    expect(
      result?.residue.map((item) => ({
        target: item.target,
        id: item.id,
        reason: item.reason,
      })),
    ).toEqual([
      {
        target: "APPOINTMENT",
        id: "appointment-1",
        reason: "REMOVAL_FAILED",
      },
      { target: "CUSTOMER", id: "customer-1", reason: "REMOVAL_FAILED" },
    ]);
  });

  it("pessoa de teste que continua na lista de clientes e residuo, nao silencio", async () => {
    const { runs, scheduling, cleanup } = build();
    // A remocao foi aceita e a pessoa continua aparecendo: a limpeza nao
    // afirma que ela saiu, porque quem responde e a leitura.
    scheduling.deleteCustomer = async (customerId: string) => ({
      customerId,
      removed: true,
    });
    const run = await runThatCreatedTestData(runs);

    const result = await cleanup.clean(cleanInput(run.id));

    expect(result?.state).toBe("RESIDUAL");
    expect(result?.residue).toEqual([
      {
        target: "CUSTOMER",
        id: "customer-1",
        reason: "STILL_VISIBLE",
        detail:
          "a pessoa de teste foi removida, mas continua na lista de clientes do negocio",
      },
    ]);
  });

  it("cancelamento que falha vira residuo e nao derruba o resto da limpeza", async () => {
    const { runs, scheduling, cleanup } = build();
    scheduling.failCancelWith = new AppError("calendar unavailable", {
      statusCode: 503,
    });
    const run = await runThatCreatedTestData(runs);

    const result = await cleanup.clean(cleanInput(run.id));

    // As mensagens sairam mesmo com a agenda fora do ar.
    expect(result?.removed.MESSAGE).toBe(2);
    expect(result?.state).toBe("RESIDUAL");
    expect(
      result?.residue.find((item) => item.target === "APPOINTMENT")?.reason,
    ).toBe("REMOVAL_FAILED");
  });

  it("agendamento que ja nao existe nao vira residuo", async () => {
    const { runs, scheduling, cleanup } = build();
    scheduling.failCancelWith = new AppError("appointment not found", {
      statusCode: 404,
    });
    const run = await runThatCreatedTestData(runs);
    // Sem pessoa de teste gravada, o unico residuo possivel seria o
    // agendamento — e ele nao existe mais.
    await runs.patchRun(TENANT, run.id, { customerId: null });

    const result = await cleanup.clean(cleanInput(run.id));

    expect(result?.state).toBe("CLEAN");
    expect(result?.residue).toEqual([]);
  });
});

describe("limpeza dos dados de teste: registro na execucao", () => {
  it("grava estado e residuo na propria execucao", async () => {
    const { runs, scheduling, cleanup } = build();
    scheduling.failDeleteAppointmentWith = new AppError("calendar unavailable", {
      statusCode: 503,
    });
    const run = await runThatCreatedTestData(runs);
    expect(run.cleanupState).toBe("PENDING");

    await cleanup.clean(cleanInput(run.id));

    const stored = await runs.findRun(TENANT, run.id);
    expect(stored?.cleanupState).toBe("RESIDUAL");
    expect(stored?.cleanupAt).toEqual(new Date("2026-09-14T13:00:00.000Z"));
    expect(stored?.cleanupResidue.map((item) => item.target)).toEqual([
      "APPOINTMENT",
      "CUSTOMER",
    ]);
  });

  it("limpeza parcial nunca e relatada como sucesso completo", async () => {
    const { runs, scheduling, cleanup } = build();
    scheduling.failDeleteAppointmentWith = new AppError("calendar unavailable", {
      statusCode: 503,
    });
    const run = await runThatCreatedTestData(runs);

    const result = await cleanup.clean(cleanInput(run.id));

    expect(result?.residue.length).toBeGreaterThan(0);
    expect(result?.state).not.toBe("CLEAN");
    const stored = await runs.findRun(TENANT, run.id);
    expect(stored?.cleanupState).not.toBe("CLEAN");
    expect(stored?.cleanupState).not.toBe("PENDING");
  });

  it("`CLEAN` e inalcancavel com sobra", () => {
    expect(activationTestCleanupState([])).toBe("CLEAN");
    expect(
      activationTestCleanupState([
        {
          target: "CUSTOMER",
          id: "customer-1",
          reason: "OPERATION_UNAVAILABLE",
        },
      ]),
    ).toBe("RESIDUAL");
  });

  it("a tela le o residuo em linguagem do negocio", () => {
    const report = activationTestResidueReport([
      { target: "CUSTOMER", id: "customer-1", reason: "OPERATION_UNAVAILABLE" },
    ]);
    expect(report[0]?.label).toBe(
      ACTIVATION_TEST_CLEANUP_TARGET_LABELS.CUSTOMER,
    );
    expect(report[0]?.id).toBe("customer-1");
    expect(report[0]?.explanation).toBeTruthy();
  });

  it("residuo gravado que nao e lista vira lista vazia, nunca `CLEAN` fabricado", () => {
    expect(parseActivationTestResidue(null)).toEqual([]);
    expect(parseActivationTestResidue("tudo certo")).toEqual([]);
    expect(parseActivationTestResidue([{ semId: true }])).toEqual([]);
  });

  it("limpar execucao que nao existe devolve ausencia, nao erro", async () => {
    const { cleanup } = build();
    await expect(
      cleanup.clean(cleanInput("run-inexistente")),
    ).resolves.toBeNull();
  });
});

describe("limpeza dos dados de teste: idempotencia", () => {
  it("repetir nao apaga mais nada e nao falha", async () => {
    const { runs, scheduling, cleanup } = build();
    const run = await runThatCreatedTestData(runs);

    const first = await cleanup.clean(cleanInput(run.id));
    expect(first?.removed).toEqual({ MESSAGE: 2, CONVERSATION: 1, CONTACT: 1 });
    expect(first?.state).toBe("CLEAN");

    const second = await cleanup.clean(cleanInput(run.id));
    expect(second?.removed).toEqual({
      MESSAGE: 0,
      CONVERSATION: 0,
      CONTACT: 0,
    });
    expect(second?.state).toBe("CLEAN");
    expect(second?.residue).toEqual([]);

    // Nenhuma linha a mais saiu, e a chave de idempotencia do cancelamento e a
    // mesma nas duas passadas: a agenda nao ganha um segundo efeito.
    expect(runs.messages).toHaveLength(0);
    expect(runs.conversations).toHaveLength(0);
    expect(runs.contacts).toHaveLength(0);
    expect(
      new Set(scheduling.cancelCalls.map((call) => call.idempotencyKey)).size,
    ).toBe(1);
  });

  it("repetir sobre limpeza parcial mantem o mesmo residuo", async () => {
    const { runs, scheduling, cleanup } = build();
    scheduling.failDeleteAppointmentWith = new AppError("calendar unavailable", {
      statusCode: 503,
    });
    const run = await runThatCreatedTestData(runs);

    const first = await cleanup.clean(cleanInput(run.id));
    const second = await cleanup.clean(cleanInput(run.id));

    expect(second?.removed).toEqual({
      MESSAGE: 0,
      CONVERSATION: 0,
      CONTACT: 0,
    });
    expect(second?.residue).toEqual(first?.residue);
    expect(second?.state).toBe("RESIDUAL");
  });
});
