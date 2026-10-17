"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  MessageAttachment,
  MessageAttachmentKind,
  TranscriptStatus,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { Dialog } from "@/shared/ui/Dialog";

import {
  formatDuration,
  formatFileSize,
  requestError,
  upstreamErrorCode,
} from "./format";
import { type CachedMedia, loadMedia, peekMedia } from "./mediaCache";

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

function isRefusal(error: unknown): boolean {
  const code = upstreamErrorCode(error);
  return code !== undefined && code in refusalCopy;
}

function mediaErrorCopy(error: unknown): string {
  const code = upstreamErrorCode(error);
  if (code && code in refusalCopy) return refusalCopy[code];
  return requestError(error, "Não foi possível carregar esta mídia.");
}

type MediaState =
  | { status: "idle" }
  | { status: "loading" }
  | { message: string; refused: boolean; status: "error" }
  | (CachedMedia & { status: "ready" });

function initialState(conversationId: string, messageId: string): MediaState {
  const cached = peekMedia(conversationId, messageId);
  return cached ? { ...cached, status: "ready" } : { status: "idle" };
}

function failure(error: unknown): MediaState {
  return {
    message: mediaErrorCopy(error),
    refused: isRefusal(error),
    status: "error",
  };
}

/**
 * Um attachment do chat. Imagem e figurinha aparecem sozinhas quando chegam
 * perto da tela — é o que a profissional espera de um chat —; áudio, vídeo e
 * documento só buscam bytes quando ela pede. Em todos os casos os bytes vêm
 * do proxy de mídia do BFF e viram blob local (`mediaCache`): nenhuma URL do
 * WhatsApp chega ao navegador.
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
  const props = { attachment, conversationId, messageId };
  if (attachment.kind === "AUDIO") return <AudioAttachment {...props} />;
  if (attachment.kind === "IMAGE") return <ImageAttachment {...props} />;
  if (attachment.kind === "STICKER") return <StickerAttachment {...props} />;
  return <MediaAttachment {...props} />;
}

type AttachmentProps = {
  attachment: MessageAttachment;
  conversationId: string;
  messageId: string;
};

/**
 * Busca automática para imagem e figurinha: começa quando o balão chega a
 * ~400 px da área visível (mensagens antigas lá em cima esperam a rolagem).
 * Sair da tela antes da vez devolve o lugar na fila; a busca que já começou
 * termina e fica guardada para a volta.
 */
function useVisibleMedia(
  conversationId: string,
  messageId: string,
  enabled: boolean,
) {
  const [media, setMedia] = useState<MediaState>(() =>
    initialState(conversationId, messageId),
  );
  const [attempt, setAttempt] = useState(0);
  const targetRef = useRef<HTMLElement | null>(null);
  const status = media.status;

  useEffect(() => {
    if (!enabled || status === "ready" || status === "error") return;
    const target = targetRef.current;
    const controller = new AbortController();
    let observer: IntersectionObserver | undefined;

    const start = () => {
      observer?.disconnect();
      setMedia({ status: "loading" });
      loadMedia(conversationId, messageId, {
        keepRunning: true,
        signal: controller.signal,
      }).then(
        (result) => {
          if (!controller.signal.aborted) setMedia({ ...result, status: "ready" });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setMedia(failure(error));
        },
      );
    };

    if (target && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) start();
        },
        // A margem só vale para a raiz: com a janela como raiz, o que está
        // logo acima na rolagem da conversa nunca contaria como perto.
        { root: scrollParent(target), rootMargin: "400px 0px" },
      );
      observer.observe(target);
    } else {
      start();
    }
    return () => {
      observer?.disconnect();
      controller.abort();
    };
    // `status` fora de propósito: "loading" é escrito aqui dentro, e reagir a
    // ele cancelaria a própria busca. `attempt` refaz depois de um erro.
  }, [attempt, conversationId, enabled, messageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => {
    setMedia({ status: "idle" });
    setAttempt((value) => value + 1);
  }, []);

  return { media, retry, targetRef };
}

function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll") return parent;
  }
  return null;
}

function ImageAttachment({ attachment, conversationId, messageId }: AttachmentProps) {
  const available = attachment.mediaAvailable;
  const { media, retry, targetRef } = useVisibleMedia(
    conversationId,
    messageId,
    available,
  );
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const title = attachment.fileName ?? "Imagem";

  if (!available || broken || (media.status === "error" && media.refused)) {
    return (
      <div className="message-attachment is-image">
        <div className="message-image-tile is-unavailable">
          <ImageOffGlyph />
          <span>Mídia indisponível</span>
        </div>
        {attachment.tooLarge && (
          <p className="message-attachment-note">
            Arquivo maior do que o limite do WhatsApp.
          </p>
        )}
      </div>
    );
  }

  if (media.status === "error") {
    return (
      <div className="message-attachment is-image">
        <div className="message-image-tile is-unavailable" role="alert">
          <ImageOffGlyph />
          <span>Não foi possível carregar a imagem.</span>
          <button className="message-image-retry" onClick={retry} type="button">
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  if (media.status !== "ready") {
    return (
      <div className="message-attachment is-image">
        <div
          aria-busy="true"
          className="message-image-tile is-loading"
          ref={(node) => {
            targetRef.current = node;
          }}
        >
          <span className="sr-only" role="status">
            Carregando imagem…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="message-attachment is-image">
      <button
        aria-haspopup="dialog"
        aria-label="Ampliar imagem"
        className={clsx("message-image-thumb", loaded && "is-loaded")}
        onClick={() => setOpen(true)}
        type="button"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- blob local, sem otimização de imagem remota aplicável. */}
        <img
          alt="Imagem da conversa"
          onError={() => setBroken(true)}
          onLoad={() => setLoaded(true)}
          src={media.url}
        />
      </button>
      <Dialog onClose={() => setOpen(false)} open={open} title={title}>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob local. */}
        <img
          alt="Imagem da conversa em tamanho maior"
          className="message-media-preview"
          src={media.url}
        />
      </Dialog>
    </div>
  );
}

/**
 * Figurinha do WhatsApp: WebP 512×512, estático ou animado — o navegador
 * anima o WebP sozinho. Fica fora do balão, como no WhatsApp.
 */
function StickerAttachment({
  attachment,
  conversationId,
  messageId,
}: AttachmentProps) {
  const available = attachment.mediaAvailable;
  const { media, targetRef } = useVisibleMedia(
    conversationId,
    messageId,
    available,
  );
  const [broken, setBroken] = useState(false);

  if (!available || broken || media.status === "error") {
    return (
      <div className="message-attachment message-attachment-sticker">
        <span className="message-attachment-kind">Figurinha indisponível</span>
      </div>
    );
  }

  return (
    <div className="message-attachment message-attachment-sticker">
      {media.status === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob local.
        <img
          alt="Figurinha"
          className="message-sticker"
          height={128}
          onError={() => setBroken(true)}
          src={media.url}
          width={128}
        />
      ) : (
        <span
          aria-busy="true"
          className="message-sticker is-loading"
          ref={(node) => {
            targetRef.current = node;
          }}
        >
          <span className="sr-only" role="status">
            Carregando figurinha…
          </span>
        </span>
      )}
    </div>
  );
}

/** Só um áudio toca por vez, como no WhatsApp. */
let playingAudio: HTMLAudioElement | null = null;

const playbackRates = [1, 1.5, 2] as const;

function formatRate(rate: number) {
  return `${String(rate).replace(".", ",")}×`;
}

/**
 * Áudio como no quadro K3: tocar, onda e duração na mesma bolha da
 * transcrição. O primeiro toque busca os bytes e já toca; depois, pausar,
 * retomar, arrastar a posição (também pelas setas do teclado) e mudar a
 * velocidade. A onda é desenho fixo, não amostra do áudio; ela mostra quanto
 * já tocou.
 */
function AudioAttachment({ attachment, conversationId, messageId }: AttachmentProps) {
  const { cancel, load, media } = useAttachmentMedia(conversationId, messageId);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playWhenReady = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [measured, setMeasured] = useState<number | null>(null);
  const [rate, setRate] = useState<number>(1);
  const [unplayable, setUnplayable] = useState(false);
  const duration = measured ?? attachment.durationSeconds;
  const ready = media.status === "ready";

  const play = useCallback((audio: HTMLAudioElement) => {
    if (playingAudio && playingAudio !== audio) playingAudio.pause();
    playingAudio = audio;
    // Navegador que bloqueia tocar sem gesto recente só deixa o botão em
    // "Ouvir"; o próximo toque toca.
    void audio.play()?.catch(() => undefined);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!ready || !audio || !playWhenReady.current) return;
    playWhenReady.current = false;
    play(audio);
  }, [play, ready]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio && playingAudio === audio) playingAudio = null;
    };
  }, [ready]);

  async function toggle() {
    const audio = audioRef.current;
    if (!ready || !audio) {
      playWhenReady.current = true;
      await load();
      return;
    }
    if (audio.paused) play(audio);
    else audio.pause();
  }

  function cycleRate() {
    const index = playbackRates.findIndex((value) => value === rate);
    const next = playbackRates[(index + 1) % playbackRates.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const progress = duration ? Math.min(1, position / duration) : 0;
  const playedBars = Math.round(progress * waveBars.length);
  const canPlay = attachment.mediaAvailable && !unplayable;
  const timeLabel =
    playing || position > 0
      ? formatDuration(position)
      : duration !== null
        ? formatDuration(duration)
        : null;

  return (
    <div className="message-attachment message-attachment-audio">
      {ready && (
        // Sem `<track>`: o equivalente à legenda deste áudio é a
        // transcrição logo abaixo, que vem da IA e diz seu próprio estado.
        <audio
          className="message-audio-element"
          onEnded={() => {
            setPlaying(false);
            setPosition(0);
          }}
          onError={() => {
            setPlaying(false);
            setUnplayable(true);
          }}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setMeasured(value);
            event.currentTarget.playbackRate = rate;
          }}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          preload="auto"
          ref={audioRef}
          src={media.url}
        />
      )}
      <div className="message-audio-row">
        {canPlay && media.status !== "loading" ? (
          <button
            aria-label={playing ? "Pausar áudio" : "Ouvir áudio"}
            className="message-audio-play"
            onClick={() => void toggle()}
            type="button"
          >
            {playing ? <PauseGlyph size={14} /> : <PlayGlyph size={14} />}
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
          <span className="message-audio-track">
            <span aria-hidden="true" className="message-audio-wave">
              {waveBars.map((height, index) => (
                <span
                  className={index < playedBars ? "is-played" : undefined}
                  key={index}
                  style={{ height }}
                />
              ))}
            </span>
            {ready && !unplayable && duration ? (
              <input
                aria-label="Posição do áudio"
                aria-valuetext={`${formatDuration(position)} de ${formatDuration(duration)}`}
                className="message-audio-seek"
                max={duration}
                min={0}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (audioRef.current) audioRef.current.currentTime = value;
                  setPosition(value);
                }}
                step={0.1}
                type="range"
                value={Math.min(position, duration)}
              />
            ) : null}
          </span>
        )}
        {timeLabel && (
          <span className="message-audio-duration">{timeLabel}</span>
        )}
        {ready && !unplayable && (
          <button
            aria-label={`Velocidade ${formatRate(rate)}. Mudar velocidade`}
            className="message-audio-rate"
            onClick={cycleRate}
            type="button"
          >
            {formatRate(rate)}
          </button>
        )}
      </div>
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
      {unplayable && (
        <p
          className="message-attachment-note message-attachment-error"
          role="alert"
        >
          Não foi possível tocar este áudio neste navegador.
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

/** As alturas das 18 barras da onda do quadro K3. */
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

function PauseGlyph({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
    </svg>
  );
}

function ImageOffGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="22"
    >
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-4.5-4.5L8 20" />
      <path d="M3 3l18 18" />
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
 * A busca de mídia pedida pela profissional (áudio, vídeo e documento): um
 * pedido explícito e cancelável. O blob fica no `mediaCache`, que é quem o
 * revoga — voltar à conversa encontra o áudio já pronto.
 */
function useAttachmentMedia(conversationId: string, messageId: string) {
  const [media, setMedia] = useState<MediaState>(() =>
    initialState(conversationId, messageId),
  );
  const controllerRef = useRef<AbortController | null>(null);
  const mediaRef = useRef<MediaState>(media);

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const load = useCallback(async () => {
    if (mediaRef.current.status === "ready") return true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setMedia({ status: "loading" });
    try {
      const result = await loadMedia(conversationId, messageId, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;
      setMedia({ ...result, status: "ready" });
      return true;
    } catch (caught: unknown) {
      if (controller.signal.aborted) {
        setMedia({ status: "idle" });
        return false;
      }
      setMedia(failure(caught));
      return false;
    }
  }, [conversationId, messageId]);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  return { cancel, load, media };
}

/** Vídeo e documento: rótulo neutro com nome e tamanho, e "Ver mídia". */
function MediaAttachment({ attachment, conversationId, messageId }: AttachmentProps) {
  const { cancel, load, media } = useAttachmentMedia(conversationId, messageId);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function openMedia() {
    if (await load()) setDialogOpen(true);
  }

  const kind = attachment.kind;
  const title = attachment.fileName ?? kindLabel[kind];

  return (
    <div className="message-attachment">
      <div className="message-attachment-meta">
        <span className="message-attachment-kind">{kindLabel[kind]}</span>
        <span className="message-attachment-name">{title}</span>
        {attachment.sizeBytes !== null && (
          <span className="message-attachment-size">
            {formatFileSize(attachment.sizeBytes)}
          </span>
        )}
      </div>
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
            <span role="status">Carregando mídia…</span>
            <button className="btn btn-tertiary" onClick={cancel} type="button">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            className="btn btn-secondary message-attachment-view"
            onClick={() => void openMedia()}
            type="button"
          >
            <Icon name="eye" />
            Ver mídia
          </button>
        ))}
      {!attachment.mediaAvailable && !attachment.tooLarge && (
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
  media: CachedMedia;
}) {
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
