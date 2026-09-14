import { env, requireEnv } from "../../config/env.js";
import {
  type DiagnosticLogger,
  noopDiagnosticLogger,
  truncateDiagnostic,
} from "../../lib/diagnostic-log.js";
import { AppError } from "../../lib/errors.js";
import type {
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from "./transcription-provider.js";

/**
 * Transcrição pela API de áudio da OpenAI, por HTTP.
 *
 * Sem SDK novo e sem provider novo de propósito: é a mesma conta já
 * configurada em `OPENAI_API_KEY`, e a chamada é um `multipart/form-data`
 * simples. O idioma vai explícito (`pt`) porque, sem ele, a API pode devolver
 * o áudio traduzido em vez de transcrito.
 *
 * O timeout é próprio: a transcrição roda dentro do lease da inbox, renovado
 * pelo heartbeat enquanto o lote executa, mas um áudio pendurado sem teto
 * seguraria o lote inteiro.
 */
export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  readonly provider = "openai";

  constructor(
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
  ) {}

  get model(): string {
    return env.OPENAI_TRANSCRIPTION_MODEL;
  }

  async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    requireEnv(["OPENAI_API_KEY", "OPENAI_TRANSCRIPTION_MODEL"]);
    const url = `${trimTrailingSlash(env.OPENAI_BASE_URL)}/audio/transcriptions`;
    const language = request.language ?? env.OPENAI_TRANSCRIPTION_LANGUAGE;

    const form = new FormData();
    form.append("model", this.model);
    if (language) form.append("language", language);
    form.append("response_format", "json");
    form.append(
      "file",
      new Blob([request.audio.data as unknown as BlobPart], {
        type: request.audio.mimetype || "application/octet-stream",
      }),
      request.audio.fileName || defaultFileName(request.audio.mimetype),
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.OPENAI_API_KEY}`,
          ...(request.requestId ? { "x-request-id": request.requestId } : {}),
        },
        body: form,
        signal: AbortSignal.timeout(env.OPENAI_TRANSCRIPTION_TIMEOUT_MS),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AppError("Audio transcription timed out.", {
          statusCode: 504,
          code: "TRANSCRIPTION_TIMEOUT",
        });
      }
      throw error;
    }

    const raw = await parseResponse(response);
    if (!response.ok) {
      this.logger.error(
        {
          url,
          status: response.status,
          model: this.model,
          requestId: request.requestId,
          response: truncateDiagnostic(raw),
        },
        "Audio transcription failed",
      );
      throw new AppError(
        `Audio transcription failed with HTTP ${response.status}`,
        { statusCode: response.status, code: "TRANSCRIPTION_FAILED" },
      );
    }

    const text = extractText(raw);
    if (!text) {
      throw new AppError("Audio transcription returned no text.", {
        statusCode: 502,
        code: "TRANSCRIPTION_EMPTY",
      });
    }

    return { text, provider: this.provider, model: this.model };
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * A API exige um nome de arquivo com extensão reconhecida; o WhatsApp manda
 * áudio de voz sem nome nenhum.
 */
function defaultFileName(mimetype?: string): string {
  const normalized = (mimetype ?? "").toLowerCase();
  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "audio.mp3";
  }
  if (normalized.includes("mp4") || normalized.includes("m4a")) {
    return "audio.m4a";
  }
  if (normalized.includes("wav")) return "audio.wav";
  if (normalized.includes("webm")) return "audio.webm";
  return "audio.ogg";
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || error.name === "AbortError";
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractText(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw.trim() || undefined;
  if (typeof raw !== "object" || raw === null) return undefined;
  const text = (raw as { text?: unknown }).text;
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}
