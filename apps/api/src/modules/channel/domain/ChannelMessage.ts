export type ChannelProviderName = "evolution-go";
export type ChannelMessageKind = "text" | "audio" | "image" | "document" | "unknown";

export interface ChannelInboundMessage {
  provider: ChannelProviderName;
  userId?: string;
  businessSettings?: import("../../business-settings/business-settings.js").BusinessSettingsDTO;
  virtualAttendantSettings?: import("../../virtual-attendant/virtual-attendant.js").VirtualAttendantSettingsDTO;
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
