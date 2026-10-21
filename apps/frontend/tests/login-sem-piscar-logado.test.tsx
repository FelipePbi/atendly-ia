// @vitest-environment jsdom
/**
 * Quem já está logado e chega ao login vindo de fora (a landing, um favorito,
 * o `/`) não vê o formulário piscar antes de ir para a tela logada (pedido de
 * 2026-10-21). Enquanto a sessão é verificada, o splash da marca cobre a tela
 * de acesso; logada, a pessoa segue para dentro; deslogada, o formulário
 * aparece.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type * as DataModule from "@/data";
import { BffHttpError, type Session } from "@/data";
import { resetSplashForTests } from "@/shared/motion/splash";

let pathname = "/login";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace }),
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
      <form aria-label="Entrar" />
    </ProductRuntimeProvider>
  );
}

beforeEach(() => {
  pathname = "/login";
  replace.mockReset();
  session.mockReset();
  resetSplashForTests();
});

describe("login acessado de fora", () => {
  test("logada: o formulário nunca aparece; o splash cobre até entrar", async () => {
    let resolve: (value: Session) => void = () => undefined;
    session.mockReturnValue(
      new Promise<Session>((done) => {
        resolve = done;
      }),
    );
    render(app());

    expect(screen.queryByRole("form", { name: "Entrar" })).toBeNull();
    expect(screen.getByText("Verificando seu acesso")).toBeInTheDocument();

    resolve(sessionFixture());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
    expect(screen.queryByRole("form", { name: "Entrar" })).toBeNull();
    expect(screen.getByText("Verificando seu acesso")).toBeInTheDocument();
  });

  test("deslogada: o formulário aparece depois da verificação", async () => {
    session.mockRejectedValue(
      new BffHttpError({
        code: "UNAUTHENTICATED",
        message: "Sem sessão",
        requestId: "r-1",
        status: 401,
      }),
    );
    render(app());

    expect(screen.queryByRole("form", { name: "Entrar" })).toBeNull();
    expect(
      await screen.findByRole("form", { name: "Entrar" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Verificando seu acesso")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
