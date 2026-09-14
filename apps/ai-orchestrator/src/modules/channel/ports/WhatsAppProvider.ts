import type { ChannelProviderName } from "../domain/ChannelMessage.js";

export interface SendTextInput {
  to: string;
  text: string;
  quotedMessageId?: string;
  quotedParticipant?: string;
  correlationId?: string;
  requestId?: string;
}

export interface SendTextResult {
  provider: ChannelProviderName;
  messageId?: string;
  raw: unknown;
}

/**
 * Download sob demanda da midia (Goal013).
 *
 * O proto guardado no evento (`data.Message`) e a chave: o provedor do canal
 * sabe baixar do WhatsApp a partir dele, com a **credencial da instancia** —
 * a mesma do envio, nunca a chave global. A IA nao guarda os bytes; ela os
 * pede quando precisa deles (transcricao, exibicao) e os descarta depois.
 */
export interface DownloadMediaInput {
  message: Record<string, unknown>;
  requestId?: string;
}

export interface DownloadMediaResult {
  provider: ChannelProviderName;
  /** Data URL (`data:<mimetype>;base64,...`), como o Evolution Go devolve. */
  base64: string;
}

export interface WhatsAppProvider {
  sendText(input: SendTextInput): Promise<SendTextResult>;
  /**
   * Opcional: o caminho legado e os dubles que so sabem enviar texto seguem
   * validos, e a midia sem download disponivel vira `MEDIA_UNAVAILABLE` em vez
   * de derrubar o turno.
   */
  downloadMedia?(input: DownloadMediaInput): Promise<DownloadMediaResult>;
}
