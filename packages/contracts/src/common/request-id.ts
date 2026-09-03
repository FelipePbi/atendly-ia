import { z } from "zod";

export const requestIdSchema = z.string().trim().min(1);

export type RequestId = z.infer<typeof requestIdSchema>;
