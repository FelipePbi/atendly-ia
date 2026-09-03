import { z } from "zod";

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().positive(),
    pageSize: z.coerce.number().int().positive()
  })
  .strict();

export const paginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative()
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type Pagination = z.infer<typeof paginationSchema>;
