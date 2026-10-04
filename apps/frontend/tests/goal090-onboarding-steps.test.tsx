// @vitest-environment jsdom
/**
 * Goal090/WU-04 — as etapas de "Seu negócio" e "Sua agenda" iguais aos quadros
 * 1.2, 1.3, 2.2 a 2.6 do protótipo, pelo que a pessoa encontra:
 *
 * 1. o eyebrow é o capítulo ("Seu negócio" / "Sua agenda");
 * 2. `quando-importar`: ilustração decorativa, "Importar agora" antes de
 *    "Fazer depois", nota depois das duas ações, e cada ação grava o que gravava;
 * 3. `servicos-adicionais`: o serviço do rascunho e os adicionais, nessa ordem,
 *    cada um com "duração · preço"; sem preço não é erro;
 * 4. `servico-nome`: o botão principal é "Salvar serviço", com o mesmo PATCH;
 * 5. `horarios`: a descrição acompanha os dias do rascunho e os campos são
 *    "Começa" e "Termina";
 * 6. regressão de gravação: o corpo de cada PATCH/POST não mudou.
 *
 * Largura, régua e cartões dependem de layout: jsdom não os alcança, e quem
 * decide isso é o `visual:compare` e o gate autenticado.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState, Service } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { OnboardingScenario } from "@/features/onboarding/scenarios";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const listServiceCatalog = vi.fn();
const createServiceCatalog = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: { get: getOnboarding, update: updateOnboarding },
    serviceCatalog: { create: createServiceCatalog, list: listServiceCatalog },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn().mockResolvedValue(null),
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

function businessState(
  modalities: Array<"ONLINE" | "ON_SITE" | "AT_CLIENT">,
): Partial<OnboardingState> {
  return {
    business: {
      address: null,
      category: "Beleza",
      modalities,
      name: "Studio Aurora",
      timezone: "America/Sao_Paulo",
    } as unknown as OnboardingState["business"],
  };
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

function availabilityFor(
  days: number[],
  overrides: Record<number, { startTime?: string; endTime?: string }> = {},
): NonNullable<OnboardingState["availability"]> {
  return {
    customerChangeMinNoticeMinutes: 0,
    rules: days.map((dayOfWeek) => ({
      active: true,
      dayOfWeek,
      endTime: overrides[dayOfWeek]?.endTime ?? "18:00",
      startTime: overrides[dayOfWeek]?.startTime ?? "09:00",
    })),
    timezone: "America/Sao_Paulo",
  } as unknown as NonNullable<OnboardingState["availability"]>;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
  listServiceCatalog.mockResolvedValue({
    editable: true,
    items: [],
    source: "AVENLY",
  });
});

async function renderStep(
  scenario: OnboardingScenario,
  state: OnboardingState = emptyState(),
) {
  getOnboarding.mockResolvedValue(state);
  const user = userEvent.setup();
  render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
  return user;
}

function normalized(element: HTMLElement): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("1. o eyebrow é o nome do capítulo", () => {
  test.each<{
    chapter: string;
    scenario: OnboardingScenario;
    state: OnboardingState;
  }>([
    {
      chapter: "Seu negócio",
      scenario: "modalidade",
      state: stateFixture(businessState([])),
    },
    {
      chapter: "Seu negócio",
      scenario: "endereco",
      state: stateFixture(businessState(["ON_SITE"])),
    },
    { chapter: "Sua agenda", scenario: "quando-importar", state: emptyState() },
    { chapter: "Sua agenda", scenario: "servico-nome", state: emptyState() },
    {
      chapter: "Sua agenda",
      scenario: "servicos-adicionais",
      state: emptyState(),
    },
    {
      chapter: "Sua agenda",
      scenario: "dias-de-atendimento",
      state: emptyState(),
    },
    { chapter: "Sua agenda", scenario: "horarios", state: emptyState() },
  ])("$scenario: eyebrow \"$chapter\"", async ({ chapter, scenario, state }) => {
    await renderStep(scenario, state);
    const heading = await screen.findByRole("heading", { level: 1 });

    // O nome do capítulo também aparece no stepper (`nav`) e na barra de
    // progresso (`group`): o eyebrow é o parágrafo fora dos dois.
    const eyebrows = screen
      .queryAllByText(chapter)
      .filter(
        (element) =>
          element.tagName === "P" &&
          !element.closest("nav") &&
          !element.closest(`[role="group"]`),
      );
    expect(eyebrows).toHaveLength(1);
    expect(
      eyebrows[0].compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("2. quando-importar: ilustração, ordem das ações e gravação", () => {
  test("a ilustração Minha Agenda → uma vez → Avenly é decorativa", async () => {
    await renderStep("quando-importar");
    await screen.findByRole("button", { name: "Importar agora" });
    const hidden = screen
      .getByText("Minha Agenda")
      .closest('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden).toHaveTextContent("uma vez");
    expect(hidden).toHaveTextContent("Avenly");
  });

  test("a ordem do DOM é Importar agora, Fazer depois, nota", async () => {
    await renderStep("quando-importar");
    const importNow = await screen.findByRole("button", {
      name: "Importar agora",
    });
    const later = screen.getByRole("button", { name: "Fazer depois" });
    const note = screen.getByText(
      "Se fizer depois, a importação fica em Mais › Importação.",
    );

    expect(
      importNow.compareDocumentPosition(later) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      later.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("Importar agora grava a fonte da agenda e segue para a importação", async () => {
    const user = await renderStep("quando-importar");
    await user.click(
      await screen.findByRole("button", { name: "Importar agora" }),
    );
    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        calendar: { source: "AVENLY", timezone: "America/Sao_Paulo" },
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/importacao"));
    expect(updateOnboarding).toHaveBeenCalledTimes(1);
  });

  test("Fazer depois grava a mesma fonte e segue para o primeiro serviço", async () => {
    const user = await renderStep("quando-importar");
    await user.click(
      await screen.findByRole("button", { name: "Fazer depois" }),
    );
    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        calendar: { source: "AVENLY", timezone: "America/Sao_Paulo" },
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/servico-nome"),
    );
    expect(updateOnboarding).toHaveBeenCalledTimes(1);
  });
});

describe("3. servicos-adicionais: a lista traz o serviço do rascunho e os adicionais", () => {
  test("ordem: rascunho primeiro, depois os adicionais, cada um com duração · preço", async () => {
    listServiceCatalog.mockResolvedValue({
      editable: true,
      items: [
        serviceFixture({ id: "svc-1", name: "Corte" }),
        serviceFixture({
          durationMinutes: 30,
          id: "svc-2",
          name: "Barba",
          price: null,
          priceType: "NOT_INFORMED",
        }),
        serviceFixture({
          durationMinutes: 120,
          id: "svc-3",
          name: "Coloração",
          price: 200,
          priceType: "STARTING_AT",
        }),
        serviceFixture({ active: false, id: "svc-4", name: "Antigo" }),
      ],
      source: "AVENLY",
    });
    await renderStep(
      "servicos-adicionais",
      stateFixture({
        service: serviceFixture({
          durationMinutes: 45,
          id: "svc-1",
          name: "Corte",
          price: 90,
        }),
      }),
    );

    const draftRow = (await screen.findByText("Corte")).closest("li");
    expect(draftRow).not.toBeNull();
    const list = draftRow?.parentElement as HTMLElement;
    await waitFor(() =>
      expect(within(list).getAllByRole("listitem")).toHaveLength(3),
    );
    const rows = within(list).getAllByRole("listitem");

    expect(normalized(rows[0])).toMatch(/^Corte\s*45 min · R\$ 90$/);
    expect(normalized(rows[1])).toMatch(/^Barba\s*30 min · sem preço informado$/);
    expect(normalized(rows[2])).toMatch(
      /^Coloração\s*120 min · a partir de R\$ 200$/,
    );
    expect(screen.queryByText("Antigo")).toBeNull();
  });

  test("sem preço informado aparece como texto discreto, nunca como alerta", async () => {
    listServiceCatalog.mockResolvedValue({
      editable: true,
      items: [
        serviceFixture({
          durationMinutes: 30,
          id: "svc-2",
          name: "Barba",
          price: null,
          priceType: "NOT_INFORMED",
        }),
      ],
      source: "AVENLY",
    });
    await renderStep(
      "servicos-adicionais",
      stateFixture({
        service: serviceFixture({
          durationMinutes: 45,
          id: "svc-1",
          name: "Corte",
          price: null,
          priceType: "NOT_INFORMED",
        }),
      }),
    );
    const barber = (await screen.findByText("Barba")).closest("li");
    expect(barber).not.toBeNull();
    const quiet = await within(barber as HTMLElement).findByText(
      "sem preço informado",
    );
    expect(quiet).toBeVisible();
    expect(quiet.closest('[role="alert"]')).toBeNull();

    const draftRow = screen.getByText("Corte").closest("li") as HTMLElement;
    expect(within(draftRow).getByText("sem preço informado")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("4. servico-nome: Salvar serviço", () => {
  test("o botão principal é Salvar serviço e o PATCH tem o mesmo corpo", async () => {
    const user = await renderStep("servico-nome");
    expect(
      await screen.findByRole("button", { name: "Salvar serviço" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();

    await user.type(screen.getByLabelText("Nome do serviço"), "Corte");
    await user.type(screen.getByLabelText("Preço em reais"), "90");
    await user.click(screen.getByRole("button", { name: "Salvar serviço" }));

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        service: {
          active: true,
          durationMinutes: 60,
          id: undefined,
          name: "Corte",
          price: 90,
          priceType: "FIXED",
        },
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/servicos-adicionais"),
    );
  });
});

describe("5. horarios: descrição pelos dias do rascunho e rótulos Começa/Termina", () => {
  test.each([
    [[1, 2, 3, 4, 5, 6], "Vale para segunda a sábado."],
    [[1, 3, 5], "Vale para segunda, quarta e sexta."],
  ])("dias %j: \"%s\"", async (days, sentence) => {
    await renderStep(
      "horarios",
      stateFixture({ availability: availabilityFor(days) }),
    );
    expect(
      await screen.findByText(
        `${sentence} Pausas e bloqueios você configura depois.`,
      ),
    ).toBeVisible();
  });

  test("os campos se chamam Começa e Termina", async () => {
    await renderStep(
      "horarios",
      stateFixture({ availability: availabilityFor([1, 2, 3]) }),
    );
    expect(await screen.findByLabelText("Começa")).toHaveValue("09:00");
    expect(screen.getByLabelText("Termina")).toHaveValue("18:00");
    expect(screen.queryByLabelText("Início")).toBeNull();
    expect(screen.queryByLabelText("Fim")).toBeNull();
  });
});

describe("6. regressão de gravação: o corpo de cada PATCH e POST não mudou", () => {
  test("endereco grava endereço e modalidades juntos", async () => {
    const user = await renderStep(
      "endereco",
      stateFixture(businessState(["ON_SITE"])),
    );
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "  Rua das Flores, 10  ",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        business: {
          address: "Rua das Flores, 10",
          category: "Beleza",
          modalities: ["ON_SITE"],
          name: "Studio Aurora",
          timezone: "America/Sao_Paulo",
        },
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/sistema-atual"),
    );
  });

  test("dias-de-atendimento não grava e segue para horarios", async () => {
    const user = await renderStep("dias-de-atendimento");
    await user.click(await screen.findByRole("checkbox", { name: "Sábado" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/horarios"),
    );
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("horarios sem dia personalizado grava uma regra por dia com o intervalo-base", async () => {
    const user = await renderStep(
      "horarios",
      stateFixture({ availability: availabilityFor([1, 2, 3]) }),
    );
    await screen.findByRole("button", { name: /^Personalizar dias diferentes/ });
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        availability: {
          rules: [1, 2, 3].map((dayOfWeek) => ({
            active: true,
            dayOfWeek,
            endTime: "18:00",
            startTime: "09:00",
          })),
          timezone: "America/Sao_Paulo",
        },
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/agenda-avenly-pronta"),
    );
  });

  test("horarios com um dia personalizado grava o intervalo daquele dia", async () => {
    const user = await renderStep(
      "horarios",
      stateFixture({ availability: availabilityFor([1, 2, 3]) }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: /^Personalizar dias diferentes/,
      }),
    );
    const start = screen.getByLabelText("Quarta · Início");
    await user.clear(start);
    await user.type(start, "10:00");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        availability: {
          rules: [
            { active: true, dayOfWeek: 1, endTime: "18:00", startTime: "09:00" },
            { active: true, dayOfWeek: 2, endTime: "18:00", startTime: "09:00" },
            { active: true, dayOfWeek: 3, endTime: "18:00", startTime: "10:00" },
          ],
          timezone: "America/Sao_Paulo",
        },
      }),
    );
  });

  test("Adicionar em servicos-adicionais cria o serviço com o mesmo corpo", async () => {
    createServiceCatalog.mockResolvedValue(
      serviceFixture({
        durationMinutes: 60,
        id: "svc-9",
        name: "Barba",
        price: 40,
      }),
    );
    const user = await renderStep(
      "servicos-adicionais",
      stateFixture({ service: serviceFixture({ name: "Corte" }) }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Adicionar outro serviço" }),
    );
    await user.type(screen.getByLabelText("Nome do serviço"), "Barba");
    await user.type(screen.getByLabelText("Preço em reais"), "40");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(createServiceCatalog).toHaveBeenCalledWith({
        active: true,
        durationMinutes: 60,
        name: "Barba",
        price: 40,
        priceType: "FIXED",
      }),
    );
    expect(await screen.findByText("Barba")).toBeVisible();
    expect(updateOnboarding).not.toHaveBeenCalled();
  });
});
