import crypto from "node:crypto";
import {
  createEvolutionInstance,
  buildWebhookUrl,
  deleteEvolutionInstance,
  EvolutionGoError,
  getEvolutionStatus,
} from "@/services/evolution-go";
import { errorResponse, handleRouteError, ok, requireSessionUser } from "@/lib/api";
import { instanceDto } from "@/lib/dto";
import { profileComplete } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { deactivateAiForUserIfEnabled } from "@/services/ai-settings";

export const runtime = "nodejs";
const MAX_INSTANCE_CREATE_ATTEMPTS = 5;

export async function POST() {
  try {
    const sessionUser = await requireSessionUser();
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: {
        profile: true,
        whatsappInstance: true,
      },
    });

    if (!user) {
      return errorResponse("Usuario nao encontrado.", 404);
    }

    if (!profileComplete(user.profile)) {
      return errorResponse("Complete os dados basicos antes de criar a instancia.", 409);
    }

    if (user.whatsappInstance && (await evolutionInstanceExists(user.whatsappInstance.evolutionInstanceToken))) {
      return ok({ ok: true, whatsappInstance: instanceDto(user.whatsappInstance) });
    }

    const created = await createUniqueInstance({
      userId: user.id,
      localInstanceId: user.whatsappInstance?.id,
      fullName: user.profile.fullName,
      businessName: user.profile.businessName,
    });
    await deactivateAiForUserIfEnabled(user.id);

    return ok({ ok: true, whatsappInstance: instanceDto(created) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("EVOLUTION_GO_API_KEY")) {
      return errorResponse("Configure a chave da Evolution Go no ambiente do servidor.", 500);
    }

    return handleRouteError(error);
  }
}

export async function DELETE() {
  try {
    const user = await requireSessionUser();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      return ok({ ok: true, whatsappInstance: null });
    }

    try {
      await deleteEvolutionInstance(instance.evolutionInstanceId ?? instance.evolutionInstanceName);
    } catch {
      // Local removal is the privacy boundary; remote cleanup is best effort.
    }

    await prisma.whatsAppInstance.delete({
      where: { id: instance.id },
    });
    await deactivateAiForUserIfEnabled(user.id);

    return ok({ ok: true, whatsappInstance: null });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function createUniqueInstance(input: {
  userId: string;
  localInstanceId?: string;
  fullName: string;
  businessName: string;
}) {
  const webhookUrl = buildWebhookUrl();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_INSTANCE_CREATE_ATTEMPTS; attempt += 1) {
    const instanceName = buildInstanceName(input.fullName, input.businessName);
    const existingName = await prisma.whatsAppInstance.findUnique({
      where: { evolutionInstanceName: instanceName },
      select: { id: true },
    });

    if (existingName) continue;

    const instanceToken = `wa_${crypto.randomBytes(32).toString("hex")}`;

    try {
      const evolution = await createEvolutionInstance({
        name: instanceName,
        token: instanceToken,
        webhookUrl,
      });

      const data = {
        evolutionInstanceId: evolution.data?.id ?? evolution.data?.name ?? instanceName,
        evolutionInstanceName: evolution.data?.name ?? instanceName,
        evolutionInstanceToken: evolution.data?.token ?? instanceToken,
        status: "CREATED" as const,
        phoneNumber: null,
        qrcode: null,
        connectedAt: null,
      };

      if (input.localInstanceId) {
        return await prisma.whatsAppInstance.update({
          where: { id: input.localInstanceId },
          data,
        });
      }

      return await prisma.whatsAppInstance.create({
        data: {
          userId: input.userId,
          ...data,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Variavel de ambiente ausente")) {
        throw error;
      }

      lastError = error;
      if (!isUniqueConstraintError(error) && attempt === MAX_INSTANCE_CREATE_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Nao foi possivel criar uma instancia unica.");
}

async function evolutionInstanceExists(instanceToken: string): Promise<boolean> {
  try {
    await getEvolutionStatus(instanceToken);
    return true;
  } catch (error) {
    if (error instanceof EvolutionGoError && (error.status === 401 || error.status === 404)) {
      return false;
    }

    throw error;
  }
}

function buildInstanceName(fullName: string, businessName: string): string {
  const personSlug = slugifyInstancePart(fullName) || "usuario";
  const businessSlug = slugifyInstancePart(businessName) || "negocio";
  const hash = crypto.randomBytes(4).toString("hex");
  return `${personSlug}_${businessSlug}_${hash}`;
}

function slugifyInstancePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48)
    .replace(/^_|_$/g, "");
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
  );
}
