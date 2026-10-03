// @vitest-environment jsdom
/**
 * Goal024/WU-05: "Sair de todos os dispositivos" em Configurações → Conta.
 *
 * O que esta suíte prova:
 *
 * - a ação existe no grupo Segurança, como o botão "Sair" (Goal104, C1), e a
 *   tela não tem mais "Sair da conta": a casca tem "Sair" em todas as larguras;
 * - ela sempre passa por uma confirmação que avisa que derruba o acesso em
 *   todos os aparelhos, inclusive o atual;
 * - cancelar não chama `auth.logoutAllDevices` e mantém a pessoa na tela;
 * - confirmar chama `auth.logoutAllDevices` (sem nenhum identificador do
 *   chamador — a assinatura do método não aceita um), depois limpa a sessão
 *   local e navega para `/login`, no mesmo padrão do logout simples;
 * - se `auth.logoutAllDevices` falhar, a sessão local não é limpa e a pessoa
 *   não é levada para `/login` — ela continua autenticada e vê um erro
 *   recuperável dentro do próprio diálogo, sem concluir silenciosamente que
 *   derrubou os outros aparelhos quando na verdade a chamada não foi adiante;
 * - o "Sair" de Segurança abre só a confirmação: não chama `auth.logout` nem
 *   `logoutAllDevices` antes de confirmar.
 *
 * O fluxo real de "Excluir conta" (Goal025/WU-08) tem suíte própria em
 * `goal025-account-deletion-screen.test.tsx`.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { AccountSettings } from "@/features/settings/AccountSettings";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const changePassword = vi.fn();
const logout = vi.fn();
const logoutAllDevices = vi.fn();
const setUnauthenticated = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    account: { requestDeletion: vi.fn(), cancelDeletion: vi.fn() },
    auth: { changePassword, logout, logoutAllDevices },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
    session: { user: { email: "marina@studio.com" } },
    setUnauthenticated,
  }),
}));

vi.mock("@/shared/runtime/systemStatus", () => ({
  useSystemStatus: () => ({
    accountDeletion: { status: "NONE", dueAt: null },
    phase: "loaded",
    refresh: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  logout.mockResolvedValue({ ok: true });
  logoutAllDevices.mockResolvedValue({ ok: true });
});

function logoutAllButton(): HTMLElement {
  const group = screen
    .getByRole("heading", { name: "Segurança" })
    .closest("section") as HTMLElement;
  expect(group).not.toBeNull();
  expect(group).toHaveTextContent("Sair de todos os dispositivos");
  return within(group).getByRole("button", { name: "Sair" });
}

test("a ação é o botão 'Sair' do grupo Segurança, e a tela não tem 'Sair da conta'", () => {
  render(<AccountSettings />);

  expect(logoutAllButton()).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Sair da conta" }),
  ).not.toBeInTheDocument();
});

test("abre uma confirmação que avisa a derrubada de todos os aparelhos, inclusive o atual", async () => {
  const user = userEvent.setup();
  render(<AccountSettings />);

  await user.click(logoutAllButton());

  const dialog = await screen.findByRole("dialog", {
    name: "Encerrar o acesso em todos os aparelhos?",
  });
  expect(dialog).toHaveTextContent(/todos os aparelhos conectados, inclusive/i);
  expect(dialog).toHaveTextContent(/este/i);
  expect(logoutAllDevices).not.toHaveBeenCalled();
});

test("cancelar não chama logoutAllDevices e mantém a pessoa na tela", async () => {
  const user = userEvent.setup();
  render(<AccountSettings />);

  await user.click(logoutAllButton());
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(logoutAllDevices).not.toHaveBeenCalled();
  expect(setUnauthenticated).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

test("confirmar revoga todas as sessões sem identificador do chamador, limpa a sessão local e navega para /login", async () => {
  const user = userEvent.setup();
  render(<AccountSettings />);

  await user.click(logoutAllButton());
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Sair de todos os dispositivos" }),
  );

  await waitFor(() => expect(logoutAllDevices).toHaveBeenCalledTimes(1));
  // `logoutAllDevices` não recebe nenhum argumento de identidade: a
  // revogação é sempre da sessão que fez a chamada, nunca de um id
  // declarado pelo chamador.
  expect(logoutAllDevices).toHaveBeenCalledWith();
  expect(logout).not.toHaveBeenCalled();
  await waitFor(() => expect(setUnauthenticated).toHaveBeenCalledTimes(1));
  expect(replace).toHaveBeenCalledWith("/login");
});

test("se logoutAllDevices falhar, a sessão local não é limpa e a pessoa não sai do login", async () => {
  logoutAllDevices.mockRejectedValue(new Error("network error"));
  const user = userEvent.setup();
  render(<AccountSettings />);

  await user.click(logoutAllButton());
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Sair de todos os dispositivos" }),
  );

  await waitFor(() => expect(logoutAllDevices).toHaveBeenCalledTimes(1));
  expect(
    await screen.findByText(
      "Não foi possível encerrar o acesso nos outros aparelhos agora. Tente novamente.",
    ),
  ).toBeVisible();
  expect(setUnauthenticated).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("o 'Sair' de Segurança só abre a confirmação: nenhum logout sai antes de confirmar", async () => {
  const user = userEvent.setup();
  render(<AccountSettings />);

  await user.click(logoutAllButton());
  await screen.findByRole("dialog");

  expect(logout).not.toHaveBeenCalled();
  expect(logoutAllDevices).not.toHaveBeenCalled();
  expect(setUnauthenticated).not.toHaveBeenCalled();
});
