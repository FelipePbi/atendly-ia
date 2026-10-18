// @vitest-environment jsdom
/**
 * Goal097 — Configurações iguais ao protótipo: hub (M1), Negócio (N1) e
 * Agenda (AG1 e AG3).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. Hub M1: três grupos, na ordem do protótipo, com cada linha apontando para
 *    a rota certa, sem "Disponibilidade" e com a linha Serviços marcada para
 *    sumir de 1024 px em diante. Com as leituras mockadas, cada linha mostra o
 *    estado no formato do protótipo (inclusive o âmbar de revisão); com cada
 *    leitura falhando, a linha fica sem a segunda linha e nunca com valor
 *    inventado; o hub abre mesmo com todas as leituras secundárias falhando.
 * 2. AG1 (`/configuracoes/agenda`): as linhas com `href` e resumos, os casos
 *    de `availabilityGridSummary`, as folhas "Dias visíveis" e "Visualização
 *    inicial" gravando pelo mesmo pedido, a recusa de ocultar todos os dias e
 *    nenhum formulário de regras ou política na tela.
 * 3. AG3 (`/configuracoes/agenda/regras`): os grupos segmentados com o valor
 *    lido, a opção extra para valor fora da lista (inclusive antecedência 0),
 *    um único "Salvar" com um único PATCH de quatro campos mais `timezone` e
 *    `rules` lidos, erro sem perder a edição e o bloco "Na prática" com relógio
 *    fixo, reagindo à tela antes de salvar.
 * 4. `/configuracoes/agenda/lembretes`: a seção de lembretes como tela
 *    empurrada, com voltar para `/configuracoes/agenda`.
 * 5. Casca: uma chamada de `useShellConfig` por árvore nas quatro rotas, nas
 *    duas faixas, e, de 1024 px em diante, "Agenda" marcada na lista.
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
import { type ReactElement, useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type { AvailabilitySettingsInput, SettingsState } from "@/data";
import type * as AgendaSummariesModule from "@/features/settings/agendaSummaries";
import type * as OfferPreviewModule from "@/features/settings/offerPreview";
import { SettingsHub } from "@/features/settings/SettingsHub";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

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
const serviceCatalogList = vi.fn();
const migrationGetImportState = vi.fn();
const retentionGet = vi.fn();
const settingsGet = vi.fn();
const getAgendaViewPreference = vi.fn();
const updateAgendaViewPreference = vi.fn();
const getReminders = vi.fn();
const updateAvailability = vi.fn();
const whatsappGet = vi.fn();
const knowledgeList = vi.fn();
const knowledgeGetOtherInfo = vi.fn();
const notificationsGetPreferences = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    migration: { getImportState: migrationGetImportState },
    knowledge: { getOtherInfo: knowledgeGetOtherInfo, list: knowledgeList },
    notifications: {
      getPreferences: notificationsGetPreferences,
      summary: notificationsSummary,
    },
    retention: { get: retentionGet },
    serviceCatalog: { list: serviceCatalogList },
    settings: {
      get: settingsGet,
      getAgendaViewPreference,
      getReminders,
      updateAgendaViewPreference,
      updateAvailability,
    },
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

// Os módulos novos são carregados na hora do uso, por `vi.importActual` com
// caminho em variável: a árvore de antes do Goal097 não os tem e só os testes
// que dependem deles devem falhar, não o arquivo inteiro.
const AGENDA_SUMMARIES = "@/features/settings/agendaSummaries";
const OFFER_PREVIEW = "@/features/settings/offerPreview";

function loadSummaries() {
  return vi.importActual<typeof AgendaSummariesModule>(AGENDA_SUMMARIES);
}

function loadOfferPreview() {
  return vi.importActual<typeof OfferPreviewModule>(OFFER_PREVIEW);
}

type Availability = NonNullable<SettingsState["availability"]>;

function availabilityFixture(
  overrides: Partial<Availability> = {},
): Availability {
  const weekday = (dayOfWeek: number) => ({
    active: true,
    dayOfWeek,
    endTime: "18:00",
    id: `r${dayOfWeek}`,
    startTime: "09:00",
  });
  return {
    customerChangeMinNoticeMinutes: 1_440,
    granularityMinutes: 30,
    maxLeadDays: 60,
    minLeadMinutes: 120,
    rules: [
      weekday(1),
      weekday(2),
      weekday(3),
      weekday(4),
      weekday(5),
      {
        active: true,
        dayOfWeek: 6,
        endTime: "14:00",
        id: "r6",
        startTime: "09:00",
      },
      {
        active: false,
        dayOfWeek: 0,
        endTime: "12:00",
        id: "r0",
        startTime: "08:00",
      },
    ],
    timezone: "America/Fortaleza",
    ...overrides,
  };
}

function settingsFixture(
  overrides: Partial<SettingsState> = {},
): SettingsState {
  return {
    ai: { enabled: true, tone: "PROFESSIONAL" },
    availability: availabilityFixture(),
    business: {
      address: "Rua das Flores, 120",
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
    ...overrides,
  };
}

function statusFixture(
  ai: "ACTIVE" | "OFF" | "PENDING",
  whatsapp: {
    phoneNumber: string | null;
    status: "CONNECTED" | "DISCONNECTED";
  },
) {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: ai !== "OFF",
      effectiveEnabled: ai === "ACTIVE",
      reconciled: "NOOP",
      state: ai,
    },
    degraded: false,
    whatsapp: { checkedAt: "2026-09-27T12:00:00.000Z", ...whatsapp },
  };
}

const CONNECTED = {
  phoneNumber: "5511999990000",
  status: "CONNECTED",
} as const;

beforeEach(() => {
  shellCallers.clear();
  for (const mock of [
    statusGet,
    notificationsSummary,
    serviceCatalogList,
    migrationGetImportState,
    retentionGet,
    settingsGet,
    getAgendaViewPreference,
    updateAgendaViewPreference,
    getReminders,
    updateAvailability,
    whatsappGet,
    knowledgeList,
    knowledgeGetOtherInfo,
    notificationsGetPreferences,
  ]) {
    mock.mockReset();
  }
  // Goal104: o detalhe de Negócio (aberto no hub largo) lê a base de respostas e a IA lê o aviso.
  knowledgeList.mockRejectedValue(new Error("fora do escopo"));
  knowledgeGetOtherInfo.mockRejectedValue(new Error("fora do escopo"));
  notificationsGetPreferences.mockRejectedValue(new Error("fora do escopo"));
  statusGet.mockResolvedValue(statusFixture("ACTIVE", CONNECTED));
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [
      { active: true, needsReview: false },
      { active: true, needsReview: false },
      { active: false, needsReview: false },
    ],
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
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [0],
    initialView: "WEEK",
  });
  getReminders.mockResolvedValue({
    configured: true,
    confirmationEnabled: true,
    pricePolicy: "NEVER",
    rules: [{ leadMinutes: 1_440, slot: "FIRST" }],
  });
  whatsappGet.mockResolvedValue(null);
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

function renderHub(settings: SettingsState = settingsFixture()) {
  setViewport(NARROW);
  return render(
    <SystemStatusProvider>
      <SettingsHub settings={settings} />
    </SystemStatusProvider>,
  );
}

async function renderRoute(
  scenario: Parameters<typeof SettingsScreen>[0]["scenario"],
  width: number,
  ready: string | RegExp,
) {
  setViewport(width);
  const element: ReactElement = (
    <PlatformLayout>
      <SettingsScreen scenario={scenario} />
    </PlatformLayout>
  );
  const utils = render(element);
  await screen.findAllByText(ready, { exact: typeof ready !== "string" });
  return utils;
}

function row(name: RegExp | string): HTMLElement {
  return screen.getByRole("link", { name });
}

const HUB_ROWS: Array<[string, string]> = [
  ["Serviços", "/servicos"],
  ["IA", "/configuracoes/ia"],
  ["WhatsApp", "/configuracoes/whatsapp"],
  ["Negócio", "/configuracoes/negocio"],
  ["Agenda", "/configuracoes/agenda"],
  ["Importação", "/importacao"],
  ["Conversas", "/configuracoes/conversas"],
  // Registro de atividade (D-176).
  ["Atividade", "/configuracoes/atividade"],
  // Aparência da conta (D-181).
  ["Aparência", "/configuracoes/aparencia"],
  ["Conta", "/configuracoes/conta"],
];

describe("Goal097 prova 1: hub M1", () => {
  test("três grupos, com título, na ordem do protótipo, e cada linha com o seu href", async () => {
    const { container } = renderHub();

    const titles = within(container)
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(["Atendimento", "Seu negócio", "Dados e conta"]);

    const groups = Array.from(container.querySelectorAll(".hub-group"));
    const rowsByGroup = groups.map((group) =>
      Array.from(group.querySelectorAll("a.hub-row")).map(
        (link) => link.querySelector("strong")?.textContent,
      ),
    );
    expect(rowsByGroup).toEqual([
      ["Serviços", "IA", "WhatsApp"],
      ["Negócio", "Agenda"],
      ["Importação", "Conversas", "Atividade", "Aparência", "Conta"],
    ]);

    for (const [title, href] of HUB_ROWS) {
      expect(row(new RegExp(`^${title}`))).toHaveAttribute("href", href);
    }
    expect(screen.getAllByRole("link")).toHaveLength(HUB_ROWS.length);
    await screen.findByText("2 ativos");
  });

  test("não existe linha Disponibilidade", async () => {
    renderHub();

    expect(
      screen.queryByRole("link", { name: /Disponibilidade/ }),
    ).not.toBeInTheDocument();
    await screen.findByText("2 ativos");
  });

  test("a linha Serviços tem a classe que a esconde de 1024 px em diante; as outras não", async () => {
    renderHub();

    expect(row(/^Serviços/)).toHaveClass("hub-row-shell-duplicate");
    for (const [title] of HUB_ROWS.filter(([name]) => name !== "Serviços")) {
      expect(row(new RegExp(`^${title}`))).not.toHaveClass(
        "hub-row-shell-duplicate",
      );
    }
    await screen.findByText("2 ativos");
  });

  test("com as leituras mockadas, cada linha mostra o estado no formato do protótipo", async () => {
    migrationGetImportState.mockResolvedValue({
      history: { completedAt: "2026-09-10T15:00:00.000Z" },
      session: null,
    });
    renderHub();

    await waitFor(() => {
      expect(row(/^Serviços/)).toHaveTextContent("2 ativos");
      expect(row(/^IA/)).toHaveTextContent("Ativa · estilo Profissional");
      expect(row(/^WhatsApp/)).toHaveTextContent(
        "+55 11 99999-0000 · conectado",
      );
      expect(row(/^Negócio/)).toHaveTextContent(
        "Endereço, pagamento, informações para a IA",
      );
      expect(row(/^Agenda/)).toHaveTextContent(
        "Horários, lembretes, regras de agendamento",
      );
      expect(row(/^Importação/)).toHaveTextContent(
        "Concluída em 10/09 · Minha Agenda",
      );
      expect(row(/^Conversas/)).toHaveTextContent(
        "Guardar por 90 dias · pessoais por 30",
      );
      expect(row(/^Conta/)).toHaveTextContent("dona@studiomarina.com.br");
    });
  });

  test("serviços a revisar mostram o estado âmbar de revisão", async () => {
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [
        { active: true, needsReview: false },
        { active: true, needsReview: true },
        { active: true, needsReview: true },
      ],
      managedExternally: false,
      source: "AVENLY",
    });
    renderHub();

    const detail = await screen.findByText("1 ativo · 2 precisam de revisão");
    expect(detail).toHaveClass("is-review");
    expect(row(/^Serviços/)).toContainElement(detail);
  });

  test("serviços sem pendência não usam o estado de revisão", async () => {
    renderHub();

    const detail = await screen.findByText("2 ativos");
    expect(detail).not.toHaveClass("is-review");
  });

  test("a importação em andamento e a ainda não feita têm texto próprio", async () => {
    migrationGetImportState.mockResolvedValue({
      history: null,
      session: { id: "s1" },
    });
    const first = renderHub();
    expect(await screen.findByText("Continuar importação")).toBeVisible();
    first.unmount();

    migrationGetImportState.mockResolvedValue({ history: null, session: null });
    renderHub();
    expect(await screen.findByText("Importar do Minha Agenda")).toBeVisible();
  });

  test("a IA em ativação e desligada, e o WhatsApp desconectado, vêm do status lido", async () => {
    // WhatsApp desconectado: a IA aparece pausada, seja qual for o estado
    // dela (pedido de 2026-10-16).
    statusGet.mockResolvedValue(
      statusFixture("ACTIVE", { phoneNumber: null, status: "DISCONNECTED" }),
    );
    const disconnected = renderHub();
    await waitFor(() => {
      expect(row(/^IA/)).toHaveTextContent("Pausada · WhatsApp desconectado");
      expect(row(/^WhatsApp/)).toHaveTextContent("Desconectado");
    });
    expect(row(/^IA/).querySelector(".is-breathing")).toBeNull();
    disconnected.unmount();

    // Nunca ligada (sem teste real): segue "Desligada", não "Pausada".
    statusGet.mockResolvedValue(
      statusFixture("OFF", { phoneNumber: null, status: "DISCONNECTED" }),
    );
    const neverOn = renderHub(
      settingsFixture({ ai: { enabled: false, tone: "PROFESSIONAL" } }),
    );
    await waitFor(() =>
      expect(row(/^IA/)).toHaveTextContent("Desligada · estilo Profissional"),
    );
    neverOn.unmount();

    statusGet.mockResolvedValue(statusFixture("PENDING", CONNECTED));
    const first = renderHub();
    await waitFor(() =>
      expect(row(/^IA/)).toHaveTextContent("Em ativação · estilo Profissional"),
    );
    first.unmount();

    statusGet.mockResolvedValue(statusFixture("OFF", CONNECTED));
    renderHub();
    await waitFor(() =>
      expect(row(/^IA/)).toHaveTextContent("Desligada · estilo Profissional"),
    );
  });

  test("com cada leitura falhando, a linha fica sem segunda linha e sem valor inventado", async () => {
    serviceCatalogList.mockRejectedValue(new Error("falhou"));
    migrationGetImportState.mockRejectedValue(new Error("falhou"));
    retentionGet.mockRejectedValue(new Error("falhou"));
    const { container } = renderHub();

    await waitFor(() => expect(serviceCatalogList).toHaveBeenCalled());
    await waitFor(() => expect(retentionGet).toHaveBeenCalled());
    await waitFor(() => expect(migrationGetImportState).toHaveBeenCalled());
    // O estado que não depende dessas leituras segue aparecendo.
    await waitFor(() =>
      expect(row(/^IA/)).toHaveTextContent("Ativa · estilo Profissional"),
    );

    for (const title of ["Serviços", "Importação", "Conversas"]) {
      const link = row(new RegExp(`^${title}`));
      expect(link.querySelector(".hub-row-detail")).toBeNull();
      expect(link).toHaveTextContent(new RegExp(`^${title}$`));
    }
    expect(container.textContent).not.toMatch(/ativos?\b/);
    expect(container.textContent).not.toMatch(/Guardar por/);
    expect(container.textContent).not.toMatch(
      /Importar do|Concluída|Continuar/,
    );
  });

  test("o hub abre com todas as leituras secundárias falhando", async () => {
    serviceCatalogList.mockRejectedValue(new Error("falhou"));
    migrationGetImportState.mockRejectedValue(new Error("falhou"));
    retentionGet.mockRejectedValue(new Error("falhou"));
    statusGet.mockRejectedValue(new Error("falhou"));
    notificationsSummary.mockRejectedValue(new Error("falhou"));
    renderHub();

    expect(
      screen.getByRole("heading", { level: 1, name: "Configurações" }),
    ).toBeVisible();
    for (const [title, href] of HUB_ROWS) {
      expect(row(new RegExp(`^${title}`))).toHaveAttribute("href", href);
    }
    await waitFor(() => expect(retentionGet).toHaveBeenCalled());
    expect(screen.getAllByRole("link")).toHaveLength(HUB_ROWS.length);
  });

  test("leituras ainda pendentes deixam as linhas sem segunda linha", () => {
    serviceCatalogList.mockReturnValue(new Promise(() => undefined));
    migrationGetImportState.mockReturnValue(new Promise(() => undefined));
    retentionGet.mockReturnValue(new Promise(() => undefined));
    renderHub();

    for (const title of ["Serviços", "Importação", "Conversas"]) {
      expect(
        row(new RegExp(`^${title}`)).querySelector(".hub-row-detail"),
      ).toBeNull();
    }
  });
});

describe("Goal097 prova 2: AG1 — /configuracoes/agenda", () => {
  test("as linhas têm href e resumo lidos do dado salvo", async () => {
    await renderRoute("calendar", NARROW, "Dias e horários");

    const rows = [
      [
        "Dias e horários",
        "/configuracoes/disponibilidade",
        "Seg–Sex 09:00–18:00 · Sáb 09:00–14:00",
      ],
      [
        "Antecedência e intervalos",
        "/configuracoes/agenda/regras",
        "Mín. 2 h · máx. 60 dias · a cada 30 min",
      ],
      [
        "Cancelamento e remarcação",
        "/configuracoes/agenda/regras",
        "Até 24 h antes",
      ],
      [
        "Lembretes",
        "/configuracoes/agenda/lembretes",
        "1 lembrete · 24 h antes · pede confirmação",
      ],
    ] as const;
    for (const [title, href, summary] of rows) {
      const link = (
        await screen.findAllByRole("link", { name: new RegExp(`^${title}`) })
      ).find((candidate) => candidate.classList.contains("agenda-row"));
      expect(link).toBeDefined();
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveTextContent(summary);
    }

    expect(
      await screen.findByRole("button", { name: /^Dias visíveis/ }),
    ).toHaveTextContent("Seg–Sáb · domingo oculto");
    expect(
      screen.getByRole("button", { name: /^Visualização inicial/ }),
    ).toHaveTextContent("Semana");
  });

  test("os grupos da tela vêm na ordem do protótipo", async () => {
    const { container } = await renderRoute(
      "calendar",
      NARROW,
      "Dias e horários",
    );

    const titles = Array.from(
      container.querySelectorAll(".agenda-group-title"),
    ).map((title) => title.textContent);
    expect(titles).toEqual([
      "Quando você atende",
      "Como a IA oferece horários",
      "Como você vê a Agenda",
    ]);
  });

  test("a tela da Agenda não tem formulário de regras nem de política", async () => {
    await renderRoute("calendar", NARROW, "Dias e horários");
    await screen.findByRole("button", { name: /^Dias visíveis/ });

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Cancelar ou remarcar pelo WhatsApp"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Salvar (política|regras)/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Na prática", { exact: false }),
    ).not.toBeInTheDocument();
  });

  test("Dias visíveis abre a folha e grava a preferência inteira pelo mesmo pedido", async () => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: "WEEK",
    });
    updateAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0],
      initialView: "WEEK",
    });
    const user = userEvent.setup();
    await renderRoute("calendar", NARROW, "Dias e horários");

    await user.click(
      await screen.findByRole("button", { name: /^Dias visíveis/ }),
    );
    await user.click(screen.getByRole("button", { name: "Domingo" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(updateAgendaViewPreference).toHaveBeenCalledWith({
        hiddenWeekdays: [0],
        initialView: "WEEK",
      }),
    );
    expect(updateAgendaViewPreference).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("Preferências da Agenda salvas.", { ignore: "script, style, .toast-stack *" }),
    ).toBeVisible();
  });

  test("Visualização inicial abre a folha e grava pelo mesmo pedido", async () => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0],
      initialView: null,
    });
    updateAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0],
      initialView: "MONTH",
    });
    const user = userEvent.setup();
    await renderRoute("calendar", NARROW, "Dias e horários");

    await user.click(
      await screen.findByRole("button", { name: /^Visualização inicial/ }),
    );
    await user.click(screen.getByRole("button", { name: "Mês" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(updateAgendaViewPreference).toHaveBeenCalledWith({
        hiddenWeekdays: [0],
        initialView: "MONTH",
      }),
    );
    expect(updateAgendaViewPreference).toHaveBeenCalledTimes(1);
  });

  test("a folha recusa ocultar todos os dias", async () => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: null,
    });
    updateAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [1, 2, 3, 4, 5, 6],
      initialView: null,
    });
    const user = userEvent.setup();
    await renderRoute("calendar", NARROW, "Dias e horários");

    await user.click(
      await screen.findByRole("button", { name: /^Dias visíveis/ }),
    );
    for (const day of [
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
    ]) {
      await user.click(screen.getByRole("button", { name: day }));
    }

    const last = screen.getByRole("button", { name: "Domingo" });
    expect(last).toBeDisabled();
    expect(
      screen.getByText("Pelo menos um dia precisa aparecer na Agenda."),
    ).toBeVisible();
    await user.click(last);
    expect(last).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(updateAgendaViewPreference).toHaveBeenCalledTimes(1),
    );
    expect(updateAgendaViewPreference).toHaveBeenCalledWith({
      hiddenWeekdays: [1, 2, 3, 4, 5, 6],
      initialView: null,
    });
  });
});

describe("Goal097 prova 2: resumos da Agenda (funções)", () => {
  type Rule = Parameters<
    (typeof AgendaSummariesModule)["availabilityGridSummary"]
  >[0][number];
  const rule = (
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    active = true,
  ): Rule => ({ active, dayOfWeek, endTime, startTime });

  test("agrupa dias seguidos com os mesmos horários", async () => {
    const { availabilityGridSummary } = await loadSummaries();

    expect(
      availabilityGridSummary([
        rule(1, "09:00", "18:00"),
        rule(2, "09:00", "18:00"),
        rule(3, "09:00", "18:00"),
        rule(4, "09:00", "18:00"),
        rule(5, "09:00", "18:00"),
        rule(6, "09:00", "14:00"),
      ]),
    ).toBe("Seg–Sex 09:00–18:00 · Sáb 09:00–14:00");
  });

  test("junta dois intervalos no mesmo dia, em ordem de início", async () => {
    const { availabilityGridSummary } = await loadSummaries();

    expect(
      availabilityGridSummary([
        rule(1, "14:00", "18:00"),
        rule(1, "09:00", "12:00"),
        rule(2, "09:00", "12:00"),
        rule(2, "14:00", "18:00"),
      ]),
    ).toBe("Seg–Ter 09:00–12:00 e 14:00–18:00");
  });

  test("um dia isolado não se junta ao vizinho com horário diferente nem ao dia não adjacente", async () => {
    const { availabilityGridSummary } = await loadSummaries();

    expect(
      availabilityGridSummary([
        rule(1, "09:00", "18:00"),
        rule(3, "09:00", "18:00"),
        rule(4, "10:00", "16:00"),
      ]),
    ).toBe("Seg 09:00–18:00 · Qua 09:00–18:00 · Qui 10:00–16:00");
  });

  test("o domingo vem depois do sábado e junta com ele", async () => {
    const { availabilityGridSummary } = await loadSummaries();

    expect(
      availabilityGridSummary([
        rule(0, "10:00", "14:00"),
        rule(6, "10:00", "14:00"),
      ]),
    ).toBe("Sáb–Dom 10:00–14:00");
  });

  test("sem regra ativa diz que não há dia de atendimento", async () => {
    const { availabilityGridSummary } = await loadSummaries();

    expect(availabilityGridSummary([])).toBe("Nenhum dia de atendimento");
    expect(availabilityGridSummary([rule(1, "09:00", "18:00", false)])).toBe(
      "Nenhum dia de atendimento",
    );
  });

  test("dias visíveis e visualização inicial", async () => {
    const { initialViewSummary, visibleDaysSummary } = await loadSummaries();

    expect(visibleDaysSummary([])).toBe("Todos os dias");
    expect(visibleDaysSummary([0])).toBe("Seg–Sáb · domingo oculto");
    expect(visibleDaysSummary([0, 6])).toBe(
      "Seg–Sex · sábado e domingo ocultos",
    );
    expect(initialViewSummary(null)).toBe("Automática");
    expect(initialViewSummary("MONTH")).toBe("Mês");
  });
});

function ruleGroup(name: string): HTMLElement {
  return screen.getByRole("radiogroup", { name });
}

const LEAD_GROUP = "Com quanta antecedência a IA pode marcar";
const FUTURE_GROUP = "Até quando no futuro";
const STEP_GROUP = "Intervalo entre horários oferecidos";
const POLICY_GROUP = "Cancelar ou remarcar pelo WhatsApp";

function checkedLabel(group: HTMLElement): string {
  const checked = within(group)
    .getAllByRole("radio")
    .filter((radio) => (radio as HTMLInputElement).checked);
  expect(checked).toHaveLength(1);
  return checked[0].closest("label")?.textContent?.trim() ?? "";
}

describe("Goal097 prova 3: AG3 — /configuracoes/agenda/regras", () => {
  test("três grupos segmentados com o valor lido selecionado, mais a política", async () => {
    await renderRoute("calendar-rules", NARROW, LEAD_GROUP);

    expect(checkedLabel(ruleGroup(LEAD_GROUP))).toBe("2 h");
    expect(checkedLabel(ruleGroup(FUTURE_GROUP))).toBe("60 dias");
    expect(checkedLabel(ruleGroup(STEP_GROUP))).toBe("30 min");
    expect(checkedLabel(ruleGroup(POLICY_GROUP))).toBe("Até 24 h antes");
    expect(
      within(ruleGroup(LEAD_GROUP))
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent?.trim()),
    ).toEqual(["1 h", "2 h", "4 h", "1 dia"]);
  });

  test("valor fora da lista ganha uma opção extra já selecionada, inclusive antecedência 0", async () => {
    settingsGet.mockResolvedValue(
      settingsFixture({
        availability: availabilityFixture({
          customerChangeMinNoticeMinutes: 90,
          granularityMinutes: 20,
          maxLeadDays: 45,
          minLeadMinutes: 0,
        }),
      }),
    );
    await renderRoute("calendar-rules", NARROW, LEAD_GROUP);

    expect(checkedLabel(ruleGroup(LEAD_GROUP))).toBe("Sem antecedência mínima");
    expect(checkedLabel(ruleGroup(FUTURE_GROUP))).toBe("45 dias");
    expect(checkedLabel(ruleGroup(STEP_GROUP))).toBe("20 min");
    expect(checkedLabel(ruleGroup(POLICY_GROUP))).toBe("Até 90 min antes");
  });

  test("política 0 aparece como Sem restrição, selecionada", async () => {
    settingsGet.mockResolvedValue(
      settingsFixture({
        availability: availabilityFixture({
          customerChangeMinNoticeMinutes: 0,
        }),
      }),
    );
    await renderRoute("calendar-rules", NARROW, LEAD_GROUP);

    expect(checkedLabel(ruleGroup(POLICY_GROUP))).toBe("Sem restrição");
  });

  test("um único Salvar envia um só PATCH com os quatro campos, o timezone lido e as rules lidas", async () => {
    updateAvailability.mockImplementation(
      async (input: AvailabilitySettingsInput) => ({
        ...input,
        rules: input.rules.map((entry, index) => ({
          ...entry,
          id: `n${index}`,
        })),
      }),
    );
    const user = userEvent.setup();
    await renderRoute("calendar-rules", NARROW, LEAD_GROUP);

    await user.click(
      within(ruleGroup(LEAD_GROUP)).getByRole("radio", { name: "4 h" }),
    );
    await user.click(
      within(ruleGroup(FUTURE_GROUP)).getByRole("radio", { name: "90 dias" }),
    );
    await user.click(
      within(ruleGroup(STEP_GROUP)).getByRole("radio", { name: "15 min" }),
    );
    await user.click(
      within(ruleGroup(POLICY_GROUP)).getByRole("radio", {
        name: "Até 12 h antes",
      }),
    );
    expect(screen.getAllByRole("button", { name: "Salvar" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateAvailability).toHaveBeenCalledTimes(1));
    expect(updateAvailability).toHaveBeenCalledWith({
      customerChangeMinNoticeMinutes: 720,
      granularityMinutes: 15,
      maxLeadDays: 90,
      minLeadMinutes: 240,
      rules: [
        { active: true, dayOfWeek: 1, endTime: "18:00", startTime: "09:00" },
        { active: true, dayOfWeek: 2, endTime: "18:00", startTime: "09:00" },
        { active: true, dayOfWeek: 3, endTime: "18:00", startTime: "09:00" },
        { active: true, dayOfWeek: 4, endTime: "18:00", startTime: "09:00" },
        { active: true, dayOfWeek: 5, endTime: "18:00", startTime: "09:00" },
        { active: true, dayOfWeek: 6, endTime: "14:00", startTime: "09:00" },
        { active: false, dayOfWeek: 0, endTime: "12:00", startTime: "08:00" },
      ],
      timezone: "America/Fortaleza",
    });
    expect(await screen.findByText("Regras da Agenda salvas.", { ignore: "script, style, .toast-stack *" })).toBeVisible();
  });

  test("falha ao salvar mostra erro e não perde a edição", async () => {
    updateAvailability.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    await renderRoute("calendar-rules", NARROW, LEAD_GROUP);

    await user.click(
      within(ruleGroup(LEAD_GROUP)).getByRole("radio", { name: "1 dia" }),
    );
    await user.click(
      within(ruleGroup(POLICY_GROUP)).getByRole("radio", {
        name: "Até 48 h antes",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar as regras da Agenda.",
    );
    expect(checkedLabel(ruleGroup(LEAD_GROUP))).toBe("1 dia");
    expect(checkedLabel(ruleGroup(POLICY_GROUP))).toBe("Até 48 h antes");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });
});

// 13:45 em America/Sao_Paulo (UTC-3), com a Agenda no fuso do negócio.
const NOW_13_45 = new Date("2026-10-03T16:45:00.000Z");
const SAO_PAULO = "America/Sao_Paulo";

describe("Goal097 prova 3: Na prática (função, relógio fixo)", () => {
  test("13:45, 2 h de antecedência e passo de 30 min", async () => {
    const { offerPreview } = await loadOfferPreview();

    expect(
      offerPreview({
        granularityMinutes: 30,
        minLeadMinutes: 120,
        now: NOW_13_45,
        timeZone: SAO_PAULO,
      }),
    ).toEqual({
      legend:
        "Só a partir de 15:45, em passos de 30 min. A IA mostra até três opções por vez.",
      nowLabel: "13:45",
      pills: ["16:00", "16:30", "17:00"],
      struck: ["14:00", "15:30"],
    });
  });

  test("antecedência de 1 dia move o bloco para o dia seguinte", async () => {
    const { offerPreview } = await loadOfferPreview();

    const preview = offerPreview({
      granularityMinutes: 30,
      minLeadMinutes: 1_440,
      now: NOW_13_45,
      timeZone: SAO_PAULO,
    });
    expect(preview.legend).toBe(
      "Só a partir de amanhã às 13:45, em passos de 30 min. A IA mostra até três opções por vez.",
    );
    expect(preview.pills).toEqual(["14:00", "14:30", "15:00"]);
    expect(preview.struck).toEqual(["13:30"]);
  });

  test("o intervalo muda os passos e o fuso muda o relógio", async () => {
    const { offerPreview } = await loadOfferPreview();

    expect(
      offerPreview({
        granularityMinutes: 60,
        minLeadMinutes: 120,
        now: NOW_13_45,
        timeZone: SAO_PAULO,
      }),
    ).toMatchObject({
      pills: ["16:00", "17:00", "18:00"],
      struck: ["14:00", "15:00"],
    });
    expect(
      offerPreview({
        granularityMinutes: 30,
        minLeadMinutes: 120,
        now: NOW_13_45,
        timeZone: "America/Manaus",
      }).nowLabel,
    ).toBe("12:45");
  });
});

describe("Goal097 prova 3: Na prática (na tela, antes de salvar)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW_13_45);
    settingsGet.mockResolvedValue(
      settingsFixture({
        availability: availabilityFixture({
          granularityMinutes: 30,
          minLeadMinutes: 120,
          timezone: SAO_PAULO,
        }),
      }),
    );
  });

  function example(): HTMLElement {
    return screen.getByRole("region", { name: "Na prática" });
  }

  test("mostra o exemplo com horários riscados, opções oferecidas e a legenda", async () => {
    await renderRoute("calendar-rules", NARROW, LEAD_GROUP);

    const block = example();
    expect(block).toHaveTextContent("Na prática · agora são 13:45");
    expect(
      Array.from(block.querySelectorAll("s")).map((time) => time.textContent),
    ).toEqual(["14:00", "15:30"]);
    expect(
      Array.from(block.querySelectorAll(".rules-example-pill")).map(
        (time) => time.textContent,
      ),
    ).toEqual(["16:00", "16:30", "17:00"]);
    expect(block).toHaveTextContent(
      "Só a partir de 15:45, em passos de 30 min.",
    );
  });

  test("trocar a antecedência e o intervalo na tela muda o bloco sem salvar", async () => {
    const user = userEvent.setup();
    await renderRoute("calendar-rules", NARROW, LEAD_GROUP);

    await user.click(
      within(ruleGroup(STEP_GROUP)).getByRole("radio", { name: "15 min" }),
    );
    expect(example()).toHaveTextContent("em passos de 15 min");
    expect(
      Array.from(example().querySelectorAll(".rules-example-pill")).map(
        (time) => time.textContent,
      ),
    ).toEqual(["15:45", "16:00", "16:15"]);

    await user.click(
      within(ruleGroup(LEAD_GROUP)).getByRole("radio", { name: "1 dia" }),
    );
    expect(example()).toHaveTextContent("Só a partir de amanhã às 13:45");
    expect(
      Array.from(example().querySelectorAll(".rules-example-pill")).map(
        (time) => time.textContent,
      ),
    ).toEqual(["13:45", "14:00", "14:15"]);
    expect(updateAvailability).not.toHaveBeenCalled();
  });
});

describe("Goal097 prova 4: /configuracoes/agenda/lembretes", () => {
  test("mostra a seção de lembretes como tela empurrada, com voltar para a Agenda", async () => {
    const { container } = await renderRoute(
      "calendar-reminders",
      NARROW,
      "Pedir confirmação de presença",
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Lembretes" }),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Pedir confirmação de presença"),
    ).toBeChecked();
    const back = screen.getByRole("link", { name: "Voltar para Agenda" });
    expect(back).toHaveAttribute("href", "/configuracoes/agenda");
    expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
    expect(container.querySelector('nav[class$="bottom-nav"]')).toBeNull();
    expect(container.querySelector(".list-detail")).toBeNull();
  });
});

const SHELL_ROUTES: Array<{
  name: string;
  ready: string | RegExp;
  scenario: Parameters<typeof SettingsScreen>[0]["scenario"];
}> = [
  { name: "/configuracoes", ready: "Atendimento", scenario: "hub" },
  {
    name: "/configuracoes/agenda",
    ready: "Dias e horários",
    scenario: "calendar",
  },
  {
    name: "/configuracoes/agenda/regras",
    ready: LEAD_GROUP,
    scenario: "calendar-rules",
  },
  {
    name: "/configuracoes/agenda/lembretes",
    ready: "Pedir confirmação de presença",
    scenario: "calendar-reminders",
  },
];

describe("Goal097 prova 5: casca", () => {
  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)(
    "uma chamada de useShellConfig por árvore nas quatro rotas, na faixa %s",
    async (_label, width) => {
      for (const route of SHELL_ROUTES) {
        shellCallers.clear();
        const { unmount } = await renderRoute(
          route.scenario,
          width,
          route.ready,
        );
        await waitFor(() => {
          expect(shellCallers.size, route.name).toBe(1);
        });
        unmount();
      }
    },
  );

  test.each(SHELL_ROUTES.slice(1))(
    "$name, de 1024 px em diante, mostra a lista com Agenda marcada",
    async (route) => {
      const { container } = await renderRoute(
        route.scenario,
        WIDE,
        route.ready,
      );

      const list = container.querySelector<HTMLElement>(".list-detail-list");
      expect(list).not.toBeNull();
      expect(list).toHaveAttribute("aria-label", "Configurações");
      await waitFor(() => {
        const current = (list as HTMLElement).querySelectorAll(
          '[aria-current="page"]',
        );
        expect(current).toHaveLength(1);
        expect(current[0]?.textContent ?? "").toMatch(/^Agenda/);
      });
      expect(
        within(container).getAllByRole("heading", { level: 1 }),
      ).toHaveLength(1);
    },
  );

  test.each(SHELL_ROUTES.slice(1))(
    "$name, abaixo de 1024 px, é tela empurrada sem a lista",
    async (route) => {
      const { container } = await renderRoute(
        route.scenario,
        NARROW,
        route.ready,
      );

      expect(container.querySelector(".list-detail")).toBeNull();
      expect(container.querySelector(".app-frame.is-pushed")).not.toBeNull();
    },
  );

  test("/configuracoes/disponibilidade, de 1024 px em diante, marca Agenda na lista", async () => {
    const { container } = await renderRoute(
      "availability",
      WIDE,
      "Disponibilidade",
    );

    const list = container.querySelector<HTMLElement>(".list-detail-list");
    await waitFor(() => {
      const current = (list as HTMLElement).querySelectorAll(
        '[aria-current="page"]',
      );
      expect(current).toHaveLength(1);
      expect(current[0]?.textContent ?? "").toMatch(/^Agenda/);
    });
  });

  test("o hub, de 1024 px em diante, marca Negócio na lista (seção aberta)", async () => {
    const { container } = await renderRoute("hub", WIDE, "Atendimento");

    const list = container.querySelector<HTMLElement>(".list-detail-list");
    await waitFor(() => {
      const current = (list as HTMLElement).querySelectorAll(
        '[aria-current="page"]',
      );
      expect(current).toHaveLength(1);
      expect(current[0]?.textContent ?? "").toMatch(/^Negócio/);
    });
  });
});
