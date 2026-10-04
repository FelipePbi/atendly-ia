// @vitest-environment jsdom
/**
 * Goal079/WU-01 — Boas-vindas animada, quatro promessas da introdução do
 * WhatsApp e ordem de Tab sem inversão visual.
 *
 * Boas-vindas: sem `prefers-reduced-motion`, o primeiro quadro só tem a
 * mensagem da cliente e a cena termina em até 3,5 s; com `reduce`, tudo está
 * no primeiro quadro. "Começar" não espera a animação. As promessas têm ícone
 * próprio e palavra-chave em <strong>. Nenhuma regra de `.onboarding-actions`
 * reordena a linha.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: { list: vi.fn(), setIgnored: vi.fn(), ignoreByPhone: vi.fn() },
    onboarding: { get: getOnboarding, update: updateOnboarding },
    serviceCatalog: { create: vi.fn(), list: vi.fn() },
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

async function renderStep(scenario: string) {
  getOnboarding.mockResolvedValue(emptyState());
  render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario as never} />
    </OnboardingRuntimeProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  screen.getByRole("heading", { level: 1 });
}

function promiseItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".onboarding-points > li")];
}

const CLIENT_MESSAGE = "Oi! Tem horário na sexta?";
const AI_REPLY = "Tenho sexta às 15h30. Posso confirmar?";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Boas-vindas animada (O-01)", () => {
  test("sem reduce: primeiro quadro só com a mensagem; em 3,5 s entram resposta e agenda", async () => {
    stubMatchMedia(false);
    await renderStep("boas-vindas");
    const figure = screen.getByRole("img", {
      name: "Exemplo: um cliente pede horário, a IA responde e o horário entra na agenda",
    });
    expect(within(figure).getByText(CLIENT_MESSAGE)).toBeInTheDocument();
    expect(within(figure).queryByText(AI_REPLY)).not.toBeInTheDocument();
    expect(within(figure).queryByText("Ana Paula · Corte")).not.toBeInTheDocument();
    expect(within(figure).queryByText("15:30")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar" })).toBeEnabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(within(figure).getByText(AI_REPLY)).toBeInTheDocument();
    expect(within(figure).getByText("14:00")).toBeInTheDocument();
    expect(within(figure).getByText("17:00")).toBeInTheDocument();
    const booked = within(figure)
      .getByText("Ana Paula · Corte")
      .closest(".onboarding-welcome-slot");
    expect(booked).not.toBeNull();
    expect(within(booked as HTMLElement).getByText("15:30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar" })).toBeEnabled();
  });

  test("a resposta entra antes da agenda", async () => {
    stubMatchMedia(false);
    await renderStep("boas-vindas");
    let sawReplyBeforeSlot = false;
    for (let elapsed = 0; elapsed < 3500; elapsed += 100) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      const reply = screen.queryByText(AI_REPLY);
      const slot = screen.queryByText("Ana Paula · Corte");
      if (reply && !slot) sawReplyBeforeSlot = true;
      if (slot) expect(reply).not.toBeNull();
    }
    expect(sawReplyBeforeSlot).toBe(true);
  });

  test("com reduce: tudo no primeiro quadro e 'Começar' habilitado", async () => {
    stubMatchMedia(true);
    await renderStep("boas-vindas");
    const figure = screen.getByRole("img", {
      name: "Exemplo: um cliente pede horário, a IA responde e o horário entra na agenda",
    });
    expect(within(figure).getByText(CLIENT_MESSAGE)).toBeInTheDocument();
    expect(within(figure).getByText(AI_REPLY)).toBeInTheDocument();
    expect(within(figure).getByText("14:00")).toBeInTheDocument();
    expect(within(figure).getByText("15:30")).toBeInTheDocument();
    expect(within(figure).getByText("Ana Paula · Corte")).toBeInTheDocument();
    expect(within(figure).getByText("17:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar" })).toBeEnabled();
  });

  test("sem matchMedia no ambiente, anima como sem reduce", async () => {
    await renderStep("boas-vindas");
    expect(screen.queryByText(AI_REPLY)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Começar" })).toBeEnabled();
  });
});

describe("promessas da introdução do WhatsApp (O-42)", () => {
  const KEYWORDS = [
    "pessoal ou profissional",
    "normalmente",
    "você responde",
    "quem a IA nunca responde",
  ];

  test("quatro itens, na ordem do protótipo, com palavra-chave em <strong>", async () => {
    stubMatchMedia(false);
    await renderStep("whatsapp");
    const items = promiseItems();
    expect(items).toHaveLength(4);
    items.forEach((item, index) => {
      const strong = item.querySelector("strong");
      expect(strong?.textContent).toBe(KEYWORDS[index]);
    });
    expect(items[0]).toHaveTextContent(
      "Use seu WhatsApp pessoal ou profissional. Só um número por negócio.",
    );
    expect(items[1]).toHaveTextContent(
      "Continue usando o WhatsApp normalmente. Suas conversas ficam organizadas aqui.",
    );
    expect(items[2]).toHaveTextContent(
      "Quando você responde, a IA sai de cena naquela conversa.",
    );
    expect(items[3]).toHaveTextContent(
      "Você escolhe quem a IA nunca responde: família, amigos, quem quiser.",
    );
    expect(screen.getByText("Só um número por negócio.")).toBeVisible();
  });

  test("cada item tem ícone aria-hidden próprio, diferente entre si e de check", async () => {
    stubMatchMedia(false);
    await renderStep("whatsapp");
    const icons = promiseItems().map((item) => {
      const badge = item.querySelector(".onboarding-promise-icon");
      expect(badge).not.toBeNull();
      expect(badge).toHaveAttribute("aria-hidden", "true");
      const svg = badge?.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.querySelector("use")).toBeNull();
      return svg?.innerHTML;
    });
    expect(new Set(icons).size).toBe(4);
  });

  test("o h1 da introdução não muda", async () => {
    stubMatchMedia(false);
    await renderStep("whatsapp");
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Agora vamos colocar sua IA para atender de verdade.",
    });
    expect(heading).toBeInTheDocument();
    expect(heading.parentElement?.querySelector("p")).toBeNull();
  });
});

describe("ordem de Tab da introdução do WhatsApp (observação 3 do review065)", () => {
  test("'Conectar meu WhatsApp' precede 'Fazer isso depois' no DOM", async () => {
    stubMatchMedia(false);
    await renderStep("whatsapp");
    const connect = screen.getByRole("button", { name: "Conectar meu WhatsApp" });
    const later = screen.getByRole("button", { name: "Fazer isso depois" });
    expect(
      connect.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("nenhuma regra de .onboarding-actions declara row-reverse, column-reverse ou order", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/shared/styles/avenly.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const offending: string[] = [];
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selector.includes(".onboarding-actions")) continue;
      if (/row-reverse|column-reverse|(^|[;\s])order\s*:/.test(body)) {
        offending.push(selector.trim());
      }
    }
    expect(offending).toEqual([]);
  });
});
