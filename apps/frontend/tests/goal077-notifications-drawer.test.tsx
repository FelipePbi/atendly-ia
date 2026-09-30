// @vitest-environment jsdom
/**
 * Goal077 §3 (NT-01) — a central vira gaveta a partir de 768 px.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela (§6.9):
 *
 * - na largura de tablet ou desktop dublada, o sino da Home abre um
 *   `role="dialog"` "Notificações" sem mudar a rota, com a lista da central,
 *   "Fechar" e o link "Preferências de notificação" para `/notificacoes` — e
 *   sem a preferência em si, que fica só na página;
 * - `Escape` fecha a gaveta e devolve o foco ao sino;
 * - o item "Notificações" da sidebar abre a mesma gaveta;
 * - na largura de celular, o sino continua link para `/notificacoes`.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Dashboard, Notification, SystemStatus } from "@/data";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { AppShell } from "@/shared/layout/AppShell";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push, replace }),
}));

const dashboardGet = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const notificationsList = vi.fn();
const markRead = vi.fn();
const getPreferences = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    dashboard: { get: dashboardGet },
    notifications: {
      getPreferences,
      list: notificationsList,
      markRead,
      summary: notificationsSummary,
    },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br", name: "Marina Alves" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

function dashboardFixture(): Dashboard {
  return {
    ai: {
      data: {
        aiAppointmentsThisWeek: 0,
        aiAppointmentsToday: 0,
        automatedConversationsToday: 0,
        conversationsNeedingAttention: [],
        conversationsNeedingAttentionCount: 0,
        conversationsTakenOverThisWeek: 0,
      },
      status: "ok",
    },
    degraded: false,
    platform: {
      onboardingCompleted: true,
      tenantName: "Studio Marina",
      timezone: "America/Sao_Paulo",
    },
    scheduling: {
      data: {
        appointmentsThisWeek: 0,
        appointmentsToday: 0,
        calendar: {
          capabilities: {
            activationTestCompleted: true,
            aiActivationReady: true,
            createAppointments: true,
            hoursConfigured: true,
            manageAvailability: true,
            manageCustomers: true,
            manageServices: true,
            migrate: true,
          },
          integration: null,
          source: "ATENDLY",
          timezone: "America/Sao_Paulo",
        },
        estimatedRevenueToday: null,
        nextAppointment: null,
        todayAppointments: [],
      },
      status: "ok",
    },
    whatsapp: {
      data: { phoneNumber: "5511999990000", status: "CONNECTED" },
      status: "ok",
    },
  };
}

function statusFixture(): SystemStatus {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: { desiredEnabled: true, effectiveEnabled: true, reconciled: "NOOP", state: "ACTIVE" },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-29T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  };
}

function activatedFixture(): Notification {
  return {
    id: "activated-1",
    kind: "AI_ACTIVATED",
    level: "INFO",
    occurredAt: "2026-09-29T12:00:00.000Z",
    payload: {},
    readAt: null,
    resolvedAt: null,
    shape: "EVENT",
    subjectId: null,
  };
}

/** `matchMedia` dublado: só a consulta da gaveta responde à largura escolhida. */
function stubViewport(width: number) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const minWidth = /min-width:\s*(\d+)px/u.exec(query);
      return {
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: minWidth ? width >= Number(minWidth[1]) : false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
      };
    }),
  );
}

async function renderHomeInShell() {
  const utils = render(
    <ShellConfigProvider>
      <AppShell active="inicio" module="dashboard" title="Início">
        <ProductDashboardScreen />
      </AppShell>
    </ShellConfigProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return utils;
}

beforeEach(() => {
  for (const mock of [
    push,
    replace,
    dashboardGet,
    statusGet,
    notificationsSummary,
    notificationsList,
    markRead,
    getPreferences,
  ]) {
    mock.mockReset();
  }
  dashboardGet.mockResolvedValue(dashboardFixture());
  statusGet.mockResolvedValue(statusFixture());
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 1, ATTENTION: 0, CRITICAL: 0 },
    openConditionsCount: 0,
    unreadCount: 1,
  });
  notificationsList.mockResolvedValue({
    items: [activatedFixture()],
    limit: 20,
    offset: 0,
    total: 1,
  });
  getPreferences.mockResolvedValue({ aiAppointmentCreated: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("§6.9 tablet e desktop: a gaveta", () => {
  test("o sino abre a gaveta sem navegar; Escape fecha e devolve o foco ao sino", async () => {
    stubViewport(768);
    const user = userEvent.setup();
    const { container } = await renderHomeInShell();

    const bell = await screen.findByRole("button", { name: /^Notificações, 1 não lidas$/ });
    await user.click(bell);

    const drawer = await screen.findByRole("dialog", { name: "Notificações" });
    expect(await within(drawer).findByText("Sua IA está ativa")).toBeVisible();
    expect(within(drawer).getByRole("button", { name: "Fechar" })).toBeVisible();
    expect(within(drawer).getByRole("button", { name: "Marcar lidas" })).toBeVisible();
    expect(
      within(drawer).getByRole("link", { name: "Preferências de notificação" }),
    ).toHaveAttribute("href", "/notificacoes");
    // A preferência em si fica só na página /notificacoes.
    expect(within(drawer).queryByRole("checkbox")).toBeNull();
    expect(getPreferences).not.toHaveBeenCalled();
    // Nenhuma navegação: a gaveta abre sobre a Home.
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // O foco entrou na gaveta.
    expect(drawer.contains(document.activeElement)).toBe(true);

    await expectNoA11yViolations(container);

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Notificações" })).toBeNull(),
    );
    expect(document.activeElement).toBe(bell);
  });

  test("'Fechar' fecha a gaveta e devolve o foco ao sino", async () => {
    stubViewport(1440);
    const user = userEvent.setup();
    await renderHomeInShell();

    const bell = await screen.findByRole("button", { name: /^Notificações, 1 não lidas$/ });
    await user.click(bell);
    const drawer = await screen.findByRole("dialog", { name: "Notificações" });
    await user.click(within(drawer).getByRole("button", { name: "Fechar" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Notificações" })).toBeNull(),
    );
    expect(document.activeElement).toBe(bell);
  });

  test("o item 'Notificações' da sidebar abre a mesma gaveta", async () => {
    stubViewport(1024);
    const user = userEvent.setup();
    await renderHomeInShell();

    const sidebar = screen.getByRole("complementary", { name: "Navegação da aplicação" });
    // Continua link para /notificacoes (abrir em nova aba segue valendo),
    // mas o clique abre a gaveta em vez de navegar.
    const item = within(sidebar).getByRole("link", { name: /^Notificações/ });
    expect(item).toHaveAttribute("href", "/notificacoes");
    expect(item).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(item);

    const drawer = await screen.findByRole("dialog", { name: "Notificações" });
    expect(await within(drawer).findByText("Sua IA está ativa")).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    // Uma gaveta só, a mesma do sino.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

describe("§6.9 celular: a central em tela própria", () => {
  test("abaixo de 768 px o sino é link para /notificacoes", async () => {
    stubViewport(390);
    await renderHomeInShell();

    const bell = await screen.findByRole("link", { name: /^Notificações, 1 não lidas$/ });
    expect(bell).toHaveAttribute("href", "/notificacoes");
    expect(screen.queryByRole("button", { name: /^Notificações, 1 não lidas$/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
