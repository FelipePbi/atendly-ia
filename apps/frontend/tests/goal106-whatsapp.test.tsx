// @vitest-environment jsdom
/**
 * Goal106 — WhatsApp igual ao protótipo (Mais-WhatsApp:W1).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. W1 conectado (`/configuracoes/whatsapp`): iniciais e nome do negócio,
 *    telefone formatado, "Conectado desde 18/09" de `connectedAt` (e só
 *    "Conectado" sem ele), o bloco sem nome e sem iniciais quando
 *    `settings.business` falta; o cartão da IA por `settings.ai.enabled`
 *    (ligada, desligada com link para `/configuracoes/ia`, nenhum cartão
 *    quando nulo); as linhas, o texto de uso normal e "Desconectar WhatsApp";
 *    nada de "Uso pessoal", "Desconectar número" nem do `h2` "WhatsApp
 *    conectado".
 * 2. Ações: desconectar e trocar número pedem confirmação, "voltar" não envia
 *    nada, confirmar chama `whatsapp.disconnect` uma vez e a tela mostra o
 *    consentimento; a falha mantém a tela conectada com o alerta de hoje.
 * 3. Contatos ignorados: a linha abre a folha com o componente movido; marcar
 *    por telefone e por conversa usa os mesmos pedidos; fechar volta à tela.
 * 4. Onboarding intacto: `/onboarding/whatsapp-conectar` conectado mostra o
 *    corpo próprio do quadro 4.4 (Goal129), sem a identidade do W1; a etapa de contatos ignorados
 *    mostra o componente movido com os mesmos pedidos.
 * 5. Casca: uma chamada de `useShellConfig` por árvore em
 *    `/configuracoes/whatsapp`, conectado e desconectado, nas duas faixas, e
 *    "WhatsApp" marcado na lista do hub de 1024 px em diante.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pela comparação com o protótipo (`visual:compare`) e pelo gate renderizado.
 */

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type { OnboardingState, SettingsState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace }),
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
const migrationGetImportState = vi.fn();
const settingsGet = vi.fn();
const whatsappGet = vi.fn();
const whatsappDisconnect = vi.fn();
const conversationsList = vi.fn();
const setIgnored = vi.fn();
const ignoreByPhone = vi.fn();
const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const getActivationTest = vi.fn();
const logout = vi.fn();
const refreshSession = vi.fn();
const setUnauthenticated = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: { get: getActivationTest },
    auth: { logout },
    conversations: {
      ignoreByPhone,
      list: conversationsList,
      setIgnored,
    },
    knowledge: { getOtherInfo: knowledgeGetOtherInfo, list: knowledgeList },
    migration: { getImportState: migrationGetImportState },
    notifications: {
      getPreferences: notificationsGetPreferences,
      summary: notificationsSummary,
    },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: updateOnboarding,
    },
    retention: { get: retentionGet },
    serviceCatalog: { list: serviceCatalogList },
    settings: { get: settingsGet },
    status: { get: statusGet },
    whatsapp: {
      connect: vi.fn(),
      disconnect: whatsappDisconnect,
      get: whatsappGet,
      qr: vi.fn(),
      reconnect: vi.fn(),
    },
  }),
  useProductRuntime: () => ({
    refreshSession,
    session: {
      businessProfile: { businessName: "Negócio da sessão" },
      tenant: { name: "Negócio da sessão" },
      user: { email: "dona@studiomarina.com.br", name: "Marina Alves" },
    },
    setUnauthenticated,
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

type Scenario = Parameters<typeof SettingsScreen>[0]["scenario"];

const CONSENT_TEXT =
  "Entendo que as conversas deste número poderão ser processadas e armazenadas para oferecer os recursos da Avenly.";
const DISCONNECT_FAILURE = "Não foi possível desconectar o número.";

function connectionFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    connectedAt: "2026-09-18T15:00:00.000Z",
    id: "wa-1",
    phoneNumber: "5511987654321",
    status: "CONNECTED",
    updatedAt: "2026-09-27T12:00:00.000Z",
    ...overrides,
  };
}

function settingsFixture(
  ai: SettingsState["ai"] = { enabled: true, tone: "BALANCED" },
  business: SettingsState["business"] = {
    address: "Rua Um, 100",
    category: "Beleza",
    contextProjectionStatus: "PROJECTED",
    currency: "BRL",
    language: "pt-BR",
    modalities: ["ON_SITE"],
    name: "Studio Marina",
    timezone: "America/Sao_Paulo",
  },
): SettingsState {
  return {
    ai,
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
    business,
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

function aiNull(): SettingsState["ai"] {
  return { enabled: null, tone: "BALANCED" } as unknown as SettingsState["ai"];
}

function onboardingFixture(): OnboardingState {
  return {
    ai: { tone: "PROFESSIONAL" },
    availability: null,
    business: {
      address: null,
      category: "Beleza",
      modalities: ["ONLINE"],
      name: "Studio Aurora",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      integration: null,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
    completed: false,
    completedAt: null,
    service: {
      active: true,
      bufferAfterMinutes: 0,
      bufferBeforeMinutes: 0,
      durationMinutes: 60,
      id: "svc-1",
      name: "Corte",
      needsReview: false,
      price: 100,
      priceType: "FIXED",
    },
    whatsapp: { phoneNumber: "+5511987654321", status: "CONNECTED" },
  };
}

beforeEach(() => {
  shellCallers.clear();
  push.mockReset();
  replace.mockReset();
  for (const mock of [
    statusGet,
    notificationsSummary,
    notificationsGetPreferences,
    serviceCatalogList,
    retentionGet,
    knowledgeList,
    knowledgeGetOtherInfo,
    migrationGetImportState,
    settingsGet,
    whatsappGet,
    whatsappDisconnect,
    conversationsList,
    setIgnored,
    ignoreByPhone,
    getOnboarding,
    updateOnboarding,
    completeOnboarding,
    getActivationTest,
    logout,
    refreshSession,
    setUnauthenticated,
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
  migrationGetImportState.mockResolvedValue({ history: null, session: null });
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
  whatsappGet.mockResolvedValue(connectionFixture());
  whatsappDisconnect.mockResolvedValue(undefined);
  conversationsList.mockResolvedValue([]);
  getActivationTest.mockResolvedValue(null);
  getOnboarding.mockResolvedValue(onboardingFixture());
  updateOnboarding.mockResolvedValue(onboardingFixture());
  completeOnboarding.mockResolvedValue(onboardingFixture());
  refreshSession.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

async function renderSettings(
  scenario: Scenario,
  width: number,
  ready: string | RegExp,
) {
  setViewport(width);
  const utils = render(
    <PlatformLayout>
      <SettingsScreen scenario={scenario} />
    </PlatformLayout>,
  );
  await screen.findAllByText(ready, { exact: typeof ready !== "string" });
  return utils;
}

async function renderConnected(width = NARROW) {
  return renderSettings("whatsapp-connected", width, "Desconectar WhatsApp");
}

function swapRow(): HTMLElement {
  return screen.getByRole("button", { name: /^Trocar número/ });
}

function disconnectRow(): HTMLElement {
  return screen.getByRole("button", { name: /^Desconectar WhatsApp/ });
}

describe("Goal106 prova 1: W1 conectado em /configuracoes/whatsapp", () => {
  test("identidade: iniciais e nome do negócio, telefone formatado e 'Conectado desde 18/09'", async () => {
    await renderConnected();

    expect(screen.getByRole("heading", { level: 1, name: "WhatsApp" })).toBeVisible();
    expect(screen.getByText("SM")).toBeVisible();
    expect(screen.getByText("Studio Marina")).toBeVisible();
    expect(screen.getByText("+55 11 98765-4321")).toBeVisible();
    expect(screen.getByText("Conectado desde 18/09")).toBeVisible();
  });

  test("a data da pílula vem de connectedAt, não de updatedAt", async () => {
    whatsappGet.mockResolvedValue(
      connectionFixture({ connectedAt: "2026-08-05T15:00:00.000Z" }),
    );
    await renderConnected();

    expect(screen.getByText("Conectado desde 05/08")).toBeVisible();
    expect(screen.queryByText(/27\/09/)).toBeNull();
  });

  test("a data da pílula usa o fuso do negócio, não um fuso fixo", async () => {
    settingsGet.mockResolvedValue(
      settingsFixture(undefined, {
        address: "Rua Um, 100",
        category: "Beleza",
        contextProjectionStatus: "PROJECTED",
        currency: "BRL",
        language: "pt-BR",
        modalities: ["ON_SITE"],
        name: "Studio Marina",
        timezone: "Pacific/Auckland",
      }),
    );
    await renderConnected();

    expect(screen.getByText("Conectado desde 19/09")).toBeVisible();
    expect(screen.queryByText("Conectado desde 18/09")).toBeNull();
  });

  test("sem connectedAt a pílula diz só 'Conectado'", async () => {
    whatsappGet.mockResolvedValue(connectionFixture({ connectedAt: null }));
    await renderConnected();

    expect(screen.getByText("Conectado")).toBeVisible();
    expect(screen.queryByText(/Conectado desde/)).toBeNull();
  });

  test("sem settings.business, o bloco não mostra nome nem iniciais e mantém telefone e pílula", async () => {
    settingsGet.mockResolvedValue(settingsFixture(undefined, null));
    await renderConnected();

    expect(screen.queryByText("SM")).toBeNull();
    expect(screen.queryByText("Studio Marina")).toBeNull();
    expect(screen.getByText("+55 11 98765-4321")).toBeVisible();
    expect(screen.getByText("Conectado desde 18/09")).toBeVisible();
  });

  test("sem settings.business, a data da pílula cai no fuso America/Sao_Paulo, não em UTC", async () => {
    settingsGet.mockResolvedValue(settingsFixture(undefined, null));
    whatsappGet.mockResolvedValue(
      connectionFixture({ connectedAt: "2026-09-18T02:00:00.000Z" }),
    );
    await renderConnected();

    expect(screen.getByText("Conectado desde 17/09")).toBeVisible();
    expect(screen.queryByText(/18\/09/)).toBeNull();
  });

  test("sem phoneNumber, a linha do telefone não aparece", async () => {
    whatsappGet.mockResolvedValue(connectionFixture({ phoneNumber: null }));
    await renderConnected();

    expect(screen.queryByText(/\+55/)).toBeNull();
    expect(screen.getByText("Conectado desde 18/09")).toBeVisible();
  });

  test("com a IA ligada, o cartão diz 'IA ativa neste número'", async () => {
    await renderConnected();

    expect(screen.getByText("IA ativa neste número")).toBeVisible();
    expect(screen.queryByText("A IA não está atendendo neste número")).toBeNull();
  });

  test("sem a IA ligada, o cartão diz 'A IA não está atendendo neste número' e leva a /configuracoes/ia", async () => {
    settingsGet.mockResolvedValue(
      settingsFixture({ enabled: false, tone: "BALANCED" }),
    );
    await renderConnected();

    expect(screen.getByText("A IA não está atendendo neste número")).toBeVisible();
    expect(screen.queryByText("IA ativa neste número")).toBeNull();
    expect(screen.getByRole("link", { name: "Ver em IA" })).toHaveAttribute(
      "href",
      "/configuracoes/ia",
    );
  });

  test("com settings.ai.enabled nulo, nenhum cartão da IA aparece", async () => {
    settingsGet.mockResolvedValue(settingsFixture(aiNull()));
    await renderConnected();

    expect(screen.queryByText("IA ativa neste número")).toBeNull();
    expect(screen.queryByText("A IA não está atendendo neste número")).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver em IA" })).toBeNull();
  });

  test("linhas, texto de uso normal e área de atenção na ordem do quadro, sem o que o quadro tira", async () => {
    await renderConnected();

    const ignored = screen.getByRole("button", {
      name: /^Contatos que a IA nunca responde/,
    });
    const swap = swapRow();
    const note = screen.getByText(
      "Você pode continuar usando este WhatsApp normalmente. Quando você responde, a IA sai de cena naquela conversa.",
    );
    const disconnect = disconnectRow();

    expect(within(swap).getByText("Clientes, agenda e conversas continuam")).toBeVisible();
    expect(within(disconnect).getByText("Sua IA deixa de atender até conectar de novo")).toBeVisible();
    expect(within(ignored).queryByText(/Mãe|Dudu/)).toBeNull();

    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(ignored, swap)).toBe(true);
    expect(follows(swap, note)).toBe(true);
    expect(follows(note, disconnect)).toBe(true);

    expect(screen.queryByText(/Uso pessoal/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Desconectar número" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "WhatsApp conectado" })).toBeNull();
    expect(screen.queryByText("WhatsApp conectado")).toBeNull();
  });
});

describe("Goal106 prova 2: ações do W1", () => {
  test("'Desconectar WhatsApp' abre o diálogo de hoje e 'Manter conectado' não envia nada", async () => {
    const user = userEvent.setup();
    await renderConnected();

    await user.click(disconnectRow());
    const dialog = screen.getByRole("dialog", { name: "Desconectar o WhatsApp?" });
    expect(
      within(dialog).getByText(
        "O número +55 11 98765-4321 deixa de estar ligado à Avenly.",
      ),
    ).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Manter conectado" }));

    expect(whatsappDisconnect).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(disconnectRow()).toBeVisible();
  });

  test("confirmar a desconexão chama whatsapp.disconnect uma vez e a tela mostra o consentimento", async () => {
    const user = userEvent.setup();
    await renderConnected();

    await user.click(disconnectRow());
    const dialog = screen.getByRole("dialog", { name: "Desconectar o WhatsApp?" });
    await user.click(within(dialog).getByRole("button", { name: "Desconectar" }));

    expect(whatsappDisconnect).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("checkbox", { name: CONSENT_TEXT })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeVisible();
    expect(screen.queryByText("Conectado desde 18/09")).toBeNull();
  });

  test("'Trocar número' abre a confirmação e 'Cancelar' não envia nada", async () => {
    const user = userEvent.setup();
    await renderConnected();

    await user.click(swapRow());
    const dialog = screen.getByRole("dialog", { name: "Trocar número?" });
    expect(
      within(dialog).getByText(
        "Clientes, agenda e conversas continuam. O número atual é desconectado, e a IA para de atender até você conectar o novo.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Desconectar e trocar" })).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(whatsappDisconnect).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(swapRow()).toBeVisible();
  });

  test("confirmar a troca chama whatsapp.disconnect uma vez e a tela mostra o consentimento", async () => {
    const user = userEvent.setup();
    await renderConnected();

    await user.click(swapRow());
    const dialog = screen.getByRole("dialog", { name: "Trocar número?" });
    await user.click(within(dialog).getByRole("button", { name: "Desconectar e trocar" }));

    expect(whatsappDisconnect).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("checkbox", { name: CONSENT_TEXT })).not.toBeChecked();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Conectado desde 18/09")).toBeNull();
  });

  test("a falha de desconectar pelo diálogo mostra a mensagem de hoje e mantém a tela conectada", async () => {
    whatsappDisconnect.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderConnected();

    await user.click(disconnectRow());
    const dialog = screen.getByRole("dialog", { name: "Desconectar o WhatsApp?" });
    await user.click(within(dialog).getByRole("button", { name: "Desconectar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(DISCONNECT_FAILURE);
    expect(whatsappDisconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Conectado desde 18/09")).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: CONSENT_TEXT })).toBeNull();
  });

  test("a falha de desconectar pela troca mostra a mensagem de hoje e mantém a tela conectada", async () => {
    whatsappDisconnect.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderConnected();

    await user.click(swapRow());
    const dialog = screen.getByRole("dialog", { name: "Trocar número?" });
    await user.click(within(dialog).getByRole("button", { name: "Desconectar e trocar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(DISCONNECT_FAILURE);
    expect(whatsappDisconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Conectado desde 18/09")).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: CONSENT_TEXT })).toBeNull();
  });
});

describe("Goal106 prova 3: contatos ignorados em Configurações", () => {
  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      screen.getByRole("button", { name: /^Contatos que a IA nunca responde/ }),
    );
    return screen.getByRole("dialog", { name: "Contatos que a IA nunca responde" });
  }

  test("a linha abre a folha com o componente movido e 'Fechar' volta à tela", async () => {
    const user = userEvent.setup();
    await renderConnected();

    const sheet = await openSheet(user);
    expect(await within(sheet).findByText("Conversas já existentes")).toBeVisible();
    expect(within(sheet).getByText("Informar um número manualmente")).toBeVisible();
    expect(within(sheet).getByPlaceholderText("+55 11 99999-0000")).toBeVisible();

    await user.click(within(sheet).getByRole("button", { name: "Fechar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(disconnectRow()).toBeVisible();
    expect(whatsappDisconnect).not.toHaveBeenCalled();
  });

  test("marcar por telefone chama conversations.ignoreByPhone uma vez, com o número digitado", async () => {
    ignoreByPhone.mockResolvedValue({
      contactId: "contact-1",
      externalContactId: "5511977770000",
      ignored: true,
      ignoredAt: "2026-09-27T12:00:00.000Z",
    });
    const user = userEvent.setup();
    await renderConnected();

    const sheet = await openSheet(user);
    await user.type(
      within(sheet).getByPlaceholderText("+55 11 99999-0000"),
      "+55 11 97777-0000",
    );
    await user.click(within(sheet).getByRole("button", { name: "Adicionar" }));

    expect(ignoreByPhone).toHaveBeenCalledTimes(1);
    expect(ignoreByPhone).toHaveBeenCalledWith("+55 11 97777-0000", true, "SETTINGS");
    expect(await within(sheet).findByText("5511977770000 ignorado")).toBeVisible();
    expect(setIgnored).not.toHaveBeenCalled();
  });

  test("marcar uma conversa chama conversations.setIgnored uma vez", async () => {
    conversationsList.mockResolvedValue([
      { customerName: "Maria", externalContactId: "5511988880000", id: "conv-1" },
    ]);
    setIgnored.mockResolvedValue({});
    const user = userEvent.setup();
    await renderConnected();

    const sheet = await openSheet(user);
    await user.click(await within(sheet).findByRole("button", { name: "Ignorar" }));

    expect(setIgnored).toHaveBeenCalledTimes(1);
    expect(setIgnored).toHaveBeenCalledWith("conv-1", true, "CONVERSATION");
    expect(await within(sheet).findByRole("button", { name: "Ignorado" })).toBeDisabled();
    expect(ignoreByPhone).not.toHaveBeenCalled();
  });

  test("a falha de marcar mostra a mensagem de hoje dentro da folha", async () => {
    ignoreByPhone.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderConnected();

    const sheet = await openSheet(user);
    await user.type(
      within(sheet).getByPlaceholderText("+55 11 99999-0000"),
      "+55 11 97777-0000",
    );
    await user.click(within(sheet).getByRole("button", { name: "Adicionar" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Não foi possível marcar este número. Tente novamente.",
    );
  });
});

describe("Goal106 prova 4: onboarding intacto", () => {
  function renderOnboarding(scenario: string) {
    setViewport(NARROW);
    return render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario={scenario as never} />
      </OnboardingRuntimeProvider>,
    );
  }

  test("/onboarding/whatsapp-conectar conectado mostra o corpo do quadro 4.4, sem a identidade do W1", async () => {
    renderOnboarding("whatsapp-conectar");

    expect(await screen.findByText("WhatsApp conectado")).toBeVisible();
    expect(screen.getByRole("heading", { name: "WhatsApp conectado" })).toBeVisible();
    // Goal129 (quadro 4.4): o corpo conectado do onboarding é próprio; o
    // cartão e o "Desconectar número" de antes dão lugar à pergunta, ao
    // telefone e ao link de número errado.
    expect(
      screen.getByText("É este o número que seus clientes usam para falar com você?"),
    ).toBeVisible();
    expect(screen.getByText("+55 11 98765-4321")).toBeVisible();
    expect(screen.getByRole("button", { name: "Conectei o número errado" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sim, continuar" })).toBeVisible();

    expect(screen.queryByText(/Conectado desde/)).toBeNull();
    expect(screen.queryByText("IA ativa neste número")).toBeNull();
    expect(screen.queryByText("A IA não está atendendo neste número")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Trocar número/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Desconectar WhatsApp/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Contatos que a IA nunca responde/ }),
    ).toBeNull();
  });

  test("a etapa de contatos ignorados marca por telefone com o mesmo pedido", async () => {
    ignoreByPhone.mockResolvedValue({
      contactId: "contact-1",
      externalContactId: "5511977770000",
      ignored: true,
      ignoredAt: "2026-09-27T12:00:00.000Z",
    });
    const user = userEvent.setup();
    renderOnboarding("contatos-ignorados");

    await user.click(
      await screen.findByRole("button", { name: "Adicionar por telefone" }),
    );
    await user.type(
      screen.getByPlaceholderText("+55 11 99999-0000"),
      "+55 11 97777-0000",
    );
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(ignoreByPhone).toHaveBeenCalledTimes(1);
    expect(ignoreByPhone).toHaveBeenCalledWith("+55 11 97777-0000", true, "ONBOARDING");
    expect(
      await screen.findByRole("checkbox", { name: "+55 11 97777-0000" }),
    ).toBeChecked();
  });

  test("a etapa de contatos ignorados marca uma conversa com o mesmo pedido", async () => {
    conversationsList.mockResolvedValue([
      { customerName: "Maria", externalContactId: "5511988880000", id: "conv-1" },
    ]);
    setIgnored.mockResolvedValue({});
    const user = userEvent.setup();
    renderOnboarding("contatos-ignorados");

    await user.click(await screen.findByRole("checkbox", { name: "Maria" }));

    expect(setIgnored).toHaveBeenCalledTimes(1);
    expect(setIgnored).toHaveBeenCalledWith("conv-1", true, "ONBOARDING");
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Maria" })).toBeChecked(),
    );
  });
});

describe("Goal106 prova 5: casca de /configuracoes/whatsapp", () => {
  const STATES = [
    ["conectado", "whatsapp-connected"],
    ["desconectado", "whatsapp-disconnected"],
  ] as const;

  async function renderShell(
    state: (typeof STATES)[number][0],
    scenario: Scenario,
    width: number,
  ) {
    if (state === "desconectado") whatsappGet.mockResolvedValue(null);
    setViewport(width);
    const utils = render(
      <PlatformLayout>
        <SettingsScreen scenario={scenario} />
      </PlatformLayout>,
    );
    await screen.findAllByRole("heading", { level: 1 });
    await screen.findByRole(
      state === "conectado" ? "button" : "checkbox",
      state === "conectado"
        ? { name: /^Desconectar WhatsApp/ }
        : { name: CONSENT_TEXT },
    );
    return utils;
  }

  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)("uma chamada de useShellConfig por árvore, conectado e desconectado, na faixa %s", async (_label, width) => {
    for (const [state, scenario] of STATES) {
      shellCallers.clear();
      const { unmount } = await renderShell(state, scenario, width);
      await waitFor(() => {
        expect(shellCallers.size, state).toBe(1);
      });
      unmount();
    }
  });

  test.each(STATES)(
    "%s, de 1024 px em diante, a lista do hub tem 'WhatsApp' marcada e há um só h1",
    async (state, scenario) => {
      const { container } = await renderShell(state, scenario, WIDE);

      const list = container.querySelector<HTMLElement>(".list-detail-list");
      expect(list).not.toBeNull();
      expect(list).toHaveAttribute("aria-label", "Configurações");
      await waitFor(() => {
        const current = (list as HTMLElement).querySelectorAll('[aria-current="page"]');
        expect(current).toHaveLength(1);
        expect(current[0]?.textContent ?? "").toMatch(/^WhatsApp/);
      });
      expect(within(container).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    },
  );

  test.each(STATES)(
    "%s, abaixo de 1024 px, é tela empurrada sem a lista e há um só h1",
    async (state, scenario) => {
      const { container } = await renderShell(state, scenario, NARROW);

      expect(container.querySelector(".list-detail")).toBeNull();
      expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
      expect(within(container).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    },
  );
});
