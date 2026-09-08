import { AppError } from "../../lib/errors.js";

export type MessageDeliveryState = "PENDING" | "SENT" | "FAILED" | "UNKNOWN";

export interface SendFailureClassification {
  /** Estado em que a tentativa persistida fica depois da falha. */
  state: Extract<MessageDeliveryState, "FAILED" | "UNKNOWN">;
  /** Motivo curto, sem segredo, exposto no DTO e no log. */
  detail: string;
  /**
   * Só há retry automático quando a falha comprovadamente aconteceu antes do
   * envio. `UNKNOWN` nunca é retentado: mudaria de estado por reconciliação,
   * não por nova tentativa.
   */
  retryable: boolean;
}

/**
 * Classifica a falha do transporte em "não saiu" (`FAILED`) e "não dá para
 * afirmar" (`UNKNOWN`).
 *
 * A distinção é o coração do item 3 do Goal004: timeout e erro de rede depois
 * do request já ter partido não provam que a mensagem não chegou, então apagar
 * ou retentar às cegas duplica a mensagem do cliente. Resposta HTTP recebida,
 * ao contrário, é prova: 4xx é recusa definitiva do transporte.
 */
export function classifySendFailure(error: unknown): SendFailureClassification {
  if (error instanceof AppError) {
    if (
      error.code === "EVOLUTION_CHANNEL_NOT_CONFIGURED" ||
      error.code === "CHANNEL_CREDENTIAL_NOT_PROVISIONED"
    ) {
      // Janela de transição do Goal003: o vínculo ainda não foi reprovisionado.
      // A tentativa fica falha e visível, com motivo, em vez de se perder.
      return {
        state: "FAILED",
        detail: "channel_credential_not_projected",
        retryable: false,
      };
    }
    if (error.code === "EVOLUTION_SEND_TIMEOUT") {
      return { state: "UNKNOWN", detail: "transport_timeout", retryable: false };
    }
    if (error.code === "EVOLUTION_SEND_FAILED") {
      const status = error.statusCode;
      if (status >= 400 && status < 500) {
        return {
          state: "FAILED",
          detail: `transport_rejected_http_${status}`,
          retryable: false,
        };
      }
      return {
        state: "UNKNOWN",
        detail: `transport_error_http_${status}`,
        retryable: false,
      };
    }
  }

  const code = networkErrorCode(error);
  if (code && PRE_SEND_NETWORK_CODES.has(code)) {
    // Conexão nunca estabelecida: o request não saiu. Vale retentar.
    return {
      state: "FAILED",
      detail: `transport_unreachable_${code.toLowerCase()}`,
      retryable: true,
    };
  }

  return {
    state: "UNKNOWN",
    detail: code ? `transport_error_${code.toLowerCase()}` : "transport_error",
    retryable: false,
  };
}

// Erros que só acontecem antes de a requisição ser entregue ao servidor.
const PRE_SEND_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

function networkErrorCode(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown })?.cause];
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown } | undefined)?.code;
    if (typeof code === "string" && code) return code;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "ETIMEDOUT";
  }
  return undefined;
}
