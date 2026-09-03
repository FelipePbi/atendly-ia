import { z } from "zod";

export const idSchema = z.string().trim().min(1);

export type Id = z.infer<typeof idSchema>;
