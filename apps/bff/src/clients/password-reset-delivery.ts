import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export class PasswordResetDeliveryClient {
  async send(input: {
    to: string;
    resetUrl: string;
    expiresAt: string;
    requestId: string;
  }): Promise<void> {
    if (!env.PASSWORD_RESET_DELIVERY_URL) {
      throw new AppError(
        "CONFIGURATION_ERROR",
        "Password reset delivery is not configured.",
        500,
      );
    }
    let response: Response;
    try {
      response = await fetch(env.PASSWORD_RESET_DELIVERY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": input.requestId,
          ...(env.PASSWORD_RESET_DELIVERY_TOKEN
            ? { authorization: `Bearer ${env.PASSWORD_RESET_DELIVERY_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          to: input.to,
          resetUrl: input.resetUrl,
          expiresAt: input.expiresAt,
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
