import type { PrismaClient } from "../../generated/prisma/client.js";
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
import type { WhatsAppProvider } from "../channel/ports/WhatsAppProvider.js";
import { classifySendFailure } from "../outbox/outbox-policy.js";
import { OutboxStore } from "../outbox/OutboxStore.js";
import { type SandboxGate, tenantSandboxGate } from "../sandbox/SandboxGate.js";
import type {
  ClaimedNotificationIntent,
  NotificationIntentReason,
  NotificationSettlementOutcome,
  SettleNotificationIntentInput,
} from "../scheduling-service/types.js";
import type { GraphSessionPort } from "../session/SessionService.js";
import { loadTenantExecutionContext } from "../tenant-config/tenant-execution-context.js";
import { composeNotificationText } from "./notification-message.js";

/**
 * Entrega de uma intencao de envio, do lado da IA (Goal021).
 *
 * O TARGET_ARCHITECTURE divide o trabalho em dois: o dono da agenda decide
 * **quando** e **com que fatos**; a IA aplica **elegibilidade do contato e
 * estilo** e entrega. Este servico e exatamente a segunda metade — ele nao
 * decide antecedencia, nao revalida compromisso e nao formata instante.
 *
 * Tres desfechos distintos, e a distincao entre eles e deliberada:
 *
 * - **contato `ignored`** → dispensada. Regra absoluta do produto, que
 *   prevalece sobre a sessao;
 * - **IA nao efetivamente habilitada** → dispensada, e **avaliada primeiro**.
 *   Perguntar "confirma?" para um numero que ninguem vai ler e pior do que
 *   lembrete nenhum; e negocio com a automacao desligada nao produz alerta
 *   operacional por nao ter canal (Goal025/WU-04);
 * - **canal do negocio nao conectado, com a IA ligada** → **falha** auditavel.
 *   E problema operacional do negocio, nao decisao do cliente, e some da vista
 *   se for tratado como dispensa;
 *
 * A saida e gravada **antes** do transporte, com o `correlationId`
 * deterministico que o dono derivou da identidade da intencao. Antes de
 * enviar, a existencia de uma saida com esse `correlationId` e verificada: e
 * isso — e a unicidade `(tenantId, channelId, correlationId)` no banco — que
 * faz a reivindicacao repetida depois de uma queda do processo nao virar uma
 * segunda mensagem ao cliente.
 *
 * A entrega **nao** chama `assumeHumanControl` e nao usa
 * `POST /internal/conversations/:id/messages`, que assume o atendimento humano
 * antes do transporte de proposito. Lembrete nao e a profissional assumindo:
 * se ele passasse por ali, a conversa sairia do controle da IA e a resposta do
 * cliente nunca seria interpretada.
 */

const EVOLUTION_PROVIDER = "EVOLUTION_GO" as const;

/** Numero minimo de digitos que ainda descreve um telefone discavel. */
const MIN_CONTACT_DIGITS = 6;

/** Como o provider do tenant e construido. Trocavel so para duble de teste. */
export type NotificationProviderFactory = (input: {
  credential: string;
  externalInstanceId: string;
  logger: DiagnosticLogger;
  /** Modo sandbox do negocio (D-199); o provedor o consulta antes de enviar. */
  sandbox: SandboxGate;
}) => WhatsAppProvider;

const defaultProviderFactory: NotificationProviderFactory = (input) =>
  new EvolutionProvider(
    input.logger,
    input.credential,
    input.externalInstanceId,
    input.sandbox,
  );

/** O que a entrega precisa do dono da agenda. Deliberadamente estreito. */
export interface NotificationSettlementPort {
  settleNotificationIntent(
    input: SettleNotificationIntentInput,
  ): Promise<unknown>;
}

/** Recorte do Prisma que a entrega usa. */
export type NotificationDeliveryPrisma = Pick<
  PrismaClient,
  "channelConnection" | "conversation" | "message" | "aiTenantConfig"
>;

export interface NotificationDeliveryDeps {
  prisma: NotificationDeliveryPrisma;
  settlement: NotificationSettlementPort;
  /** Resolucao de contato e sessao: a **mesma** do processamento de entrada. */
  sessions: Pick<GraphSessionPort, "resolveContext">;
  channels?: Pick<ChannelConnectionService, "resolveChannelCredential">;
  outbox?: Pick<OutboxStore, "markSent" | "markUndelivered">;
  providerFactory?: NotificationProviderFactory;
  logger?: DiagnosticLogger;
}

/** Desfecho declarado ao dono, na forma em que ele e liquidado. */
export interface NotificationDeliveryOutcome {
  intentId: string;
  tenantId: string;
  outcome: NotificationSettlementOutcome;
  reason: NotificationIntentReason | null;
  detail: string | null;
  correlationId: string;
  /** Id da saida persistida, quando ela chegou a existir. */
  messageRecordId?: string;
  /** `true` quando a saida ja existia e o transporte nao foi chamado de novo. */
  deduplicated?: boolean;
}

export class NotificationDeliveryService {
  private readonly prisma: NotificationDeliveryPrisma;
  private readonly settlement: NotificationSettlementPort;
  private readonly sessions: Pick<GraphSessionPort, "resolveContext">;
  private readonly channels: Pick<
    ChannelConnectionService,
    "resolveChannelCredential"
  >;
  private readonly outbox: Pick<OutboxStore, "markSent" | "markUndelivered">;
  private readonly providerFactory: NotificationProviderFactory;
  private readonly logger: DiagnosticLogger;

  constructor(deps: NotificationDeliveryDeps) {
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
  }

  /**
   * Entrega uma intencao reivindicada e liquida o resultado no dono.
   *
   * A liquidacao acontece em **todos** os caminhos: dispensa, falha e envio.
   * Intencao que ficasse sem liquidar so voltaria a existir quando o lease
   * vencesse — com tentativa gasta, e por nada.
   */
  async deliver(
    intent: ClaimedNotificationIntent,
  ): Promise<NotificationDeliveryOutcome> {
    const outcome = await this.resolveOutcome(intent);
    await this.settle(intent, outcome);
    return outcome;
  }

  private async resolveOutcome(
    intent: ClaimedNotificationIntent,
  ): Promise<NotificationDeliveryOutcome> {
    const base = {
      intentId: intent.id,
      tenantId: intent.tenantId,
      correlationId: intent.correlationId,
    };

    // 1. Aptidao efetiva da IA para o negocio, pelo mesmo caminho que o turno
    //    de entrada le (Goal019): `AiTenantConfig` do banco, nunca payload.
    //
    //    Vem **antes** do vinculo (Goal025/WU-04). Negocio com a automacao
    //    desligada nao ia enviar de qualquer jeito, e a ordem anterior fazia
    //    a ausencia de canal falar mais alto: a conta cujo dono pediu a
    //    exclusao — que desliga a IA e derruba o canal na mesma passada —
    //    ganhava `CHANNEL_NOT_CONNECTED`, ou seja, falha auditavel e alerta
    //    `REMINDER_FAILED` na central por ter obedecido ao proprio dono.
    //    Para todo o resto nada muda: canal ausente com a IA ligada continua
    //    sendo falha, que e o caso operacional que o alerta existe para
    //    mostrar.
    const { aiSettings } = await loadTenantExecutionContext(
      this.prisma,
      intent.tenantId,
    );
    if (!aiSettings.aiEnabled) {
      return {
        ...base,
        outcome: "DISMISSED",
        reason: "AI_NOT_ENABLED",
        detail: "AI is not enabled for this tenant",
      };
    }

    // 2. Vinculo do negocio. Contato e conversa so tem identidade dentro de um
    //    canal: sem vinculo nao ha o que resolver adiante. Vinculo ausente,
    //    inativo ou sem credencial projetada e a mesma situacao para quem
    //    espera a mensagem — o negocio nao esta conectado.
    const channel = await this.resolveChannel(intent.tenantId);
    if (!channel) {
      return {
        ...base,
        outcome: "FAILED",
        reason: "CHANNEL_NOT_CONNECTED",
        detail: "tenant has no active WhatsApp channel to deliver from",
      };
    }

    const customerPhone = normalizePhone(intent.facts.customerPhone ?? "");
    if (customerPhone.length < MIN_CONTACT_DIGITS) {
      // O dono ja dispensa cliente sem telefone; aqui so sobra o numero que
      // nao descreve um destino. Mesmo vocabulario, nunca erro.
      return {
        ...base,
        outcome: "DISMISSED",
        reason: "CUSTOMER_WITHOUT_PHONE",
        detail: "customer phone is not a dialable number",
      };
    }

    // O telefone da agenda pode ter o 9o digito que o WhatsApp nao usa:
    // a conversa e a que ja existe com a cliente (ou a chave do WhatsApp).
    const externalContactId = await resolveContactKeyForPhone(this.prisma, {
      tenantId: intent.tenantId,
      channelId: channel.id,
      phone: customerPhone,
    });

    // 3. Contato e conversa pelo **mesmo caminho** do processamento de
    //    entrada. `resolveContext` nao assume atendimento humano: ele so
    //    resolve o contato do canal e a sessao vigente.
    const conversation = await resolveChannelConversation(this.prisma, {
      tenantId: intent.tenantId,
      channelId: channel.id,
      externalContactId,
      customerName: intent.facts.customerName,
    });
    const session = await this.sessions.resolveContext({
      tenantId: intent.tenantId,
      channelId: channel.id,
      conversationId: conversation.id,
      externalContactId,
      customerName: intent.facts.customerName,
    });
    if (session.ignored) {
      return {
        ...base,
        outcome: "DISMISSED",
        reason: "CONTACT_IGNORED",
        detail: "contact is ignored for this tenant",
      };
    }

    // 4. Dedupe pela saida. Uma saida com este `correlationId` significa que
    //    uma tentativa deste mesmo lembrete ja existiu; o transporte nao e
    //    chamado de novo, sob nenhum estado dela.
    const existing = await this.prisma.message.findUnique({
      where: {
        tenantId_channelId_correlationId: {
          tenantId: intent.tenantId,
          channelId: channel.id,
          correlationId: intent.correlationId,
        },
      },
      select: { id: true, deliveryState: true },
    });
    if (existing) {
      return {
        ...base,
        ...this.settlementForExistingOutbound(existing.deliveryState),
        messageRecordId: existing.id,
        deduplicated: true,
      };
    }

    const text = composeNotificationText({
      style: aiSettings.tone,
      facts: intent.facts,
    });

    // 5. A saida existe **antes** do transporte, em `PENDING`. Ela nunca e
    //    apagada: timeout depois do envio nao prova que a mensagem nao chegou.
    let messageRecordId: string;
    try {
      const pending = await this.prisma.message.create({
        data: {
          tenantId: intent.tenantId,
          channelId: channel.id,
          conversationId: conversation.id,
          externalMessageId: intent.correlationId,
          correlationId: intent.correlationId,
          direction: "OUTBOUND",
          // A mensagem e da IA. `OWNER` diria que a profissional mandou.
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
      // Corrida com outra tentativa da mesma intencao: a unicidade
      // `(tenantId, channelId, correlationId)` decide, e quem perde nao envia.
      const raced = await this.prisma.message.findUnique({
        where: {
          tenantId_channelId_correlationId: {
            tenantId: intent.tenantId,
            channelId: channel.id,
            correlationId: intent.correlationId,
          },
        },
        select: { id: true, deliveryState: true },
      });
      if (!raced) throw error;
      return {
        ...base,
        ...this.settlementForExistingOutbound(raced.deliveryState),
        messageRecordId: raced.id,
        deduplicated: true,
      };
    }

    try {
      const provider = this.providerFactory({
        credential: channel.credential,
        externalInstanceId: channel.externalInstanceId,
        logger: this.logger,
        // Lembrete e aviso de alteracao passam pelo sandbox do negocio
        // (D-199): suprimido, o desfecho e `SENT` como o de um envio real.
        sandbox: tenantSandboxGate({
          prisma: this.prisma,
          tenantId: intent.tenantId,
          logger: this.logger,
        }),
      });
      const sent = await provider.sendText({
        to: externalContactId,
        text,
        correlationId: intent.correlationId,
      });
      await this.outbox.markSent({
        messageRecordId,
        providerMessageId: sent.messageId ?? intent.correlationId,
        rawPayload: sent.raw,
      });
      this.logger.info(
        {
          tenantId: intent.tenantId,
          channelId: channel.id,
          intentId: intent.id,
          correlationId: intent.correlationId,
          to: maskPhone(externalContactId),
        },
        "Notification intent was delivered through the tenant channel",
      );
      return {
        ...base,
        outcome: "SENT",
        reason: null,
        detail: null,
        messageRecordId,
      };
    } catch (error) {
      // Mesma classificacao de toda saida da plataforma: "nao saiu"
      // (`FAILED`) e "nao da para afirmar" (`UNKNOWN`) sao coisas diferentes,
      // e nenhuma delas apaga a tentativa.
      const classification = classifySendFailure(error);
      await this.outbox.markUndelivered({
        messageRecordId,
        state: classification.state,
        detail: classification.detail,
      });
      this.logger.warn(
        {
          tenantId: intent.tenantId,
          channelId: channel.id,
          intentId: intent.id,
          correlationId: intent.correlationId,
          deliveryState: classification.state,
          deliveryDetail: classification.detail,
          err: toErrorMessage(error),
        },
        "Notification intent could not be confirmed as delivered",
      );
      return {
        ...base,
        outcome: "FAILED",
        reason:
          classification.state === "FAILED"
            ? "TRANSPORT_FAILED"
            : "TRANSPORT_UNKNOWN",
        detail: classification.detail,
        messageRecordId,
      };
    }
  }

  /**
   * Desfecho de quem encontrou a saida ja gravada.
   *
   * `SENT` e prova de que a mensagem saiu. Qualquer outro estado e uma
   * tentativa cujo desfecho este processo nao pode mais afirmar — reenviar
   * seria arriscar a segunda mensagem que este Goal existe para impedir —,
   * entao vira falha auditavel com motivo, com a tentativa preservada.
   */
  private settlementForExistingOutbound(
    deliveryState: string | null,
  ): Pick<NotificationDeliveryOutcome, "outcome" | "reason" | "detail"> {
    if (deliveryState === "SENT") {
      return { outcome: "SENT", reason: null, detail: null };
    }
    if (deliveryState === "FAILED") {
      return {
        outcome: "FAILED",
        reason: "TRANSPORT_FAILED",
        detail: "a previous attempt was recorded as not delivered",
      };
    }
    return {
      outcome: "FAILED",
      reason: "TRANSPORT_UNKNOWN",
      detail: "a previous attempt exists and its delivery cannot be asserted",
    };
  }

  /**
   * Vinculo ativo do negocio com a credencial de envio ja aberta.
   *
   * Credencial nao projetada devolve `null` como vinculo ausente: para quem
   * espera a mensagem os dois casos sao o mesmo — o negocio nao esta
   * conectado — e os dois sao problema operacional visivel, nunca silencio.
   */
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
        "Tenant channel has no usable credential for notification delivery",
      );
      return null;
    }
  }

  /**
   * Liquidacao no dono. Falhar aqui nao apaga o que ja aconteceu: a saida
   * persistida continua contando a verdade, e o lease vencido devolve a
   * intencao para pendente com tentativa contada.
   */
  private async settle(
    intent: ClaimedNotificationIntent,
    outcome: NotificationDeliveryOutcome,
  ): Promise<void> {
    try {
      await this.settlement.settleNotificationIntent({
        tenantId: intent.tenantId,
        intentId: intent.id,
        leaseToken: intent.leaseToken,
        outcome: outcome.outcome,
        reason: outcome.reason,
        detail: outcome.detail,
        correlationId: intent.correlationId,
      });
    } catch (error) {
      this.logger.error(
        {
          tenantId: intent.tenantId,
          intentId: intent.id,
          outcome: outcome.outcome,
          reason: outcome.reason,
          err: toErrorMessage(error),
        },
        "Notification intent was processed but could not be settled",
      );
    }
  }
}
