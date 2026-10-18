import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  type DiagnosticLogger,
  maskPhone,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../lib/errors.js";
import { normalizePhone } from "../../lib/phone.js";
import { EvolutionProvider } from "../channel/adapters/evolution/EvolutionProvider.js";
import { ChannelConnectionService } from "../channel/ChannelConnectionService.js";
import {
  resolveChannelConversation,
  resolveContactKeyForPhone,
} from "../channel/conversation-resolution.js";
import { replyAllowedForPhone } from "../graph/message-graph.js";
import { classifySendFailure } from "../outbox/outbox-policy.js";
import { OutboxStore } from "../outbox/OutboxStore.js";
import type { NotificationProviderFactory } from "../reminders/NotificationDeliveryService.js";
import { tenantSandboxGate } from "../sandbox/SandboxGate.js";
import type { GraphSessionPort } from "../session/SessionService.js";
import { loadTenantExecutionContext } from "../tenant-config/tenant-execution-context.js";
import { composeReturnText } from "./return-message.js";
import type {
  ClaimedReturnTarget,
  ReturnFailReason,
  ReturnSettlementOutcome,
  ReturnSkipReason,
  SettleReturnTargetInput,
} from "./return-types.js";

/**
 * Entrega de uma mensagem de retorno, do lado da IA (D-206).
 *
 * O dono da agenda ja escolheu a cliente, conferiu as regras dela e mandou os
 * fatos (horarios livres, incentivo, texto-base). Aqui ficam as regras do
 * **contato** e do **canal**, pelo mesmo caminho dos lembretes:
 *
 * - IA desligada ou canal fora do ar: **adiada** (volta para a fila; o
 *   negocio tenta de novo em 30 minutos). Mensagem de retorno sem a IA para
 *   conduzir a resposta e pior do que mensagem nenhuma;
 * - numero fora da lista de validacao local (`AI_REPLY_ONLY_PHONES`),
 *   contato ignorado ou conversa pessoal: **pulada**, com motivo;
 * - lembrete unico depois de a cliente ja ter respondido: **pulado**;
 * - o resto sai pelo provedor do negocio, com o sandbox do negocio (D-199) e
 *   o telefone da agenda resolvido para a conversa que ja existe (9o
 *   digito, `resolveContactKeyForPhone`).
 *
 * A saida e gravada antes do transporte com `correlationId` deterministico:
 * a reivindicacao repetida depois de uma queda nunca vira segunda mensagem.
 * Nada aqui assume atendimento humano: a resposta da cliente cai na IA.
 */

const EVOLUTION_PROVIDER = "EVOLUTION_GO" as const;
const MIN_CONTACT_DIGITS = 10;

export interface ReturnSettlementPort {
  settleReturnTarget(input: SettleReturnTargetInput): Promise<void>;
}

export type ReturnDeliveryPrisma = Pick<
  PrismaClient,
  | "channelConnection"
  | "conversation"
  | "message"
  | "aiTenantConfig"
  | "contact"
  | "returnInvitation"
>;

export interface ReturnDeliveryDeps {
  prisma: ReturnDeliveryPrisma;
  settlement: ReturnSettlementPort;
  sessions: Pick<GraphSessionPort, "resolveContext">;
  channels?: Pick<ChannelConnectionService, "resolveChannelCredential">;
  outbox?: Pick<OutboxStore, "markSent" | "markUndelivered">;
  providerFactory?: NotificationProviderFactory;
  logger?: DiagnosticLogger;
  /** Lista de validacao local; so o teste troca. */
  replyAllowList?: string;
}

export interface ReturnDeliveryOutcome {
  targetId: string;
  tenantId: string;
  outcome: ReturnSettlementOutcome;
  reason: ReturnSkipReason | ReturnFailReason | null;
  text?: string;
  conversationId?: string;
  deduplicated?: boolean;
}

/**
 * Telefone da agenda em digitos com DDI. Numero brasileiro gravado sem o 55
 * (10 ou 11 digitos) ganha o 55: e o que o WhatsApp usa como chave.
 */
export function returnDestinationDigits(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

const defaultProviderFactory: NotificationProviderFactory = (input) =>
  new EvolutionProvider(
    input.logger,
    input.credential,
    input.externalInstanceId,
    input.sandbox,
  );

export class ReturnDeliveryService {
  private readonly prisma: ReturnDeliveryPrisma;
  private readonly settlement: ReturnSettlementPort;
  private readonly sessions: Pick<GraphSessionPort, "resolveContext">;
  private readonly channels: Pick<
    ChannelConnectionService,
    "resolveChannelCredential"
  >;
  private readonly outbox: Pick<OutboxStore, "markSent" | "markUndelivered">;
  private readonly providerFactory: NotificationProviderFactory;
  private readonly logger: DiagnosticLogger;
  private readonly replyAllowList?: string;

  constructor(deps: ReturnDeliveryDeps) {
    this.prisma = deps.prisma;
    this.settlement = deps.settlement;
    this.sessions = deps.sessions;
    this.channels =
      deps.channels ??
      new ChannelConnectionService(deps.prisma as unknown as PrismaClient);
    this.outbox =
      deps.outbox ?? new OutboxStore(deps.prisma as unknown as PrismaClient);
    this.providerFactory = deps.providerFactory ?? defaultProviderFactory;
    this.logger = deps.logger ?? noopDiagnosticLogger;
    this.replyAllowList = deps.replyAllowList;
  }

  async deliver(target: ClaimedReturnTarget): Promise<ReturnDeliveryOutcome> {
    const outcome = await this.resolveOutcome(target);
    try {
      await this.settlement.settleReturnTarget({
        tenantId: target.tenantId,
        targetId: target.id,
        leaseToken: target.leaseToken,
        outcome: outcome.outcome,
        reason: outcome.reason,
        messageBody: outcome.outcome === "SENT" ? (outcome.text ?? null) : null,
      });
    } catch (error) {
      this.logger.error(
        {
          tenantId: target.tenantId,
          targetId: target.id,
          outcome: outcome.outcome,
          err: toErrorMessage(error),
        },
        "Return target was processed but could not be settled",
      );
    }
    return outcome;
  }

  private async resolveOutcome(
    target: ClaimedReturnTarget,
  ): Promise<ReturnDeliveryOutcome> {
    const base = { targetId: target.id, tenantId: target.tenantId };
    const skip = (reason: ReturnSkipReason): ReturnDeliveryOutcome => ({
      ...base,
      outcome: "SKIPPED",
      reason,
    });

    const { aiSettings } = await loadTenantExecutionContext(
      this.prisma,
      target.tenantId,
    );
    if (!aiSettings.aiEnabled) {
      return { ...base, outcome: "DEFERRED", reason: null };
    }
    const channel = await this.resolveChannel(target.tenantId);
    if (!channel) return { ...base, outcome: "DEFERRED", reason: null };

    const phone = returnDestinationDigits(target.facts.customerPhone);
    if (phone.length < MIN_CONTACT_DIGITS) return skip("INVALID_PHONE");
    // Validacao local com o WhatsApp real: so os numeros da lista recebem.
    if (!replyAllowedForPhone(phone, this.replyAllowList)) {
      return skip("NOT_ALLOWED_LOCALLY");
    }

    const externalContactId = await resolveContactKeyForPhone(this.prisma, {
      tenantId: target.tenantId,
      channelId: channel.id,
      phone,
    });
    const conversation = await resolveChannelConversation(this.prisma, {
      tenantId: target.tenantId,
      channelId: channel.id,
      externalContactId,
      customerName: target.facts.customerName,
    });
    const session = await this.sessions.resolveContext({
      tenantId: target.tenantId,
      channelId: channel.id,
      conversationId: conversation.id,
      externalContactId,
      customerName: target.facts.customerName,
    });
    if (session.ignored) return skip("CONTACT_IGNORED");
    if (session.category === "PERSONAL") return skip("PERSONAL_CONTACT");

    if (target.leaseKind === "FOLLOW_UP" && target.sentAt) {
      const replied = await this.prisma.message.findFirst({
        where: {
          tenantId: target.tenantId,
          conversationId: conversation.id,
          direction: "INBOUND",
          createdAt: { gt: new Date(target.sentAt) },
        },
        select: { id: true },
      });
      if (replied) return skip("REPLIED");
    }

    const existing = await this.prisma.message.findUnique({
      where: {
        tenantId_channelId_correlationId: {
          tenantId: target.tenantId,
          channelId: channel.id,
          correlationId: target.correlationId,
        },
      },
      select: { id: true, deliveryState: true, body: true },
    });
    if (existing) {
      return {
        ...base,
        ...settlementForExisting(existing.deliveryState),
        text: existing.body,
        conversationId: conversation.id,
        deduplicated: true,
      };
    }

    const text = composeReturnText({
      style: aiSettings.tone,
      facts: target.facts,
    });

    let messageRecordId: string;
    try {
      const pending = await this.prisma.message.create({
        data: {
          tenantId: target.tenantId,
          channelId: channel.id,
          conversationId: conversation.id,
          externalMessageId: target.correlationId,
          correlationId: target.correlationId,
          direction: "OUTBOUND",
          // Mensagem da IA em nome do negocio, nunca da profissional.
          source: "AI",
          role: "assistant",
          body: text,
          deliveryState: "PENDING",
          deliveryUpdatedAt: new Date(),
        },
        select: { id: true },
      });
      messageRecordId = pending.id;
    } catch (error) {
      const raced = await this.prisma.message.findUnique({
        where: {
          tenantId_channelId_correlationId: {
            tenantId: target.tenantId,
            channelId: channel.id,
            correlationId: target.correlationId,
          },
        },
        select: { deliveryState: true, body: true },
      });
      if (!raced) throw error;
      return {
        ...base,
        ...settlementForExisting(raced.deliveryState),
        text: raced.body,
        deduplicated: true,
      };
    }

    try {
      const provider = this.providerFactory({
        credential: channel.credential,
        externalInstanceId: channel.externalInstanceId,
        logger: this.logger,
        // Sandbox do negocio (D-199): suprimida, a saida conta como enviada.
        sandbox: tenantSandboxGate({
          prisma: this.prisma,
          tenantId: target.tenantId,
          logger: this.logger,
        }),
      });
      const sent = await provider.sendText({
        to: externalContactId,
        text,
        correlationId: target.correlationId,
      });
      await this.outbox.markSent({
        messageRecordId,
        providerMessageId: sent.messageId ?? target.correlationId,
        rawPayload: sent.raw,
      });
      await this.recordInvitation(target, {
        channelId: channel.id,
        conversationId: conversation.id,
      });
      this.logger.info(
        {
          tenantId: target.tenantId,
          targetId: target.id,
          leaseKind: target.leaseKind,
          to: maskPhone(externalContactId),
        },
        "Return message was delivered through the tenant channel",
      );
      return {
        ...base,
        outcome: "SENT",
        reason: null,
        text,
        conversationId: conversation.id,
      };
    } catch (error) {
      const classification = classifySendFailure(error);
      await this.outbox.markUndelivered({
        messageRecordId,
        state: classification.state,
        detail: classification.detail,
      });
      this.logger.warn(
        {
          tenantId: target.tenantId,
          targetId: target.id,
          deliveryState: classification.state,
          err: toErrorMessage(error),
        },
        "Return message could not be confirmed as delivered",
      );
      return {
        ...base,
        outcome: "FAILED",
        reason:
          classification.state === "FAILED"
            ? "TRANSPORT_FAILED"
            : "TRANSPORT_UNKNOWN",
      };
    }
  }

  /**
   * O que a conversa precisa saber quando a cliente responder: rotina,
   * servico, data esperada, incentivo e horarios oferecidos.
   */
  private async recordInvitation(
    target: ClaimedReturnTarget,
    where: { channelId: string; conversationId: string },
  ): Promise<void> {
    const now = new Date();
    if (target.leaseKind === "FOLLOW_UP") {
      await this.prisma.returnInvitation.updateMany({
        where: { tenantId: target.tenantId, targetId: target.id },
        data: { followUpSentAt: now },
      });
      return;
    }
    const facts = target.facts;
    const data = {
      channelId: where.channelId,
      conversationId: where.conversationId,
      campaignId: target.campaignId,
      customerId: facts.customerId,
      kind: facts.kind,
      serviceName: facts.serviceName,
      expectedDate: facts.expectedDate,
      incentive: facts.incentive,
      offeredSlots: facts.offeredSlots as unknown as Prisma.InputJsonValue,
      habit: (facts.habit ?? undefined) as Prisma.InputJsonValue | undefined,
      sentAt: now,
    };
    await this.prisma.returnInvitation.upsert({
      where: {
        tenantId_targetId: { tenantId: target.tenantId, targetId: target.id },
      },
      create: { tenantId: target.tenantId, targetId: target.id, ...data },
      update: data,
    });
  }

  private async resolveChannel(tenantId: string): Promise<{
    id: string;
    externalInstanceId: string;
    credential: string;
  } | null> {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider: EVOLUTION_PROVIDER } },
    });
    if (!connection || connection.status !== "ACTIVE") return null;
    try {
      return {
        id: connection.id,
        externalInstanceId: connection.externalInstanceId,
        credential: this.channels.resolveChannelCredential(connection),
      };
    } catch (error) {
      this.logger.warn(
        { tenantId, err: toErrorMessage(error) },
        "Tenant channel has no usable credential for return delivery",
      );
      return null;
    }
  }
}

function settlementForExisting(
  deliveryState: string | null,
): Pick<ReturnDeliveryOutcome, "outcome" | "reason"> {
  if (deliveryState === "SENT") return { outcome: "SENT", reason: null };
  if (deliveryState === "FAILED") {
    return { outcome: "FAILED", reason: "TRANSPORT_FAILED" };
  }
  return { outcome: "FAILED", reason: "TRANSPORT_UNKNOWN" };
}
