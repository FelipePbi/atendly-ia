import type { ApiBusinessSettings } from "@/lib/business-settings";
import type { ApiVirtualAttendantSettings } from "@/lib/virtual-attendant";

export type MessageType = "TEXT" | "AUDIO" | "IMAGE" | "DOCUMENT" | "UNKNOWN";
export type UserSex = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
export type WhatsAppInstanceStatus =
  | "CREATED"
  | "CONNECTING"
  | "WAITING_QR"
  | "CONNECTED"
  | "DISCONNECTED"
  | "LOGGED_OUT"
  | "QR_EXPIRED"
  | "ERROR";

export type ApiUser = {
  id: string;
  email: string;
  createdAt?: string | null;
};

export type ApiSettings = ApiVirtualAttendantSettings;

export type { ApiBusinessSettings };

export type ApiUserProfile = {
  fullName: string;
  birthDate: string | null;
  sex: UserSex;
  businessName: string;
  whatsappPhoneRaw: string | null;
  whatsappPhoneNormalized: string | null;
  onboardingCompletedAt: string | null;
};

export type ApiOnboardingStep = "PROFILE" | "VIRTUAL_ATTENDANT" | "WHATSAPP" | "COMPLETE";

export type ApiOnboarding = {
  completed: boolean;
  currentStep: ApiOnboardingStep;
  profileComplete: boolean;
  virtualAttendantComplete: boolean;
  phoneComplete: boolean;
  whatsappConnected: boolean;
  phoneVerified: boolean;
  completedAt: string | null;
};

export type ApiWhatsAppInstance = {
  id: string;
  phoneNumber: string | null;
  status: WhatsAppInstanceStatus;
  qrcode: string | null;
  connectedAt: string | null;
};

export type ConversationListItem = {
  id: string;
  contactJid: string;
  contactName: string | null;
  profilePictureUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  archivedAt: string | null;
  lastMessageFromMe: boolean;
  aiPaused: boolean;
  aiPausedReason: string | null;
  aiPausedUpdatedAt: string | null;
  aiHandoff: boolean;
  aiHandoffReason: string | null;
  aiHandoffPauseUntil: string | null;
};

export type ChatMessage = {
  id: string;
  fromMe: boolean;
  senderName: string | null;
  type: MessageType;
  contentText: string | null;
  mediaType: string | null;
  timestamp: string;
};
