// @vitest-environment jsdom
/**
 * Goal128 (WU-02) — o teste que falhou (quadro 4.8).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - a linha que falhou é o primeiro marco não alcançado de uma execução
 *   `FAILED`; com os seis alcançados nenhuma fica vermelha, e o cartão começa
 *   por onde o servidor diz que o teste parou;
 * - a segunda linha e o cartão "O que você pode fazer" vêm do `failureCode`,
 *   com o texto fixo de cada um dos seis códigos, de código desconhecido e de
 *   `null`;
 * - a frase de tentativas só aparece com `attempts > 1`, e a nota de limpeza
 *   com `CLEAN` e com `RESIDUAL`;
 * - o cabeçalho é o do quadro e "Tentar novamente" vem antes de "Fazer isso
 *   depois", no DOM, cada um com o efeito de antes;
 * - Configurações › IA continua com a falha de antes;
 * - a moldura de conclusão usa `safe center`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ActivationTestRun, OnboardingState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const getWhatsapp = vi.fn();
const getActivationTest = vi.fn();
const startActivationTest = vi.fn();
const refreshSession = vi.fn();
const statusGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: vi.fn(),
      start: startActivationTest,
    },
    auth: { logout: vi.fn() },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: vi.fn(),
    },
    status: { get: statusGet },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

import {
  ActivationTestPanelBody,
  MILESTONE_LABELS,
} from "@/features/activation-test/ActivationTestPanels";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

const MILESTONES = [
  "MESSAGE_SENT",
  "SERVICE_IDENTIFIED",
  "PRICE_INFORMED",
  "AVAILABILITY_CHECKED",
  "SLOT_SELECTED",
  "APPOINTMENT_CONFIRMED",
] as const;

/** Uma execução `FAILED` com os `reached` primeiros marcos alcançados. */
function failedFixture(
  reached: number,
  overrides: Partial<ActivationTestRun> = {},
): ActivationTestRun {
  return {
    id: "run-1",
    state: "FAILED",
    terminal: true,
    startedAt: "2026-10-06T12:00:00.000Z",
    finishedAt: "2026-10-06T12:05:00.000Z",
    pausedAt: null,
    currentStep: null,
    completedStep: null,
    attempts: 1,
    maxAttempts: 2,
    failedStep: "AI_CHECKS_AVAILABILITY",
    failedStepLabel: "A IA consultar a agenda",
    failureCode: "ACTIVATION_TEST_AI_DID_NOT_ACT",
    appointmentId: null,
    channelId: "channel-1",
    supersededByChannelChange: false,
    cleanupState: "CLEAN",
    cleanupAt: "2026-10-06T12:06:00.000Z",
    cleanupResidue: [],
    milestones: MILESTONES.map((milestone, index) => ({
      milestone,
      reached: index < reached,
      reachedAt: index < reached ? "2026-10-06T12:01:00.000Z" : null,
      sourceKind: index < reached ? ("MESSAGE" as const) : null,
      sourceId: index < reached ? `fact-${milestone}` : null,
    })),
    ...overrides,
  };
}

const onboardingState: OnboardingState = {
  ai: { tone: "PROFESSIONAL" },
  availability: null,
  business: null,
  calendar: { integration: null, source: "AVENLY", timezone: null },
  completed: false,
  completedAt: null,
  service: null,
  whatsapp: { phoneNumber: "+5511987654321", status: "CONNECTED" },
};

const GENERIC_ADVICE =
  "Tente de novo. Pode ter sido uma falha momentânea. Seus serviços e horários foram conferidos antes de o teste começar.";
const NOT_DELIVERED_ADVICE =
  "Confira se o seu WhatsApp continua conectado e tente de novo.";

async function renderFailed(run: ActivationTestRun | null) {
  getOnboarding.mockResolvedValue(onboardingState);
  getActivationTest.mockResolvedValue(run);
  const view = render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="teste-real-falha" />
    </OnboardingRuntimeProvider>,
  );
  await screen.findByRole("heading", {
    level: 1,
    name: "O teste não foi concluído",
  });
  await screen.findByText("O que você pode fazer");
  return view;
}

function timelineRows(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(".activation-timeline-row"),
  ).map((row) => ({
    failed: row.classList.contains("is-failed"),
    label:
      row.querySelector(".activation-timeline-label")?.firstChild?.textContent ??
      "",
    secondLine:
      row.querySelector(".activation-timeline-detail")?.textContent ?? null,
  }));
}

function card(container: HTMLElement) {
  return (
    container.querySelector(".activation-failed-card-text")?.textContent ?? ""
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getActivationTest.mockReset();
  completeOnboarding.mockResolvedValue(onboardingState);
  refreshSession.mockResolvedValue(null);
  statusGet.mockResolvedValue({});
  startActivationTest.mockResolvedValue(undefined);
  getWhatsapp.mockResolvedValue({
    phoneNumber: "+5511987654321",
    status: "CONNECTED",
  });
});

describe("4.8: a linha do tempo até onde deu certo", () => {
  test("a linha que falhou é o primeiro marco não alcançado, e as pendentes seguem", async () => {
    const { container } = await renderFailed(failedFixture(3));
    const rows = timelineRows(container);

    expect(rows.map((row) => row.label)).toEqual(
      MILESTONES.map((milestone) => MILESTONE_LABELS[milestone]),
    );
    expect(rows.map((row) => row.failed)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    // Sem a linha da limpeza e sem animação: a 4.8 não se move.
    expect(screen.queryByText("Limpando dados de teste")).not.toBeInTheDocument();
    expect(container.querySelector(".activation-timeline")).not.toHaveClass(
      "is-animated",
    );
    expect(
      container.querySelector(".activation-timeline-row.is-failed"),
    ).toHaveTextContent("Agenda consultada: não concluído");
  });

  test("só a linha que falhou tem segunda linha", async () => {
    const { container } = await renderFailed(failedFixture(3));

    expect(
      timelineRows(container)
        .filter((row) => row.secondLine !== null)
        .map((row) => row.label),
    ).toEqual(["Agenda consultada"]);
  });

  test("a linha que falhou acompanha os marcos: sem nenhum alcançado, é a primeira", async () => {
    const { container } = await renderFailed(failedFixture(0));

    expect(timelineRows(container).map((row) => row.failed)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  test("com os seis alcançados, nenhuma linha fica vermelha e o cartão começa por onde o teste parou", async () => {
    const { container } = await renderFailed(failedFixture(6));

    expect(timelineRows(container).some((row) => row.failed)).toBe(false);
    expect(
      timelineRows(container).every((row) => row.secondLine === null),
    ).toBe(true);
    expect(card(container)).toBe(
      `O teste parou em: A IA consultar a agenda. ${GENERIC_ADVICE}`,
    );
  });

  test("com os seis alcançados e sem rótulo, o cartão começa por 'O teste parou antes de terminar.'", async () => {
    const { container } = await renderFailed(
      failedFixture(6, { failedStepLabel: null }),
    );

    expect(card(container)).toBe(
      `O teste parou antes de terminar. ${GENERIC_ADVICE}`,
    );
  });

  test("com uma linha vermelha, o cartão não repete onde o teste parou", async () => {
    const { container } = await renderFailed(failedFixture(3));

    expect(card(container)).not.toContain("O teste parou em:");
    expect(card(container)).not.toContain("O teste parou antes de terminar.");
  });
});

describe("4.8: o que falhou e o que fazer, pelo failureCode", () => {
  test.each([
    [
      "ACTIVATION_TEST_AI_DID_NOT_ACT",
      "A IA não concluiu esta etapa.",
      GENERIC_ADVICE,
    ],
    [
      "ACTIVATION_TEST_AI_DID_NOT_REPLY",
      "A IA não respondeu ao cliente de teste.",
      GENERIC_ADVICE,
    ],
    [
      "ACTIVATION_TEST_AI_REPLY_NOT_DELIVERED",
      "A resposta da IA não saiu pelo seu WhatsApp.",
      NOT_DELIVERED_ADVICE,
    ],
    [
      "ACTIVATION_TEST_AI_DID_NOT_CONFIRM_APPOINTMENT",
      "A IA não confirmou o agendamento.",
      GENERIC_ADVICE,
    ],
    [
      "ACTIVATION_TEST_ABANDONED",
      "O teste parou de responder.",
      GENERIC_ADVICE,
    ],
    [
      "ACTIVATION_TEST_STEP_FAILED",
      "O teste parou nesta etapa.",
      GENERIC_ADVICE,
    ],
    ["ACTIVATION_TEST_UNKNOWN_CODE", "O teste parou nesta etapa.", GENERIC_ADVICE],
    [null, "O teste parou nesta etapa.", GENERIC_ADVICE],
  ] as const)(
    "%s: segunda linha e cartão fixos",
    async (failureCode, secondLine, advice) => {
      const { container } = await renderFailed(
        failedFixture(3, { failureCode }),
      );

      const failedRow = timelineRows(container).find((row) => row.failed);
      expect(failedRow?.secondLine).toBe(secondLine);
      expect(card(container)).toBe(advice);
    },
  );

  test("nome herdado de Object.prototype não é um código", async () => {
    const { container } = await renderFailed(
      failedFixture(3, { failureCode: "constructor" }),
    );

    expect(card(container)).toBe(GENERIC_ADVICE);
    expect(
      timelineRows(container).find((row) => row.failed)?.secondLine,
    ).toBe("O teste parou nesta etapa.");
  });

  test("só 'resposta não entregue' pede para conferir o WhatsApp", async () => {
    const { container } = await renderFailed(
      failedFixture(3, {
        failureCode: "ACTIVATION_TEST_AI_REPLY_NOT_DELIVERED",
      }),
    );

    expect(card(container)).toContain("Confira se o seu WhatsApp");
    expect(card(container)).not.toContain("falha momentânea");
  });

  test("a frase de tentativas só aparece com attempts > 1, no fim do cartão", async () => {
    const one = await renderFailed(failedFixture(3, { attempts: 1 }));
    expect(card(one.container)).not.toContain("A Avenly tentou");
    one.unmount();

    const two = await renderFailed(failedFixture(3, { attempts: 2 }));
    expect(card(two.container)).toBe(
      `${GENERIC_ADVICE} A Avenly tentou 2 de 2 vezes antes de parar.`,
    );
  });

  test("com os seis alcançados e attempts > 1, o cartão tem a abertura, o conselho e as tentativas, nessa ordem", async () => {
    const { container } = await renderFailed(
      failedFixture(6, { attempts: 2 }),
    );

    expect(card(container)).toBe(
      `O teste parou em: A IA consultar a agenda. ${GENERIC_ADVICE} A Avenly tentou 2 de 2 vezes antes de parar.`,
    );
  });

  test("sem execução não há linha do tempo e o cartão leva a frase genérica", async () => {
    getActivationTest.mockResolvedValue(null);
    const { container } = await renderFailed(null);

    expect(container.querySelector(".activation-timeline")).toBeNull();
    expect(card(container)).toBe(GENERIC_ADVICE);
  });

  test("nenhum texto culpa a pessoa nem promete correção que ela não faz", async () => {
    const { container } = await renderFailed(failedFixture(3));
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/você errou|sua culpa|horário livre|Revisar horários/i);
  });
});

describe("4.8: cabeçalho, nota de limpeza e rodapé", () => {
  test("eyebrow WhatsApp, título e texto do quadro", async () => {
    const { container } = await renderFailed(failedFixture(3));

    expect(container.querySelector(".onboarding-eyebrow")).toHaveTextContent(
      "WhatsApp",
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "O teste não foi concluído",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Sua IA ainda não está ativa. Nada foi enviado aos seus clientes.",
      ),
    ).toBeVisible();
  });

  test("o cartão tem o título do quadro", async () => {
    const { container } = await renderFailed(failedFixture(3));

    expect(
      container.querySelector(".activation-failed-card-title"),
    ).toHaveTextContent("O que você pode fazer");
  });

  test("a nota de limpeza CLEAN fica abaixo do cartão", async () => {
    const { container } = await renderFailed(
      failedFixture(3, { cleanupState: "CLEAN" }),
    );
    const note = screen.getByText(
      "O agendamento e o cliente de teste foram removidos do seu negócio.",
    );

    expect(note).toBeVisible();
    const cardElement = container.querySelector(".activation-failed-card");
    expect(cardElement).not.toBeNull();
    expect(
      (cardElement as HTMLElement).compareDocumentPosition(note),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test("a nota de limpeza RESIDUAL lista o que ficou", async () => {
    await renderFailed(
      failedFixture(3, {
        cleanupResidue: [
          {
            explanation: "Remova pela Agenda.",
            id: "appt-1",
            reason: "REMOVAL_FAILED",
            label: "Agendamento de teste",
            target: "APPOINTMENT",
          },
        ],
        cleanupState: "RESIDUAL",
      }),
    );

    expect(
      screen.getByText("Nem tudo o que o teste criou pôde ser removido:"),
    ).toBeVisible();
    expect(
      screen.getByText("Agendamento de teste: Remova pela Agenda."),
    ).toBeVisible();
  });

  test("com a limpeza PENDING não há nota de limpeza", async () => {
    await renderFailed(failedFixture(3, { cleanupState: "PENDING" }));

    expect(
      screen.queryByText(/foram removidos do seu negócio/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Nem tudo o que o teste criou/),
    ).not.toBeInTheDocument();
  });

  test("'Tentar novamente' vem antes de 'Fazer isso depois', no DOM", async () => {
    const { container } = await renderFailed(failedFixture(3));
    const footer = container.querySelector<HTMLElement>(".onboarding-actions");
    expect(footer).not.toBeNull();
    const buttons = within(footer as HTMLElement).getAllByRole("button");

    expect(buttons.map((button) => button.textContent)).toEqual([
      "Tentar novamente",
      "Fazer isso depois",
    ]);
    expect(buttons[0]).toHaveClass("btn-primary");
    expect(buttons[1]).toHaveClass("btn-secondary");
  });

  test("'Tentar novamente' inicia uma execução nova, como antes", async () => {
    const user = userEvent.setup();
    await renderFailed(failedFixture(3));

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(startActivationTest).toHaveBeenCalledWith("+5511987654321");
    expect(push).toHaveBeenCalledWith("/onboarding/teste-real-progresso");
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  test("'Fazer isso depois' conclui o onboarding sem teste, como antes", async () => {
    const user = userEvent.setup();
    await renderFailed(failedFixture(3));

    await user.click(screen.getByRole("button", { name: "Fazer isso depois" }));

    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inicio");
    expect(startActivationTest).not.toHaveBeenCalled();
  });

  test("a falha não navega sozinha", async () => {
    await renderFailed(failedFixture(3));
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Configurações › IA continua como era", () => {
  test("a falha é a de antes: nota, frase de IA desligada, tentativas e limpeza", async () => {
    getActivationTest.mockResolvedValue(failedFixture(3, { attempts: 2 }));
    const { container } = render(<ActivationTestPanelBody panel="failed" />);

    expect(
      await screen.findByText("O teste parou em: A IA consultar a agenda."),
    ).toBeVisible();
    expect(
      screen.getByText(/Sua IA continua desligada\. Nenhum teste que não termina/),
    ).toBeVisible();
    expect(
      screen.getByText("A Avenly tentou 2 de 2 vezes antes de parar."),
    ).toBeVisible();
    expect(
      screen.getByText(
        "O agendamento e o cliente de teste foram removidos do seu negócio.",
      ),
    ).toBeVisible();
    expect(container.querySelector(".activation-timeline")).toBeNull();
    expect(container.querySelector(".activation-failed-card")).toBeNull();
    expect(screen.queryByText("O que você pode fazer")).not.toBeInTheDocument();
  });
});

describe("moldura de conclusão", () => {
  const stylesDir = join(__dirname, "..", "src", "shared", "styles");
  const css = readdirSync(stylesDir)
    .filter((file) => file.endsWith(".css"))
    .map((file) => readFileSync(join(stylesDir, file), "utf8"))
    .join("\n")
    .replace(/\r\n/g, "\n");

  test(".onboarding-content.is-completion centraliza sem cortar o topo: safe center", () => {
    const rule = css.match(/\n\.onboarding-content\.is-completion \{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const body = rule?.[1] ?? "";

    expect(body).toMatch(/justify-content:\s*safe center;/);
    expect(body).not.toMatch(/justify-content:\s*center;/);
    // Sem outra mudança na moldura: o resto da regra é o de antes.
    expect(body).toMatch(/padding:\s*0 20px;/);
    expect(body).toMatch(/align-items:\s*center;/);
    expect(body).toMatch(/gap:\s*32px;/);
  });
});
