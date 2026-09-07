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

    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(apiKey, instanceId, input.requestId),
      body: JSON.stringify(buildSendTextBody(input)),
    });

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
