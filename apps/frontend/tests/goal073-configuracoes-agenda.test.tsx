// @vitest-environment jsdom
/**
 * Goal073 (WU-04), revisto no Goal097 (AG1 e AG3): política de cancelamento/remarcação e "Como você vê a
 * Agenda" em Configurações, mais as observações 2 e 5 do review067.
 *
 * O que esta suíte prova:
 *
 * - `OfferRulesSettings` (`/configuracoes/agenda/regras`) mostra "Cancelar
 *   ou remarcar pelo WhatsApp" com o valor lido selecionado, inclusive `customerChangeMinNoticeMinutes: 0` e
 *   um valor fora das opções; salvar reenvia o prazo junto das `rules` e das
 *   regras de oferta lidas sem mudança;
 * - um único "Salvar" grava os quatro campos num só pedido, com uma só
 *   mensagem, e a falha mostra erro sem perder a edição (D-116 revê o botão e
 *   a mensagem de cada painel de D-086 item 4);
 * - "Como você vê a Agenda" mostra e grava os dias visíveis e a visualização
 *   inicial, cada um na própria folha; com leitura falhada, o "Salvar" da
 *   folha fica desabilitado;
 * - `OtherInfoSection` não aceita digitação enquanto a leitura está pendente
 *   nem depois de uma leitura falhada (observação 2 do review067);
 * - `AvailabilitySettings.toggleDay` recusa ligar um dia no limite de 28
 *   regras, com texto de produto e sem PATCH (observação 5 do review067).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { SettingsState } from "@/data";
import { OtherInfoSection } from "@/features/knowledge/OtherInfoSection";
import { AvailabilitySettings } from "@/features/settings/AvailabilitySettings";
import { CalendarSettings } from "@/features/settings/CalendarSettings";
import { OfferRulesSettings } from "@/features/settings/OfferRulesSettings";

const getSettings = vi.fn();
const getReminders = vi.fn();
const updateAvailability = vi.fn();
const getAgendaViewPreference = vi.fn();
const updateAgendaViewPreference = vi.fn();
const getOtherInfo = vi.fn();
const saveOtherInfo = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    knowledge: { getOtherInfo, saveOtherInfo },
    settings: {
      get: getSettings,
      getAgendaViewPreference,
      getReminders,
      updateAgendaViewPreference,
      updateAvailability,
    },
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe("Cancelar ou remarcar pelo WhatsApp", () => {
  test("mostra o valor lido selecionado, inclusive 0", () => {
    render(<OfferRulesSettings settings={settingsFixture()} onSaved={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "Sem restrição" })).toBeChecked();
  });

  test("valor gravado fora das opções aparece selecionado como opção extra", () => {
    const settings = settingsFixture({
      availability: {
        ...settingsFixture().availability!,
        customerChangeMinNoticeMinutes: 90,
      },
    });
    render(<OfferRulesSettings settings={settings} onSaved={vi.fn()} />);

    expect(
      screen.getByRole("radio", { name: "Até 90 min antes" }),
    ).toBeChecked();
  });

  test("gravar a política envia o prazo com as rules e as regras de oferta lidas sem mudança", async () => {
    const settings = settingsFixture();
    updateAvailability.mockResolvedValue(settings.availability);
    const user = userEvent.setup();
    render(<OfferRulesSettings settings={settings} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: "Até 24 h antes" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(updateAvailability).toHaveBeenCalledWith({
        customerChangeMinNoticeMinutes: 1_440,
        granularityMinutes: 30,
        maxLeadDays: 90,
        minLeadMinutes: 0,
        timezone: "America/Sao_Paulo",
        rules: [
          { active: true, dayOfWeek: 1, endTime: "18:00", startTime: "09:00" },
        ],
      }),
    );
  });
});

// Goal097 (AG3, revê D-086 item 4): os quatro campos moram na mesma tela e
// um único "Salvar" grava todos num só pedido, com uma só mensagem.
describe("Antecedência e intervalos: um só Salvar grava os quatro campos", () => {
  function saveStatus(): HTMLElement {
    return screen.getByRole("status");
  }

  test("antecedência e política editadas juntas vão no mesmo pedido, com uma mensagem só", async () => {
    const settings = settingsFixture();
    updateAvailability.mockResolvedValue({
      ...settings.availability!,
      customerChangeMinNoticeMinutes: 1_440,
      minLeadMinutes: 240,
    });
    const user = userEvent.setup();
    render(<OfferRulesSettings settings={settings} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: "4 h" }));
    await user.click(screen.getByRole("radio", { name: "Até 24 h antes" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateAvailability).toHaveBeenCalledTimes(1));
    expect(updateAvailability).toHaveBeenCalledWith({
      customerChangeMinNoticeMinutes: 1_440,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 240,
      timezone: "America/Sao_Paulo",
      rules: [
        { active: true, dayOfWeek: 1, endTime: "18:00", startTime: "09:00" },
      ],
    });
    await waitFor(() =>
      expect(saveStatus()).toHaveTextContent("Regras da Agenda salvas."),
    );
  });

  test("política editada antes da antecedência também vai junto, sem edição ficar para trás", async () => {
    const settings = settingsFixture();
    updateAvailability.mockResolvedValue({
      ...settings.availability!,
      customerChangeMinNoticeMinutes: 1_440,
      minLeadMinutes: 240,
    });
    const user = userEvent.setup();
    render(<OfferRulesSettings settings={settings} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: "Até 24 h antes" }));
    await user.click(screen.getByRole("radio", { name: "4 h" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateAvailability).toHaveBeenCalledTimes(1));
    expect(updateAvailability).toHaveBeenCalledWith({
      customerChangeMinNoticeMinutes: 1_440,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 240,
      timezone: "America/Sao_Paulo",
      rules: [
        { active: true, dayOfWeek: 1, endTime: "18:00", startTime: "09:00" },
      ],
    });
  });

  test("depois de gravar, o Salvar seguinte reenvia o valor recém-gravado", async () => {
    const settings = settingsFixture();
    const savedOffer = { ...settings.availability!, minLeadMinutes: 240 };
    updateAvailability.mockResolvedValueOnce(savedOffer).mockResolvedValueOnce({
      ...savedOffer,
      customerChangeMinNoticeMinutes: 720,
    });
    const onSaved = vi.fn<(state: SettingsState) => void>();
    const user = userEvent.setup();
    const view = render(
      <OfferRulesSettings settings={settings} onSaved={onSaved} />,
    );

    await user.click(screen.getByRole("radio", { name: "4 h" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    // A tela-mãe devolve o estado gravado como nova prop.
    view.rerender(
      <OfferRulesSettings
        settings={onSaved.mock.calls[0][0]}
        onSaved={onSaved}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Até 12 h antes" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateAvailability).toHaveBeenCalledTimes(2));
    expect(updateAvailability).toHaveBeenLastCalledWith(
      expect.objectContaining({
        customerChangeMinNoticeMinutes: 720,
        minLeadMinutes: 240,
      }),
    );
  });

  test("falha ao salvar mostra erro de tela e não perde a edição", async () => {
    updateAvailability.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(
      <OfferRulesSettings settings={settingsFixture()} onSaved={vi.fn()} />,
    );

    await user.click(screen.getByRole("radio", { name: "Até 48 h antes" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar as regras da Agenda.",
    );
    expect(screen.getByRole("radio", { name: "Até 48 h antes" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });
});

// Goal097 (AG1): "Dias visíveis" e "Visualização inicial" são linhas que abrem
// uma folha com o controle de antes e um "Salvar"; o pedido é o mesmo.
describe("Como você vê a Agenda", () => {
  test("mostra os dias visíveis e a visualização inicial lidos", async () => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0, 6],
      initialView: "WEEK",
    });
    const user = userEvent.setup();
    render(<CalendarSettings settings={settingsFixture()} />);

    const daysRow = await screen.findByRole("button", {
      name: /^Dias visíveis.+/,
    });
    expect(daysRow).toHaveTextContent("Seg–Sex · sábado e domingo ocultos");
    expect(
      screen.getByRole("button", { name: /^Visualização inicial.+/ }),
    ).toHaveTextContent("Semana");

    await user.click(daysRow);
    expect(screen.getByRole("button", { name: "Domingo" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Sábado" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Segunda" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    await user.click(
      screen.getByRole("button", { name: /^Visualização inicial.+/ }),
    );
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("ocultar um dia e escolher a visualização inicial grava a preferência inteira a cada folha", async () => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: null,
    });
    updateAgendaViewPreference
      .mockResolvedValueOnce({ hiddenWeekdays: [0], initialView: null })
      .mockResolvedValueOnce({ hiddenWeekdays: [0], initialView: "DAY" });
    const user = userEvent.setup();
    render(<CalendarSettings settings={settingsFixture()} />);

    await user.click(
      await screen.findByRole("button", { name: /^Dias visíveis.+/ }),
    );
    await user.click(screen.getByRole("button", { name: "Domingo" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(updateAgendaViewPreference).toHaveBeenNthCalledWith(1, {
        hiddenWeekdays: [0],
        initialView: null,
      }),
    );

    await user.click(
      await screen.findByRole("button", { name: /^Visualização inicial.+/ }),
    );
    await user.click(screen.getByRole("button", { name: "Dia" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(updateAgendaViewPreference).toHaveBeenNthCalledWith(2, {
        hiddenWeekdays: [0],
        initialView: "DAY",
      }),
    );
  });

  test("leitura falhada desabilita salvar", async () => {
    getAgendaViewPreference.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    render(<CalendarSettings settings={settingsFixture()} />);

    await user.click(
      await screen.findByRole("button", { name: "Dias visíveis" }),
    );
    await screen.findByText(
      "Não foi possível carregar as preferências da Agenda agora. Atualize a página e tente de novo.",
    );
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });
});

describe("Outras informações importantes: somente leitura durante a leitura", () => {
  test("não aceita digitação enquanto a leitura está pendente", async () => {
    let resolveRead: ((value: { content: string }) => void) | undefined;
    getOtherInfo.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<OtherInfoSection />);

    const field = screen.getByLabelText("Conteúdo");
    await user.type(field, "Tentando digitar");
    expect(field).toHaveValue("");

    resolveRead?.({ content: "Texto salvo" });
    await waitFor(() => expect(field).toHaveValue("Texto salvo"));
  });

  test("não aceita digitação depois de uma leitura falhada", async () => {
    getOtherInfo.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    render(<OtherInfoSection />);

    await screen.findByText(
      "Não foi possível carregar o texto salvo agora. Atualize a página e tente de novo.",
    );
    const field = screen.getByLabelText("Conteúdo");
    await user.type(field, "Tentando digitar");
    expect(field).toHaveValue("");
  });
});

describe("Disponibilidade: limite de 28 regras ao ligar um dia", () => {
  test("ligar um dia no limite recusa com texto de produto e não envia", async () => {
    const rules = Array.from({ length: 28 }, (_, index) => ({
      active: true,
      dayOfWeek: 1,
      endTime: `${10 + index}:00`,
      id: `r${index}`,
      startTime: `${9 + index}:00`,
    }));
    const settings = settingsFixture({
      availability: { ...settingsFixture().availability!, rules },
    });
    const user = userEvent.setup();
    render(<AvailabilitySettings settings={settings} onSaved={vi.fn()} />);

    await user.click(screen.getByLabelText("Terça"));

    expect(updateAvailability).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Você já tem 28 intervalos na Disponibilidade. Remova um intervalo para ligar este dia.",
      ),
    ).toBeVisible();
  });
});
