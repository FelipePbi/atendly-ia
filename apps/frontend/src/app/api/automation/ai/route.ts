import { errorResponse, handleRouteError, ok, readJson, requireSessionUser } from "@/lib/api";
import { instanceDto, settingsDto } from "@/lib/dto";
import { settingsPatchSchema } from "@/lib/validation";
import { whatsappPhoneCandidates } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { resumeBotHandoffsInBackend } from "@/services/backend-dispatch";
import { businessSettingsDto, getBusinessSettingsForUser } from "@/services/business-settings";
import { syncWhatsAppInstanceStatus } from "@/services/whatsapp-instance-status";
import {
  getVirtualAttendantSettingsForUser,
  updateVirtualAttendantSettingsForUser,
  virtualAttendantSettingsDto,
} from "@/services/virtual-attendant";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const settings = await getVirtualAttendantSettingsForUser(user.id);

    return ok({ ok: true, aiEnabled: settings.aiEnabled, settings: settingsDto(settings) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    const data = await readJson(request, settingsPatchSchema);

    let automationSync: Awaited<ReturnType<typeof resumeBotHandoffsInBackend>> | null = null;
    let businessSettings = await getBusinessSettingsForUser(user.id);

    if (data.aiEnabled) {
      const virtualSettings = virtualAttendantSettingsDto(await getVirtualAttendantSettingsForUser(user.id));
      if (!virtualSettings.canEnable) {
        return errorResponse(virtualSettings.readinessIssues[0] ?? "Complete a Atendente Virtual antes de ativar a IA.", 409, {
          settings: virtualSettings,
          readinessIssues: virtualSettings.readinessIssues,
        });
      }

      if (!businessSettingsDto(businessSettings).configured) {
        return errorResponse("Complete as configurações do negócio antes de ativar a IA.", 409, {
          businessSettings: businessSettingsDto(businessSettings),
        });
      }

      const instance = await prisma.whatsAppInstance.findUnique({
        where: { userId: user.id },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      });

      if (!instance) {
        return errorResponse("Conecte o WhatsApp antes de ativar a IA.", 409);
      }

      const synced = await syncWhatsAppInstanceStatus({
        instance,
        profile: instance.user.profile,
      });

      if (synced.instance.status !== "CONNECTED") {
        return errorResponse("Conecte o WhatsApp antes de ativar a IA.", 409, {
          whatsappInstance: instanceDto(synced.instance),
          settings: settingsDto(synced.settings),
        });
      }

      const conversations = await prisma.conversation.findMany({
        where: { userId: user.id },
        select: { contactJid: true },
      });
      const phones = [...new Set(conversations.flatMap((conversation) => whatsappPhoneCandidates(conversation.contactJid)))];

      automationSync = await resumeBotHandoffsInBackend({ phones });
    }

    const settings = await updateVirtualAttendantSettingsForUser(user.id, { aiEnabled: data.aiEnabled });
    businessSettings = await getBusinessSettingsForUser(user.id);

    return ok({
      ok: true,
      aiEnabled: settings.aiEnabled,
      settings: settingsDto(settings),
      businessSettings: businessSettingsDto(businessSettings),
      automationSync,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
