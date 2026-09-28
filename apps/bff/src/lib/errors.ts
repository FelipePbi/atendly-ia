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
  // Modalidade ON_SITE exige endereco nao vazio (Goal018/WU-01). Erro proprio
  // para o frontend apontar o campo, em vez de um VALIDATION_ERROR generico.
  | "BUSINESS_ADDRESS_REQUIRED"
  // Iniciar/reiniciar o teste real com a IA ja ativa para o negocio
  // (Goal019/WU-05). Recusa propria do BFF, verificada antes de chamar a IA:
  // testar nao e ferramenta recorrente depois que a IA esta no ar.
  | "ACTIVATION_TEST_AI_ALREADY_ACTIVE"
  // PATCH /v1/settings/retention reduzindo Comercial ou Pessoal sem
  // `confirmReduction: true` (Goal023/WU-01, G-29). Aumentar nunca cai aqui.
  | "RETENTION_REDUCTION_REQUIRES_CONFIRMATION"
  // PATCH /v1/settings/ai ligando a IA (desligada -> ligada) sem prova valida
  // do teste real (Goal063/WU-01): sem execucao, execucao FAILED/PAUSED, teste
  // superado por troca de canal, ou leitura do teste falhou. Nada e gravado.
  | "AI_ACTIVATION_TEST_REQUIRED"
  // GET /v1/whatsapp/qr sem vinculação por QR em curso (Goal071/WU-01): a
  // coluna qrcode, usada como marcador, está vazia. Reler o QR nunca abre uma
  // vinculação que um connect com consentimento não abriu.
  | "WHATSAPP_QR_NOT_IN_PROGRESS"
  // POST /v1/auth/reset-password com token ausente do banco, já usado ou
  // vencido (Goal064/WU-01). Código próprio, distinto de VALIDATION_ERROR,
  // para o frontend distinguir "link morto" (navega para /link-expirado) de
  // erro de campo (fica na tela).
  | "PASSWORD_RESET_TOKEN_INVALID"
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
