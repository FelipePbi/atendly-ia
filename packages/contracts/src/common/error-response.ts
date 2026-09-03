import { z } from "zod";

import { requestIdSchema } from "./request-id.js";

export const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        details: z.unknown().optional()
      })
      .strict(),
    requestId: requestIdSchema
  })
  .strict();

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
