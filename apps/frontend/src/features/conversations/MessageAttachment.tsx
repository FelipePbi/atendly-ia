"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  MessageAttachment,
  MessageAttachmentKind,
  TranscriptStatus,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import {
  formatDuration,
  formatFileSize,
  requestError,
  upstreamErrorCode,
} from "./format";

const kindLabel: Record<MessageAttachmentKind, string> = {
  AUDIO: "Áudio",
  DOCUMENT: "Documento",
  IMAGE: "Imagem",
  STICKER: "Figurinha",
  VIDEO: "Vídeo",
};

/**
 * As três recusas próprias que a rota de mídia pode devolver
 * (`error.details.upstreamCode`), nunca apresentadas como erro genérico.
 */
const refusalCopy: Record<string, string> = {
  MEDIA_TOO_LARGE: "Este arquivo é maior do que o suportado para baixar agora.",
  MEDIA_UNAVAILABLE: "A mídia não está disponível na origem no momento.",
  MESSAGE_ATTACHMENT_NOT_FOUND: "Esta mídia não está mais disponível.",
};

function mediaErrorCopy(error: unknown): string {
  const code = upstreamErrorCode(error);
  if (code && code in refusalCopy) return refusalCopy[code];
  return requestError(error, "Não foi possível carregar esta mídia.");
}

type MediaState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      contentType: string;
      fileName: string | null;
      status: "ready";
      url: string;
    };

/**
 * Um attachment do chat, sob demanda (Goal013/Goal017). Áudio mostra a
 * transcrição nos quatro estados **e** deixa ouvir o original; imagem,
 * documento e vídeo abrem o conteúdo. Nenhum deles busca bytes sozinho: a
 * profissional pede, e só então o proxy de mídia é consultado — nenhuma URL
 * de mídia nasce fora dessa busca.
 */
export function MessageAttachmentView({
  attachment,
  conversationId,
  messageId,
}: {
  attachment: MessageAttachment;
  conversationId: string;
  messageId: string;
}) {
  if (attachment.kind === "AUDIO") {
    return (
      <AudioAttachment
        attachment={attachment}
        conversationId={conversationId}
        messageId={messageId}
      />
    );
  }

  if (attachment.kind === "STICKER") {
    return (
      <div className="message-attachment message-attachment-sticker">
        <span className="message-attachment-kind">Figurinha</span>
      </div>
    );
  }

  return (
    <MediaAttachment
      attachment={attachment}
      conversationId={conversationId}
      messageId={messageId}
    />
  );
}

/**
 * Áudio como no quadro K3: tocar, onda e duração na mesma bolha da
 * transcrição. A onda é desenho fixo, não amostra do áudio: a plataforma não
 * guarda os bytes, e o player de verdade só nasce depois do pedido.
 */
function AudioAttachment({
  attachment,
  conversationId,
  messageId,
}: {
  attachment: MessageAttachment;
  conversationId: string;
  messageId: string;
}) {
  const { cancel, load, media } = useAttachmentMedia(conversationId, messageId);
  const duration =
    attachment.durationSeconds !== null
      ? formatDuration(attachment.durationSeconds)
      : null;

  return (
    <div className="message-attachment message-attachment-audio">
      {/*
       * Transcrição e áudio respondem a perguntas distintas: ler o que foi
       * dito não substitui ouvir como foi dito. O player só existe quando a
       * origem ainda tem os bytes (`mediaAvailable`) — a plataforma não guarda
       * cópia —, e a busca continua sendo sob demanda.
       */}
      {attachment.mediaAvailable && media.status === "ready" ? (
        // Sem `<track>`: o equivalente à legenda deste áudio é a
        // transcrição logo abaixo, que vem da IA e diz seu próprio estado.
        <audio
          aria-label="Áudio recebido na conversa"
          className="message-audio-player"
          controls
          src={media.url}
        />
      ) : (
        <div className="message-audio-row">
          {attachment.mediaAvailable && media.status !== "loading" ? (
            <button
              aria-label="Ouvir áudio"
              className="message-audio-play"
              onClick={() => void load()}
              type="button"
            >
              <PlayGlyph size={14} />
            </button>
          ) : (
            <span aria-hidden="true" className="message-audio-play is-idle">
              <PlayGlyph size={14} />
            </span>
          )}
          {media.status === "loading" ? (
            <span className="message-audio-loading">
              <span role="status">Carregando áudio…</span>
              <button
                className="message-audio-cancel"
                onClick={cancel}
                type="button"
              >
                Cancelar
              </button>
            </span>
          ) : (
            <span aria-hidden="true" className="message-audio-wave">
              {waveBars.map((height, index) => (
                <span
                  className={index < 8 ? "is-played" : undefined}
                  key={index}
                  style={{ height }}
                />
              ))}
            </span>
          )}
          {duration && (
            <span className="message-audio-duration">{duration}</span>
          )}
        </div>
      )}
      {attachment.tooLarge && (
        <p className="message-attachment-note">
          Áudio maior do que o limite do WhatsApp: os bytes não estão
          disponíveis.
        </p>
      )}
      {media.status === "error" && (
        <p
          className="message-attachment-note message-attachment-error"
          role="alert"
        >
          {media.message}
        </p>
      )}
      {!attachment.mediaAvailable && !attachment.tooLarge && (
        <p className="message-attachment-note">
          O áudio não está mais disponível na origem para ouvir.
        </p>
      )}
      <TranscriptView
        error={attachment.transcriptError}
        status={attachment.transcriptStatus}
        transcript={attachment.transcript}
      />
    </div>
  );
}

/** As alturas das 18 barras da onda do quadro K3; as 8 primeiras já tocadas. */
const waveBars = [
  8, 16, 22, 12, 18, 9, 20, 14, 6, 15, 21, 10, 17, 8, 13, 19, 7, 12,
];

function PlayGlyph({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function TranscriptView({
  error,
  status,
  transcript,
}: {
  error: string | null;
  status: TranscriptStatus | null;
  transcript: string | null;
}) {
  if (status === "DONE") {
    return (
      <div className="message-transcript is-done">
        <span className="message-transcript-label">Transcrição</span>
        <p>{transcript}</p>
      </div>
    );
  }
  if (status === "PENDING") {
    return (
      <p className="message-transcript is-pending" role="status">
        Transcrevendo áudio…
      </p>
    );
  }
  if (status === "FAILED") {
    return (
      <p className="message-transcript is-failed" role="alert">
        Não foi possível transcrever este áudio
        {error ? `: ${error}` : "."}
      </p>
    );
  }
  if (status === "SKIPPED") {
    return (
      <p className="message-transcript is-skipped">
        Transcrição não disponível para esta conversa.
      </p>
    );
  }
  return null;
}

/**
 * O estado de uma busca de mídia sob demanda, compartilhado por áudio, imagem,
 * documento e vídeo: um pedido explícito, cancelável, que vira blob local e é
 * revogado ao desmontar. O componente decide o que fazer com o blob — tocar,
 * abrir ou baixar —, nunca como obtê-lo.
 */
function useAttachmentMedia(conversationId: string, messageId: string) {
  const [media, setMedia] = useState<MediaState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const mediaRef = useRef<MediaState>(media);

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      if (mediaRef.current.status === "ready") {
        URL.revokeObjectURL(mediaRef.current.url);
      }
    },
    [],
  );

  const load = useCallback(async () => {
    if (mediaRef.current.status === "ready") return true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setMedia({ status: "loading" });
    try {
      const result = await getProductServices().conversations.getMedia(
        conversationId,
        messageId,
        controller.signal,
      );
      setMedia({
        contentType: result.contentType,
        fileName: result.fileName,
        status: "ready",
        url: URL.createObjectURL(result.blob),
      });
      return true;
    } catch (caught: unknown) {
      if (controller.signal.aborted) {
        setMedia({ status: "idle" });
        return false;
      }
      setMedia({ message: mediaErrorCopy(caught), status: "error" });
      return false;
    }
  }, [conversationId, messageId]);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  return { cancel, load, media };
}

function MediaAttachment({
  attachment,
  conversationId,
  messageId,
}: {
  attachment: MessageAttachment;
  conversationId: string;
  messageId: string;
}) {
  const { cancel, load, media } = useAttachmentMedia(conversationId, messageId);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function openMedia() {
    if (await load()) setDialogOpen(true);
  }

  const kind = attachment.kind;
  const title = attachment.fileName ?? kindLabel[kind];
  const image = kind === "IMAGE";

  return (
    <div className={clsx("message-attachment", image && "is-image")}>
      {image ? (
        // A bolha da imagem do quadro K2, antes de carregar: o conteúdo só
        // existe depois do pedido, então o quadro listrado é o próprio botão.
        attachment.mediaAvailable && media.status !== "loading" ? (
          <button
            className="message-image-tile"
            onClick={() => void openMedia()}
            type="button"
          >
            <span>Imagem recebida</span>
            <span>Ver mídia</span>
          </button>
        ) : (
          <div className="message-image-tile">
            {media.status === "loading" ? (
              <span role="status">Carregando mídia…</span>
            ) : (
              <span>Mídia não está disponível para visualização.</span>
            )}
          </div>
        )
      ) : (
        <div className="message-attachment-meta">
          <span className="message-attachment-kind">{kindLabel[kind]}</span>
          <span className="message-attachment-name">{title}</span>
          {attachment.sizeBytes !== null && (
            <span className="message-attachment-size">
              {formatFileSize(attachment.sizeBytes)}
            </span>
          )}
        </div>
      )}
      {attachment.tooLarge && (
        <p className="message-attachment-note">
          Arquivo maior do que o limite do WhatsApp: os bytes não estão
          disponíveis.
        </p>
      )}
      {media.status === "error" && (
        <p
          className="message-attachment-note message-attachment-error"
          role="alert"
        >
          {media.message}
        </p>
      )}
      {attachment.mediaAvailable &&
        (media.status === "loading" ? (
          <div className="message-attachment-actions">
            {!image && <span role="status">Carregando mídia…</span>}
            <button className="btn btn-tertiary" onClick={cancel} type="button">
              Cancelar
            </button>
          </div>
        ) : (
          !image && (
            <button
              className="btn btn-secondary message-attachment-view"
              onClick={() => void openMedia()}
              type="button"
            >
              <Icon name="eye" />
              Ver mídia
            </button>
          )
        ))}
      {!attachment.mediaAvailable && !attachment.tooLarge && !image && (
        <p className="message-attachment-note">
          Mídia não está disponível para visualização.
        </p>
      )}
      <Dialog
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        title={title}
      >
        {media.status === "ready" && <MediaPreview kind={kind} media={media} />}
      </Dialog>
    </div>
  );
}

function MediaPreview({
  kind,
  media,
}: {
  kind: MessageAttachmentKind;
  media: Extract<MediaState, { status: "ready" }>;
}) {
  if (kind === "IMAGE") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- blob local, sem otimização de imagem remota aplicável.
      <img
        alt="Imagem enviada na conversa"
        className="message-media-preview"
        src={media.url}
      />
    );
  }
  if (kind === "VIDEO") {
    return <video className="message-media-preview" controls src={media.url} />;
  }
  return (
    <a
      className="btn btn-primary"
      download={media.fileName ?? undefined}
      href={media.url}
      rel="noreferrer"
      target="_blank"
    >
      Abrir documento
    </a>
  );
}
