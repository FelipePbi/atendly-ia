import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUser, requireAuth } from "../lib/auth.js";
import { instanceDto, onboardingDto, profileDto, settingsDto, userDto } from "../lib/dto.js";
import { AppError } from "../lib/errors.js";
import { dataResponse, parseBody } from "../lib/http.js";
import { normalizeWhatsappPhone } from "../lib/phone.js";
import { getPrisma } from "../lib/prisma.js";
import { getEvolutionStatus } from "../services/evolution-go.js";

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]),
  businessName: z.string().trim().min(2).max(160)
});

export async function registerOnboardingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/onboarding")) {
      await requireAuth(request);
    }
  });

  app.get("/onboarding", async (request) => {
    const user = currentUser(request);
    const record = await getPrisma().user.findUnique({
      where: { id: user.id },
      include: {
        profile: true,
        whatsappInstance: true,
        settings: true
      }
    });

    if (!record) {
      throw new AppError("NOT_FOUND", "User not found.", 404);
    }

    return dataResponse(request, {
      user: userDto(record),
      profile: profileDto(record.profile),
      onboarding: onboardingDto(record.profile, record.whatsappInstance, record.settings),
      settings: settingsDto(record.settings),
      whatsappInstance: instanceDto(record.whatsappInstance)
    });
  });

  app.patch("/onboarding/profile", async (request) => {
    const user = currentUser(request);
    const data = parseBody(profileSchema, request.body);
    const prisma = getPrisma();
    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {
        fullName: data.fullName,
        birthDate: dateOnlyToUtc(data.birthDate),
        sex: data.sex,
        businessName: data.businessName
      },
      create: {
        userId: user.id,
        fullName: data.fullName,
        birthDate: dateOnlyToUtc(data.birthDate),
        sex: data.sex,
        businessName: data.businessName
      }
    });
    const [instance, settings] = await Promise.all([
      prisma.whatsAppInstance.findUnique({ where: { userId: user.id } }),
      prisma.userSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id, aiEnabled: false },
        update: {}
      })
    ]);

    return dataResponse(request, {
      profile: profileDto(profile),
      onboarding: onboardingDto(profile, instance, settings)
    });
  });

  app.post("/onboarding/complete", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        profile: true,
        whatsappInstance: true,
        settings: true
      }
    });

    if (!record) {
      throw new AppError("NOT_FOUND", "User not found.", 404);
    }
    if (!profileComplete(record.profile)) {
      throw new AppError("CONFLICT", "Complete profile before finishing onboarding.", 409);
    }
    const currentProfile = record.profile;

    const settings =
      record.settings ??
      (await prisma.userSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id, aiEnabled: false },
        update: {}
      }));
    if (!settings.virtualAttendantOnboardingCompleted) {
      throw new AppError("CONFLICT", "Configure virtual attendant before finishing onboarding.", 409);
    }
    if (!record.whatsappInstance) {
      throw new AppError("CONFLICT", "Create and connect WhatsApp before finishing onboarding.", 409);
    }

    const status = await getEvolutionStatus(record.whatsappInstance.evolutionInstanceToken);
    if (!status.connected) {
      throw new AppError("CONFLICT", "Scan QR Code and wait for WhatsApp to connect.", 409, {
        whatsappInstance: instanceDto(record.whatsappInstance)
      });
    }

    const connectedPhone = normalizeWhatsappPhone(status.phoneNumber ?? "") || null;
    if (!connectedPhone) {
      throw new AppError("CONFLICT", "Could not identify connected WhatsApp phone.", 409, {
        whatsappInstance: instanceDto(record.whatsappInstance)
      });
    }

    const [profile, instance] = await Promise.all([
      prisma.userProfile.update({
        where: { userId: user.id },
        data: {
          whatsappPhoneRaw: status.phoneNumber,
          whatsappPhoneNormalized: connectedPhone,
          onboardingCompletedAt: currentProfile.onboardingCompletedAt ?? new Date()
        }
      }),
      prisma.whatsAppInstance.update({
        where: { id: record.whatsappInstance.id },
        data: {
          phoneNumber: connectedPhone,
          status: "CONNECTED",
          connectedAt: record.whatsappInstance.connectedAt ?? new Date()
        }
      })
    ]);

    return dataResponse(request, {
      profile: profileDto(profile),
      onboarding: onboardingDto(profile, instance, settings),
      whatsappInstance: instanceDto(instance)
    });
  });
}

function profileComplete(profile: {
  fullName: string;
  birthDate: Date | null;
  sex: string;
  businessName: string;
} | null): profile is {
  fullName: string;
  birthDate: Date;
  sex: string;
  businessName: string;
  onboardingCompletedAt: Date | null;
} {
  return Boolean(profile?.fullName.trim() && profile.birthDate && profile.sex && profile.businessName.trim());
}

function dateOnlyToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
