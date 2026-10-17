// @vitest-environment jsdom
/**
 * Ver é ler (pedido de 2026-10-12): abrir a central já marca como lidas as
 * notificações não lidas que ela mostra, e o contador da casca muda assim que
 * a central é fechada ou deixada.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - abrir a gaveta pede `POST /v1/notifications/read` com o `id` de cada não
 *   lida visível — nunca `{ all: true }`, nunca para a já lida — e a linha
 *   continua destacada como não lida enquanto a gaveta está aberta;
 * - fechar a gaveta relê o resumo na hora: o badge da sidebar e o sino da Home
 *   ficam sem contador, sem esperar o intervalo de 45 s de `/v1/status`;
 * - deixar `/notificacoes` faz o mesmo;
 * - a condição ainda aberta (WhatsApp desconectado) continua avisada: só o
 *   "não lida" muda;
 * - se a marcação falhar, a gaveta continua de pé e o badge não zera por
 *   suposição.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Dashboard, Notification, SystemStatus } from "@/data";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { NotificationsScreen } from "@/features/notifications/NotificationsScreen";
import { AppShell } from "@/shared/layout/AppShell";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
          source: "AVENLY",
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

function statusFixture(
  whatsapp: "CONNECTED" | "DISCONNECTED" = "CONNECTED",
): SystemStatus {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-10-12T12:00:00.000Z",
      phoneNumber: whatsapp === "CONNECTED" ? "5511999990000" : null,
      status: whatsapp,
    },
  };
}

const READ_AT = "2026-10-12T11:00:00.000Z";

function notificationFixture(overrides: Partial<Notification>): Notification {
  return {
    id: "notif",
    kind: "AI_ACTIVATED",
    level: "INFO",
    occurredAt: "2026-10-12T12:00:00.000Z",
    payload: {},
    readAt: null,
    resolvedAt: null,
    shape: "EVENT",
    subjectId: null,
    ...overrides,
  };
}

/** Duas não lidas (uma delas a condição aberta do WhatsApp) e uma já lida. */
function itemsFixture(): Notification[] {
  return [
    notificationFixture({ id: "activated-unread" }),
    notificationFixture({
      id: "whatsapp-open",
      kind: "WHATSAPP_DISCONNECTED",
      level: "CRITICAL",
      shape: "CONDITION",
    }),
    notificationFixture({
      id: "import-read",
      kind: "IMPORT_COMPLETED",
      payload: { importedCount: 3 },
      readAt: READ_AT,
      subjectId: "session-1",
    }),
  ];
}

/**
 * O BFF dublado com estado: `markRead` tira o `id` das não lidas e o resumo
 * conta o que sobrou — o contador só cai se a marcação de fato aconteceu.
 */
let serverUnread: Set<string>;

function summaryFromServer() {
  return {
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: serverUnread.size },
    openConditionsCount: 1,
    unreadCount: serverUnread.size,
  };
}

function sidebarItem() {
  const sidebar = screen.getByRole("complementary", {
    name: "Navegação da aplicação",
  });
  return within(sidebar).getByRole("link", { name: /^Notificações/ });
}

/** `matchMedia` dublado: largura de desktop, em que o sino abre a gaveta. */
function stubDesktop() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const minWidth = /min-width:\s*(\d+)px/u.exec(query);
      return {
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: minWidth ? 1440 >= Number(minWidth[1]) : false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
      };
    }),
  );
}

function homeInShell() {
  return (
    <ShellConfigProvider>
      <AppShell active="inicio" module="dashboard" title="Início">
        <ProductDashboardScreen />
      </AppShell>
    </ShellConfigProvider>
  );
}

function notificacoesInShell() {
  return (
    <ShellConfigProvider>
      <AppShell active="notificacoes" module="settings" title="Notificações">
        <NotificationsScreen />
      </AppShell>
    </ShellConfigProvider>
  );
}

beforeEach(() => {
  for (const mock of [
    dashboardGet,
    statusGet,
    notificationsSummary,
    notificationsList,
    markRead,
    getPreferences,
  ]) {
    mock.mockReset();
  }
  serverUnread = new Set(["activated-unread", "whatsapp-open"]);
  dashboardGet.mockResolvedValue(dashboardFixture());
  statusGet.mockResolvedValue(statusFixture());
  notificationsSummary.mockImplementation(async () => summaryFromServer());
  notificationsList.mockImplementation(async () => ({
    items: itemsFixture(),
    limit: 20,
    offset: 0,
    total: 3,
  }));
  markRead.mockImplementation(async (input: { id: string }) => {
    const updated = serverUnread.delete(input.id) ? 1 : 0;
    return { updated };
  });
  getPreferences.mockResolvedValue({ aiAppointmentCreated: false });
  stubDesktop();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a gaveta: ver é ler", () => {
  test("abrir marca as não lidas visíveis pelo id e mantém o destaque até fechar", async () => {
    const user = userEvent.setup();
    render(homeInShell());

    await user.click(
      await screen.findByRole("button", { name: "Notificações, 2 não lidas" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Notificações" });
    await within(drawer).findByText("Sua IA está ativa");

    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    expect(markRead).toHaveBeenCalledWith({ id: "activated-unread" });
    expect(markRead).toHaveBeenCalledWith({ id: "whatsapp-open" });
    expect(markRead).not.toHaveBeenCalledWith({ id: "import-read" });
    expect(markRead).not.toHaveBeenCalledWith({ all: true });

    // Enquanto a gaveta está aberta, o que é novo continua destacado.
    expect(
      within(drawer)
        .getByRole("listitem", { name: /^Informativa: Sua IA está ativa/ })
        .classList.contains("is-unread"),
    ).toBe(true);
    expect(drawer.querySelectorAll(".notifications-row.is-unread")).toHaveLength(2);
  });

  test("fechar zera o badge e o sino na hora, sem esperar o próximo poll", async () => {
    const user = userEvent.setup();
    render(homeInShell());

    await user.click(
      await screen.findByRole("button", { name: "Notificações, 2 não lidas" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Notificações" });
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    expect(within(sidebarItem()).getByText("2")).toBeInTheDocument();
    const summaryCallsBeforeClose = notificationsSummary.mock.calls.length;

    await user.click(within(drawer).getByRole("button", { name: "Fechar" }));

    await waitFor(() =>
      expect(sidebarItem().querySelector(".badge-count")).toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: "Notificações" }),
    ).toBeInTheDocument();
    // Uma releitura do resumo, pedida pelo fechamento — o intervalo é de 45 s
    // e nenhum tempo correu.
    expect(notificationsSummary.mock.calls.length).toBe(summaryCallsBeforeClose + 1);
  });

  test("a condição ainda aberta continua avisada: só o 'não lida' muda", async () => {
    statusGet.mockResolvedValue(statusFixture("DISCONNECTED"));
    const user = userEvent.setup();
    render(homeInShell());

    await user.click(
      await screen.findByRole("button", { name: "Notificações, 2 não lidas" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Notificações" });
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    await user.click(within(drawer).getByRole("button", { name: "Fechar" }));

    await waitFor(() =>
      expect(sidebarItem().querySelector(".badge-count")).toBeNull(),
    );
    // O aviso do WhatsApp vem de `/v1/status`, não do contador da central.
    expect(
      within(
        screen.getByRole("complementary", { name: "Navegação da aplicação" }),
      ).getByText("WhatsApp desconectado"),
    ).toBeVisible();
  });

  test("se marcar falhar, a gaveta segue de pé e o badge não zera", async () => {
    markRead.mockRejectedValue(new Error("NETWORK"));
    const user = userEvent.setup();
    render(homeInShell());

    await user.click(
      await screen.findByRole("button", { name: "Notificações, 2 não lidas" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Notificações" });
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    expect(within(drawer).getByText("Sua IA está ativa")).toBeVisible();
    expect(within(drawer).queryByText("Notificações indisponíveis")).toBeNull();

    const summaryCallsBeforeClose = notificationsSummary.mock.calls.length;
    await user.click(within(drawer).getByRole("button", { name: "Fechar" }));

    // O resumo é relido do BFF e continua contando as duas.
    await waitFor(() =>
      expect(notificationsSummary.mock.calls.length).toBe(
        summaryCallsBeforeClose + 1,
      ),
    );
    await waitFor(() =>
      expect(within(sidebarItem()).getByText("2")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Notificações, 2 não lidas" }),
    ).toBeInTheDocument();
  });
});

describe("/notificacoes: ver é ler", () => {
  test("a página marca as não lidas e deixá-la zera o badge na hora", async () => {
    const { rerender } = render(notificacoesInShell());

    await screen.findByText("Sua IA está ativa");
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    expect(markRead).not.toHaveBeenCalledWith({ all: true });
    // Ainda na página, o contador não muda.
    expect(within(sidebarItem()).getByText("2")).toBeInTheDocument();
    const summaryCallsBeforeLeave = notificationsSummary.mock.calls.length;

    // Navegar: a casca fica, a página sai.
    rerender(homeInShell());

    await waitFor(() =>
      expect(sidebarItem().querySelector(".badge-count")).toBeNull(),
    );
    expect(notificationsSummary.mock.calls.length).toBe(summaryCallsBeforeLeave + 1);
    expect(
      await screen.findByRole("button", { name: "Notificações" }),
    ).toBeInTheDocument();
  });

  test("se marcar falhar na página, deixá-la não zera o badge", async () => {
    markRead.mockRejectedValue(new Error("NETWORK"));
    const { rerender } = render(notificacoesInShell());

    await screen.findByText("Sua IA está ativa");
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    const summaryCallsBeforeLeave = notificationsSummary.mock.calls.length;

    rerender(homeInShell());

    await waitFor(() =>
      expect(notificationsSummary.mock.calls.length).toBe(
        summaryCallsBeforeLeave + 1,
      ),
    );
    expect(within(sidebarItem()).getByText("2")).toBeInTheDocument();
  });
});
