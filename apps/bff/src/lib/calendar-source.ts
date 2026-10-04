import { z } from "zod";

export const CALENDAR_SOURCE = "AVENLY" as const;
export type CalendarSource = typeof CALENDAR_SOURCE;

// Único ponto do BFF que ainda conhece o valor anterior à troca de marca
// (Goal109). Quem chega com ele é decodificado como `AVENLY`; nada o devolve.
const LEGACY_CALENDAR_SOURCE = "ATENDLY";

export const calendarSourceSchema = z
  .enum([CALENDAR_SOURCE, LEGACY_CALENDAR_SOURCE])
  .transform((): CalendarSource => CALENDAR_SOURCE);
