import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { FastifyBaseLogger } from "fastify";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { toErrorMessage } from "../../lib/errors.js";
import {
  mapEvolutionInbound,
  mapEvolutionReceipt,
} from "../channel/adapters/evolution/EvolutionInboundMapper.js";
import type { ChannelConnectionService } from "../channel/ChannelConnectionService.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type { InboundProcessorInput } from "../channel/inbound-processor-factory.js";
import { buildInboundMessageProcessor } from "../channel/inbound-processor-factory.js";
import type { InboundProcessingResult } from "../channel/InboundMessageProcessor.js";
import type { OutboxPort } from "../outbox/OutboxStore.js";
import type { InboxClaim, InboxPort } from "./InboxStore.js";

export interface InboxDispatchOutcome {
  status: "DONE" | "IGNORED";
  result: Record<string, unknown>;
}

/**
 * Construcao do processador do lote.
 *
 * Existe como dependencia para que a suite de persistencia possa exercitar o
 * caminho real do dispatcher — inbox e idempotencia contra PostgreSQL — sem
 * chamar modelo nem transporte externo. O padrao continua sendo a fabrica de
 * producao.
 */
export type InboundProcessorFactory = (input: InboundProcessorInput) => {
  handleInboundBatch(
    messages: ChannelInboundMessage[],
  ): Promise<InboundProcessingResult>;
};

export interface InboundEventDispatcherDependencies {
  prisma: PrismaClient;
  logger: FastifyBaseLogger;
  inbox: InboxPort;
  outbox: OutboxPort;
  channelConnections: ChannelConnectionService;
  checkpointer?: BaseCheckpointSaver;
  buildProcessor?: InboundProcessorFactory;
}

/**
 * Executa um lote já reivindicado da inbox.
 *
 * O lote é sempre de uma conversa (ou de eventos sem conversa, como recibos), e
 * chega aqui na ordem de recebimento. Nada nesta classe volta ao transporte
 * para buscar contexto: o payload saneado que foi persistido antes do ACK é a
 * única entrada.
 */
export class InboundEventDispatcher {
  constructor(
    private readonly dependencies: InboundEventDispatcherDependencies,
  ) {}

  async dispatch(claim: InboxClaim): Promise<InboxDispatchOutcome> {
    const receipts = claim.events.filter(
      (event) => event.eventType === "receipt",
    );
    if (receipts.length > 0) {
      let reconciled = 0;
      for (const event of receipts) {
        reconciled += await this.reconcileReceipt(event.rawPayload, {
          tenantId: event.tenantId,
          channelId: event.channelId,
        });
      }
      return { status: "DONE", result: { kind: "receipt", reconciled } };
    }

    const messages = claim.events.map((event) => ({
      event,
      mapped: mapEvolutionInbound(event.rawPayload),
    }));
    const usable = messages.filter(
      (item): item is typeof item & { mapped: NonNullable<typeof item.mapped> } =>
        item.mapped !== null,
    );
    if (usable.length === 0) {
      // Persistido, porém já não é interpretável como mensagem. Fica registrado
      // como ignorado em vez de voltar à fila para sempre.
      return { status: "IGNORED", result: { kind: "unmappable" } };
    }

    const inbound: ChannelInboundMessage[] = [];
    let context: Awaited<
      ReturnType<ChannelConnectionService["resolveEvolutionInboundContext"]>
    > | null = null;
    for (const item of usable) {
      context =
        await this.dependencies.channelConnections.resolveEvolutionInboundContext(
          { message: item.mapped, requestId: item.event.id },
        );
      inbound.push(context.message);
    }
    if (!context) return { status: "IGNORED", result: { kind: "unmappable" } };

    const connection = context.connection;
    const eventIds = claim.events.map((event) => event.id);
    const buildProcessor =
      this.dependencies.buildProcessor ?? buildInboundMessageProcessor;
    const processor = buildProcessor({
      logger: this.dependencies.logger,
      prisma: this.dependencies.prisma,
      tenantId: connection.tenantId,
      channelId: connection.id,
      instanceId: connection.externalInstanceId,
      instanceToken: () =>
        this.dependencies.channelConnections.resolveChannelCredential(
          connection,
        ),
      checkpointer: this.dependencies.checkpointer,
      // A janela de fragmentos já foi aplicada no claim: aqui o buffer em
      // memória seria uma segunda fonte de verdade.
      debounce: false,
      outboundGate: {
        shouldCancel: async () =>
          (await this.dependencies.inbox.isSupersedeRequested(eventIds))
            ? "superseded_by_new_inbound_message"
            : null,
        // O humano assumindo a sessao usa o mesmo supersede: a saida
        // automatica que ainda nao foi enviada deixa de ser enviada.
        requestCancel: async () => {
          if (!claim.conversationKey) return;
          await this.dependencies.inbox.requestSupersede(claim.conversationKey);
        },
      },
    });

    const result = await processor.handleInboundBatch(inbound);
    return {
      status: "DONE",
      result: { kind: "message", action: result.action, size: inbound.length },
    };
  }

  private async reconcileReceipt(
    rawPayload: unknown,
    owner: { tenantId: string; channelId: string },
  ): Promise<number> {
    const receipt = mapEvolutionReceipt(rawPayload);
    if (!receipt) return 0;
    try {
      return await this.dependencies.outbox.reconcileFromReceipt({
        tenantId: owner.tenantId,
        channelId: owner.channelId,
        messageIds: receipt.messageIds,
        state: receipt.state,
      });
    } catch (error) {
      this.dependencies.logger.warn(
        { err: toErrorMessage(error), receiptState: receipt.state },
        "Inbox could not reconcile a delivery receipt",
      );
      throw error;
    }
  }
}
