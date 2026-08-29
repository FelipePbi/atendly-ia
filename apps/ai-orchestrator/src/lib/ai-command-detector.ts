export type AiCommand = {
  type: "PAUSE_AI_FOR_CONTACT";
};

export function detectAiCommand(
  messageText: string | null | undefined,
): AiCommand | null {
  const normalized = messageText?.trim().toLowerCase();
  if (normalized === "/ia_pause") {
    return { type: "PAUSE_AI_FOR_CONTACT" };
  }

  return null;
}
