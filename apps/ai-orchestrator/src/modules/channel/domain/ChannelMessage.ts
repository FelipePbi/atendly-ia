import type { BusinessSettingsDTO } from "../../business-settings/business-settings.js";
import type { VirtualAttendantSettingsDTO } from "../../virtual-attendant/virtual-attendant.js";

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
  businessSettings?: BusinessSettingsDTO;
  virtualAttendantSettings?: VirtualAttendantSettingsDTO;
}

export type ChannelInboundMessage = MappedChannelInboundMessage &
  ChannelExecutionContext;
