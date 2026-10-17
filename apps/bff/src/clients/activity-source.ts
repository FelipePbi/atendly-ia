import { z } from "zod";

/**
 * Página do registro de atividade de uma fonte interna (Scheduling ou IA),
 * D-176. As duas expõem `GET /internal/activity` com o mesmo formato; quem
 * intercala e decide o corte é o BFF.
 */
const activityValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const internalActivityRecordSchema = z.object({
  id: z.string(),
  sequence: z.string(),
  occurredAt: z.string(),
  actorType: z.enum(["AI", "USER"]),
  actorId: z.string().nullable(),
  area: z.enum([
    "AGENDA",
    "CUSTOMERS",
    "SERVICES",
    "SETTINGS",
    "IMPORT",
    "CONVERSATIONS",
  ]),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  entityLabel: z.string().nullable(),
  changes: z.array(
    z.object({
      field: z.string(),
      before: activityValueSchema,
      after: activityValueSchema,
    }),
  ),
  details: z.unknown().nullable(),
});

export const internalActivityPageSchema = z.object({
  items: z.array(internalActivityRecordSchema),
  hasMore: z.boolean(),
});

export type InternalActivityRecord = z.output<
  typeof internalActivityRecordSchema
>;
export type InternalActivityPage = z.output<typeof internalActivityPageSchema>;

/** Filtros e corte já traduzidos para a query de uma fonte. */
export interface InternalActivityQuery {
  from?: string;
  to?: string;
  actor?: "AI" | "USER";
  area?: string;
  action?: string;
  q?: string;
  beforeAt?: string;
  beforeSequence?: string;
  inclusive?: boolean;
  limit: number;
}
