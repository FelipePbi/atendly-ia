import { z } from "zod";

export const businessSettingsSchema = z.object({
  id: z.string().optional(),
  businessName: z.string().trim().default(""),
  professionalName: z.string().trim().nullable().optional().default(""),
  businessAddress: z.string().trim().nullable().optional().default(""),
  timezone: z.string().trim().default("America/Sao_Paulo"),
  maxSlotsToOffer: z.coerce.number().int().min(1).max(5).default(3),
  availabilityDays: z.coerce.number().int().min(1).max(60).default(14),
  slotStepMinutes: z.coerce.number().int().refine((value) => [10, 15, 20, 30, 45, 60].includes(value)).default(30),
  appointmentLookupDays: z.coerce.number().int().min(1).max(365).default(90),
  delayPolicy: z.string().trim().nullable().optional().default(""),
  cancellationPolicy: z.string().trim().nullable().optional().default(""),
  depositPolicy: z.string().trim().nullable().optional().default(""),
  configured: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export type BusinessSettingsDTO = z.infer<typeof businessSettingsSchema>;

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettingsDTO = {
  businessName: "",
  professionalName: "",
  businessAddress: "",
  timezone: "America/Sao_Paulo",
  maxSlotsToOffer: 3,
  availabilityDays: 14,
  slotStepMinutes: 30,
  appointmentLookupDays: 90,
  delayPolicy: "A tolerância é de 15 minutos. Depois disso pode ser necessário remarcar.",
  cancellationPolicy: "Cancelamentos devem ser avisados com pelo menos 24 horas de antecedência.",
  depositPolicy: "Para reservar o horário pode ser solicitado sinal via Pix, conforme orientação da profissional.",
  configured: false
};

export function normalizeBusinessSettings(value: unknown): BusinessSettingsDTO {
  const parsed = businessSettingsSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_BUSINESS_SETTINGS;

  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    ...parsed.data,
    businessName: parsed.data.businessName.trim(),
    professionalName: parsed.data.professionalName?.trim() ?? "",
    businessAddress: parsed.data.businessAddress?.trim() ?? "",
    delayPolicy: parsed.data.delayPolicy?.trim() ?? "",
    cancellationPolicy: parsed.data.cancellationPolicy?.trim() ?? "",
    depositPolicy: parsed.data.depositPolicy?.trim() ?? "",
    configured: parsed.data.configured ?? parsed.data.businessName.trim().length >= 2
  };
}

export function businessSettingsConfigured(settings: BusinessSettingsDTO): boolean {
  return settings.businessName.trim().length >= 2;
}
