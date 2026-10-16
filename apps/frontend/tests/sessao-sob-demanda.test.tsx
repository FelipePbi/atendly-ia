// @vitest-environment jsdom
/**
 * Sessão lida sob demanda (pedido de 2026-10-16): antes, `GET /v1/auth/session`
 * saía a cada mudança de URL — quase todo clique. Agora:
 *
 * - a sessão é lida uma vez ao abrir o app, e trocar de tela não a relê;
 * - voltar para a aba a confere de novo, no máximo uma vez por minuto;
 * - um 401 de qualquer chamada fora de `/v1/auth/*` a confere de novo (é
 *   assim que o app percebe a sessão vencida), e 401 do login não conta.
 */

import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import type * as DataModule from "@/data";
import type { Session } from "@/data";
import { BffHttpClient, onUnauthorized } from "@/data/http/BffHttpClient";

let pathname = "/inicio";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const session = vi.fn();
vi.mock("@/data", async (importOriginal) => {
  const actual = await importOriginal<typeof DataModule>();
  return {
    ...actual,
    createBffServiceRegistry: () => ({ auth: { session } }),
  };
});

import { ProductRuntimeProvider } from "@/shared/runtime/ProductRuntime";

function sessionFixture(): Session {
  return {
    businessProfile: null,
    onboardingCompleted: true,
    tenant: { id: "t-1", name: "Studio" },
    user: { email: "dona@example.com", id: "u-1", name: "Dona" },
  } as unknown as Session;
}

function app() {
  return (
    <ProductRuntimeProvider>
      <p>tela</p>
    </ProductRuntimeProvider>
  );
}

beforeEach(() => {
  pathname = "/inicio";
  session.mockReset().mockResolvedValue(sessionFixture());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a sessão não é relida a cada clique", () => {
  test("lida uma vez ao abrir; trocar de tela não relê", async () => {
    const view = render(app());
    await waitFor(() => expect(session).toHaveBeenCalledTimes(1));

    for (const next of ["/clientes", "/clientes/detalhes", "/agenda"]) {
      pathname = next;
      view.rerender(app());
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(session).toHaveBeenCalledTimes(1);
  });

  test("voltar para a aba confere de novo, no máximo uma vez por minuto", async () => {
    render(app());
    await waitFor(() => expect(session).toHaveBeenCalledTimes(1));
    const now = Date.now();

    // Logo depois de abrir, voltar para a aba não relê.
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(session).toHaveBeenCalledTimes(1);

    // Passado um minuto, relê uma vez.
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(session).toHaveBeenCalledTimes(2));
  });

  test("um 401 de qualquer chamada confere a sessão de novo", async () => {
    render(app());
    await waitFor(() => expect(session).toHaveBeenCalledTimes(1));

    const http = new BffHttpClient({
      baseUrl: "https://bff.example.invalid",
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            error: { code: "UNAUTHENTICATED", message: "Sessão expirada" },
            requestId: "r-1",
          }),
          { headers: { "content-type": "application/json" }, status: 401 },
        ),
    });
    await expect(
      http.request({ path: "/v1/customers", schema: z.unknown() }),
    ).rejects.toMatchObject({ status: 401 });
    await waitFor(() => expect(session).toHaveBeenCalledTimes(2));
  });
});

describe("aviso de 401 do cliente HTTP", () => {
  function failing(status: number) {
    return new BffHttpClient({
      baseUrl: "https://bff.example.invalid",
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            error: { code: "X", message: "falhou" },
            requestId: "r-1",
          }),
          { headers: { "content-type": "application/json" }, status },
        ),
    });
  }

  test("avisa no 401 de rota comum; não avisa no 401 do login nem em outro erro", async () => {
    const listener = vi.fn();
    const stop = onUnauthorized(listener);
    try {
      await failing(401)
        .request({ path: "/v1/settings", schema: z.unknown() })
        .catch(() => undefined);
      expect(listener).toHaveBeenCalledTimes(1);

      await failing(401)
        .request({
          body: { email: "a@b.c", password: "x" },
          method: "POST",
          path: "/v1/auth/login",
          schema: z.unknown(),
        })
        .catch(() => undefined);
      await failing(500)
        .request({ path: "/v1/settings", schema: z.unknown() })
        .catch(() => undefined);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });
});
