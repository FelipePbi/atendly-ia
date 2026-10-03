// @vitest-environment jsdom
/**
 * Goal088 — lista e detalhe (D-103): CL5, S4 e N1 e as listas CL1, S1 e hub.
 *
 * O que esta suíte prova, pelo que a usuária encontra, na casca real do grupo
 * `(platform)` e nas duas faixas de largura (matchMedia simulado):
 *
 * 1. de 1024 px em diante, as três rotas de detalhe mostram a lista ao lado do
 *    detalhe, com o item aberto marcado (`aria-current="page"`);
 * 2. de 1024 px em diante, as três listas mostram o painel vazio (ou, no hub,
 *    a seção Negócio) e nenhum item marcado quando não há item aberto;
 * 3. abaixo de 1024 px, as rotas de detalhe são tela empurrada: só o detalhe,
 *    com voltar de alvo claro, a casca sem barra de abas e sem botão flutuante;
 * 4. cada árvore chama `useShellConfig` uma única vez, nas duas faixas;
 * 5. abaixo de 1024 px nenhuma lista é montada nem buscada numa rota de
 *    detalhe; de 1024 px em diante cada lista busca uma vez.
 *
 * As subrotas de Configurações fora do Negócio seguem a mesma composição;
 * `/configuracoes/conversas` as representa nas provas 1, 3 e 4.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pela comparação com o protótipo e pelo gate renderizado (G-4 e G-5).
 */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactElement, useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type { CustomerDetail, Service, SettingsState } from "@/data";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import { ProductServicesScreen } from "@/features/services/ProductServicesScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const shellCallers = vi.hoisted(() => new Set<string>());

vi.mock("@/shared/layout/ShellConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof ShellConfigModule>();
  return {
    ...actual,
    useShellConfig: (config: ShellConfig) => {
      shellCallers.add(useId());
      actual.useShellConfig(config);
    },
  };
});

const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const customersGet = vi.fn();
const customersList = vi.fn();
const customersListMemory = vi.fn();
const calendarGetCalendar = vi.fn();
const conversationsList = vi.fn();
const serviceCatalogList = vi.fn();
const serviceCatalogGetAiInstruction = vi.fn();
const settingsGet = vi.fn();
const retentionGet = vi.fn();
const whatsappGet = vi.fn();
const migrationGetImportState = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    calendar: { getCalendar: calendarGetCalendar },
    conversations: { list: conversationsList },
    customers: {
      get: customersGet,
      list: customersList,
      listMemory: customersListMemory,
    },
    knowledge: {
      getOtherInfo: () => Promise.reject(new Error("fora do escopo")),
      list: () => Promise.reject(new Error("fora do escopo")),
    },
    migration: { getImportState: migrationGetImportState },
    notifications: { summary: notificationsSummary },
    serviceCatalog: {
      getAiInstruction: serviceCatalogGetAiInstruction,
      list: serviceCatalogList,
    },
    retention: { get: retentionGet },
    settings: { get: settingsGet },
    status: { get: statusGet },
    whatsapp: { get: whatsappGet },
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

function customerDetailFixture(): CustomerDetail {
  return {
    appointmentStats: {
      averageIntervalDays: 49,
      cancelled: 1,
      completed: 9,
      firstAppointmentDate: "2025-03-05",
      noShows: 0,
    },
    createdAt: "2025-01-10T10:00:00.000Z",
    id: "c1",
    lastAppointment: null,
    name: "Ana Paula",
    nextAppointment: null,
    notes: [],
    phone: "11991234567",
    primaryGuardian: null,
    tags: [],
  };
}

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    colorToken: null,
    description: null,
    durationMinutes: 45,
    id: "s1",
    name: "Corte",
    needsReview: false,
    price: 80,
    priceType: "FIXED",
    recurrenceIntervalDays: null,
    reviewOrigin: null,
    ...overrides,
  };
}

function settingsFixture(): SettingsState {
  return {
    ai: { enabled: false, tone: null },
    availability: null,
    business: {
      address: null,
      category: "Beleza",
      contextProjectionStatus: "PROJECTED",
      currency: "BRL",
      language: "pt-BR",
      modalities: ["ONLINE"],
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      capabilities: {
        createAppointments: true,
        manageAvailability: true,
        manageCustomers: true,
        manageServices: true,
        migrate: true,
      },
      integration: null,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
  };
}

type Route = {
  /** Texto que prova que o detalhe (ou a lista) carregou. */
  loaded: string;
  name: string;
  /** Item marcado na lista quando a rota é de detalhe. */
  open?: { listLabel: string; text: RegExp };
  screen: () => ReactElement;
};

const DETAIL_ROUTES: Array<Route & { back: { href: string; name: string } }> = [
  {
    back: { href: "/clientes", name: "Voltar para clientes" },
    loaded: "Ana Paula",
    name: "/clientes/detalhes",
    open: { listLabel: "Clientes", text: /Ana Paula/ },
    screen: () => <ProductCustomersScreen customerId="c1" scenario="detail" />,
  },
  {
    back: { href: "/servicos", name: "Voltar para serviços" },
    loaded: "Corte",
    name: "/servicos/editar",
    open: { listLabel: "Serviços", text: /Corte/ },
    screen: () => <ProductServicesScreen scenario="edit" serviceId="s1" />,
  },
  {
    back: { href: "/configuracoes", name: "Voltar para configurações" },
    loaded: "Negócio",
    name: "/configuracoes/negocio",
    open: { listLabel: "Configurações", text: /Negócio/ },
    screen: () => <SettingsScreen scenario="business" />,
  },
  {
    back: { href: "/configuracoes", name: "Voltar para configurações" },
    loaded: "Por quanto tempo guardar as mensagens",
    name: "/configuracoes/conversas",
    open: { listLabel: "Configurações", text: /Conversas/ },
    screen: () => <SettingsScreen scenario="conversations" />,
  },
];

const LIST_ROUTES: Array<Route & { empty?: string }> = [
  {
    empty: "Selecione um cliente para ver o perfil",
    loaded: "Ana Paula",
    name: "/clientes",
    screen: () => <ProductCustomersScreen scenario="list" />,
  },
  {
    empty: "Selecione um serviço",
    loaded: "Corte",
    name: "/servicos",
    screen: () => <ProductServicesScreen scenario="list" />,
  },
  {
    loaded: "Negócio",
    name: "/configuracoes",
    open: { listLabel: "Configurações", text: /Negócio/ },
    screen: () => <SettingsScreen scenario="hub" />,
  },
];

async function renderRoute(route: Route, width: number) {
  setViewport(width);
  const utils = render(<PlatformLayout>{route.screen()}</PlatformLayout>);
  await screen.findAllByText(route.loaded, { exact: false });
  return utils;
}

function listOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".list-detail-list");
}

function bottomNavOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('nav[class$="bottom-nav"]');
}

beforeEach(() => {
  shellCallers.clear();
  for (const mock of [
    statusGet,
    notificationsSummary,
    customersGet,
    customersList,
    customersListMemory,
    calendarGetCalendar,
    conversationsList,
    serviceCatalogList,
    serviceCatalogGetAiInstruction,
    settingsGet,
    retentionGet,
    whatsappGet,
    migrationGetImportState,
  ]) {
    mock.mockReset();
  }
  statusGet.mockResolvedValue({
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-27T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  });
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  customersGet.mockResolvedValue(customerDetailFixture());
  customersListMemory.mockResolvedValue([]);
  customersList.mockResolvedValue({
    items: [{ id: "c1", name: "Ana Paula", phone: "11991234567" }],
    managedExternally: false,
    source: "ATENDLY",
  });
  calendarGetCalendar.mockResolvedValue(settingsFixture().calendar);
  conversationsList.mockResolvedValue([]);
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [serviceFixture()],
    managedExternally: false,
    source: "ATENDLY",
  });
  serviceCatalogGetAiInstruction.mockResolvedValue({ content: "" });
  settingsGet.mockResolvedValue(settingsFixture());
  retentionGet.mockResolvedValue({
    appliesFrom: "NEXT_SWEEP",
    commercialRetentionDays: 90,
    lastSweepCompletedAt: null,
    personalRetentionDays: 30,
    retentionDaysOptions: [30, 90, 180, 365],
    unclassifiedRetentionFollows: "COMMERCIAL",
  });
  whatsappGet.mockResolvedValue(null);
  // Goal097: o hub do M1 lê o estado da importação para a linha Importação.
  migrationGetImportState.mockResolvedValue({ history: null, session: null });
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Goal088 prova 1: de 1024 px em diante, o detalhe vem ao lado da lista", () => {
  test.each(DETAIL_ROUTES)(
    "$name mostra a lista e o detalhe lado a lado, com o item aberto marcado",
    async (route) => {
      const { container } = await renderRoute(route, WIDE);

      const layout = container.querySelector(".list-detail");
      expect(layout).not.toBeNull();
      const list = listOf(container);
      expect(list).not.toBeNull();
      expect(list).toHaveAttribute("aria-label", route.open?.listLabel);
      const panel = layout?.querySelector(":scope > .list-detail-panel");
      expect(panel).not.toBeNull();
      expect(list?.parentElement).toBe(layout);

      await waitFor(() => {
        const current = Array.from(
          (list as HTMLElement).querySelectorAll('[aria-current="page"]'),
        );
        expect(current).toHaveLength(1);
        expect(
          `${current[0]?.getAttribute("aria-label") ?? ""} ${current[0]?.textContent ?? ""}`,
        ).toMatch(route.open?.text as RegExp);
      });
      expect(within(panel as HTMLElement).getAllByText(route.loaded, { exact: false }).length).toBeGreaterThan(0);
      expect(within(container).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    },
  );
});

describe("Goal088 prova 2: de 1024 px em diante, a lista sem item aberto", () => {
  test.each(LIST_ROUTES)(
    "$name mostra a lista ao lado do painel esperado",
    async (route) => {
      const { container } = await renderRoute(route, WIDE);

      const list = listOf(container) as HTMLElement;
      expect(list).not.toBeNull();
      const panel = container.querySelector(".list-detail-panel") as HTMLElement;
      expect(panel).not.toBeNull();

      if (route.empty) {
        expect(within(panel).getByText(route.empty)).toBeVisible();
        expect(list.querySelector('[aria-current="page"]')).toBeNull();
      } else {
        // Hub: a seção Negócio já ocupa o painel e está marcada na lista.
        expect(within(panel).getByRole("heading", { name: "Negócio" })).toBeVisible();
        const current = list.querySelectorAll('[aria-current="page"]');
        expect(current).toHaveLength(1);
        expect(current[0]?.textContent ?? "").toMatch(/Negócio/);
      }
      expect(within(container).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    },
  );
});

describe("Goal088 prova 3: abaixo de 1024 px, o detalhe é tela empurrada", () => {
  test.each(DETAIL_ROUTES)(
    "$name mostra só o detalhe, com voltar claro e a casca sem barra de abas",
    async (route) => {
      const { container } = await renderRoute(route, NARROW);

      expect(container.querySelector(".list-detail")).toBeNull();
      expect(listOf(container)).toBeNull();

      const back = within(container).getByRole("link", { name: route.back.name });
      expect(back).toHaveAttribute("href", route.back.href);

      expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
      expect(bottomNavOf(container)).toBeNull();
      expect(container.querySelector(".fab")).toBeNull();
    },
  );

  test.each(LIST_ROUTES)(
    "$name continua com a barra de abas: só o detalhe é tela empurrada",
    async (route) => {
      const { container } = await renderRoute(route, NARROW);

      expect(container.querySelector(".list-detail")).toBeNull();
      expect(container.querySelector(".app-frame.is-pushed")).toBeNull();
      expect(bottomNavOf(container)).not.toBeNull();
    },
  );

  test("de 1024 px em diante, o detalhe mantém a casca completa", async () => {
    const route = DETAIL_ROUTES[0] as Route;
    const { container } = await renderRoute(route, WIDE);
    expect(container.querySelector(".app-frame.is-pushed")).toBeNull();
    expect(bottomNavOf(container)).not.toBeNull();
  });
});

describe("Goal088 prova 4: uma só chamada de useShellConfig por árvore", () => {
  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)("nas sete rotas, na faixa %s", async (_label, width) => {
    for (const route of [...DETAIL_ROUTES, ...LIST_ROUTES]) {
      shellCallers.clear();
      const { unmount } = await renderRoute(route, width);
      await waitFor(() => {
        expect(shellCallers.size, route.name).toBe(1);
      });
      unmount();
    }
  });
});

describe("Goal088 prova 5: a lista só existe onde cabe", () => {
  test.each([
    ["≥1024", 1, WIDE],
    ["<1024", 0, NARROW],
  ] as const)(
    "/clientes/detalhes na faixa %s busca a lista %s vez(es)",
    async (_label, calls, width) => {
      await renderRoute(DETAIL_ROUTES[0], width);
      if (calls > 0) {
        await waitFor(() => expect(customersList).toHaveBeenCalledTimes(calls));
      }
      expect(customersList).toHaveBeenCalledTimes(calls);
      expect(customersGet).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    ["≥1024", 2, WIDE],
    ["<1024", 1, NARROW],
  ] as const)(
    "/servicos/editar na faixa %s lê o catálogo %s vez(es): o formulário e, se couber, a lista",
    async (_label, calls, width) => {
      await renderRoute(DETAIL_ROUTES[1], width);
      await waitFor(() => expect(serviceCatalogList).toHaveBeenCalledTimes(calls));
      expect(serviceCatalogList).toHaveBeenCalledTimes(calls);
    },
  );

  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)(
    "/configuracoes/negocio na faixa %s lê as configurações uma vez",
    async (_label, width) => {
      await renderRoute(DETAIL_ROUTES[2], width);
      expect(settingsGet).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    ["/clientes", customersList, LIST_ROUTES[0]],
    ["/servicos", serviceCatalogList, LIST_ROUTES[1]],
  ] as const)(
    "%s busca a própria lista uma vez, nas duas faixas",
    async (_name, mock, route) => {
      for (const width of [WIDE, NARROW]) {
        mock.mockClear();
        const { unmount } = await renderRoute(route, width);
        expect(mock).toHaveBeenCalledTimes(1);
        unmount();
      }
    },
  );
});
