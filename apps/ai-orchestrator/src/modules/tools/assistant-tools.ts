import type { StructuredToolInterface } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  type DiagnosticLogger,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import { AppError, InfrastructureError } from "../../lib/errors.js";
import {
  isOperationalKnowledgeQuery,
  type KnowledgeVectorStore,
} from "../knowledge/knowledge-vector-store.js";
import {
  SchedulingClient,
  type SchedulingGateway,
} from "../scheduling-service/client.js";
import {
  APPOINTMENT_HOLD_EXPIRED,
  type SchedulingAppointment,
  type SchedulingHold,
  type SchedulingRequestContext,
} from "../scheduling-service/types.js";
import type { BusinessContext } from "../tenant-config/business-context.js";
export interface ToolExecutionContext {
  conversationId: string;
  tenantId: string;
  channelId: string;
  userId: string;
  requestId: string;
  /**
   * Turno de entrada em que esta execucao acontece (`deriveTurnId`).
   *
   * E o que torna "confirmacao explicita" uma regra de codigo e nao de
   * prompt: o rascunho guarda o turno em que nasceu e a tool com efeito
   * recusa agir enquanto esse turno for o turno atual.
   */
  turnId: string;
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

/**
 * Confirmar no mesmo turno de entrada em que o rascunho foi preparado
 * significa confirmar sem ter perguntado: a cliente nao teve turno nenhum
 * para dizer sim. Codigo proprio porque o modelo precisa distinguir isto de
 * "nao ha nada para confirmar" — aqui ele deve **perguntar e parar**, nao
 * preparar de novo.
 */
export const CONFIRMATION_SAME_TURN = "CONFIRMATION_REQUIRED_SAME_TURN";
/** Confirmar sem rascunho: nao ha o que confirmar, e nada tem efeito. */
export const CONFIRMATION_WITHOUT_DRAFT = "NO_PENDING_CONFIRMATION";

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
      /**
       * Hold criado ao propor o horario (Goal008): o rascunho carrega a
       * reserva, e a confirmacao a consome. Nulo quando a fonte da agenda
       * nao suporta hold (agenda externa) ou em rascunho anterior a este
       * Goal — nesses casos a confirmacao revalida a disponibilidade
       * normalmente, como antes.
       */
      holdId?: string | null;
      holdExpiresAt?: string | null;
      idempotencyKey: string;
      /**
       * Turno de entrada em que o rascunho nasceu. Ausente em rascunho
       * gravado antes deste Goal: confirmar um desses segue permitido, porque
       * derrubar conversa em andamento no deploy seria pior do que aceitar o
       * ultimo rascunho legado.
       */
      preparedInTurnId?: string;
    }
  | {
      type: "cancel";
      appointmentId: string;
      idempotencyKey: string;
      preparedInTurnId?: string;
    }
  | {
      type: "reschedule";
      appointmentId: string;
      date: string;
      startTime: string;
      /** Hold do NOVO horario; o original segue ocupado ate a confirmacao. */
      holdId?: string | null;
      holdExpiresAt?: string | null;
      idempotencyKey: string;
      preparedInTurnId?: string;
    }
  | {
      // Serie recorrente (Goal009): a confirmacao global tambem e efeito, e
      // tambem precisa de um turno de conversa entre a proposta e o sim.
      type: "recurring";
      holdIds: string[];
      serviceIds: string[];
      intervalDays?: number;
      idempotencyKey: string;
      preparedInTurnId?: string;
    };

type ServicePriceType = "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";

interface ServiceSummary {
  id: string;
  name: string;
  duration: number;
  priceType: ServicePriceType;
  price: number | null;
  /**
   * Intervalo de referencia para recorrencia (Goal007), em dias. Ausente em
   * `AvailabilityLookup` persistido antes deste Goal; nulo quando o servico
   * nao tem cadencia cadastrada. Nos dois casos a IA nao inventa intervalo.
   */
  recurrenceIntervalDays?: number | null;
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
// Recorrencia de atendimento (Goal009): serie finita, hold por ocorrencia.
// Sem `stepMinutes`/granularidade propria — a grade e sempre a do negocio.
const prepareRecurringAppointmentsSchema = z
  .object({
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(1).max(10).optional(),
    occurrenceCount: z.number().int().min(1).max(52),
    // Ausente usa o intervalo padrao do servico.
    intervalDays: z.number().int().positive().max(3_650).optional(),
    firstDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    firstStartTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/),
    customerId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((args) => Boolean(args.serviceId || args.serviceIds?.length), {
    message: "Informe serviceId ou serviceIds.",
  });
const confirmRecurringAppointmentsSchema = z
  .object({
    holdIds: z.array(z.string().min(1)).min(1).max(52),
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(1).max(10).optional(),
    intervalDays: z.number().int().positive().max(3_650),
    customerName: z.string().min(1).optional(),
    customerId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((args) => Boolean(args.serviceId || args.serviceIds?.length), {
    message: "Informe serviceId ou serviceIds.",
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
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
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
      // Falha de infraestrutura nunca vira mensagem de "entrada invalida":
      // ela segue subindo para o caminho generico de falha de tool, que
      // sanitiza e loga com requestId/aiRunId.
      if (error instanceof InfrastructureError) throw error;
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
            "Lista servicos reais da fonte oficial do tenant via Scheduling Service. Inclua precos somente quando a cliente perguntou por valores. recurrenceIntervalDays, quando presente, e o intervalo em dias que permite OFERECER recorrencia para esse servico; oferecer nunca cria a serie sozinho, que continua exigindo prepare_recurring_appointments e confirm_recurring_appointments. Quando recurrenceIntervalDays for nulo, o servico nao tem cadencia cadastrada e nenhum intervalo deve ser inventado.",
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
        (args) =>
          this.run(context, () =>
            this.prepareRecurringAppointments(args, context),
          ),
        {
          name: "prepare_recurring_appointments",
          description:
            "Prepara uma serie finita de atendimentos recorrentes a partir de um servico, segurando um horario (hold) por ocorrencia ja ajustado a grade do negocio e aos buffers. Nao confirma nada ainda; nunca cria excecao, bloqueio ou override.",
          schema: prepareRecurringAppointmentsSchema,
        },
      ),
      tool(
        (args) =>
          this.run(context, () =>
            this.confirmRecurringAppointments(args, context),
          ),
        {
          name: "confirm_recurring_appointments",
          description:
            "Confirma de uma vez todas as ocorrencias preparadas por prepare_recurring_appointments, usando os holdIds recebidos. So chame apos confirmacao explicita da cliente. Se algum hold venceu, nada e confirmado e e preciso preparar de novo.",
          schema: confirmRecurringAppointmentsSchema,
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
      // Falha de infraestrutura (Goal011): nunca vira resultado estruturado
      // visivel ao modelo aqui. Sobe para `execute` e dali para o caminho
      // generico de falha de tool em `AssistantService`, que sanitiza a
      // mensagem e loga o detalhe real com requestId/aiRunId.
      if (error instanceof InfrastructureError) throw error;
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
        // Sempre presente, como `priceType`: nulo e informacao (nao ha
        // cadencia cadastrada), nao ausencia de dado. A IA so pode oferecer
        // recorrencia quando este valor nao e nulo.
        recurrenceIntervalDays: service.recurrenceIntervalDays,
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
   * Recorrência de atendimento (Goal009): pré-visualização cria um hold por
   * ocorrência, já ajustada à grade do negócio e aos buffers do serviço —
   * nunca decide granularidade nem antecedência por conta própria.
   */
  private async prepareRecurringAppointments(
    args: z.infer<typeof prepareRecurringAppointmentsSchema>,
    context: ToolExecutionContext,
  ) {
    const serviceResult = await this.resolveServicesFromExplicitIds({
      serviceId: args.serviceId,
      serviceIds: args.serviceIds,
      context,
    });
    if (!serviceResult.ok) return serviceResult;

    const occurrences = await this.scheduling.previewAppointmentSeries(
      {
        serviceIds: serviceResult.serviceIds,
        occurrenceCount: args.occurrenceCount,
        intervalDays: args.intervalDays,
        firstDate: args.firstDate,
        firstStartTime: args.firstStartTime,
        customerId: args.customerId ?? undefined,
        contactRef: context.phone,
      },
      schedulingContext(context),
      context.idempotencyKey,
    );
    // Preparar a serie tambem grava rascunho: sem ele a confirmacao global
    // seria a unica tool com efeito capaz de agir a partir de argumentos que o
    // proprio modelo escreveu, no turno que quisesse.
    const holdIds = occurrences
      .map((occurrence) => occurrence.holdId)
      .filter((holdId): holdId is string => Boolean(holdId));
    await this.setPendingAction(context, {
      type: "recurring",
      holdIds,
      serviceIds: serviceResult.serviceIds,
      intervalDays: args.intervalDays,
      idempotencyKey: context.idempotencyKey,
      preparedInTurnId: context.turnId,
    });
    return {
      services: serviceResult.services,
      intervalDays: args.intervalDays,
      occurrences,
    };
  }

  /**
   * Confirma todas as ocorrências preparadas de uma vez. Hold vencido não
   * confirma nada — o erro do Scheduling propaga como falha da tool, e a
   * cliente precisa preparar a série de novo.
   */
  private async confirmRecurringAppointments(
    args: z.infer<typeof confirmRecurringAppointmentsSchema>,
    context: ToolExecutionContext,
  ) {
    const serviceResult = await this.resolveServicesFromExplicitIds({
      serviceId: args.serviceId,
      serviceIds: args.serviceIds,
      context,
    });
    if (!serviceResult.ok) return serviceResult;

    const draft = await this.draftReadyForEffect(
      "recurring",
      context,
      "Nao ha serie preparada para confirmar. Prepare a serie e peca a confirmacao antes de confirmar.",
    );
    if (!draft.ok) return draft;
    // Hold que nao veio do rascunho nao existe para a confirmacao: o
    // identificador chega no argumento escrito pelo modelo, e aceitar
    // qualquer um seria confirmar sobre reserva que a conversa nunca propos.
    const unknownHoldIds = args.holdIds.filter(
      (holdId) => !draft.pending.holdIds.includes(holdId),
    );
    if (unknownHoldIds.length > 0) {
      return {
        ok: false as const,
        code: CONFIRMATION_WITHOUT_DRAFT,
        error:
          "Essas reservas nao vieram da serie preparada nesta conversa. Prepare a serie de novo antes de confirmar.",
        details: { unknownHoldIds },
      };
    }

    try {
      const appointments = await this.scheduling.confirmAppointmentSeries(
        {
          holdIds: args.holdIds,
          serviceIds: serviceResult.serviceIds,
          intervalDays: args.intervalDays,
          customerId: args.customerId ?? undefined,
          customerName: args.customerName,
          customerPhone: context.phone,
        },
        schedulingContext(context),
        context.idempotencyKey,
      );
      await this.clearPendingAction(context);
      return { appointments };
    } catch (error) {
      if (!isHoldExpired(error)) throw error;
      // Mesma resposta unica de "o horario reservado nao vale mais" do
      // agendamento avulso: falha de dominio explicita, nada confirmado.
      return {
        ok: false as const,
        code: APPOINTMENT_HOLD_EXPIRED,
        error:
          "A reserva de uma das ocorrencias expirou. Nada da serie foi confirmado; prepare a serie de novo.",
        details: { confirmed: false },
      };
    }
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

    // Propor ja segura o horario (Goal008): entre a proposta e o "pode
    // confirmar" da cliente existe uma conversa inteira, e sem hold esse
    // intervalo e exatamente onde o horario some.
    const hold = await this.holdProposedSlot(
      {
        serviceIds: serviceResult.serviceIds,
        date: args.date,
        startTime: args.startTime,
        customerId: identity.customerId ?? identity.proposedCustomerId,
      },
      context,
    );

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
      holdId: hold?.id ?? null,
      holdExpiresAt: hold?.expiresAt ?? null,
      idempotencyKey: context.idempotencyKey,
      preparedInTurnId: context.turnId,
    };
    await this.setPendingAction(context, pending);
    return {
      requiresConfirmation: true,
      pendingAction: pending,
      customerIdentity: identity,
      hold: hold ? { id: hold.id, expiresAt: hold.expiresAt } : null,
    };
  }

  /**
   * Segura o horario proposto, sem transformar a proposta em confirmacao.
   *
   * Duas falhas sao tratadas de formas opostas de proposito. Uma fonte de
   * agenda externa nao tem hold — recusar a proposta inteira por isso seria
   * quebrar quem depende dessa fonte, entao a proposta segue **sem** reserva,
   * como antes deste Goal. Ja "o horario nao esta livre" e informacao real
   * sobre a agenda: propagar e o certo, porque propor um horario ocupado e
   * pior do que nao propor.
   */
  private async holdProposedSlot(
    input: {
      serviceIds: string[];
      date: string;
      startTime: string;
      customerId?: string | null;
    },
    context: ToolExecutionContext,
  ): Promise<SchedulingHold | null> {
    try {
      return await this.scheduling.createHold(
        {
          serviceIds: input.serviceIds,
          date: input.date,
          startTime: input.startTime,
          customerId: input.customerId ?? null,
          // Contato ainda nao resolvido para uma pessoa: referencia livre,
          // nunca fusao de identidade por telefone (D-005).
          contactRef: input.customerId ? null : context.phone,
        },
        schedulingContext(context),
        `${context.idempotencyKey}:hold`,
      );
    } catch (error) {
      if (holdsUnsupported(error)) return null;
      throw error;
    }
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
    const draft = await this.draftReadyForEffect(
      "schedule",
      context,
      "Nao ha agendamento pendente para confirmar.",
    );
    if (!draft.ok) return draft;
    const pending = draft.pending;

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
    let appointment;
    try {
      appointment = await this.scheduling.createAppointment(
        {
          serviceId: serviceResult.serviceIds[0],
          serviceIds: serviceResult.serviceIds,
          date: pending.date,
          startTime: pending.startTime,
          customerId: resolvedCustomerId,
          customerName: resolvedCustomerId ? null : pending.customerName,
          customerPhone: resolvedCustomerId ? null : pending.customerPhone,
          comments: buildAppointmentComment(serviceResult.services),
          holdId: pending.holdId ?? null,
        },
        schedulingContext(context),
        pending.idempotencyKey || context.idempotencyKey,
      );
    } catch (error) {
      if (!isHoldExpired(error)) throw error;
      // Hold vencido nao vira confirmacao silenciosa: a IA consulta de novo
      // e volta com alternativas. O rascunho perde a reserva mas permanece,
      // porque a conversa continua sendo sobre o mesmo agendamento.
      return this.holdExpiredAlternatives(
        serviceResult.serviceIds,
        pending.date,
        context,
        { ...pending, holdId: null, holdExpiresAt: null },
      );
    }

    await this.linkContactToCustomer(context, appointment.customerId);
    await this.clearPendingAction(context);
    return { appointment: this.presentAppointment(appointment) };
  }

  /**
   * Resposta unica para "o horario reservado nao vale mais": disponibilidade
   * consultada de novo e alternativas oferecidas, sem nada confirmado.
   *
   * O resultado e uma falha de dominio (`ok: false`) e nao um sucesso com
   * aviso: quem le precisa saber que **nao existe** agendamento, e um objeto
   * de sucesso com um campo `expired` escondido no meio seria lido como
   * confirmacao mais cedo ou mais tarde.
   */
  private async holdExpiredAlternatives(
    serviceIds: string[],
    startDate: string,
    context: ToolExecutionContext,
    pending: PendingAction,
  ) {
    const slots = await this.scheduling.getAvailableSlotsForServices(
      serviceIds,
      startDate,
      context.businessContext,
      schedulingContext(context),
    );
    await this.setPendingAction(context, pending);
    return {
      ok: false as const,
      code: APPOINTMENT_HOLD_EXPIRED,
      error:
        "A reserva do horario expirou. Nada foi confirmado; ofereca os horarios disponiveis abaixo e peca uma nova escolha.",
      details: { slots, confirmed: false },
    };
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
      preparedInTurnId: context.turnId,
    };
    await this.setPendingAction(context, pending);
    return {
      requiresConfirmation: true,
      appointment: this.presentAppointment(appointment),
    };
  }

  private async cancelAppointment(context: ToolExecutionContext) {
    const draft = await this.draftReadyForEffect(
      "cancel",
      context,
      "Nao ha cancelamento pendente para confirmar.",
    );
    if (!draft.ok) return draft;
    const pending = draft.pending;

    const result = await this.scheduling.cancelAppointment(
      pending.appointmentId,
      schedulingContext(context),
      pending.idempotencyKey || context.idempotencyKey,
    );
    await this.clearPendingAction(context);
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

    // Hold apenas no horario NOVO. O original continua ocupado pelo proprio
    // atendimento ate a remarcacao commitar: soltar antes deixaria a cliente
    // sem nenhum dos dois se a confirmacao nao viesse.
    const hold = await this.holdProposedSlot(
      {
        serviceIds: appointment.serviceIds,
        date: args.date,
        startTime: args.startTime,
        customerId: appointment.customerId,
      },
      context,
    );

    const pending: PendingAction = {
      type: "reschedule",
      appointmentId: args.appointmentId,
      date: args.date,
      startTime: args.startTime,
      holdId: hold?.id ?? null,
      holdExpiresAt: hold?.expiresAt ?? null,
      idempotencyKey: context.idempotencyKey,
      preparedInTurnId: context.turnId,
    };
    await this.setPendingAction(context, pending);
    return {
      requiresConfirmation: true,
      currentAppointment: this.presentAppointment(appointment),
      newDate: args.date,
      newStartTime: args.startTime,
      hold: hold ? { id: hold.id, expiresAt: hold.expiresAt } : null,
    };
  }

  private async rescheduleAppointment(context: ToolExecutionContext) {
    const draft = await this.draftReadyForEffect(
      "reschedule",
      context,
      "Nao ha remarcacao pendente para confirmar.",
    );
    if (!draft.ok) return draft;
    const pending = draft.pending;

    let appointment;
    try {
      appointment = await this.scheduling.rescheduleAppointment(
        {
          appointmentId: pending.appointmentId,
          date: pending.date,
          startTime: pending.startTime,
          holdId: pending.holdId ?? null,
        },
        schedulingContext(context),
        pending.idempotencyKey || context.idempotencyKey,
      );
    } catch (error) {
      if (!isHoldExpired(error)) throw error;
      // Nada foi remarcado: o atendimento original continua exatamente onde
      // estava, e e isso que a IA deve dizer antes de oferecer outro horario.
      const current = await this.scheduling.findFutureAppointmentsForPhone(
        context.phone,
        context.businessContext,
        schedulingContext(context),
      );
      const original = current.find(
        (item) => item.id === pending.appointmentId,
      );
      return this.holdExpiredAlternatives(
        original?.serviceIds ?? [],
        pending.date,
        context,
        { ...pending, holdId: null, holdExpiresAt: null },
      );
    }

    await this.clearPendingAction(context);
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

  /**
   * Rascunho elegivel para efeito.
   *
   * Confirmacao explicita deixa de ser instrucao de prompt e passa a ser
   * condicao de execucao: criar, remarcar, cancelar e confirmar serie so
   * rodam sobre um rascunho preparado em **turno anterior**. Preparar e
   * confirmar dentro do mesmo turno de entrada e, por definicao, confirmar
   * sem ter perguntado — nao existe turno em que a cliente pudesse ter dito
   * sim.
   *
   * Sao duas recusas com codigos diferentes porque sao dois erros diferentes:
   * "nao ha nada preparado" pede preparar; "preparado agora mesmo" pede
   * perguntar e esperar a proxima mensagem.
   */
  private async draftReadyForEffect<T extends PendingAction["type"]>(
    type: T,
    context: ToolExecutionContext,
    absentMessage: string,
  ): Promise<
    | { ok: true; pending: Extract<PendingAction, { type: T }> }
    | { ok: false; code: string; error: string }
  > {
    const pending = await this.getPendingAction(context.conversationId);
    if (!pending || pending.type !== type) {
      return {
        ok: false,
        code: CONFIRMATION_WITHOUT_DRAFT,
        error: absentMessage,
      };
    }
    if (pending.preparedInTurnId === context.turnId) {
      return {
        ok: false,
        code: CONFIRMATION_SAME_TURN,
        error:
          "O rascunho foi preparado nesta mesma mensagem. Enuncie o resumo, peca a confirmacao da cliente e so confirme depois que ela responder.",
      };
    }
    return { ok: true, pending: pending as Extract<PendingAction, { type: T }> };
  }

  private async getPendingAction(
    conversationId: string,
  ): Promise<PendingAction | null> {
    const state = await this.getConversationState(conversationId);
    return state.pendingAction ?? null;
  }

  /**
   * Grava o novo rascunho e libera, no mesmo caminho, o hold que o rascunho
   * anterior segurava (Goal011): propor B depois de A não pode deixar A
   * ocupado até o TTL vencer.
   */
  private async setPendingAction(
    context: ToolExecutionContext,
    pendingAction: PendingAction,
  ): Promise<void> {
    const state = await this.getConversationState(context.conversationId);
    await this.releasePendingHolds(context, state.pendingAction);
    await this.prisma.conversation.update({
      where: { id: context.conversationId },
      data: { state: { ...state, pendingAction } as Prisma.InputJsonValue },
    });
  }

  /**
   * Remove o rascunho e libera, no mesmo caminho, o hold que ele segurava.
   * Chamado tanto depois de uma confirmação bem-sucedida (o hold, nesse
   * caso, já foi consumido pela própria operação, e liberar de novo é
   * inofensivo — `releaseHold` é idempotente) quanto quando o rascunho é
   * descartado sem nunca ter sido confirmado.
   */
  private async clearPendingAction(
    context: ToolExecutionContext,
  ): Promise<void> {
    const state = await this.getConversationState(context.conversationId);
    await this.releasePendingHolds(context, state.pendingAction);
    delete state.pendingAction;
    await this.prisma.conversation.update({
      where: { id: context.conversationId },
      data: { state: state as Prisma.InputJsonValue },
    });
  }

  /**
   * Libera todo hold que o rascunho anterior segurava. Falha ao liberar não
   * derruba o turno — o pior caso é o hold expirar sozinho pelo TTL — mas
   * fica registrada no log com `requestId`/`aiRunId`, nunca silenciosa.
   */
  private async releasePendingHolds(
    context: ToolExecutionContext,
    previous: PendingAction | undefined,
  ): Promise<void> {
    if (!previous) return;
    for (const holdId of pendingActionHoldIds(previous)) {
      try {
        await this.scheduling.releaseHold(holdId, schedulingContext(context));
      } catch (error) {
        this.logger.warn(
          {
            requestId: context.requestId,
            tenantId: context.tenantId,
            aiRunId: context.aiRunId,
            conversationId: context.conversationId,
            holdId,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to release the hold of a replaced or discarded draft.",
        );
      }
    }
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
      // Servico inexistente e dominio; falha de infraestrutura durante a
      // busca (auth, timeout, 5xx) nao vira "servico nao encontrado" — sobe
      // para o caminho generico, que nunca expoe o detalhe real ao modelo.
      if (error instanceof InfrastructureError) throw error;
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

/**
 * Hold que nao serve mais para esta confirmacao (vencido, consumido,
 * liberado ou de outro horario). O Scheduling usa um unico codigo para
 * todos: a reacao da IA e sempre a mesma — consultar de novo.
 */
function isHoldExpired(error: unknown): boolean {
  return errorCode(error) === APPOINTMENT_HOLD_EXPIRED;
}

/** Todo hold que um rascunho segura, qualquer que seja o tipo dele. */
function pendingActionHoldIds(pending: PendingAction): string[] {
  switch (pending.type) {
    case "schedule":
    case "reschedule":
      return pending.holdId ? [pending.holdId] : [];
    case "recurring":
      return pending.holdIds;
    case "cancel":
      return [];
  }
}

/**
 * Fonte de agenda que nao tem hold: a proposta segue sem reserva.
 *
 * Um codigo unico e generico, e nao a lista dos integradores que nao
 * suportam hold: a IA enxerga apenas o gateway de agenda, e quem sabe qual
 * fonte esta por tras — e por que ela recusa — e o Scheduling.
 */
function holdsUnsupported(error: unknown): boolean {
  return errorCode(error) === "EXTERNAL_CALENDAR_HOLD_UNSUPPORTED";
}

function errorCode(error: unknown): string | null {
  if (error instanceof AppError) return error.code ?? null;
  if (isRecord(error) && typeof error.code === "string") return error.code;
  return null;
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
  recurrenceIntervalDays?: number | null;
}): ServiceSummary {
  return {
    id: service.id,
    name: service.name,
    duration: service.duration,
    priceType: service.priceType,
    price: service.price,
    recurrenceIntervalDays: service.recurrenceIntervalDays ?? null,
  };
}

function schedulingContext(
  context: ToolExecutionContext,
): SchedulingRequestContext {
  if (!context.tenantId || !context.userId || !context.requestId) {
    throw new InfrastructureError("Trusted scheduling context is required.", {
      code: "SCHEDULING_CONTEXT_REQUIRED",
      statusCode: 500,
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
