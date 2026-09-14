// @vitest-environment jsdom
/**
 * Goal014 (WU-05): login/cadastro com integração real e erro junto ao campo,
 * e a recuperação de senha como fluxo visual de quatro telas — e-mail,
 * código, nova senha e sucesso — sem chamada de rede (G-34).
 *
 * A máquina de estados da recuperação é pura de propósito: as duas primeiras
 * `describe` provam as transições isoladamente, sem DOM nem rede. As demais
 * renderizam a tela de verdade para provar o que só existe ali: nenhuma
 * chamada de rede acontece, nenhuma cópia afirma envio, e o erro real do
 * servidor aparece junto ao campo certo sem apagar o que a pessoa digitou.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError } from "@/data";
import {
  initialRecoveryState,
  recoveryReducer,
  type RecoveryState,
} from "@/features/auth/recoveryMachine";

describe("recoveryReducer (máquina pura da recuperação de senha)", () => {
  test("começa na tela de e-mail", () => {
    expect(initialRecoveryState).toEqual<RecoveryState>({
      email: "",
      step: "email",
    });
  });

  test("e-mail → código → nova senha → sucesso, guardando o e-mail informado", () => {
    let state = initialRecoveryState;
    state = recoveryReducer(state, {
      type: "SUBMIT_EMAIL",
      email: "camila@studio.com",
    });
    expect(state).toEqual({ email: "camila@studio.com", step: "code" });

    state = recoveryReducer(state, { type: "SUBMIT_CODE" });
    expect(state.step).toBe("new-password");

    state = recoveryReducer(state, { type: "SUBMIT_NEW_PASSWORD" });
    expect(state.step).toBe("done");
  });

  test("BACK devolve um passo, sem apagar o e-mail já informado", () => {
    let state = recoveryReducer(initialRecoveryState, {
      type: "SUBMIT_EMAIL",
      email: "camila@studio.com",
    });
    state = recoveryReducer(state, { type: "SUBMIT_CODE" });
    expect(state.step).toBe("new-password");

    state = recoveryReducer(state, { type: "BACK" });
    expect(state).toEqual({ email: "camila@studio.com", step: "code" });

    state = recoveryReducer(state, { type: "BACK" });
    expect(state).toEqual({ email: "camila@studio.com", step: "email" });

    // Nada antes do primeiro passo.
    state = recoveryReducer(state, { type: "BACK" });
    expect(state.step).toBe("email");
  });

  test("um evento fora de ordem é ignorado — a transição não pula passo", () => {
    const state = recoveryReducer(initialRecoveryState, {
      type: "SUBMIT_CODE",
    });
    expect(state).toEqual(initialRecoveryState);
  });
});

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

describe("recuperação de senha — quatro telas, sem rede e sem copy de envio", () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("a recuperação visual não deve chamar rede");
      }),
    );
  });

  test("percorre e-mail → código → nova senha → navega para a tela de sucesso", async () => {
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    expect(
      screen.getByRole("heading", { name: "Esqueceu sua senha?" }),
    ).toBeVisible();
    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      screen.getByRole("heading", { name: "Digite o código" }),
    ).toBeVisible();
    await user.type(screen.getByLabelText(/^Código/), "12");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Digite os 6 dígitos do código.")).toBeVisible();

    await user.clear(screen.getByLabelText(/^Código/));
    await user.type(screen.getByLabelText(/^Código/), "482913");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      screen.getByRole("heading", { name: "Crie uma nova senha" }),
    ).toBeVisible();
    await user.type(screen.getByLabelText(/^Nova senha/), "umaSenhaForte1");
    await user.type(
      screen.getByLabelText(/^Repita a nova senha/),
      "outraSenha2",
    );
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(screen.getByText("As senhas precisam ser iguais.")).toBeVisible();

    await user.clear(screen.getByLabelText(/^Repita a nova senha/));
    await user.type(
      screen.getByLabelText(/^Repita a nova senha/),
      "umaSenhaForte1",
    );
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(push).toHaveBeenCalledWith("/solicitacao-enviada");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("nenhuma tela do fluxo, nem a de sucesso, afirma que algo foi enviado", () => {
    for (const scenario of ["forgot-password", "request-sent"] as const) {
      const { unmount, container } = render(<AuthScreen scenario={scenario} />);
      expect(container.textContent).not.toMatch(/envi/i);
      unmount();
    }
  });

  test("a tela de código pode voltar para alterar o e-mail sem perder o passo", async () => {
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByRole("heading", { name: "Digite o código" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "← Alterar e-mail" }));
    expect(
      screen.getByRole("heading", { name: "Esqueceu sua senha?" }),
    ).toBeVisible();
  });
});

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

  test("e-mail já cadastrado aparece junto ao campo de e-mail, senha preservada", async () => {
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

    await user.type(screen.getByLabelText(/^E-mail/), "dona@studio.com");
    await user.type(screen.getByLabelText(/^Crie uma senha/), "senha-forte-1");
    await user.type(
      screen.getByLabelText(/^Repita a nova senha/),
      "senha-forte-1",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    const emailField = screen.getByLabelText(/^E-mail/).closest("label");
    expect(emailField).not.toBeNull();
    expect(
      within(emailField as HTMLElement).getByText(
        "Já existe uma conta com este e-mail.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Crie uma senha/)).toHaveValue(
      "senha-forte-1",
    );
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
