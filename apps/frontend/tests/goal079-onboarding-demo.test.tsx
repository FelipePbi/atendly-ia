// @vitest-environment jsdom
/**
 * Goal079/WU-02 (§6.2 e §6.3) — a demonstração animada da IA: as mensagens
 * entram uma a uma, o "Continuar" só aparece no fim, a conversa usa o serviço,
 * o preço, a duração, o dia e os horários do rascunho, os eventos são linhas
 * dentro da conversa e nada é escrito nem lido da agenda.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const serviceCatalogList = vi.fn();
const serviceCatalogCreate = vi.fn();

// Só o que o onboarding lê ao carregar: qualquer outra porta (agenda,
// conversas, mensagens) não existe no dublê e faria a demonstração falhar.
vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: updateOnboarding,
    },
    serviceCatalog: { create: serviceCatalogCreate, list: serviceCatalogList },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
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

function readyState(): OnboardingState {
  return {
    ...emptyState(),
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: [
        {
          active: true,
          dayOfWeek: 5,
          endTime: "18:00",
          id: "rule-5",
          startTime: "14:00",
        },
      ],
      timezone: "America/Sao_Paulo",
    },
    business: {
      address: null,
      category: "Cabelo",
      modalities: ["ONLINE"],
      name: "Studio Aurora",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      integration: null,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
    service: {
      active: true,
      bufferAfterMinutes: 0,
      bufferBeforeMinutes: 0,
      durationMinutes: 45,
      id: "svc-1",
      name: "Corte feminino",
      needsReview: false,
      price: 90,
      priceType: "FIXED",
    },
  };
}

function stubMatchMedia(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
    writable: true,
  });
}

async function renderDemo(state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="demonstracao-da-ia" />
    </OnboardingRuntimeProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  screen.getByRole("heading", { level: 1 });
}

function chat(): HTMLElement {
  return screen.getByRole("log");
}

function bubbles(): string[] {
  return [...chat().querySelectorAll(".demo-client-bubble, .demo-ai-bubble")].map(
    (node) => node.textContent ?? "",
  );
}

function events(): string[] {
  return [...chat().querySelectorAll(".onboarding-demo-event")].map(
    (node) => node.textContent ?? "",
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const CONTINUE = { name: "Continuar" } as const;

beforeEach(() => {
  vi.useFakeTimers();
  // Quarta-feira, 2026-09-30, meio-dia em America/Sao_Paulo.
  vi.setSystemTime(new Date("2026-09-30T15:00:00.000Z"));
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [],
    source: "AVENLY",
  });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Sequência da demonstração (§6.2)", () => {
  test("o título e a descrição são os do protótipo, e o aviso grande saiu", async () => {
    stubMatchMedia(false);
    await renderDemo(readyState());
    expect(
      screen.getByRole("heading", { level: 1, name: "Veja sua IA atendendo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Uma conversa de exemplo com os seus serviços e horários. Nada é marcado de verdade.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Sua IA", { selector: "p.onboarding-eyebrow" })).toBeInTheDocument();
    expect(screen.queryByText(/Demonstração simulada/u)).toBeNull();
    expect(screen.queryByLabelText(/Demonstração simulada/u)).toBeNull();
  });

  test("sem reduce: primeiro quadro com uma mensagem e sem Continuar; em 12 s tudo e o Continuar", async () => {
    stubMatchMedia(false);
    await renderDemo(readyState());

    expect(bubbles()).toEqual(["Oi! Quanto custa Corte feminino?"]);
    expect(events()).toEqual([]);
    expect(screen.queryByRole("button", CONTINUE)).toBeNull();

    await advance(12000);

    expect(bubbles()).toHaveLength(8);
    expect(events()).toHaveLength(3);
    expect(screen.getByRole("button", CONTINUE)).toBeEnabled();
  });

  test("as mensagens entram uma a uma e o Continuar só aparece com o último item", async () => {
    stubMatchMedia(false);
    await renderDemo(readyState());

    let previous = 1;
    let continueAppearedAt: number | null = null;
    let lastCount = 0;
    for (let elapsed = 100; elapsed <= 12000; elapsed += 100) {
      await advance(100);
      const count = bubbles().length + events().length;
      // Nunca dois itens no mesmo passo de 100 ms: a entrada é item a item.
      expect(count - previous).toBeLessThanOrEqual(1);
      previous = count;
      lastCount = count;
      if (
        continueAppearedAt === null &&
        screen.queryByRole("button", CONTINUE)
      ) {
        continueAppearedAt = elapsed;
        expect(count).toBe(11);
      }
    }
    expect(lastCount).toBe(11);
    expect(continueAppearedAt).not.toBeNull();
    expect(continueAppearedAt as number).toBeLessThanOrEqual(12000);
  });

  test("com reduce: a conversa inteira e o Continuar estão no primeiro quadro", async () => {
    stubMatchMedia(true);
    await renderDemo(readyState());
    expect(bubbles()).toHaveLength(8);
    expect(events()).toHaveLength(3);
    expect(screen.getByRole("button", CONTINUE)).toBeEnabled();
  });

  test("a conversa é um log, para o leitor de tela ouvir cada entrada", async () => {
    stubMatchMedia(false);
    await renderDemo(readyState());
    expect(
      screen.getByRole("log", { name: "Conversa de exemplo da IA" }),
    ).toBeInTheDocument();
  });

  test("Continuar avança para tom-da-ia sem escrever nada", async () => {
    stubMatchMedia(true);
    await renderDemo(readyState());
    fireEvent.click(screen.getByRole("button", CONTINUE));
    await advance(0);
    expect(push).toHaveBeenCalledWith("/onboarding/tom-da-ia");
    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(serviceCatalogCreate).not.toHaveBeenCalled();
  });

  test("sem serviço operacional nem horário válido: o aviso continua e o Continuar aparece de imediato", async () => {
    stubMatchMedia(false);
    await renderDemo(emptyState());
    expect(
      screen.getByText(
        "Configure um serviço ativo com duração definida e um horário de atendimento configurado para ver a demonstração da IA.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.getByRole("button", CONTINUE)).toBeEnabled();
  });

  test("com serviço mas sem horário, o aviso pede só o horário", async () => {
    stubMatchMedia(false);
    await renderDemo({ ...readyState(), availability: null });
    expect(
      screen.getByText(
        "Configure um horário de atendimento configurado para ver a demonstração da IA.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", CONTINUE)).toBeEnabled();
  });
});

describe("Conversa da demonstração (§6.3)", () => {
  test("usa o serviço, o preço, a duração, o dia e os três horários do rascunho", async () => {
    stubMatchMedia(true);
    await renderDemo(readyState());
    const log = within(chat());

    expect(log.getByText("Serviço identificado · Corte feminino")).toBeVisible();
    expect(log.getByText(/R\$\s90,00/u)).toBeVisible();
    expect(log.getByText(/Leva 45 min/u)).toBeVisible();
    expect(
      log.getByText("Agenda consultada · 3 horários livres na sexta"),
    ).toBeVisible();
    expect(log.getByText(/14h, 15h30 ou 17h/u)).toBeVisible();
    expect(
      log.getByText(/sexta-feira, 2 de outubro, às 15h30/u),
    ).toBeVisible();
    expect(
      log.getByText("Agendamento simulado · nada foi marcado"),
    ).toBeVisible();
  });

  test("os eventos são linhas dentro da conversa, não message-meta sob um balão", async () => {
    stubMatchMedia(true);
    await renderDemo(readyState());
    expect(document.querySelectorAll(".message-meta")).toHaveLength(0);
    expect(events()).toEqual([
      "Serviço identificado · Corte feminino",
      "Agenda consultada · 3 horários livres na sexta",
      "Agendamento simulado · nada foi marcado",
    ]);
    for (const line of chat().querySelectorAll(".onboarding-demo-event")) {
      expect(line.closest(".message-group")).toBeNull();
      expect(chat().contains(line)).toBe(true);
    }
  });

  test("a ordem é: pergunta de preço, serviço, resposta, horário, agenda, oferta, escolha, confirmação, aceite, evento, fim", async () => {
    stubMatchMedia(true);
    await renderDemo(readyState());
    const order = [...chat().children].map(
      (node) => node.textContent?.replace(/sua IA$/u, "") ?? "",
    );
    expect(order).toHaveLength(11);
    expect(order[0]).toBe("Oi! Quanto custa Corte feminino?");
    expect(order[1]).toBe("Serviço identificado · Corte feminino");
    expect(order[2]).toMatch(/custa R\$\s90,00\. Leva 45 min\./u);
    expect(order[3]).toBe("Quero sim! Tem sexta à tarde?");
    expect(order[4]).toBe("Agenda consultada · 3 horários livres na sexta");
    expect(order[5]).toBe("Tenho sexta às 14h, 15h30 ou 17h. Qual fica melhor?");
    expect(order[6]).toBe("15h30");
    expect(order[7]).toBe(
      "Corte feminino, sexta-feira, 2 de outubro, às 15h30. Posso confirmar?",
    );
    expect(order[8]).toBe("Pode!");
    expect(order[9]).toBe("Agendamento simulado · nada foi marcado");
  });

  test("dayHours do dia da demonstração vence o intervalo-base", async () => {
    stubMatchMedia(true);
    const state = readyState();
    state.availability = {
      ...(state.availability as NonNullable<OnboardingState["availability"]>),
      rules: [
        { active: true, dayOfWeek: 1, endTime: "18:00", id: "r1", startTime: "09:00" },
        { active: true, dayOfWeek: 2, endTime: "18:00", id: "r2", startTime: "09:00" },
        { active: true, dayOfWeek: 5, endTime: "12:00", id: "r5", startTime: "10:00" },
      ],
    };
    await renderDemo(state);
    expect(within(chat()).getByText(/Tenho sexta às 10h ou 10h45\./u)).toBeVisible();
    expect(
      within(chat()).getByText("Agenda consultada · 2 horários livres na sexta"),
    ).toBeVisible();
  });

  test("o preço 'sob consulta' e 'a partir de' seguem o tipo gravado", async () => {
    stubMatchMedia(true);
    const onRequest = readyState();
    onRequest.service = {
      ...(onRequest.service as NonNullable<OnboardingState["service"]>),
      price: null,
      priceType: "ON_REQUEST",
    };
    await renderDemo(onRequest);
    expect(within(chat()).getByText(/sob consulta/u)).toBeVisible();
    expect(within(chat()).queryByText(/R\$/u)).toBeNull();
  });

  test("nenhuma escrita durante a demonstração inteira", async () => {
    stubMatchMedia(false);
    await renderDemo(readyState());
    await advance(12000);
    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(serviceCatalogCreate).not.toHaveBeenCalled();
    expect(getOnboarding).toHaveBeenCalledTimes(1);
  });
});
