import { randomUUID } from "node:crypto";

import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import type { BusinessSettingsDTO } from "../business-settings/business-settings.js";
import {
  SchedulingServiceClient,
  type SchedulingServiceGateway,
} from "../scheduling-service/client.js";
import type {
  SchedulingAppointment,
  SchedulingRequestContext,
} from "../scheduling-service/types.js";
import type { OpenAiToolDefinition } from "./openai-client.js";

export interface ToolExecutionContext {
  conversationId: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  phone: string;
  customerName?: string | null;
  businessSettings: BusinessSettingsDTO;
}

type PendingAction =
  | {
      type: "schedule";
      serviceId: number;
      serviceIds?: number[];
      services?: ServiceSummary[];
      date: string;
      startTime: string;
      endTime?: string;
      totalDurationMinutes?: number;
      totalPrice?: number;
      customerName: string;
      customerPhone: string;
      idempotencyKey: string;
    }
  | {
      type: "cancel";
      appointmentId: number;
      idempotencyKey: string;
    }
  | {
      type: "reschedule";
      appointmentId: number;
      date: string;
      startTime: string;
      idempotencyKey: string;
    };

interface ServiceSummary {
  id: number;
  name: string;
  duration: number;
  price: number;
}

interface AvailabilityLookup {
  service: {
    id: number;
    name: string;
    duration: number;
    price?: number;
  };
  services?: ServiceSummary[];
  totalDurationMinutes?: number;
  totalPrice?: number;
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
    serviceId: z.number().int().positive().optional(),
    serviceIds: z.array(z.number().int().positive()).min(1).max(10).optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict()
  .refine((args) => Boolean(args.serviceId || args.serviceIds?.length), {
    message: "Informe serviceId ou serviceIds.",
  });
const prepareScheduleSchema = z
  .object({
    serviceId: z.number().int().nullable().optional(),
    serviceIds: z.array(z.number().int().positive()).min(1).max(10).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    customerName: z.string().min(1),
  })
  .strict();
const appointmentIdSchema = z
  .object({ appointmentId: z.number().int() })
  .strict();
const prepareRescheduleSchema = appointmentIdSchema
  .extend({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .strict();
const handoffSchema = z
  .object({
    reason: z.string().min(3),
    summary: z.string().optional(),
  })
  .strict();
const pauseAiSchema = z
  .object({
    reason: z.enum([
      "not_potential_customer",
      "supplier_or_partner",
      "personal_contact",
      "human_requested",
      "complaint_or_sensitive",
      "spam",
      "low_confidence",
      "manual_handoff",
    ]),
    note: z.string().optional(),
  })
  .strict();
const updateMemorySchema = z
  .object({
    summary: z.string().min(1),
    pendingTopics: z.array(z.string()).default([]),
    knownCustomerInfo: z.record(z.string(), z.unknown()).optional(),
    stage: z.string().min(1),
  })
  .strict();

export class AssistantToolRegistry {
  readonly definitions: OpenAiToolDefinition[] = [
    {
      type: "function",
      name: "listar_servicos",
      description:
        "Lista servicos reais cadastrados no Minha Agenda. Inclua precos apenas se a cliente perguntou por valores.",
      parameters: {
        type: "object",
        properties: {
          includePrices: {
            type: "boolean",
            description: "True somente quando a cliente pediu preco/valor.",
          },
        },
        required: ["includePrices"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "buscar_horarios_disponiveis",
      description:
        "Busca horarios reais disponiveis para um ou mais servicos usando IDs reais retornados por listar_servicos. Para combinacao de servicos, envie serviceIds e a API considerara um bloco continuo com a duracao total.",
      parameters: {
        type: "object",
        properties: {
          serviceId: {
            type: "integer",
            description:
              "ID positivo e real retornado por listar_servicos. Use para um unico servico.",
          },
          serviceIds: {
            type: "array",
            items: { type: "integer" },
            description:
              "Lista de IDs positivos e reais quando a cliente quer multiplos servicos no mesmo horario.",
          },
          startDate: {
            type: "string",
            description: "Data inicial YYYY-MM-DD. Opcional.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "preparar_agendamento",
      description:
        "Prepara um agendamento e registra uma acao pendente. Nao cria nada; depois peca confirmacao da cliente. Reutilize o serviceId real retornado pelas tools anteriores; nunca invente serviceId nem use 0.",
      parameters: {
        type: "object",
        properties: {
          serviceId: {
            type: "integer",
            description:
              "ID positivo e real retornado por listar_servicos/buscar_horarios_disponiveis. Use para um unico servico.",
          },
          serviceIds: {
            type: "array",
            items: { type: "integer" },
            description:
              "Lista de IDs positivos e reais quando a cliente quer multiplos servicos no mesmo horario.",
          },
          date: { type: "string" },
          startTime: { type: "string" },
          customerName: { type: "string" },
        },
        required: ["date", "startTime", "customerName"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "confirmar_agendamento",
      description:
        "Cria o agendamento real no Minha Agenda apenas se houver acao pendente preparada.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "buscar_agendamentos_cliente",
      description:
        "Busca agendamentos futuros da cliente pelo telefone do WhatsApp.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "preparar_cancelamento",
      description:
        "Prepara o cancelamento de um agendamento futuro da cliente. Nao cancela; depois peca confirmacao.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "integer" },
        },
        required: ["appointmentId"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "confirmar_cancelamento",
      description:
        "Cancela o agendamento real no Minha Agenda apenas se houver cancelamento pendente preparado.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "preparar_remarcacao",
      description:
        "Prepara a remarcacao de um agendamento futuro. Nao altera a agenda; depois peca confirmacao.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "integer" },
          date: { type: "string" },
          startTime: { type: "string" },
        },
        required: ["appointmentId", "date", "startTime"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "confirmar_remarcacao",
      description:
        "Remarca o agendamento real no Minha Agenda apenas se houver remarcacao pendente preparada.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "acionar_humano",
      description: "Abre handoff para a profissional assumir a conversa.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
          summary: { type: "string" },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "pausar_ia_chat",
      description:
        "Pausa a IA no chat atual quando a conversa nao deve continuar automatica.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: [
              "not_potential_customer",
              "supplier_or_partner",
              "personal_contact",
              "human_requested",
              "complaint_or_sensitive",
              "spam",
              "low_confidence",
              "manual_handoff",
            ],
          },
          note: { type: "string" },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "atualizar_memoria_conversa",
      description:
        "Atualiza resumo persistente, pendencias e dados conhecidos da cliente.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          pendingTopics: { type: "array", items: { type: "string" } },
          knownCustomerInfo: { type: "object" },
          stage: { type: "string" },
        },
        required: ["summary", "pendingTopics", "stage"],
        additionalProperties: false,
      },
    },
  ];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly agenda: SchedulingServiceGateway = new SchedulingServiceClient(),
  ) {}

  async execute(
    name: string,
    rawArgs: unknown,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    switch (name) {
      case "listar_servicos":
        return this.listServices(listServicesSchema.parse(rawArgs), context);
      case "buscar_horarios_disponiveis":
        return this.findAvailableSlots(
          availableSlotsSchema.parse(rawArgs),
          context,
        );
      case "preparar_agendamento":
        return this.prepareSchedule(
          prepareScheduleSchema.parse(rawArgs),
          context,
        );
      case "confirmar_agendamento":
        noArgsSchema.parse(rawArgs);
        return this.confirmSchedule(context);
      case "buscar_agendamentos_cliente":
        noArgsSchema.parse(rawArgs);
        return this.findCustomerAppointments(context);
      case "preparar_cancelamento":
        return this.prepareCancel(appointmentIdSchema.parse(rawArgs), context);
      case "confirmar_cancelamento":
        noArgsSchema.parse(rawArgs);
        return this.confirmCancel(context);
      case "preparar_remarcacao":
        return this.prepareReschedule(
          prepareRescheduleSchema.parse(rawArgs),
          context,
        );
      case "confirmar_remarcacao":
        noArgsSchema.parse(rawArgs);
        return this.confirmReschedule(context);
      case "acionar_humano":
        return this.createHandoff(handoffSchema.parse(rawArgs), context);
      case "pausar_ia_chat":
        return this.pauseAiForChat(pauseAiSchema.parse(rawArgs), context);
      case "atualizar_memoria_conversa":
        return this.updateConversationMemory(
          updateMemorySchema.parse(rawArgs),
          context,
        );
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  }

  private async listServices(
    args: z.infer<typeof listServicesSchema>,
    context: ToolExecutionContext,
  ) {
    const services = await this.agenda.listActiveServices(
      schedulingContext(context),
    );
    return {
      ok: true,
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        duration: service.duration,
        durationMinutes: service.duration,
        ...(args.includePrices ? { price: service.price } : {}),
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

    const slots = await this.agenda.getAvailableSlotsForServices(
      serviceResult.serviceIds,
      args.startDate,
      context.businessSettings,
      schedulingContext(context),
    );
    await this.rememberAvailabilityLookup(context.conversationId, {
      service: serviceResult.services[0],
      services: serviceResult.services,
      totalDurationMinutes: serviceResult.totalDurationMinutes,
      totalPrice: serviceResult.totalPrice,
      slots,
      checkedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      services: serviceResult.services,
      totalDurationMinutes: serviceResult.totalDurationMinutes,
      totalPrice: serviceResult.totalPrice,
      slots,
    };
  }

  private async prepareSchedule(
    args: z.infer<typeof prepareScheduleSchema>,
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
      customerName: args.customerName,
      customerPhone: context.phone,
      idempotencyKey: randomUUID(),
    };
    await this.setPendingAction(context.conversationId, pending);
    return { ok: true, requiresConfirmation: true, pendingAction: pending };
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

    const appointment = await this.agenda.createAppointment(
      {
        serviceId: serviceResult.serviceIds[0],
        serviceIds: serviceResult.serviceIds,
        date: pending.date,
        startTime: pending.startTime,
        customerName: pending.customerName,
        customerPhone: pending.customerPhone,
        comments: `Criado via Atendente IA WhatsApp. Servicos: ${serviceResult.services.map((service) => service.name).join(" + ")}. Total: R$ ${serviceResult.totalPrice.toFixed(2)}.`,
      },
      context.businessSettings,
      schedulingContext(context),
      pending.idempotencyKey,
    );

    await this.clearPendingAction(context.conversationId);
    if (appointment.customerId) {
      await this.prisma.customerLink.upsert({
        where: { phone: context.phone },
        update: {
          minhaAgendaCustomerId: appointment.customerId,
          name: pending.customerName,
        },
        create: {
          phone: context.phone,
          minhaAgendaCustomerId: appointment.customerId,
          name: pending.customerName,
        },
      });
    }
    await this.saveExternalAppointment(
      context.conversationId,
      appointment,
      "SCHEDULED",
    );
    return { ok: true, appointment: this.presentAppointment(appointment) };
  }

  private async findCustomerAppointments(context: ToolExecutionContext) {
    const appointments = await this.agenda.findFutureAppointmentsForPhone(
      context.phone,
      context.businessSettings,
      schedulingContext(context),
    );
    return {
      ok: true,
      appointments: appointments.map((appointment) =>
        this.presentAppointment(appointment),
      ),
    };
  }

  private async prepareCancel(
    args: z.infer<typeof appointmentIdSchema>,
    context: ToolExecutionContext,
  ) {
    const appointments = await this.agenda.findFutureAppointmentsForPhone(
      context.phone,
      context.businessSettings,
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
      idempotencyKey: randomUUID(),
    };
    await this.setPendingAction(context.conversationId, pending);
    return {
      ok: true,
      requiresConfirmation: true,
      appointment: this.presentAppointment(appointment),
    };
  }

  private async confirmCancel(context: ToolExecutionContext) {
    const pending = await this.getPendingAction(context.conversationId);
    if (!pending || pending.type !== "cancel") {
      return {
        ok: false,
        error: "Nao ha cancelamento pendente para confirmar.",
      };
    }

    const result = await this.agenda.cancelAppointment(
      pending.appointmentId,
      schedulingContext(context),
      pending.idempotencyKey,
    );
    await this.clearPendingAction(context.conversationId);
    await this.prisma.externalAppointment.updateMany({
      where: { minhaAgendaAppointmentId: pending.appointmentId },
      data: { status: "CANCELLED" },
    });
    return { ok: true, ...result };
  }

  private async prepareReschedule(
    args: z.infer<typeof prepareRescheduleSchema>,
    context: ToolExecutionContext,
  ) {
    const appointments = await this.agenda.findFutureAppointmentsForPhone(
      context.phone,
      context.businessSettings,
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
      idempotencyKey: randomUUID(),
    };
    await this.setPendingAction(context.conversationId, pending);
    return {
      ok: true,
      requiresConfirmation: true,
      currentAppointment: this.presentAppointment(appointment),
      newDate: args.date,
      newStartTime: args.startTime,
    };
  }

  private async confirmReschedule(context: ToolExecutionContext) {
    const pending = await this.getPendingAction(context.conversationId);
    if (!pending || pending.type !== "reschedule") {
      return { ok: false, error: "Nao ha remarcacao pendente para confirmar." };
    }

    const appointment = await this.agenda.rescheduleAppointment(
      {
        appointmentId: pending.appointmentId,
        date: pending.date,
        startTime: pending.startTime,
      },
      context.businessSettings,
      schedulingContext(context),
      pending.idempotencyKey,
    );

    await this.clearPendingAction(context.conversationId);
    await this.saveExternalAppointment(
      context.conversationId,
      appointment,
      "RESCHEDULED",
    );
    return { ok: true, appointment: this.presentAppointment(appointment) };
  }

  private async createHandoff(
    args: z.infer<typeof handoffSchema>,
    context: ToolExecutionContext,
  ) {
    const handoff = await this.prisma.handoff.create({
      data: {
        conversationId: context.conversationId,
        phone: context.phone,
        reason: args.reason,
        summary: args.summary ?? null,
        status: "OPEN",
      },
    });

    await this.prisma.conversation.update({
      where: { id: context.conversationId },
      data: { humanHandoff: true, status: "HUMAN_HANDOFF" },
    });

    return { ok: true, handoffId: handoff.id };
  }

  private async pauseAiForChat(
    args: z.infer<typeof pauseAiSchema>,
    context: ToolExecutionContext,
  ) {
    const handoff = await this.prisma.handoff.create({
      data: {
        conversationId: context.conversationId,
        phone: context.phone,
        reason: args.reason,
        summary: args.note ?? null,
        status: "OPEN",
      },
    });

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
            stage: "AI_PAUSED",
            pauseReason: args.reason,
          },
        } as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      handoffId: handoff.id,
      paused: true,
      reason: args.reason,
    };
  }

  private async updateConversationMemory(
    args: z.infer<typeof updateMemorySchema>,
    context: ToolExecutionContext,
  ) {
    const state = await this.getConversationState(context.conversationId);
    const memory = {
      summary: args.summary,
      pendingTopics: args.pendingTopics,
      knownCustomerInfo: args.knownCustomerInfo ?? {},
      lastStage: args.stage,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.conversation.update({
      where: { id: context.conversationId },
      data: {
        state: {
          ...state,
          conversationMemory: memory,
        } as Prisma.InputJsonValue,
      },
    });

    return { ok: true, memory };
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
    serviceId?: number | null;
    serviceIds?: number[];
    date: string;
    startTime: string;
    context: ToolExecutionContext;
  }): Promise<
    | {
        ok: true;
        serviceIds: number[];
        services: ServiceSummary[];
        totalDurationMinutes: number;
        totalPrice: number;
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
    serviceId?: number | null;
    serviceIds?: number[];
    context: ToolExecutionContext;
  }): Promise<
    | {
        ok: true;
        serviceIds: number[];
        services: ServiceSummary[];
        totalDurationMinutes: number;
        totalPrice: number;
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
          this.agenda.findService(serviceId, schedulingContext(input.context)),
        ),
      );
      const summaries = services.map(toServiceSummary);
      return {
        ok: true,
        serviceIds: summaries.map((service) => service.id),
        services: summaries,
        totalDurationMinutes: calculateServiceBlockMinutes(summaries),
        totalPrice: summaries.reduce(
          (total, service) => total + service.price,
          0,
        ),
      };
    } catch (error) {
      return {
        ok: false,
        code: "SERVICE_NOT_FOUND",
        error:
          error instanceof Error
            ? error.message
            : "Servico nao encontrado no Minha Agenda.",
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

  private async saveExternalAppointment(
    conversationId: string,
    appointment: SchedulingAppointment,
    status: "SCHEDULED" | "RESCHEDULED",
  ) {
    const serviceId = appointment.serviceId ?? appointment.serviceIds[0];
    if (!appointment.customerId || !serviceId) return;
    const payload = z
      .record(z.string(), z.json())
      .parse(JSON.parse(JSON.stringify(appointment)));

    await this.prisma.externalAppointment.upsert({
      where: { minhaAgendaAppointmentId: appointment.id },
      update: {
        conversationId,
        customerId: appointment.customerId,
        serviceId,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status,
        payload,
      },
      create: {
        conversationId,
        minhaAgendaAppointmentId: appointment.id,
        customerId: appointment.customerId,
        serviceId,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status,
        payload,
      },
    });
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

function normalizeServiceIds(serviceIds: number[]): number[] {
  return [
    ...new Set(
      serviceIds.filter(
        (serviceId) => Number.isInteger(serviceId) && serviceId > 0,
      ),
    ),
  ];
}

function toServiceSummary(service: {
  id: number;
  name: string;
  duration: number;
  price: number;
}): ServiceSummary {
  return {
    id: service.id,
    name: service.name,
    duration: service.duration,
    price: Number(service.price ?? 0),
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
      price: Number(lookup.service.price ?? 0),
    },
  ];
}

function getLookupKey(lookup: AvailabilityLookup): string {
  return getLookupServices(lookup)
    .map((service) => service.id)
    .sort((a, b) => a - b)
    .join("+");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAvailabilityLookup(value: unknown): value is AvailabilityLookup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const lookup = value as Partial<AvailabilityLookup>;
  const service = lookup.service;
  return (
    !!service &&
    typeof service === "object" &&
    typeof service.id === "number" &&
    typeof service.name === "string" &&
    typeof service.duration === "number" &&
    (lookup.services === undefined ||
      (Array.isArray(lookup.services) &&
        lookup.services.every(
          (item) =>
            !!item &&
            typeof item === "object" &&
            typeof item.id === "number" &&
            typeof item.name === "string" &&
            typeof item.duration === "number" &&
            typeof item.price === "number",
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
