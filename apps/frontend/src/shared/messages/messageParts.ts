import type { AiMessageDelivery } from "@/data";

/**
 * Mensagens em várias partes curtas (D-208), do lado da tela.
 *
 * Cópia deliberada do teto e da junção de
 * `apps/ai-orchestrator/src/modules/outbox/message-dispatch.ts` (BLOCKS):
 * as prévias mostram exatamente as mensagens que o envio manda. Os testes
 * dos dois lados afirmam as mesmas partes para os mesmos fatos.
 */

/** Teto de partes por mensagem; o excedente vai junto na última. */
export const MESSAGE_MAX_PARTS = 5;

/** Ausente ou desconhecido vale `PARTS`, o padrão de todo negócio. */
export function resolveMessageDelivery(
  value: AiMessageDelivery | null | undefined,
): AiMessageDelivery {
  return value === "SINGLE" ? "SINGLE" : "PARTS";
}

/** Junta o excedente na última parte, separado por linha em branco. */
export function capMessageParts(parts: readonly string[]): string[] {
  const kept = parts.filter((part) => part.trim().length > 0);
  if (kept.length <= MESSAGE_MAX_PARTS) return kept;
  return [
    ...kept.slice(0, MESSAGE_MAX_PARTS - 1),
    kept.slice(MESSAGE_MAX_PARTS - 1).join("\n\n"),
  ];
}

/**
 * As mensagens do WhatsApp, uma por balão: em partes, cada parte (com o
 * teto); numa mensagem só, o texto inteiro num balão.
 */
export function messageBubbles(
  parts: readonly string[],
  delivery: AiMessageDelivery,
): string[] {
  const capped = capMessageParts(parts);
  if (delivery === "SINGLE")
    return capped.length > 0 ? [capped.join("\n\n")] : [];
  return capped;
}

/**
 * "digitando…" antes de cada parte, proporcional ao tamanho do texto, como
 * no envio (`typingDelayFor`): de 0,8 a 2 segundos.
 */
export function typingDelayFor(text: string): number {
  return Math.min(2000, Math.max(800, Math.round(text.length * 30)));
}
