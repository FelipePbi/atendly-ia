import { z } from "zod";

export const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/);

export type Phone = z.infer<typeof phoneSchema>;
