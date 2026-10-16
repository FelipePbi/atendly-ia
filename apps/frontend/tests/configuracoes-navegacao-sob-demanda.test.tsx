// @vitest-environment jsdom
/**
 * Configurações moram no layout do grupo `(configuracoes)` (SettingsWorkspace),
 * como Clientes, Serviços e Conversas: trocar de seção não remonta a lista de
 * Configurações, não passa por "Carregando configurações" e só busca o dado
 * da seção que abriu. Antes, cada seção relia as configurações, o WhatsApp e
 * as três leituras do hub (vídeo do usuário, 2026-10-16).
 *
 * Com a lista ao lado, o clique numa seção troca o painel com o crossfade da
 * View Transition `settings-swap`, também com movimento reduzido (D-173).
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  notifyRetentionChanged,
  type RetentionSettings,
  type SettingsState,
} from "@/data";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { SettingsWorkspace } from "@/features/settings/SettingsWorkspace";
import type { SettingsScenario } from "@/features/settings/types";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import type * as SystemStatusModule from "@/shared/runtime/systemStatus";

const settingsGet = vi.fn();
const whatsappGet = vi.fn();
const servicesList = vi.fn();
const importStateGet = vi.fn();
const retentionGet = vi.fn();
const routerPush = vi.fn();
const navigation = { pathname: "/configuracoes" };

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    migration: { getImportState: importStateGet },
    retention: { get: retentionGet },
    serviceCatalog: { list: servicesList },
    settings: { get: settingsGet },
    whatsapp: { get: whatsappGet },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
    session: { user: { email: "marina@studio.com" } },
  }),
}));

vi.mock("@/shared/runtime/systemStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof SystemStatusModule>();
  return {
    ...actual,
    useSystemStatus: () => ({
      ai: null,
      aiView: "active",
      phase: "loaded",
      whatsapp: null,
      whatsappView: "off",
    }),
  };
});

const SETTINGS: SettingsState = {
  ai: { enabled: true, tone: "CASUAL" },
  availability: null,
  business: {
    address: null,
    category: "Beleza",
    contextProjectionStatus: "PROJECTED",
    currency: "BRL",
    language: "pt-BR",
    modalities: ["ON_SITE"],
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
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  },
};

function retention(
  commercialRetentionDays: RetentionSettings["commercialRetentionDays"],
): RetentionSettings {
  return {
    appliesFrom: "NEXT_SWEEP",
    commercialRetentionDays,
    lastSweepCompletedAt: null,
    personalRetentionDays: 30,
    retentionDaysOptions: [30, 90, 180, 365],
    unclassifiedRetentionFollows: "COMMERCIAL",
  };
}

function setViewport(width: number, reducedMotion = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      const reduce = /prefers-reduced-motion:\s*reduce/.test(query);
      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: min ? width >= Number(min[1]) : reduce && reducedMotion,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    },
    writable: true,
  });
}

/** O que o App Router monta em cada rota: o layout persiste, a página troca. */
function route(pathname: string, scenario?: SettingsScenario) {
  navigation.pathname = pathname;
  return (
    <ShellConfigProvider>
      <SettingsWorkspace>
        <SettingsScreen key={pathname} scenario={scenario} />
      </SettingsWorkspace>
    </ShellConfigProvider>
  );
}

function settingsList() {
  return screen.getByRole("complementary", { name: "Configurações" });
}

beforeEach(() => {
  settingsGet.mockResolvedValue(SETTINGS);
  whatsappGet.mockResolvedValue(null);
  servicesList.mockResolvedValue({ items: [] });
  importStateGet.mockResolvedValue({ history: null, session: null });
  retentionGet.mockResolvedValue(retention(90));
});

afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(document, "startViewTransition");
});

describe("com a lista ao lado (1024 px ou mais)", () => {
  beforeEach(() => setViewport(1440));

  test("trocar de seção busca só a seção aberta e não remonta a lista", async () => {
    const view = render(route("/configuracoes/conversas", "conversations"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Conversas" }),
    ).toBeVisible();
    const list = settingsList();
    await waitFor(() => expect(retentionGet).toHaveBeenCalledTimes(2));

    view.rerender(route("/configuracoes/disponibilidade", "availability"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Disponibilidade" }),
    ).toBeVisible();
    expect(screen.queryByText("Carregando configurações")).toBeNull();

    view.rerender(route("/configuracoes/conversas", "conversations"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Conversas" }),
    ).toBeVisible();
    expect(screen.queryByText("Carregando configurações")).toBeNull();
    // Só a seção que abriu releu a retenção; o hub ao lado não.
    await waitFor(() => expect(retentionGet).toHaveBeenCalledTimes(3));

    // A lista é o mesmo elemento: não foi montada de novo.
    expect(settingsList()).toBe(list);
    // O comum foi lido uma vez para todas as seções.
    expect(settingsGet).toHaveBeenCalledTimes(1);
    expect(servicesList).toHaveBeenCalledTimes(1);
    expect(importStateGet).toHaveBeenCalledTimes(1);
    expect(whatsappGet).not.toHaveBeenCalled();
  });

  test("a linha do hub só relê a retenção quando ela muda", async () => {
    render(route("/configuracoes/disponibilidade", "availability"));
    expect(
      await screen.findByText("Guardar por 90 dias · pessoais por 30"),
    ).toBeVisible();
    expect(retentionGet).toHaveBeenCalledTimes(1);

    retentionGet.mockResolvedValue(retention(30));
    act(() => notifyRetentionChanged());

    expect(
      await screen.findByText("Guardar por 30 dias · pessoais por 30"),
    ).toBeVisible();
    expect(retentionGet).toHaveBeenCalledTimes(2);
    expect(settingsGet).toHaveBeenCalledTimes(1);
  });

  test("clicar numa seção troca o painel com crossfade, também com movimento reduzido", async () => {
    setViewport(1440, true);
    const classes: string[][] = [];
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => Promise<void> | void) => {
        classes.push(Array.from(document.documentElement.classList));
        void update();
        return { finished: Promise.resolve() };
      },
    });
    const view = render(route("/configuracoes/conversas", "conversations"));
    const user = userEvent.setup();
    await screen.findByRole("heading", { level: 1, name: "Conversas" });

    await user.click(await screen.findByRole("link", { name: /^Agenda/ }));

    expect(routerPush).toHaveBeenCalledWith("/configuracoes/agenda");
    expect(classes).toEqual([
      expect.arrayContaining(["is-view-transition", "vt-settings-swap"]),
    ]);
    // A rota nova monta e a foto nova é tirada; a classe sai depois.
    view.rerender(route("/configuracoes/disponibilidade", "availability"));
    await waitFor(() =>
      expect(document.documentElement).not.toHaveClass("vt-settings-swap"),
    );
  });
});

describe("no celular (abaixo de 1024 px)", () => {
  beforeEach(() => setViewport(390));

  test("ir à seção e voltar ao hub não relê as configurações nem mostra Carregando", async () => {
    const view = render(route("/configuracoes"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Configurações" }),
    ).toBeVisible();
    // Sem a lista ao lado, a seção não monta o hub.
    view.rerender(route("/configuracoes/disponibilidade", "availability"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Disponibilidade" }),
    ).toBeVisible();
    expect(screen.queryByRole("complementary")).toBeNull();

    view.rerender(route("/configuracoes"));
    expect(
      screen.getByRole("heading", { level: 1, name: "Configurações" }),
    ).toBeVisible();
    expect(screen.queryByText("Carregando configurações")).toBeNull();
    expect(settingsGet).toHaveBeenCalledTimes(1);
    expect(whatsappGet).not.toHaveBeenCalled();
  });
});
