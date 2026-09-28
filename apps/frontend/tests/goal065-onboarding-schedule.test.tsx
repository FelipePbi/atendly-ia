// @vitest-environment jsdom
/**
 * Goal065/WU-03 — Primeiro serviço numa etapa só (nome, duração e preço nos
 * quatro tipos, sem `onboardingPriceType` nem conversão), "Serviços
 * adicionais" opcional por `POST /v1/services` sem trocar o serviço do
 * onboarding, dias de segunda a domingo, horário-base com "Personalizar dias
 * diferentes" (uma regra por dia) e o resumo de "Agenda pronta" sem texto de
 * desenvolvimento nem "Fonte oficial".
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState, Service } from "@/data";
import {
  OnboardingRuntimeProvider,
} from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

const push = vi.fn();
const replace = vi.fn();
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (href: string): void => {
    redirectMock(href);
  },
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const refreshSession = vi.fn();
const listServiceCatalog = vi.fn();
const createServiceCatalog = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: { get: getOnboarding, update: updateOnboarding },
    serviceCatalog: { create: createServiceCatalog, list: listServiceCatalog },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

function emptyState(): OnboardingState {
  return {
    ai: { tone: null },
    availability: null,
    business: null,
    calendar: { integration: null, source: null, timezone: null },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
  };
}

function stateFixture(
  overrides: Partial<OnboardingState> = {},
): OnboardingState {
  return { ...emptyState(), ...overrides };
}

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 60,
    id: "svc-1",
    name: "Corte",
    needsReview: false,
    price: 100,
    priceType: "FIXED",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
  refreshSession.mockResolvedValue(null);
  listServiceCatalog.mockResolvedValue({
    editable: true,
    items: [],
    source: "ATENDLY",
  });
});

async function renderStep(scenario: string, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  const user = userEvent.setup();
  render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario as never} />
    </OnboardingRuntimeProvider>,
  );
  return user;
}

describe("servico-nome: os quatro tipos gravam e releem sem conversão", () => {
  test.each([
    ["FIXED", "Fixo"],
    ["STARTING_AT", "A partir de"],
    ["ON_REQUEST", "Sob consulta"],
    ["NOT_INFORMED", "Sem preço"],
  ] as const)(
    "um serviço lido como %s mostra o chip \"%s\" já selecionado",
    async (priceType, label) => {
      await renderStep(
        "servico-nome",
        stateFixture({ service: serviceFixture({ priceType, price: priceType === "FIXED" || priceType === "STARTING_AT" ? 80 : null }) }),
      );
      expect(
        await screen.findByRole("button", { name: label }),
      ).toHaveAttribute("aria-pressed", "true");
    },
  );

  test("Fixo exige valor e grava name+duration+price+priceType numa chamada só", async () => {
    const user = await renderStep("servico-nome", emptyState());
    await user.type(
      await screen.findByLabelText("Nome do serviço"),
      "Corte feminino",
    );
    const duration = screen.getByLabelText("Duração em minutos");
    await user.clear(duration);
    await user.type(duration, "45");
    await user.type(screen.getByLabelText("Preço em reais"), "150");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        service: {
          active: true,
          durationMinutes: 45,
          id: undefined,
          name: "Corte feminino",
          price: 150,
          priceType: "FIXED",
        },
      }),
    );
    expect(push).toHaveBeenCalledWith("/onboarding/servicos-adicionais");
  });

  test("Sob consulta não pede valor e grava price nulo", async () => {
    const user = await renderStep("servico-nome", emptyState());
    await user.type(
      await screen.findByLabelText("Nome do serviço"),
      "Consultoria",
    );
    await user.click(screen.getByRole("button", { name: "Sob consulta" }));
    expect(screen.queryByLabelText("Preço em reais")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { service: { price: number | null; priceType: string } },
    ];
    expect(patch.service.price).toBeNull();
    expect(patch.service.priceType).toBe("ON_REQUEST");
  });

  test("um serviço existente lido como STARTING_AT continua STARTING_AT ao gravar, sem virar FIXED", async () => {
    const user = await renderStep(
      "servico-nome",
      stateFixture({
        service: serviceFixture({ priceType: "STARTING_AT", price: 80 }),
      }),
    );
    await screen.findByDisplayValue("Corte");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { service: { priceType: string } },
    ];
    expect(patch.service.priceType).toBe("STARTING_AT");
  });

  test("serviço novo começa em Fixo", async () => {
    await renderStep("servico-nome", emptyState());
    expect(
      await screen.findByRole("button", { name: "Fixo" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("servicos-adicionais: cria por POST /v1/services sem trocar o serviço do onboarding", () => {
  test("lista os serviços ativos, sem incluir o serviço do onboarding", async () => {
    listServiceCatalog.mockResolvedValue({
      editable: true,
      items: [
        serviceFixture({ id: "svc-1", name: "Corte" }),
        serviceFixture({ id: "svc-2", name: "Barba", durationMinutes: 30, price: 40 }),
      ],
      source: "ATENDLY",
    });
    await renderStep(
      "servicos-adicionais",
      stateFixture({ service: serviceFixture({ id: "svc-1" }) }),
    );

    expect(await screen.findByText("Barba")).toBeVisible();
    expect(screen.queryByText("Corte")).toBeNull();
  });

  test("Adicionar outro serviço chama POST /v1/services e mostra o criado na lista", async () => {
    createServiceCatalog.mockResolvedValue(
      serviceFixture({ id: "svc-2", name: "Barba", durationMinutes: 30, price: 40 }),
    );
    const user = await renderStep(
      "servicos-adicionais",
      stateFixture({ service: serviceFixture({ id: "svc-1" }) }),
    );

    await user.click(
      await screen.findByRole("button", { name: "Adicionar outro serviço" }),
    );
    await user.type(screen.getByLabelText("Nome do serviço"), "Barba");
    const duration = screen.getByLabelText("Duração em minutos");
    await user.clear(duration);
    await user.type(duration, "30");
    await user.type(screen.getByLabelText("Preço em reais"), "40");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(createServiceCatalog).toHaveBeenCalledWith(
        expect.objectContaining({
          active: true,
          durationMinutes: 30,
          name: "Barba",
          price: 40,
          priceType: "FIXED",
        }),
      ),
    );
    expect(await screen.findByText("Barba")).toBeVisible();
  });

  test("criar um adicional não troca o serviço mostrado em servico-nome", async () => {
    const onboardingWithOriginal = stateFixture({
      service: serviceFixture({ id: "svc-1", name: "Corte" }),
    });
    const user = await renderStep("servicos-adicionais", onboardingWithOriginal);
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/dias-de-atendimento");

    // Depois de "servicos-adicionais", "servico-nome" ainda lê o mesmo
    // serviço original pelo id, não o que acabou de ser criado.
    getOnboarding.mockResolvedValue(onboardingWithOriginal);
    render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="servico-nome" />
      </OnboardingRuntimeProvider>,
    );
    expect(await screen.findByDisplayValue("Corte")).toBeVisible();
  });

  test("Continuar segue sem exigir nenhum adicional", async () => {
    const user = await renderStep(
      "servicos-adicionais",
      stateFixture({ service: serviceFixture() }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/dias-de-atendimento");
  });

  test("com o formulário de adicional aberto e vazio, Continuar segue sem erro nem gravação", async () => {
    const user = await renderStep(
      "servicos-adicionais",
      stateFixture({ service: serviceFixture() }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Adicionar outro serviço" }),
    );
    expect(screen.getByLabelText("Nome do serviço")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(push).toHaveBeenCalledWith("/onboarding/dias-de-atendimento");
    expect(screen.getByLabelText("Nome do serviço")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(createServiceCatalog).not.toHaveBeenCalled();
  });

  test("Adicionar com o formulário vazio mostra os erros no campo, sem chamar POST /v1/services", async () => {
    const user = await renderStep(
      "servicos-adicionais",
      stateFixture({ service: serviceFixture() }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Adicionar outro serviço" }),
    );
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    const nameInput = screen.getByLabelText("Nome do serviço");
    const priceInput = screen.getByLabelText("Preço em reais");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAccessibleDescription("Informe o nome do serviço.");
    expect(priceInput).toHaveAttribute("aria-invalid", "true");
    expect(priceInput).toHaveAccessibleDescription("Informe o valor do serviço.");
    expect(nameInput).toHaveFocus();
    expect(createServiceCatalog).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("servico-nome: validação inline e recusa do servidor no campo", () => {
  test("envio vazio mostra os erros de nome e valor juntos, foca o nome e não grava", async () => {
    const user = await renderStep("servico-nome", emptyState());
    const nameInput = await screen.findByLabelText("Nome do serviço");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const priceInput = screen.getByLabelText("Preço em reais");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAccessibleDescription("Informe o nome do serviço.");
    expect(priceInput).toHaveAttribute("aria-invalid", "true");
    expect(priceInput).toHaveAccessibleDescription("Informe o valor do serviço.");
    expect(nameInput).toHaveFocus();
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("400 VALIDATION_ERROR com fieldErrors.service sobre price cai no campo do valor", async () => {
    const { BffHttpError } = await import("@/data");
    updateOnboarding.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: {
            service: ["service.price is required for FIXED and STARTING_AT."],
          },
          formErrors: [],
        },
        message: "Invalid request body.",
        requestId: "req-3",
        status: 400,
      }),
    );
    const user = await renderStep(
      "servico-nome",
      stateFixture({
        service: serviceFixture({ priceType: "STARTING_AT", price: 80 }),
      }),
    );
    await screen.findByDisplayValue("Corte");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const priceInput = await screen.findByLabelText("Valor inicial em reais");
    await waitFor(() =>
      expect(priceInput).toHaveAttribute("aria-invalid", "true"),
    );
    expect(priceInput).toHaveAccessibleDescription("Informe o valor do serviço.");
    expect(priceInput).toHaveFocus();
    expect(screen.getByLabelText("Nome do serviço")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(
      screen.queryByText("Não foi possível salvar esta etapa. Tente novamente."),
    ).toBeNull();
    expect(screen.queryByText(/service\.price/)).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});

function availabilityFixture(
  rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
): NonNullable<OnboardingState["availability"]> {
  return {
    granularityMinutes: 30,
    maxLeadDays: 90,
    minLeadMinutes: 0,
    rules: rules.map((rule) => ({
      ...rule,
      active: true,
      id: `rule-${rule.dayOfWeek}`,
    })),
    timezone: "America/Sao_Paulo",
  };
}

describe("demonstracao-da-ia: a resposta de preço segue os quatro tipos", () => {
  test.each([
    ["FIXED", 80, "O Corte custa R$ 80,00."],
    ["STARTING_AT", 80, "O Corte custa a partir de R$ 80,00."],
    ["ON_REQUEST", null, "O valor do Corte é sob consulta."],
    ["NOT_INFORMED", null, "O valor do Corte ainda não foi informado."],
  ] as const)("%s responde \"%s\"", async (priceType, price, reply) => {
    await renderStep(
      "demonstracao-da-ia",
      stateFixture({
        availability: availabilityFixture([
          { dayOfWeek: 1, endTime: "18:00", startTime: "09:00" },
        ]),
        service: serviceFixture({ price, priceType }),
      }),
    );
    expect(await screen.findByText(reply)).toBeVisible();
    // Nunca um preço inventado: "Sem preço" não vira R$ 0,00.
    expect(screen.queryByText(/R\$\s?0,00/)).toBeNull();
  });
});

describe("dias-de-atendimento: a semana começa na segunda, sem mudar os valores gravados", () => {
  test("os dias aparecem de segunda a domingo", async () => {
    await renderStep("dias-de-atendimento", emptyState());
    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "Domingo",
    ]);
  });

  test("desmarcar Segunda não muda o valor de dayOfWeek dos demais dias", async () => {
    const user = await renderStep(
      "dias-de-atendimento",
      stateFixture({
        availability: {
          granularityMinutes: 30,
          maxLeadDays: 90,
          minLeadMinutes: 0,
          rules: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
            active: true,
            dayOfWeek,
            endTime: "18:00",
            id: `rule-${dayOfWeek}`,
            startTime: "09:00",
          })),
          timezone: "America/Sao_Paulo",
        },
      }),
    );
    await user.click(await screen.findByText("Segunda"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith("/onboarding/horarios");
  });

  test("nenhum dia escolhido mostra o erro ligado ao grupo, foca o primeiro dia e não avança", async () => {
    const user = await renderStep("dias-de-atendimento", emptyState());
    // O rascunho novo começa de segunda a sexta: desmarca os cinco.
    for (const day of ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]) {
      await user.click(await screen.findByText(day));
    }
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const group = screen.getByRole("group", { name: "Dias de atendimento" });
    expect(
      screen.getByText("Escolha pelo menos um dia de atendimento."),
    ).toBeVisible();
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription(
      "Escolha pelo menos um dia de atendimento.",
    );
    expect(screen.getByRole("checkbox", { name: "Segunda" })).toHaveFocus();
    // Nada no aviso de rodapé: o erro é do grupo.
    expect(
      screen.queryAllByRole("alert").filter((alert) => !group.parentElement?.contains(alert)),
    ).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("horarios: Personalizar dias diferentes grava uma regra por dia", () => {
  test("sem personalizar, grava o mesmo intervalo em cada dia selecionado", async () => {
    const user = await renderStep(
      "horarios",
      stateFixture({
        availability: null,
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { availability: { rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }> } },
    ];
    expect(patch.availability.rules).toHaveLength(5);
    expect(patch.availability.rules.every((rule) => rule.startTime === "09:00" && rule.endTime === "18:00")).toBe(true);
  });

  test("Personalizar dias diferentes grava um intervalo próprio por dia", async () => {
    const user = await renderStep(
      "horarios",
      stateFixture({ availability: null }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Personalizar dias diferentes" }),
    );
    const mondayStart = screen.getByLabelText("Segunda · Início");
    await user.clear(mondayStart);
    await user.type(mondayStart, "08:00");
    const fridayEnd = screen.getByLabelText("Sexta · Fim");
    await user.clear(fridayEnd);
    await user.type(fridayEnd, "20:00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { availability: { rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }> } },
    ];
    const monday = patch.availability.rules.find((rule) => rule.dayOfWeek === 1);
    const friday = patch.availability.rules.find((rule) => rule.dayOfWeek === 5);
    expect(monday?.startTime).toBe("08:00");
    expect(monday?.endTime).toBe("18:00");
    expect(friday?.endTime).toBe("20:00");
  });

  test("a retomada com intervalos diferentes por dia reconstrói cada um, não só o primeiro", async () => {
    await renderStep(
      "horarios",
      stateFixture({
        availability: {
          granularityMinutes: 30,
          maxLeadDays: 90,
          minLeadMinutes: 0,
          rules: [
            { active: true, dayOfWeek: 1, endTime: "18:00", id: "r1", startTime: "08:00" },
            { active: true, dayOfWeek: 2, endTime: "20:00", id: "r2", startTime: "09:00" },
          ],
          timezone: "America/Sao_Paulo",
        },
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Personalizar dias diferentes" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Segunda · Início")).toHaveValue("08:00");
    expect(screen.getByLabelText("Terça · Fim")).toHaveValue("20:00");
  });

  test("retomar com horário uniforme, mudar o intervalo-base e gravar manda o horário novo em todos os dias", async () => {
    const user = await renderStep(
      "horarios",
      stateFixture({
        availability: availabilityFixture(
          [1, 2, 3, 4, 5].map((dayOfWeek) => ({
            dayOfWeek,
            endTime: "18:00",
            startTime: "09:00",
          })),
        ),
      }),
    );
    // Horário uniforme gravado não é personalização: começa fechado.
    expect(
      await screen.findByRole("button", { name: "Personalizar dias diferentes" }),
    ).toHaveAttribute("aria-expanded", "false");
    const start = screen.getByLabelText("Início");
    await user.clear(start);
    await user.type(start, "10:00");
    const end = screen.getByLabelText("Fim");
    await user.clear(end);
    await user.type(end, "19:00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { availability: { rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }> } },
    ];
    expect(patch.availability.rules).toEqual(
      [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        active: true,
        dayOfWeek,
        endTime: "19:00",
        startTime: "10:00",
      })),
    );
  });

  test("retomar com um dia personalizado e mudar o intervalo-base: os outros dias seguem o base, o personalizado fica", async () => {
    const user = await renderStep(
      "horarios",
      stateFixture({
        availability: availabilityFixture([
          { dayOfWeek: 1, endTime: "18:00", startTime: "09:00" },
          { dayOfWeek: 2, endTime: "18:00", startTime: "09:00" },
          { dayOfWeek: 3, endTime: "13:00", startTime: "08:00" },
        ]),
      }),
    );
    const start = await screen.findByLabelText("Início");
    expect(start).toHaveValue("09:00");
    await user.clear(start);
    await user.type(start, "10:00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { availability: { rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }> } },
    ];
    const byDay = Object.fromEntries(
      patch.availability.rules.map((rule) => [rule.dayOfWeek, `${rule.startTime}-${rule.endTime}`]),
    );
    expect(byDay).toEqual({ 1: "10:00-18:00", 2: "10:00-18:00", 3: "08:00-13:00" });
  });

  test("fechar a personalização volta todos os dias ao intervalo-base", async () => {
    const user = await renderStep(
      "horarios",
      stateFixture({
        availability: availabilityFixture([
          { dayOfWeek: 1, endTime: "18:00", startTime: "09:00" },
          { dayOfWeek: 2, endTime: "13:00", startTime: "08:00" },
          { dayOfWeek: 3, endTime: "18:00", startTime: "09:00" },
        ]),
      }),
    );
    const toggle = await screen.findByRole("button", {
      name: "Personalizar dias diferentes",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    const [patch] = updateOnboarding.mock.calls.at(-1) as [
      { availability: { rules: Array<{ startTime: string; endTime: string }> } },
    ];
    expect(
      patch.availability.rules.every(
        (rule) => rule.startTime === "09:00" && rule.endTime === "18:00",
      ),
    ).toBe(true);
  });

  test("fim antes do início no intervalo-base marca o campo final, com a mensagem ligada a ele, e não grava", async () => {
    const user = await renderStep("horarios", stateFixture({ availability: null }));
    const end = await screen.findByLabelText("Fim");
    await user.clear(end);
    await user.type(end, "08:00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription(
      "O horário final deve ser depois do horário inicial.",
    );
    expect(end).toHaveFocus();
    expect(screen.getByLabelText("Início")).not.toHaveAttribute("aria-invalid");
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("fim antes do início num dia personalizado marca o campo final daquele dia", async () => {
    const user = await renderStep("horarios", stateFixture({ availability: null }));
    await user.click(
      await screen.findByRole("button", { name: "Personalizar dias diferentes" }),
    );
    const wednesdayEnd = screen.getByLabelText("Quarta · Fim");
    await user.clear(wednesdayEnd);
    await user.type(wednesdayEnd, "07:00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(wednesdayEnd).toHaveAttribute("aria-invalid", "true");
    expect(wednesdayEnd).toHaveAccessibleDescription(
      "O horário final deve ser depois do horário inicial.",
    );
    expect(wednesdayEnd).toHaveFocus();
    expect(screen.getByLabelText("Fim")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Segunda · Fim")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(updateOnboarding).not.toHaveBeenCalled();
  });
});

describe("agenda-atendly-pronta: resumo completo, sem texto de desenvolvimento nem Fonte oficial", () => {
  test("mostra serviço, duração, preço, dias e horário", async () => {
    await renderStep(
      "agenda-atendly-pronta",
      stateFixture({
        service: serviceFixture({ name: "Corte", durationMinutes: 45, price: 120, priceType: "FIXED" }),
        availability: {
          granularityMinutes: 30,
          maxLeadDays: 90,
          minLeadMinutes: 0,
          rules: [1, 2, 3].map((dayOfWeek) => ({
            active: true,
            dayOfWeek,
            endTime: "18:00",
            id: `rule-${dayOfWeek}`,
            startTime: "09:00",
          })),
          timezone: "America/Sao_Paulo",
        },
      }),
    );
    expect(await screen.findByText("Corte")).toBeVisible();
    expect(screen.getByText("45 minutos")).toBeVisible();
    expect(screen.getByText("R$ 120,00")).toBeVisible();
    expect(screen.getByText("Segunda, Terça, Quarta")).toBeVisible();
    expect(screen.getByText("09:00 às 18:00")).toBeVisible();
  });

  test("com um dia personalizado, o resumo lista o horário de cada dia a partir do que está gravado", async () => {
    await renderStep(
      "agenda-atendly-pronta",
      stateFixture({
        availability: availabilityFixture([
          { dayOfWeek: 3, endTime: "13:00", startTime: "08:00" },
          { dayOfWeek: 1, endTime: "18:00", startTime: "09:00" },
          { dayOfWeek: 2, endTime: "18:00", startTime: "09:00" },
        ]),
        service: serviceFixture(),
      }),
    );
    expect(
      await screen.findByText(
        "Segunda 09:00–18:00, Terça 09:00–18:00, Quarta 08:00–13:00",
      ),
    ).toBeVisible();
  });

  test("não contém texto de desenvolvimento nem Fonte oficial", async () => {
    await renderStep(
      "agenda-atendly-pronta",
      stateFixture({ service: serviceFixture() }),
    );
    await screen.findByRole("heading", { level: 1 });
    expect(
      screen.queryByText(/próxima etapa do produto/i),
    ).toBeNull();
    expect(screen.queryByText("Fonte oficial")).toBeNull();
  });
});

describe("rotas antigas servico-duracao e servico-preco redirecionam", () => {
  test("as rotas antigas não existem mais como cenário válido", async () => {
    const { isOnboardingScenario } = await import(
      "@/features/onboarding/scenarios"
    );
    expect(isOnboardingScenario("servico-duracao")).toBe(false);
    expect(isOnboardingScenario("servico-preco")).toBe(false);
  });

  test.each(["servico-duracao", "servico-preco"])(
    "%s redireciona para /onboarding/servico-nome",
    async (step) => {
      const OnboardingPage = (await import("@/app/onboarding/[step]/page"))
        .default;
      await OnboardingPage({ params: Promise.resolve({ step }) });
      expect(redirectMock).toHaveBeenCalledWith("/onboarding/servico-nome");
    },
  );
});
