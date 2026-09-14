/**
 * Porta de transcrição de áudio.
 *
 * Existe como porta, e não como chamada direta à OpenAI, por duas razões de
 * produto: a transcrição acontece dentro do turno (com política de contato
 * antes dela), então o teste precisa **contar chamadas** para provar que
 * contato ignorado e sessão pessoal nunca chegam ao provedor; e a decisão de
 * qual serviço transcreve é de infraestrutura, não do grafo.
 *
 * A porta não decide política, não lê o banco e não sabe o que é sessão: ela
 * recebe bytes e devolve texto, ou falha. Quem decide se pode transcrever é
 * `AudioTranscriptionService`.
 */

export interface TranscriptionAudio {
  data: Uint8Array;
  /** Tipo do arquivo como o provedor do canal declarou (`audio/ogg; codecs=opus`, ...). */
  mimetype?: string;
  fileName?: string;
  durationSeconds?: number;
}

export interface TranscriptionRequest {
  audio: TranscriptionAudio;
  /** Idioma esperado do áudio, em código curto (`pt`). */
  language?: string;
  requestId?: string;
}

export interface TranscriptionResult {
  /** Texto transcrito. Vazio é falha de transcrição, não resultado válido. */
  text: string;
  /** Proveniência gravada no attachment junto do texto. */
  provider: string;
  model: string;
}

export interface TranscriptionProvider {
  readonly provider: string;
  readonly model: string;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}
