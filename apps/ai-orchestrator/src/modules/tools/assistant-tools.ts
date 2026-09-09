import type { StructuredToolInterface } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import {
  isOperationalKnowledgeQuery,
  type KnowledgeVectorStore,
} from "../knowledge/knowledge-vector-store.js";
import {
  SchedulingClient,
  type SchedulingGateway,
} from "../scheduling-service/client.js";
import type {
  SchedulingAppointment,
  SchedulingRequestContext,
} from "../scheduling-service/types.js";
import type { BusinessContext } from "../tenant-config/business-context.js";
export interface ToolExecutionContext {
  conversationId: string;
  tenantId: string;
  channelId: string;
  userId: string;
  requestId: string;
  phone: string;
  customerName?: string | null;
  businessContext: BusinessContext;
  aiRunId: string;
  toolCallId: string;
  idempotencyKey: string;
}

export type ToolBindingContext = Omit<
  ToolExecutionContext,
  "idempotencyKey" | "toolCallId"
>;

export interface AssistantToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface ToolResultContext {
  requestId: string;
  tenantId: string;
  aiRunId: string;
  toolCallId: string;
  idempotencyKey: string;
}

export type StructuredToolResult<T> =
  | (ToolResultContext & { ok: true; data: T })
  | (ToolResultContext & {
      ok: false;
      error: { code: string; message: string; details?: unknown };
    });

type PendingAction =
  | {
      type: "schedule";
      serviceId: string;
      serviceIds?: string[];
      services?: ServiceSummary[];
      date: string;
      startTime: string;
      endTime?: string;
      totalDurationMinutes?: number;
      totalPrice?: number | null;
      totalPriceType?: AgreementTotalType;
      customerName: string;
      customerPhone: string;
      /** Pessoa resolvida. Ausente => o cadastro nasce na confirmacao. */
      customerId?: string | null;
      /** Candidato unico proposto: precisa de confirmacao da pessoa. */
      proposedCustomerId?: string | null;
      idempotencyKey: string;
    }
  | {
      type: "cancel";
      appointmentId: string;
      idempotencyKey: string;
    }
  | {
      type: "reschedule";
      appointmentId: string;
      date: string;
      startTime: string;
      idempotencyKey: string;
    };

type ServicePriceType = "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";

interface ServiceSummary {
  id: string;
  name: string;
  duration: number;
  priceType: ServicePriceType;
  price: number | null;
}

interface AvailabilityLookup {
  service: {
    id: string;
    name: string;
    duration: number;
    priceType: ServicePriceType;
    price?: number | null;
  };
  services?: ServiceSummary[];
  totalDurationMinutes?: number;
  totalPrice?: number | null;
  totalPriceType?: AgreementTotalType;
  slots: Array<{
    date: string;
    startTime: string;
    endTime: string;
  }>;
  checkedAt: string;
}

const MAX_AVAILABILITY_LOOKUPS = 5;

const noArgsSchema = z.object({}).strict();
const listServicesSchema = z
  .object({ includePrices: z.boolean().optional().default(false) })
  .strict();
const availableSlotsSchema = z
  .object({
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(1).max(10).optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict()
  .refine((args) => Boolean(args.serviceId || args.serviceIds?.length), {
    message: "Informe serviceId ou serviceIds.",
  });
const createAppointmentSchema = z
  .object({
    action: z.enum(["prepare", "confirm"]),
    serviceId: z.string().min(1).nullable().optional(),
    serviceIds: z.array(z.string().min(1)).min(1).max(10).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    customerName: z.string().min(1).optional(),
    // Pessoa escolhida entre os candidatos do numero. O telefone do contato
    // nao prova de quem e o atendimento (D-005).
    customerId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .superRefine((args, context) => {
    if (args.action !== "prepare") return;
    if (!args.date) {
      context.addIssue({ code: "custom", message: "date is required" });
    }
    if (!args.startTime) {
      context.addIssue({ code: "custom", message: "startTime is required" });
    }
    if (!args.customerName) {
      context.addIssue({ code: "custom", message: "customerName is required" });
    }
  });
const cancelAppointmentSchema = z
  .object({
    action: z.enum(["prepare", "confirm"]),
    appointmentId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((args, context) => {
    if (args.action === "prepare" && !args.appointmentId) {
      context.addIssue({
        code: "custom",
        message: "appointmentId is required",
      });
    }
  });
const rescheduleAppointmentSchema = z
  .object({
    action: z.enum(["prepare", "confirm"]),
    appointmentId: z.string().min(1).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
  })
  .strict()
  .superRefine((args, context) => {
    if (args.action !== "prepare") return;
    for (const [path, value] of [
      ["appointmentId", args.appointmentId],
      ["date", args.date],
      ["startTime", args.startTime],
    ] as const) {
      if (!value) {
        context.addIssue({
          code: "custom",
          message: `${path} is required`,
          path: [path],
        });
      }
    }
  });
const handoffSchema = z
  .object({
    reason: z.string().min(3),
    summary: z.string().optional(),
  })
  .strict();
const customerContextSchema = z
  .object({ customerId: z.string().min(1) })
  .strict();
const searchKnowledgeSchema = z
  .object({
    query: z.string().trim().min(2).max(500),
    limit: z.number().int().min(1).max(8).optional(),
  })
  .strict();
export class AssistantToolRegistry {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scheduling: SchedulingGateway = new SchedulingClient(),
    private readonly knowledge?: KnowledgeVectorStore,
  ) {}

  createDefinitions(context: ToolBindingContext): StructuredToolInterface[] {
    return this.createTools({
      ...context,
      toolCallId: "model-binding",
      idempotencyKey: `${context.aiRunId}:model-binding`,
    });
  }

  async execute(
    call: AssistantToolCall,
    context: ToolBindingContext,
  ): Promise<StructuredToolResult<unknown>> {
    const executionContext: ToolExecutionContext = {
      ...context,
      toolCallId: call.id,
      idempotencyKey: `${context.aiRunId}:${call.id}:${call.name}`,
    };
    const selected = this.createTools(executionContext).find(
      (candidate) => candidate.name === call.name,
    );
    if (!selected) {
      return this.failure(
        executionContext,
        "UNKNOWN_TOOL",
        `Unknown tool: ${call.name}`,
      );
    }

    try {
      const result: unknown = await selected.invoke(call.args);
      return isStructuredToolResult(result)
        ? result
        : this.failure(
            executionContext,
            "INVALID_TOOL_RESULT",
            `Tool ${call.name} returned an invalid result.`,
          );
    } catch (error) {
      return this.failure(
        executionContext,
        "INVALID_TOOL_INPUT",
        error instanceof Error ? error.message : "Invalid tool input.",
      );
    }
  }

  private createTools(
    context: ToolExecutionContext,
  ): StructuredToolInterface[] {
    const tools: StructuredToolInterface[] = [
      tool(
        (args) => this.run(context, () => this.listServices(args, context)),
        {
          name: "list_services",
          description:
            "Lista servicos reais da fonte oficial do tenant via Scheduling Service. Inclua precos somente quando a cliente perguntou por valores.",
          schema: listServicesSchema,
        },
      ),
      tool(
        (args) =>
          this.run(context, () => this.findAvailableSlots(args, context)),
        {
          name: "get_availability",
          description:
            "Busca disponibilidade real para um ou mais serviceIds retornados por list_services. Multiplos servicos usam bloco continuo.",
          schema: availableSlotsSchema,
        },
      ),
      tool(
        async (args) => {
          if (args.action === "confirm") {
            return this.run(context, () => this.confirmSchedule(context));
          }
          return this.run(context, () =>
            this.prepareSchedule(
              {
                serviceId: args.serviceId,
                serviceIds: args.serviceIds,
                date: requireString(args.date, "date"),
                startTime: requireString(args.startTime, "startTime"),
                customerName: requireString(args.customerName, "customerName"),
                customerId: args.customerId ?? null,
              },
              context,
            ),
          );
        },
        {
          name: "create_appointment",
          description:
            "Prepara ou confirma agendamento. Use action=prepare antes de pedir confirmacao; action=confirm somente apos confirmacao clara da cliente. Quando o numero tiver mais de uma pessoa cadastrada, pergunte para quem e o atendimento e reenvie prepare com customerId.",
          schema: createAppointmentSchema,
        },
      ),
      tool(
        (args) => {
          noArgsSchema.parse(args);
          return this.run(context, () => this.listCustomerCandidates(context));
        },
        {
          name: "list_customer_candidates",
          description:
            "Lista as pessoas ja cadastradas para o numero deste contato. Zero, uma ou varias: o numero nao prova de quem e o atendimento.",
          schema: noArgsSchema,
        },
      ),
      tool(
        (args) =>
          this.run(context, () =>
            this.getAuthorizedCustomerContext(args, context),
          ),
        {
          name: "get_customer_context",
          description:
            "Observacoes e tags de uma pessoa que estao autorizadas para uso pela IA. O que nao foi autorizado nao existe para esta ferramenta.",
          schema: customerContextSchema,
        },
      ),
      tool(
        (args) => {
          noArgsSchema.parse(args);
          return this.run(context, () =>
            this.findCustomerAppointments(context),
          );
        },
        {
          name: "list_customer_appointments",
          description:
            "Lista agendamentos futuros reais da cliente identificada pelo telefone do WhatsApp.",
          schema: noArgsSchema,
        },
      ),
      tool(
        async (args) => {
          if (args.action === "confirm") {
            return this.run(context, () => this.rescheduleAppointment(context));
          }
          return this.run(context, () =>
            this.prepareReschedule(
              {
                appointmentId: requireString(
                  args.appointmentId,
                  "appointmentId",
                ),
                date: requireString(args.date, "date"),
                startTime: requireString(args.startTime, "startTime"),
              },
              context,
            ),
          );
        },
        {
          name: "reschedule_appointment",
          description:
            "Prepara ou confirma remarcacao. Use action=prepare antes de pedir confirmacao; action=confirm somente apos confirmacao clara.",
          schema: rescheduleAppointmentSchema,
        },
      ),
      tool(
        async (args) => {
          if (args.action === "confirm") {
            return this.run(context, () => this.cancelAppointment(context));
          }
          return this.run(context, () =>
            this.prepareCancel(
              {
                appointmentId: requireString(
                  args.appointmentId,
                  "appointmentId",
                ),
              },
              context,
            ),
          );
        },
        {
          name: "cancel_appointment",
          description:
            "Prepara ou confirma cancelamento. Use action=prepare antes de pedir confirmacao; action=confirm somente apos confirmacao clara.",
          schema: cancelAppointmentSchema,
        },
      ),
      tool(
        (args) => this.run(context, () => this.createHandoff(args, context)),
        {
          name: "request_human_handoff",
          description:
            "Abre handoff e pausa automacao para uma pessoa assumir a conversa.",
          schema: handoffSchema,
        },
      ),
    ];
    if (this.knowledge) {
      tools.push(
        tool(
          (args) =>
            this.run(context, () =>
              this.searchBusinessKnowledge(args, context),
            ),
          {
            name: "search_business_knowledge",
            description:
              "Busca conhecimento textual configurado do tenant para FAQ, orientacoes, cuidados, procedimentos e politicas. Nunca use para preco atual, servico ativo, agenda, disponibilidade, appointment ou status de integracao.",
            schema: searchKnowledgeSchema,
          },
        ),
      );
    }
    return tools;
  }

  private async searchBusinessKnowledge(
    args: z.infer<typeof searchKnowledgeSchema>,
    context: ToolExecutionContext,
  ) {
    if (!this.knowledge) throw new Error("Knowledge store is unavailable.");
    if (isOperationalKnowledgeQuery(args.query)) {
      throw new AppError("Use Scheduling tools for operational data.", {
        statusCode: 400,
        code: "KNOWLEDGE_QUERY_NOT_ALLOWED",
      });
    }
    const matches = await this.knowledge.search({
      tenantId: context.tenantId,
      query: args.query,
      limit: args.limit ?? env.KNOWLEDGE_SEARCH_LIMIT,
    });
    return {
      matches: matches.map((match) => ({
        type: match.type,
        title: match.title,
        source: match.source,
        version: match.version,
        content: match.content,
        metadata: match.metadata,
      })),
    };
  }

  private async run<T>(
    context: ToolExecutionContext,
    operation: () => Promise<T>,
  ): Promise<StructuredToolResult<T>> {
    try {
      const data = await operation();
      if (isDomainFailure(data)) {
        return this.failure(
          context,
          data.code ?? "TOOL_OPERATION_FAILED",
          data.error,
          data.details,
        );
      }
      return { ...resultContext(context), ok: true, data };
    } catch (error) {
      return this.failure(
        context,
        error instanceof AppError ? error.code : "TOOL_EXECUTION_FAILED",
        error instanceof Error ? error.message : "Unknown tool error",
        error instanceof AppError ? error.details : undefined,
      );
    }
  }

  private failure(
    context: ToolExecutionContext,
    code: string,
    message: string,
    details?: unknown,
  ): StructuredToolResult<never> {
    return {
      ...resultContext(context),
      ok: false,
      error: { code, message, ...(details === undefined ? {} : { details }) },
    };
  }

  private async listServices(
    args: z.infer<typeof listServicesSchema>,
    context: ToolExecutionContext,
  ) {
    const services = await this.scheduling.listActiveServices(
      schedulingContext(context),
    );
    return {
      // `priceType` sempre presente: "sob consulta" e "nao informado" nao
      // dependem de `includePrices` para serem comunicados. O flag so
      // controla se o valor numerico (quando existe) e revelado.
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        duration: service.duration,
        durationMinutes: service.duration,
        priceType: service.priceType,
        ...(args.includePrices &&
        (service.priceType === "FIXED" || service.priceType === "STARTING_AT")
          ? { price: service.price }
          : {}),
        colorId: service.colorId,
      })),
    };
  }

  private async findAvailableSlots(
    args: z.infer<typeof availableSlotsSchema>,
    context: ToolExecutionContext,
  ) {
    const serviceResult = await this.resolveServicesFromExplicitIds({
      serviceId: args.serviceId,
      serviceIds: args.serviceIds,
      context,
    });
    if (!serviceResult.ok) return serviceResult;

    const slots = await this.scheduling.getAvailableSlotsForServices(
      serviceResult.serviceIds,
      args.startDate,
      context.businessContext,
      schedulingContext(context),
    );
    await this.rememberAvailabilityLookup(context.conversationId, {
      service: serviceResult.services[0],
      services: serviceResult.services,
      totalDurationMinutes: serviceResult.totalDurationMinutes,
      totalPrice: serviceResult.totalPrice,
      totalPriceType: serviceResult.totalPriceType,
      slots,
      checkedAt: new Date().toISOString(),
    });

    return {
      services: serviceResult.services,
      totalDurationMinutes: serviceResult.totalDurationMinutes,
      totalPrice: serviceResult.totalPrice,
      totalPriceType: serviceResult.totalPriceType,
      slots,
    };
  }

  /**
   * Candidatos para o número deste contato.
   *
   * O número não prova identidade: pode não haver pessoa nenhuma, pode haver
   * uma (que a IA propõe e pede confirmação) ou várias (a IA pergunta para
   * quem é o atendimento).
   */
  private async listCustomerCandidates(context: ToolExecutionContext) {
    const candidates = await this.scheduling.findCustomerCandidatesByPhone(
      context.phone,
      schedulingContext(context),
    );
    return {
      candidates: candidates.map((candidate) => ({
        customerId: candidate.id,
        name: candidate.name,
      })),
      // Um só candidato é proposta, nunca certeza.
      requiresConfirmation: candidates.length > 0,
    };
  }

  private async getAuthorizedCustomerContext(
    args: { customerId: string },
    context: ToolExecutionContext,
  ) {
    return this.scheduling.getAuthorizedCustomerContext(
      args.customerId,
      schedulingContext(context),
    );
  }

  private async prepareSchedule(
    args: {
      serviceId?: string | null;
      serviceIds?: string[];
      date: string;
      startTime: string;
      customerName: string;
      customerId?: string | null;
    },
    context: ToolExecutionContext,
  ) {
    const serviceResult = await this.resolveScheduleServices({
      conversationId: context.conversationId,
      serviceId: args.serviceId,
      serviceIds: args.serviceIds,
      date: args.date,
      startTime: args.startTime,
      context,
    });
    if (!serviceResult.ok) return serviceResult;

    const identity = await this.resolveScheduleCustomer(args, context);
    if ("ok" in identity) return identity;

    const pending: PendingAction = {
      type: "schedule",
      serviceId: serviceResult.serviceIds[0],
      serviceIds: serviceResult.serviceIds,
      services: serviceResult.services,
      date: args.date,
      startTime: args.startTime,
      endTime: addMinutesToTime(
        args.startTime,
        serviceResult.totalDurationMinutes,
      ),
      totalDurationMinutes: serviceResult.totalDurationMinutes,
      totalPrice: serviceResult.totalPrice,
      totalPriceType: serviceResult.totalPriceType,
      customerName: args.customerName,
      customerPhone: context.phone,
      customerId: identity.customerId,
      proposedCustomerId: identity.proposedCustomerId,
      idempotencyKey: context.idempotencyKey,
    };
    await this.setPendingAction(context.conversationId, pending);
    return {
      requiresConfirmation: true,
      pendingAction: pending,
      customerIdentity: identity,
    };
  }

  /**
   * Para quem é o atendimento.
   *
   * `customerId` escolhido pela conversa vence. Sem escolha, os candidatos do
   * número decidem o que perguntar: vários exigem seleção explícita antes de
   * seguir; um vira proposta a confirmar; nenhum significa cadastro novo, que
   * só nasce na confirmação do agendamento.
   */
  private async resolveScheduleCustomer(
    args: { customerId?: string | null },
    context: ToolExecutionContext,
  ): Promise<
    | {
        customerId: string | null;
        proposedCustomerId: string | null;
        candidates: Array<{ customerId: string; name: string | null }>;
      }
    | {
        ok: false;
        code: string;
        error: string;
        details: {
          candidates: Array<{ customerId: string; name: string | null }>;
        };
      }
  > {
    const candidates = (
      await this.scheduling.findCustomerCandidatesByPhone(
        context.phone,
        schedulingContext(context),
      )
    ).map((candidate) => ({
      customerId: candidate.id,
      name: candidate.name,
    }));

    if (args.customerId) {
      return {
        customerId: args.customerId,
        proposedCustomerId: null,
        candidates,
      };
    }
    if (candidates.length > 1) {
      return {
        ok: false,
        code: "CUSTOMER_IDENTITY_AMBIGUOUS",
        error:
          "Esse numero tem mais de uma pessoa cadastrada. Pergunte para quem e o atendimento e reenvie prepare com customerId.",
        details: { candidates },
      };
    }
    if (candidates.length === 1) {
      // Proposta, não certeza: a pessoa ainda precisa confirmar que é ela.
      return {
        customerId: null,
        proposedCustomerId: candidates[0].customerId,
        candidates,
      };
    }
    return { customerId: null, proposedCustomerId: null, candidates };
  }

  private async confirmSchedule(context: ToolExecutionContext) {
    const pending = await this.getPendingAction(context.conversationId);
    if (!pending || pending.type !== "schedule") {
      return {
        ok: false,
        error: "Nao ha agendamento pendente para confirmar.",
      };
    }

    const serviceResult = await this.resolveScheduleServices({
      conversationId: context.conversationId,
      serviceId: pending.serviceId,
      serviceIds: pending.serviceIds,
      date: pending.date,
      startTime: pending.startTime,
      context,
    });
    if (!serviceResult.ok) return serviceResult;

    // A confirmação do agendamento é também a confirmação de para quem ele é:
    // o candidato único proposto no `prepare` só vira a pessoa do agendamento
    // aqui, depois de a cliente confirmar. Sem pessoa resolvida, o cadastro
    // nasce no Scheduling dentro da transação de confirmação.
    const resolvedCustomerId =
      pending.customerId ?? pending.proposedCustomerId ?? null;
    const appointment = await this.scheduling.createAppointment(
      {
        serviceId: serviceResult.serviceIds[0],
        serviceIds: serviceResult.serviceIds,
        date: pending.date,
        startTime: pending.startTime,
        customerId: resolvedCustomerId,
        customerName: resolvedCustomerId ? null : pending.customerName,
        customerPhone: resolvedCustomerId ? null : pending.customerPhone,
        comments: buildAppointmentComment(serviceResult.services),
      },
      schedulingContext(context),
      pending.idempotencyKey || context.idempotencyKey,
    );

    await this.linkContactToCustomer(context, appointment.customerId);
    await this.clearPendingAction(context.conversationId);
    return { appointment: this.presentAppointment(appointment) };
  }

  /**
   * Contato do canal passa a referenciar a pessoa atendida.
   *
   * A referência é por ID e tenant, sem FK entre bancos, e pode mudar ao longo
   * do tempo — a mãe que agenda para o filho e depois para si mesma continua
   * sendo **um** contato, apontando ora para uma pessoa, ora para outra.
   * Nenhum contato e nenhum cliente é fundido por causa disso.
   */
  private async linkContactToCustomer(
    context: ToolExecutionContext,
    customerId: string | null,
  ): Promise<void> {
    if (!customerId) return;
    await this.prisma.contact.updateMany({
      where: {
        tenantId: context.tenantId,
        channelId: context.channelId,
        externalContactId: context.phone,
      },
      data: { customerId, customerLinkedAt: new Date() },
    });
  }

  private async linkedCustomerId(
    context: ToolExecutionContext,
  ): Promise<string | null> {
    const contact = await this.prisma.contact.findUnique({
      where: {
        tenantId_channelId_externalContactId: {
          tenantId: context.tenantId,
          channelId: context.channelId,
          externalContactId: context.phone,
        },
      },
      select: { customerId: true },
    });
    return contact?.customerId ?? null;
  }

  /**
   * Compromissos futuros do contato.
   *
   * Quando o contato ja esta vinculado a uma pessoa (confirmacao de
   * agendamento anterior), a consulta e por `customerId` — o historico e
   * dessa pessoa, nao de "todo mundo que compartilha o numero". Sem vinculo,
   * cai nos candidatos por telefone, que a IA deve tratar como candidatos.
   */
  private async findCustomerAppointments(context: ToolExecutionContext) {
    const linkedCustomerId = await this.linkedCustomerId(context);
    const appointments = linkedCustomerId
      ? await this.scheduling.findFutureAppointmentsForCustomer(
          linkedCustomerId,
          context.businessContext,
          schedulingContext(context),
        )
      : await this.scheduling.findFutureAppointmentsForPhone(
          context.phone,
          context.businessContext,
          schedulingContext(context),
        );
    return {
      appointments: appointments.map((appointment) =>
        this.presentAppointment(appointment),
      ),
    };
  }

  private async prepareCancel(
    args: { appointmentId: string },
    context: ToolExecutionContext,
  ) {
    const appointments = await this.scheduling.findFutureAppointmentsForPhone(
      context.phone,
      context.businessContext,
      schedulingContext(context),
    );
    const appointment = appointments.find(
      (item) => item.id === args.appointmentId,
    );
    if (!appointment) {
      return {
        ok: false,
        error: "Agendamento nao encontrado para esse telefone.",
      };
    }

    const pending: PendingAction = {
      type: "cancel",
      appointmentId: args.appointmentId,
      idempotencyKey: context.idempotencyKey,
    };
    await this.setPendingAction(context.conversationId, pending);
    return {
      requiresConfirmation: true,
      appointment: this.presentAppointment(appointment),
    };
  }

  private async cancelAppointment(context: ToolExecutionContext) {
    const pending = await this.getPendingAction(context.conversationId);
    if (!pending || pending.type !== "cancel") {
      return {
        ok: false,
        error: "Nao ha cancelamento pendente para confirmar.",
      };
    }

    const result = await this.scheduling.cancelAppointment(
      pending.appointmentId,
      schedulingContext(context),
      pending.idempotencyKey || context.idempotencyKey,
    );
    await this.clearPendingAction(context.conversationId);
    return result;
  }

  private async prepareReschedule(
    args: { appointmentId: string; date: string; startTime: string },
    context: ToolExecutionContext,
  ) {
    const appointments = await this.scheduling.findFutureAppointmentsForPhone(
      context.phone,
      context.businessContext,
      schedulingContext(context),
    );
    const appointment = appointments.find(
      (item) => item.id === args.appointmentId,
    );
    if (!appointment) {
      return {
        ok: false,
        error: "Agendamento nao encontrado para esse telefone.",
      };
    }

    const pending: PendingAction = {
      type: "reschedule",
      appointmentId: args.appointmentId,
      date: args.date,
      startTime: args.startTime,
      idempotencyKey: context.idempotencyKey,
    };
    await this.setPendingAction(context.conversationId, pending);
    return {
      requiresConfirmation: true,
      currentAppointment: this.presentAppointment(appointment),
      newDate: args.date,
      newStartTime: args.startTime,
    };
  }

  private async rescheduleAppointment(context: ToolExecutionContext) {
    const pending = await this.getPendingAction(context.conversationId);
    if (!pending || pending.type !== "reschedule") {
      return { ok: false, error: "Nao ha remarcacao pendente para confirmar." };
    }

    const appointment = await this.scheduling.rescheduleAppointment(
      {
        appointmentId: pending.appointmentId,
        date: pending.date,
        startTime: pending.startTime,
      },
      schedulingContext(context),
      pending.idempotencyKey || context.idempotencyKey,
    );

    await this.clearPendingAction(context.conversationId);
    return { appointment: this.presentAppointment(appointment) };
  }

  private async createHandoff(
    args: z.infer<typeof handoffSchema>,
    context: ToolExecutionContext,
  ) {
    const existing = await this.prisma.handoff.findFirst({
      where: {
        tenantId: context.tenantId,
        channelId: context.channelId,
        conversationId: context.conversationId,
        status: "OPEN",
      },
      orderBy: { createdAt: "desc" },
    });
    const handoff =
      existing ??
      (await this.prisma.handoff.create({
        data: {
          tenantId: context.tenantId,
          channelId: context.channelId,
          conversationId: context.conversationId,
          externalContactId: context.phone,
          reason: args.reason,
          summary: args.summary ?? null,
          status: "OPEN",
        },
      }));

    const state = await this.getConversationState(context.conversationId);
    await this.prisma.conversation.update({
      where: { id: context.conversationId },
      data: {
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: null,
        state: {
          ...state,
          aiConversation: {
            ...(isRecord(state.aiConversation) ? state.aiConversation : {}),
            aiEnabledForChat: false,
            stage: "HUMAN_HANDOFF",
            pauseReason: args.reason,
          },
        } as Prisma.InputJsonValue,
      },
    });

    return { handoffId: handoff.id, reused: existing !== null };
  }

  private async getPendingAction(
    conversationId: string,
  ): Promise<PendingAction | null> {
    const state = await this.getConversationState(conversationId);
    return state.pendingAction ?? null;
  }

  private async setPendingAction(
    conversationId: string,
    pendingAction: PendingAction,
  ): Promise<void> {
    const state = await this.getConversationState(conversationId);
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { state: { ...state, pendingAction } as Prisma.InputJsonValue },
    });
  }

  private async clearPendingAction(conversationId: string): Promise<void> {
    const state = await this.getConversationState(conversationId);
    delete state.pendingAction;
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { state: state as Prisma.InputJsonValue },
    });
  }

  private async resolveScheduleServices(input: {
    conversationId: string;
    serviceId?: string | null;
    serviceIds?: string[];
    date: string;
    startTime: string;
    context: ToolExecutionContext;
  }): Promise<
    | {
        ok: true;
        serviceIds: string[];
        services: ServiceSummary[];
        totalDurationMinutes: number;
        totalPrice: number | null;
        totalPriceType: AgreementTotalType;
      }
    | { ok: false; code: string; error: string }
  > {
    const explicit = await this.resolveServicesFromExplicitIds({
      serviceId: input.serviceId,
      serviceIds: input.serviceIds,
      context: input.context,
    });
    if (explicit.ok) return explicit;
    if (input.serviceId || input.serviceIds?.length) return explicit;

    const candidates = this.findAvailabilityCandidates(
      await this.getConversationState(input.conversationId),
      input.date,
      input.startTime,
    );
    if (candidates.length === 1) {
      return this.resolveServicesFromExplicitIds({
        serviceIds: getLookupServices(candidates[0]).map(
          (service) => service.id,
        ),
        context: input.context,
      });
    }

    if (candidates.length > 1) {
      return {
        ok: false,
        code: "SERVICE_ID_AMBIGUOUS",
        error:
          "Nao consegui identificar com seguranca qual servico deve ser agendado. Confirme o servico antes de finalizar.",
      };
    }

    return {
      ok: false,
      code: "SERVICE_ID_UNRESOLVED",
      error:
        "Nao consegui identificar um servico valido para esse agendamento. Consulte os servicos/horarios novamente antes de confirmar.",
    };
  }

  private async resolveServicesFromExplicitIds(input: {
    serviceId?: string | null;
    serviceIds?: string[];
    context: ToolExecutionContext;
  }): Promise<
    | {
        ok: true;
        serviceIds: string[];
        services: ServiceSummary[];
        totalDurationMinutes: number;
        totalPrice: number | null;
        totalPriceType: AgreementTotalType;
      }
    | { ok: false; code: string; error: string }
  > {
    const serviceIds = normalizeServiceIds(
      input.serviceIds?.length
        ? input.serviceIds
        : input.serviceId
          ? [input.serviceId]
          : [],
    );
    if (serviceIds.length === 0) {
      return {
        ok: false,
        code: "SERVICE_ID_UNRESOLVED",
        error:
          "Nao consegui identificar um servico valido para esse agendamento. Consulte os servicos/horarios novamente antes de confirmar.",
      };
    }

    try {
      const services = await Promise.all(
        serviceIds.map((serviceId) =>
          this.scheduling.findService(
            serviceId,
            schedulingContext(input.context),
          ),
        ),
      );
      const summaries = services.map(toServiceSummary);
      const total = calculateAgreementTotal(summaries);
      return {
        ok: true,
        serviceIds: summaries.map((service) => service.id),
        services: summaries,
        totalDurationMinutes: calculateServiceBlockMinutes(summaries),
        totalPrice: total.amount,
        totalPriceType: total.type,
      };
    } catch (error) {
      return {
        ok: false,
        code: "SERVICE_NOT_FOUND",
        error:
          error instanceof Error
            ? error.message
            : "Servico nao encontrado na fonte oficial.",
      };
    }
  }

  private async rememberAvailabilityLookup(
    conversationId: string,
    lookup: AvailabilityLookup,
  ): Promise<void> {
    const state = await this.getConversationState(conversationId);
    const lookups = [
      lookup,
      ...this.getAvailabilityLookups(state).filter(
        (item) => getLookupKey(item) !== getLookupKey(lookup),
      ),
    ].slice(0, MAX_AVAILABILITY_LOOKUPS);

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        state: {
          ...state,
          availabilityLookups: lookups,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getConversationState(
    conversationId: string,
  ): Promise<Record<string, unknown> & { pendingAction?: PendingAction }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    const state = conversation?.state;
    if (!state || typeof state !== "object" || Array.isArray(state)) return {};
    return { ...(state as Record<string, unknown>) };
  }

  private findAvailabilityCandidates(
    state: Record<string, unknown>,
    date: string,
    startTime: string,
  ): AvailabilityLookup[] {
    const candidates = new Map<string, AvailabilityLookup>();
    for (const lookup of this.getAvailabilityLookups(state)) {
      if (
        lookup.slots.some(
          (slot) => slot.date === date && slot.startTime === startTime,
        )
      ) {
        candidates.set(getLookupKey(lookup), lookup);
      }
    }
    return [...candidates.values()];
  }

  private getAvailabilityLookups(
    state: Record<string, unknown>,
  ): AvailabilityLookup[] {
    const value = state.availabilityLookups;
    if (!Array.isArray(value)) return [];
    return value.filter(isAvailabilityLookup);
  }

  private presentAppointment(appointment: SchedulingAppointment) {
    const services = appointment.services.map((service) => ({
      id: service.serviceId,
      name: service.name,
      duration: service.duration,
      price: service.price,
    }));

    return {
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      serviceName:
        appointment.serviceName ??
        appointment.services.map((service) => service.name).join(", "),
      serviceNames:
        services.length > 0
          ? services.map((service) => service.name)
          : undefined,
      serviceIds: appointment.serviceIds,
      totalDurationMinutes: appointment.duration,
      totalPrice: appointment.price,
      customerName:
        appointment.customerName ?? appointment.customer?.name ?? null,
    };
  }
}

function resultContext(context: ToolExecutionContext): ToolResultContext {
  return {
    requestId: context.requestId,
    tenantId: context.tenantId,
    aiRunId: context.aiRunId,
    toolCallId: context.toolCallId,
    idempotencyKey: context.idempotencyKey,
  };
}

function requireString(value: string | undefined, field: string): string {
  if (value) return value;
  throw new AppError(`${field} is required.`, {
    statusCode: 400,
    code: "INVALID_TOOL_INPUT",
  });
}

function isDomainFailure(
  value: unknown,
): value is { ok: false; code?: string; error: string; details?: unknown } {
  return (
    isRecord(value) &&
    value.ok === false &&
    typeof value.error === "string" &&
    (value.code === undefined || typeof value.code === "string")
  );
}

function isStructuredToolResult(
  value: unknown,
): value is StructuredToolResult<unknown> {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  return (
    typeof value.requestId === "string" &&
    typeof value.tenantId === "string" &&
    typeof value.aiRunId === "string" &&
    typeof value.toolCallId === "string" &&
    typeof value.idempotencyKey === "string" &&
    (value.ok ||
      (isRecord(value.error) &&
        typeof value.error.code === "string" &&
        typeof value.error.message === "string"))
  );
}

function normalizeServiceIds(serviceIds: string[]): string[] {
  return [...new Set(serviceIds.map((id) => id.trim()).filter(Boolean))];
}

function toServiceSummary(service: {
  id: string;
  name: string;
  duration: number;
  priceType: ServicePriceType;
  price: number | null;
}): ServiceSummary {
  return {
    id: service.id,
    name: service.name,
    duration: service.duration,
    priceType: service.priceType,
    price: service.price,
  };
}

function schedulingContext(
  context: ToolExecutionContext,
): SchedulingRequestContext {
  if (!context.tenantId || !context.userId || !context.requestId) {
    throw new AppError("Trusted scheduling context is required.", {
      statusCode: 500,
      code: "SCHEDULING_CONTEXT_REQUIRED",
    });
  }
  return {
    tenantId: context.tenantId,
    userId: context.userId,
    requestId: context.requestId,
  };
}

function calculateServiceBlockMinutes(services: ServiceSummary[]): number {
  const bufferMinutes =
    Math.max(0, env.AI_BUFFER_BETWEEN_SERVICES_MINUTES) *
    Math.max(0, services.length - 1);
  return (
    services.reduce((total, service) => total + service.duration, 0) +
    bufferMinutes
  );
}

type AgreementTotalType = "FIXED" | "STARTING_AT" | "NONE";

interface AgreementTotal {
  type: AgreementTotalType;
  amount: number | null;
}

/**
 * Regra unica do total (Goal007), reimplementada aqui porque IA e Scheduling
 * nao compartilham pacote de contrato para este calculo (D-011): soma quando
 * todos os itens sao `FIXED`; "a partir de" quando ha algum `STARTING_AT` e
 * nenhum `ON_REQUEST`/`NOT_INFORMED`; sem total nos demais casos.
 */
function calculateAgreementTotal(services: ServiceSummary[]): AgreementTotal {
  if (services.length === 0) return { type: "NONE", amount: null };
  const hasUnpriced = services.some(
    (service) =>
      service.priceType === "ON_REQUEST" || service.priceType === "NOT_INFORMED",
  );
  if (hasUnpriced) return { type: "NONE", amount: null };
  const amount = services.reduce(
    (total, service) => total + (service.price ?? 0),
    0,
  );
  const allFixed = services.every((service) => service.priceType === "FIXED");
  return { type: allFixed ? "FIXED" : "STARTING_AT", amount };
}

function buildAppointmentComment(services: ServiceSummary[]): string {
  const serviceNames = services.map((service) => service.name).join(" + ");
  const price = priceCommentText(services, calculateAgreementTotal(services));
  return `Criado via Atendente IA WhatsApp. Servicos: ${serviceNames}. ${price}`;
}

function priceCommentText(
  services: ServiceSummary[],
  total: AgreementTotal,
): string {
  if (total.type === "FIXED") return `Total: R$ ${(total.amount ?? 0).toFixed(2)}.`;
  if (total.type === "STARTING_AT") {
    return `A partir de R$ ${(total.amount ?? 0).toFixed(2)}.`;
  }
  const hasOnRequest = services.some(
    (service) => service.priceType === "ON_REQUEST",
  );
  return hasOnRequest ? "Valor sob consulta." : "Valor nao informado.";
}

function addMinutesToTime(startTime: string, minutes: number): string {
  const [hours = 0, mins = 0] = startTime.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const normalized = ((total % 1440) + 1440) % 1440;
  const endHours = Math.floor(normalized / 60);
  const endMinutes = normalized % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

function getLookupServices(lookup: AvailabilityLookup): ServiceSummary[] {
  if (lookup.services?.length) return lookup.services;
  return [
    {
      id: lookup.service.id,
      name: lookup.service.name,
      duration: lookup.service.duration,
      priceType: lookup.service.priceType,
      price: lookup.service.price ?? null,
    },
  ];
}

function getLookupKey(lookup: AvailabilityLookup): string {
  return getLookupServices(lookup)
    .map((service) => service.id)
    .sort()
    .join("+");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isServicePriceType(value: unknown): value is ServicePriceType {
  return (
    value === "FIXED" ||
    value === "STARTING_AT" ||
    value === "ON_REQUEST" ||
    value === "NOT_INFORMED"
  );
}

function isAvailabilityLookup(value: unknown): value is AvailabilityLookup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const lookup = value as Partial<AvailabilityLookup>;
  const service = lookup.service;
  return (
    !!service &&
    typeof service === "object" &&
    typeof service.id === "string" &&
    typeof service.name === "string" &&
    typeof service.duration === "number" &&
    isServicePriceType(service.priceType) &&
    (lookup.services === undefined ||
      (Array.isArray(lookup.services) &&
        lookup.services.every(
          (item) =>
            !!item &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.duration === "number" &&
            isServicePriceType(item.priceType) &&
            (typeof item.price === "number" || item.price === null),
        ))) &&
    Array.isArray(lookup.slots) &&
    lookup.slots.every(
      (slot) =>
        !!slot &&
        typeof slot === "object" &&
        typeof slot.date === "string" &&
        typeof slot.startTime === "string" &&
        typeof slot.endTime === "string",
    ) &&
    typeof lookup.checkedAt === "string"
  );
}
