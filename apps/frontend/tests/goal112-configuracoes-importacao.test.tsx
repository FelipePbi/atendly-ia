// @vitest-environment jsdom
/**
 * Goal112 — Configurações e Importação não perdem o que a pessoa fez ao cruzar
 * 1024 px.
 *
 * N1 (`/configuracoes/negocio`, campo em edição) e I2 (`/importacao`, fase das
 * credenciais) são renderizados na casca real do grupo `(platform)`. O
 * `matchMedia` daqui guarda os ouvintes e os dispara quando a largura muda,
 * como o navegador faz. A prova é por identidade de nó (`toBe`), por valor e
 * por foco, nos dois sentidos, e, na Importação, também quando `settings`
 * chega depois de a pessoa já ter avançado.
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type { ImportState, SettingsState } from "@/data";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
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
const notificationsGetPreferences = vi.fn();
const serviceCatalogList = vi.fn();
const retentionGet = vi.fn();
const knowledgeList = vi.fn();
const knowledgeGetOtherInfo = vi.fn();
const settingsGet = vi.fn();
const whatsappGet = vi.fn();
const conversationsList = vi.fn();
const getImportState = vi.fn();
const connectIntegration = vi.fn();
const startImport = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    calendar: { connectIntegration },
    conversations: { list: conversationsList },
    knowledge: { getOtherInfo: knowledgeGetOtherInfo, list: knowledgeList },
    migration: { getImportState, startImport },
    notifications: {
      getPreferences: notificationsGetPreferences,
      summary: notificationsSummary,
    },
    retention: { get: retentionGet },
    serviceCatalog: { list: serviceCatalogList },
    settings: { get: settingsGet },
    status: { get: statusGet },
    whatsapp: { get: whatsappGet },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
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

type Listener = () => void;

function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<Listener>();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: (_type: string, listener: Listener) => {
          listeners.add(listener);
        },
        get matches() {
          return min ? width >= Number(min[1]) : false;
        },
        media: query,
        removeEventListener: (_type: string, listener: Listener) => {
          listeners.delete(listener);
        },
      };
    },
    writable: true,
  });
  return {
    resize(next: number) {
      width = next;
      act(() => {
        for (const listener of Array.from(listeners)) listener();
      });
    },
  };
}

function settingsFixture(): SettingsState {
  return {
    ai: { enabled: true, tone: "BALANCED" },
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: [
        { active: true, dayOfWeek: 1, endTime: "18:00", id: "r1", startTime: "09:00" },
      ],
      timezone: "America/Sao_Paulo",
    },
    business: {
      address: "Rua Um, 100",
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
}

function emptyImportState(): ImportState {
  return {
    history: null,
    right: { available: true, completedAt: null, sessionId: null },
    session: null,
  };
}

beforeEach(() => {
  shellCallers.clear();
  for (const mock of [
    statusGet,
    notificationsSummary,
    notificationsGetPreferences,
    serviceCatalogList,
    retentionGet,
    knowledgeList,
    knowledgeGetOtherInfo,
    settingsGet,
    whatsappGet,
    conversationsList,
    getImportState,
    connectIntegration,
    startImport,
  ]) {
    mock.mockReset();
  }
  statusGet.mockResolvedValue({
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: false,
      effectiveEnabled: false,
      reconciled: "NOOP",
      state: "OFF",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-27T12:00:00.000Z",
      phoneNumber: "5511987654321",
      status: "CONNECTED",
    },
  });
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  notificationsGetPreferences.mockResolvedValue({ aiAppointmentCreated: false });
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [{ active: true, needsReview: false }],
    managedExternally: false,
    source: "AVENLY",
  });
  retentionGet.mockResolvedValue({
    appliesFrom: "NEXT_SWEEP",
    commercialRetentionDays: 90,
    lastSweepCompletedAt: null,
    personalRetentionDays: 30,
    retentionDaysOptions: [30, 90, 180, 365],
    unclassifiedRetentionFollows: "COMMERCIAL",
  });
  knowledgeList.mockResolvedValue([]);
  knowledgeGetOtherInfo.mockResolvedValue({ content: "" });
  settingsGet.mockResolvedValue(settingsFixture());
  whatsappGet.mockResolvedValue(null);
  conversationsList.mockResolvedValue([]);
  getImportState.mockResolvedValue(emptyImportState());
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

const DIRECTIONS = [
  ["estreito para largo e de volta", NARROW, WIDE],
  ["largo para estreito e de volta", WIDE, NARROW],
] as const;

const SPLIT = ".list-detail";

async function openCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Importar do Minha Agenda" }),
  );
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  return {
    email: await screen.findByLabelText("E-mail do Minha Agenda"),
    password: screen.getByLabelText("Senha do Minha Agenda"),
  };
}

describe("Goal112 N1: /configuracoes/negocio guarda o campo em edição", () => {
  test.each(DIRECTIONS)("%s", async (_name, from, to) => {
    const media = installMatchMedia(from);
    const user = userEvent.setup();
    render(
      <PlatformLayout>
        <ProductSettingsScreen scenario="business" />
      </PlatformLayout>,
    );

    await user.click(await screen.findByRole("button", { name: /^Nome/ }));
    const name = screen.getByLabelText("Nome do negócio");
    await user.type(name, " Centro");
    expect(name).toHaveValue("Studio Marina Centro");
    expect(name).toHaveFocus();

    media.resize(to);
    expect(screen.getByLabelText("Nome do negócio")).toBe(name);
    expect(name).toHaveValue("Studio Marina Centro");
    expect(name).toHaveFocus();
    expect(name.isConnected).toBe(true);

    media.resize(from);
    expect(screen.getByLabelText("Nome do negócio")).toBe(name);
    expect(name).toHaveValue("Studio Marina Centro");
    expect(name).toHaveFocus();
  });

  test("o hub, na faixa estreita, continua mostrando só a lista", async () => {
    installMatchMedia(NARROW);
    const { container } = render(
      <PlatformLayout>
        <ProductSettingsScreen scenario="hub" />
      </PlatformLayout>,
    );

    await screen.findByRole("heading", { level: 1, name: "Configurações" });
    expect(container.querySelector(".list-detail")).toBeNull();
    expect(container.querySelector(".list-detail-list")).toBeNull();
    expect(screen.queryByLabelText("Nome do negócio")).toBeNull();
  });
});

describe("Goal112 I2: /importacao guarda a fase e as credenciais", () => {
  test.each(DIRECTIONS)("%s", async (_name, from, to) => {
    const media = installMatchMedia(from);
    const user = userEvent.setup();
    render(
      <PlatformLayout>
        <ImportsScreen />
      </PlatformLayout>,
    );

    const { email, password } = await openCredentials(user);
    await user.type(email, "camila@example.com");
    await user.type(password, "super-secret");
    expect(password).toHaveFocus();

    media.resize(to);
    expect(screen.getByLabelText("E-mail do Minha Agenda")).toBe(email);
    expect(screen.getByLabelText("Senha do Minha Agenda")).toBe(password);
    expect(email).toHaveValue("camila@example.com");
    expect(password).toHaveValue("super-secret");
    expect(password).toHaveFocus();
    expect(
      screen.getByRole("heading", { name: "Entre no Minha Agenda" }),
    ).toBeVisible();

    media.resize(from);
    expect(screen.getByLabelText("E-mail do Minha Agenda")).toBe(email);
    expect(screen.getByLabelText("Senha do Minha Agenda")).toBe(password);
    expect(email).toHaveValue("camila@example.com");
    expect(password).toHaveValue("super-secret");
    expect(password).toHaveFocus();
    expect(connectIntegration).not.toHaveBeenCalled();
    expect(startImport).not.toHaveBeenCalled();
  });

  test("na faixa larga, com settings pendente: avançar, resolver settings e manter fase e valores", async () => {
    installMatchMedia(WIDE);
    const user = userEvent.setup();
    let resolveSettings: (state: SettingsState) => void = () => undefined;
    settingsGet.mockReturnValue(
      new Promise<SettingsState>((resolve) => {
        resolveSettings = resolve;
      }),
    );
    const { container } = render(
      <PlatformLayout>
        <ImportsScreen />
      </PlatformLayout>,
    );

    const { email, password } = await openCredentials(user);
    await user.type(email, "camila@example.com");
    await user.type(password, "super-secret");
    expect(container.querySelector(SPLIT)).toBeNull();
    expect(container.querySelector(".list-detail-list")).toBeNull();

    await act(async () => {
      resolveSettings(settingsFixture());
    });

    await waitFor(() => {
      expect(container.querySelector(".list-detail-list")).not.toBeNull();
    });
    expect(container.querySelector(".list-detail-list")).toHaveAttribute(
      "aria-label",
      "Configurações",
    );
    expect(screen.getByLabelText("E-mail do Minha Agenda")).toBe(email);
    expect(screen.getByLabelText("Senha do Minha Agenda")).toBe(password);
    expect(email).toHaveValue("camila@example.com");
    expect(password).toHaveValue("super-secret");
    expect(password).toHaveFocus();
    expect(
      screen.getByRole("heading", { name: "Entre no Minha Agenda" }),
    ).toBeVisible();
  });

  test("com settings falhando, a tela continua sozinha, sem erro novo", async () => {
    installMatchMedia(WIDE);
    const user = userEvent.setup();
    settingsGet.mockRejectedValue(new Error("falhou"));
    const { container } = render(
      <PlatformLayout>
        <ImportsScreen />
      </PlatformLayout>,
    );

    const { email } = await openCredentials(user);
    await user.type(email, "camila@example.com");
    await waitFor(() => expect(settingsGet).toHaveBeenCalled());

    expect(container.querySelector(SPLIT)).toBeNull();
    expect(container.querySelector(".list-detail-list")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("E-mail do Minha Agenda")).toBe(email);
    expect(email).toHaveValue("camila@example.com");
    expect(
      container.querySelectorAll("h1").length,
    ).toBe(1);
  });
});
