import { z } from "zod";

export const businessContextSchema = z.object({
  businessName: z.string().trim().default(""),
  timezone: z.string().trim().default("America/Sao_Paulo"),
});

export type BusinessContext = z.infer<typeof businessContextSchema>;

export const DEFAULT_BUSINESS_CONTEXT: BusinessContext = {
  businessName: "",
  timezone: "America/Sao_Paulo",
};

export function normalizeBusinessContext(value: unknown): BusinessContext {
  const parsed = businessContextSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BUSINESS_CONTEXT;
}

export function businessContextConfigured(context: BusinessContext): boolean {
  return context.businessName.length >= 2;
}
