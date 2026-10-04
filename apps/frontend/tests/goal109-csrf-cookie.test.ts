// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { BffHttpClient } from "../src/data/http/BffHttpClient";

/**
 * Goal109, prova 7: o cookie legível de CSRF passa a se chamar `avenly_csrf`, e
 * uma sessão aberta antes da troca de marca ainda pode ter só `atendly_csrf`.
 *
 * O cenário é o de mesma origem (desenvolvimento), o único em que
 * `document.cookie` alcança o cookie. Nenhuma resposta anterior entregou o
 * header `x-csrf-token`, então o token só pode vir do cookie.
 */
const BASE_URL = "https://bff.example.invalid";
const CSRF_HEADER = "x-csrf-token";
const COOKIE_NAMES = ["avenly_csrf", "atendly_csrf"];

function setCookies(values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/`;
  }
}

function clearCookies(): void {
  for (const name of COOKIE_NAMES) {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

async function csrfSentOnMutation(): Promise<string | null> {
  const sent: Array<string | null> = [];
  const http = new BffHttpClient({
    baseUrl: BASE_URL,
    fetchImplementation: async (input, init) => {
      sent.push(new Request(input, init).headers.get(CSRF_HEADER));
      return new Response(
        JSON.stringify({ data: { ok: true }, requestId: "request-1" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  await http.request({
    method: "POST",
    path: "/v1/auth/logout",
    schema: z.object({ ok: z.boolean() }),
  });

  expect(sent).toHaveLength(1);
  return sent[0] ?? null;
}

describe("Goal109 — BffHttpClient reads the CSRF cookie by the new name first", () => {
  afterEach(() => {
    clearCookies();
  });

  it("sends the token from avenly_csrf", async () => {
    setCookies({ avenly_csrf: "token-new" });

    expect(await csrfSentOnMutation()).toBe("token-new");
  });

  it("falls back to atendly_csrf when avenly_csrf is absent", async () => {
    setCookies({ atendly_csrf: "token-legacy" });

    expect(await csrfSentOnMutation()).toBe("token-legacy");
  });

  it("prefers avenly_csrf when both cookies are present", async () => {
    setCookies({ atendly_csrf: "token-legacy", avenly_csrf: "token-new" });

    expect(await csrfSentOnMutation()).toBe("token-new");
  });

  it("sends no token when neither cookie is present", async () => {
    expect(document.cookie).toBe("");

    expect(await csrfSentOnMutation()).toBeNull();
  });
});
