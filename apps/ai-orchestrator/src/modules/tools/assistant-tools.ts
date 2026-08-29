import type { StructuredToolInterface } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import type { BusinessSettingsDTO } from "../business-settings/business-settings.js";
import {
  SchedulingClient,
  type SchedulingGateway,
} from "../scheduling-service/client.js";
import type {
  SchedulingAppointment,
  SchedulingRequestContext,
} from "../scheduling-service/types.js";
export interface ToolExecutionContext {
  conversationId: string;
  tenantId: string;
  channelId: string;
  userId: string;
  requestId: string;
  phone: string;
  customerName?: string | null;
  businessSettings: BusinessSettingsDTO;
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
      customerName: string;
      customerPhone: string;
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

interface ServiceSummary {
  id: string;
  name: string;
  duration: number;
  priceType: "FIXED" | "ON_REQUEST";
  price: number | null;
}

interface AvailabilityLookup {
  service: {
    id: string;
    name: string;
    duration: number;
    priceType: "FIXED" | "ON_REQUEST";
    price?: number | null;
  };
  services?: ServiceSummary[];
  totalDurationMinutes?: number;
  totalPrice?: number | null;
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
export class AssistantToolRegistry {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scheduling: SchedulingGateway = new SchedulingClient(),
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
    return [
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
              },
              context,
            ),
          );
        },
        {
          name: "create_appointment",
          description:
            "Prepara ou confirma agendamento. Use action=prepare antes de pedir confirmacao; action=confirm somente apos confirmacao clara da cliente.",
          schema: createAppointmentSchema,
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

    const slots = await this.scheduling.getAvailableSlotsForServices(
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
      services: serviceResult.services,
      totalDurationMinutes: serviceResult.totalDurationMinutes,
      totalPrice: serviceResult.totalPrice,
      slots,
    };
  }

  private async prepareSchedule(
    args: {
      serviceId?: string | null;
      serviceIds?: string[];
      date: string;
      startTime: string;
      customerName: string;
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
      idempotencyKey: context.idempotencyKey,
    };
    await this.setPendingAction(context.conversationId, pending);
    return { requiresConfirmation: true, pendingAction: pending };
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

    const appointment = await this.scheduling.createAppointment(
      {
        serviceId: serviceResult.serviceIds[0],
        serviceIds: serviceResult.serviceIds,
        date: pending.date,
        startTime: pending.startTime,
        customerName: pending.customerName,
        customerPhone: pending.customerPhone,
        comments: buildAppointmentComment(
          serviceResult.services,
          serviceResult.totalPrice,
        ),
      },
      context.businessSettings,
      schedulingContext(context),
      pending.idempotencyKey || context.idempotencyKey,
    );

    await this.clearPendingAction(context.conversationId);
    return { appointment: this.presentAppointment(appointment) };
  }

  private async findCustomerAppointments(context: ToolExecutionContext) {
    const appointments = await this.scheduling.findFutureAppointmentsForPhone(
      context.phone,
      context.businessSettings,
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
      context.businessSettings,
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
      return {
        ok: true,
        serviceIds: summaries.map((service) => service.id),
        services: summaries,
        totalDurationMinutes: calculateServiceBlockMinutes(summaries),
        totalPrice: calculateTotalPrice(summaries),
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
): value is { ok: false; code?: string; error: string } {
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
  priceType: "FIXED" | "ON_REQUEST";
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

function calculateTotalPrice(services: ServiceSummary[]): number | null {
  if (services.some((service) => service.price === null)) return null;
  return services.reduce((total, service) => total + (service.price ?? 0), 0);
}

function buildAppointmentComment(
  services: ServiceSummary[],
  totalPrice: number | null,
): string {
  const serviceNames = services.map((service) => service.name).join(" + ");
  const price =
    totalPrice === null
      ? "Valor sob consulta."
      : `Total: R$ ${totalPrice.toFixed(2)}.`;
  return `Criado via Atendente IA WhatsApp. Servicos: ${serviceNames}. ${price}`;
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
    (service.priceType === "FIXED" || service.priceType === "ON_REQUEST") &&
    (lookup.services === undefined ||
      (Array.isArray(lookup.services) &&
        lookup.services.every(
          (item) =>
            !!item &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.duration === "number" &&
            (item.priceType === "FIXED" || item.priceType === "ON_REQUEST") &&
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
