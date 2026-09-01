import { env, requireEnv } from "../../../../config/env.js";
import {
  type DiagnosticLogger,
  maskPhone,
  noopDiagnosticLogger,
  truncateDiagnostic,
} from "../../../../lib/diagnostic-log.js";
import { AppError } from "../../../../lib/errors.js";
import type {
  SendTextInput,
  SendTextResult,
  WhatsAppProvider,
} from "../../ports/WhatsAppProvider.js";
import type { EvolutionSendTextResponse } from "./EvolutionTypes.js";

export class EvolutionProvider implements WhatsAppProvider {
  constructor(
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
    private readonly instanceTokenOverride?: string,
    private readonly instanceIdOverride?: string,
  ) {}

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    requireEnv(["EVOLUTION_BASE_URL"]);
    const instanceId = this.instanceIdOverride;
    const apiKey = this.instanceTokenOverride || env.EVOLUTION_API_KEY;
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
        hasInstanceIdHeader: true,
        hasApiKeyHeader: true,
      },
      "EvolutionProvider sending text",
    );

    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(apiKey, instanceId),
      body: JSON.stringify(buildSendTextBody(input)),
    });

    const raw = await parseResponse(response);
    if (!response.ok) {
      this.logger.error(
        {
          url,
          to: maskPhone(input.to),
          status: response.status,
          response: truncateDiagnostic(raw),
        },
        "EvolutionProvider send failed",
      );
      throw new AppError(
        `Evolution Go send failed with HTTP ${response.status}`,
        {
          statusCode: response.status,
          code: "EVOLUTION_SEND_FAILED",
          details: raw,
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
      },
      "EvolutionProvider send succeeded",
    );

    return {
      provider: "evolution-go",
      messageId,
      raw,
    };
  }
}

function buildHeaders(
  apiKey: string,
  instanceId: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    apikey: apiKey,
    instanceId,
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
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
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
