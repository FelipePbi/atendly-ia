import { z } from "zod";
import { businessSettingsSchema } from "@/lib/business-settings";
import { CURRENT_LEGAL_VERSIONS } from "@/config/legal-versions";

export const emailSchema = z.string().email("Informe um email valido.").trim().toLowerCase();

export const registerSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Confirme a senha."),
    termsAccepted: z.literal(true, { error: "Você precisa aceitar os Termos de Uso para criar sua conta." }),
    termsVersion: z.literal(CURRENT_LEGAL_VERSIONS.termsVersion),
    privacyPolicyVersion: z.literal(CURRENT_LEGAL_VERSIONS.privacyPolicyVersion),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas nao conferem.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Confirme a nova senha."),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "A nova senha precisa ser diferente da senha atual.",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas nao conferem.",
    path: ["confirmPassword"],
  });

export const settingsPatchSchema = z.object({
  aiEnabled: z.boolean(),
});

export const businessSettingsPatchSchema = businessSettingsSchema;

export const conversationPatchSchema = z.object({
  archived: z.boolean(),
});

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1, "Informe uma mensagem.").max(4000, "A mensagem esta muito longa."),
});

export const addIgnoredContactSchema = z.object({
  phoneNumber: z.string().trim().min(10, "Informe um telefone com DDI.").max(30, "Telefone muito longo."),
  displayName: z.string().trim().max(120, "Nome deve ter no maximo 120 caracteres.").optional().or(z.literal("")),
  reason: z.string().trim().max(300, "Motivo deve ter no maximo 300 caracteres.").optional().or(z.literal("")),
});

export const bulkIgnoredContactsSchema = z.object({
  contacts: z
    .array(
      z.object({
        jid: z.string().trim().min(8, "Contato invalido."),
        phoneNumber: z.string().trim().optional().or(z.literal("")),
        displayName: z.string().trim().max(120, "Nome deve ter no maximo 120 caracteres.").optional().or(z.literal("")),
        pushName: z.string().trim().max(120, "Nome deve ter no maximo 120 caracteres.").optional().or(z.literal("")),
        businessName: z.string().trim().max(120, "Nome comercial deve ter no maximo 120 caracteres.").optional().or(z.literal("")),
      })
    )
    .min(1, "Selecione pelo menos um contato.")
    .max(500, "Selecione no maximo 500 contatos por vez."),
  reason: z.string().trim().max(300, "Motivo deve ter no maximo 300 caracteres.").optional().or(z.literal("")),
});

export const pauseConversationAiSchema = z.object({
  reason: z.string().trim().max(300, "Motivo deve ter no maximo 300 caracteres.").optional().or(z.literal("")),
});

export const onboardingProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome."),
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data de nascimento valida.")
    .refine((value) => Boolean(parseDateOnly(value)), "Informe uma data de nascimento valida.")
    .refine((value) => {
      const date = parseDateOnly(value);
      return Boolean(date && date <= startOfTodayUtc());
    }, "A data de nascimento nao pode ser futura.")
    .refine((value) => {
      const date = parseDateOnly(value);
      if (!date) return false;

      const minDate = startOfTodayUtc();
      minDate.setUTCFullYear(minDate.getUTCFullYear() - 120);
      return date >= minDate;
    }, "Informe uma data de nascimento valida."),
  sex: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"], {
    message: "Selecione uma opcao.",
  }),
  businessName: z.string().trim().min(2, "Informe o nome do negocio."),
});

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return date;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
