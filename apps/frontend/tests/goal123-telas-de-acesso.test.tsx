// @vitest-environment jsdom
/**
 * Goal123 — Entrar com erro (L2), nova senha (L6) e senha redefinida (L7)
 * iguais ao protótipo. Provas pelo que a pessoa encontra: texto, papel,
 * atributos de acessibilidade e destino dos links. Layout e cor reais ficam no
 * `visual:compare` e no gate renderizado; jsdom não mede pixel.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError } from "@/data";

const push = vi.fn();
const refreshSession = vi.fn();
const login = vi.fn();
const resetPassword = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { login, resetPassword },
  }),
  useProductRuntime: () => ({ refreshSession }),
}));

const { AuthScreen } = await import("@/features/auth/AuthScreen");

const L2_MESSAGE =
  "E-mail ou senha não conferem. Confira e tente de novo ou recupere a senha.";

beforeEach(() => {
  push.mockReset();
  refreshSession.mockReset();
  login.mockReset();
  resetPassword.mockReset();
  window.history.pushState({}, "", "/");
});

function unauthorized(): BffHttpError {
  return new BffHttpError({
    code: "UNAUTHORIZED",
    message: "Invalid credentials.",
    requestId: "req-401",
    status: 401,
  });
}

async function submitWrongCredentials() {
  const user = userEvent.setup();
  render(<AuthScreen scenario="login" />);
  await user.type(screen.getByLabelText(/^E-mail/), "camila.reis@gmail.com");
  await user.type(screen.getByLabelText(/^Senha/), "senha-errada");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("L2 — 401 do login no campo Senha", () => {
  test("mostra o texto do quadro ligado ao campo, mantém o e-mail e foca a senha", async () => {
    login.mockRejectedValueOnce(unauthorized());
    await submitWrongCredentials();

    const message = await screen.findByText(L2_MESSAGE);
    expect(message).toBeVisible();
    expect(message).toHaveAttribute("id", "login-password-error");

    const password = screen.getByLabelText(/^Senha/);
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(
      (password.getAttribute("aria-describedby") ?? "").split(" "),
    ).toContain("login-password-error");
    expect(password).toHaveFocus();
    expect(screen.getByLabelText(/^E-mail/)).toHaveValue(
      "camila.reis@gmail.com",
    );
    expect(push).not.toHaveBeenCalled();
  });

  test("'Esqueci minha senha' só ganha destaque com o erro de credenciais", async () => {
    login.mockRejectedValueOnce(unauthorized());
    render(<AuthScreen scenario="login" />);
    const forgot = screen.getByRole("link", { name: "Esqueci minha senha" });
    expect(forgot).toHaveAttribute("href", "/recuperar-senha");
    expect(forgot).not.toHaveClass("auth-link--emphasis");

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^E-mail/), "camila.reis@gmail.com");
    await user.type(screen.getByLabelText(/^Senha/), "senha-errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByText(L2_MESSAGE);

    expect(
      screen.getByRole("link", { name: "Esqueci minha senha" }),
    ).toHaveClass("auth-link--emphasis");
  });

  test("validação local do login não destaca 'Esqueci minha senha'", async () => {
    const user = userEvent.setup();
    render(<AuthScreen scenario="login" />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(screen.getByText("Digite sua senha.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Esqueci minha senha" }),
    ).not.toHaveClass("auth-link--emphasis");
  });

  test("erro de rede continua com a mensagem de hoje e sem destaque", async () => {
    login.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await submitWrongCredentials();

    expect(
      await screen.findByText(
        "Não foi possível falar com a Avenly. Tente novamente.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(L2_MESSAGE)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Esqueci minha senha" }),
    ).not.toHaveClass("auth-link--emphasis");
  });

  test("o corpo enviado ao login não muda", async () => {
    login.mockRejectedValueOnce(unauthorized());
    await submitWrongCredentials();
    await screen.findByText(L2_MESSAGE);

    expect(login).toHaveBeenCalledWith({
      email: "camila.reis@gmail.com",
      password: "senha-errada",
    });
  });
});

describe("L6 — nova senha com três regras abaixo do campo", () => {
  function renderNewPassword() {
    window.history.pushState({}, "", "/nova-senha?token=abc123");
    return render(<AuthScreen scenario="new-password" />);
  }

  test("subtítulo do quadro e nenhum campo 'Confirmar senha'", () => {
    const { container } = renderNewPassword();

    expect(
      screen.getByRole("heading", { level: 1, name: "Crie uma nova senha" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Ela substitui a anterior em todos os dispositivos conectados.",
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText(/Confirmar senha/)).not.toBeInTheDocument();
    expect(
      container.querySelectorAll("input:not([type=hidden])"),
    ).toHaveLength(1);
  });

  test("as três regras ficam fora do rótulo, depois do campo, e ligadas por aria-describedby", () => {
    const { container } = renderNewPassword();

    const input = screen.getByLabelText(/^Nova senha/);
    const rules = container.querySelector("ul.password-rules") as HTMLElement;
    expect(rules).not.toBeNull();
    expect(rules.closest("label")).toBeNull();
    expect(
      input.compareDocumentPosition(rules) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      (input.getAttribute("aria-describedby") ?? "").split(" "),
    ).toContain(rules.id);

    const items = Array.from(rules.querySelectorAll("li"));
    expect(
      items.map((item) => item.childNodes[1]?.textContent),
    ).toEqual([
      "Pelo menos 8 caracteres",
      "Letras e números",
      "Diferente da senha anterior",
    ]);
  });

  test("as duas primeiras passam de 'Pendente' a 'Atendida' ao digitar; a terceira fica 'Conferida ao salvar'", async () => {
    renderNewPassword();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/^Nova senha/);

    const length = screen.getByText("Pelo menos 8 caracteres").closest("li")!;
    const letters = screen.getByText("Letras e números").closest("li")!;
    const different = screen
      .getByText("Diferente da senha anterior")
      .closest("li")!;

    expect(length).toHaveTextContent("Pendente");
    expect(letters).toHaveTextContent("Pendente");
    expect(different).toHaveTextContent("Conferida ao salvar");

    await user.type(input, "senhaForte1");

    expect(length).toHaveTextContent("Atendida");
    expect(length).toHaveClass("is-met");
    expect(letters).toHaveTextContent("Atendida");
    expect(letters).toHaveClass("is-met");
    expect(different).toHaveTextContent("Conferida ao salvar");
    expect(different).not.toHaveTextContent("Atendida");
    expect(different).not.toHaveClass("is-met");
  });

  test("o corpo de resetPassword leva só token e newPassword", async () => {
    resetPassword.mockResolvedValueOnce({ ok: true });
    renderNewPassword();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Nova senha/), "senhaForte1");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    await screen.findByRole("heading", { name: "Senha redefinida" });
    expect(resetPassword).toHaveBeenCalledTimes(1);
    expect(
      Object.keys(resetPassword.mock.calls[0][0] as object).sort(),
    ).toEqual(["newPassword", "token"]);
  });

  test("senha igual à atual continua com a mensagem de hoje", async () => {
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
    renderNewPassword();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Nova senha/), "senhaForte1");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(
      await screen.findByText(
        "Escolha uma senha diferente da atual, que atenda às regras acima.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("L7 — senha redefinida", () => {
  test("mostra o texto do quadro e o link 'Entrar' para /login, sem chamada de sessão", async () => {
    window.history.pushState({}, "", "/nova-senha?token=abc123");
    resetPassword.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<AuthScreen scenario="new-password" />);

    await user.type(screen.getByLabelText(/^Nova senha/), "senhaForte1");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Senha redefinida",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Pronto. Você já pode entrar com a nova senha. A IA segue atendendo normalmente.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText("Ir para entrar")).not.toBeInTheDocument();
    expect(refreshSession).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("/cadastro e /link-expirado seguem como estavam", () => {
  test("/cadastro mantém a dica fixa, sem lista de regras", () => {
    const { container } = render(<AuthScreen scenario="signup" />);

    expect(
      screen.getByText("Mínimo de 8 caracteres, com letras e números."),
    ).toBeVisible();
    expect(container.querySelector("ul.password-rules")).toBeNull();
  });

  test("/link-expirado mantém título e ação", () => {
    render(<AuthScreen scenario="link-expired" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Este link expirou" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Solicitar novo link" }),
    ).toHaveAttribute("href", "/recuperar-senha");
  });
});
