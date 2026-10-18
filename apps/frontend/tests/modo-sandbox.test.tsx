// @vitest-environment jsdom
/**
 * D-199 — Modo sandbox em Configurações › IA e o lembrete na casca.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - a seção "Modo sandbox" tem um interruptor (`role="switch"`) com a
 *   explicação ligada a ele; ligar envia `enabled: true`, confirma com toast
 *   e relê o status da casca;
 * - ligado, aparece a lista "Números que recebem de verdade"; vazia, ela diz
 *   que nenhuma mensagem sai;
 * - adicionar número valida no padrão brasileiro (DDD), recusa repetido (com
 *   ou sem o 9º dígito) sem chamar a API e grava a lista inteira, com o
 *   número canônico; remover tira só aquele número;
 * - falha ao salvar é mensagem na tela (não só toast) e o estado lido não
 *   muda; falha ao ler oferece "Tentar novamente";
 * - enquanto carrega, o esqueleto fica fora da árvore acessível;
 * - axe sem violação, desligado e ligado com lista;
 * - na casca, o lembrete "Modo sandbox: mensagens não saem para clientes"
 *   aparece só com `ai.sandboxEnabled === true` no `GET /v1/status`, leva a
 *   Configurações › IA e não tem "Ocultar".
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AiSandboxSettings, SystemStatus } from "@/data";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getAiSandbox = vi.fn();
const updateAiSandbox = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const toasts: string[] = [];

const services = {
  auth: { logout: vi.fn() },
  notifications: { summary: notificationsSummary },
  settings: { getAiSandbox, updateAiSandbox },
  status: { get: statusGet },
};

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => services,
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

vi.mock("@/shared/ui/toastBus", () => ({
  showToast: (message: string) => toasts.push(message),
  subscribeToasts: () => () => undefined,
}));

import { AiSandboxSection } from "@/features/settings/AiSandboxSection";
import { AppShell } from "@/shared/layout/AppShell";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

function sandbox(overrides: Partial<AiSandboxSettings> = {}): AiSandboxSettings {
  return {
    enabled: false,
    exceptionPhones: [],
    updatedAt: null,
    ...overrides,
  };
}

function statusFixture(sandboxEnabled?: boolean | null): SystemStatus {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
      ...(sandboxEnabled === undefined ? {} : { sandboxEnabled }),
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-10-18T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  };
}

function renderSection() {
  return render(
    <SystemStatusProvider>
      <AiSandboxSection />
    </SystemStatusProvider>,
  );
}

const sandboxSwitch = () => screen.findByRole("switch", { name: "Modo sandbox" });

beforeEach(() => {
  for (const mock of [getAiSandbox, updateAiSandbox, statusGet, notificationsSummary]) {
    mock.mockReset();
  }
  toasts.length = 0;
  statusGet.mockResolvedValue(statusFixture(false));
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    unreadCount: 0,
    openConditionsCount: 0,
  });
  getAiSandbox.mockResolvedValue(sandbox());
  updateAiSandbox.mockImplementation(
    async (input: Partial<AiSandboxSettings>) =>
      sandbox({ enabled: true, ...input }),
  );
});

describe("Configurações › IA: modo sandbox", () => {
  test("carregando, o esqueleto fica fora da árvore acessível", () => {
    getAiSandbox.mockReturnValue(new Promise(() => undefined));
    const { container } = renderSection();
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  test("desligado: interruptor com a explicação e sem a lista", async () => {
    const { container } = renderSection();

    const toggle = await sandboxSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleDescription(
      /as mensagens aparecem como enviadas aqui, mas não chegam ao WhatsApp delas/,
    );
    expect(screen.queryByText("Números que recebem de verdade")).toBeNull();
    await expectNoA11yViolations(container);
  });

  test("ligar envia enabled: true, confirma com toast e relê o status da casca", async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(statusGet).toHaveBeenCalledTimes(1));

    await user.click(await sandboxSwitch());

    expect(updateAiSandbox).toHaveBeenCalledWith({ enabled: true });
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Modo sandbox" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(toasts).toEqual(["Modo sandbox ligado."]);
    await waitFor(() => expect(statusGet).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText("Nenhum número na lista: nenhuma mensagem sai para o WhatsApp."),
    ).toBeVisible();
  });

  test("adicionar número: valida DDD, recusa repetido e grava a lista canônica", async () => {
    const user = userEvent.setup();
    getAiSandbox.mockResolvedValue(
      sandbox({ enabled: true, exceptionPhones: ["5511987654321"] }),
    );
    renderSection();
    const input = await screen.findByLabelText("Adicionar número");

    await user.type(input, "1234");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Digite um número com DDD, como (11) 91234-5678.",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(updateAiSandbox).not.toHaveBeenCalled();

    // O mesmo número sem o 9º dígito é repetido.
    await user.clear(input);
    await user.type(input, "1187654321");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esse número já está na lista.",
    );
    expect(updateAiSandbox).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "21999990000");
    expect(input).toHaveValue("+55 (21) 99999-0000");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(updateAiSandbox).toHaveBeenCalledWith({
      exceptionPhones: ["5511987654321", "5521999990000"],
    });
    await waitFor(() => expect(input).toHaveValue(""));
    expect(toasts).toEqual(["Número adicionado."]);
    const list = screen.getByRole("list");
    expect(within(list).getByText("(11) 98765-4321")).toBeVisible();
    expect(within(list).getByText("(21) 99999-0000")).toBeVisible();
  });

  test("remover tira só aquele número", async () => {
    const user = userEvent.setup();
    getAiSandbox.mockResolvedValue(
      sandbox({ enabled: true, exceptionPhones: ["5511912345678", "5521999990000"] }),
    );
    const { container } = renderSection();

    const remove = await screen.findByRole("button", {
      name: "Remover (11) 91234-5678",
    });
    await expectNoA11yViolations(container);
    await user.click(remove);

    expect(updateAiSandbox).toHaveBeenCalledWith({
      exceptionPhones: ["5521999990000"],
    });
    expect(toasts).toEqual(["Número removido."]);
  });

  test("falha ao salvar fica na tela e o interruptor não muda", async () => {
    const user = userEvent.setup();
    updateAiSandbox.mockRejectedValue(new Error("502"));
    renderSection();

    await user.click(await sandboxSwitch());

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Não foi possível salvar o modo sandbox.",
    );
    expect(screen.getByRole("switch", { name: "Modo sandbox" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(toasts).toEqual([]);
  });

  test("falha ao ler oferece tentar de novo", async () => {
    const user = userEvent.setup();
    getAiSandbox.mockRejectedValueOnce(new Error("502"));
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Tentar novamente" }));

    expect(await sandboxSwitch()).toBeVisible();
    expect(getAiSandbox).toHaveBeenCalledTimes(2);
  });
});

describe("casca: lembrete do modo sandbox", () => {
  function renderShell() {
    return render(
      <AppShell active="inicio" title="Início">
        <p>Conteúdo</p>
      </AppShell>,
    );
  }
  const chipName = "Modo sandbox: mensagens não saem para clientes";

  test("ligado: aparece, leva às configurações da IA e não se oculta", async () => {
    statusGet.mockResolvedValue(statusFixture(true));
    const { container } = renderShell();

    const chip = await screen.findByRole("link", { name: chipName });
    expect(chip).toHaveAttribute("href", "/configuracoes/ia#modo-sandbox");
    expect(screen.queryByRole("button", { name: "Ocultar por 1h" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  test.each([
    ["desligado", false],
    ["sem resposta da IA", null],
    ["resposta antiga sem o campo", undefined],
  ] as const)("%s: não aparece", async (_label, value) => {
    statusGet.mockResolvedValue(statusFixture(value));
    renderShell();

    await waitFor(() => expect(statusGet).toHaveBeenCalled());
    await screen.findByText("Conteúdo");
    expect(screen.queryByRole("link", { name: chipName })).toBeNull();
  });
});
