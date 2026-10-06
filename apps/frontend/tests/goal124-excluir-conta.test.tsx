// @vitest-environment jsdom
/**
 * Goal124 (Mais-WhatsApp:C2) — excluir a conta em rota própria.
 *
 * O que esta suíte prova, pelo que a usuária encontra em `/configuracoes/conta/excluir`:
 *
 * 1. A tela: o `h1`, o texto, os três passos e o campo de senha do quadro, com o
 *    terceiro passo "Em {dia} de {mês}" calculado como hoje mais sete dias no
 *    fuso do negócio (relógio fixo num instante em que o fuso e o UTC caem em
 *    dias diferentes).
 * 2. O pedido: "Excluir minha conta" desabilitado com a senha vazia; enviar chama
 *    `account.requestDeletion` uma vez; `401` e as outras falhas mostram as
 *    mensagens de hoje; o sucesso relê o status e volta a Conta com `replace`;
 *    "Voltar" não envia nada.
 * 3. Os estados: o formulário só aparece com `NONE` ou `CANCELLED`; carregando e
 *    leitura falhada nunca mostram o formulário; `SCHEDULED` e `PURGED` vão para
 *    Conta.
 * 4. A casca: uma chamada de `useShellConfig` por árvore nas duas faixas, tela
 *    empurrada abaixo de 1024 px e "Conta" marcada na lista a partir dela.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida pela
 * comparação com o protótipo (`visual:compare`).
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
import { BffHttpError, type SettingsState } from "@/data";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";

const replace = vi.fn();
const push = vi.fn();
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
const migrationGetImportState = vi.fn();
const retentionGet = vi.fn();
const settingsGet = vi.fn();
const getActivationTest = vi.fn();
const whatsappGet = vi.fn();
const knowledgeList = vi.fn();
const knowledgeGetOtherInfo = vi.fn();
const requestDeletion = vi.fn();
const cancelDeletion = vi.fn();
const refreshSession = vi.fn();
const setUnauthenticated = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    account: { cancelDeletion, requestDeletion, updateProfile: vi.fn() },
    activationTest: { get: getActivationTest },
    auth: {
      changePassword: vi.fn(),
      logout: vi.fn(),
      logoutAllDevices: vi.fn(),
    },
    knowledge: {
      create: vi.fn(),
      getOtherInfo: knowledgeGetOtherInfo,
      list: knowledgeList,
    },
    migration: { getImportState: migrationGetImportState },
    notifications: {
      getPreferences: notificationsGetPreferences,
      summary: notificationsSummary,
      updatePreferences: vi.fn(),
    },
    retention: { get: retentionGet, update: vi.fn() },
    serviceCatalog: { list: serviceCatalogList },
    settings: { get: settingsGet, updateAi: vi.fn() },
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
const H1 = "Excluir sua conta na Avenly?";
const ACCOUNT = "/configuracoes/conta";

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

function settingsFixture(timezone: string | null = "America/Sao_Paulo"): SettingsState {
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
    business: timezone
      ? {
          address: "Rua Um, 100",
          category: "Beleza",
          contextProjectionStatus: "PROJECTED",
          currency: "BRL",
          language: "pt-BR",
          modalities: ["ON_SITE"],
          name: "Studio Marina",
          timezone,
        }
      : null,
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

async function renderDeletion(width: number = NARROW) {
  setViewport(width);
  const utils = render(
    <PlatformLayout>
      <SettingsScreen scenario="account-deletion" />
    </PlatformLayout>,
  );
  await screen.findAllByRole("heading", { level: 1 });
  return utils;
}

async function renderForm(width: number = NARROW) {
  const utils = await renderDeletion(width);
  await screen.findByRole("heading", { level: 1, name: H1 });
  return utils;
}

beforeEach(() => {
  shellCallers.clear();
  for (const mock of [
    statusGet,
    notificationsSummary,
    notificationsGetPreferences,
    serviceCatalogList,
    migrationGetImportState,
    retentionGet,
    settingsGet,
    getActivationTest,
    whatsappGet,
    knowledgeList,
    knowledgeGetOtherInfo,
    requestDeletion,
    cancelDeletion,
    refreshSession,
    setUnauthenticated,
    replace,
    push,
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
  retentionGet.mockResolvedValue({
    appliesFrom: "NEXT_SWEEP",
    commercialRetentionDays: 90,
    lastSweepCompletedAt: null,
    personalRetentionDays: 30,
    retentionDaysOptions: [30, 90, 180, 365],
    unclassifiedRetentionFollows: "COMMERCIAL",
  });
  settingsGet.mockResolvedValue(settingsFixture());
  getActivationTest.mockResolvedValue(null);
  whatsappGet.mockResolvedValue({
    phoneNumber: "5511999990000",
    status: "CONNECTED",
  });
  knowledgeList.mockResolvedValue([]);
  knowledgeGetOtherInfo.mockResolvedValue({ content: "" });
  refreshSession.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Goal124 C2: a tela", () => {
  test("mostra o h1, o texto e os três passos do quadro", async () => {
    await renderForm();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText(
        "Você tem 7 dias para mudar de ideia. Depois disso, a exclusão é definitiva.",
      ),
    ).toBeVisible();

    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent(
      "HojeSua IA para de atender e o WhatsApp é desconectado. Nenhum cliente recebe aviso.",
    );
    expect(steps[1]).toHaveTextContent(
      "Próximos 7 diasPara desistir, basta entrar de novo e tocar em “Cancelar exclusão”. Ao voltar, você reconecta o WhatsApp e refaz o teste.",
    );
    expect(steps[2]).toHaveTextContent(
      "Clientes, agenda, serviços e conversas são apagados de forma definitiva.",
    );
    expect(screen.getByLabelText("Confirme com sua senha")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByRole("button", { name: "Voltar" })).toBeEnabled();
  });

  test("o dia do terceiro passo é hoje mais 7 dias no fuso do negócio, não no UTC", async () => {
    // 01:30 UTC de 7/out é 22:30 de 6/out em São Paulo: hoje, para o negócio, é dia 6.
    vi.useFakeTimers({ now: new Date("2026-10-07T01:30:00.000Z"), toFake: ["Date"] });
    await renderForm();

    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps[2]).toHaveTextContent("Em 13 de outubro");
    expect(steps[2]).not.toHaveTextContent("Em 14 de outubro");
  });

  test("a soma de sete dias vira o mês no fuso do negócio", async () => {
    // 01:00 UTC de 26/out é 22:00 de 25/out em São Paulo: 25 + 7 = 1º de novembro.
    vi.useFakeTimers({ now: new Date("2026-10-26T01:00:00.000Z"), toFake: ["Date"] });
    await renderForm();

    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps[2]).toHaveTextContent("Em 1 de novembro");
  });

  test("usa o fuso gravado no negócio e, sem negócio lido, o de São Paulo", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-06T20:00:00.000Z"), toFake: ["Date"] });
    settingsGet.mockResolvedValue(settingsFixture("Pacific/Auckland"));
    const first = await renderForm();
    // 20:00 UTC de 6/out já é 7/out em Auckland (UTC+13): 7 + 7 = 14.
    expect(
      within(screen.getByRole("list")).getAllByRole("listitem")[2],
    ).toHaveTextContent("Em 14 de outubro");
    first.unmount();

    settingsGet.mockResolvedValue(settingsFixture(null));
    await renderForm();
    // Em São Paulo ainda é 17:00 de 6/out: 6 + 7 = 13.
    expect(
      within(screen.getByRole("list")).getAllByRole("listitem")[2],
    ).toHaveTextContent("Em 13 de outubro");
  });
});

describe("Goal124 C2: o pedido", () => {
  test("'Excluir minha conta' fica desabilitado com a senha vazia e habilita ao digitar", async () => {
    const user = userEvent.setup();
    await renderForm();

    const confirm = screen.getByRole("button", { name: "Excluir minha conta" });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(requestDeletion).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Confirme com sua senha"), "senhaAtual123");
    expect(confirm).toBeEnabled();
    await user.clear(screen.getByLabelText("Confirme com sua senha"));
    expect(confirm).toBeDisabled();
  });

  test("enviar chama account.requestDeletion uma vez, relê o status e volta a Conta com replace", async () => {
    const user = userEvent.setup();
    await renderForm();
    statusGet.mockClear();
    requestDeletion.mockResolvedValue(undefined);

    await user.type(screen.getByLabelText("Confirme com sua senha"), "senhaAtual123");
    await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));

    await waitFor(() => expect(requestDeletion).toHaveBeenCalledTimes(1));
    expect(requestDeletion).toHaveBeenCalledWith("senhaAtual123");
    await waitFor(() => expect(replace).toHaveBeenCalledWith(ACCOUNT));
    await waitFor(() => expect(statusGet).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  test("durante o pedido o botão diz 'Pedindo exclusão...' e fica desabilitado", async () => {
    const user = userEvent.setup();
    await renderForm();
    requestDeletion.mockReturnValue(new Promise(() => undefined));

    await user.type(screen.getByLabelText("Confirme com sua senha"), "senhaAtual123");
    await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));

    const busy = await screen.findByRole("button", { name: "Pedindo exclusão..." });
    expect(busy).toBeDisabled();
    expect(requestDeletion).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  test("401 mostra 'Senha atual incorreta.' e não sai da tela", async () => {
    const user = userEvent.setup();
    await renderForm();
    requestDeletion.mockRejectedValue(
      new BffHttpError({
        code: "UNAUTHORIZED",
        message: "Current password is incorrect.",
        requestId: "req-1",
        status: 401,
      }),
    );

    await user.type(screen.getByLabelText("Confirme com sua senha"), "errada-000");
    await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Senha atual incorreta.");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Excluir minha conta" })).toBeEnabled();
  });

  test("outra falha mostra a mensagem de hoje e nunca vira sucesso", async () => {
    const user = userEvent.setup();
    await renderForm();
    requestDeletion.mockRejectedValue(new Error("network error"));

    await user.type(screen.getByLabelText("Confirme com sua senha"), "senhaAtual123");
    await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível pedir a exclusão agora. Tente novamente.",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  test("'Voltar' leva a Conta sem enviar nada", async () => {
    const user = userEvent.setup();
    await renderForm();

    await user.type(screen.getByLabelText("Confirme com sua senha"), "senhaAtual123");
    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(push).toHaveBeenCalledWith(ACCOUNT);
    expect(requestDeletion).not.toHaveBeenCalled();
  });
});

describe("Goal124 C2: os estados da rota", () => {
  test("com a exclusão cancelada o formulário aparece, como sem pedido", async () => {
    statusGet.mockResolvedValue(
      statusFixture({ dueAt: "2026-09-23T12:00:00.000Z", status: "CANCELLED" }),
    );
    await renderForm();

    expect(screen.getByRole("button", { name: "Excluir minha conta" })).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });

  test("sem leitura de status mostra o carregando e nunca o formulário", async () => {
    statusGet.mockReturnValue(new Promise(() => undefined));
    await renderDeletion();

    expect(
      await screen.findByText("Carregando o estado da exclusão..."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: H1 })).toBeNull();
    expect(screen.queryByLabelText("Confirme com sua senha")).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir minha conta" })).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  test("com a leitura falhada mostra a mensagem e nenhum formulário", async () => {
    statusGet.mockRejectedValue(new Error("falhou"));
    await renderDeletion();

    expect(
      await screen.findByText(/Não foi possível carregar o estado da exclusão agora/),
    ).toBeVisible();
    expect(screen.queryByLabelText("Confirme com sua senha")).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir minha conta" })).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  test.each(["SCHEDULED", "PURGED"])(
    "com a exclusão %s vai para Conta com replace, sem formulário",
    async (status) => {
      statusGet.mockResolvedValue(
        statusFixture({
          dueAt: status === "SCHEDULED" ? "2026-10-12T12:00:00.000Z" : null,
          status,
        }),
      );
      await renderDeletion();

      await waitFor(() => expect(replace).toHaveBeenCalledWith(ACCOUNT));
      expect(screen.queryByLabelText("Confirme com sua senha")).toBeNull();
      expect(screen.queryByRole("button", { name: "Excluir minha conta" })).toBeNull();
    },
  );
});

describe("Goal124 C2: a casca", () => {
  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)("uma chamada de useShellConfig por árvore, na faixa %s", async (_label, width) => {
    await renderForm(width);

    await waitFor(() => expect(shellCallers.size).toBe(1));
  });

  test("de 1024 px em diante a lista do hub marca 'Conta' e a tela tem um só h1", async () => {
    const { container } = await renderForm(WIDE);

    const list = container.querySelector<HTMLElement>(".list-detail-list");
    expect(list).not.toBeNull();
    expect(list).toHaveAttribute("aria-label", "Configurações");
    await waitFor(() => {
      const current = (list as HTMLElement).querySelectorAll('[aria-current="page"]');
      expect(current).toHaveLength(1);
      expect(current[0]?.textContent ?? "").toMatch(/^Conta/);
    });
    expect(within(container).getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  test("abaixo de 1024 px é tela empurrada, sem a lista e sem barra de abas, com voltar para Conta", async () => {
    const { container } = await renderForm(NARROW);

    expect(container.querySelector(".list-detail")).toBeNull();
    expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
    expect(container.querySelector('nav[class$="bottom-nav"]')).toBeNull();
    expect(screen.getByRole("link", { name: "Voltar para Conta" })).toHaveAttribute(
      "href",
      ACCOUNT,
    );
    expect(screen.getByText("Excluir conta", { selector: "h2" })).toBeVisible();
  });
});
