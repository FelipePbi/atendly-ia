import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  type DiagnosticLogger,
  maskPhone,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import { EvolutionProvider } from "../channel/adapters/evolution/EvolutionProvider.js";
import { ChannelConnectionService } from "../channel/ChannelConnectionService.js";
import type { WhatsAppProvider } from "../channel/ports/WhatsAppProvider.js";
import {
  type AiReplyDispatchOutcome,
  type AiReplyPartProgressPort,
  dispatchAiReply,
} from "../outbox/ai-reply-dispatch.js";
import { classifySendFailure } from "../outbox/outbox-policy.js";
import { OutboxStore } from "../outbox/OutboxStore.js";

/**
 * Estado de entrega da resposta que a IA gravou.
 *
 * Mesmo vocabulario de `Message.deliveryState`, e pelo mesmo motivo: `SENT` e
 * prova de que a mensagem saiu, `FAILED` prova que ela nao saiu e `UNKNOWN` e
 * a unica resposta honesta quando o transporte nao respondeu. Nao existe aqui
 * um quarto valor que signifique "provavelmente saiu".
 */
export type ActivationTestReplyDeliveryState = "SENT" | "FAILED" | "UNKNOWN";

export interface ActivationTestReplyDelivery {
  state: ActivationTestReplyDeliveryState;
  providerMessageId?: string;
  detail?: string;
}

export interface ActivationTestReplyInput {
  tenantId: string;
  /** Vinculo do tenant: e por ele que a resposta sai, nunca pela plataforma. */
  channelId: string;
  conversationId: string;
  /** Linha que a IA ja gravou (`Message`), em `PENDING`, esperando o envio. */
  messageRecordId: string;
  text: string;
  correlationId: string;
  /** Destino: o numero da plataforma, que e o cliente simulado da conversa. */
  to: string;
  quotedMessageId?: string;
  requestId?: string;
}

/**
 * Saida da resposta da IA pelo canal **do tenant**.
 *
 * Esta porta existe porque `AssistantService.handleIncomingText` nao envia
 * nada: o envio e um no do grafo (`sendResponse`), e quem chama o assistente
 * direto — como a execucao do teste real — fica com a resposta gravada em
 * `deliveryState: PENDING` e nenhuma mensagem no WhatsApp. O teste real
 * afirmava que a IA tinha respondido ao cliente simulado enquanto nada tinha
 * saido do canal do negocio (Goal019, blocker 2 da rodada 2).
 *
 * O caminho e o mesmo do produto: credencial do vinculo do tenant, adapter
 * Evolution vigente e `Message.deliveryState` reconciliado pelo outbox. Nao ha
 * transporte novo, e a credencial da plataforma nao e alcancavel daqui.
 */
export interface ActivationTestReplyPort {
  sendAiReply(
    input: ActivationTestReplyInput,
  ): Promise<ActivationTestReplyDelivery>;
}

/** Como o provider do tenant e construido. Trocavel so para dublê de teste. */
export type TenantProviderFactory = (input: {
  credential: string;
  externalInstanceId: string;
  logger: DiagnosticLogger;
}) => WhatsAppProvider;

const defaultProviderFactory: TenantProviderFactory = (input) =>
  new EvolutionProvider(
    input.logger,
    input.credential,
    input.externalInstanceId,
  );

export class TenantChannelReplySender implements ActivationTestReplyPort {
  private readonly channels: ChannelConnectionService;
  private readonly outbox: Pick<OutboxStore, "markSent" | "markUndelivered">;
  private readonly progress?: AiReplyPartProgressPort;
  private readonly sleep?: (ms: number) => Promise<void>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
    private readonly providerFactory: TenantProviderFactory = defaultProviderFactory,
    deps: {
      channels?: ChannelConnectionService;
      outbox?: Pick<OutboxStore, "markSent" | "markUndelivered">;
      /** Progresso do despacho em partes; padrao e o outbox real. */
      progress?: AiReplyPartProgressPort;
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ) {
    this.channels = deps.channels ?? new ChannelConnectionService(prisma);
    const store = new OutboxStore(prisma);
    this.outbox = deps.outbox ?? store;
    this.progress = deps.progress ?? (deps.outbox ? undefined : store);
    this.sleep = deps.sleep;
  }

  /**
   * Envia e reconcilia a linha que a IA gravou.
   *
   * Falha comprovadamente anterior ao envio sobe como erro: o passo do teste e
   * retentado, que e o comportamento que o grafo ja tem. Falha que nao prova
   * que a mensagem nao saiu vira estado (`FAILED`/`UNKNOWN`) na propria linha —
   * reenviar as cegas duplicaria a mensagem.
   */
  async sendAiReply(
    input: ActivationTestReplyInput,
  ): Promise<ActivationTestReplyDelivery> {
    let sent: AiReplyDispatchOutcome;
    try {
      const provider = await this.tenantProvider(input);
      this.logger.info(
        {
          tenantId: input.tenantId,
          channelId: input.channelId,
          conversationId: input.conversationId,
          messageRecordId: input.messageRecordId,
          to: maskPhone(input.to),
        },
        "Activation test sending the AI reply through the tenant channel",
      );
      // Mesmo despacho da resposta da IA no produto: varias mensagens curtas,
      // linha unica, SENT so depois da ultima parte (2026-10-11).
      sent = await dispatchAiReply(provider, input, {
        progress: this.progress,
        sleep: this.sleep,
      });
    } catch (error) {
      const classification = classifySendFailure(error);
      await this.outbox.markUndelivered({
        messageRecordId: input.messageRecordId,
        state: classification.state,
        detail: classification.detail,
      });
      this.logger.warn(
        {
          tenantId: input.tenantId,
          channelId: input.channelId,
          messageRecordId: input.messageRecordId,
          deliveryState: classification.state,
          deliveryDetail: classification.detail,
          err: toErrorMessage(error),
        },
        "Activation test could not confirm the AI reply delivery",
      );
      if (classification.retryable) throw error;
      return { state: classification.state, detail: classification.detail };
    }

    if (sent.status === "stopped") {
      // Sem `shouldStop` aqui; o ramo existe para o tipo ficar fechado.
      const detail = `${sent.reason}_after_part_${sent.partsSent}_of_${sent.totalParts}`;
      await this.outbox.markUndelivered({
        messageRecordId: input.messageRecordId,
        state: "FAILED",
        detail,
      });
      return { state: "FAILED", detail };
    }

    const providerMessageId = sent.providerMessageId ?? input.correlationId;
    await this.outbox.markSent({
      messageRecordId: input.messageRecordId,
      providerMessageId,
      rawPayload: sent.raw,
    });
    return { state: "SENT", providerMessageId };
  }

  private async tenantProvider(
    input: ActivationTestReplyInput,
  ): Promise<WhatsAppProvider> {
    const connection = await this.prisma.channelConnection.findUnique({
      where: {
        tenantId_id: { tenantId: input.tenantId, id: input.channelId },
      },
    });
    if (!connection || connection.status !== "ACTIVE") {
      throw new AppError(
        "Active channel connection was not found for the activation test reply.",
        { statusCode: 409, code: "CHANNEL_CONNECTION_NOT_FOUND" },
      );
    }
    return this.providerFactory({
      credential: this.channels.resolveChannelCredential(connection),
      externalInstanceId: connection.externalInstanceId,
      logger: this.logger,
    });
  }
}
