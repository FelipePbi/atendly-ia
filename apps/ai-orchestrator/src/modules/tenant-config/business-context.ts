import { z } from "zod";

export const BUSINESS_MODALITIES = ["ON_SITE", "AT_HOME", "ONLINE"] as const;
export type BusinessModality = (typeof BUSINESS_MODALITIES)[number];

// Rotulos usados no prompt (tenant-context.ts); vocabulario alinhado ao enum
// "BusinessModality" do Postgres (Goal018/WU-01).
export const BUSINESS_MODALITY_LABELS: Record<BusinessModality, string> = {
  ON_SITE: "atendimento presencial no endereco do negocio",
  AT_HOME: "atendimento a domicilio",
  ONLINE: "atendimento online",
};

export const businessContextSchema = z.object({
  // Incrementado a cada mudanca de dado de negocio no BFF; usado para saber
  // se a projecao gravada em AiTenantConfig.settings esta atrasada.
  version: z.number().int().nonnegative().default(1),
  businessName: z.string().trim().default(""),
  timezone: z.string().trim().default("America/Sao_Paulo"),
  segment: z.string().trim().default(""),
  modalities: z.array(z.enum(BUSINESS_MODALITIES)).default([]),
  address: z.string().trim().default(""),
});

export type BusinessContext = z.infer<typeof businessContextSchema>;

export const DEFAULT_BUSINESS_CONTEXT: BusinessContext = {
  version: 1,
  businessName: "",
  timezone: "America/Sao_Paulo",
  segment: "",
  modalities: [],
  address: "",
};

export function normalizeBusinessContext(value: unknown): BusinessContext {
  const parsed = businessContextSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BUSINESS_CONTEXT;
}

export function businessContextConfigured(context: BusinessContext): boolean {
  return context.businessName.length >= 2;
}
