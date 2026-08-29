import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";

export class IdempotencyStore {
  constructor(private readonly prisma: PrismaClient) {}

  async remember(message: ChannelInboundMessage): Promise<boolean> {
    try {
      await this.prisma.processedEvent.create({
        data: {
          tenantId: message.tenantId,
          channelId: message.channelId,
          eventKey: buildEventKey(message),
          provider: "EVOLUTION_GO",
          messageId: message.messageId,
          rawPayload: message.raw as object,
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return false;
      }
      throw error;
    }
  }
}

export function buildEventKey(
  message: Pick<ChannelInboundMessage, "provider" | "instanceId" | "messageId">,
): string {
  return `${message.provider}:${message.instanceId}:${message.messageId}`;
}
