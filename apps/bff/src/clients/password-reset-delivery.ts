import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

type PasswordResetDelivery = {
  to: string;
  resetUrl: string;
  expiresAt: string;
  requestId: string;
};

/** A recuperação de senha só tem entrega com chave e remetente do Resend. */
export function isPasswordResetDeliveryConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export class PasswordResetDeliveryClient {
  async send(input: PasswordResetDelivery): Promise<void> {
    if (!isPasswordResetDeliveryConfigured()) {
      throw new AppError(
        "CONFIGURATION_ERROR",
        "Password reset delivery is not configured.",
        500,
      );
    }
    return this.sendWithResend(input);
  }

  private async sendWithResend(input: PasswordResetDelivery): Promise<void> {
    const message = passwordResetEmail(input.resetUrl);
    let response: Response;
    try {
      response = await fetch(env.RESEND_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          // O Resend descarta a repetição de uma mesma requisição.
          "idempotency-key": `password-reset/${input.requestId}`,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [input.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(env.INTERNAL_HTTP_TIMEOUT_MS),
      });
    } catch {
      throw new AppError(
        "UPSTREAM_ERROR",
        "Password reset delivery failed.",
        502,
      );
    }
    if (!response.ok) {
      await response.text();
      throw new AppError(
        "UPSTREAM_ERROR",
        "Password reset delivery failed.",
        502,
      );
    }
  }
}

export function passwordResetEmail(resetUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const minutes = env.PASSWORD_RESET_TOKEN_TTL_MINUTES;
  const subject = "Redefina sua senha da Avenly";
  const text = [
    "Olá!",
    "",
    "Recebemos um pedido para redefinir a senha da sua conta na Avenly.",
    "",
    `Para criar uma nova senha, abra o link abaixo. Ele vale por ${minutes} minutos e só pode ser usado uma vez.`,
    "",
    resetUrl,
    "",
    "Se não foi você, ignore este e-mail. Sua senha continua a mesma.",
  ].join("\n");
  const href = escapeHtml(resetUrl);
  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f7f4ef;font-family:Arial,Helvetica,sans-serif;color:#221e1a">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
<p style="margin:0 0 16px;font-size:16px">Olá!</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Recebemos um pedido para redefinir a senha da sua conta na Avenly.</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">Para criar uma nova senha, use o botão abaixo. O link vale por ${minutes} minutos e só pode ser usado uma vez.</p>
<p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#0f5f63;color:#ffffff;font-weight:bold;text-decoration:none">Criar nova senha</a></p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#5f574e">Se o botão não abrir, copie este endereço no navegador:</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.5;word-break:break-all"><a href="${href}" style="color:#0f5f63">${href}</a></p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#5f574e">Se não foi você, ignore este e-mail. Sua senha continua a mesma.</p>
</div>
</body>
</html>`;
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
