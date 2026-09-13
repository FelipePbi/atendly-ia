export type ErrorCode =
  | "UNAUTHORIZED"
  // Portador válido, mas sem identidade de sessão revogável: exige novo login.
  | "SESSION_REAUTH_REQUIRED"
  | "FORBIDDEN"
  // Origem e token de CSRF são recusas distintas de FORBIDDEN para que o
  // frontend saiba renovar o token em vez de deslogar o usuário.
  | "CSRF_ORIGIN_REJECTED"
  | "CSRF_TOKEN_REJECTED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "CONFIGURATION_ERROR"
  // Credencial de instância indisponível: chave ausente, envelope inválido ou
  // vínculo não resolvido. Nunca degrada para chave global.
  | "CREDENTIAL_UNAVAILABLE"
  // Estilo de conversa da IA fora do vocabulario aceito (os tres valores do
  // produto ou os dois alias legados). Erro proprio para nao se confundir com
  // VALIDATION_ERROR generico.
  | "AI_CONVERSATION_STYLE_UNKNOWN"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
