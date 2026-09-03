import { z } from "zod";

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export const moneySchema = z
  .object({
    amountInMinorUnits: z.number().int(),
    currency: currencyCodeSchema
  })
  .strict();

export type Money = z.infer<typeof moneySchema>;
