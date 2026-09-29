// @vitest-environment jsdom
/**
 * Goal024 (WU-06): fecha a mesma invariante que goal015/016/017/018/019/020/021
 * fecharam para os módulos anteriores — `ShellConfigProvider` mais a árvore
 * real de cada módulo de Configurações precisa sobreviver a montagem e
 * interação repetida sem violar a regra de uma chamada de `useShellConfig` por
 * árvore. `ProductSettingsScreen` é o único ponto do módulo inteiro que chama
 * o hook; nenhuma das seções (`SettingsHub`, `BusinessSettings`,
 * `AiSettings`, `KnowledgeSection`, `OtherInfoSection`, `WhatsAppSettings`,
 * `CalendarSettings`, `AvailabilitySettings`, `ConversationsSettings`,
 * `AccountSettings`) chama de novo. Se essa invariante for violada, React
 * lança "Maximum update depth exceeded" e a interação abaixo lança essa mesma
 * exceção, derrubando o teste — não há necessidade de capturá-la
 * explicitamente. Cada `describe` também prova, pelo heading de nível 1, que
 * o módulo certo aparece para aquele cenário.
 *
 * `WhatsAppConnectionPanel` é dublado: ele depende de `window.matchMedia`, que
 * jsdom não implementa, e sua própria invariante de shell já não existe (o
 * hook nunca foi chamado por ele) — o que esta suíte precisa provar é que
 * `WhatsAppSettings` e o restante da árvore de Configurações sobrevivem ao
 * redor dele.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { KnowledgeDocument, Service, SettingsState } from "@/data";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import type { SettingsScenario } from "@/features/settings/types";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <p>Painel de conexão do WhatsApp.</p>,
}));

const getSettings = vi.fn();
const getWhatsapp = vi.fn();
const updateBusiness = vi.fn();
const updateAi = vi.fn();
const updateAvailability = vi.fn();
const getAgendaViewPreference = vi.fn();
const updateAgendaViewPreference = vi.fn();
const getReminders = vi.fn();
const updateReminders = vi.fn();
const getRetention = vi.fn();
const updateRetention = vi.fn();
const knowledgeList = vi.fn();
const knowledgeCreate = vi.fn();
const serviceCatalogList = vi.fn();
const changePassword = vi.fn();
const logout = vi.fn();
const logoutAllDevices = vi.fn();
const refreshSession = vi.fn();
const setUnauthenticated = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    account: { requestDeletion: vi.fn(), cancelDeletion: vi.fn() },
    auth: { changePassword, logout, logoutAllDevices },
    knowledge: {
      list: knowledgeList,
      create: knowledgeCreate,
      getOtherInfo: vi.fn().mockResolvedValue({ content: "" }),
    },
    retention: { get: getRetention, update: updateRetention },
    serviceCatalog: { list: serviceCatalogList },
    settings: {
      get: getSettings,
      getAgendaViewPreference,
      getReminders,
      updateAgendaViewPreference,
      updateAi,
      updateAvailability,
      updateBusiness,
      updateReminders,
    },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession,
    session: { user: { email: "marina@studio.com" } },
    setUnauthenticated,
  }),
}));

// `AccountSettings` lê `accountDeletion` de `useSystemStatus` (Goal025/WU-08);
// esta suíte não testa o ciclo de vida da conta, só a invariante do shell, e
// não monta `SystemStatusProvider` — dublar aqui evita acoplar as duas coisas.
vi.mock("@/shared/runtime/systemStatus", () => ({
  useSystemStatus: () => ({
    accountDeletion: { status: "NONE", dueAt: null },
    phase: "loaded",
    refresh: vi.fn(),
  }),
}));

function settingsFixture(overrides: Partial<SettingsState> = {}): SettingsState {
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
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
    ...overrides,
  };
}

function serviceFixture(): Service {
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
  };
}

function knowledgeDocumentFixture(
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

function retentionFixture() {
  return {
    appliesFrom: "NEXT_SWEEP" as const,
    commercialRetentionDays: 90 as const,
    lastSweepCompletedAt: null,
    personalRetentionDays: 30 as const,
    retentionDaysOptions: [30, 90, 180, 365] as const,
    unclassifiedPurged: false as const,
  };
}

function renderScenario(scenario: SettingsScenario) {
  return render(
    <ShellConfigProvider>
      <ProductSettingsScreen scenario={scenario} />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue(settingsFixture());
  getWhatsapp.mockResolvedValue(null);
  getReminders.mockResolvedValue({
    configured: false,
    confirmationEnabled: false,
    pricePolicy: "NEVER",
    rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
  });
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [],
    initialView: null,
  });
  getRetention.mockResolvedValue(retentionFixture());
  knowledgeList.mockResolvedValue([knowledgeDocumentFixture()]);
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [serviceFixture()],
    source: "ATENDLY",
  });
});

describe("ShellConfigProvider + Hub não excede a profundidade de atualização", () => {
  test("os cartões do hub permanecem estáveis sob cliques repetidos", async () => {
    const user = userEvent.setup();
    renderScenario("hub");

    const businessCard = await screen.findByRole("link", { name: /Negócio/ });
    for (let i = 0; i < 4; i += 1) {
      await user.click(businessCard);
    }

    expect(
      screen.getByRole("heading", { level: 1, name: "Configurações" }),
    ).toBeInTheDocument();
  });

  test("o alias 'hub-external' também despacha para o Hub, sem call site próprio", async () => {
    const user = userEvent.setup();
    renderScenario("hub-external");

    const businessCard = await screen.findByRole("link", { name: /Negócio/ });
    for (let i = 0; i < 4; i += 1) {
      await user.click(businessCard);
    }

    expect(
      screen.getByRole("heading", { level: 1, name: "Configurações" }),
    ).toBeInTheDocument();
  });
});

describe("ShellConfigProvider + Negócio não excede a profundidade de atualização", () => {
  test("digita, alterna segmento e modalidade, e reabre a confirmação de fuso repetidamente", async () => {
    const user = userEvent.setup();
    renderScenario("business");

    const nameField = await screen.findByLabelText("Nome do negócio");
    await user.clear(nameField);
    await user.type(nameField, "Novo Nome do Negócio");

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "Outro" }));
      await user.click(screen.getByRole("button", { name: "Cabelo" }));
    }

    const [onSiteCheckbox] = screen.getAllByRole("checkbox");
    for (let i = 0; i < 4; i += 1) {
      await user.click(onSiteCheckbox);
      await user.click(onSiteCheckbox);
    }

    await user.selectOptions(
      screen.getByLabelText(/^Fuso horário/),
      "America/Manaus",
    );
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
      await screen.findByRole("dialog", { name: "Alterar fuso horário?" });
      await user.click(screen.getByRole("button", { name: "Manter fuso atual" }));
    }

    expect(updateBusiness).not.toHaveBeenCalled();
  });
});

describe("ShellConfigProvider + Atendente virtual não excede a profundidade de atualização", () => {
  test("alterna tom, reabre a confirmação de pausa e o diálogo de novo documento repetidamente", async () => {
    const user = userEvent.setup();
    renderScenario("ai");

    await screen.findByRole("heading", { level: 1, name: "Atendente virtual" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("radio", { name: /^Profissional/ }));
      await user.click(screen.getByRole("radio", { name: /^Descontraída/ }));
      await user.click(screen.getByRole("radio", { name: /^Equilibrada/ }));
    }

    // Goal063 §3: sem interruptor. A IA ativa oferece "Pausar atendimento",
    // com a mesma confirmação de antes.
    const pauseButton = screen.getByRole("button", { name: "Pausar atendimento" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(pauseButton);
      await screen.findByRole("dialog", { name: "Pausar atendimento automático?" });
      await user.click(screen.getByRole("button", { name: "Manter atendimento ativo" }));
    }

    await screen.findByRole("heading", { name: "Conhecimento do negócio" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "Novo documento" }));
      await screen.findByRole("dialog", { name: "Novo documento" });
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
    }

    expect(updateAi).not.toHaveBeenCalled();
    expect(knowledgeCreate).not.toHaveBeenCalled();
  });
});

describe("ShellConfigProvider + WhatsApp não excede a profundidade de atualização", () => {
  test("o link de volta a Configurações permanece estável sob cliques repetidos", async () => {
    const user = userEvent.setup();
    renderScenario("whatsapp-connected");

    await screen.findByRole("heading", { level: 1, name: "WhatsApp" });
    const back = screen.getByRole("link", { name: "Configurações" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(back);
    }

    expect(
      screen.getByRole("heading", { level: 1, name: "WhatsApp" }),
    ).toBeInTheDocument();
  });

  test.each([
    "whatsapp-disconnected",
    "whatsapp-reconnecting",
    "whatsapp-expired",
    "whatsapp-error",
  ] as const)(
    "o prefixo '%s' também despacha para WhatsAppSettings, sem call site próprio",
    async (scenario) => {
      const user = userEvent.setup();
      renderScenario(scenario);

      await screen.findByRole("heading", { level: 1, name: "WhatsApp" });
      const back = screen.getByRole("link", { name: "Configurações" });
      for (let i = 0; i < 4; i += 1) {
        await user.click(back);
      }

      expect(
        screen.getByRole("heading", { level: 1, name: "WhatsApp" }),
      ).toBeInTheDocument();
    },
  );
});

describe("ShellConfigProvider + Agenda não excede a profundidade de atualização", () => {
  test("o link de volta a Configurações permanece estável sob cliques repetidos", async () => {
    const user = userEvent.setup();
    renderScenario("calendar");

    await screen.findByRole("heading", { level: 1, name: "Agenda" });
    const back = screen.getByRole("link", { name: "Configurações" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(back);
    }

    expect(
      screen.getByRole("heading", { level: 1, name: "Agenda" }),
    ).toBeInTheDocument();
  });

  test("o alias 'calendar-external' também despacha para Agenda, sem call site próprio", async () => {
    const user = userEvent.setup();
    getSettings.mockResolvedValue(
      settingsFixture({
        calendar: {
          capabilities: {
            createAppointments: true,
            manageAvailability: false,
            manageCustomers: true,
            manageServices: true,
            migrate: true,
          },
          integration: null,
          source: "ATENDLY",
          timezone: "America/Sao_Paulo",
        },
      }),
    );
    renderScenario("calendar-external");

    await screen.findByRole("heading", { level: 1, name: "Agenda" });
    const back = screen.getByRole("link", { name: "Configurações" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(back);
    }

    expect(
      screen.getByRole("heading", { level: 1, name: "Agenda" }),
    ).toBeInTheDocument();
  });
});

describe("ShellConfigProvider + Disponibilidade não excede a profundidade de atualização", () => {
  test("alterna dias e digita os horários repetidamente", async () => {
    const user = userEvent.setup();
    renderScenario("availability");

    await screen.findByRole("heading", { level: 1, name: "Disponibilidade" });
    const monday = screen.getByRole("checkbox", { name: "Segunda" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(monday);
      await user.click(monday);
    }

    const startField = screen.getByLabelText("Segunda · início do intervalo 1");
    await user.clear(startField);
    await user.type(startField, "08:00");

    expect(updateAvailability).not.toHaveBeenCalled();
  });
});

describe("ShellConfigProvider + Conversas não excede a profundidade de atualização", () => {
  test("reabre a confirmação de redução do prazo comercial repetidamente, sem confirmar", async () => {
    const user = userEvent.setup();
    renderScenario("conversations");

    await screen.findByRole("heading", { level: 1, name: "Conversas" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(
        await screen.findByRole("button", { name: "Comercial: 30 dias" }),
      );
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "Manter prazo atual" }));
    }

    expect(updateRetention).not.toHaveBeenCalled();
  });
});

describe("ShellConfigProvider + Conta não excede a profundidade de atualização", () => {
  test("digita nos campos de senha e reabre a confirmação de sair de todos os dispositivos repetidamente", async () => {
    const user = userEvent.setup();
    renderScenario("account");

    await screen.findByRole("heading", { level: 1, name: "Conta" });
    await user.type(screen.getByLabelText("Senha atual"), "senha-atual-123");
    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-456");

    for (let i = 0; i < 4; i += 1) {
      await user.click(
        screen.getByRole("button", { name: "Sair de todos os dispositivos" }),
      );
      await screen.findByRole("dialog", {
        name: "Encerrar o acesso em todos os aparelhos?",
      });
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
    }

    expect(logoutAllDevices).not.toHaveBeenCalled();
  });
});
