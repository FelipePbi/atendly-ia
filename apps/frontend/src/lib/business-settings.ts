import { z } from "zod";

export const BRAZIL_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

export const SLOT_STEP_MINUTES_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
export const MAX_SLOTS_TO_OFFER_OPTIONS = [1, 2, 3, 4, 5] as const;
export const AVAILABILITY_DAYS_OPTIONS = [7, 14, 21, 30, 45, 60] as const;
export const APPOINTMENT_LOOKUP_DAYS_OPTIONS = [30, 60, 90, 120, 180, 365] as const;

export const DEFAULT_BUSINESS_SETTINGS = {
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
} satisfies BusinessSettingsInput;

const optionalText = (max: number, message: string) => z.string().trim().max(max, message).optional().or(z.literal(""));

export const businessSettingsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Informe o nome do negócio.")
    .max(120, "O nome do negócio deve ter no máximo 120 caracteres."),
  professionalName: optionalText(120, "O nome da profissional deve ter no máximo 120 caracteres."),
  businessAddress: optionalText(250, "O endereço deve ter no máximo 250 caracteres."),
  timezone: z
    .string()
    .trim()
    .min(1, "Informe o fuso horário.")
    .refine((value) => BRAZIL_TIMEZONES.includes(value as (typeof BRAZIL_TIMEZONES)[number]), {
      message: "Escolha um fuso horário válido.",
    }),
  maxSlotsToOffer: z.coerce
    .number()
    .int()
    .min(1, "Ofereça pelo menos 1 horário.")
    .max(5, "Para uma conversa natural, ofereça no máximo 5 horários."),
  availabilityDays: z.coerce
    .number()
    .int()
    .min(1, "O horizonte mínimo é de 1 dia.")
    .max(60, "O horizonte máximo recomendado é de 60 dias."),
  slotStepMinutes: z.coerce.number().int().refine((value) => SLOT_STEP_MINUTES_OPTIONS.includes(value as never), {
    message: "Escolha uma granularidade válida.",
  }),
  appointmentLookupDays: z.coerce
    .number()
    .int()
    .min(1, "O período mínimo é de 1 dia.")
    .max(365, "O período máximo recomendado é de 365 dias."),
  delayPolicy: optionalText(500, "A política de atraso deve ter no máximo 500 caracteres."),
  cancellationPolicy: optionalText(500, "A política de cancelamento deve ter no máximo 500 caracteres."),
  depositPolicy: optionalText(500, "A política de sinal deve ter no máximo 500 caracteres."),
});

export type BusinessSettingsInput = z.infer<typeof businessSettingsSchema>;

export type ApiBusinessSettings = BusinessSettingsInput & {
  id: string;
  configured: boolean;
  createdAt: string;
  updatedAt: string;
};

export function normalizeBusinessSettingsInput(input: BusinessSettingsInput): BusinessSettingsInput {
  return {
    businessName: input.businessName.trim(),
    professionalName: input.professionalName?.trim() ?? "",
    businessAddress: input.businessAddress?.trim() ?? "",
    timezone: input.timezone.trim(),
    maxSlotsToOffer: input.maxSlotsToOffer,
    availabilityDays: input.availabilityDays,
    slotStepMinutes: input.slotStepMinutes,
    appointmentLookupDays: input.appointmentLookupDays,
    delayPolicy: input.delayPolicy?.trim() ?? "",
    cancellationPolicy: input.cancellationPolicy?.trim() ?? "",
    depositPolicy: input.depositPolicy?.trim() ?? "",
  };
}

export function businessSettingsConfigured(settings: Pick<BusinessSettingsInput, "businessName">): boolean {
  return settings.businessName.trim().length >= 2;
}
