// @vitest-environment jsdom
/**
 * Goal068/WU-03 — telas de entrada seguem os protótipos de Login: painel
 * Petróleo (--accent, não --navy) com composição própria por largura, mock
 * de conversa estático e aria-hidden só no desktop, e os textos de C-05,
 * C-06 (seta aria-hidden, nome acessível "Criar conta") e L-07 ("Entrar" e
 * "Boas-vindas de volta. Sua agenda continua de onde parou."). jsdom não
 * mede layout real (ver AGENTS.md do app): a composição por largura fica
 * provada lendo a folha de estilo, não medindo pixels.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

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

const cssPath = path.join(
  __dirname,
  "..",
  "src",
  "shared",
  "styles",
  "atendly.css",
);
const css = readFileSync(cssPath, "utf8");

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.[\]]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : "";
}

beforeEach(() => {
  push.mockReset();
  refreshSession.mockReset();
  login.mockReset();
  register.mockReset();
  forgotPassword.mockReset();
  resetPassword.mockReset();
  window.history.pushState({}, "", "/");
});

describe("painel de entrada — Petróleo, composição por largura", () => {
  test(".entry-panel usa var(--accent) e nunca var(--navy)", () => {
    const rule = ruleFor(".entry-panel");
    expect(rule).toMatch(/var\(--accent\)/);
    expect(rule).not.toMatch(/var\(--navy\)/);
  });

  test("declara os três limiares de composição: 768px, 1024px e 1280px", () => {
    expect(css).toMatch(/@media \(min-width:\s*768px\)/);
    expect(css).toMatch(/@media \(min-width:\s*1024px\)/);
    expect(css).toMatch(/@media \(min-width:\s*1280px\)/);
  });

  test("celular: folha do formulário nasce com raio de 28px (quadro L1)", () => {
    const rule = ruleFor(".entry-main");
    expect(rule).toMatch(/border-radius:\s*28px 28px 0 0/);
  });

  test("mock de conversa fica oculto fora do desktop e visível a partir de 1280px", () => {
    expect(css).toMatch(/\.entry-mock\s*\{[^}]*display:\s*none/);
    const desktopSection = css.slice(css.indexOf("@media (min-width: 1280px)"));
    expect(desktopSection).toMatch(/\.entry-mock\s*\{[^}]*display:\s*flex/);
  });
});

describe("painel — textos e mock estáticos, sem rede", () => {
  test("cadastro mostra a frase de C-05", () => {
    render(<AuthScreen scenario="signup" />);
    expect(
      screen.getByText(
        "Configure o negócio e conecte seu WhatsApp em poucos minutos.",
      ),
    ).toBeVisible();
  });

  test("mock de conversa é estático, aria-hidden e sem elemento interativo", () => {
    render(<AuthScreen scenario="login" />);
    const mock = document.querySelector(".entry-mock");
    expect(mock).not.toBeNull();
    expect(mock).toHaveAttribute("aria-hidden", "true");
    expect(mock?.querySelector("button, a, input, [href], [onclick]")).toBeNull();
  });

  test("botão de cadastro tem nome acessível exatamente 'Criar conta', com a seta aria-hidden (C-05/C-06)", () => {
    render(<AuthScreen scenario="signup" />);
    const button = screen.getByRole("button", { name: "Criar conta" });
    const icon = button.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  test("login mostra o título 'Entrar' e o apoio de L-07", () => {
    render(<AuthScreen scenario="login" />);
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeVisible();
    expect(
      screen.getByText(
        "Boas-vindas de volta. Sua agenda continua de onde parou.",
      ),
    ).toBeVisible();
  });

  test("'Esqueci minha senha' fica sozinho, alinhado à direita", () => {
    render(<AuthScreen scenario="login" />);
    const link = screen.getByRole("link", { name: "Esqueci minha senha" });
    const row = link.closest(".auth-row");
    expect(row).not.toBeNull();
    expect(row?.children).toHaveLength(1);
  });

  test("nenhum texto antigo de story aparece em /login ou /cadastro", () => {
    for (const scenario of ["login", "signup"] as const) {
      const { unmount } = render(<AuthScreen scenario={scenario} />);
      expect(
        screen.queryByText(/Atendimento que vira agenda/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Comece pelo essencial/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Seu negócio em movimento/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Menos tempo respondendo/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Seus dados protegidos/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Acesso protegido à sua operação/),
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("fluxos do Goal064 continuam intactos", () => {
  test("cadastro ainda envia name e não confirmPassword", async () => {
    register.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<AuthScreen scenario="signup" />);

    await user.type(screen.getByLabelText(/^Nome/), "Camila Studio");
    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.type(screen.getByLabelText(/^Crie uma senha/), "senhaForte1");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(register).toHaveBeenCalledTimes(1);
  });

  test("login vazio continua mostrando os erros inline e focando o e-mail", async () => {
    const user = userEvent.setup();
    render(<AuthScreen scenario="login" />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(screen.getByText("Digite seu e-mail.")).toBeVisible();
    expect(screen.getByLabelText(/^E-mail/)).toHaveFocus();
    expect(login).not.toHaveBeenCalled();
  });

  test("recuperação de senha por link continua indo para /solicitacao-enviada", async () => {
    forgotPassword.mockResolvedValueOnce({ message: "ok" });
    const user = userEvent.setup();
    render(<AuthScreen scenario="forgot-password" />);

    await user.type(screen.getByLabelText(/^E-mail/), "camila@studio.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(push).toHaveBeenCalledWith("/solicitacao-enviada");
  });
});
