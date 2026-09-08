import type { PrismaClient } from "../../generated/prisma/client.js";
import type { MessageDeliveryState } from "./outbox-policy.js";

export interface OutboxRecord {
  id: string;
  correlationId: string;
  deliveryState: MessageDeliveryState;
  deliveryDetail: string | null;
  externalMessageId: string | null;
}

export interface OutboxPort {
  markSent(input: {
    messageRecordId: string;
    providerMessageId?: string;
    rawPayload?: unknown;
  }): Promise<void>;
  markUndelivered(input: {
    messageRecordId: string;
    state: Extract<MessageDeliveryState, "FAILED" | "UNKNOWN">;
    detail: string;
  }): Promise<void>;
  reconcileFromReceipt(input: {
    tenantId: string;
    channelId: string;
    messageIds: string[];
    state: "delivered" | "read";
  }): Promise<number>;
}

/**
 * Outbox das saídas, sobre `Message`.
 *
 * A linha OUTBOUND é criada antes de chamar o transporte, com `correlationId`
 * estável, e a partir daí só muda de estado por evidência: resposta do
 * transporte, classificação da falha ou recibo vindo do Go. Nenhuma transição
 * apaga a tentativa — `unknown` é um estado, não um motivo para esquecer que a
 * mensagem pode ter sido entregue.
 */
export class OutboxStore implements OutboxPort {
  constructor(private readonly prisma: PrismaClient) {}

  async markSent(input: {
    messageRecordId: string;
    providerMessageId?: string;
    rawPayload?: unknown;
  }): Promise<void> {
    await this.prisma.message.update({
      where: { id: input.messageRecordId },
      data: {
        externalMessageId: input.providerMessageId,
        rawPayload: input.rawPayload as object,
        deliveryState: "SENT",
        deliveryDetail: null,
        deliveryUpdatedAt: new Date(),
      },
    });
  }

  async markUndelivered(input: {
    messageRecordId: string;
    state: Extract<MessageDeliveryState, "FAILED" | "UNKNOWN">;
    detail: string;
  }): Promise<void> {
    await this.prisma.message.update({
      where: { id: input.messageRecordId },
      data: {
        deliveryState: input.state,
        deliveryDetail: input.detail,
        deliveryUpdatedAt: new Date(),
        deliveryAttempts: { increment: 1 },
      },
    });
  }

  /**
   * Reconciliação pelo recibo do transporte. É o único caminho que tira uma
   * saída de `UNKNOWN`: o recibo prova que a mensagem existe no WhatsApp.
   *
   * O `correlationId` viaja como id da mensagem no envio, então o recibo casa
   * mesmo quando o envio expirou sem devolver ID externo.
   */
  async reconcileFromReceipt(input: {
    tenantId: string;
    channelId: string;
    messageIds: string[];
    state: "delivered" | "read";
  }): Promise<number> {
    if (input.messageIds.length === 0) return 0;
    const updated = await this.prisma.message.updateMany({
      where: {
        tenantId: input.tenantId,
        channelId: input.channelId,
        direction: "OUTBOUND",
        deliveryState: { in: ["PENDING", "UNKNOWN"] },
        OR: [
          { correlationId: { in: input.messageIds } },
          { externalMessageId: { in: input.messageIds } },
        ],
      },
      data: {
        deliveryState: "SENT",
        deliveryDetail: `reconciled_receipt_${input.state}`,
        deliveryUpdatedAt: new Date(),
      },
    });
    return updated.count;
  }
}
