// @vitest-environment jsdom
/**
 * Goal096 — Conversas e Notificações iguais ao protótipo (C5 e NT1; D-115).
 *
 * O que esta suíte prova, pelo que a usuária encontra, na casca real do grupo
 * `(platform)` e nas duas faixas de largura (matchMedia simulado):
 *
 * 1. `/conversas` mostra o C5 só com o WhatsApp `off` e nenhuma conversa
 *    (consulta sem `category`, `ignored` nem busca, com `limit: 1`); nos outros
 *    casos, as abas de hoje; enquanto status ou consulta carregam, nenhum dos
 *    dois;
 * 2. abaixo de 1024 px `/notificacoes` é tela empurrada (NT1): `h1`
 *    "Notificações", voltar para `/inicio`, sem barra de abas, sem eyebrow,
 *    subtítulo nem "Histórico recente";
 * 3. a linha do NT1 mostra o nível pela forma do marcador, sem selo de texto,
 *    na página e na gaveta;
 * 4. a gaveta vale a partir de 1024 px: abaixo disso o sino é link, a partir
 *    dela é botão e abre o `dialog` sem navegar;
 * 5. cada árvore chama `useShellConfig` uma única vez em `/conversas` (C5 e
 *    abas) e em `/notificacoes`, nas duas faixas.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pelo `visual:compare` contra o protótipo e pelo gate renderizado.
 */

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type {
  Conversation,
  Dashboard,
  Notification,
  SystemStatus,
} from "@/data";
import { ProductConversationsScreen } from "@/features/conversations/ProductConversationsScreen";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { NOTIFICATIONS_DRAWER_QUERY } from "@/features/notifications/NotificationsDrawer";
import { NotificationsScreen } from "@/features/notifications/NotificationsScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";
import { WIDE_LAYOUT_QUERY } from "@/shared/layout/useWideLayout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push, replace }),
}));

const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

/** Quem chama `useShellConfig` agora (montado) e a última config de cada um. */
const shell = vi.hoisted(() => ({
  live: new Map<string, unknown>(),
  maxLive: 0,
}));

vi.mock("@/shared/layout/ShellConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof ShellConfigModule>();
  return {
    ...actual,
    useShellConfig: (config: ShellConfig) => {
      const id = useId();
      shell.live.set(id, config);
      useEffect(() => {
        shell.maxLive = Math.max(shell.maxLive, shell.live.size);
        return () => {
          shell.live.delete(id);
        };
      }, [id]);
      actual.useShellConfig(config);
    },
  };
});

const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const notificationsList = vi.fn();
const markRead = vi.fn();
const getPreferences = vi.fn();
const conversationsList = vi.fn();
const dashboardGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    conversations: { list: conversationsList },
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

const WIDE = 1280;
const NARROW = 390;

function setViewport(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: min ? width >= Number(min[1]) : false,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    },
    writable: true,
  });
}

type WhatsappValue = "CONNECTED" | "DISCONNECTED" | "UNKNOWN";

function statusFixture(whatsapp: WhatsappValue): SystemStatus {
  return {
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-10-03T12:00:00.000Z",
      phoneNumber: whatsapp === "CONNECTED" ? "5511999990000" : null,
      status: whatsapp,
    },
  };
}

function conversationFixture(): Conversation {
  return {
    category: "COMMERCIAL",
    categorySource: "AUTOMATIC",
    customerName: "Marina Duarte",
    externalContactId: "5511999990000@c.us",
    handling: "AI",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-10-03T12:00:00.000Z",
  };
}

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

function notificationFixture(
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id: "notif-1",
    kind: "CUSTOMER_WAITING_HUMAN",
    level: "ATTENTION",
    occurredAt: new Date().toISOString(),
    payload: { contactName: "Marina", reason: "EXPLICIT_REQUEST" },
    readAt: null,
    resolvedAt: null,
    shape: "CONDITION",
    subjectId: "conversation-1",
    ...overrides,
  };
}

const READ_AT = new Date().toISOString();

/** Um item de cada espécie de linha: três níveis, não lida e resolvida. */
function rowFixtures(): Notification[] {
  return [
    notificationFixture({
      id: "info-unread",
      kind: "AI_ACTIVATED",
      level: "INFO",
      payload: {},
      shape: "EVENT",
      subjectId: null,
    }),
    notificationFixture({ id: "attention-unread" }),
    notificationFixture({
      id: "critical-read",
      kind: "WHATSAPP_DISCONNECTED",
      level: "CRITICAL",
      payload: {},
      readAt: READ_AT,
      subjectId: null,
    }),
    notificationFixture({
      id: "critical-resolved",
      kind: "AI_UNAVAILABLE",
      level: "CRITICAL",
      payload: {},
      readAt: READ_AT,
      resolvedAt: READ_AT,
      subjectId: null,
    }),
  ];
}

function listOf(items: Notification[]) {
  return { items, limit: 20, offset: 0, total: items.length };
}

function bottomNavOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('nav[class$="bottom-nav"]');
}

const SHELL_BANNER = "Atendimento automático parado";
const C5_TITLE = "Conecte seu WhatsApp para ver suas conversas aqui.";

beforeEach(() => {
  shell.live.clear();
  shell.maxLive = 0;
  for (const mock of [
    push,
    replace,
    statusGet,
    notificationsSummary,
    notificationsList,
    markRead,
    getPreferences,
    conversationsList,
    dashboardGet,
  ]) {
    mock.mockReset();
  }
  statusGet.mockResolvedValue(statusFixture("CONNECTED"));
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 1, CRITICAL: 0, INFO: 1 },
    openConditionsCount: 1,
    unreadCount: 2,
  });
  notificationsList.mockResolvedValue(listOf(rowFixtures()));
  getPreferences.mockResolvedValue({ aiAppointmentCreated: false });
  conversationsList.mockResolvedValue([]);
  dashboardGet.mockResolvedValue(dashboardFixture());
  setViewport(WIDE);
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

function renderConversas() {
  return render(
    <PlatformLayout>
      <ProductConversationsScreen />
    </PlatformLayout>,
  );
}

function renderNotificacoes() {
  return render(
    <PlatformLayout>
      <NotificationsScreen />
    </PlatformLayout>,
  );
}

function renderHome() {
  return render(
    <PlatformLayout>
      <ProductDashboardScreen />
    </PlatformLayout>,
  );
}

function liveShellConfigs(): ShellConfig[] {
  return [...shell.live.values()] as ShellConfig[];
}

describe("Goal096 prova 1: o C5 e a regra de /conversas sem WhatsApp", () => {
  test("WhatsApp off e nenhuma conversa: o C5, sem abas, busca nem banner da casca", async () => {
    statusGet.mockResolvedValue(statusFixture("DISCONNECTED"));
    const { container } = renderConversas();

    expect(
      await screen.findByRole("heading", { level: 2, name: C5_TITLE }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Elas ficam organizadas em Comercial, Não classificadas e Pessoal, e a IA passa a atender seus clientes. Você continua usando o WhatsApp normalmente.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Conversas" }),
    ).toBeVisible();

    const connect = screen.getByRole("link", { name: "Conectar WhatsApp" });
    expect(connect).toHaveAttribute("href", "/configuracoes/whatsapp");

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByLabelText("Buscar por nome ou telefone")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ignorados" })).toBeNull();
    expect(container.querySelector(".conversation-lens-note")).toBeNull();

    // A tela diz que falta o WhatsApp: a casca não repete o banner.
    expect(screen.queryByText(SHELL_BANNER)).toBeNull();
    const configs = liveShellConfigs();
    expect(configs).toHaveLength(1);
    expect(shell.maxLive).toBe(1);
    expect(configs[0]?.whatsappInBand).toBe(true);
    expect(configs[0]?.attention).toBe(false);

    // A consulta: sem category, sem ignored, sem busca, com limit 1.
    expect(conversationsList).toHaveBeenCalledTimes(1);
    expect(conversationsList.mock.calls[0]?.[0]).toStrictEqual({ limit: 1 });
  });

  test("WhatsApp off com uma conversa: as abas, sem o C5, e a casca mantém o banner", async () => {
    statusGet.mockResolvedValue(statusFixture("DISCONNECTED"));
    conversationsList.mockResolvedValue([conversationFixture()]);
    renderConversas();

    expect(await screen.findByRole("tablist")).toBeVisible();
    expect(await screen.findByText("Marina Duarte")).toBeVisible();
    expect(screen.queryByRole("heading", { name: C5_TITLE })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Conectar WhatsApp" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Buscar conversas" }),
    ).toBeVisible();
    expect(screen.getByText(SHELL_BANNER)).toBeVisible();
    expect(liveShellConfigs()[0]?.whatsappInBand).not.toBe(true);
    // A primeira consulta é a da regra; a seguinte já é a da aba Comercial.
    expect(conversationsList.mock.calls[0]?.[0]).toStrictEqual({ limit: 1 });
    expect(conversationsList).toHaveBeenCalledWith(
      { category: "COMMERCIAL", limit: 50 },
      expect.anything(),
    );
  });

  test("WhatsApp active: as abas, sem o C5 e sem a consulta da regra", async () => {
    statusGet.mockResolvedValue(statusFixture("CONNECTED"));
    renderConversas();

    expect(await screen.findByRole("tablist")).toBeVisible();
    expect(screen.queryByRole("heading", { name: C5_TITLE })).toBeNull();
    await waitFor(() => expect(conversationsList).toHaveBeenCalled());
    for (const [query] of conversationsList.mock.calls) {
      expect(query).not.toStrictEqual({ limit: 1 });
      expect(query).toHaveProperty("category", "COMMERCIAL");
    }
  });

  test("WhatsApp unknown: as abas, sem o C5 e sem a consulta da regra", async () => {
    statusGet.mockResolvedValue(statusFixture("UNKNOWN"));
    renderConversas();

    expect(await screen.findByRole("tablist")).toBeVisible();
    expect(screen.queryByRole("heading", { name: C5_TITLE })).toBeNull();
    await waitFor(() => expect(conversationsList).toHaveBeenCalled());
    for (const [query] of conversationsList.mock.calls) {
      expect(query).not.toStrictEqual({ limit: 1 });
    }
  });

  test("a consulta da regra falhando: o caminho de hoje, com as abas e sem o C5", async () => {
    statusGet.mockResolvedValue(statusFixture("DISCONNECTED"));
    conversationsList.mockRejectedValueOnce(new Error("BFF fora do ar"));
    renderConversas();

    expect(await screen.findByRole("tablist")).toBeVisible();
    expect(screen.queryByRole("heading", { name: C5_TITLE })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Conectar WhatsApp" }),
    ).toBeNull();
    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma conversa comercial por enquanto",
      }),
    ).toBeVisible();
  });

  test("status carregando: nem o C5 nem as abas", async () => {
    statusGet.mockReturnValue(new Promise(() => undefined));
    const { container } = renderConversas();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Conversas" }),
    ).toBeVisible();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("heading", { name: C5_TITLE })).toBeNull();
    expect(conversationsList).not.toHaveBeenCalled();
  });

  test("consulta da regra carregando: nem o C5 nem as abas", async () => {
    statusGet.mockResolvedValue(statusFixture("DISCONNECTED"));
    conversationsList.mockReturnValue(new Promise(() => undefined));
    const { container } = renderConversas();

    await waitFor(() => expect(conversationsList).toHaveBeenCalledTimes(1));
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("heading", { name: C5_TITLE })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Conectar WhatsApp" }),
    ).toBeNull();
  });

  test("quando o WhatsApp conecta, o tick de status troca o C5 pelas abas sem recarregar", async () => {
    statusGet.mockResolvedValueOnce(statusFixture("DISCONNECTED"));
    statusGet.mockResolvedValue(statusFixture("CONNECTED"));
    renderConversas();

    expect(
      await screen.findByRole("heading", { level: 2, name: C5_TITLE }),
    ).toBeVisible();

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(await screen.findByRole("tablist")).toBeVisible();
    expect(screen.queryByRole("heading", { name: C5_TITLE })).toBeNull();
  });
});

describe("Goal096 prova 2: o NT1 é tela empurrada abaixo de 1024 px", () => {
  test("h1 'Notificações', voltar para /inicio, sem barra de abas e sem o cabeçalho antigo", async () => {
    setViewport(NARROW);
    const { container } = renderNotificacoes();

    await screen.findByRole("listitem", { name: /^Atenção: / });

    const headings = within(container).getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/^Notificações$/);

    const back = within(container).getByRole("link", {
      name: "Voltar para o início",
    });
    expect(back).toHaveAttribute("href", "/inicio");
    expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
    expect(bottomNavOf(container)).toBeNull();
    expect(liveShellConfigs()[0]?.pushed).toBe(true);

    const main = container.querySelector("main") as HTMLElement;
    expect(main.querySelector(".eyebrow")).toBeNull();
    expect(within(main).queryByText("Central de notificações")).toBeNull();
    expect(within(main).queryByText(/Alertas e eventos relevantes/)).toBeNull();
    expect(within(main).queryByText("Histórico recente")).toBeNull();
    expect(within(main).queryByText(/nos últimos 90 dias/)).toBeNull();

    expect(
      within(main).getByRole("button", { name: "Marcar lidas" }),
    ).toBeVisible();
  });

  test("sem notificação não lida não há 'Marcar lidas'", async () => {
    setViewport(NARROW);
    notificationsList.mockResolvedValue(
      listOf([notificationFixture({ readAt: READ_AT })]),
    );
    renderNotificacoes();

    await screen.findByRole("listitem", { name: /^Atenção: / });
    expect(screen.queryByRole("button", { name: "Marcar lidas" })).toBeNull();
  });

  test("de 1024 px em diante a página fica na casca, com o mesmo título e a mesma lista", async () => {
    setViewport(WIDE);
    const { container } = renderNotificacoes();

    await screen.findByRole("listitem", { name: /^Atenção: / });

    const headings = within(container).getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/^Notificações$/);
    expect(container.querySelector(".app-frame.is-pushed")).toBeNull();
    expect(bottomNavOf(container)).not.toBeNull();
    expect(screen.getAllByRole("listitem", { name: /: / })).toHaveLength(4);
    expect(screen.queryByText("Histórico recente")).toBeNull();
  });
});

/** O que cada linha do NT1 mostra, na página e na gaveta (mesmo `NotificationHistory`). */
function expectNt1Rows(scope: HTMLElement) {
  const info = within(scope).getByRole("listitem", {
    name: "Informativa: Sua IA está ativa",
  });
  const attention = within(scope).getByRole("listitem", {
    name: "Atenção: Cliente aguardando você",
  });
  const critical = within(scope).getByRole("listitem", {
    name: "Crítica: WhatsApp desconectado",
  });
  const resolved = within(scope).getByRole("listitem", {
    name: "Crítica: IA indisponível (resolvido)",
  });

  const marker = (row: HTMLElement) =>
    row.querySelector(".notifications-marker > .notifications-level-dot");

  // O nível aparece pela forma do marcador, nunca por selo de texto.
  expect(marker(info)).toHaveClass("is-info");
  expect(marker(attention)).toHaveClass("is-attention");
  expect(attention).toHaveClass("is-attention", "is-unread");
  expect(marker(critical)?.tagName.toLowerCase()).toBe("svg");
  expect(marker(critical)).toHaveClass("is-critical");
  expect(marker(resolved)).toHaveClass("is-resolved");

  for (const row of [info, attention, critical, resolved]) {
    expect(row.querySelector(".badge")).toBeNull();
    for (const text of [
      "Informativa",
      "Atenção",
      "Crítica",
      "Não lida",
      "Resolvido",
    ]) {
      expect(within(row).queryByText(text)).toBeNull();
    }
  }

  // A não lida: classe própria e o controle "Marcar como lida" na linha.
  for (const row of [info, attention]) {
    expect(row).toHaveClass("is-unread");
    expect(
      within(row).getByRole("button", { name: "Marcar como lida" }),
    ).toBeVisible();
  }
  for (const row of [critical, resolved]) {
    expect(row).not.toHaveClass("is-unread");
    expect(
      within(row).queryByRole("button", { name: "Marcar como lida" }),
    ).toBeNull();
  }

  // A resolvida: classe própria, desfecho com a hora e o nome acessível de hoje.
  expect(resolved).toHaveClass("is-resolved");
  expect(
    within(resolved).getByText(
      /^Resolvido às \d{2}:\d{2} · a IA voltou a responder\.$/,
    ),
  ).toBeVisible();
  expect(critical).not.toHaveClass("is-resolved");

  // O link de cada notificação segue o de hoje.
  expect(within(attention).getByRole("link")).toHaveAttribute(
    "href",
    "/conversas/conversation-1",
  );
}

describe("Goal096 prova 3: a linha do NT1", () => {
  test("na página, cada nível tem a forma do quadro e nenhum selo de texto", async () => {
    renderNotificacoes();

    await screen.findByRole("listitem", { name: /^Atenção: / });
    expectNt1Rows(document.body);
  });

  test("a gaveta mostra as mesmas linhas", async () => {
    setViewport(WIDE);
    const user = userEvent.setup();
    renderHome();

    await user.click(
      await screen.findByRole("button", {
        name: /^Notificações, 2 não lidas$/,
      }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Notificações" });
    await within(drawer).findByRole("listitem", { name: /^Atenção: / });
    expectNt1Rows(drawer);
  });

  test("'Marcar como lida' marca só aquela notificação", async () => {
    const user = userEvent.setup();
    markRead.mockResolvedValue({ updated: 1 });
    renderNotificacoes();

    const row = await screen.findByRole("listitem", { name: /^Atenção: / });
    await user.click(
      within(row).getByRole("button", { name: "Marcar como lida" }),
    );

    await waitFor(() =>
      expect(markRead).toHaveBeenCalledWith({ id: "attention-unread" }),
    );
    await waitFor(() => expect(notificationsList).toHaveBeenCalledTimes(2));
  });
});

describe("Goal096 prova 4: a gaveta a partir de 1024 px", () => {
  test("a consulta da gaveta é a de lista e detalhe lado a lado", () => {
    expect(NOTIFICATIONS_DRAWER_QUERY).toBe("(min-width: 1024px)");
    expect(NOTIFICATIONS_DRAWER_QUERY).toBe(WIDE_LAYOUT_QUERY);
  });

  test("com a consulta de largura falsa, o sino é link para /notificacoes", async () => {
    setViewport(1023);
    renderHome();

    const bell = await screen.findByRole("link", {
      name: /^Notificações, 2 não lidas$/,
    });
    expect(bell).toHaveAttribute("href", "/notificacoes");
    expect(
      screen.queryByRole("button", { name: /^Notificações, 2 não lidas$/ }),
    ).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("com a consulta verdadeira, o sino é botão e abre o dialog sem navegar", async () => {
    setViewport(1024);
    const user = userEvent.setup();
    renderHome();

    expect(
      screen.queryByRole("link", { name: /^Notificações, 2 não lidas$/ }),
    ).toBeNull();
    const bell = await screen.findByRole("button", {
      name: /^Notificações, 2 não lidas$/,
    });
    await user.click(bell);

    const drawer = await screen.findByRole("dialog", { name: "Notificações" });
    expect(
      within(drawer).getByRole("button", { name: "Fechar" }),
    ).toBeVisible();
    expect(
      within(drawer).getByRole("button", { name: "Marcar lidas" }),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("Goal096 prova 5: uma só chamada de useShellConfig por árvore", () => {
  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)(
    "/conversas com o status pendente, com o C5 e com as abas, na faixa %s",
    async (_label, width) => {
      setViewport(width);

      statusGet.mockReturnValue(new Promise(() => undefined));
      const pending = renderConversas();
      await screen.findByRole("heading", { level: 1, name: "Conversas" });
      await waitFor(() => expect(shell.live.size).toBe(1));
      expect(shell.maxLive).toBe(1);
      pending.unmount();

      shell.maxLive = 0;
      statusGet.mockResolvedValue(statusFixture("DISCONNECTED"));
      const noWhatsapp = renderConversas();
      expect(
        await screen.findByRole("heading", { level: 2, name: C5_TITLE }),
      ).toBeVisible();
      expect(screen.queryByRole("tablist")).toBeNull();
      await waitFor(() => expect(shell.live.size).toBe(1));
      expect(shell.maxLive).toBe(1);
      noWhatsapp.unmount();

      shell.maxLive = 0;
      statusGet.mockResolvedValue(statusFixture("CONNECTED"));
      renderConversas();
      await screen.findByRole("tablist");
      await waitFor(() => expect(shell.live.size).toBe(1));
      expect(shell.maxLive).toBe(1);
    },
  );

  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)("/notificacoes na faixa %s", async (_label, width) => {
    setViewport(width);
    renderNotificacoes();

    await screen.findByRole("listitem", { name: /^Atenção: / });
    await waitFor(() => expect(shell.live.size).toBe(1));
    expect(shell.maxLive).toBe(1);
  });
});
