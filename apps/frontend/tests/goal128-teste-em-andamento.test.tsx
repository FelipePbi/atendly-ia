// @vitest-environment jsdom
/**
 * Goal128 (WU-01) — o teste real em andamento (quadro 4.7).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - a linha do tempo vem só de `run.milestones` e de `state`: concluída só com
 *   `reached: true`, atual só com `RUNNING`, o resto pendente, e "Limpando
 *   dados de teste" sempre pendente, sem segunda linha;
 * - o cabeçalho e o rodapé são os do quadro: "Abrir WhatsApp", a nota e
 *   "Continuar depois" discreto, sem "Continuar";
 * - a tela vai sozinha, com `replace`, para a tela do estado quando a leitura
 *   mostra que a execução terminou ou pausou, e fica onde está com `RUNNING`,
 *   sem execução ou com a leitura em erro;
 * - Configurações › IA continua com o progresso de antes, sem navegar;
 * - o movimento da linha do tempo para com `prefers-reduced-motion`, e as
 *   `@keyframes` que ela usa são declaradas uma vez.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
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
const refreshSession = vi.fn();
const statusGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: vi.fn(),
      start: vi.fn(),
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
  activationTestTimelineStates,
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

/** Uma execução com os `reached` primeiros marcos alcançados. */
function runFixture(
  reached: number,
  overrides: Partial<ActivationTestRun> = {},
): ActivationTestRun {
  return {
    id: "run-1",
    state: "RUNNING",
    terminal: false,
    startedAt: "2026-10-06T12:00:00.000Z",
    finishedAt: null,
    pausedAt: null,
    currentStep: "AI_CHECKS_AVAILABILITY",
    completedStep: null,
    attempts: 1,
    maxAttempts: 2,
    failedStep: null,
    failedStepLabel: null,
    failureCode: null,
    appointmentId: null,
    channelId: "channel-1",
    supersededByChannelChange: false,
    cleanupState: "PENDING",
    cleanupAt: null,
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

function renderProgress() {
  getOnboarding.mockResolvedValue(onboardingState);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="teste-real-progresso" />
    </OnboardingRuntimeProvider>,
  );
}

async function renderProgressWith(run: ActivationTestRun | null) {
  getActivationTest.mockResolvedValue(run);
  const view = renderProgress();
  await screen.findByRole("heading", { level: 1, name: "Teste em andamento" });
  if (run) await screen.findByText("Mensagem enviada");
  return view;
}

/** Cada linha da linha do tempo: o rótulo e o estado que a usuária lê. */
function timelineRows(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(".activation-timeline-row"),
  ).map((row) => ({
    current: row.getAttribute("aria-current") === "step",
    label:
      row.querySelector(".activation-timeline-label")?.firstChild?.textContent ??
      "",
    secondLine: row.querySelector(".activation-timeline-detail"),
    text: row.textContent ?? "",
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getActivationTest.mockReset();
  completeOnboarding.mockResolvedValue(onboardingState);
  refreshSession.mockResolvedValue(null);
  statusGet.mockResolvedValue({});
  getWhatsapp.mockResolvedValue({
    phoneNumber: "+5511987654321",
    status: "CONNECTED",
  });
});

describe("4.7: a linha do tempo é a leitura, nada mais", () => {
  test("três marcos alcançados e RUNNING: três concluídas, a quarta atual, duas pendentes e a limpeza pendente", async () => {
    const { container } = await renderProgressWith(runFixture(3));
    const rows = timelineRows(container);

    expect(rows.map((row) => row.label)).toEqual([
      ...MILESTONES.map((milestone) => MILESTONE_LABELS[milestone]),
      "Limpando dados de teste",
    ]);
    expect(rows.map((row) => row.text)).toEqual([
      "Mensagem enviada — concluído",
      "Serviço identificado — concluído",
      "Preço informado — concluído",
      "Agenda consultada — em andamento",
      "Horário selecionado — ainda não começou",
      "Agendamento confirmado — ainda não começou",
      "Limpando dados de teste — ainda não começou",
    ]);
    expect(rows.map((row) => row.current)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  test("sem segunda linha: o contrato não traz o que a IA fez dentro do marco", async () => {
    const { container } = await renderProgressWith(runFixture(3));

    expect(container.querySelectorAll(".activation-timeline-detail")).toHaveLength(
      0,
    );
    expect(screen.queryByText(/próximo horário livre/)).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  test("com zero marcos alcançados, a primeira linha é a atual", async () => {
    const { container } = await renderProgressWith(runFixture(0));
    // Sem marco alcançado a primeira linha ainda não tem o texto de "concluído".
    const rows = timelineRows(container);

    expect(rows[0]).toMatchObject({
      current: true,
      text: "Mensagem enviada — em andamento",
    });
    expect(rows.filter((row) => row.current)).toHaveLength(1);
  });

  test("com os seis alcançados e RUNNING, nenhuma linha é a atual", async () => {
    const { container } = await renderProgressWith(runFixture(6));
    const rows = timelineRows(container);

    expect(rows.filter((row) => row.current)).toHaveLength(0);
    expect(rows.slice(0, 6).every((row) => row.text.endsWith("concluído"))).toBe(
      true,
    );
    expect(rows[6].text).toBe("Limpando dados de teste — ainda não começou");
  });

  test("a linha atual é o primeiro marco não alcançado, não o último alcançado nem o que o tempo indica", () => {
    // Um marco depois do primeiro aberto, alcançado fora de ordem, continua
    // concluído; o atual é sempre o primeiro `reached: false`.
    const run = runFixture(2);
    run.milestones[4] = { ...run.milestones[4], reached: true };

    expect(activationTestTimelineStates(run)).toEqual([
      "done",
      "done",
      "current",
      "pending",
      "done",
      "pending",
    ]);
  });

  test("só FAILED deixa o primeiro aberto vermelho, e só RUNNING o deixa atual", () => {
    expect(activationTestTimelineStates(runFixture(3))[3]).toBe("current");
    expect(
      activationTestTimelineStates(
        runFixture(3, { state: "FAILED", terminal: true }),
      )[3],
    ).toBe("failed");
    for (const state of ["PAUSED_BY_HUMAN", "SUCCEEDED", "DISCARDED"] as const) {
      expect(
        activationTestTimelineStates(runFixture(3, { state, terminal: true }))[3],
      ).toBe("pending");
    }
  });

  test("nada muda por tempo decorrido: a mesma leitura, a mesma linha do tempo", async () => {
    const { container } = await renderProgressWith(runFixture(1));
    const before = timelineRows(container).map((row) => row.text);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(timelineRows(container).map((row) => row.text)).toEqual(before);
  });
});

describe("4.7: cabeçalho e rodapé do quadro", () => {
  test("eyebrow WhatsApp, título e texto do quadro", async () => {
    const { container } = await renderProgressWith(runFixture(3));

    expect(container.querySelector(".onboarding-eyebrow")).toHaveTextContent(
      "WhatsApp",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Teste em andamento" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Acompanhe pelo WhatsApp se quiser. Não responda à conversa de teste.",
      ),
    ).toBeVisible();
  });

  test("Abrir WhatsApp, a nota e Continuar depois, sem Continuar", async () => {
    const { container } = await renderProgressWith(runFixture(3));
    const footer = container.querySelector<HTMLElement>(".onboarding-actions");
    expect(footer).not.toBeNull();
    const actions = within(footer as HTMLElement);

    const open = actions.getByRole("link", { name: "Abrir WhatsApp" });
    expect(open).toHaveAttribute("href", "whatsapp://send");
    expect(
      actions.getByText(
        "Pode sair do app — o teste continua e a tela se atualiza sozinha.",
      ),
    ).toBeVisible();
    const skip = actions.getByRole("button", { name: "Continuar depois" });
    expect(skip).toHaveClass("onboarding-actions-skip");
    expect(
      screen.queryByRole("button", { name: "Continuar" }),
    ).not.toBeInTheDocument();

    // A ordem do quadro: o botão, a nota e, discreto, "Continuar depois".
    expect(open.compareDocumentPosition(skip)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  test("Continuar depois conclui o onboarding sem teste, como antes", async () => {
    const user = userEvent.setup();
    await renderProgressWith(runFixture(3));

    await user.click(screen.getByRole("button", { name: "Continuar depois" }));

    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inicio");
  });
});

describe("4.7: a tela se atualiza sozinha", () => {
  test.each([
    ["SUCCEEDED", "teste-real-sucesso"],
    ["FAILED", "teste-real-falha"],
    ["PAUSED_BY_HUMAN", "teste-real-interferencia"],
  ] as const)(
    "a leitura %s leva, com replace, a %s",
    async (state, scenario) => {
      getActivationTest.mockResolvedValue(
        runFixture(state === "SUCCEEDED" ? 6 : 3, { state, terminal: true }),
      );
      renderProgress();

      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(`/onboarding/${scenario}`),
      );
      expect(replace).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
    },
  );

  test("RUNNING não navega", async () => {
    await renderProgressWith(runFixture(3));
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("sem execução não navega e diz que não há teste", async () => {
    await renderProgressWith(null);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nenhum teste em andamento",
    );
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("a leitura em erro não navega e mostra o erro", async () => {
    getActivationTest.mockRejectedValue(new Error("network"));
    renderProgress();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível ler o andamento do teste.",
    );
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("a leitura continua a cada 3 s enquanto RUNNING, e a nova leitura que termina leva à tela do estado", async () => {
    vi.useFakeTimers();
    try {
      getActivationTest
        .mockResolvedValueOnce(runFixture(3))
        .mockResolvedValue(runFixture(6, { state: "SUCCEEDED", terminal: true }));
      renderProgress();

      // O rascunho carrega primeiro; só então a etapa monta e lê a execução.
      for (let turn = 0; turn < 5; turn += 1) {
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(getActivationTest).toHaveBeenCalledTimes(1);
      expect(replace).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3_000);
      for (let turn = 0; turn < 5; turn += 1) {
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(getActivationTest).toHaveBeenCalledTimes(2);
      expect(replace).toHaveBeenCalledWith("/onboarding/teste-real-sucesso");

      // Terminou: a leitura para.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getActivationTest).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Configurações › IA continua como era", () => {
  test("o progresso tem a lista de antes, a nota de antes e nenhuma navegação", async () => {
    getActivationTest.mockResolvedValue(runFixture(2));
    const { container } = render(<ActivationTestPanelBody panel="progress" />);

    expect(await screen.findByText("Mensagem enviada")).toBeVisible();
    expect(screen.getByText("Preço informado — aguardando")).toBeVisible();
    expect(
      screen.getByText(/O teste continua no servidor: você pode fechar esta tela/),
    ).toBeVisible();
    expect(container.querySelector(".activation-timeline")).toBeNull();
    expect(screen.queryByText("Limpando dados de teste")).not.toBeInTheDocument();
  });

  test("com a execução terminada, o progresso de Configurações não navega", async () => {
    getActivationTest.mockResolvedValue(
      runFixture(6, { state: "SUCCEEDED", terminal: true }),
    );
    render(<ActivationTestPanelBody panel="progress" />);

    expect(await screen.findByText("Mensagem enviada")).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("a falha é a de antes", async () => {
    getActivationTest.mockResolvedValue(
      runFixture(3, {
        failedStepLabel: "A IA consultar a agenda",
        state: "FAILED",
        terminal: true,
      }),
    );
    const { container } = render(<ActivationTestPanelBody panel="failed" />);

    expect(
      await screen.findByText("O teste parou em: A IA consultar a agenda."),
    ).toBeVisible();
    expect(
      screen.getByText(/Sua IA continua desligada\. Nenhum teste que não termina/),
    ).toBeVisible();
    expect(container.querySelector(".activation-timeline")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("movimento da linha do tempo", () => {
  const stylesDir = join(__dirname, "..", "src", "shared", "styles");
  const css = readdirSync(stylesDir)
    .filter((file) => file.endsWith(".css"))
    .map((file) => readFileSync(join(stylesDir, file), "utf8"))
    .join("\n")
    .replace(/\r\n/g, "\n");

  test.each(["at-breathe", "at-reveal"])(
    "@keyframes %s é declarada uma vez",
    (name) => {
      const declarations = css.match(
        new RegExp(`@keyframes ${name}\\s*\\{`, "g"),
      );
      expect(declarations).toHaveLength(1);
    },
  );

  test("com prefers-reduced-motion nada se move e o anel fica visível", () => {
    const block = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.activation-timeline\.is-animated[\s\S]*?\n\}\n/,
    );
    expect(block).not.toBeNull();
    const text = block?.[0] ?? "";
    expect(text).toContain(".activation-timeline.is-animated .activation-timeline-row");
    expect(text).toContain(
      ".activation-timeline-row.is-current .activation-timeline-marker::before",
    );
    expect(text).toMatch(/animation:\s*none/);
    // Parar a animação deixa o anel no estado base, visível: nenhuma regra o
    // esconde com movimento reduzido.
    expect(text).not.toMatch(/opacity:\s*0/);
  });

  test("as linhas só entram animadas na 4.7, com os atrasos do quadro", async () => {
    const { container } = await renderProgressWith(runFixture(3));
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(".activation-timeline-row"),
    );

    expect(container.querySelector(".activation-timeline")).toHaveClass(
      "is-animated",
    );
    expect(
      rows
        .slice(0, 4)
        .map((row) => row.style.getPropertyValue("--timeline-delay")),
    ).toEqual(["0.2s", "0.5s", "0.8s", "1.1s"]);
  });
});
