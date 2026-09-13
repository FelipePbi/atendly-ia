import { env } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import type { ModelProvider } from "../model/model-provider.js";
import { buildCustomerSummaryPrompt } from "../prompts/summary.js";
import type { SchedulingGateway } from "../scheduling-service/client.js";
import type { BusinessContext } from "../tenant-config/business-context.js";
import type { CustomerMemoryPromptItem } from "./customer-memory.js";

/**
 * Material autorizado que o resumo consegue pedir.
 *
 * Deliberadamente estreito: notas e tags **so** chegam pelo `ai-context` do
 * Scheduling, que ja e a projecao autorizada da pessoa. O resumo nunca le
 * `CustomerNote`/`CustomerTag` por fora dessa fronteira, entao nao existe
 * caminho de codigo em que uma nota nao autorizada alcance o prompt.
 */
export type CustomerSummarySchedulingPort = Pick<
  SchedulingGateway,
  "getAuthorizedCustomerContext" | "findFutureAppointmentsForCustomer"
>;

export interface CustomerMemoryReadPort {
  loadAllowedForCustomer(input: {
    tenantId: string;
    customerId: string;
    now?: Date;
  }): Promise<CustomerMemoryPromptItem[]>;
}

export interface GenerateCustomerSummaryInput {
  tenantId: string;
  userId: string;
  requestId: string;
  customerId: string;
  businessContext: BusinessContext;
}

export interface CustomerSummaryResult {
  customerId: string;
  summary: string;
  promptVersion: string;
  /** Nunca nulo: sem `AiRun` o resumo nao e gerado. */
  aiRunId: string;
  /** Material efetivamente usado, para a profissional saber de onde veio. */
  sources: {
    memory: number;
    notes: number;
    tags: number;
    upcomingAppointments: number;
  };
}

/**
 * Resumo do cliente sob demanda (Goal012).
 *
 * Tres regras que o codigo precisa tornar impossiveis de burlar:
 *
 * 1. **material autorizado apenas** — memoria permitida, notas e tags do
 *    `ai-context` e proximos atendimentos; nada mais e lido;
 * 2. **nao vira verdade** — o texto volta para quem pediu e nao e persistido
 *    como memoria, nota nem cadastro. A unica escrita e o `AiRun` de auditoria;
 * 3. **auditavel** — o `AiRun` nasce com `kind = SUMMARY` e a versao efetiva do
 *    prompt de resumo.
 */
export class CustomerSummaryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly memory: CustomerMemoryReadPort,
    private readonly scheduling: CustomerSummarySchedulingPort,
    private readonly modelProvider: ModelProvider,
  ) {}

  async generate(
    input: GenerateCustomerSummaryInput,
  ): Promise<CustomerSummaryResult> {
    const context = {
      tenantId: input.tenantId,
      userId: input.userId,
      requestId: input.requestId,
    };

    const [authorized, appointments, memory] = await Promise.all([
      this.scheduling.getAuthorizedCustomerContext(input.customerId, context),
      this.scheduling.findFutureAppointmentsForCustomer(
        input.customerId,
        input.businessContext,
        context,
      ),
      this.memory.loadAllowedForCustomer({
        tenantId: input.tenantId,
        customerId: input.customerId,
      }),
    ]);

    const prompt = buildCustomerSummaryPrompt({
      customerName: authorized.name,
      memory,
      notes: authorized.notes,
      tags: authorized.tags,
      upcomingAppointments: appointments.map((appointment) => ({
        date: appointment.date,
        startTime: appointment.startTime,
        serviceName: appointment.serviceName,
      })),
    });

    const run = await this.startSummaryRun(input, prompt.version);

    try {
      const response = await this.modelProvider.invoke({
        instructions: prompt.text,
        // Resumo nao e conversa e nao oferece nenhuma tool: o modelo so pode
        // devolver texto, entao nao existe caminho de efeito a partir daqui.
        messages: [
          {
            role: "user",
            content:
              "Resuma o que a profissional precisa saber antes deste atendimento.",
          },
        ],
        turns: [],
        tools: [],
      });
      const summary = response.text.trim();
      await this.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          outputText: summary,
          completedAt: new Date(),
        },
      });
      return {
        customerId: input.customerId,
        summary,
        promptVersion: prompt.version,
        aiRunId: run.id,
        sources: {
          memory: memory.length,
          notes: authorized.notes.length,
          tags: authorized.tags.length,
          upcomingAppointments: appointments.length,
        },
      };
    } catch (error) {
      await this.prisma.aiRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          error: toErrorMessage(error),
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * `AiRun` do resumo, criado **antes** da chamada ao modelo.
   *
   * `AiRun` pertence a um canal e a uma conversa, entao o registro fica na
   * conversa mais recente do contato vinculado a pessoa — que e exatamente o
   * lugar onde a profissional vai procurar a auditoria. Sem contato vinculado
   * nao ha resumo: memoria do cliente so existe para pessoa vinculada.
   *
   * Sem conversa onde ancorar o `AiRun` tambem nao ha resumo. Gerar assim mesmo
   * seria uma chamada real de modelo sobre material autorizado da pessoa sem
   * nenhum registro — exatamente o que o Goal proibe ao exigir
   * `AiRun.kind = SUMMARY`. A recusa e nomeada para a profissional entender que
   * falta historico de conversa, nao permissao.
   */
  private async startSummaryRun(
    input: GenerateCustomerSummaryInput,
    promptVersion: string,
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: { tenantId: input.tenantId, customerId: input.customerId },
      orderBy: { customerLinkedAt: "desc" },
      select: { id: true },
    });
    if (!contact) {
      throw new AppError("Customer is not linked to a contact.", {
        statusCode: 404,
        code: "CUSTOMER_NOT_LINKED",
      });
    }
    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId: input.tenantId, contactId: contact.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, channelId: true },
    });
    if (!conversation) {
      throw new AppError(
        "Customer has no conversation to anchor the summary audit record.",
        { statusCode: 409, code: "SUMMARY_NOT_AUDITABLE" },
      );
    }

    return this.prisma.aiRun.create({
      data: {
        tenantId: input.tenantId,
        channelId: conversation.channelId,
        conversationId: conversation.id,
        provider: "openai",
        model: env.OPENAI_MODEL,
        promptVersion,
        kind: "SUMMARY",
        inputMessageIds: [],
      },
    });
  }
}
