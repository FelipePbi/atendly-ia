// @vitest-environment jsdom
/**
 * Goal079/WU-03 (§6.5) — o estilo da IA: título do vault, descritor e amostra
 * em cada tom (a resposta de preço e duração com os dados do rascunho),
 * Equilibrada pré-marcada e recomendada quando nada foi gravado, CTA com o
 * nome do estilo e gravação do escolhido.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";
import { demoToneSample } from "@/features/onboarding/demo";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const serviceCatalogList = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: { get: getOnboarding, update: updateOnboarding },
    serviceCatalog: { create: vi.fn(), list: serviceCatalogList },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn().mockResolvedValue(null),
    setUnauthenticated: vi.fn(),
  }),
}));

function stateWith(
  tone: "BALANCED" | "CASUAL" | "PROFESSIONAL" | null,
  service: Partial<NonNullable<OnboardingState["service"]>> = {},
): OnboardingState {
  return {
    ai: { tone },
    availability: null,
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
    completed: false,
    completedAt: null,
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
      ...service,
    },
    whatsapp: null,
  };
}

async function renderStyle(state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  updateOnboarding.mockResolvedValue(state);
  const user = userEvent.setup();
  const view = render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="tom-da-ia" />
    </OnboardingRuntimeProvider>,
  );
  await screen.findByRole("heading", {
    level: 1,
    name: "Gostou da forma como a IA conversou?",
  });
  return { container: view.container, user };
}

function card(name: RegExp): HTMLElement {
  return screen.getByRole("button", { name });
}

function flat(text: string | null): string {
  return (text ?? "").replace(/\s/gu, " ");
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [],
    source: "AVENLY",
  });
});

describe("estilo da IA (§6.5)", () => {
  test("título e descrição do vault", async () => {
    await renderStyle(stateWith(null));
    expect(
      screen.getByText("Escolha o jeito de falar. Você pode mudar depois."),
    ).toBeVisible();
  });

  test("cada opção tem descritor e amostra com o nome e o preço do serviço do rascunho", async () => {
    await renderStyle(stateWith(null));
    const expected: Array<[RegExp, string]> = [
      [/^Profissional/, "Clara e educada, sem emojis"],
      [/^Equilibrada/, "Simpática e direta, poucos emojis"],
      [/^Descontraída/, "Casual e próxima, com emojis"],
    ];
    for (const [name, descriptor] of expected) {
      const option = card(name);
      expect(within(option).getByText(descriptor)).toBeVisible();
      const text = flat(option.textContent);
      expect(text).toContain("Corte feminino");
      expect(text).toContain("R$ 90,00");
      expect(text).toContain("45");
    }
  });

  test("a amostra respeita os quatro tipos de preço", () => {
    const base = { serviceDuration: 45, serviceName: "Corte feminino" };
    for (const tone of ["PROFESSIONAL", "BALANCED", "CASUAL"] as const) {
      const fixed = flat(
        demoToneSample(
          { ...base, servicePrice: "90", servicePriceType: "FIXED" },
          tone,
        ),
      );
      expect(fixed).toContain("custa R$ 90,00");
      expect(fixed).not.toContain("a partir de");

      const starting = flat(
        demoToneSample(
          { ...base, servicePrice: "90", servicePriceType: "STARTING_AT" },
          tone,
        ),
      );
      expect(starting).toContain("a partir de R$ 90,00");

      const onRequest = flat(
        demoToneSample(
          { ...base, servicePrice: "90", servicePriceType: "ON_REQUEST" },
          tone,
        ),
      );
      expect(onRequest).toContain("sob consulta");
      expect(onRequest).not.toContain("R$");

      const notInformed = flat(
        demoToneSample(
          { ...base, servicePrice: "", servicePriceType: "NOT_INFORMED" },
          tone,
        ),
      );
      expect(notInformed).toContain("ainda não foi informado");
      expect(notInformed).not.toContain("R$");
    }
  });

  test("os três tons dizem a mesma coisa em vozes diferentes", () => {
    const draft = {
      serviceDuration: 45,
      serviceName: "Corte feminino",
      servicePrice: "90",
      servicePriceType: "FIXED" as const,
    };
    const professional = demoToneSample(draft, "PROFESSIONAL");
    const balanced = demoToneSample(draft, "BALANCED");
    const casual = demoToneSample(draft, "CASUAL");
    expect(new Set([professional, balanced, casual]).size).toBe(3);
    expect(professional).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(balanced).toMatch(/\p{Extended_Pictographic}/u);
    expect(casual).toMatch(/\p{Extended_Pictographic}/u);
  });

  test("tone nulo: Equilibrada vem selecionada, recomendada, com o CTA dela, e enviar grava BALANCED", async () => {
    const { user } = await renderStyle(stateWith(null));
    const balanced = card(/^Equilibrada/);
    expect(balanced).toHaveAttribute("aria-pressed", "true");
    expect(card(/^Profissional/)).toHaveAttribute("aria-pressed", "false");
    expect(card(/^Descontraída/)).toHaveAttribute("aria-pressed", "false");
    expect(within(balanced).getByText("recomendada")).toBeVisible();
    expect(screen.getAllByText("recomendada")).toHaveLength(1);

    await user.click(
      screen.getByRole("button", { name: "Continuar com Equilibrada" }),
    );
    expect(updateOnboarding).toHaveBeenCalledWith({ ai: { tone: "BALANCED" } });
    expect(push).toHaveBeenCalledWith("/onboarding/whatsapp");
  });

  test("tocar Profissional muda o CTA e grava PROFESSIONAL", async () => {
    const { user } = await renderStyle(stateWith(null));
    await user.click(card(/^Profissional/));
    expect(card(/^Profissional/)).toHaveAttribute("aria-pressed", "true");
    expect(card(/^Equilibrada/)).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByRole("button", { name: "Continuar com Equilibrada" }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Continuar com Profissional" }),
    );
    expect(updateOnboarding).toHaveBeenCalledWith({
      ai: { tone: "PROFESSIONAL" },
    });
  });

  test("com CASUAL gravado, Descontraída vem selecionada e o CTA a nomeia", async () => {
    await renderStyle(stateWith("CASUAL"));
    expect(card(/^Descontraída/)).toHaveAttribute("aria-pressed", "true");
    expect(card(/^Equilibrada/)).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Continuar com Descontraída" }),
    ).toBeVisible();
  });

  test("nenhum heading dentro de botão e o nome acessível começa pelo estilo", async () => {
    const { container } = await renderStyle(stateWith(null));
    const inside = Array.from(
      container.querySelectorAll("h1, h2, h3, h4, h5, h6"),
    ).filter((heading) => heading.closest("button"));
    expect(inside).toEqual([]);
    for (const style of ["Profissional", "Equilibrada", "Descontraída"]) {
      const option = screen.getByRole("button", {
        name: new RegExp(`^${style}`),
      });
      expect(option.textContent?.startsWith(style)).toBe(true);
    }
  });
});
