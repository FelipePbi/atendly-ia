/**
 * Marcação do áudio transcrito dentro do texto do turno.
 *
 * A transcrição vira o texto do turno, mas não pode se passar por texto que a
 * cliente digitou: ela é automática e pode errar. O marcador viaja junto do
 * texto — inclusive quando fragmentos de áudio e de texto são agrupados num
 * turno só — e a seção de prompt correspondente (`buildAudioPrompt`) diz ao
 * modelo o que fazer com ele.
 */
export const AUDIO_TURN_MARKER = "[audio transcrito]";

export function markTranscribedAudioTurn(transcript: string): string {
  return `${AUDIO_TURN_MARKER} ${transcript.trim()}`;
}

export function hasTranscribedAudioMarker(text: string): boolean {
  return text.includes(AUDIO_TURN_MARKER);
}

/**
 * Conteúdo de uma mensagem sem texto no histórico do modelo (2026-10-18).
 *
 * O estoque grava `body` vazio para mídia; a transcrição do áudio mora no
 * anexo. Sem isto o áudio chegava ao modelo como `""`, e a IA respondia como
 * se a cliente não tivesse dito nada. Áudio transcrito vira o mesmo marcador
 * do turno; o resto vira um marcador que diz o que chegou, nunca vazio.
 */
export function mediaHistoryContent(
  kind: string,
  attachment?: { transcriptStatus?: string | null; transcript?: string | null },
): string {
  if (kind === "AUDIO") {
    const transcript = attachment?.transcript?.trim();
    return attachment?.transcriptStatus === "DONE" && transcript
      ? markTranscribedAudioTurn(transcript)
      : "[audio sem transcricao]";
  }
  const labels: Record<string, string> = {
    IMAGE: "[imagem sem legenda]",
    STICKER: "[figurinha]",
    VIDEO: "[video sem legenda]",
    DOCUMENT: "[documento]",
  };
  return labels[kind] ?? "[mensagem sem texto]";
}
