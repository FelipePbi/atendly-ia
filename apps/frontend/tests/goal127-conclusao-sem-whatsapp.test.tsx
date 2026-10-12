// @vitest-environment jsdom
/**
 * Goal127 (WU-02) — a conclusão sem WhatsApp (quadro 4.10).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - a tela mostra a arte decorativa, o título e o texto de `scenarios.ts`, a
 *   pílula "IA inativa até conectar", sem eyebrow e sem chevron;
 * - "Ir para o início" vem antes de "Conectar agora", no DOM, e conclui o
 *   onboarding; "Conectar agora" leva a `/onboarding/whatsapp`;
 * - o quarto segmento da barra fica vazio e o WhatsApp não ganha ✓ na sidebar;
 *   o teste real que termina bem preenche o segmento; `progressPercent` não muda;
 * - as duas rotas entram no gate autenticado com o título como marcador;
 * - a tela não lê o status nem o teste real.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const refreshSession = vi.fn();
const statusGet = vi.fn();
const getActivationTest = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: { get: getActivationTest, restart: vi.fn(), start: vi.fn() },
    auth: { logout: vi.fn() },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: vi.fn(),
    },
    status: { get: statusGet },
    whatsapp: { get: vi.fn() },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

import {
  chapterFraction,
  chapterProgress,
  progressPercent,
} from "@/features/onboarding/blocks";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import {
  type OnboardingScenario,
  onboardingScenarios,
} from "@/features/onboarding/scenarios";

import { ONBOARDING_ROUTES } from "../e2e/routes";

const onboardingState: OnboardingState = {
  ai: { tone: "PROFESSIONAL" },
  availability: null,
  business: null,
  calendar: { integration: null, source: "AVENLY", timezone: null },
  completed: false,
  completedAt: null,
  service: null,
  whatsapp: null,
};

const TITLE = "Sua Avenly está configurada.";
const TEXT =
  "Conecte seu WhatsApp quando quiser colocar a IA para atender seus clientes.";

function renderScreen(scenario: OnboardingScenario) {
  getOnboarding.mockResolvedValue(onboardingState);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
}

async function renderConclusion() {
  const view = renderScreen("whatsapp-concluido");
  await screen.findByRole("heading", { level: 1, name: TITLE });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  completeOnboarding.mockResolvedValue(onboardingState);
  refreshSession.mockResolvedValue(null);
});

describe("4.10: a tela como o quadro", () => {
  test("mostra o título, o texto, a pílula e a arte decorativa", async () => {
    const { container } = await renderConclusion();

    expect(screen.getByText(TEXT)).toBeVisible();
    expect(screen.getByText("IA inativa até conectar")).toBeVisible();

    const art = container.querySelector(".completion-art");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".completion-ring")).toHaveLength(0);
    // Validação de 2026-10-11: o check de sucesso fica no próprio disco, no
    // lugar do anel neutro com o selo no canto.
    expect(art?.querySelector(".completion-disc .completion-check")).not.toBeNull();
    expect(art?.querySelector(".completion-badge")).toBeNull();
  });

  test("sem eyebrow e sem chevron de voltar", async () => {
    const { container } = await renderConclusion();

    expect(container.querySelector(".onboarding-eyebrow")).toBeNull();
    expect(screen.queryByText("Onboarding concluído")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Voltar" }),
    ).not.toBeInTheDocument();
  });

  test("não lê o status nem o teste real", async () => {
    await renderConclusion();

    expect(statusGet).not.toHaveBeenCalled();
    expect(getActivationTest).not.toHaveBeenCalled();
  });
});

describe("4.10: as ações", () => {
  test("'Ir para o início' vem antes de 'Conectar agora' no DOM", async () => {
    await renderConclusion();

    const primary = screen.getByRole("button", { name: "Ir para o início" });
    const secondary = screen.getByRole("link", { name: "Conectar agora" });

    expect(primary).toHaveClass("btn-primary");
    expect(secondary).toHaveClass("btn-secondary");
    expect(
      primary.compareDocumentPosition(secondary) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(primary.parentElement).toBe(secondary.parentElement);
    expect(primary.parentElement).toHaveClass("is-stacked");
  });

  test("'Conectar agora' leva a /onboarding/whatsapp", async () => {
    await renderConclusion();

    expect(
      screen.getByRole("link", { name: "Conectar agora" }),
    ).toHaveAttribute("href", "/onboarding/whatsapp");
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  test("'Ir para o início' conclui o onboarding como antes", async () => {
    const user = userEvent.setup();
    await renderConclusion();

    await user.click(screen.getByRole("button", { name: "Ir para o início" }));

    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inicio");
  });
});

describe("4.10: o progresso", () => {
  test("o quarto segmento tem preenchimento 0 e o do teste real que termina bem, 1", () => {
    expect(chapterFraction("whatsapp-concluido")).toBe(0);
    expect(chapterFraction("teste-real-sucesso")).toBe(1);

    expect(chapterProgress("whatsapp-concluido")[3]?.fill).toBe(0);
    expect(chapterProgress("teste-real-sucesso")[3]?.fill).toBe(1);
  });

  test("os três primeiros capítulos ficam concluídos e o WhatsApp não", () => {
    const chapters = chapterProgress("whatsapp-concluido");

    expect(chapters.map((chapter) => chapter.status)).toEqual([
      "done",
      "done",
      "done",
      "current",
    ]);
  });

  test("no teste real que termina bem os quatro capítulos ficam concluídos, como no quadro 4.9", () => {
    expect(chapterProgress("teste-real-sucesso").map((chapter) => chapter.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
  });

  test("progressPercent não muda", () => {
    expect(progressPercent("whatsapp-concluido")).toBe(100);
    expect(progressPercent("teste-real-sucesso")).toBe(100);
  });

  test("a barra e a sidebar não marcam o WhatsApp como concluído", async () => {
    await renderConclusion();

    const rail = screen.getByRole("navigation", {
      name: "Configuração inicial",
    });
    const segments = screen.getByRole("group", {
      name: "Progresso da configuração inicial",
    });

    for (const scope of [rail, segments]) {
      const items = within(scope).getAllByRole("listitem");
      expect(items).toHaveLength(4);
      expect(items[2]).toHaveAccessibleName(/Sua IA.*concluído/);
      expect(items[3]).toHaveAccessibleName("WhatsApp");
    }

    const fill = segments.querySelector(".step-segment-fill");
    expect(fill).toHaveStyle({ width: "0%" });
    expect(rail.querySelector(".onboarding-stepper-item:last-child svg")).toBeNull();
  });
});

describe("4.10 no gate autenticado", () => {
  test.each([
    ["teste-real-sucesso", "Tudo pronto!"],
    ["whatsapp-concluido", TITLE],
  ] as const)("%s está em ONBOARDING_ROUTES com o título como marcador", (step, marker) => {
    const route = ONBOARDING_ROUTES.find(
      (candidate) => (candidate.path as string) === `/onboarding/${step}`,
    );

    expect(route).toBeDefined();
    expect(route?.name).toBe(`onboarding-${step}`);
    expect(route?.contentMarker).toBe(marker);
    expect(route?.contentMarker).toBe(onboardingScenarios[step][1]);
  });
});
