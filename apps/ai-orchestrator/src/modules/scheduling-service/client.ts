import { z } from "zod";

import { env } from "../../config/env.js";
import { addDays, todayInTimeZone } from "../../lib/dates.js";
import { DomainError, InfrastructureError } from "../../lib/errors.js";
import {
  CALLER_ID,
  deriveInternalToken,
} from "../../lib/internal-credentials.js";
import type { BusinessContext } from "../tenant-config/business-context.js";
import type {
  AppointmentPresenceConfirmation,
  ClaimNotificationIntentsInput,
  ConfirmAppointmentSeriesInput,
  CreateSchedulingHoldInput,
  CustomerChangePolicy,
  FindAppointmentsForPhoneOptions,
  NotificationClaimResult,
  NotificationIntentSettlement,
  PreviewAppointmentSeriesInput,
  ReminderConfirmationSettings,
  RescheduleAppointmentInput,
  ScheduleAppointmentInput,
  SchedulingAppointment,
  SchedulingAuthorizedCustomerContext,
  SchedulingCustomerCandidate,
  SchedulingCustomerDependent,
  SchedulingHold,
  SchedulingRequestContext,
  SchedulingSeriesOccurrencePreview,
  SchedulingServiceDefinition,
  SettleNotificationIntentInput,
} from "./types.js";
import { NOTIFICATION_INTENT_REASONS } from "./types.js";

const priceTypeSchema = z.enum([
  "FIXED",
  "STARTING_AT",
  "ON_REQUEST",
  "NOT_INFORMED",
]);
const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  // `/internal/services` so devolve servico operacional (Goal007): duracao
  // sempre presente aqui.
  durationMinutes: z.number(),
  priceType: priceTypeSchema,
  price: z.number().nullable(),
  active: z.boolean(),
  colorId: z.number().nullable().optional(),
  // Obrigatorio e nulavel (Goal012, residuo do review011): o Scheduling
  // sempre declara o campo, nulo quando o servico nao tem intervalo de
  // referencia cadastrado. Resposta que omite o campo e resposta invalida,
  // nunca um intervalo inventado por omissao.
  recurrenceIntervalDays: z.number().int().positive().nullable(),
});
const appointmentSchema = z.object({
  id: z.string(),
  // Atendimento manual excepcional sem servico cadastrado (Goal008). O
  // default mantem decodavel toda resposta anterior a este Goal, inclusive
  // replay de idempotencia gravado antes dele.
  title: z.string().nullable().default(null),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number(),
  customerId: z.string().nullable(),
  customer: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      phone: z.string().nullable(),
    })
    .nullable(),
  services: z.array(
    z.object({
      serviceId: z.string(),
      name: z.string(),
      durationMinutes: z.number().nullable(),
      priceType: priceTypeSchema,
      price: z.number().nullable(),
    }),
  ),
  totalPrice: z.number().nullable(),
  totalPriceType: z.enum(["FIXED", "STARTING_AT", "NONE"]).default("NONE"),
  comments: z.string().nullable(),
  status: z.string(),
});
const customerCandidateSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
});
const customerListSchema = z.object({
  items: z.array(customerCandidateSchema),
  source: z.string(),
  managedExternally: z.boolean(),
  filteredByPhone: z.boolean().optional(),
});
// Dependentes confirmados dos candidatos do numero (Goal142).
const customerDependentListSchema = z.object({
  items: z.array(
    customerCandidateSchema.extend({
      guardian: z.object({ id: z.string(), name: z.string().nullable() }),
    }),
  ),
});
const authorizedCustomerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  notes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  primaryGuardian: z
    .object({ guardian: z.object({ id: z.string(), name: z.string().nullable() }) })
    .nullable()
    .default(null),
});
/**
 * Resposta das remoções por ID. `removed: false` é "já não existia" — a
 * resposta honesta para a segunda passada de uma limpeza idempotente.
 */
const removalSchema = z.object({ removed: z.boolean() });

const slotSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});
const holdSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number(),
  serviceIds: z.array(z.string()),
  customerId: z.string().nullable(),
  contactRef: z.string().nullable(),
  source: z.enum(["AI", "USER"]),
  expiresAt: z.string(),
  status: z.enum(["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"]),
});
const seriesOccurrenceSchema = z.object({
  index: z.number(),
  requestedDate: z.string(),
  date: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  adjusted: z.boolean(),
  holdId: z.string().nullable(),
  unavailable: z.boolean(),
});
// --- Intencao de envio (Goal021) -------------------------------------------
// Decodificacao estrita: resposta que nao casa com o contrato e resposta
// invalida, nunca um lembrete montado com campo inventado por omissao. E o
// mesmo principio dos schemas acima, e aqui ele vale dobrado — o dano deste
// Goal e mandar ao cliente um horario que nao existe.
const notificationReasonSchema = z.enum(NOTIFICATION_INTENT_REASONS);
const notificationFactsSchema = z.object({
  kind: z.enum(["REMINDER", "CHANGE_NOTICE"]),
  appointmentStatus: z.string(),
  customerId: z.string(),
  customerName: z.string().nullable(),
  customerPhone: z.string(),
  services: z.array(z.string()),
  title: z.string().nullable(),
  timezone: z.string(),
  // Data e hora chegam prontas do dono. A IA nunca as recalcula, entao aqui
  // elas sao apenas texto — e texto ausente e resposta invalida.
  date: z.string(),
  time: z.string(),
  startAt: z.string(),
  price: z.number().nullable(),
  confirmationRequested: z.boolean(),
  // Opcional de proposito (D-197): os fatos ficam gravados na intencao no
  // instante da reivindicacao, e intencao gravada antes do campo nao o tem.
  // Ausente e o padrao, nunca um texto inventado.
  messageExample: z.string().nullable().optional(),
});
const claimedNotificationIntentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  appointmentId: z.string(),
  kind: z.enum(["REMINDER", "CHANGE_NOTICE"]),
  slot: z.enum(["FIRST", "SECOND", "CHANGE_NOTICE"]),
  appointmentVersion: z.number().int(),
  dueAt: z.string(),
  attemptCount: z.number().int(),
  leaseToken: z.string(),
  leaseExpiresAt: z.string(),
  correlationId: z.string(),
  facts: notificationFactsSchema,
});
const notificationClaimResultSchema = z.object({
  owner: z.string(),
  claimed: z.array(claimedNotificationIntentSchema),
  settled: z.array(
    z.object({
      id: z.string(),
      tenantId: z.string(),
      appointmentId: z.string(),
      state: z.string(),
      reason: notificationReasonSchema.nullable(),
    }),
  ),
  released: z.number().int(),
  exhausted: z.number().int(),
  skipped: z.number().int(),
});
const notificationSettlementSchema = z.object({
  applied: z.boolean(),
  intent: z.object({
    id: z.string(),
    tenantId: z.string(),
    appointmentId: z.string(),
    state: z.string(),
    reason: notificationReasonSchema.nullable(),
    detail: z.string().nullable(),
    attemptCount: z.number().int(),
    sentAt: z.string().nullable(),
    settledAt: z.string().nullable(),
    correlationId: z.string().nullable(),
  }),
});
// --- Confirmacao de presenca pela resposta ao lembrete (Goal021) -----------
const reminderConfirmationSettingsSchema = z.object({
  configured: z.boolean(),
  confirmationEnabled: z.boolean(),
});
// --- Politica de antecedencia do cliente (Goal073) --------------------------
// Recorte do mesmo `GET /internal/availability-settings` usado pela tela de
// Configuracoes: campos que a resposta nao declara (timezone, rules, demais
// regras de oferta) sao ignorados por este schema, nao decodificados errado.
const customerChangePolicySchema = z.object({
  customerChangeMinNoticeMinutes: z.number().int(),
});
// Recorte do snapshot de ciclo de vida do atendimento. `status`,
// `completedAt` e `noShowAt` sao decodificados nao porque a confirmacao os
// mude, mas justamente porque ela nao pode muda-los: sem le-los nao ha como
// provar isso do lado da IA.
const appointmentPresenceSchema = z.object({
  id: z.string(),
  status: z.string(),
  presenceConfirmedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  noShowAt: z.string().nullable(),
});

const DEFAULT_AVAILABILITY_DAYS = 14;
const DEFAULT_APPOINTMENT_LOOKUP_DAYS = 90;
/**
 * Quantos horarios o motor devolve para a IA escolher. Antes eram 3, sempre
 * os primeiros: "quais os horarios pra essa semana?" so via hoje cedo
 * (validacao de 2026-10-11). Agora a busca cobre o periodo e
 * `spreadSlotsAcrossDays` espalha a oferta pelos dias.
 */
const AVAILABILITY_FETCH_MAX_SLOTS = 100;
/** Dias com horario na oferta e horarios por dia (comeco, meio e fim). */
const OFFER_MAX_DAYS = 5;
const OFFER_SLOTS_PER_DAY = 3;
/**
 * Pedido de um dia so (ou dois) tambem fica em 3: com 6 a IA repassava todos
 * ("9h, 9h30, 10h, 11h, 15h ou 15h30"), mesmo com o prompt pedindo no maximo
 * 3 (validacao de 2026-10-12).
 */
const OFFER_SLOTS_PER_SHORT_PERIOD_DAY = 3;
const DEFAULT_SLOT_STEP_MINUTES = 30;

export interface SchedulingGateway {
  listActiveServices(
    context?: SchedulingRequestContext,
  ): Promise<SchedulingServiceDefinition[]>;
  findService(
    serviceId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingServiceDefinition>;
  getAvailableSlotsForServices(
    serviceIds: string[],
    startDate: string | undefined,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
    options?: AvailabilityQueryOptions,
  ): Promise<Array<{ date: string; startTime: string; endTime: string }>>;
  createAppointment(
    input: ScheduleAppointmentInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment>;
  /**
   * Horarios futuros do numero. Sem `options`, so os dos candidatos do
   * telefone; `includeDependents: true` (Goal142) inclui os dos dependentes
   * confirmados deles. So cancelar, remarcar e a lista da IA pedem.
   */
  findFutureAppointmentsForPhone(
    phone: string,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
    options?: FindAppointmentsForPhoneOptions,
  ): Promise<SchedulingAppointment[]>;
  findFutureAppointmentsForCustomer(
    customerId: string,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingAppointment[]>;
  findCustomerCandidatesByPhone(
    phone: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingCustomerCandidate[]>;
  /**
   * Quem as pessoas do numero agendam (Goal142): os clientes com responsavel
   * principal `CONFIRMED` entre os candidatos do telefone.
   */
  findCustomerDependentsByPhone(
    phone: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingCustomerDependent[]>;
  getAuthorizedCustomerContext(
    customerId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingAuthorizedCustomerContext>;
  cancelAppointment(
    appointmentId: string,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
    /**
     * Isencao da politica de antecedencia minima do cliente (Goal073). So
     * `ActivationTestCleanupService` envia isto — a limpeza do teste de
     * ativacao cancela sem esperar antecedencia nenhuma, mesmo com chamador
     * IA. Nenhum outro chamador dentro de `src` passa este argumento.
     */
    policyExemption?: "ACTIVATION_TEST_CLEANUP",
  ): Promise<{ appointmentId: string; cancelled: true }>;
  /**
   * Remoção definitiva por ID (Goal019).
   *
   * Cancelar não é remover: o atendimento cancelado continua na agenda do
   * negócio. As duas operações abaixo existem para o único caso em que o
   * produto desfaz o que ele mesmo criou — o teste de ativação, cujo fluxo no
   * vault termina com o atendimento de teste e a pessoa de teste
   * **removidos**.
   *
   * Recebem só o ID, de propósito: não há aqui como expressar remoção por
   * telefone, nome ou data, então a limpeza não consegue fazer busca
   * heurística nem por engano. `removed: false` é o caso de já não existir —
   * repetir é no-op, não erro.
   */
  deleteAppointment(
    appointmentId: string,
    context?: SchedulingRequestContext,
  ): Promise<{ appointmentId: string; removed: boolean }>;
  deleteCustomer(
    customerId: string,
    context?: SchedulingRequestContext,
  ): Promise<{ customerId: string; removed: boolean }>;
  rescheduleAppointment(
    input: RescheduleAppointmentInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment>;
  /**
   * Hold (Goal008): segura o horário proposto enquanto a cliente decide.
   *
   * Não há `createManualAppointment` nem parâmetro de sobreposição em lugar
   * nenhum desta interface, de propósito: o que a IA não consegue expressar
   * ela não consegue fazer por engano.
   */
  createHold(
    input: CreateSchedulingHoldInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingHold>;
  releaseHold(
    holdId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingHold>;
  /**
   * Recorrência de atendimento (Goal009): pré-visualização cria um hold por
   * ocorrência ajustada à grade do negócio. Nunca decide granularidade nem
   * antecedência — o motor decide, como em `get_availability`.
   */
  previewAppointmentSeries(
    input: PreviewAppointmentSeriesInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingSeriesOccurrencePreview[]>;
  /**
   * Confirmação atômica: consome todos os holds da série de uma vez. Hold
   * vencido não confirma nada — a resposta identifica a ocorrência e a IA
   * consulta de novo, nunca força.
   */
  confirmAppointmentSeries(
    input: ConfirmAppointmentSeriesInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment[]>;
  /**
   * Configuracao de lembrete do negocio, em leitura (Goal021).
   *
   * Existe aqui **so** para o gate da confirmacao de presenca: e o negocio
   * que decide se a resposta ao lembrete vira registro. Nao ha contrapartida
   * de escrita nesta interface, de proposito — configurar lembrete e decisao
   * humana, e o que a IA nao consegue expressar ela nao configura por engano.
   */
  getReminderConfirmationSettings(
    context?: SchedulingRequestContext,
  ): Promise<ReminderConfirmationSettings>;
  /**
   * Registra presenca confirmada (Goal021).
   *
   * Recebe **so** o id: nao ha como expressar "nao vem" nem "faltou" por
   * este caminho. Recusar, cancelar e remarcar continuam sendo as tools com
   * prepare/confirm, e ausencia de resposta nao chega aqui de forma nenhuma.
   * A origem do evento e derivada da credencial no dono — a IA chamando
   * grava `AI`, sem dizer nada sobre isso no corpo.
   */
  confirmAppointmentPresence(
    appointmentId: string,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<AppointmentPresenceConfirmation>;
  /**
   * Antecedencia minima do cliente (Goal073). Leitura pura do mesmo recorte
   * que `PATCH /internal/availability-settings` grava; quem decide o valor
   * e o negocio via BFF, nunca a IA.
   */
  getCustomerChangePolicy(
    context?: SchedulingRequestContext,
  ): Promise<CustomerChangePolicy>;
}

export class SchedulingClient implements SchedulingGateway {
  async listActiveServices(context?: SchedulingRequestContext) {
    return (
      await this.request("/internal/services", serviceSchema.array(), {
        context,
      })
    )
      .filter((service) => service.active)
      .map(toService);
  }

  async findService(serviceId: string, context?: SchedulingRequestContext) {
    const service = (await this.listActiveServices(context)).find(
      (item) => item.id === serviceId,
    );
    if (!service) {
      throw new DomainError("Servico nao encontrado na agenda.", {
        statusCode: 404,
        code: "SERVICE_NOT_FOUND",
      });
    }
    return service;
  }

  async getAvailableSlotsForServices(
    serviceIds: string[],
    startDate: string | undefined,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
    options?: AvailabilityQueryOptions,
  ) {
    const days = options?.days ?? DEFAULT_AVAILABILITY_DAYS;
    // Sem `stepMinutes` (Goal009): a granularidade da oferta é sempre a do
    // negócio, decidida pelo motor de disponibilidade — a IA não propõe a
    // própria grade.
    const query = new URLSearchParams({
      serviceIds: serviceIds.join(","),
      startDate: startDate ?? todayInTimeZone(businessContext.timezone),
      days: String(days),
      maxSlots: String(AVAILABILITY_FETCH_MAX_SLOTS),
    });
    const slots = await this.request(
      `/internal/availability?${query.toString()}`,
      slotSchema.array(),
      { context },
    );
    return spreadSlotsAcrossDays(slots, {
      maxDays: OFFER_MAX_DAYS,
      perDay:
        days <= 2 ? OFFER_SLOTS_PER_SHORT_PERIOD_DAY : OFFER_SLOTS_PER_DAY,
    });
  }

  async createAppointment(
    input: ScheduleAppointmentInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ) {
    const serviceIds = input.serviceIds ?? [input.serviceId];
    return toAppointment(
      await this.request("/internal/appointments", appointmentSchema, {
        method: "POST",
        context,
        idempotencyKey,
        body: {
          serviceIds: serviceIds.map(String),
          date: input.date,
          startTime: input.startTime,
          // Pessoa resolvida vence: sem `customerId`, o Scheduling cria o
          // cadastro dentro da transação de confirmação.
          customerId: input.customerId ?? undefined,
          customerName: input.customerName ?? undefined,
          customerPhone: input.customerPhone ?? undefined,
          comments: input.comments,
          stepMinutes: DEFAULT_SLOT_STEP_MINUTES,
          // O hold criado ao propor. Vencido, o Scheduling recusa com
          // `APPOINTMENT_HOLD_EXPIRED` em vez de confirmar assim mesmo.
          holdId: input.holdId ?? undefined,
        },
      }),
    );
  }

  /** Segura o horário proposto; sempre `source: AI`, nunca override. */
  async createHold(
    input: CreateSchedulingHoldInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingHold> {
    return toHold(
      await this.request("/internal/holds", holdSchema, {
        method: "POST",
        context,
        idempotencyKey,
        body: {
          source: "AI",
          serviceIds: input.serviceIds.map(String),
          date: input.date,
          startTime: input.startTime,
          stepMinutes: DEFAULT_SLOT_STEP_MINUTES,
          customerId: input.customerId ?? undefined,
          contactRef: input.contactRef ?? undefined,
        },
      }),
    );
  }

  async releaseHold(
    holdId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingHold> {
    return toHold(
      await this.request(
        `/internal/holds/${encodeURIComponent(holdId)}`,
        holdSchema,
        { method: "DELETE", context },
      ),
    );
  }

  async previewAppointmentSeries(
    input: PreviewAppointmentSeriesInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingSeriesOccurrencePreview[]> {
    return this.request(
      "/internal/appointments/series/preview",
      seriesOccurrenceSchema.array(),
      {
        method: "POST",
        context,
        idempotencyKey,
        body: {
          serviceIds: input.serviceIds.map(String),
          occurrenceCount: input.occurrenceCount,
          intervalDays: input.intervalDays,
          firstDate: input.firstDate,
          firstStartTime: input.firstStartTime,
          customerId: input.customerId ?? undefined,
          contactRef: input.contactRef ?? undefined,
        },
      },
    );
  }

  async confirmAppointmentSeries(
    input: ConfirmAppointmentSeriesInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<SchedulingAppointment[]> {
    return (
      await this.request(
        "/internal/appointments/series/confirm",
        appointmentSchema.array(),
        {
          method: "POST",
          context,
          idempotencyKey,
          body: {
            occurrences: input.holdIds.map((holdId) => ({ holdId })),
            serviceIds: input.serviceIds.map(String),
            intervalDays: input.intervalDays,
            customerId: input.customerId ?? undefined,
            customerName: input.customerName ?? undefined,
            customerPhone: input.customerPhone ?? undefined,
            comments: input.comments,
          },
        },
      )
    ).map(toAppointment);
  }

  /**
   * Candidatos para o número do contato.
   *
   * Zero, um ou vários — o número não prova de quem é o atendimento, então a
   * escolha volta para a conversa em vez de ser adivinhada aqui.
   */
  async findCustomerCandidatesByPhone(
    phone: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingCustomerCandidate[]> {
    const query = new URLSearchParams({ phone });
    const result = await this.request(
      `/internal/customers?${query.toString()}`,
      customerListSchema,
      { context },
    );
    return result.items;
  }

  /**
   * Dependentes confirmados dos candidatos do número (Goal142). Relação
   * proposta nunca chega aqui: o Scheduling só devolve a confirmada.
   */
  async findCustomerDependentsByPhone(
    phone: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingCustomerDependent[]> {
    const query = new URLSearchParams({ phone });
    const result = await this.request(
      `/internal/customers/dependents?${query.toString()}`,
      customerDependentListSchema,
      { context },
    );
    return result.items;
  }

  /** Só o que a pessoa autorizou explicitamente chega ao modelo. */
  async getAuthorizedCustomerContext(
    customerId: string,
    context?: SchedulingRequestContext,
  ): Promise<SchedulingAuthorizedCustomerContext> {
    const authorized = await this.request(
      `/internal/customers/${encodeURIComponent(customerId)}/ai-context`,
      authorizedCustomerSchema,
      { context },
    );
    return {
      id: authorized.id,
      name: authorized.name,
      phone: authorized.phone,
      notes: authorized.notes,
      tags: authorized.tags,
      primaryGuardian: authorized.primaryGuardian
        ? {
            id: authorized.primaryGuardian.guardian.id,
            name: authorized.primaryGuardian.guardian.name,
          }
        : null,
    };
  }

  async findFutureAppointmentsForCustomer(
    customerId: string,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
  ) {
    const startDate = todayInTimeZone(businessContext.timezone);
    const query = new URLSearchParams({
      customerId,
      startDate,
      endDate: addDays(startDate, DEFAULT_APPOINTMENT_LOOKUP_DAYS),
    });
    return (
      await this.request(
        `/internal/appointments?${query.toString()}`,
        appointmentSchema.array(),
        { context },
      )
    ).map(toAppointment);
  }

  async findFutureAppointmentsForPhone(
    phone: string,
    businessContext: BusinessContext,
    context?: SchedulingRequestContext,
    options: FindAppointmentsForPhoneOptions = {},
  ) {
    const startDate = todayInTimeZone(businessContext.timezone);
    const query = new URLSearchParams({
      customerPhone: phone,
      startDate,
      endDate: addDays(startDate, DEFAULT_APPOINTMENT_LOOKUP_DAYS),
    });
    // Omitido por padrão: sem pedido explícito, a consulta é a de sempre.
    if (options.includeDependents) query.set("includeDependents", "true");
    return (
      await this.request(
        `/internal/appointments?${query.toString()}`,
        appointmentSchema.array(),
        { context },
      )
    ).map(toAppointment);
  }

  async cancelAppointment(
    appointmentId: string,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
    policyExemption?: "ACTIVATION_TEST_CLEANUP",
  ): Promise<{ appointmentId: string; cancelled: true }> {
    await this.request(
      `/internal/appointments/${appointmentId}/cancel`,
      appointmentSchema,
      {
        method: "POST",
        context,
        idempotencyKey,
        body: { policyExemption: policyExemption ?? undefined },
      },
    );
    return { appointmentId, cancelled: true };
  }

  async deleteAppointment(
    appointmentId: string,
    context?: SchedulingRequestContext,
  ): Promise<{ appointmentId: string; removed: boolean }> {
    const result = await this.request(
      `/internal/appointments/${appointmentId}`,
      removalSchema,
      { method: "DELETE", context },
    );
    return { appointmentId, removed: result.removed };
  }

  async deleteCustomer(
    customerId: string,
    context?: SchedulingRequestContext,
  ): Promise<{ customerId: string; removed: boolean }> {
    const result = await this.request(
      `/internal/customers/${customerId}`,
      removalSchema,
      { method: "DELETE", context },
    );
    return { customerId, removed: result.removed };
  }

  async rescheduleAppointment(
    input: RescheduleAppointmentInput,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ) {
    return toAppointment(
      await this.request(
        `/internal/appointments/${input.appointmentId}/reschedule`,
        appointmentSchema,
        {
          method: "POST",
          context,
          idempotencyKey,
          body: {
            date: input.date,
            startTime: input.startTime,
            stepMinutes: DEFAULT_SLOT_STEP_MINUTES,
            // Hold do NOVO horário; o original segue ocupado pelo próprio
            // atendimento até esta transação commitar.
            holdId: input.holdId ?? undefined,
          },
        },
      ),
    );
  }

  /**
   * Reivindica o lote de intencoes vencidas (Goal021).
   *
   * E a **unica** chamada interna que atravessa negocios: quem entrega atende
   * todos, e a fila vence por `dueAt`. O tenant do cabecalho e contexto de
   * requisicao, nao autorizacao — quem autoriza e a credencial do entregador,
   * conferida por `requireDeliveryCaller` no dono. A justica entre negocios e
   * o teto por tenant, aplicado la, nao aqui.
   */
  async claimDueNotificationIntents(
    input: ClaimNotificationIntentsInput,
    context?: SchedulingRequestContext,
  ): Promise<NotificationClaimResult> {
    return this.request(
      "/internal/notification-intents/claim",
      notificationClaimResultSchema,
      {
        method: "POST",
        context,
        body: {
          owner: input.owner,
          limit: input.limit,
          perTenantLimit: input.perTenantLimit,
          leaseTtlSeconds: input.leaseTtlSeconds,
        },
      },
    );
  }

  /**
   * Liquida uma intencao nomeada. Volta a ser por negocio: o tenant do
   * cabecalho delimita a intencao, e o `leaseToken` prova que quem liquida e
   * quem reivindicou.
   */
  async settleNotificationIntent(
    input: SettleNotificationIntentInput,
    context?: SchedulingRequestContext,
  ): Promise<NotificationIntentSettlement> {
    const settled = await this.request(
      `/internal/notification-intents/${encodeURIComponent(input.intentId)}/settle`,
      notificationSettlementSchema,
      {
        method: "POST",
        context: context ?? {
          tenantId: input.tenantId,
          userId: CALLER_ID,
          requestId: input.intentId,
        },
        body: {
          leaseToken: input.leaseToken,
          outcome: input.outcome,
          reason: input.reason ?? undefined,
          detail: input.detail ?? undefined,
          correlationId: input.correlationId ?? undefined,
        },
      },
    );
    return settled.intent;
  }

  /**
   * Le a configuracao de lembrete do negocio (Goal021). Leitura pura: a IA
   * nunca escreve nesta rota.
   */
  async getReminderConfirmationSettings(
    context?: SchedulingRequestContext,
  ): Promise<ReminderConfirmationSettings> {
    const settings = await this.request(
      "/internal/reminder-settings",
      reminderConfirmationSettingsSchema,
      { context },
    );
    return {
      configured: settings.configured,
      confirmationEnabled: settings.confirmationEnabled,
    };
  }

  /**
   * Registra presenca confirmada. Corpo vazio de proposito: nao ha nada a
   * dizer alem de "esta pessoa confirmou", e a origem do evento e derivada
   * da credencial no dono.
   */
  async confirmAppointmentPresence(
    appointmentId: string,
    context?: SchedulingRequestContext,
    idempotencyKey?: string,
  ): Promise<AppointmentPresenceConfirmation> {
    const snapshot = await this.request(
      `/internal/appointments/${encodeURIComponent(appointmentId)}/presence`,
      appointmentPresenceSchema,
      { method: "POST", context, idempotencyKey, body: {} },
    );
    return {
      appointmentId: snapshot.id,
      status: snapshot.status,
      presenceConfirmedAt: snapshot.presenceConfirmedAt,
      completedAt: snapshot.completedAt,
      noShowAt: snapshot.noShowAt,
    };
  }

  /**
   * Le a antecedencia minima do cliente (Goal073). Mesmo endpoint de
   * Configuracoes; o schema decodifica so o campo que esta regra usa.
   */
  async getCustomerChangePolicy(
    context?: SchedulingRequestContext,
  ): Promise<CustomerChangePolicy> {
    const settings = await this.request(
      "/internal/availability-settings",
      customerChangePolicySchema,
      { context },
    );
    return { minNoticeMinutes: settings.customerChangeMinNoticeMinutes };
  }

  private async request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: {
      method?: "GET" | "POST" | "DELETE";
      body?: unknown;
      context?: SchedulingRequestContext;
      idempotencyKey?: string;
    },
  ): Promise<z.output<TSchema>> {
    const context = requireContext(options.context);
    const baseUrl = normalizeBaseUrl(env.SCHEDULING_SERVICE_BASE_URL);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json",
          // Credencial própria deste chamador/uso, distinta da que o BFF
          // apresenta e da que a IA aceita nas rotas internas.
          authorization: `Bearer ${schedulingCommandToken()}`,
          "x-service-audience": "scheduling-service",
          "x-tenant-id": context.tenantId,
          "x-user-id": context.userId,
          "x-request-id": context.requestId,
          ...(options.idempotencyKey
            ? { "idempotency-key": options.idempotencyKey }
            : {}),
          ...(options.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        body:
          options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      // Timeout (AbortSignal) ou rede indisponivel: nunca falha de dominio,
      // sempre infraestrutura. O detalhe real (nome/mensagem da excecao) so
      // interessa ao log.
      throw new InfrastructureError(
        "Scheduling Service request failed before receiving a response.",
        {
          code: isTimeoutError(error)
            ? "SCHEDULING_TIMEOUT"
            : "SCHEDULING_UNAVAILABLE",
          details: toDetailMessage(error),
        },
      );
    }
    const text = await response.text();
    const payload = text ? parseJson(text) : null;
    if (!response.ok) {
      const upstream = extractUpstreamError(payload);
      // Classificacao pelo status e pelo codigo da resposta, nunca pelo
      // texto: 5xx (ou corpo de erro que nao decodifica) e sempre
      // infraestrutura; 4xx com codigo decodificavel e sempre dominio, e o
      // codigo chega ao modelo como o Scheduling o descreveu.
      if (response.status >= 500) {
        throw new InfrastructureError(upstream.message, {
          code: "SCHEDULING_UPSTREAM_UNAVAILABLE",
          statusCode: 502,
          details: { upstreamStatus: response.status, upstreamCode: upstream.code },
        });
      }
      throw new DomainError(upstream.message, {
        code: upstream.code,
        statusCode: response.status,
        details: upstream.details,
      });
    }
    const parsed = z.object({ data: z.unknown() }).safeParse(payload);
    if (!parsed.success) {
      throw new InfrastructureError(
        "Scheduling Service returned an invalid response.",
        { code: "SCHEDULING_INVALID_RESPONSE", statusCode: 502 },
      );
    }
    const body = schema.safeParse(parsed.data.data);
    if (!body.success) {
      // Payload decodifica como JSON mas nao respeita o contrato (campo
      // obrigatorio ausente, tipo errado): resposta invalida, nunca um
      // valor inventado para preencher a lacuna.
      throw new InfrastructureError(
        "Scheduling Service returned a response that does not match the expected contract.",
        {
          code: "SCHEDULING_INVALID_RESPONSE",
          statusCode: 502,
          details: body.error.issues,
        },
      );
    }
    return body.data;
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  return /^https?:\/\//u.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function requireContext(
  context: SchedulingRequestContext | undefined,
): SchedulingRequestContext {
  if (!context?.tenantId || !context.userId || !context.requestId) {
    throw new InfrastructureError("Trusted scheduling context is required.", {
      code: "SCHEDULING_CONTEXT_REQUIRED",
      statusCode: 500,
    });
  }
  if (!schedulingCommandToken()) {
    throw new InfrastructureError(
      "Scheduling Service authentication is not configured.",
      { code: "SCHEDULING_AUTH_NOT_CONFIGURED", statusCode: 500 },
    );
  }
  return context;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function toDetailMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function schedulingCommandToken(): string {
  if (env.SCHEDULING_SERVICE_COMMAND_TOKEN) {
    return env.SCHEDULING_SERVICE_COMMAND_TOKEN;
  }
  if (!env.INTERNAL_SERVICE_TOKEN) return "";
  return deriveInternalToken(
    env.INTERNAL_SERVICE_TOKEN,
    CALLER_ID,
    "scheduling-service",
    "command",
  );
}

function toService(
  service: z.output<typeof serviceSchema>,
): SchedulingServiceDefinition {
  return {
    id: service.id,
    name: service.name,
    duration: service.durationMinutes,
    priceType: service.priceType,
    price: service.price,
    colorId: service.colorId ?? null,
    recurrenceIntervalDays: service.recurrenceIntervalDays ?? null,
  };
}

function toAppointment(
  appointment: z.output<typeof appointmentSchema>,
): SchedulingAppointment {
  const services = appointment.services.map((service) => ({
    serviceId: service.serviceId,
    name: service.name,
    duration: service.durationMinutes,
    priceType: service.priceType,
    price: service.price,
  }));
  return {
    id: appointment.id,
    title: appointment.title,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    duration: appointment.durationMinutes,
    customerId: appointment.customerId,
    customer: appointment.customer
      ? {
          id: appointment.customer.id,
          name: appointment.customer.name,
          phone: appointment.customer.phone,
        }
      : null,
    services,
    price: appointment.totalPrice,
    totalPriceType: appointment.totalPriceType,
    comments: appointment.comments,
    status: appointment.status,
    serviceId: services[0]?.serviceId ?? null,
    serviceIds: services.map((service) => service.serviceId),
    serviceName: services.map((service) => service.name).join(", ") || null,
    customerName: appointment.customer?.name ?? null,
  };
}

function toHold(hold: z.output<typeof holdSchema>): SchedulingHold {
  return {
    id: hold.id,
    date: hold.date,
    startTime: hold.startTime,
    endTime: hold.endTime,
    duration: hold.durationMinutes,
    serviceIds: hold.serviceIds,
    expiresAt: hold.expiresAt,
    status: hold.status,
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractUpstreamError(value: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  const parsed = z
    .object({
      error: z.object({
        code: z.string(),
        message: z.string(),
        // Repassado tal como o dono descreveu (ex.: `minNoticeMinutes` do
        // Goal073). Ausente na maioria dos erros de dominio, e isso e o
        // caso normal, nao uma decodificacao falha.
        details: z.unknown().optional(),
      }),
    })
    .safeParse(value);
  return parsed.success
    ? parsed.data.error
    : {
        code: "SCHEDULING_UPSTREAM_ERROR",
        message: "Scheduling Service request failed.",
      };
}

export interface AvailabilityQueryOptions {
  /** Dias a partir de `startDate` (1 a 14); sem ele, 14. */
  days?: number;
}

/**
 * Oferta espalhada pelo periodo: ate `maxDays` dias com horario e, em cada
 * um, ate `perDay` horarios distribuidos do comeco ao fim do dia (o primeiro,
 * o ultimo e os do meio), na ordem do motor. Assim a cliente que pediu "essa
 * semana" ve dias diferentes, e a que pediu "a tarde" encontra a tarde.
 */
export function spreadSlotsAcrossDays<T extends { date: string }>(
  slots: T[],
  options: { maxDays: number; perDay: number },
): T[] {
  const byDay = new Map<string, T[]>();
  for (const slot of slots) {
    const day = byDay.get(slot.date);
    if (day) day.push(slot);
    else if (byDay.size < options.maxDays) byDay.set(slot.date, [slot]);
  }
  const offer: T[] = [];
  for (const day of byDay.values()) {
    if (day.length <= options.perDay) {
      offer.push(...day);
      continue;
    }
    const picked = new Set<number>();
    for (let index = 0; index < options.perDay; index += 1) {
      picked.add(
        Math.round((index * (day.length - 1)) / (options.perDay - 1)),
      );
    }
    for (const index of [...picked].sort((a, b) => a - b)) {
      offer.push(day[index]);
    }
  }
  return offer;
}
