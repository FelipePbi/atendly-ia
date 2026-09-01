import type { AiTenantSettings } from "../../tenant-config/ai-settings.js";
import type { BusinessContext } from "../../tenant-config/business-context.js";

export type ChannelProviderName = "evolution-go";
export type ChannelMessageKind =
  "text" | "audio" | "image" | "document" | "unknown";

export interface MappedChannelInboundMessage {
  provider: ChannelProviderName;
  instanceId: string;
  messageId: string;
  chatId: string;
  customerPhone: string;
  customerName?: string;
  fromMe: boolean;
  isGroup: boolean;
  kind: ChannelMessageKind;
  text?: string;
  timestamp?: string;
  raw: unknown;
}

export interface ChannelExecutionContext {
  tenantId: string;
  channelId: string;
  userId: string;
  requestId: string;
  businessContext?: BusinessContext;
  aiSettings?: AiTenantSettings;
}

export type ChannelInboundMessage = MappedChannelInboundMessage &
  ChannelExecutionContext;
