// @vitest-environment jsdom
/**
 * D-197: mensagem de exemplo do lembrete. O que a suíte prova:
 *
 * - a composição da prévia segue o exemplo e preenche os fatos, com os mesmos
 *   textos de apps/ai-orchestrator/tests/reminders/notification-message.test.ts
 *   ("reminder message example") — mude os dois lados juntos;
 * - "Editar mensagem" abre o campo com o texto inicial do estilo, a prévia
 *   acompanha o que é digitado, "Restaurar padrão" volta ao padrão;
 * - salvar manda o texto só quando ele muda, `null` quando volta ao padrão, e
 *   recusa data, horário, valor ou campo desconhecido sem chamar a API.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  AiTone,
  ReminderSettings,
  ReminderSettingsInput,
  SettingsState,
} from "@/data";
import {
  composeReminderPreviewText,
  defaultReminderMessageExample,
  type ReminderPreviewFacts,
} from "@/features/reminders/reminderPreview";
import { ReminderSettingsSection } from "@/features/reminders/ReminderSettingsSection";

import { expectNoA11yViolations } from "./support/a11y";

const getReminders = vi.fn();
const updateReminders = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    serviceCatalog: { list: listServices },
    settings: { getReminders, updateReminders },
  }),
}));

function facts(
  overrides: Partial<ReminderPreviewFacts> = {},
): ReminderPreviewFacts {
  return {
    customerName: "Ana",
    subject: "Corte",
    date: "2026-09-16",
    time: "14:30",
    price: null,
    confirmationRequested: false,
    ...overrides,
  };
}

const casual = (overrides: Partial<ReminderPreviewFacts>) =>
  composeReminderPreviewText({ style: "CASUAL", facts: facts(overrides) });

describe("composição pela mensagem de exemplo (mesmos textos do ai-orchestrator)", () => {
  test("segue o exemplo e preenche os fatos", () => {
    expect(
      casual({
        messageExample:
          "Oii, {nome}! Tudo bem? 😊\n\nPassando pra lembrar do seu {servico} {data}, às {hora}.\nLembre de vir sem rímel 😉",
      }),
    ).toBe(
      "Oii, Ana! Tudo bem? 😊\n\nPassando pra lembrar do seu Corte na quarta-feira, 16/09, às 14h30.\n\nLembre de vir sem rímel 😉",
    );
  });

  test("pergunta a confirmação no fim, quando pedida", () => {
    expect(
      casual({
        confirmationRequested: true,
        messageExample: "Oii, {nome}!\nSeu {servico} é {data}, às {hora}.",
      }),
    ).toBe(
      "Oii, Ana!\n\nSeu Corte é na quarta-feira, 16/09, às 14h30.\n\nConfirma pra mim? Pode responder sim ou não 💛",
    );
  });

  test("põe o valor logo depois da frase do atendimento", () => {
    expect(
      casual({
        price: 150,
        messageExample:
          "Oi, {nome}!\nTe espero {data}, às {hora}, para {servico}.\nBeijos 💛",
      }),
    ).toBe(
      "Oi, Ana!\n\nTe espero na quarta-feira, 16/09, às 14h30, para Corte.\n\nValor: R$ 150,00.\n\nBeijos 💛",
    );
  });

  test("inclui a frase padrão quando faltam serviço, data ou horário", () => {
    expect(
      casual({
        price: 80,
        messageExample: "Oii, {nome}! 😊\nLembre de vir sem rímel 😉",
      }),
    ).toBe(
      "Oii, Ana! 😊\n\nPassando para lembrar do seu atendimento de Corte na quarta-feira, 16/09, às 14h30.\n\nValor: R$ 80,00.\n\nLembre de vir sem rímel 😉",
    );
  });

  test("sem nome, tira o nome e a vírgula", () => {
    expect(
      casual({
        customerName: "  ",
        messageExample:
          "Oii, {nome}! Tudo bem?\n{nome}\nSeu {servico} é {data}, às {hora}.",
      }),
    ).toBe("Oii! Tudo bem?\n\nSeu Corte é na quarta-feira, 16/09, às 14h30.");
  });

  test("volta ao padrão quando o exemplo não serve", () => {
    const standard = casual({});
    expect(casual({ messageExample: "Oi, {nome}! {endereco}" })).toBe(standard);
    expect(casual({ messageExample: "   " })).toBe(standard);
    expect(
      casual({
        subject: null,
        messageExample: "Oi!\nSeu {servico} é {data}, às {hora}.",
      }),
    ).toBe(casual({ subject: null }));
  });

  test("o texto inicial do editor, aplicado, é o lembrete padrão", () => {
    for (const style of ["PROFESSIONAL", "BALANCED", "CASUAL"] as const) {
      const sample = facts({ confirmationRequested: true });
      expect(
        composeReminderPreviewText({
          style,
          facts: {
            ...sample,
            messageExample: defaultReminderMessageExample(style),
          },
        }),
      ).toBe(composeReminderPreviewText({ style, facts: sample }));
    }
  });
});

function remindersFixture(
  overrides: Partial<ReminderSettings> = {},
): ReminderSettings {
  return {
    configured: true,
    confirmationEnabled: true,
    pricePolicy: "NEVER",
    rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
    ...overrides,
  };
}

function settingsFixture(tone: AiTone = "CASUAL"): SettingsState {
  return {
    ai: { enabled: false, tone },
    availability: null,
    business: null,
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

const preview = () =>
  screen.getByRole("region", { name: "Assim chega para a cliente" });
const bubbleText = () =>
  preview().querySelector(".reminders-preview-bubble")?.textContent ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  listServices.mockResolvedValue({
    items: [
      { active: true, name: "Aplicação 5D", price: 150, priceType: "FIXED" },
    ],
  });
  getReminders.mockResolvedValue(remindersFixture());
  updateReminders.mockImplementation(async (input: ReminderSettingsInput) =>
    remindersFixture({ messageExample: input.messageExample ?? null }),
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  // 2026-10-18 é domingo: o dia seguinte é segunda-feira, 19/10.
  vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("editar a mensagem", () => {
  test("abre o campo com o texto inicial do estilo e a prévia acompanha", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReminderSettingsSection settings={settingsFixture()} />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Editar mensagem" }),
    );
    const field = screen.getByLabelText("Sua mensagem de exemplo");
    expect(field).toHaveValue(
      "Oii, {nome}! Tudo bem? 😊\n\nPassando para lembrar do seu atendimento de {servico} {data}, às {hora}.",
    );
    expect(field).toHaveAccessibleDescription(
      /Nome, serviço, data e horário entram sempre certos/,
    );

    await user.clear(field);
    await user.type(field, "Oii, {{nome}! 💛{Enter}Lembre de vir sem rímel 😉");
    const bubble = bubbleText();
    expect(bubble).toBe(
      "Oii, Ana! 💛\n\nPassando para lembrar do seu atendimento de Aplicação 5D na segunda-feira, 19/10, às 15h30.\n\nLembre de vir sem rímel 😉\n\nConfirma pra mim? Pode responder sim ou não 💛",
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(updateReminders).toHaveBeenCalledTimes(1));
    expect(updateReminders).toHaveBeenCalledWith({
      confirmationEnabled: true,
      pricePolicy: "NEVER",
      messageExample: "Oii, {nome}! 💛\nLembre de vir sem rímel 😉",
      rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
    });
    expect(await screen.findByText("Lembretes salvos.")).toBeVisible();
    // Salvo, o editor fecha e a prévia continua com o texto dela.
    expect(
      screen.queryByLabelText("Sua mensagem de exemplo"),
    ).not.toBeInTheDocument();
    expect(
      within(preview()).getByText(/Lembre de vir sem rímel/),
    ).toBeVisible();
  });

  test("'Restaurar padrão' volta ao padrão e grava null", async () => {
    const user = userEvent.setup();
    getReminders.mockResolvedValue(
      remindersFixture({ messageExample: "Oi, {nome}! Até lá 💛" }),
    );
    render(<ReminderSettingsSection settings={settingsFixture()} />);

    expect(
      within(
        await screen.findByRole("region", {
          name: "Assim chega para a cliente",
        }),
      ).getByText(/Até lá 💛/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Editar mensagem" }));
    await user.click(screen.getByRole("button", { name: "Restaurar padrão" }));
    expect(screen.getByLabelText("Sua mensagem de exemplo")).toHaveValue(
      defaultReminderMessageExample("CASUAL"),
    );
    expect(
      screen.queryByRole("button", { name: "Restaurar padrão" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(updateReminders).toHaveBeenCalledTimes(1));
    expect(updateReminders).toHaveBeenCalledWith(
      expect.objectContaining({ messageExample: null }),
    );
  });

  test("texto igual ao inicial e sem mudança não vai no corpo", async () => {
    const user = userEvent.setup();
    render(<ReminderSettingsSection settings={settingsFixture()} />);

    await user.click(
      await screen.findByRole("button", { name: "Editar mensagem" }),
    );
    const field = screen.getByLabelText("Sua mensagem de exemplo");
    await user.type(field, " ");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateReminders).toHaveBeenCalledTimes(1));
    expect(updateReminders.mock.calls[0][0]).not.toHaveProperty(
      "messageExample",
    );
  });

  test("recusa horário escrito à mão sem chamar a API", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReminderSettingsSection settings={settingsFixture()} />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Editar mensagem" }),
    );
    const field = screen.getByLabelText("Sua mensagem de exemplo");
    await user.clear(field);
    await user.type(field, "Te espero às 15h30!");

    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      /Escreva \{hora\} no lugar do horário/,
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(updateReminders).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Revise a mensagem de exemplo.",
    );
    await expectNoA11yViolations(container);
  });

  test("sem lembretes não há o que editar", async () => {
    getReminders.mockResolvedValue(remindersFixture({ rules: [] }));
    render(<ReminderSettingsSection settings={settingsFixture()} />);

    expect(await screen.findByText("Nenhum lembrete é enviado.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Editar mensagem" }),
    ).not.toBeInTheDocument();
  });
});
