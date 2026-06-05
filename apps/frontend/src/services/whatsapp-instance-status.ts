import "server-only";

import type { UserProfile, UserSettings, WhatsAppInstance } from "@/generated/prisma/client";
import { normalizeWhatsappPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { deactivateAiForUserIfEnabled } from "@/services/ai-settings";
import {
  buildWebhookUrl,
  connectEvolutionInstance,
  EvolutionGoError,
  getEvolutionInstanceInfo,
  getEvolutionStatus,
} from "@/services/evolution-go";
import {
  clearWhatsAppInstanceConversationData,
  shouldClearWhatsAppDataForPhoneChange,
} from "@/services/whatsapp-data-retention";

type EvolutionStatus = Awaited<ReturnType<typeof getEvolutionStatus>>;
const refreshedWebhookSettings = new Set<string>();

export type SyncedEvolutionStatus = Omit<EvolutionStatus, "raw">;

export type WhatsAppInstanceStatusSync = {
  instance: WhatsAppInstance;
  status: SyncedEvolutionStatus | null;
  connected: boolean;
  connectedPhone: string | null;
  normalizedPhone: string | null;
  invalidInstance: boolean;
  evolutionUnavailable: boolean;
  missingPhone: boolean;
  invalidPhone: boolean;
  settings: UserSettings | null;
};

export async function syncWhatsAppInstanceStatus({
  instance,
  profile,
  updateProfile = true,
}: {
  instance: WhatsAppInstance;
  profile?: UserProfile | null;
  updateProfile?: boolean;
}): Promise<WhatsAppInstanceStatusSync> {
  const status = await loadEvolutionStatus(instance.evolutionInstanceToken);

  if (status === "INVALID_INSTANCE") {
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "ERROR",
        qrcode: null,
      },
    });

    const settings = await deactivateAiForUserIfEnabled(updated.userId);

    return buildResult({
      instance: updated,
      status: null,
      connectedPhone: updated.phoneNumber,
      invalidInstance: true,
      settings,
    });
  }

  if (!status) {
    const updated =
      instance.status === "CONNECTED"
        ? await prisma.whatsAppInstance.update({
            where: { id: instance.id },
            data: {
              status: "DISCONNECTED",
            },
          })
        : instance;

    const settings = updated.status === "CONNECTED" ? null : await deactivateAiForUserIfEnabled(updated.userId);

    return buildResult({
      instance: updated,
      status: null,
      connectedPhone: updated.phoneNumber,
      evolutionUnavailable: true,
      settings,
    });
  }

  const info = status.connected ? await loadInstanceInfo(instance.evolutionInstanceId) : null;
  if (status.connected) {
    void ensureEvolutionWebhookSettings(instance);
  }

  const connectedPhone = status.phoneNumber ?? info?.phoneNumber ?? instance.phoneNumber;
  const publicStatus: SyncedEvolutionStatus = {
    connected: status.connected,
    loggedIn: status.loggedIn,
    phoneNumber: connectedPhone,
    displayName: status.displayName ?? info?.displayName ?? null,
    statusText: status.statusText,
  };

  if (status.connected && !connectedPhone) {
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "ERROR",
        qrcode: null,
      },
    });

    const settings = await deactivateAiForUserIfEnabled(updated.userId);

    return buildResult({
      instance: updated,
      status: publicStatus,
      missingPhone: true,
      settings,
    });
  }

  const normalizedPhone = connectedPhone ? normalizeWhatsappPhone(connectedPhone) : null;
  if (status.connected && !normalizedPhone) {
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "ERROR",
        phoneNumber: connectedPhone,
        qrcode: null,
      },
    });

    const settings = await deactivateAiForUserIfEnabled(updated.userId);

    return buildResult({
      instance: updated,
      status: publicStatus,
      connectedPhone,
      invalidPhone: true,
      settings,
    });
  }

  if (!status.connected && instance.status !== "CONNECTED") {
    const settings = await deactivateAiForUserIfEnabled(instance.userId);

    return buildResult({
      instance,
      status: publicStatus,
      connectedPhone,
      normalizedPhone,
      settings,
    });
  }

  const instanceUpdate = {
    status: status.connected ? ("CONNECTED" as const) : ("DISCONNECTED" as const),
    phoneNumber: connectedPhone,
    connectedAt: status.connected ? instance.connectedAt ?? new Date() : instance.connectedAt,
    qrcode: status.connected ? null : instance.qrcode,
  };

  if (status.connected && shouldClearWhatsAppDataForPhoneChange(instance.phoneNumber, connectedPhone)) {
    await clearWhatsAppInstanceConversationData(instance.id);
  }

  const updated =
    status.connected && connectedPhone && normalizedPhone && updateProfile && profile
      ? (
          await prisma.$transaction([
            prisma.userProfile.update({
              where: { userId: instance.userId },
              data: {
                whatsappPhoneRaw: connectedPhone,
                whatsappPhoneNormalized: normalizedPhone,
              },
            }),
            prisma.whatsAppInstance.update({
              where: { id: instance.id },
              data: instanceUpdate,
            }),
          ])
        )[1]
      : await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: instanceUpdate,
        });

  const settings = updated.status === "CONNECTED" ? null : await deactivateAiForUserIfEnabled(updated.userId);

  return buildResult({
    instance: updated,
    status: publicStatus,
    connectedPhone,
    normalizedPhone,
    settings,
  });
}

function buildResult({
  instance,
  status,
  connectedPhone = null,
  normalizedPhone = null,
  invalidInstance = false,
  evolutionUnavailable = false,
  missingPhone = false,
  invalidPhone = false,
  settings = null,
}: {
  instance: WhatsAppInstance;
  status: SyncedEvolutionStatus | null;
  connectedPhone?: string | null;
  normalizedPhone?: string | null;
  invalidInstance?: boolean;
  evolutionUnavailable?: boolean;
  missingPhone?: boolean;
  invalidPhone?: boolean;
  settings?: UserSettings | null;
}): WhatsAppInstanceStatusSync {
  return {
    instance,
    status,
    connected: Boolean(status?.connected),
    connectedPhone,
    normalizedPhone,
    invalidInstance,
    evolutionUnavailable,
    missingPhone,
    invalidPhone,
    settings,
  };
}

async function loadEvolutionStatus(instanceToken: string) {
  try {
    return await getEvolutionStatus(instanceToken);
  } catch (error) {
    if (error instanceof EvolutionGoError && (error.status === 401 || error.status === 404)) {
      return "INVALID_INSTANCE" as const;
    }

    if (error instanceof Error && error.message.includes("Variavel de ambiente ausente")) {
      throw error;
    }

    return null;
  }
}

async function loadInstanceInfo(instanceId: string | null | undefined) {
  if (!instanceId) return null;

  try {
    return await getEvolutionInstanceInfo(instanceId);
  } catch {
    return null;
  }
}

async function ensureEvolutionWebhookSettings(instance: WhatsAppInstance) {
  const refreshKey = `${instance.id}:${instance.evolutionInstanceToken}`;
  if (refreshedWebhookSettings.has(refreshKey)) return;

  try {
    await connectEvolutionInstance(instance.evolutionInstanceToken, buildWebhookUrl());
    refreshedWebhookSettings.add(refreshKey);
  } catch {
    // Status sync must stay read-friendly even if Evolution rejects a settings refresh.
  }
}
