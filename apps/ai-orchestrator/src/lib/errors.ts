export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    options: { statusCode?: number; code?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "APP_ERROR";
    this.details = options.details;
  }
}

/**
 * Vocabulário de erro de domínio (Goal011): situações de negócio que o
 * modelo pode ver, distinguir por código e traduzir para a cliente — nunca
 * um detalhe de infraestrutura. Cada tool que fala com um serviço externo
 * mapeia a própria falha de negócio para um destes códigos (ou outro código
 * de domínio próprio da tool), nunca repassando o texto bruto do upstream
 * sem checar o que ele significa.
 */
export const DOMAIN_ERROR_CODES = {
  /** Horário que a cliente pediu não está mais disponível. */
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  /** Reserva temporária (hold) venceu antes da confirmação. */
  HOLD_EXPIRED: "APPOINTMENT_HOLD_EXPIRED",
  /** O número do contato tem mais de uma pessoa cadastrada; a IA precisa perguntar. */
  CUSTOMER_IDENTITY_AMBIGUOUS: "CUSTOMER_IDENTITY_AMBIGUOUS",
  /** O serviço pedido não existe (ou não está mais ativo) na agenda do tenant. */
  SERVICE_NOT_FOUND: "SERVICE_NOT_FOUND",
  /** Horário pedido está fora da janela de antecedência/oferta do negócio. */
  OUTSIDE_OFFER_WINDOW: "OUTSIDE_OFFER_WINDOW",
} as const;

export type DomainErrorCode =
  (typeof DOMAIN_ERROR_CODES)[keyof typeof DOMAIN_ERROR_CODES];

/**
 * Falha de negócio: pode chegar ao modelo com código e mensagem próprios,
 * porque descreve uma situação que a conversa precisa reagir (oferecer
 * alternativa, pedir escolha, etc.), nunca um problema de infraestrutura.
 */
export class DomainError extends AppError {
  constructor(
    message: string,
    options: { code: string; statusCode?: number; details?: unknown },
  ) {
    super(message, {
      statusCode: options.statusCode ?? 409,
      code: options.code,
      details: options.details,
    });
    this.name = "DomainError";
  }
}

/**
 * Falha de infraestrutura (autenticação interna, timeout, indisponibilidade,
 * 5xx do serviço). Nunca deve chegar ao contexto do modelo nem a uma
 * mensagem enviada à cliente — quem trata o detalhe real é o log, com
 * requestId e aiRunId; a conversa segue pelo caminho genérico de falha.
 */
export class InfrastructureError extends AppError {
  constructor(
    message: string,
    options: { code?: string; statusCode?: number; details?: unknown } = {},
  ) {
    super(message, {
      statusCode: options.statusCode ?? 502,
      code: options.code ?? "INFRASTRUCTURE_ERROR",
      details: options.details,
    });
    this.name = "InfrastructureError";
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}
