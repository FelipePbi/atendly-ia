import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import {
  isPasswordResetDeliveryConfigured,
  PasswordResetDeliveryClient,
  passwordResetEmail,
} from "../src/clients/password-reset-delivery.js";

const RESET_URL = "https://app.example.test/nova-senha?token=abc_DEF-123";
const original = {
  RESEND_API_KEY: env.RESEND_API_KEY,
  RESEND_API_URL: env.RESEND_API_URL,
  EMAIL_FROM: env.EMAIL_FROM,
};

afterEach(() => {
  Object.assign(env, original);
  vi.unstubAllGlobals();
});

function captureFetch(status = 200) {
  const calls: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Request(input as RequestInfo, init));
      return new Response(JSON.stringify({ id: "email-1" }), { status });
    }),
  );
  return calls;
}

describe("recuperação de senha pelo Resend", () => {
  it("envia pelo Resend quando chave e remetente estão configurados", async () => {
    Object.assign(env, {
      RESEND_API_KEY: "re_test_key",
      RESEND_API_URL: "https://resend.example.test/emails",
      EMAIL_FROM: "Avenly <nao-responda@avenly.com.br>",
    });
    const calls = captureFetch();

    await new PasswordResetDeliveryClient().send({
      to: "dona@salao.test",
      resetUrl: RESET_URL,
      expiresAt: "2026-10-13T12:30:00.000Z",
      requestId: "req-1",
    });

    expect(calls).toHaveLength(1);
    const request = calls[0];
    expect(request.url).toBe("https://resend.example.test/emails");
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe("Bearer re_test_key");
    expect(request.headers.get("idempotency-key")).toBe("password-reset/req-1");
    const body = (await request.json()) as Record<string, unknown>;
    expect(body.from).toBe("Avenly <nao-responda@avenly.com.br>");
    expect(body.to).toEqual(["dona@salao.test"]);
    expect(body.subject).toBe("Redefina sua senha da Avenly");
    expect(body.text).toContain(RESET_URL);
    expect(body.html).toContain(`href="${RESET_URL}"`);
  });

  it("falha com UPSTREAM_ERROR quando o Resend recusa", async () => {
    Object.assign(env, {
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "nao-responda@avenly.com.br",
    });
    captureFetch(422);

    await expect(
      new PasswordResetDeliveryClient().send({
        to: "dona@salao.test",
        resetUrl: RESET_URL,
        expiresAt: "2026-10-13T12:30:00.000Z",
        requestId: "req-2",
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("só considera o Resend configurado com chave e remetente", () => {
    Object.assign(env, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "" });
    expect(isPasswordResetDeliveryConfigured()).toBe(false);

    Object.assign(env, { RESEND_API_KEY: "", EMAIL_FROM: "nao-responda@avenly.com.br" });
    expect(isPasswordResetDeliveryConfigured()).toBe(false);

    Object.assign(env, { RESEND_API_KEY: "re_test_key" });
    expect(isPasswordResetDeliveryConfigured()).toBe(true);
  });

  it("escapa o link no HTML e informa a validade do link", () => {
    const message = passwordResetEmail('https://x.test/?a=1&b="2"<');
    expect(message.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;&lt;"');
    expect(message.text).toContain(
      `vale por ${env.PASSWORD_RESET_TOKEN_TTL_MINUTES} minutos`,
    );
  });
});
