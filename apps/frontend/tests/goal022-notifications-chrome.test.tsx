// @vitest-environment jsdom
/**
 * Goal022 (WU-08): chrome do AppShell — entrada de Notificações (sidebar +
 * "Mais"), contador com teto de exibição a partir do mesmo tick do
 * `SystemStatusProvider`, e o banner persistente derivado de `GET /v1/status`
 * (não da central) para WhatsApp desconectado e IA indisponível.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - a entrada de Notificações existe fora do "Mais" (chrome visível sem
 *   abrir o diálogo) e também aparece dentro de "Mais" quando aberto — nunca
 *   como sexta aba do bottom nav;
 * - o contador de não lidas vem de `notifications.summary` (mesmo tick de
 *   `GET /v1/status`) e tem teto de exibição ("9+" acima do teto);
 * - o banner aparece quando WhatsApp está desconectado ou a IA está
 *   indisponível, e some quando os dois estão OK;
 * - a frase do banner nunca repete a frase do chip de estado (StatusLine) da
 *   sidebar.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { SystemStatus } from "@/data";
import { AppShell } from "@/shared/layout/AppShell";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const logout = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout },
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

function statusFixture(overrides: Partial<SystemStatus> = {}): SystemStatus {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "CONVERGED",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-15T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
    ...overrides,
  };
}

function renderShell() {
  return render(
    <AppShell active="inicio" title="Início">
      <p>Conteúdo</p>
    </AppShell>,
  );
}

beforeEach(() => {
  statusGet.mockReset();
  notificationsSummary.mockReset();
  logout.mockReset();
  statusGet.mockResolvedValue(statusFixture());
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    unreadCount: 0,
    openConditionsCount: 0,
  });
});

describe("entrada de Notificações", () => {
  test("existe fora do 'Mais' e some do rótulo quando 'Mais' abre com uma segunda entrada", async () => {
    renderShell();

    const link = await screen.findByRole("link", { name: /^Notificações/ });
    expect(link).toHaveAttribute("href", "/notificacoes");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mais" }));

    // Com o diálogo aberto, a lista de "Mais" também lista Notificações:
    // duas entradas no total, uma no chrome e outra dentro do diálogo.
    expect(screen.getAllByRole("link", { name: /^Notificações/ })).toHaveLength(
      2,
    );
  });

  test("a folha 'Mais' (2026-10-16): atalhos no topo, grupos com título, sem cartão interno, 'Sair' no fim", async () => {
    renderShell();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Mais" }));
    const sheet = screen.getByRole("dialog", { name: "Mais" });

    // Sem o cartão interno de antes.
    expect(sheet.querySelector(".list")).toBeNull();
    // Notificações e Serviços como atalhos em destaque.
    const tiles = sheet.querySelectorAll(".more-tile");
    expect([...tiles].map((tile) => tile.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Notificações/),
        "Serviços",
      ]),
    );
    // Configurações e conta em grupos com título, para o leitor de tela.
    const settings = within(sheet).getByRole("region", {
      name: "Configurações",
    });
    expect(
      within(settings).getByRole("link", { name: "Disponibilidade" }),
    ).toHaveAttribute("href", "/configuracoes/disponibilidade");
    const account = within(sheet).getByRole("region", { name: "Sua conta" });
    expect(within(account).getByRole("link", { name: "Conta" })).toBeVisible();
    expect(within(account).getByRole("button", { name: "Sair" })).toBeVisible();
  });

  test("não vira uma quinta aba do bottom nav mobile", async () => {
    renderShell();
    await screen.findByRole("link", { name: /^Notificações/ });

    const bottomNav = screen
      .getAllByRole("navigation", { name: "Navegação principal" })
      .find((nav) => within(nav).queryByRole("button", { name: "Mais" }));
    expect(bottomNav).toBeDefined();
    expect(
      within(bottomNav as HTMLElement).queryByRole("link", {
        name: /^Notificações/,
      }),
    ).toBeNull();
  });
});

describe("contador de não lidas", () => {
  test("some quando não há não lidas", async () => {
    renderShell();

    const link = await screen.findByRole("link", { name: /^Notificações/ });
    await waitFor(() => expect(notificationsSummary).toHaveBeenCalled());
    expect(within(link).queryByText(/\d/)).toBeNull();
  });

  test("mostra o número exato abaixo do teto", async () => {
    notificationsSummary.mockResolvedValue({
      byLevel: { INFO: 1, ATTENTION: 2, CRITICAL: 0 },
      unreadCount: 3,
      openConditionsCount: 0,
    });
    renderShell();

    const link = await screen.findByRole("link", { name: /^Notificações/ });
    expect(await within(link).findByText("3")).toBeVisible();
  });

  test("acima do teto mostra '9+'", async () => {
    notificationsSummary.mockResolvedValue({
      byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 42 },
      unreadCount: 42,
      openConditionsCount: 3,
    });
    renderShell();

    const link = await screen.findByRole("link", { name: /^Notificações/ });
    expect(await within(link).findByText("9+")).toBeVisible();
  });
});

describe("banner persistente (deriva de /v1/status, não da central)", () => {
  test("aparece para WhatsApp desconectado, com frase distinta do chip da sidebar", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        whatsapp: {
          checkedAt: "2026-09-15T12:00:00.000Z",
          phoneNumber: null,
          status: "DISCONNECTED",
        },
      }),
    );
    renderShell();

    const banner = await screen.findByRole("alert");
    expect(
      within(banner).getByText("Atendimento automático parado"),
    ).toBeVisible();
    expect(within(banner).queryByText("WhatsApp desconectado")).toBeNull();
    // Goal085: a sidebar não tem a linha de WhatsApp, mas o cartão da IA diz a
    // desconexão; fora do cartão e do banner, nada mais repete a frase.
    expect(
      await within(
        document.querySelector("aside.sidebar .ia-card") as HTMLElement,
      ).findByText("WhatsApp desconectado"),
    ).toBeVisible();
    expect(screen.getAllByText("WhatsApp desconectado")).toHaveLength(1);
  });

  test("aparece para IA indisponível (PENDING ou UNKNOWN), com frase distinta do chip", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        ai: {
          desiredEnabled: true,
          effectiveEnabled: false,
          reconciled: "NOOP",
          state: "PENDING",
        },
      }),
    );
    renderShell();

    const banner = await screen.findByRole("alert");
    expect(within(banner).getByText("IA indisponível")).toBeVisible();
    expect(screen.getByText("IA em ativação")).toBeVisible();
  });

  test("some quando WhatsApp está conectado e a IA está ativa", async () => {
    renderShell();

    await screen.findByText("IA ativa");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("sem violação de acessibilidade com os dois banners visíveis", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        ai: {
          desiredEnabled: true,
          effectiveEnabled: false,
          reconciled: "UNKNOWN",
          state: "UNKNOWN",
        },
        whatsapp: {
          checkedAt: "2026-09-15T12:00:00.000Z",
          phoneNumber: null,
          status: "DISCONNECTED",
        },
      }),
    );
    const { container } = renderShell();

    await screen.findAllByRole("alert");
    await expectNoA11yViolations(container);
  });
});
