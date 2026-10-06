// @vitest-environment jsdom
/**
 * Goal125 (WU-03, AG2): tela de Lembretes portada do quadro. O que a suíte
 * prova:
 *
 * - a tela: título "Lembretes", chips 48/24/12/2 h com `aria-pressed`, "Outro"
 *   com o campo "Minutos antes" só quando aberto, segundo lembrete, desativar,
 *   confirmação (checkbox nativo) e controle de preço;
 * - salvar: um único PATCH com o mesmo corpo de antes, só em "Salvar", com uma
 *   ou duas regras, desligado e com valor em "Outro"; validação de 1 a 43200 e
 *   as duas mensagens;
 * - a prévia muda com confirmação e preço antes de salvar, usa o estilo da IA,
 *   o serviço do catálogo, o dia seguinte no fuso do negócio e a nota de preço
 *   nas duas políticas;
 * - uma única chamada de `useShellConfig` por árvore, abaixo e a partir de
 *   1024 px.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AiTone, ReminderSettings, SettingsState } from "@/data";
import { ReminderSettingsSection } from "@/features/reminders/ReminderSettingsSection";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import * as ShellConfig from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getSettings = vi.fn();
const getWhatsapp = vi.fn();
const getReminders = vi.fn();
const updateReminders = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/layout/ShellConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof ShellConfig>();
  return { ...actual, useShellConfig: vi.fn(actual.useShellConfig) };
});

// O painel de Configurações (a partir de 1024 px) lê o status da IA e do
// WhatsApp; esta suíte não monta `SystemStatusProvider`.
vi.mock("@/shared/runtime/systemStatus", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    useSystemStatus: () => ({
      ai: null,
      aiView: "off",
      phase: "loaded",
      whatsapp: null,
      whatsappView: "off",
    }),
  };
});

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    migration: {
      getImportState: vi.fn().mockResolvedValue({
        history: null,
        right: { available: false, completedAt: null, sessionId: null },
        session: null,
      }),
    },
    serviceCatalog: { list: listServices },
    settings: {
      get: getSettings,
      getAgendaViewPreference: vi.fn().mockResolvedValue({
        hiddenWeekdays: [],
        initialView: null,
      }),
      getReminders,
      updateReminders,
    },
    retention: { get: vi.fn().mockResolvedValue(null) },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
    session: { user: { email: "camila@example.com" } },
    setUnauthenticated: vi.fn(),
  }),
}));

function remindersFixture(
  overrides: Partial<ReminderSettings> = {},
): ReminderSettings {
  return {
    configured: true,
    confirmationEnabled: false,
    pricePolicy: "NEVER",
    rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
    ...overrides,
  };
}

function settingsFixture(
  overrides: { tone?: AiTone | null; timezone?: string } = {},
): SettingsState {
  return {
    ai: { enabled: false, tone: overrides.tone ?? null },
    availability: null,
    business: overrides.timezone
      ? ({ timezone: overrides.timezone } as unknown as SettingsState["business"])
      : null,
    calendar: {
      capabilities: {
        createAppointments: false,
        manageAvailability: false,
        manageCustomers: false,
        manageServices: false,
        migrate: false,
      },
      integration: null,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
  };
}

function service(
  overrides: Partial<{
    active: boolean;
    name: string;
    price: number | null;
    priceType: "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";
  }> = {},
) {
  return {
    active: true,
    name: "Corte feminino",
    price: 80,
    priceType: "FIXED" as const,
    ...overrides,
  };
}

function mockWideLayout(wide: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: wide && query.includes("min-width: 1024px"),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
    writable: true,
  });
}

function renderSection(settings: SettingsState = settingsFixture()) {
  return render(<ReminderSettingsSection settings={settings} />);
}

const preview = () =>
  screen.getByRole("region", { name: "Assim chega para a cliente" });

beforeEach(() => {
  vi.clearAllMocks();
  listServices.mockResolvedValue({ items: [] });
  getReminders.mockResolvedValue(remindersFixture());
  updateReminders.mockResolvedValue(remindersFixture());
  getWhatsapp.mockResolvedValue(null);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("a tela", () => {
  test("mostra os chips, com 24 h marcado, e o 'Outro' sem campo", async () => {
    renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    for (const [name, pressed] of [
      ["48 h", "false"],
      ["24 h", "true"],
      ["12 h", "false"],
      ["2 h", "false"],
      ["Outro", "false"],
    ] as const) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        pressed,
      );
    }
    expect(screen.queryByLabelText("Minutos antes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeVisible();
  });

  test("'Outro' abre o campo 'Minutos antes' e desmarca os chips", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Outro" }));

    expect(screen.getByRole("button", { name: "Outro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "24 h" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByLabelText("Minutos antes")).toHaveValue(1_440);

    await user.click(screen.getByRole("button", { name: "12 h" }));
    expect(screen.queryByLabelText("Minutos antes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "12 h" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("um valor fora dos chips abre 'Outro' sozinho", async () => {
    getReminders.mockResolvedValue(
      remindersFixture({ rules: [{ slot: "FIRST", leadMinutes: 90 }] }),
    );
    renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    expect(screen.getByRole("button", { name: "Outro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Minutos antes")).toHaveValue(90);
  });

  test("segundo lembrete, desativar e ativar", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      await screen.findByRole("button", { name: "Adicionar segundo lembrete" }),
    );
    expect(screen.getByText("Lembrete 2 · quanto tempo antes")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remover segundo lembrete" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Desativar lembretes" }));
    expect(
      screen.queryByText("Lembrete 1 · quanto tempo antes"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ativar lembretes" }));
    expect(screen.getByText("Lembrete 1 · quanto tempo antes")).toBeVisible();
  });

  test("confirmação é checkbox nativo e o preço é um controle com aria-pressed", async () => {
    const user = userEvent.setup();
    renderSection();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Pedir confirmação de presença",
    });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    expect(screen.getByRole("button", { name: "Nunca" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Só quando for fixo" }));
    expect(screen.getByRole("button", { name: "Nunca" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "Só quando for fixo" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("sem violações de acessibilidade", async () => {
    vi.useRealTimers();
    const { container } = renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    await expectNoA11yViolations(container);
  });
});

describe("salvar", () => {
  test("não grava nada antes de 'Salvar' e grava uma vez, com uma regra", async () => {
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    await user.click(screen.getByRole("button", { name: "12 h" }));
    await user.click(screen.getByRole("checkbox"));
    expect(updateReminders).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateReminders).toHaveBeenCalledTimes(1));
    expect(updateReminders).toHaveBeenCalledWith({
      confirmationEnabled: true,
      pricePolicy: "NEVER",
      rules: [{ slot: "FIRST", leadMinutes: 720 }],
    });
    expect(await screen.findByText("Lembretes salvos.")).toBeVisible();
  });

  test("com dois lembretes", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      await screen.findByRole("button", { name: "Adicionar segundo lembrete" }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateReminders).toHaveBeenCalledTimes(1));
    expect(updateReminders).toHaveBeenCalledWith({
      confirmationEnabled: false,
      pricePolicy: "NEVER",
      rules: [
        { slot: "FIRST", leadMinutes: 1_440 },
        { slot: "SECOND", leadMinutes: 120 },
      ],
    });
  });

  test("desligado envia rules vazio", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      await screen.findByRole("button", { name: "Desativar lembretes" }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateReminders).toHaveBeenCalledTimes(1));
    expect(updateReminders).toHaveBeenCalledWith({
      confirmationEnabled: false,
      pricePolicy: "NEVER",
      rules: [],
    });
  });

  test("com valor em 'Outro'", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Outro" }));
    const minutes = screen.getByLabelText("Minutos antes");
    await user.clear(minutes);
    await user.type(minutes, "90");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateReminders).toHaveBeenCalledTimes(1));
    expect(updateReminders).toHaveBeenCalledWith({
      confirmationEnabled: false,
      pricePolicy: "NEVER",
      rules: [{ slot: "FIRST", leadMinutes: 90 }],
    });
  });

  test.each(["0", "43201"])(
    "valor %s em 'Outro' é recusado, sem requisição",
    async (value) => {
      const user = userEvent.setup();
      renderSection();

      await user.click(await screen.findByRole("button", { name: "Outro" }));
      const minutes = screen.getByLabelText("Minutos antes");
      await user.clear(minutes);
      await user.type(minutes, value);
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      expect(
        await screen.findByText(
          "A antecedência deve ser de 1 minuto até 30 dias.",
        ),
      ).toBeVisible();
      expect(updateReminders).not.toHaveBeenCalled();
    },
  );

  test.each([["1"], ["43200"]])("valor %s em 'Outro' é aceito", async (value) => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Outro" }));
    const minutes = screen.getByLabelText("Minutos antes");
    await user.clear(minutes);
    await user.type(minutes, value);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateReminders).toHaveBeenCalledTimes(1));
  });

  test("mostra 'Salvando...' e depois a mensagem de sucesso", async () => {
    let finish: (state: ReminderSettings) => void = () => undefined;
    updateReminders.mockReturnValue(
      new Promise<ReminderSettings>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Salvar" }));

    const saving = await screen.findByRole("button", { name: "Salvando..." });
    expect(saving).toBeDisabled();
    finish(remindersFixture());
    expect(await screen.findByText("Lembretes salvos.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  test("falha ao salvar mostra a mensagem de erro", async () => {
    updateReminders.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("Não foi possível salvar os lembretes."),
    ).toBeVisible();
  });
});

describe("a prévia", () => {
  test("estilo equilibrado quando a IA não tem tom, sem serviço, dia seguinte", async () => {
    renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    expect(
      preview().querySelector(".reminders-preview-bubble")?.textContent,
    ).toBe(
      "Oi, Ana! Tudo bem?\n\n" +
        "Passando para lembrar do seu atendimento na quarta-feira, 07/10, às 15h30.\n\n" +
        "Qualquer coisa, é só me chamar!",
    );
  });

  test.each([
    ["PROFESSIONAL", "Olá, Ana."],
    ["BALANCED", "Oi, Ana! Tudo bem?"],
    ["CASUAL", "Oii, Ana! Tudo bem? 😊"],
  ] as const)("estilo %s", async (tone, greeting) => {
    renderSection(settingsFixture({ tone }));

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    expect(
      preview().querySelector(".reminders-preview-bubble")?.textContent,
    ).toMatch(new RegExp(`^${greeting.replace(/[.?!]/g, "\\$&")}\\n\\n`));
  });

  test("a confirmação troca o fecho da mensagem antes de salvar", async () => {
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    expect(preview()).toHaveTextContent("Qualquer coisa, é só me chamar!");

    await user.click(screen.getByRole("checkbox"));

    expect(preview()).toHaveTextContent(
      "Você confirma sua presença? É só responder sim ou não.",
    );
    expect(preview()).not.toHaveTextContent("Qualquer coisa, é só me chamar!");
    expect(updateReminders).not.toHaveBeenCalled();
  });

  test("o preço de serviço fixo entra só na política 'Só quando for fixo'", async () => {
    listServices.mockResolvedValue({ items: [service()] });
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    expect(preview()).toHaveTextContent("atendimento de Corte feminino");
    expect(preview()).not.toHaveTextContent("Valor: R$ 80,00.");
    expect(preview()).toHaveTextContent(
      "Endereço só se ela perguntar. Sem preço, como configurado.",
    );

    await user.click(screen.getByRole("button", { name: "Só quando for fixo" }));

    expect(preview()).toHaveTextContent("Valor: R$ 80,00.");
    expect(preview()).toHaveTextContent(
      "Endereço só se ela perguntar. Com o valor quando o serviço tem preço fixo.",
    );
  });

  test("serviço sem preço fixo não mostra valor, mas a nota de preço aparece", async () => {
    listServices.mockResolvedValue({
      items: [service({ price: 80, priceType: "STARTING_AT" })],
    });
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    await user.click(screen.getByRole("button", { name: "Só quando for fixo" }));

    expect(preview()).not.toHaveTextContent("Valor:");
    expect(preview()).toHaveTextContent(
      "Com o valor quando o serviço tem preço fixo.",
    );
  });

  test("usa o primeiro serviço ativo", async () => {
    listServices.mockResolvedValue({
      items: [
        service({ active: false, name: "Antigo" }),
        service({ name: "Escova" }),
      ],
    });
    renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    expect(preview()).toHaveTextContent("atendimento de Escova");
    expect(preview()).not.toHaveTextContent("Antigo");
  });

  test("falha ao ler o catálogo vira 'sem serviço' e a tela continua", async () => {
    listServices.mockRejectedValue(new Error("falhou"));
    renderSection();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    expect(preview()).toHaveTextContent(
      "Passando para lembrar do seu atendimento na quarta-feira",
    );
  });

  test("o dia seguinte segue o fuso do negócio, não o UTC", async () => {
    vi.setSystemTime(new Date("2026-10-06T20:00:00Z"));
    renderSection(settingsFixture({ timezone: "Asia/Tokyo" }));

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    expect(preview()).toHaveTextContent("na quinta-feira, 08/10, às 15h30");
  });

  test("sem lembretes: 'Nenhum lembrete é enviado.' e sem nota de preço", async () => {
    getReminders.mockResolvedValue(remindersFixture({ rules: [] }));
    renderSection();

    await screen.findByRole("button", { name: "Ativar lembretes" });
    expect(
      within(preview()).getByText("Nenhum lembrete é enviado."),
    ).toBeVisible();
    expect(preview()).not.toHaveTextContent("Endereço só se ela perguntar.");
    expect(
      preview().querySelector(".reminders-preview-bubble"),
    ).not.toBeInTheDocument();
  });

  test("desativar lembretes troca a prévia por 'Nenhum lembrete é enviado.'", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      await screen.findByRole("button", { name: "Desativar lembretes" }),
    );

    expect(
      within(preview()).getByText("Nenhum lembrete é enviado."),
    ).toBeVisible();
  });
});

describe("useShellConfig: uma chamada por árvore", () => {
  async function renderScreen() {
    getSettings.mockResolvedValue(settingsFixture());
    render(
      <ShellConfigProvider>
        <ProductSettingsScreen scenario="calendar-reminders" />
      </ShellConfigProvider>,
    );
    await screen.findByText("Lembrete 1 · quanto tempo antes");
  }

  test.each([
    ["abaixo de 1024 px", false],
    ["a partir de 1024 px", true],
  ])("%s", async (_name, wide) => {
    mockWideLayout(wide);
    const spy = vi.mocked(ShellConfig.useShellConfig);

    await renderScreen();

    expect(spy).toHaveBeenCalled();
    expect(
      screen.getAllByRole("heading", { level: 1, name: "Lembretes" }),
    ).toHaveLength(1);

    // A seção não chama o hook: interagir nela não gera nova chamada.
    spy.mockClear();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "12 h" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Adicionar segundo lembrete" }),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(updateReminders).not.toHaveBeenCalled();
  });
});
