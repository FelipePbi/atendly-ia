import type { BusinessSettingsDTO } from "../../business-settings/business-settings.js";
import type { VirtualAttendantSettingsDTO } from "../../virtual-attendant/virtual-attendant.js";

export type ChannelProviderName = "evolution-go";
export type ChannelMessageKind =
  "text" | "audio" | "image" | "document" | "unknown";

export interface ChannelInboundMessage {
  provider: ChannelProviderName;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  businessSettings?: BusinessSettingsDTO;
  virtualAttendantSettings?: VirtualAttendantSettingsDTO;
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
