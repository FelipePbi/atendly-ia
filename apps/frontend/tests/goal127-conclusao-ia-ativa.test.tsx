// @vitest-environment jsdom
/**
 * Goal127 (WU-01) — a conclusão do onboarding depois do teste (quadro 4.9).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - com a IA `ACTIVE`, o WhatsApp `CONNECTED` e o número válido, a tela diz
 *   "Tudo pronto!", o texto do quadro e a pílula "IA ativa · +55 ...", com a
 *   arte decorativa e o CTA, sem eyebrow, sem chevron e sem o ponto "Sua IA
 *   conversou com o cliente de teste";
 * - a pílula, o texto e os anéis só afirmam o que `GET /v1/status` confirma;
 * - uma leitura de status e uma do teste, nenhuma a mais;
 * - a nota de limpeza e o erro de leitura continuam como eram;
 * - Configurações › IA e as outras etapas do onboarding ficam como eram;
 * - as `@keyframes` novas são declaradas uma vez e o movimento reduzido para
 *   tudo o que a conclusão anima.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
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
    conversations: {
      ignoreByPhone: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      setIgnored: vi.fn(),
    },
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

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <div>Painel de conexão do WhatsApp</div>,
}));

import { ActivationTestPanelBody } from "@/features/activation-test/ActivationTestPanels";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { OnboardingScenario } from "@/features/onboarding/scenarios";

const MILESTONES = [
  "MESSAGE_SENT",
  "SERVICE_IDENTIFIED",
  "PRICE_INFORMED",
  "AVAILABILITY_CHECKED",
  "SLOT_SELECTED",
  "APPOINTMENT_CONFIRMED",
] as const;

function runFixture(
  overrides: Partial<ActivationTestRun> = {},
): ActivationTestRun {
  return {
    id: "run-1",
    state: "SUCCEEDED",
    terminal: true,
    startedAt: "2026-09-14T12:00:00.000Z",
    finishedAt: "2026-09-14T12:05:00.000Z",
    pausedAt: null,
    currentStep: null,
    completedStep: null,
    attempts: 1,
    maxAttempts: 3,
    failedStep: null,
    failedStepLabel: null,
    failureCode: null,
    appointmentId: null,
    channelId: "channel-1",
    supersededByChannelChange: false,
    cleanupState: "CLEAN",
    cleanupAt: "2026-09-14T12:06:00.000Z",
    cleanupResidue: [],
    milestones: MILESTONES.map((milestone) => ({
      milestone,
      reached: true,
      reachedAt: "2026-09-14T12:01:00.000Z",
      sourceKind: "MESSAGE" as const,
      sourceId: `fact-${milestone}`,
    })),
    ...overrides,
  };
}

function statusFixture(
  aiState: "ACTIVE" | "OFF" | "PENDING" | "UNKNOWN",
  whatsapp: {
    phoneNumber?: string | null;
    status?: "CONNECTED" | "DISCONNECTED" | "UNKNOWN";
  } = {},
) {
  return {
    accountDeletion: { dueAt: null, status: "NONE" as const },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: aiState === "ACTIVE",
      reconciled: "CONVERGED" as const,
      state: aiState,
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-14T12:06:00.000Z",
      phoneNumber:
        whatsapp.phoneNumber === undefined
          ? "5511987654321"
          : whatsapp.phoneNumber,
      status: whatsapp.status ?? ("CONNECTED" as const),
    },
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

function renderScreen(scenario: OnboardingScenario) {
  getOnboarding.mockResolvedValue(onboardingState);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
}

async function renderSuccess() {
  const view = renderScreen("teste-real-sucesso");
  await screen.findByRole("heading", { level: 1, name: "Tudo pronto!" });
  return view;
}

const ACTIVE_TEXT = "Sua IA está ativa e pronta para atender seus clientes.";

function rings(container: HTMLElement) {
  return container.querySelectorAll(".completion-ring");
}

beforeEach(() => {
  vi.clearAllMocks();
  completeOnboarding.mockResolvedValue(onboardingState);
  refreshSession.mockResolvedValue(null);
  getWhatsapp.mockResolvedValue({
    phoneNumber: "+5511987654321",
    status: "CONNECTED",
  });
  getActivationTest.mockResolvedValue(runFixture());
  statusGet.mockResolvedValue(statusFixture("ACTIVE"));
});

describe("4.9 com a IA ativa e o WhatsApp conectado", () => {
  test("mostra o título, o texto, a pílula com o número, a arte e o CTA", async () => {
    const { container } = await renderSuccess();

    expect(await screen.findByText(ACTIVE_TEXT)).toBeVisible();
    expect(screen.getByText("IA ativa · +55 11 98765-4321")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Ir para o início" }),
    ).toBeVisible();

    const art = container.querySelector(".completion-art");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(rings(container)).toHaveLength(2);
  });

  test("sem eyebrow, sem chevron e sem o ponto do cliente de teste", async () => {
    const { container } = await renderSuccess();
    await screen.findByText(ACTIVE_TEXT);

    expect(container.querySelector(".onboarding-eyebrow")).toBeNull();
    expect(screen.queryByText("Teste concluído")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Voltar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Sua IA conversou com o cliente de teste/),
    ).not.toBeInTheDocument();
  });

  test("a barra de progresso e o Sair continuam no topo", async () => {
    await renderSuccess();

    expect(
      screen.getByRole("group", { name: "Progresso da configuração inicial" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });

  test("Ir para o início conclui o onboarding como antes", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    await renderSuccess();

    await user.click(screen.getByRole("button", { name: "Ir para o início" }));

    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inicio");
  });
});

describe("4.9: a pílula só afirma o que o status confirma", () => {
  test.each(["OFF", "PENDING", "UNKNOWN"] as const)(
    "sem pílula com a IA %s",
    async (state) => {
      statusGet.mockResolvedValue(statusFixture(state));
      await renderSuccess();
      await waitFor(() => expect(statusGet).toHaveBeenCalled());
      await screen.findByRole("heading", { level: 1, name: "Tudo pronto!" });
      await waitFor(() =>
        expect(document.querySelector(".completion-text p")).not.toBeNull(),
      );

      expect(screen.queryByText(/IA ativa/)).not.toBeInTheDocument();
    },
  );

  test("sem pílula enquanto o status carrega", async () => {
    statusGet.mockReturnValue(new Promise(() => undefined));
    await renderSuccess();

    expect(
      await screen.findByText("Confirmando se sua IA já está ativa..."),
    ).toBeVisible();
    expect(screen.queryByText(/IA ativa/)).not.toBeInTheDocument();
  });

  test("sem pílula com o status em erro", async () => {
    statusGet.mockRejectedValue(new Error("network"));
    await renderSuccess();

    expect(
      await screen.findByText(
        "Não foi possível confirmar se sua IA já está ativa.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/IA ativa/)).not.toBeInTheDocument();
  });

  test.each(["DISCONNECTED", "UNKNOWN"] as const)(
    "sem pílula com o WhatsApp %s, mesmo com a IA ACTIVE",
    async (status) => {
      statusGet.mockResolvedValue(statusFixture("ACTIVE", { status }));
      await renderSuccess();

      expect(await screen.findByText(ACTIVE_TEXT)).toBeVisible();
      expect(screen.queryByText(/IA ativa ·/)).not.toBeInTheDocument();
      expect(screen.queryByText("IA ativa")).not.toBeInTheDocument();
    },
  );

  test.each([
    ["ausente", null],
    ["não reconhecido", "abc"],
  ])("com o número %s a pílula diz só IA ativa", async (_label, phoneNumber) => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE", { phoneNumber }));
    await renderSuccess();

    expect(await screen.findByText("IA ativa")).toBeVisible();
    expect(screen.queryByText(/\+55/)).not.toBeInTheDocument();
  });
});

describe("4.9: texto e anéis seguem o estado da IA", () => {
  test.each([
    ["ACTIVE", ACTIVE_TEXT, 2],
    [
      "PENDING",
      "Sua IA está sendo ativada. Isso pode levar alguns instantes.",
      0,
    ],
    ["OFF", "Sua IA ainda não foi ativada.", 0],
    ["UNKNOWN", "Não foi possível confirmar se sua IA já está ativa.", 0],
  ] as const)("IA %s", async (state, text, ringCount) => {
    statusGet.mockResolvedValue(statusFixture(state));
    const { container } = await renderSuccess();

    expect(await screen.findByText(text)).toBeVisible();
    expect(rings(container)).toHaveLength(ringCount);
    expect(container.querySelector(".completion-disc")).not.toBeNull();
  });

  test("carregando e em erro, nenhum anel respira", async () => {
    statusGet.mockReturnValue(new Promise(() => undefined));
    const loading = await renderSuccess();
    expect(rings(loading.container)).toHaveLength(0);
    loading.unmount();

    statusGet.mockRejectedValue(new Error("network"));
    const failed = await renderSuccess();
    await screen.findByText(/Não foi possível confirmar/);
    expect(rings(failed.container)).toHaveLength(0);
  });

  test("o texto estático de scenarios.ts não aparece", async () => {
    await renderSuccess();
    await screen.findByText(ACTIVE_TEXT);

    expect(
      screen.queryByText(/Veja abaixo o estado real da ativação/),
    ).not.toBeInTheDocument();
  });
});

describe("4.9: uma leitura de cada", () => {
  test("um pedido a status.get e um a activationTest.get na montagem", async () => {
    await renderSuccess();
    await screen.findByText(ACTIVE_TEXT);
    await screen.findByText(
      "O agendamento e o cliente de teste foram removidos do seu negócio.",
    );

    expect(statusGet).toHaveBeenCalledTimes(1);
    expect(getActivationTest).toHaveBeenCalledTimes(1);
  });
});

describe("4.9: limpeza e erro de leitura", () => {
  test("CLEAN: diz que o agendamento e o cliente de teste saíram", async () => {
    await renderSuccess();

    expect(
      await screen.findByText(
        "O agendamento e o cliente de teste foram removidos do seu negócio.",
      ),
    ).toBeVisible();
  });

  test("RESIDUAL: nomeia o que ficou", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({
        cleanupResidue: [
          {
            explanation: "Ele continua no histórico.",
            id: "res-1",
            label: "Cliente de teste",
            target: "CUSTOMER",
          },
        ] as ActivationTestRun["cleanupResidue"],
        cleanupState: "RESIDUAL",
      }),
    );
    await renderSuccess();

    expect(
      await screen.findByText("Nem tudo o que o teste criou pôde ser removido:"),
    ).toBeVisible();
    expect(
      screen.getByText("Cliente de teste: Ele continua no histórico."),
    ).toBeVisible();
  });

  test("com a leitura do teste em erro, aparece o ErrorNote", async () => {
    getActivationTest.mockRejectedValue(new Error("network"));
    await renderSuccess();

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Não foi possível ler o andamento do teste.");
  });
});

describe("o que não muda", () => {
  test("Configurações › IA: o painel de sucesso é o de antes", async () => {
    render(<ActivationTestPanelBody panel="succeeded" />);

    expect(
      await screen.findByText(
        "Sua IA conversou com o cliente de teste e marcou o horário.",
      ),
    ).toBeVisible();
    expect(await screen.findByText(ACTIVE_TEXT)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Tudo pronto!" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".completion-art")).toBeNull();
  });

  test.each([
    ["whatsapp", "Conectar meu WhatsApp"],
    ["teste-real", "Iniciar teste"],
  ] as const)(
    "%s: etapa comum, com eyebrow e cabeçalho",
    async (scenario, cta) => {
      const { container } = renderScreen(scenario);

      expect(
        await screen.findByRole("button", { name: cta }),
      ).toBeInTheDocument();
      expect(container.querySelector(".onboarding-eyebrow")).not.toBeNull();
      expect(container.querySelector(".onboarding-heading h1")).not.toBeNull();
      expect(container.querySelector(".is-completion")).toBeNull();
    },
  );
});

describe("movimento", () => {
  const stylesDir = join(__dirname, "..", "src", "shared", "styles");
  const css = readdirSync(stylesDir)
    .filter((file) => file.endsWith(".css"))
    .map((file) => readFileSync(join(stylesDir, file), "utf8"))
    .join("\n")
    .replace(/\r\n/g, "\n");

  test.each(["at-breathe-lg", "at-pop"])(
    "@keyframes %s é declarada uma vez",
    (name) => {
      const declarations = css.match(
        new RegExp(`@keyframes ${name}\\s*\\{`, "g"),
      );
      expect(declarations).toHaveLength(1);
    },
  );

  test("com prefers-reduced-motion a conclusão não anima nada", () => {
    const block = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.completion-ring,[\s\S]*?\n\}\n/,
    );
    expect(block).not.toBeNull();
    const text = block?.[0] ?? "";
    for (const selector of [
      ".completion-ring",
      ".completion-disc",
      ".completion-text",
      ".onboarding-column.is-completion .onboarding-actions",
    ]) {
      expect(text).toContain(selector);
    }
    expect(text).toMatch(/animation:\s*none/);
  });
});
