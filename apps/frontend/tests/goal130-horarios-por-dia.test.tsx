// @vitest-environment jsdom
/**
 * Goal130/WU-01 — "Personalizar dias diferentes" leva à tela "Horários por dia"
 * (quadro 2.7), na mesma etapa e na mesma URL: sete linhas de segunda a
 * domingo, o tom só no dia diferente do intervalo-base, o ajuste por linha, a
 * cópia para os outros dias e "Salvar horários", que grava o que está na tela.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

import { expectNoA11yViolations } from "./support/a11y";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: { get: getOnboarding, update: updateOnboarding },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

type RuleSeed = { dayOfWeek: number; startTime: string; endTime: string };

function stateWith(rules: RuleSeed[] | null): OnboardingState {
  return {
    ai: { tone: null },
    availability:
      rules === null
        ? null
        : {
            customerChangeMinNoticeMinutes: 0,
            granularityMinutes: 30,
            maxLeadDays: 90,
            minLeadMinutes: 0,
            rules: rules.map((rule) => ({
              ...rule,
              active: true,
              id: `rule-${rule.dayOfWeek}`,
            })),
            timezone: "America/Sao_Paulo",
          },
    business: null,
    calendar: { integration: null, source: null, timezone: null },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
  };
}

const weekdays = (start: string, end: string): RuleSeed[] =>
  [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    endTime: end,
    startTime: start,
  }));

/** O horário do quadro 2.7: segunda a sexta 09:00–18:00 e sábado 09:00–14:00,
 * sem domingo. */
const quadro: RuleSeed[] = [
  ...weekdays("09:00", "18:00"),
  { dayOfWeek: 6, endTime: "14:00", startTime: "09:00" },
];

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(stateWith(null));
  refreshSession.mockResolvedValue(null);
});

async function renderHorarios(rules: RuleSeed[] | null) {
  getOnboarding.mockResolvedValue(stateWith(rules));
  const user = userEvent.setup();
  const view = render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="horarios" />
    </OnboardingRuntimeProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return { ...view, user };
}

const personalize = () =>
  screen.getByRole("button", { name: "Personalizar dias diferentes" });
const dayRow = (day: string) =>
  screen.getByRole("button", { name: new RegExp(`^${day}`) });
const dayContainer = (day: string) =>
  dayRow(day).closest<HTMLElement>(".hours-day");

type SavedRule = {
  active: boolean;
  dayOfWeek: number;
  endTime: string;
  startTime: string;
};

function savedRules(): SavedRule[] {
  const [patch] = updateOnboarding.mock.calls.at(-1) as [
    { availability: { rules: SavedRule[] } },
  ];
  return patch.availability.rules;
}

describe("abrir e voltar: a tela por dia é da mesma etapa", () => {
  test("o horário-base abre com o título e o texto de hoje, e o chevron é o link de sempre", async () => {
    await renderHorarios(weekdays("09:00", "18:00"));

    expect(
      screen.getByRole("heading", { level: 1, name: "Qual é seu horário de atendimento?" }),
    ).toBeVisible();
    expect(
      screen.getByText(/^Vale para segunda a sexta\./),
    ).toBeVisible();
    expect(screen.getByLabelText("Começa")).toHaveValue("09:00");
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute(
      "href",
      "/onboarding/dias-de-atendimento",
    );
    expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeVisible();
  });

  test("Personalizar dias diferentes abre Horários por dia com o texto do quadro, sem navegar", async () => {
    const { user } = await renderHorarios(weekdays("09:00", "18:00"));
    await user.click(personalize());

    expect(
      screen.getByRole("heading", { level: 1, name: "Horários por dia" }),
    ).toBeVisible();
    expect(
      screen.getByText("Toque em um horário para ajustar só aquele dia."),
    ).toBeVisible();
    expect(screen.queryByLabelText("Começa")).toBeNull();
    // O eyebrow continua o da etapa.
    expect(screen.getAllByText("Sua agenda").length).toBeGreaterThan(0);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // O rodapé troca "Continuar" por "Salvar horários".
    expect(screen.getByRole("button", { name: "Salvar horários" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  });

  test("a leitura com um dia diferente do intervalo-base abre a tela por dia", async () => {
    await renderHorarios(quadro);

    expect(
      screen.getByRole("heading", { level: 1, name: "Horários por dia" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Personalizar dias diferentes" })).toBeNull();
    // Aberta pela leitura, a tela não rouba o foco.
    expect(
      screen.getByRole("heading", { level: 1, name: "Horários por dia" }),
    ).not.toHaveFocus();
  });

  test("a leitura com o mesmo intervalo em todos os dias abre o horário-base", async () => {
    await renderHorarios(weekdays("09:00", "18:00"));
    expect(personalize()).toBeVisible();
    expect(
      screen.queryByRole("heading", { level: 1, name: "Horários por dia" }),
    ).toBeNull();
  });

  test("na tela por dia o chevron é um botão: volta ao horário-base e devolve os dias ao intervalo-base", async () => {
    const { user } = await renderHorarios(quadro);

    expect(screen.queryByRole("link", { name: "Voltar" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(personalize()).toBeVisible();
    expect(screen.getByLabelText("Começa")).toHaveValue("09:00");
    expect(screen.getByLabelText("Termina")).toHaveValue("18:00");
    expect(screen.getByRole("link", { name: "Voltar" })).toBeVisible();
    expect(push).not.toHaveBeenCalled();

    // Os dias voltaram ao intervalo-base: o que se grava é o que está na tela.
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    expect(
      savedRules().every(
        (rule) => rule.startTime === "09:00" && rule.endTime === "18:00",
      ),
    ).toBe(true);
    expect(savedRules().find((rule) => rule.dayOfWeek === 6)?.endTime).toBe(
      "18:00",
    );
  });

  test("o foco vai ao título ao abrir e volta ao cartão ao voltar", async () => {
    const { user } = await renderHorarios(weekdays("09:00", "18:00"));
    await user.click(personalize());
    expect(
      screen.getByRole("heading", { level: 1, name: "Horários por dia" }),
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(personalize()).toHaveFocus();
  });

  test("a tela por dia não tem violação de acessibilidade", async () => {
    const { container } = await renderHorarios(quadro);
    await expectNoA11yViolations(container);
  });
});

describe("as sete linhas do cartão", () => {
  test("de segunda a domingo, cada dia marcado com o seu intervalo", async () => {
    await renderHorarios(quadro);

    const names = screen
      .getAllByText(/^(Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo)$/)
      .map((node) => node.textContent);
    expect(names).toEqual([
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "Domingo",
    ]);
    expect(dayRow("Segunda")).toHaveAccessibleName("Segunda 09:00 – 18:00");
    expect(dayRow("Sexta")).toHaveAccessibleName("Sexta 09:00 – 18:00");
    expect(dayRow("Sábado")).toHaveAccessibleName("Sábado 09:00 – 14:00");
  });

  test("o dia sem atendimento diz Não atende e não é controle", async () => {
    await renderHorarios(quadro);

    expect(screen.getByText("Não atende")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Domingo/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    const domingo = screen.getByText("Domingo").closest(".hours-day");
    expect(domingo?.querySelector("button")).toBeNull();
  });

  test("só o dia diferente do intervalo-base ganha o tom e o lápis", async () => {
    await renderHorarios(quadro);

    expect(dayContainer("Sábado")).toHaveClass("is-different");
    expect(dayRow("Sábado").querySelector(".hours-day-pencil")).not.toBeNull();
    for (const day of ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]) {
      expect(dayContainer(day)).not.toHaveClass("is-different");
      expect(dayRow(day).querySelector(".hours-day-pencil")).toBeNull();
    }
    expect(
      screen.getByText("Domingo").closest(".hours-day"),
    ).not.toHaveClass("is-different");
  });

  test("a folha de estilo porta os valores do quadro 2.7", () => {
    const css = readFileSync(
      resolve(__dirname, "../src/shared/styles/avenly.css"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const rule = (selector: string): string => {
      const start = css.indexOf(`\n${selector} {`);
      expect(start, selector).toBeGreaterThan(-1);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(rule(".hours-day-card")).toContain("border-radius: 16px");
    expect(rule(".hours-day-row")).toContain("height: 52px");
    expect(rule(".hours-day-row")).toContain("padding: 0 16px");
    expect(rule(".hours-day.is-different")).toContain(
      "background: var(--at-color-primary-tint)",
    );
    expect(rule(".hours-day.is-different .hours-day-range")).toContain(
      "color: #0b4a4e",
    );
    expect(rule(".hours-day.is-different .hours-day-range")).toContain(
      "font-weight: 600",
    );
    expect(rule(".hours-day.is-off .hours-day-row")).toContain(
      "color: var(--muted)",
    );
    const tokens = readFileSync(
      resolve(__dirname, "../src/shared/styles/tokens.css"),
      "utf8",
    );
    expect(tokens).toContain("--at-color-primary-tint: #edf4f3");
  });
});

describe("ajustar um dia", () => {
  test("tocar a linha abre só os campos daquele dia, um dia por vez", async () => {
    const { user } = await renderHorarios(quadro);

    expect(screen.queryByLabelText("Sábado · Início")).toBeNull();
    expect(dayRow("Sábado")).toHaveAttribute("aria-expanded", "false");

    await user.click(dayRow("Sábado"));
    expect(dayRow("Sábado")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Sábado · Início")).toHaveValue("09:00");
    expect(screen.getByLabelText("Sábado · Fim")).toHaveValue("14:00");
    expect(screen.queryByLabelText("Sexta · Início")).toBeNull();

    await user.click(dayRow("Sexta"));
    expect(screen.getByLabelText("Sexta · Início")).toHaveValue("09:00");
    expect(screen.getByLabelText("Sexta · Fim")).toHaveValue("18:00");
    expect(screen.queryByLabelText("Sábado · Início")).toBeNull();
    expect(dayRow("Sábado")).toHaveAttribute("aria-expanded", "false");

    await user.click(dayRow("Sexta"));
    expect(screen.queryByLabelText("Sexta · Início")).toBeNull();
  });

  test("mudar o fim muda a linha e o tom; voltar ao intervalo-base tira o tom", async () => {
    const { user } = await renderHorarios(quadro);

    await user.click(dayRow("Segunda"));
    const end = screen.getByLabelText("Segunda · Fim");
    await user.clear(end);
    await user.type(end, "17:00");
    expect(dayRow("Segunda")).toHaveAccessibleName("Segunda 09:00 – 17:00");
    expect(dayContainer("Segunda")).toHaveClass("is-different");
    expect(dayRow("Segunda").querySelector(".hours-day-pencil")).not.toBeNull();

    await user.clear(end);
    await user.type(end, "18:00");
    expect(dayRow("Segunda")).toHaveAccessibleName("Segunda 09:00 – 18:00");
    expect(dayContainer("Segunda")).not.toHaveClass("is-different");
    expect(dayRow("Segunda").querySelector(".hours-day-pencil")).toBeNull();
  });

  test("fim antes do início marca o campo final do dia e não grava", async () => {
    const { user } = await renderHorarios(quadro);

    await user.click(dayRow("Sábado"));
    const end = screen.getByLabelText("Sábado · Fim");
    await user.clear(end);
    await user.type(end, "08:00");
    await user.click(screen.getByRole("button", { name: "Salvar horários" }));

    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription(
      "O horário final deve ser depois do horário inicial.",
    );
    expect(end).toHaveFocus();
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("um dia com fim antes do início não fecha ao tocar outra linha", async () => {
    const { user } = await renderHorarios(quadro);

    await user.click(dayRow("Sábado"));
    const end = screen.getByLabelText("Sábado · Fim");
    await user.clear(end);
    await user.type(end, "08:00");
    await user.click(dayRow("Sexta"));

    // O campo inválido continua na tela para o envio da etapa o conferir.
    expect(screen.getByLabelText("Sábado · Fim")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Salvar horários" }));
    expect(updateOnboarding).not.toHaveBeenCalled();
  });
});

describe("Copiar para outros dias", () => {
  test("sem dia diferente não há link", async () => {
    const { user } = await renderHorarios(weekdays("09:00", "18:00"));
    await user.click(personalize());
    expect(screen.queryByRole("button", { name: /^Copiar / })).toBeNull();
  });

  test("com um dia diferente o link leva o nome do dia, em minúsculas", async () => {
    await renderHorarios(quadro);
    expect(
      screen.getByRole("button", { name: "Copiar sábado para outros dias" }),
    ).toBeVisible();
  });

  test("sem ajuste na tela, o dia do link é o último dia diferente", async () => {
    await renderHorarios([
      { dayOfWeek: 1, endTime: "12:00", startTime: "08:00" },
      { dayOfWeek: 2, endTime: "18:00", startTime: "09:00" },
      { dayOfWeek: 3, endTime: "13:00", startTime: "08:00" },
      { dayOfWeek: 4, endTime: "18:00", startTime: "09:00" },
      { dayOfWeek: 5, endTime: "18:00", startTime: "09:00" },
    ]);
    expect(
      screen.getByRole("button", { name: "Copiar quarta para outros dias" }),
    ).toBeVisible();
  });

  test("com ajuste na tela, o dia do link é o último dia ajustado", async () => {
    const { user } = await renderHorarios(quadro);

    await user.click(dayRow("Sexta"));
    const start = screen.getByLabelText("Sexta · Início");
    await user.clear(start);
    await user.type(start, "10:00");

    expect(
      screen.getByRole("button", { name: "Copiar sexta para outros dias" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Copiar sábado para outros dias" }),
    ).toBeNull();
  });

  test("copiar iguala os dias marcados, esvazia as diferenças e o link some, sem gravar", async () => {
    const { user } = await renderHorarios(quadro);
    await user.click(
      screen.getByRole("button", { name: "Copiar sábado para outros dias" }),
    );

    for (const day of ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]) {
      expect(dayRow(day)).toHaveAccessibleName(`${day} 09:00 – 14:00`);
      expect(dayContainer(day)).not.toHaveClass("is-different");
    }
    expect(screen.getByText("Não atende")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Copiar / })).toBeNull();
    expect(updateOnboarding).not.toHaveBeenCalled();

    // O intervalo-base virou o do dia copiado e nenhum dia ficou personalizado.
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByLabelText("Começa")).toHaveValue("09:00");
    expect(screen.getByLabelText("Termina")).toHaveValue("14:00");
  });

  test("copiar e salvar grava o intervalo copiado em todos os dias marcados", async () => {
    const { user } = await renderHorarios(quadro);
    await user.click(
      screen.getByRole("button", { name: "Copiar sábado para outros dias" }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar horários" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    expect(savedRules()).toEqual(
      [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        active: true,
        dayOfWeek,
        endTime: "14:00",
        startTime: "09:00",
      })),
    );
  });
});

describe("Salvar horários", () => {
  test("grava uma regra por dia marcado com o intervalo de cada um e segue para a agenda pronta", async () => {
    const { user } = await renderHorarios(quadro);
    expect(updateOnboarding).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Salvar horários" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/agenda-avenly-pronta"),
    );
    expect(updateOnboarding).toHaveBeenCalledWith({
      availability: {
        rules: [
          ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
            active: true,
            dayOfWeek,
            endTime: "18:00",
            startTime: "09:00",
          })),
          { active: true, dayOfWeek: 6, endTime: "14:00", startTime: "09:00" },
        ],
        timezone: "America/Sao_Paulo",
      },
    });
  });

  test("nada é gravado antes de salvar", async () => {
    const { user } = await renderHorarios(weekdays("09:00", "18:00"));
    await user.click(personalize());
    await user.click(dayRow("Quarta"));
    const end = screen.getByLabelText("Quarta · Fim");
    await user.clear(end);
    await user.type(end, "12:00");
    await user.click(
      screen.getByRole("button", { name: "Copiar quarta para outros dias" }),
    );
    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("no horário-base, Continuar grava o mesmo de sempre", async () => {
    const { user } = await renderHorarios(weekdays("09:00", "18:00"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/agenda-avenly-pronta"),
    );
    expect(savedRules()).toEqual(
      [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        active: true,
        dayOfWeek,
        endTime: "18:00",
        startTime: "09:00",
      })),
    );
  });
});
