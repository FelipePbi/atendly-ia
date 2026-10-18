// @vitest-environment jsdom
/**
 * Goal104 — IA, Conversas e Conta iguais ao protótipo (IA1, R1, Mais-WhatsApp:C1).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. IA1 (`/configuracoes/ia`): o `h1` "IA"; "IA ativa" com "Pausar" que abre o
 *    diálogo e pausa pelo pedido de hoje; sem a IA ligada, os textos, as ações
 *    e o "Teste real" de hoje; "Jeito de falar" com os três exemplos, em que
 *    escolher envia um único `PATCH /v1/settings/ai` com o `enabled` lido e a
 *    falha volta ao tom gravado; o interruptor do aviso, que lê e grava
 *    `aiAppointmentCreated` e some quando a leitura falha; as duas colunas do
 *    contrato; os dois links; nenhum texto do conhecimento na tela.
 * 2. Conhecimento em Negócio: a rota nova mostra as duas seções como tela
 *    empurrada, com voltar para Negócio; no N1, as duas linhas apontam para ela
 *    e resumem o que foi lido, sem inventar valor quando a leitura falha ou
 *    ainda chega.
 * 3. R1 (`/configuracoes/conversas`): dois grupos de rádio com o valor lido e as
 *    opções do servidor, um "Salvar" que grava os dois prazos num só pedido, a
 *    confirmação ao reduzir, a falha sem perder a escolha, a lista "O que não é
 *    afetado" e a nota de U-01.
 * 4. Conta (`/configuracoes/conta`): grupos e linhas, folhas de nome e de senha
 *    com os pedidos e as mensagens de hoje, "Sair" de Segurança só depois da
 *    confirmação, links de "Sobre", os quatro estados da exclusão e nenhum
 *    "Sair da conta". Desde o Goal124 a linha "Excluir conta" é um link para
 *    `/configuracoes/conta/excluir`, que tem a suíte própria do C2. Desde a
 *    D-193 ela é a última linha da tela, uma linha como as outras, e não o
 *    cartão de perigo no pé.
 * 5. Casca: uma chamada de `useShellConfig` por árvore renderizada nas quatro
 *    rotas, nas duas faixas, e a rota nova marcando "Negócio" na lista.
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
import { BffHttpError, type KnowledgeDocument, type SettingsState } from "@/data";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace }),
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
const notificationsUpdatePreferences = vi.fn();
const serviceCatalogList = vi.fn();
const migrationGetImportState = vi.fn();
const retentionGet = vi.fn();
const retentionUpdate = vi.fn();
const settingsGet = vi.fn();
const updateAi = vi.fn();
const getActivationTest = vi.fn();
const whatsappGet = vi.fn();
const knowledgeList = vi.fn();
const knowledgeGetOtherInfo = vi.fn();
const updateProfile = vi.fn();
const changePassword = vi.fn();
const logout = vi.fn();
const logoutAllDevices = vi.fn();
const requestDeletion = vi.fn();
const cancelDeletion = vi.fn();
const refreshSession = vi.fn();
const setUnauthenticated = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    account: { cancelDeletion, requestDeletion, updateProfile },
    activationTest: { get: getActivationTest },
    auth: { changePassword, logout, logoutAllDevices },
    knowledge: {
      create: vi.fn(),
      getOtherInfo: knowledgeGetOtherInfo,
      list: knowledgeList,
    },
    migration: { getImportState: migrationGetImportState },
    notifications: {
      getPreferences: notificationsGetPreferences,
      summary: notificationsSummary,
      updatePreferences: notificationsUpdatePreferences,
    },
    retention: { get: retentionGet, update: retentionUpdate },
    serviceCatalog: { list: serviceCatalogList },
    settings: { get: settingsGet, updateAi },
    status: { get: statusGet },
    whatsapp: { get: whatsappGet },
  }),
  useProductRuntime: () => ({
    refreshSession,
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
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

async function renderRoute(
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

function statusFixture(
  accountDeletion: { dueAt: string | null; status: string } = {
    dueAt: null,
    status: "NONE",
  },
) {
  return {
    accountDeletion,
    ai: {
      desiredEnabled: false,
      effectiveEnabled: false,
      reconciled: "NOOP",
      state: "OFF",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-27T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  };
}

function settingsFixture(
  ai: SettingsState["ai"] = { enabled: true, tone: "BALANCED" },
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

function documentFixture(
  overrides: Partial<KnowledgeDocument> = {},
): KnowledgeDocument {
  return {
    checksum: "chk-1",
    createdAt: "2026-09-01T10:00:00.000Z",
    id: "doc-1",
    serviceId: null,
    source: "MANUAL",
    status: "ACTIVE",
    title: "Horário de funcionamento",
    type: "FAQ",
    updatedAt: "2026-09-01T10:00:00.000Z",
    version: "1",
    ...overrides,
  };
}

function retentionFixture(
  overrides: Partial<{
    commercialRetentionDays: number;
    personalRetentionDays: number;
    retentionDaysOptions: number[];
  }> = {},
) {
  return {
    appliesFrom: "NEXT_SWEEP",
    commercialRetentionDays: 90,
    lastSweepCompletedAt: null,
    personalRetentionDays: 30,
    retentionDaysOptions: [30, 90, 180, 365],
    unclassifiedRetentionFollows: "COMMERCIAL",
    ...overrides,
  };
}

beforeEach(() => {
  shellCallers.clear();
  replace.mockReset();
  for (const mock of [
    statusGet,
    notificationsSummary,
    notificationsGetPreferences,
    notificationsUpdatePreferences,
    serviceCatalogList,
    migrationGetImportState,
    retentionGet,
    retentionUpdate,
    settingsGet,
    updateAi,
    getActivationTest,
    whatsappGet,
    knowledgeList,
    knowledgeGetOtherInfo,
    updateProfile,
    changePassword,
    logout,
    logoutAllDevices,
    requestDeletion,
    cancelDeletion,
    refreshSession,
    setUnauthenticated,
  ]) {
    mock.mockReset();
  }
  statusGet.mockResolvedValue(statusFixture());
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
  retentionGet.mockResolvedValue(retentionFixture());
  settingsGet.mockResolvedValue(settingsFixture());
  getActivationTest.mockResolvedValue(null);
  whatsappGet.mockResolvedValue({
    phoneNumber: "5511999990000",
    status: "CONNECTED",
  });
  knowledgeList.mockResolvedValue([documentFixture()]);
  knowledgeGetOtherInfo.mockResolvedValue({ content: "" });
  refreshSession.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

const AI_READY = "Jeito de falar";

function toneGroup(): HTMLElement {
  return screen.getByRole("radiogroup", { name: "Jeito de falar" });
}

describe("Goal104 prova 1: IA1 em /configuracoes/ia", () => {
  test("o h1 é 'IA' e, com a IA ligada, o cartão diz 'IA ativa', 'Atendendo pelo WhatsApp' e oferece 'Pausar'", async () => {
    await renderRoute("ai", NARROW, AI_READY);

    expect(screen.getByRole("heading", { level: 1, name: "IA" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "IA ativa" })).toBeVisible();
    expect(screen.getByText("Atendendo pelo WhatsApp")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Teste real" })).toBeNull();
  });

  test("'Pausar' abre o diálogo e confirmar pausa pelo pedido de hoje, uma vez, com o tom lido", async () => {
    updateAi.mockResolvedValue(settingsFixture({ enabled: false, tone: "BALANCED" }));
    const user = userEvent.setup();
    await renderRoute("ai", NARROW, AI_READY);

    await user.click(screen.getByRole("button", { name: "Pausar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Pausar atendimento automático?",
    });
    expect(updateAi).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Pausar atendimento" }),
    );

    await waitFor(() => expect(updateAi).toHaveBeenCalledTimes(1));
    expect(updateAi).toHaveBeenCalledWith({ enabled: false, tone: "BALANCED" });
    expect(await screen.findByText("Atendimento automático pausado.")).toBeVisible();
  });

  test("sem a IA ligada e com WhatsApp conectado: texto de hoje e o 'Teste real'", async () => {
    settingsGet.mockResolvedValue(settingsFixture({ enabled: false, tone: "BALANCED" }));
    await renderRoute("ai", NARROW, "Teste real");

    expect(screen.getByRole("heading", { level: 1, name: "IA" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "IA desligada" })).toBeVisible();
    expect(
      screen.getByText(/A IA só liga depois do teste real\. Quando o teste terminar bem/),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Teste real" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Pausar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Conectar WhatsApp" })).toBeNull();
  });

  test("sem a IA ligada e sem WhatsApp: leva a 'Conectar WhatsApp', sem 'Teste real'", async () => {
    settingsGet.mockResolvedValue(settingsFixture({ enabled: false, tone: "BALANCED" }));
    whatsappGet.mockResolvedValue(null);
    await renderRoute("ai", NARROW, "Conectar WhatsApp");

    expect(screen.getByRole("link", { name: "Conectar WhatsApp" })).toHaveAttribute(
      "href",
      "/configuracoes/whatsapp",
    );
    expect(screen.getByText(/o teste precisa do seu WhatsApp conectado/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Teste real" })).toBeNull();
  });

  test("com a leitura do teste falhando: 'Tentar novamente' e o aria-busy do cartão", async () => {
    settingsGet.mockResolvedValue(settingsFixture({ enabled: false, tone: "BALANCED" }));
    getActivationTest.mockRejectedValue(new Error("falhou"));
    await renderRoute("ai", NARROW, "Tentar novamente");

    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    const card = screen
      .getByRole("heading", { name: "Atendimento automático" })
      .closest("section") as HTMLElement;
    expect(card).toHaveAttribute("aria-busy", "false");
  });

  test("enquanto o estado do atendimento é lido, o cartão fica aria-busy", async () => {
    settingsGet.mockResolvedValue(settingsFixture({ enabled: false, tone: "BALANCED" }));
    getActivationTest.mockReturnValue(new Promise(() => undefined));
    await renderRoute("ai", NARROW, AI_READY);

    const card = screen
      .getByRole("heading", { name: "Atendimento automático" })
      .closest("section") as HTMLElement;
    expect(card).toHaveAttribute("aria-busy", "true");
  });

  test("'Jeito de falar': grupo de rádio com os três exemplos e o tom gravado marcado, sem 'Salvar'", async () => {
    settingsGet.mockResolvedValue(settingsFixture({ enabled: true, tone: "CASUAL" }));
    await renderRoute("ai", NARROW, AI_READY);

    const group = toneGroup();
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: /^Profissional/ })).not.toBeChecked();
    expect(within(group).getByRole("radio", { name: /^Equilibrada/ })).not.toBeChecked();
    expect(within(group).getByRole("radio", { name: /^Descontraída/ })).toBeChecked();
    expect(within(group).getByText("“Olá! Gostaria de agendar um horário?”")).toBeVisible();
    expect(within(group).getByText("“Oi! Quer marcar um horário? 😊”")).toBeVisible();
    expect(within(group).getByText("“Oiii! Bora marcar? 😄”")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Salvar/ })).toBeNull();
  });

  test("escolher um tom envia um único PATCH com o enabled lido e o tom novo", async () => {
    updateAi.mockResolvedValue(settingsFixture({ enabled: true, tone: "PROFESSIONAL" }));
    const user = userEvent.setup();
    await renderRoute("ai", NARROW, AI_READY);

    await user.click(within(toneGroup()).getByRole("radio", { name: /^Profissional/ }));

    await waitFor(() => expect(updateAi).toHaveBeenCalledTimes(1));
    expect(updateAi).toHaveBeenCalledWith({ enabled: true, tone: "PROFESSIONAL" });
    await waitFor(() =>
      expect(
        within(toneGroup()).getByRole("radio", { name: /^Profissional/ }),
      ).toBeChecked(),
    );
  });

  test("com a IA pausada, escolher um tom leva enabled false, nunca liga a IA", async () => {
    settingsGet.mockResolvedValue(settingsFixture({ enabled: false, tone: "BALANCED" }));
    updateAi.mockResolvedValue(settingsFixture({ enabled: false, tone: "CASUAL" }));
    const user = userEvent.setup();
    await renderRoute("ai", NARROW, AI_READY);

    await user.click(within(toneGroup()).getByRole("radio", { name: /^Descontraída/ }));

    await waitFor(() => expect(updateAi).toHaveBeenCalledTimes(1));
    expect(updateAi).toHaveBeenCalledWith({ enabled: false, tone: "CASUAL" });
  });

  test("enquanto grava, as opções ficam desabilitadas", async () => {
    let finish: (state: SettingsState) => void = () => undefined;
    updateAi.mockReturnValue(
      new Promise<SettingsState>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderRoute("ai", NARROW, AI_READY);

    await user.click(within(toneGroup()).getByRole("radio", { name: /^Descontraída/ }));

    await waitFor(() =>
      expect(within(toneGroup()).getByRole("radio", { name: /^Profissional/ })).toBeDisabled(),
    );
    finish(settingsFixture({ enabled: true, tone: "CASUAL" }));
    await waitFor(() =>
      expect(within(toneGroup()).getByRole("radio", { name: /^Profissional/ })).toBeEnabled(),
    );
  });

  test("a falha volta ao tom gravado e mostra o erro em role=status", async () => {
    updateAi.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderRoute("ai", NARROW, AI_READY);

    await user.click(within(toneGroup()).getByRole("radio", { name: /^Descontraída/ }));

    const status = await screen.findByText("Não foi possível salvar o estilo.");
    expect(status).toHaveAttribute("role", "status");
    expect(within(toneGroup()).getByRole("radio", { name: /^Equilibrada/ })).toBeChecked();
    expect(within(toneGroup()).getByRole("radio", { name: /^Descontraída/ })).not.toBeChecked();
  });

  test("o interruptor do aviso lê aiAppointmentCreated e grava a mudança", async () => {
    notificationsUpdatePreferences.mockResolvedValue({ aiAppointmentCreated: true });
    const user = userEvent.setup();
    await renderRoute("ai", NARROW, AI_READY);

    const toggle = await screen.findByRole("checkbox", {
      name: /Avisar quando a IA marcar um horário/,
    });
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(
        "Desligado por padrão: você só recebe aviso quando algo precisa de você.",
      ),
    ).toBeVisible();
    await user.click(toggle);

    await waitFor(() => expect(notificationsUpdatePreferences).toHaveBeenCalledTimes(1));
    expect(notificationsUpdatePreferences).toHaveBeenCalledWith({
      aiAppointmentCreated: true,
    });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  test("o interruptor reflete a preferência ligada e a falha de gravação mostra erro", async () => {
    notificationsGetPreferences.mockResolvedValue({ aiAppointmentCreated: true });
    notificationsUpdatePreferences.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderRoute("ai", NARROW, AI_READY);

    const toggle = await screen.findByRole("checkbox", {
      name: /Avisar quando a IA marcar um horário/,
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    expect(await screen.findByText("Não foi possível salvar o aviso.")).toBeVisible();
    expect(toggle).toBeChecked();
  });

  test("enquanto a preferência carrega há esqueleto, e com a leitura falhando a linha não aparece", async () => {
    notificationsGetPreferences.mockReturnValue(new Promise(() => undefined));
    const { container, unmount } = await renderRoute("ai", NARROW, AI_READY);
    expect(container.querySelector(".ai-notice-skeleton")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.queryByText("Avisar quando a IA marcar um horário")).toBeNull();
    unmount();

    notificationsGetPreferences.mockRejectedValue(new Error("falhou"));
    const second = await renderRoute("ai", NARROW, AI_READY);
    await waitFor(() =>
      expect(second.container.querySelector(".ai-notice-skeleton")).toBeNull(),
    );
    expect(screen.queryByText("Avisar quando a IA marcar um horário")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("o contrato tem as duas colunas, 'Sozinha, ela' e 'Nunca'", async () => {
    await renderRoute("ai", NARROW, AI_READY);

    const can = screen.getByRole("heading", { name: "Sozinha, ela" });
    const never = screen.getByRole("heading", { name: "Nunca" });
    expect(can.parentElement).toHaveTextContent(/marca, remarca e cancela dentro dos seus horários/);
    expect(never.parentElement).toHaveTextContent(/dá desconto ou encaixe/);
    expect(can.parentElement).not.toBe(never.parentElement);
  });

  test("as duas linhas de link levam a Negócio › Perguntas frequentes e a WhatsApp, sem contagem", async () => {
    await renderRoute("ai", NARROW, AI_READY);

    const faq = screen.getByRole("link", { name: /O que ela sabe responder/ });
    expect(faq).toHaveAttribute("href", "/configuracoes/negocio/perguntas-frequentes");
    expect(faq).toHaveTextContent("Negócio");
    const never = screen.getByRole("link", { name: /Quem ela nunca responde/ });
    expect(never).toHaveAttribute("href", "/configuracoes/whatsapp");
    expect(never).toHaveTextContent(/WhatsApp$/);
    expect(never.textContent).not.toMatch(/\d/);
  });

  test("nenhum texto de KnowledgeSection nem de OtherInfoSection aparece na tela", async () => {
    await renderRoute("ai", NARROW, AI_READY);

    expect(screen.queryByText("Conhecimento do negócio")).toBeNull();
    expect(screen.queryByText("Outras informações importantes")).toBeNull();
    expect(screen.queryByRole("button", { name: "Novo documento" })).toBeNull();
    expect(knowledgeList).not.toHaveBeenCalled();
    expect(knowledgeGetOtherInfo).not.toHaveBeenCalled();
  });

  test("a recusa por falta de teste ainda relê o estado, e não vira erro genérico", async () => {
    settingsGet
      .mockResolvedValueOnce(settingsFixture({ enabled: false, tone: "BALANCED" }))
      .mockResolvedValue(settingsFixture({ enabled: false, tone: "BALANCED" }));
    updateAi.mockRejectedValue(
      new BffHttpError({
        code: "AI_ACTIVATION_TEST_REQUIRED",
        message: "sem teste",
        requestId: "req-1",
        status: 409,
      }),
    );
    const user = userEvent.setup();
    await renderRoute("ai", NARROW, "Teste real");

    await user.click(within(toneGroup()).getByRole("radio", { name: /^Descontraída/ }));

    expect(
      await screen.findByText(/A IA só liga depois de um teste real que terminou bem/),
    ).toBeVisible();
    expect(screen.queryByText("Não foi possível salvar o estilo.")).toBeNull();
  });
});

const FAQ_HREF = "/configuracoes/negocio/perguntas-frequentes";

function businessRow(label: string): HTMLElement {
  const labelNode = screen.getByText(label, { selector: ".business-row-label" });
  return labelNode.closest(".business-row") as HTMLElement;
}

describe("Goal104 prova 2: conhecimento em Negócio", () => {
  test("a rota nova mostra as duas seções como tela empurrada, com voltar para Negócio", async () => {
    const { container } = await renderRoute(
      "business-faq",
      NARROW,
      "Conhecimento do negócio",
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Perguntas frequentes" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Conhecimento do negócio" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Outras informações importantes" }),
    ).toBeVisible();
    expect(container.querySelector("#outras-informacoes")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Voltar para Negócio" })).toHaveAttribute(
      "href",
      "/configuracoes/negocio",
    );
    expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
    expect(container.querySelector(".list-detail")).toBeNull();
  });

  test("no N1, as duas linhas são links para a rota nova (a segunda com âncora)", async () => {
    await renderRoute("business", NARROW, "O que a IA sabe responder");

    const faq = businessRow("Perguntas frequentes");
    expect(faq.tagName).toBe("A");
    expect(faq).toHaveAttribute("href", FAQ_HREF);
    const other = businessRow("Outras informações");
    expect(other.tagName).toBe("A");
    expect(other).toHaveAttribute("href", `${FAQ_HREF}#outras-informacoes`);
  });

  test("resumo de Perguntas frequentes: zero vira 'Não informado'", async () => {
    knowledgeList.mockResolvedValue([]);
    await renderRoute("business", NARROW, "O que a IA sabe responder");

    await waitFor(() =>
      expect(businessRow("Perguntas frequentes")).toHaveTextContent("Não informado"),
    );
    expect(
      businessRow("Perguntas frequentes").querySelector(".business-row-value"),
    ).toHaveClass("is-empty");
  });

  test("resumo de Perguntas frequentes: um item é '1 item'", async () => {
    knowledgeList.mockResolvedValue([documentFixture()]);
    await renderRoute("business", NARROW, "O que a IA sabe responder");

    await waitFor(() =>
      expect(businessRow("Perguntas frequentes")).toHaveTextContent("1 item"),
    );
    expect(businessRow("Perguntas frequentes")).not.toHaveTextContent("1 itens");
  });

  test("resumo de Perguntas frequentes: vários itens, sem contar BUSINESS_INFO nem inativos", async () => {
    knowledgeList.mockResolvedValue([
      documentFixture({ id: "a" }),
      documentFixture({ id: "b" }),
      documentFixture({ id: "c", type: "SERVICE_DETAIL" as KnowledgeDocument["type"] }),
      documentFixture({ id: "d", type: "BUSINESS_INFO" as KnowledgeDocument["type"] }),
      documentFixture({ id: "e", status: "INACTIVE" as KnowledgeDocument["status"] }),
    ]);
    await renderRoute("business", NARROW, "O que a IA sabe responder");

    await waitFor(() =>
      expect(businessRow("Perguntas frequentes")).toHaveTextContent("3 itens"),
    );
  });

  test("resumo de Outras informações: o começo do texto, com espaços colapsados e no máximo 120 caracteres", async () => {
    knowledgeGetOtherInfo.mockResolvedValue({
      content: `  Aceitamos   pix\n e cartão. ${"x".repeat(200)}`,
    });
    await renderRoute("business", NARROW, "O que a IA sabe responder");

    const text = await waitFor(() => {
      const node = businessRow("Outras informações").querySelector(".business-row-text");
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(text.textContent).toMatch(/^Aceitamos pix e cartão\. x+$/);
    expect(text.textContent?.length).toBe(120);
  });

  test("resumo de Outras informações: texto vazio vira 'Não informado'", async () => {
    knowledgeGetOtherInfo.mockResolvedValue({ content: "   \n " });
    await renderRoute("business", NARROW, "O que a IA sabe responder");

    await waitFor(() =>
      expect(businessRow("Outras informações")).toHaveTextContent("Não informado"),
    );
  });

  test("com cada leitura falhando, a linha fica sem a segunda linha e nunca com 'Não informado'", async () => {
    knowledgeList.mockRejectedValue(new Error("falhou"));
    knowledgeGetOtherInfo.mockRejectedValue(new Error("falhou"));
    await renderRoute("business", NARROW, "O que a IA sabe responder");

    await waitFor(() => expect(knowledgeList).toHaveBeenCalled());
    await waitFor(() => expect(knowledgeGetOtherInfo).toHaveBeenCalled());
    for (const label of ["Perguntas frequentes", "Outras informações"]) {
      const rowNode = businessRow(label);
      expect(rowNode.querySelector(".business-row-text")).toBeNull();
      expect(rowNode).not.toHaveTextContent("Não informado");
      expect(rowNode).toHaveAttribute("href");
    }
  });

  test("com cada leitura ainda pendente, a linha também fica sem a segunda linha", async () => {
    knowledgeList.mockReturnValue(new Promise(() => undefined));
    knowledgeGetOtherInfo.mockReturnValue(new Promise(() => undefined));
    await renderRoute("business", NARROW, "O que a IA sabe responder");

    for (const label of ["Perguntas frequentes", "Outras informações"]) {
      const rowNode = businessRow(label);
      expect(rowNode.querySelector(".business-row-text")).toBeNull();
      expect(rowNode).not.toHaveTextContent("Não informado");
    }
  });

  test("uma leitura falhando não esconde o resumo da outra", async () => {
    knowledgeList.mockRejectedValue(new Error("falhou"));
    knowledgeGetOtherInfo.mockResolvedValue({ content: "Estacionamento ao lado." });
    await renderRoute("business", NARROW, "O que a IA sabe responder");

    await waitFor(() =>
      expect(businessRow("Outras informações")).toHaveTextContent("Estacionamento ao lado."),
    );
    expect(businessRow("Perguntas frequentes").querySelector(".business-row-text")).toBeNull();
  });
});

const COMMERCIAL = "Conversas comerciais";
const PERSONAL = "Conversas pessoais";
const RETENTION_TITLE = "Por quanto tempo guardar as mensagens";

function retentionRadio(group: string, days: string): HTMLElement {
  return within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", {
    name: days,
  });
}

describe("Goal104 prova 3: R1 em /configuracoes/conversas", () => {
  test("os dois grupos mostram o valor lido marcado e as opções vindas da leitura", async () => {
    retentionGet.mockResolvedValue(
      retentionFixture({ retentionDaysOptions: [30, 90, 365] }),
    );
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    expect(screen.getByRole("heading", { level: 1, name: "Conversas" })).toBeVisible();
    expect(retentionRadio(COMMERCIAL, "90 dias")).toBeChecked();
    expect(retentionRadio(PERSONAL, "30 dias")).toBeChecked();
    for (const group of [COMMERCIAL, PERSONAL]) {
      expect(
        within(screen.getByRole("radiogroup", { name: group })).getAllByRole("radio"),
      ).toHaveLength(3);
      expect(
        within(screen.getByRole("radiogroup", { name: group })).queryByRole("radio", {
          name: "180 dias",
        }),
      ).toBeNull();
    }
    expect(retentionRadio(COMMERCIAL, "1 ano")).toBeInTheDocument();
  });

  test("'Salvar' fica desabilitado sem mudança e escolher não envia nada", async () => {
    const user = userEvent.setup();
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    await user.click(retentionRadio(COMMERCIAL, "180 dias"));
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    expect(retentionUpdate).not.toHaveBeenCalled();
    await user.click(retentionRadio(COMMERCIAL, "90 dias"));
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  test("aumentar envia um único PATCH com os dois prazos e sem confirmReduction", async () => {
    retentionUpdate.mockResolvedValue(
      retentionFixture({ commercialRetentionDays: 180, personalRetentionDays: 90 }),
    );
    const user = userEvent.setup();
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    await user.click(retentionRadio(COMMERCIAL, "180 dias"));
    await user.click(retentionRadio(PERSONAL, "90 dias"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(retentionUpdate).toHaveBeenCalledTimes(1));
    expect(retentionUpdate).toHaveBeenCalledWith({
      commercialRetentionDays: 180,
      personalRetentionDays: 90,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByText("Prazo de retenção salvo.", { ignore: "script, style, .toast-stack *" })).toBeVisible();
  });

  test("reduzir abre a confirmação; cancelar não envia nada e mantém a escolha na tela", async () => {
    const user = userEvent.setup();
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    await user.click(retentionRadio(COMMERCIAL, "30 dias"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Guardar conversas comerciais por 30 dias?",
    });
    expect(dialog).toHaveTextContent(/Mensagens com mais de 30 dias serão removidas/);
    expect(retentionUpdate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Manter 90 dias" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(retentionUpdate).not.toHaveBeenCalled();
    expect(retentionRadio(COMMERCIAL, "30 dias")).toBeChecked();
  });

  test("confirmar a redução envia um único pedido com confirmReduction true", async () => {
    retentionUpdate.mockResolvedValue(retentionFixture({ commercialRetentionDays: 30 }));
    const user = userEvent.setup();
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    await user.click(retentionRadio(COMMERCIAL, "30 dias"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Reduzir para 30 dias" }));

    await waitFor(() => expect(retentionUpdate).toHaveBeenCalledTimes(1));
    expect(retentionUpdate).toHaveBeenCalledWith({
      commercialRetentionDays: 30,
      confirmReduction: true,
      personalRetentionDays: 30,
    });
  });

  test("reduzir os dois prazos abre uma confirmação que diz que são os dois", async () => {
    retentionGet.mockResolvedValue(
      retentionFixture({ commercialRetentionDays: 180, personalRetentionDays: 90 }),
    );
    const user = userEvent.setup();
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    await user.click(retentionRadio(COMMERCIAL, "90 dias"));
    await user.click(retentionRadio(PERSONAL, "30 dias"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByRole("dialog", { name: "Reduzir os dois prazos?" }),
    ).toBeVisible();
    expect(retentionUpdate).not.toHaveBeenCalled();
  });

  test("reduzir só o prazo Pessoal diz qual prazo diminui", async () => {
    const user = userEvent.setup();
    retentionGet.mockResolvedValue(retentionFixture({ personalRetentionDays: 90 }));
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    await user.click(retentionRadio(PERSONAL, "30 dias"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByRole("dialog", { name: "Guardar conversas pessoais por 30 dias?" }),
    ).toBeVisible();
  });

  test("a falha de gravação mostra erro em role=alert e não perde a escolha", async () => {
    retentionUpdate.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    await user.click(retentionRadio(COMMERCIAL, "180 dias"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const alert = await screen.findByText("Não foi possível salvar o prazo de retenção.");
    expect(alert).toHaveAttribute("role", "alert");
    expect(retentionRadio(COMMERCIAL, "180 dias")).toBeChecked();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  test("enquanto grava, 'Salvar' fica desabilitado", async () => {
    retentionUpdate.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    await user.click(retentionRadio(COMMERCIAL, "180 dias"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled(),
    );
  });

  test("a lista 'O que não é afetado' e a nota de U-01 estão na tela", async () => {
    await renderRoute("conversations", NARROW, RETENTION_TITLE);

    const unaffected = screen.getByRole("region", { name: "O que não é afetado" });
    expect(within(unaffected).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Clientes e agendamentos",
      "Histórico de atendimentos e valores",
      "Observações e resumo de cada cliente",
    ]);
    const note = screen.getByText(/Conversas Não classificadas seguem o prazo Comercial/);
    expect(note.textContent).toMatch(/o prazo Pessoal passa a valer/);
  });

  test("a leitura falhada mostra a indisponibilidade, sem inventar prazos", async () => {
    retentionGet.mockRejectedValue(new Error("falhou"));
    await renderRoute(
      "conversations",
      NARROW,
      "Não foi possível carregar o prazo de retenção agora.",
    );

    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
  });
});

function group(title: string): HTMLElement {
  return screen
    .getByRole("heading", { level: 2, name: title })
    .closest("section") as HTMLElement;
}

function sheetOpener(name: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${name}`) });
}

describe("Goal104 prova 4: Conta em /configuracoes/conta", () => {
  test("três grupos, na ordem do quadro, com as linhas de cada um", async () => {
    const { container } = await renderRoute("account", NARROW, "Seus dados");

    expect(screen.getByRole("heading", { level: 1, name: "Conta" })).toBeVisible();
    const titles = Array.from(container.querySelectorAll(".business-group-title")).map(
      (heading) => heading.textContent,
    );
    expect(titles).toEqual(["Seus dados", "Segurança", "Sobre"]);

    const data = group("Seus dados");
    expect(within(data).getByRole("button", { name: /^Nome/ })).toHaveTextContent(
      "Marina Alves",
    );
    expect(data).toHaveTextContent("dona@studiomarina.com.br");
    expect(within(data).queryByRole("button", { name: /^E-mail/ })).toBeNull();
    expect(within(data).getByRole("button", { name: /^Senha/ })).toBeVisible();

    const security = group("Segurança");
    expect(security).toHaveTextContent("Sair de todos os dispositivos");
    expect(within(security).getByRole("button", { name: "Sair" })).toBeVisible();
  });

  test("a folha de nome envia o pedido de hoje, relê a sessão e confirma 'Nome salvo.'", async () => {
    updateProfile.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderRoute("account", NARROW, "Seus dados");

    await user.click(sheetOpener("Nome"));
    const sheet = await screen.findByRole("dialog", { name: "Nome" });
    const field = within(sheet).getByRole("textbox", { name: "Nome" });
    expect(field).toHaveValue("Marina Alves");
    await user.clear(field);
    await user.type(field, "Marina Souza");
    await user.click(within(sheet).getByRole("button", { name: "Salvar nome" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenCalledWith("Marina Souza");
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Nome salvo.", { ignore: "script, style, .toast-stack *" })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("a falha ao salvar o nome mostra a mensagem de hoje e mantém a folha aberta", async () => {
    updateProfile.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderRoute("account", NARROW, "Seus dados");

    await user.click(sheetOpener("Nome"));
    const sheet = await screen.findByRole("dialog", { name: "Nome" });
    await user.click(within(sheet).getByRole("button", { name: "Salvar nome" }));

    expect(await screen.findByText("Não foi possível salvar o nome.")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Nome" })).toBeVisible();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  async function openPasswordSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(sheetOpener("Senha"));
    return screen.findByRole("dialog", { name: "Senha" });
  }

  test("a folha de senha envia o pedido de hoje e confirma 'Senha alterada.'", async () => {
    changePassword.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await renderRoute("account", NARROW, "Seus dados");

    const sheet = await openPasswordSheet(user);
    await user.type(within(sheet).getByLabelText("Senha atual"), "senhaAtual123");
    await user.type(within(sheet).getByLabelText("Nova senha"), "novaSenha123");
    await user.type(within(sheet).getByLabelText("Repita a nova senha"), "novaSenha123");
    await user.click(within(sheet).getByRole("button", { name: "Alterar senha" }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1));
    expect(changePassword).toHaveBeenCalledWith({
      confirmPassword: "novaSenha123",
      currentPassword: "senhaAtual123",
      newPassword: "novaSenha123",
    });
    expect(await screen.findByText("Senha alterada.")).toBeVisible();
  });

  test("a folha de senha recusa senhas que não coincidem e senha fraca, sem pedido", async () => {
    const user = userEvent.setup();
    await renderRoute("account", NARROW, "Seus dados");

    const sheet = await openPasswordSheet(user);
    await user.type(within(sheet).getByLabelText("Senha atual"), "senhaAtual123");
    await user.type(within(sheet).getByLabelText("Nova senha"), "novaSenha123");
    await user.type(within(sheet).getByLabelText("Repita a nova senha"), "novaSenha124");
    await user.click(within(sheet).getByRole("button", { name: "Alterar senha" }));
    expect(await screen.findByText("As senhas não coincidem.")).toBeVisible();

    await user.clear(within(sheet).getByLabelText("Nova senha"));
    await user.type(within(sheet).getByLabelText("Nova senha"), "somenteletras");
    await user.click(within(sheet).getByRole("button", { name: "Alterar senha" }));
    expect(
      await screen.findByText(/A nova senha precisa ter letras e números\./),
    ).toBeVisible();
    expect(changePassword).not.toHaveBeenCalled();
  });

  test("a falha ao trocar a senha mostra a mensagem de hoje", async () => {
    changePassword.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderRoute("account", NARROW, "Seus dados");

    const sheet = await openPasswordSheet(user);
    await user.type(within(sheet).getByLabelText("Senha atual"), "senhaAtual123");
    await user.type(within(sheet).getByLabelText("Nova senha"), "novaSenha123");
    await user.type(within(sheet).getByLabelText("Repita a nova senha"), "novaSenha123");
    await user.click(within(sheet).getByRole("button", { name: "Alterar senha" }));

    expect(
      await screen.findByText("Não foi possível alterar a senha. Revise os dados."),
    ).toBeVisible();
  });

  test("'Sair' de Segurança só abre a confirmação; confirmar chama só logoutAllDevices e volta ao login", async () => {
    logoutAllDevices.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderRoute("account", NARROW, "Seus dados");

    await user.click(within(group("Segurança")).getByRole("button", { name: "Sair" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Encerrar o acesso em todos os aparelhos?",
    });
    expect(logoutAllDevices).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Sair de todos os dispositivos" }),
    );

    await waitFor(() => expect(logoutAllDevices).toHaveBeenCalledTimes(1));
    expect(logout).not.toHaveBeenCalled();
    await waitFor(() => expect(setUnauthenticated).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/login");
  });

  test("cancelar a confirmação de sair de todos os dispositivos não chama nada", async () => {
    const user = userEvent.setup();
    await renderRoute("account", NARROW, "Seus dados");

    await user.click(within(group("Segurança")).getByRole("button", { name: "Sair" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(logoutAllDevices).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  test("a falha de logoutAllDevices mostra o erro em role=alert e não sai da tela", async () => {
    logoutAllDevices.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    await renderRoute("account", NARROW, "Seus dados");

    await user.click(within(group("Segurança")).getByRole("button", { name: "Sair" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Sair de todos os dispositivos" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não foi possível encerrar o acesso nos outros aparelhos agora. Tente novamente.",
    );
    expect(setUnauthenticated).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  test("'Sobre' tem os links para os termos e a política de privacidade", async () => {
    await renderRoute("account", NARROW, "Seus dados");

    const about = group("Sobre");
    expect(within(about).getByRole("link", { name: "Termos de Uso" })).toHaveAttribute(
      "href",
      "/termos-de-uso",
    );
    expect(
      within(about).getByRole("link", { name: "Política de Privacidade" }),
    ).toHaveAttribute("href", "/politica-de-privacidade");
  });

  test("não existe 'Sair da conta' na tela", async () => {
    await renderRoute("account", NARROW, "Seus dados");

    expect(screen.queryByRole("button", { name: "Sair da conta" })).toBeNull();
    expect(screen.queryByText("Sair da conta")).toBeNull();
  });

  test("exclusão sem pedido: linha 'Excluir conta' com 'Você tem 7 dias para desistir' leva à rota própria", async () => {
    await renderRoute("account", NARROW, "Seus dados");

    const link = await screen.findByRole("link", { name: /^Excluir conta/ });
    expect(link).toHaveTextContent("Você tem 7 dias para desistir");
    expect(link).toHaveAttribute("href", "/configuracoes/conta/excluir");
    expect(screen.queryByRole("dialog", { name: "Excluir sua conta?" })).toBeNull();
    expect(requestDeletion).not.toHaveBeenCalled();
  });

  test("D-193: 'Excluir conta' é a última linha da tela, linha comum e não cartão", async () => {
    const { container } = await renderRoute("account", NARROW, "Seus dados");

    const link = await screen.findByRole("link", { name: /^Excluir conta/ });
    expect(link).toHaveClass("business-row");
    expect(container.querySelector(".account-danger-card")).toBeNull();
    const rows = container.querySelectorAll(".account-screen .business-row");
    expect(rows[rows.length - 1]).toBe(link);
    expect(group("Sobre").contains(link)).toBe(false);
  });

  test("exclusão pedida na rota própria: a senha digitada vai uma vez e a tela volta à Conta", async () => {
    const user = userEvent.setup();
    await renderRoute("account-deletion", NARROW, "Excluir sua conta na Avenly?");

    requestDeletion.mockResolvedValue(undefined);
    await user.type(screen.getByLabelText("Confirme com sua senha"), "senhaAtual123");
    await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));

    await waitFor(() => expect(requestDeletion).toHaveBeenCalledTimes(1));
    expect(requestDeletion).toHaveBeenCalledWith("senhaAtual123");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/configuracoes/conta"));
  });

  test("exclusão agendada: mostra o prazo e 'Cancelar exclusão', que chama o cancelamento", async () => {
    const dueAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    statusGet.mockResolvedValue(statusFixture({ dueAt, status: "SCHEDULED" }));
    cancelDeletion.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderRoute("account", NARROW, "Exclusão da conta agendada");

    expect(screen.getByText(/dias para os dados serem apagados definitivamente/)).toBeVisible();
    expect(screen.queryByRole("link", { name: /^Excluir conta/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Cancelar a exclusão da conta?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar exclusão" }));

    await waitFor(() => expect(cancelDeletion).toHaveBeenCalledTimes(1));
  });

  test("exclusão com a leitura falhando: mensagem de indisponibilidade, sem botão", async () => {
    statusGet.mockRejectedValue(new Error("falhou"));
    await renderRoute("account", NARROW, "Seus dados");

    expect(
      await screen.findByText(/Não foi possível carregar o estado da exclusão agora/),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /^Excluir conta/ })).toBeNull();
  });

  test("exclusão com a leitura pendente: não afirma 'sem pedido' nem 'agendado'", async () => {
    statusGet.mockReturnValue(new Promise(() => undefined));
    await renderRoute("account", NARROW, "Seus dados");

    expect(screen.queryByRole("link", { name: /^Excluir conta/ })).toBeNull();
    expect(screen.queryByText("Exclusão da conta agendada")).toBeNull();
    expect(screen.queryByText("Você tem 7 dias para desistir")).toBeNull();
  });

  test("conta já excluída: 'Conta excluída'", async () => {
    statusGet.mockResolvedValue(statusFixture({ dueAt: null, status: "PURGED" }));
    await renderRoute("account", NARROW, "Conta excluída");

    expect(screen.queryByRole("link", { name: /^Excluir conta/ })).toBeNull();
  });
});

const SHELL_ROUTES: Array<{
  mark: RegExp;
  name: string;
  scenario: Scenario;
}> = [
  { mark: /^IA/, name: "/configuracoes/ia", scenario: "ai" },
  {
    mark: /^Conversas/,
    name: "/configuracoes/conversas",
    scenario: "conversations",
  },
  { mark: /^Conta/, name: "/configuracoes/conta", scenario: "account" },
  {
    mark: /^Negócio/,
    name: "/configuracoes/negocio/perguntas-frequentes",
    scenario: "business-faq",
  },
];

// Espera o h1 da rota, que existe com o título de antes e com o de agora: a casca
// é guardada pelo mesmo caminho nas duas árvores, e o conteúdo não importa aqui.
async function renderShell(scenario: Scenario, width: number) {
  setViewport(width);
  const utils = render(
    <PlatformLayout>
      <SettingsScreen scenario={scenario} />
    </PlatformLayout>,
  );
  await screen.findAllByRole("heading", { level: 1 });
  return utils;
}

describe("Goal104 prova 5: casca", () => {
  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)("uma chamada de useShellConfig por árvore nas quatro rotas, na faixa %s", async (_label, width) => {
    for (const route of SHELL_ROUTES) {
      shellCallers.clear();
      const { unmount } = await renderShell(route.scenario, width);
      await waitFor(() => {
        expect(shellCallers.size, route.name).toBe(1);
      });
      unmount();
    }
  });

  test.each(SHELL_ROUTES)(
    "$name, de 1024 px em diante, mostra a lista do hub com a linha certa marcada",
    async (route) => {
      const { container } = await renderShell(route.scenario, WIDE);

      const list = container.querySelector<HTMLElement>(".list-detail-list");
      expect(list).not.toBeNull();
      expect(list).toHaveAttribute("aria-label", "Configurações");
      await waitFor(() => {
        const current = (list as HTMLElement).querySelectorAll('[aria-current="page"]');
        expect(current, route.name).toHaveLength(1);
        expect(current[0]?.textContent ?? "").toMatch(route.mark);
      });
      expect(within(container).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    },
  );

  test.each(SHELL_ROUTES)(
    "$name, abaixo de 1024 px, é tela empurrada sem a lista e sem barra de abas",
    async (route) => {
      const { container } = await renderShell(route.scenario, NARROW);

      expect(container.querySelector(".list-detail")).toBeNull();
      expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
      expect(container.querySelector('nav[class$="bottom-nav"]')).toBeNull();
    },
  );
});
