// @vitest-environment jsdom
/**
 * Goal014 (WU-05): login/cadastro com integração real e erro junto ao campo.
 *
 * A recuperação de senha em quatro telas sem rede (G-34) foi substituída pelo
 * fluxo real no Goal064/WU-02 — ver `tests/goal064-auth-screens.test.tsx`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError } from "@/data";

const push = vi.fn();
const refreshSession = vi.fn();
const login = vi.fn();
const register = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ auth: { login, register } }),
  useProductRuntime: () => ({ refreshSession }),
}));

const { AuthScreen } = await import("@/features/auth/AuthScreen");

describe("login e cadastro — integração real com erro junto ao campo", () => {
  beforeEach(() => {
    push.mockReset();
    refreshSession.mockReset();
    login.mockReset();
    register.mockReset();
  });

  test("credenciais inválidas aparecem junto ao campo de senha, e-mail preservado", async () => {
    login.mockRejectedValueOnce(
      new BffHttpError({
        code: "UNAUTHORIZED",
        message: "Invalid credentials.",
        requestId: "req-1",
        status: 401,
      }),
    );
    const user = userEvent.setup();
    render(<AuthScreen scenario="login" />);

    await user.type(screen.getByLabelText(/^E-mail/), "dona@studio.com");
    await user.type(screen.getByLabelText(/^Senha/), "senha-digitada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText("E-mail ou senha incorretos."),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Senha/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByDisplayValue("dona@studio.com")).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  test("login não tem o checkbox 'Manter acesso neste dispositivo'", () => {
    render(<AuthScreen scenario="login" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Manter acesso/)).not.toBeInTheDocument();
  });

  test("e-mail já cadastrado aparece junto ao campo de e-mail, senha preservada, sem 'Repita a senha'", async () => {
    register.mockRejectedValueOnce(
      new BffHttpError({
        code: "CONFLICT",
        message: "Email is already registered.",
        requestId: "req-2",
        status: 409,
      }),
    );
    const user = userEvent.setup();
    render(<AuthScreen scenario="signup" />);

    expect(screen.queryByLabelText(/Repita/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Nome/), "Dona do Studio");
    await user.type(screen.getByLabelText(/^E-mail/), "dona@studio.com");
    await user.type(screen.getByLabelText(/^Crie uma senha/), "senha-forte-1");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(
      await screen.findByText("Já existe uma conta com este e-mail."),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Crie uma senha/)).toHaveValue(
      "senha-forte-1",
    );
    expect(refreshSession).not.toHaveBeenCalled();

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Dona do Studio",
        email: "dona@studio.com",
        password: "senha-forte-1",
      }),
    );
    expect(register.mock.calls[0][0]).not.toHaveProperty("confirmPassword");
  });
});
