// @vitest-environment jsdom
/**
 * Goal025/WU-08: "Excluir conta" em Configurações → Conta deixa de ser o
 * bloco desabilitado do Goal024 e passa a pedir, acompanhar e cancelar a
 * exclusão de verdade.
 *
 * O que esta suíte prova:
 *
 * - o bloco antigo (copy de etapa futura, botão "Exclusão indisponível"
 *   desabilitado) não existe mais;
 * - pedir exige senha atual e enuncia os efeitos (automações desligadas,
 *   WhatsApp desconectado, sete dias, depois disso sem volta) antes de
 *   `account.requestDeletion` ser chamado — nunca depois;
 * - senha errada (`401`) recusa com erro de campo, sem chamar
 *   `refresh`/fechar o diálogo como se tivesse dado certo;
 * - falha de rede também nunca é apresentada como sucesso;
 * - com exclusão `SCHEDULED`, os dias restantes vêm de `dueAt` (o vencimento
 *   do servidor), não de uma contagem própria do cliente;
 * - o aviso de exclusão agendada e o botão de excluir/cancelar vêm sempre do
 *   `accountDeletion` que `useSystemStatus` (o mesmo hook de `GET
 *   /v1/status`) devolve — nunca de um segundo estado inventado aqui;
 * - cancelar diz que WhatsApp e IA não voltam sozinhos e que operar de novo
 *   exige reconectar e retestar, e uma falha ao cancelar não fecha o diálogo
 *   nem afirma sucesso;
 * - enquanto `GET /v1/status` ainda não respondeu, a zona de risco não afirma
 *   nenhum dos dois estados (nem "sem pedido", nem "agendado").
 *
 * Goal124 (Mais-WhatsApp:C2): pedir a exclusão saiu do diálogo e foi para a
 * rota /configuracoes/conta/excluir (`AccountDeletionScreen`). A linha "Excluir
 * conta" é um link; o botão "Pedir exclusão" sempre habilitado virou "Excluir
 * minha conta", desabilitado sem senha. O que é afirmado do pedido é o mesmo.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { BffHttpError, type SettingsState } from "@/data";
import { AccountDeletionScreen } from "@/features/settings/AccountDeletionScreen";
import { AccountSettings } from "@/features/settings/AccountSettings";
// Import de tipo, apagado na compilacao: existe so para dar a assinatura do
// modulo original a `importOriginal` sem uma anotacao `import()` inline, que o
// `consistent-type-imports` do projeto recusa.
import type * as SystemStatusModule from "@/shared/runtime/systemStatus";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const requestDeletion = vi.fn();
const cancelDeletion = vi.fn();
const changePassword = vi.fn();
const logout = vi.fn();
const logoutAllDevices = vi.fn();
const setUnauthenticated = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    account: { requestDeletion, cancelDeletion },
    auth: { changePassword, logout, logoutAllDevices },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
    session: { user: { email: "marina@studio.com" } },
    setUnauthenticated,
  }),
}));

type SystemStatusMock = {
  accountDeletion: { status: string; dueAt: string | null } | null;
  phase: "error" | "loaded" | "loading";
  refresh: () => void;
};
const useSystemStatus = vi.fn<() => SystemStatusMock>();
const refreshStatus = vi.fn();
// Só `useSystemStatus` é dublado: `accountDeletionDaysRemaining` é a derivação
// real, a mesma que o aviso persistente do shell usa. Dublá-la também faria
// este teste afirmar a própria aritmética em vez da do produto.
vi.mock("@/shared/runtime/systemStatus", async (importOriginal) => ({
  ...(await importOriginal<typeof SystemStatusModule>()),
  useSystemStatus: (): SystemStatusMock => useSystemStatus(),
}));

// A tela só lê o fuso do negócio; o resto do estado não entra no pedido.
const settings = { business: { timezone: "America/Sao_Paulo" } } as SettingsState;

beforeEach(() => {
  vi.clearAllMocks();
  useSystemStatus.mockReturnValue({
    accountDeletion: { status: "NONE", dueAt: null },
    phase: "loaded",
    refresh: refreshStatus,
  });
});

test("o bloco desabilitado do Goal024 não existe mais", () => {
  render(<AccountSettings />);

  expect(
    screen.queryByText(
      "A exclusão de conta faz parte de uma etapa futura do produto e ainda não está disponível.",
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Exclusão indisponível" }),
  ).not.toBeInTheDocument();
  // Goal124: a linha "Excluir conta" leva à rota própria; não abre mais diálogo.
  expect(screen.getByRole("link", { name: /^Excluir conta/ })).toHaveAttribute(
    "href",
    "/configuracoes/conta/excluir",
  );
});

test("pedir enuncia os efeitos antes de executar e exige senha atual", async () => {
  const user = userEvent.setup();
  render(<AccountDeletionScreen settings={settings} />);

  const timeline = screen.getByRole("list");
  expect(timeline).toHaveTextContent(
    "Sua IA para de atender e o WhatsApp é desconectado.",
  );
  expect(timeline).toHaveTextContent("Próximos 7 dias");
  expect(timeline).toHaveTextContent(
    "Clientes, agenda, serviços e conversas são apagados de forma definitiva.",
  );
  expect(requestDeletion).not.toHaveBeenCalled();

  // Sem senha o botão fica desabilitado e o envio não dispara a chamada.
  const confirm = screen.getByRole("button", { name: "Excluir minha conta" });
  expect(confirm).toBeDisabled();
  await user.click(confirm);
  expect(requestDeletion).not.toHaveBeenCalled();

  requestDeletion.mockResolvedValue({
    status: "SCHEDULED",
    dueAt: "2026-09-23T12:00:00.000Z",
  });
  await user.type(screen.getByLabelText("Confirme com sua senha"), "correta-123");
  await user.click(confirm);

  await waitFor(() =>
    expect(requestDeletion).toHaveBeenCalledWith("correta-123"),
  );
  expect(requestDeletion).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(refreshStatus).toHaveBeenCalledTimes(1));
  expect(replace).toHaveBeenCalledWith("/configuracoes/conta");
});

test("senha atual incorreta recusa com erro de campo, sem chamar refresh nem sair da tela", async () => {
  const user = userEvent.setup();
  render(<AccountDeletionScreen settings={settings} />);

  await user.type(screen.getByLabelText("Confirme com sua senha"), "errada-000");

  requestDeletion.mockRejectedValue(
    new BffHttpError({
      code: "UNAUTHORIZED",
      message: "Current password is incorrect.",
      requestId: "req-1",
      status: 401,
    }),
  );
  await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));

  expect(await screen.findByText("Senha atual incorreta.")).toBeVisible();
  expect(refreshStatus).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Excluir minha conta" }),
  ).toBeInTheDocument();
});

test("falha de rede ao pedir a exclusão nunca é apresentada como sucesso", async () => {
  const user = userEvent.setup();
  render(<AccountDeletionScreen settings={settings} />);

  await user.type(
    screen.getByLabelText("Confirme com sua senha"),
    "correta-123",
  );

  requestDeletion.mockRejectedValue(new Error("network error"));
  await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));

  expect(
    await screen.findByText(
      "Não foi possível pedir a exclusão agora. Tente novamente.",
    ),
  ).toBeVisible();
  expect(refreshStatus).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

test("com exclusão agendada, os dias restantes vêm do vencimento devolvido pelo servidor", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T12:00:00.000Z"));
  useSystemStatus.mockReturnValue({
    accountDeletion: { status: "SCHEDULED", dueAt: "2026-09-23T12:00:00.000Z" },
    phase: "loaded",
    refresh: refreshStatus,
  });

  render(<AccountSettings />);

  expect(
    screen.getByText(
      "Faltam 3 dias para os dados serem apagados definitivamente.",
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: /^Excluir conta/ }),
  ).not.toBeInTheDocument();

  vi.useRealTimers();
});

test("cancelar diz que WhatsApp e IA não voltam sozinhos e que operar de novo exige reconectar e retestar", async () => {
  const user = userEvent.setup();
  useSystemStatus.mockReturnValue({
    accountDeletion: { status: "SCHEDULED", dueAt: "2026-09-23T12:00:00.000Z" },
    phase: "loaded",
    refresh: refreshStatus,
  });
  render(<AccountSettings />);

  await user.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Cancelar a exclusão da conta?",
  });
  expect(dialog).toHaveTextContent(
    /WhatsApp e a IA não voltam a funcionar sozinhos/,
  );
  expect(dialog).toHaveTextContent(
    /reconecte o WhatsApp e refaça o teste real de ativação/,
  );
  expect(cancelDeletion).not.toHaveBeenCalled();

  cancelDeletion.mockResolvedValue({
    status: "CANCELLED",
    dueAt: "2026-09-23T12:00:00.000Z",
  });
  await user.click(
    within(dialog).getByRole("button", { name: "Cancelar exclusão" }),
  );

  await waitFor(() => expect(cancelDeletion).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(refreshStatus).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("falha ao cancelar não fecha o diálogo nem afirma sucesso", async () => {
  const user = userEvent.setup();
  useSystemStatus.mockReturnValue({
    accountDeletion: { status: "SCHEDULED", dueAt: "2026-09-23T12:00:00.000Z" },
    phase: "loaded",
    refresh: refreshStatus,
  });
  render(<AccountSettings />);

  await user.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
  const dialog = await screen.findByRole("dialog");
  cancelDeletion.mockRejectedValue(new Error("network error"));
  await user.click(
    within(dialog).getByRole("button", { name: "Cancelar exclusão" }),
  );

  expect(
    await within(dialog).findByText(
      "Não foi possível cancelar agora. Tente novamente.",
    ),
  ).toBeVisible();
  expect(refreshStatus).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("enquanto GET /v1/status carrega, a zona de risco não afirma nem 'sem pedido' nem 'agendado'", () => {
  useSystemStatus.mockReturnValue({
    accountDeletion: null,
    phase: "loading",
    refresh: refreshStatus,
  });
  render(<AccountSettings />);

  expect(
    screen.queryByRole("link", { name: /^Excluir conta/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancelar exclusão" }),
  ).not.toBeInTheDocument();
});
