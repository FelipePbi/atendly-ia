// @vitest-environment jsdom
/**
 * Goal064/WU-02 — cadastro com Nome, validação inline nas quatro telas de
 * autenticação, e recuperação de senha honesta: `/recuperar-senha` chama
 * `forgotPassword` de verdade (sem a encenação de código de quatro telas), e
 * `/nova-senha` só afirma sucesso depois de `resetPassword` resolver.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type RegisterInput } from "@/data";

const push = vi.fn();
const refreshSession = vi.fn();
const login = vi.fn();
const register = vi.fn();
const forgotPassword = vi.fn();
const resetPassword = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { login, register, forgotPassword, resetPassword },
  }),
  useProductRuntime: () => ({ refreshSession }),
}));

const { AuthScreen } = await import("@/features/auth/AuthScreen");

beforeEach(() => {
  push.mockReset();
  refreshSession.mockReset();
  login.mockReset();
  register.mockReset();
  forgotPassword.mockReset();
  resetPassword.mockReset();
  window.history.pushState({}, "", "/");
});

describe("cadastro — Nome, sem 'Repita' e sem o parágrafo passivo", () => {
  test("não tem campo de repetir senha nem o parágrafo 'Ao criar sua conta'", () => {
    render(<AuthScreen scenario="signup" />);
    expect(screen.queryByLabelText(/Repita/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ao criar sua conta/)).not.toBeInTheDocument();
  });

  test("envia name e não envia confirmPassword", async () => {
    register.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<AuthScreen scenario="signup" />);

    await user.type(screen.getByLabelText(/^Nome/), "Camila Studio");
    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.type(screen.getByLabelText(/^Crie uma senha/), "senhaForte1");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Criar conta")).toBeVisible();
    expect(register).toHaveBeenCalledTimes(1);
    const sentBody = register.mock.calls[0][0] as RegisterInput;
    expect(sentBody.name).toBe("Camila Studio");
    expect(sentBody.password).toBe("senhaForte1");
    expect(sentBody).not.toHaveProperty("confirmPassword");
  });
});

describe("regras de senha ao vivo — texto muda ao digitar, não só ícone e cor", () => {
  test("cada regra alterna entre 'Pendente' e 'Atendida' conforme a senha digitada", async () => {
    const user = userEvent.setup();
    render(<AuthScreen scenario="signup" />);
    const passwordInput = screen.getByLabelText(/^Crie uma senha/);

    const lengthRule = screen
      .getByText("Pelo menos 8 caracteres")
      .closest("li") as HTMLElement;
    const letterDigitRule = screen
      .getByText("Letras e números")
      .closest("li") as HTMLElement;
    expect(lengthRule).toHaveTextContent("Pendente");
    expect(letterDigitRule).toHaveTextContent("Pendente");

    await user.type(passwordInput, "senhaForte1");

    expect(lengthRule).toHaveTextContent("Atendida");
    expect(letterDigitRule).toHaveTextContent("Atendida");
  });
});

describe("validação inline — todos os erros juntos, sem reportValidity, foco no primeiro inválido", () => {
  test("cadastro vazio mostra nome, e-mail, senha e termos juntos, e foca o nome", async () => {
    const user = userEvent.setup();
    render(<AuthScreen scenario="signup" />);

    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(screen.getByText("Digite seu nome.")).toBeVisible();
    expect(screen.getByText("Digite seu e-mail.")).toBeVisible();
    expect(screen.getByText("Digite uma senha.")).toBeVisible();
    expect(
      screen.getByText(
        "Você precisa aceitar os Termos de Uso e a Política de Privacidade.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Nome/)).toHaveFocus();
    expect(register).not.toHaveBeenCalled();

    for (const [field, errorId] of [
      [screen.getByLabelText(/^Nome/), "name-error"],
      [screen.getByLabelText(/^E-mail/), "email-error"],
      [screen.getByLabelText(/^Crie uma senha/), "signup-password-error"],
      [screen.getByRole("checkbox"), "terms-error"],
    ] as const) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(
        (field.getAttribute("aria-describedby") ?? "").split(" "),
      ).toContain(errorId);
      expect(document.getElementById(errorId)).toBeVisible();
    }
  });

  test("login vazio mostra e-mail e senha juntos, e foca o e-mail", async () => {
    const user = userEvent.setup();
    render(<AuthScreen scenario="login" />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(screen.getByText("Digite seu e-mail.")).toBeVisible();
    expect(screen.getByText("Digite sua senha.")).toBeVisible();
    expect(screen.getByLabelText(/^E-mail/)).toHaveFocus();
    expect(login).not.toHaveBeenCalled();

    expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute(
      "aria-describedby",
      "email-error",
    );
    expect(screen.getByLabelText(/^Senha/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      (screen.getByLabelText(/^Senha/).getAttribute("aria-describedby") ??
        "").split(" "),
    ).toContain("login-password-error");
  });

  test("recuperar senha vazio mostra o erro de e-mail e não chama a rede", async () => {
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(screen.getByText("Digite seu e-mail.")).toBeVisible();
    expect(screen.getByLabelText(/^E-mail/)).toHaveFocus();
    expect(forgotPassword).not.toHaveBeenCalled();

    expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute(
      "aria-describedby",
      "email-error",
    );
  });

  test("nova senha vazia mostra o erro e não chama a rede", async () => {
    window.history.pushState({}, "", "/nova-senha?token=abc123");
    const user = userEvent.setup();
    render(<AuthScreen scenario="new-password" />);

    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(screen.getByText("Digite uma senha.")).toBeVisible();
    expect(screen.getByLabelText(/^Nova senha/)).toHaveFocus();
    expect(resetPassword).not.toHaveBeenCalled();

    expect(screen.getByLabelText(/^Nova senha/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      (screen.getByLabelText(/^Nova senha/).getAttribute("aria-describedby") ??
        "").split(" "),
    ).toContain("new-password-error");
  });
});

describe("login — sem 'Manter acesso neste dispositivo'", () => {
  test("não renderiza o checkbox de lembrar dispositivo", () => {
    render(<AuthScreen scenario="login" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Manter acesso/)).not.toBeInTheDocument();
  });
});

describe("/recuperar-senha — chamada real, sem encenação de código", () => {
  test("nenhuma tela mostra 'Digite o código'", () => {
    for (const scenario of ["forgot-password", "request-sent"] as const) {
      const { unmount } = render(<AuthScreen scenario={scenario} />);
      expect(screen.queryByText(/Digite o código/)).not.toBeInTheDocument();
      unmount();
    }
  });

  test("200 chama forgotPassword e navega para /solicitacao-enviada", async () => {
    forgotPassword.mockResolvedValueOnce({ message: "ok" });
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(await screen.findByRole("button")).toBeEnabled();
    expect(forgotPassword).toHaveBeenCalledWith("camila@studio.com");
    expect(push).toHaveBeenCalledWith("/solicitacao-enviada");
  });

  test("503 mostra texto de indisponibilidade e não navega", async () => {
    forgotPassword.mockRejectedValueOnce(
      new BffHttpError({
        code: "CONFIGURATION_ERROR",
        message: "Password recovery is temporarily unavailable.",
        requestId: "req-503",
        status: 503,
      }),
    );
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(
      await screen.findByText(
        "A recuperação de senha está indisponível no momento. Tente novamente em instantes.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  test("429 mostra aviso de excesso de tentativas e não navega", async () => {
    forgotPassword.mockRejectedValueOnce(
      new BffHttpError({
        code: "RATE_LIMITED",
        message: "Too many requests.",
        requestId: "req-429",
        status: 429,
      }),
    );
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(
      await screen.findByText(
        "Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  test("falha de rede (TypeError) mostra erro genérico, não navega e mantém o e-mail digitado", async () => {
    forgotPassword.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(
      await screen.findByText(
        "Não foi possível falar com a Atendly. Tente novamente.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^E-mail/)).toHaveValue("camila@studio.com");
  });

  test("500 mostra erro genérico, não navega e mantém o e-mail digitado", async () => {
    forgotPassword.mockRejectedValueOnce(
      new BffHttpError({
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        requestId: "req-500",
        status: 500,
      }),
    );
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(
      await screen.findByText(
        "Não foi possível falar com a Atendly. Tente novamente.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^E-mail/)).toHaveValue("camila@studio.com");
  });
});

describe("/solicitacao-enviada — copy neutra, sem afirmar troca de senha", () => {
  test("não contém o texto 'Senha redefinida'", () => {
    const { container } = render(<AuthScreen scenario="request-sent" />);
    expect(container.textContent).not.toMatch(/Senha redefinida/);
  });

  test("mostra o link 'Voltar para entrar' para /login", () => {
    render(<AuthScreen scenario="request-sent" />);
    expect(
      screen.getByRole("link", { name: "Voltar para entrar" }),
    ).toHaveAttribute("href", "/login");
    expect(screen.queryByText("Ir para entrar")).not.toBeInTheDocument();
  });
});

describe("/nova-senha — sucesso só depois de resetPassword resolver", () => {
  test("mostra 'Diferente da senha anterior' no subtítulo", () => {
    window.history.pushState({}, "", "/nova-senha?token=abc123");
    render(<AuthScreen scenario="new-password" />);
    expect(screen.getByText(/Diferente da senha anterior/)).toBeVisible();
  });

  test("não mostra 'Senha redefinida' antes do envio", () => {
    window.history.pushState({}, "", "/nova-senha?token=abc123");
    render(<AuthScreen scenario="new-password" />);
    expect(screen.queryByText("Senha redefinida")).not.toBeInTheDocument();
  });

  test("200 mostra 'Senha redefinida' e o link para entrar, sem confirmPassword no corpo", async () => {
    window.history.pushState({}, "", "/nova-senha?token=abc123");
    resetPassword.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<AuthScreen scenario="new-password" />);

    await user.type(screen.getByLabelText(/^Nova senha/), "senhaForte1");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(
      await screen.findByRole("heading", { name: "Senha redefinida" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Ir para entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(resetPassword).toHaveBeenCalledWith({
      token: "abc123",
      newPassword: "senhaForte1",
    });
  });

  test("token inválido (PASSWORD_RESET_TOKEN_INVALID) navega para /link-expirado", async () => {
    window.history.pushState({}, "", "/nova-senha?token=abc123");
    resetPassword.mockRejectedValueOnce(
      new BffHttpError({
        code: "PASSWORD_RESET_TOKEN_INVALID",
        message: "Password reset token is invalid or expired.",
        requestId: "req-token",
        status: 400,
      }),
    );
    const user = userEvent.setup();
    render(<AuthScreen scenario="new-password" />);

    await user.type(screen.getByLabelText(/^Nova senha/), "senhaForte1");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(push).toHaveBeenCalledWith("/link-expirado");
    expect(
      screen.queryByRole("heading", { name: "Senha redefinida" }),
    ).not.toBeInTheDocument();
  });

  test("VALIDATION_ERROR (senha igual à atual) fica no campo, sem navegar", async () => {
    window.history.pushState({}, "", "/nova-senha?token=abc123");
    resetPassword.mockRejectedValueOnce(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        message: "New password must differ from current password.",
        requestId: "req-validation",
        status: 400,
        details: {
          formErrors: [],
          fieldErrors: {
            newPassword: ["New password must differ from current password."],
          },
        },
      }),
    );
    const user = userEvent.setup();
    render(<AuthScreen scenario="new-password" />);

    await user.type(screen.getByLabelText(/^Nova senha/), "senhaForte1");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(
      await screen.findByText(
        "Escolha uma senha diferente da atual, que atenda às regras acima.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Nova senha/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(push).not.toHaveBeenCalledWith("/link-expirado");
  });
});

describe("copy sem vocabulário técnico", () => {
  test("nenhuma tela de autenticação mostra 'token', 'API', 'HTTP' ou código cru de erro", () => {
    const scenarios = [
      "login",
      "signup",
      "forgot-password",
      "request-sent",
      "new-password",
      "link-expired",
    ] as const;
    const forbidden = [
      /token/i,
      /\bAPI\b/,
      /\bHTTP\b/,
      /CONFIGURATION_ERROR/,
      /VALIDATION_ERROR/,
    ];
    for (const scenario of scenarios) {
      window.history.pushState({}, "", "/nova-senha?token=abc123");
      const { container, unmount } = render(<AuthScreen scenario={scenario} />);
      for (const pattern of forbidden) {
        expect(container.textContent).not.toMatch(pattern);
      }
      unmount();
    }
  });

  const forbidden = [
    /token/i,
    /\bAPI\b/,
    /\bHTTP\b/,
    /CONFIGURATION_ERROR/,
    /VALIDATION_ERROR/,
  ];

  test("503 CONFIGURATION_ERROR em /recuperar-senha não mostra vocabulário técnico", async () => {
    forgotPassword.mockRejectedValueOnce(
      new BffHttpError({
        code: "CONFIGURATION_ERROR",
        message: "Password recovery is temporarily unavailable.",
        requestId: "req-503",
        status: 503,
      }),
    );
    const user = userEvent.setup();
    const { container } = render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    await screen.findByText(
      "A recuperação de senha está indisponível no momento. Tente novamente em instantes.",
    );
    for (const pattern of forbidden) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  test("429 em /recuperar-senha não mostra vocabulário técnico", async () => {
    forgotPassword.mockRejectedValueOnce(
      new BffHttpError({
        code: "RATE_LIMITED",
        message: "Too many requests.",
        requestId: "req-429",
        status: 429,
      }),
    );
    const user = userEvent.setup();
    const { container } = render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    await screen.findByText(
      "Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo.",
    );
    for (const pattern of forbidden) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  test("erro genérico em /recuperar-senha não mostra vocabulário técnico", async () => {
    forgotPassword.mockRejectedValueOnce(
      new BffHttpError({
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        requestId: "req-500",
        status: 500,
      }),
    );
    const user = userEvent.setup();
    const { container } = render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    await screen.findByText(
      "Não foi possível falar com a Atendly. Tente novamente.",
    );
    for (const pattern of forbidden) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  test("VALIDATION_ERROR em /nova-senha não mostra vocabulário técnico", async () => {
    window.history.pushState({}, "", "/nova-senha?token=abc123");
    resetPassword.mockRejectedValueOnce(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        message: "New password must differ from current password.",
        requestId: "req-validation",
        status: 400,
        details: {
          formErrors: [],
          fieldErrors: {
            newPassword: ["New password must differ from current password."],
          },
        },
      }),
    );
    const user = userEvent.setup();
    const { container } = render(<AuthScreen scenario="new-password" />);

    await user.type(screen.getByLabelText(/^Nova senha/), "senhaForte1");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    await screen.findByText(
      "Escolha uma senha diferente da atual, que atenda às regras acima.",
    );
    for (const pattern of forbidden) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });
});
