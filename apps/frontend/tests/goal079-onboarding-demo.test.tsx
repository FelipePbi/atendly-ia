// @vitest-environment jsdom
/**
 * Goal079/WU-02 (§6.2 e §6.3) — a demonstração animada da IA: as mensagens
 * entram uma a uma, o "Continuar" só aparece no fim, a conversa usa o serviço,
 * o preço, a duração, o dia e os horários do rascunho, os eventos são linhas
 * dentro da conversa e nada é escrito nem lido da agenda.
 *
 * Validação de 2026-10-11: a conversa começa vazia, cada balão vem depois do
 * "digitando…" de quem fala, o evento entra sozinho, e a sequência roda também
 * com `prefers-reduced-motion` (não há mais quadro com a conversa inteira). Os
 * testes de conteúdo rodam a sequência até o fim com relógio falso.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

import { expectNoA11yViolations } from "./support/a11y";
import {
  advanceDemo as advance,
  DEMO_RUN_LIMIT_MS,
  demoItems,
  demoItemTexts,
  runDemoToEnd,
  stubMatchMedia,
} from "./support/onboarding-demo";

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

async function renderDemo(state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  const { container } = render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="demonstracao-da-ia" />
    </OnboardingRuntimeProvider>,
  );
  await advance(0);
  screen.getByRole("heading", { level: 1 });
  return container;
}

/** Renderiza a demonstração e roda a conversa inteira até o Continuar. */
async function renderFinishedDemo(state: OnboardingState) {
  const container = await renderDemo(state);
  await runDemoToEnd();
  return container;
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

type Typing = "ai" | "client" | null;

/** Quem está "digitando…" agora; o indicador fica fora da árvore acessível. */
function typing(): Typing {
  const indicators = chat().querySelectorAll(".demo-typing");
  expect(indicators.length).toBeLessThanOrEqual(1);
  const indicator = indicators[0];
  if (!indicator) return null;
  expect(indicator).toHaveAttribute("aria-hidden", "true");
  if (indicator.classList.contains("is-ai")) return "ai";
  if (indicator.classList.contains("is-client")) return "client";
  throw new Error(`"digitando…" sem lado: ${indicator.className}`);
}

/** O tipo de um item entregue: balão da IA, balão do cliente ou evento. */
function kindOf(node: HTMLElement): "ai" | "client" | "event" {
  if (node.classList.contains("demo-ai-message")) return "ai";
  if (node.classList.contains("demo-client-bubble")) return "client";
  if (node.classList.contains("onboarding-demo-event")) return "event";
  throw new Error(`item desconhecido na conversa: ${node.outerHTML}`);
}

type Frame = {
  at: number;
  continueShown: boolean;
  items: number;
  kinds: Array<"ai" | "client" | "event">;
  typing: Typing;
};

/**
 * Observa a sequência em passos de 50 ms até o Continuar aparecer (ou o teto
 * de 20 s) e devolve um quadro por passo, começando pelo primeiro.
 */
async function recordSequence(): Promise<Frame[]> {
  const snapshot = (at: number): Frame => ({
    at,
    continueShown: screen.queryByRole("button", CONTINUE) !== null,
    items: demoItems(chat()).length,
    kinds: demoItems(chat()).map(kindOf),
    typing: typing(),
  });
  const frames = [snapshot(0)];
  for (let at = 50; at <= DEMO_RUN_LIMIT_MS; at += 50) {
    await advance(50);
    const frame = snapshot(at);
    frames.push(frame);
    if (frame.continueShown) break;
  }
  return frames;
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

  test.each([
    ["sem movimento reduzido", false],
    ["com movimento reduzido", true],
  ] as const)(
    "%s: o primeiro quadro tem a conversa vazia, o cliente digitando e nenhum Continuar",
    async (_label, reduce) => {
      stubMatchMedia(reduce);
      await renderDemo(readyState());

      expect(demoItems(chat())).toEqual([]);
      expect(bubbles()).toEqual([]);
      expect(events()).toEqual([]);
      expect(typing()).toBe("client");
      expect(screen.queryByRole("button", CONTINUE)).toBeNull();

      // O "digitando…" do cliente fica até o primeiro balão entrar no lugar
      // dele; a IA nunca digita antes da primeira pergunta.
      let at = 0;
      while (bubbles().length === 0) {
        expect(typing()).toBe("client");
        expect(events()).toEqual([]);
        expect(at).toBeLessThan(DEMO_RUN_LIMIT_MS);
        await advance(50);
        at += 50;
      }
      expect(at).toBeGreaterThan(0);
      expect(bubbles()).toEqual(["Oi! Quanto custa Corte feminino?"]);
      expect(chat().querySelector(".demo-client-bubble")).not.toBeNull();
      expect(typing()).toBeNull();
      expect(screen.queryByRole("button", CONTINUE)).toBeNull();
    },
  );

  test.each([
    ["sem movimento reduzido", false],
    ["com movimento reduzido", true],
  ] as const)(
    "%s: os itens entram um a um, em ordem, cada balão depois do digitando do lado certo, e o Continuar só com o último",
    async (_label, reduce) => {
      stubMatchMedia(reduce);
      await renderDemo(readyState());

      const frames = await recordSequence();
      const last = frames[frames.length - 1];

      // A sequência termina dentro do teto, com a conversa inteira.
      expect(last.continueShown).toBe(true);
      expect(last.at).toBeLessThanOrEqual(DEMO_RUN_LIMIT_MS);
      expect(last.items).toBe(11);
      expect(last.kinds).toEqual([
        "client",
        "event",
        "ai",
        "client",
        "event",
        "ai",
        "client",
        "ai",
        "client",
        "event",
        "ai",
      ]);

      for (let index = 1; index < frames.length; index += 1) {
        const before = frames[index - 1];
        const now = frames[index];
        // Nunca dois itens no mesmo passo de 50 ms, e nada sai da conversa:
        // os itens já entregues continuam na mesma ordem.
        expect(now.items - before.items).toBeGreaterThanOrEqual(0);
        expect(now.items - before.items).toBeLessThanOrEqual(1);
        expect(now.kinds.slice(0, before.items)).toEqual(before.kinds);
        // O Continuar só existe com o último item entregue.
        if (now.items < 11) expect(now.continueShown).toBe(false);
        if (now.items === before.items) continue;

        const entered = now.kinds[now.items - 1];
        if (entered === "event") {
          // O evento entra sozinho, sem "digitando…" antes.
          expect(before.typing).toBeNull();
        } else {
          // Cada balão é precedido pelo "digitando…" de quem fala, que some
          // quando o balão entra.
          expect(before.typing).toBe(entered);
          expect(now.typing).toBeNull();
        }
      }

      // Cada balão teve o seu próprio "digitando…": ele aparece 8 vezes, do
      // lado de quem fala, na ordem da conversa.
      const typingRuns = frames
        .map((frame) => frame.typing)
        .filter((side, index, all) => side !== null && side !== all[index - 1]);
      expect(typingRuns).toEqual(
        last.kinds.filter((kind) => kind !== "event"),
      );
    },
  );

  test("com movimento reduzido a sequência leva o mesmo tempo que sem, e termina em até 20 s", async () => {
    const durations: number[] = [];
    for (const reduce of [false, true]) {
      stubMatchMedia(reduce);
      await renderDemo(readyState());

      expect(screen.queryByRole("button", CONTINUE)).toBeNull();
      const elapsed = await runDemoToEnd(DEMO_RUN_LIMIT_MS, 50);
      expect(elapsed).toBeGreaterThan(0);
      expect(elapsed).toBeLessThanOrEqual(DEMO_RUN_LIMIT_MS);
      expect(bubbles()).toHaveLength(8);
      expect(events()).toHaveLength(3);
      expect(typing()).toBeNull();
      expect(screen.getByRole("button", CONTINUE)).toBeEnabled();
      durations.push(elapsed);
      cleanup();
    }
    // O reduce não encurta a conversa: ela é o conteúdo da etapa.
    expect(durations[1]).toBe(durations[0]);
  });

  test("no meio da sequência, com a IA digitando, a tela passa no axe", async () => {
    stubMatchMedia(false);
    const container = await renderDemo(readyState());
    for (let at = 0; typing() !== "ai"; at += 50) {
      expect(at).toBeLessThan(DEMO_RUN_LIMIT_MS);
      await advance(50);
    }
    expect(demoItems(chat()).length).toBeGreaterThan(0);
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  test("a conversa inteira, com o Continuar, passa no axe", async () => {
    stubMatchMedia(false);
    const container = await renderFinishedDemo(readyState());
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  test("a conversa é um log, para o leitor de tela ouvir cada entrada", async () => {
    stubMatchMedia(false);
    await renderDemo(readyState());
    expect(
      screen.getByRole("log", { name: "Conversa de exemplo da IA" }),
    ).toBeInTheDocument();
  });

  test("Continuar avança para tom-da-ia sem escrever nada", async () => {
    stubMatchMedia(false);
    await renderFinishedDemo(readyState());
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
    stubMatchMedia(false);
    await renderFinishedDemo(readyState());
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
    stubMatchMedia(false);
    await renderFinishedDemo(readyState());
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
    stubMatchMedia(false);
    await renderFinishedDemo(readyState());
    const order = demoItemTexts(chat());
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
    expect(order[10]).toBe("Confirmado! Te espero sexta às 15h30 😊");
  });

  test("dayHours do dia da demonstração vence o intervalo-base", async () => {
    stubMatchMedia(false);
    const state = readyState();
    state.availability = {
      ...(state.availability as NonNullable<OnboardingState["availability"]>),
      rules: [
        { active: true, dayOfWeek: 1, endTime: "18:00", id: "r1", startTime: "09:00" },
        { active: true, dayOfWeek: 2, endTime: "18:00", id: "r2", startTime: "09:00" },
        { active: true, dayOfWeek: 5, endTime: "12:00", id: "r5", startTime: "10:00" },
      ],
    };
    await renderFinishedDemo(state);
    expect(within(chat()).getByText(/Tenho sexta às 10h ou 10h45\./u)).toBeVisible();
    expect(
      within(chat()).getByText("Agenda consultada · 2 horários livres na sexta"),
    ).toBeVisible();
  });

  test("o preço 'sob consulta' e 'a partir de' seguem o tipo gravado", async () => {
    stubMatchMedia(false);
    const onRequest = readyState();
    onRequest.service = {
      ...(onRequest.service as NonNullable<OnboardingState["service"]>),
      price: null,
      priceType: "ON_REQUEST",
    };
    await renderFinishedDemo(onRequest);
    expect(within(chat()).getByText(/sob consulta/u)).toBeVisible();
    expect(within(chat()).queryByText(/R\$/u)).toBeNull();
  });

  test("nenhuma escrita durante a demonstração inteira", async () => {
    stubMatchMedia(false);
    await renderFinishedDemo(readyState());
    // Depois do último item nada mais acontece: nem escrita, nem nova leitura.
    await advance(5000);
    expect(updateOnboarding).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(serviceCatalogCreate).not.toHaveBeenCalled();
    expect(getOnboarding).toHaveBeenCalledTimes(1);
  });
});
