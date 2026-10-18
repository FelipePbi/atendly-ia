import type { ReturnInvitationPromptItem } from "../prompts/customer-return.js";

/** Linha gravada do convite, no recorte que a conversa usa. */
export interface ReturnInvitationRow {
  kind: string;
  serviceName: string | null;
  expectedDate: string | null;
  incentive: string | null;
  offeredSlots: unknown;
  habit: unknown;
  sentAt: Date;
  followUpSentAt: Date | null;
}

function slotsOf(value: unknown): Array<{ date: string; time: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (slot): slot is { date: string; time: string } =>
      typeof slot === "object" &&
      slot !== null &&
      typeof (slot as { date?: unknown }).date === "string" &&
      typeof (slot as { time?: unknown }).time === "string",
  );
}

function habitOf(value: unknown): ReturnInvitationPromptItem["habit"] {
  if (typeof value !== "object" || value === null) return null;
  const habit = value as {
    weekdays?: unknown;
    bandStart?: unknown;
    bandEnd?: unknown;
  };
  if (
    !Array.isArray(habit.weekdays) ||
    typeof habit.bandStart !== "string" ||
    typeof habit.bandEnd !== "string"
  ) {
    return null;
  }
  return {
    weekdays: habit.weekdays.filter(
      (day): day is number => typeof day === "number",
    ),
    bandStart: habit.bandStart,
    bandEnd: habit.bandEnd,
  };
}

/** Convite gravado -> secao do prompt (D-202). */
export function returnInvitationPromptItem(
  row: ReturnInvitationRow,
): ReturnInvitationPromptItem {
  return {
    kind: row.kind === "WINBACK" ? "WINBACK" : "RENEWAL",
    serviceName: row.serviceName,
    expectedDate: row.expectedDate,
    incentive: row.incentive,
    offeredSlots: slotsOf(row.offeredSlots),
    habit: habitOf(row.habit),
    sentAt: row.sentAt.toISOString(),
    followUpSentAt: row.followUpSentAt?.toISOString() ?? null,
  };
}
