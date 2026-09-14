/**
 * Campos comuns às mensagens de mídia do proto whatsmeow (`waE2E`), tal como o
 * Go serializa: `fileSHA256` chega em base64 (é `[]byte` em Go), `fileLength`
 * e `seconds` chegam como número.
 */
export interface EvolutionMediaFields {
  mimetype?: string;
  fileSHA256?: string;
  fileLength?: number;
  /** Duração, só em áudio e vídeo. */
  seconds?: number;
  /** Nome do arquivo, só em documento. */
  fileName?: string;
  caption?: string;
  /** Só em vídeo: `true` marca o GIF do WhatsApp, que trafega como vídeo. */
  gifPlayback?: boolean;
}

export interface EvolutionWebhookPayload {
  event?: string;
  instanceId?: string;
  instanceToken?: string;
  data?: {
    Info?: {
      Chat?: string;
      Sender?: string;
      IsFromMe?: boolean;
      IsGroup?: boolean;
      ID?: string;
      Type?: string;
      PushName?: string;
      Timestamp?: string;
      MediaType?: string;
    };
    Message?: Record<string, unknown> & {
      imageMessage?: EvolutionMediaFields;
      audioMessage?: EvolutionMediaFields;
      documentMessage?: EvolutionMediaFields;
      videoMessage?: EvolutionMediaFields;
      stickerMessage?: EvolutionMediaFields;
      /**
       * Mesclados pelo Go em `data.Message` quando a mídia é baixada:
       * `base64` só enquanto o evento está pendente (WU-02 purga ao concluir),
       * `mediaUrl` só quando hospedada (Minio/S3), `mediaTooLarge` quando
       * excede o teto de embutir inline.
       */
      base64?: string;
      mediaUrl?: string;
      mimetype?: string;
      mediaSize?: number;
      fileName?: string;
      mediaTooLarge?: boolean;
    };
  };
}

export interface EvolutionSendTextResponse {
  success?: boolean;
  message?: string;
  messageId?: string;
  data?: {
    Info?: {
      ID?: string;
    };
  };
  key?: {
    id?: string;
  };
}
