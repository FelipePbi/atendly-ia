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
