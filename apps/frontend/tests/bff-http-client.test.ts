import { describe, expect, it } from "vitest";
import { z } from "zod";

import { BffHttpClient } from "../src/data/http/BffHttpClient";
import { BffAuthService } from "../src/data/services/BffAuthService";

/**
 * Adapter HTTP contra o BFF publicado em outro host.
 *
 * O cenário destes testes é exatamente o de produção: frontend e BFF em hosts
 * distintos, sem cookie jar compartilhado e sem `document` — `document.cookie`
 * é inalcançável aqui, como é no navegador quando o cookie foi gravado no host
 * do BFF. A única fonte de token é o header `x-csrf-token` da resposta.
 */
const BASE_URL = "https://bff.example.invalid";
const CSRF_HEADER = "x-csrf-token";
const okSchema = z.object({ ok: z.boolean() });

interface Call {
  method: string;
  url: string;
  csrf: string | null;
}

function stubFetch(
  responses: Array<{ status?: number; body: unknown; csrfToken?: string }>,
) {
  const calls: Call[] = [];
  let index = 0;

  const implementation: typeof fetch = async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    calls.push({
      method: request.method,
      url: request.url,
      csrf: request.headers.get(CSRF_HEADER),
    });

    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const headers = new Headers({
      "content-type": "application/json",
      "x-request-id": "request-1",
    });
    if (next.csrfToken) headers.set(CSRF_HEADER, next.csrfToken);
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers,
    });
  };

  return { calls, implementation };
}

const envelope = (data: unknown) => ({ data, requestId: "request-1" });
const rejection = {
  error: { code: "CSRF_TOKEN_REJECTED", message: "Token inválido." },
  requestId: "request-1",
};

describe("BffHttpClient CSRF token handling across hosts", () => {
  it("has no cookie to read when the BFF lives on another host", () => {
    expect(typeof document).toBe("undefined");
  });

  it("sends the token issued by the previous response on the next mutation", async () => {
    const { calls, implementation } = stubFetch([
      { body: envelope({ user: { id: "user-1" } }), csrfToken: "token-1" },
      { body: envelope({ ok: true }), csrfToken: "token-1" },
    ]);
    const http = new BffHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: implementation,
    });

    await http.request({
      method: "POST",
      path: "/v1/auth/login",
      body: { email: "a@example.invalid", password: "x" },
      schema: z.object({ user: z.object({ id: z.string() }) }),
    });
    await http.request({
      method: "POST",
      path: "/v1/whatsapp/connect",
      schema: okSchema,
    });

    // O login não tinha token para enviar; a mutação seguinte já tem.
    expect(calls[0]?.csrf).toBeNull();
    expect(calls[1]?.csrf).toBe("token-1");
  });

  it("recovers the token from a read, which is the path after a page reload", async () => {
    const { calls, implementation } = stubFetch([
      { body: envelope({ user: { id: "user-1" } }), csrfToken: "token-reload" },
      { body: envelope({ ok: true }) },
    ]);
    const http = new BffHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: implementation,
    });

    await http.request({
      path: "/v1/auth/session",
      schema: z.object({ user: z.object({ id: z.string() }) }),
    });
    await http.request({
      method: "DELETE",
      path: "/v1/whatsapp",
      schema: okSchema,
    });

    // Leitura não manda token; a mutação seguinte manda o que a leitura trouxe.
    expect(calls[0]?.csrf).toBeNull();
    expect(calls[1]?.csrf).toBe("token-reload");
  });

  it("refreshes the token from a rejected response instead of keeping a stale one", async () => {
    const { calls, implementation } = stubFetch([
      { body: envelope({ ok: true }), csrfToken: "token-old" },
      { status: 403, body: rejection, csrfToken: "token-new" },
      { body: envelope({ ok: true }), csrfToken: "token-new" },
    ]);
    const http = new BffHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: implementation,
    });

    await http.request({ path: "/v1/auth/session", schema: okSchema });
    await expect(
      http.request({ method: "POST", path: "/v1/services", schema: okSchema }),
    ).rejects.toMatchObject({ code: "CSRF_TOKEN_REJECTED", status: 403 });
    await http.request({
      method: "POST",
      path: "/v1/services",
      schema: okSchema,
    });

    expect(calls[1]?.csrf).toBe("token-old");
    expect(calls[2]?.csrf).toBe("token-new");
  });

  it("logs out with a valid token and keeps nothing usable afterwards", async () => {
    const { calls, implementation } = stubFetch([
      { body: envelope({ user: { id: "user-1" } }), csrfToken: "token-logout" },
      { body: envelope({ ok: true }) },
      { body: envelope({ ok: true }) },
    ]);
    const http = new BffHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: implementation,
    });
    const auth = new BffAuthService(http);

    // Bootstrap da página: uma leitura qualquer já traz o token vigente.
    await http.request({
      path: "/v1/auth/session",
      schema: z.object({ user: z.object({ id: z.string() }) }),
    });
    await auth.logout();
    await http.request({
      method: "POST",
      path: "/v1/services",
      schema: okSchema,
    });

    // Logout sai com prova válida — este é o 403 que o ambiente publicado
    // levava — e a prova é descartada em seguida, com a sessão revogada.
    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.csrf).toBe("token-logout");
    expect(calls[2]?.csrf).toBeNull();
  });

  it("never sends the token on a safe method", async () => {
    const { calls, implementation } = stubFetch([
      { body: envelope({ ok: true }), csrfToken: "token-1" },
      { body: envelope({ ok: true }), csrfToken: "token-1" },
    ]);
    const http = new BffHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: implementation,
    });

    await http.request({ path: "/v1/dashboard", schema: okSchema });
    await http.request({ path: "/v1/dashboard", schema: okSchema });

    expect(calls.every((call) => call.csrf === null)).toBe(true);
  });
});
