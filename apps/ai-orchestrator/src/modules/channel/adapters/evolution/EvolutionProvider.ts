import { env, requireEnv } from "../../../../config/env.js";
import {
  type DiagnosticLogger,
  maskPhone,
  noopDiagnosticLogger,
  truncateDiagnostic,
} from "../../../../lib/diagnostic-log.js";
import { AppError } from "../../../../lib/errors.js";
import { redactSensitive } from "../../../../lib/redact.js";
import type {
  DownloadMediaInput,
  DownloadMediaResult,
  SendTextInput,
  SendTextResult,
  WhatsAppProvider,
} from "../../ports/WhatsAppProvider.js";
import type { EvolutionSendTextResponse } from "./EvolutionTypes.js";

/**
 * Credencial da instância, já resolvida ou resolvível sob demanda.
 *
 * A forma de função existe para o inbound: resolver a credencial só no momento
 * do envio mantém a recepção independente do estado da projeção. Um vínculo
 * ainda não reprovisionado faz falhar a resposta, não a persistência da
 * mensagem que o cliente mandou.
 */
export type EvolutionInstanceCredential = string | (() => string);

export class EvolutionProvider implements WhatsAppProvider {
  constructor(
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
    private readonly instanceToken?: EvolutionInstanceCredential,
    private readonly instanceIdOverride?: string,
  ) {}

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    requireEnv(["EVOLUTION_BASE_URL"]);
    const instanceId = this.instanceIdOverride;
    // Sem queda para EVOLUTION_API_KEY: a chave global não substitui a
    // credencial da instância. Sem credencial resolvida pelo vínculo, o envio
    // falha em vez de sair assinado por outra identidade.
    const apiKey =
      typeof this.instanceToken === "function"
        ? this.instanceToken()
        : this.instanceToken;
    if (!instanceId || !apiKey) {
      throw new AppError("Evolution channel credentials are not configured.", {
        statusCode: 500,
        code: "EVOLUTION_CHANNEL_NOT_CONFIGURED",
      });
    }

    const url = joinUrl(env.EVOLUTION_BASE_URL, env.EVOLUTION_SEND_TEXT_PATH);
    this.logger.info(
      {
        url,
        to: maskPhone(input.to),
        textLength: input.text.length,
        quotedMessageId: input.quotedMessageId,
        correlationId: input.correlationId,
        requestId: input.requestId,
        hasInstanceIdHeader: true,
        hasApiKeyHeader: true,
      },
      "EvolutionProvider sending text",
    );

    // Sem timeout o envio pode ficar pendurado indefinidamente e a saida
    // persistida nunca sai de PENDING. Expirar aqui e o que permite ao outbox
    // classificar a tentativa como `unknown` — nao entregue, nao descartada.
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(apiKey, instanceId, input.requestId),
        body: JSON.stringify(buildSendTextBody(input)),
        signal: AbortSignal.timeout(env.EVOLUTION_SEND_TIMEOUT_MS),
      });
    } catch (error) {
      if (isAbortError(error)) {
        this.logger.error(
          {
            url,
            to: maskPhone(input.to),
            requestId: input.requestId,
            timeoutMs: env.EVOLUTION_SEND_TIMEOUT_MS,
          },
          "EvolutionProvider send timed out without a transport answer",
        );
        throw new AppError("Evolution Go send timed out.", {
          statusCode: 504,
          code: "EVOLUTION_SEND_TIMEOUT",
        });
      }
      throw error;
    }

    const raw = await parseResponse(response);
    if (!response.ok) {
      this.logger.error(
        {
          url,
          to: maskPhone(input.to),
          status: response.status,
          requestId: input.requestId,
          response: truncateDiagnostic(redactSensitive(raw)),
        },
        "EvolutionProvider send failed",
      );
      throw new AppError(
        `Evolution Go send failed with HTTP ${response.status}`,
        {
          statusCode: response.status,
          code: "EVOLUTION_SEND_FAILED",
          details: redactSensitive(raw),
        },
      );
    }

    const messageId = extractMessageId(raw);
    this.logger.info(
      {
        url,
        to: maskPhone(input.to),
        status: response.status,
        messageId,
        requestId: input.requestId,
      },
      "EvolutionProvider send succeeded",
    );

    return {
      provider: "evolution-go",
      messageId,
      // `raw` é persistido em Message.rawPayload; sai daqui já sem segredo.
      raw: redactSensitive(raw),
    };
  }

  /**
   * Download sob demanda da mídia, a partir do proto guardado no evento.
   *
   * Mesma credencial de instância do envio, pela mesma razão: a rota do Go
   * está sob `authMiddleware.Auth` e o download acontece **na conta daquela
   * instância**. A chave global não substitui a credencial — sem ela o
   * download falha, e a falha vira `MEDIA_UNAVAILABLE` para quem chamou, em
   * vez de derrubar o turno.
   *
   * Nada do que volta é persistido: os bytes existem só durante o processamento
   * (transcrição, exibição) e são descartados.
   */
  async downloadMedia(input: DownloadMediaInput): Promise<DownloadMediaResult> {
    requireEnv(["EVOLUTION_BASE_URL"]);
    const instanceId = this.instanceIdOverride;
    const apiKey =
      typeof this.instanceToken === "function"
        ? this.instanceToken()
        : this.instanceToken;
    if (!instanceId || !apiKey) {
      throw new AppError("Evolution channel credentials are not configured.", {
        statusCode: 500,
        code: "EVOLUTION_CHANNEL_NOT_CONFIGURED",
      });
    }

    const url = joinUrl(
      env.EVOLUTION_BASE_URL,
      env.EVOLUTION_DOWNLOAD_MEDIA_PATH,
    );
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(apiKey, instanceId, input.requestId),
        body: JSON.stringify({ message: input.message }),
        signal: AbortSignal.timeout(env.EVOLUTION_DOWNLOAD_MEDIA_TIMEOUT_MS),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AppError("Evolution Go media download timed out.", {
          statusCode: 504,
          code: "EVOLUTION_DOWNLOAD_MEDIA_TIMEOUT",
        });
      }
      throw error;
    }

    const raw = await parseResponse(response);
    if (!response.ok) {
      this.logger.warn(
        {
          url,
          status: response.status,
          requestId: input.requestId,
          response: truncateDiagnostic(redactSensitive(raw)),
        },
        "EvolutionProvider media download failed",
      );
      throw new AppError(
        `Evolution Go media download failed with HTTP ${response.status}`,
        {
          statusCode: response.status,
          code: "EVOLUTION_DOWNLOAD_MEDIA_FAILED",
        },
      );
    }

    const base64 = extractDownloadedBase64(raw);
    if (!base64) {
      throw new AppError("Evolution Go media download returned no content.", {
        statusCode: 502,
        code: "EVOLUTION_DOWNLOAD_MEDIA_EMPTY",
      });
    }

    this.logger.info(
      {
        url,
        status: response.status,
        requestId: input.requestId,
        bytes: base64.length,
      },
      "EvolutionProvider media download succeeded",
    );
    return { provider: "evolution-go", base64 };
  }
}

/** `{ message: "success", data: { base64: "data:...", timestamp } }`. */
function extractDownloadedBase64(raw: unknown): string | undefined {
  if (!isRecord(raw) || !isRecord(raw.data)) return undefined;
  const base64 = raw.data.base64;
  return typeof base64 === "string" && base64.trim() ? base64 : undefined;
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || error.name === "AbortError";
}

function buildHeaders(
  apiKey: string,
  instanceId: string,
  requestId?: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    apikey: apiKey,
    instanceId,
    ...(requestId ? { "x-request-id": requestId } : {}),
  };
}

function buildSendTextBody(input: SendTextInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    number: input.to,
    text: input.text,
  };

  if (input.correlationId) body.id = input.correlationId;
  if (input.quotedMessageId) {
    body.quoted = {
      messageId: input.quotedMessageId,
      ...(input.quotedParticipant
        ? { participant: input.quotedParticipant }
        : {}),
    };
  }

  return body;
}

function joinUrl(baseUrl: string, path: string): string {
  const withProtocol = /^https?:\/\//u.test(baseUrl)
    ? baseUrl
    : `http://${baseUrl}`;
  const normalizedBase = withProtocol.endsWith("/")
    ? withProtocol.slice(0, -1)
    : withProtocol;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
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

function extractMessageId(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;

  const response = raw as EvolutionSendTextResponse;
  return response.messageId ?? response.data?.Info?.ID ?? response.key?.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
