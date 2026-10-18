// @vitest-environment jsdom
/**
 * Início · Faturamento que vale a tela (Home-Faturamento.dc.html, 2026-10-18).
 *
 * Prova, pelo que a profissional lê:
 * - 1b "Painel do dia" é o padrão; o seletor ao lado do sino troca para 1a
 *   "Agenda que fatura", a escolha fica lembrada na aba e a troca entra com
 *   a coreografia de abertura;
 * - no celular, o painel alterna Hoje/Semana de verdade, com o número grande,
 *   a comparação "que ontem a esta hora", a entrar e o que veio
 *   pela IA; o rodapé é o mês, que leva ao Faturamento;
 * - o mês nunca mostra meta nem projeção (decisão de 2026-10-18): só o que
 *   já entrou e o que está confirmado pela frente;
 * - na 1a, cada atendimento mostra o valor e os concluídos se recolhem numa
 *   linha no celular;
 * - no tablet e no desktop o painel abre em três zonas e o bloco "O que a IA
 *   fez por você" traz a manchete da semana;
 * - se a leitura do faturamento falhar, só ele sai: a agenda continua.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  Appointment,
  CalendarState,
  Dashboard,
  RevenueReport,
  SystemStatus,
} from "@/data";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { claimSessionMemory } from "@/shared/runtime/sessionMemory";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

import { expectNoA11yViolations } from "./support/a11y";
import { clearViewport, stubViewport } from "./support/viewport";

const dashboardGet = vi.fn();
const statusGet = vi.fn();
const revenueGet = vi.fn();
const notificationsSummary = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    dashboard: { get: dashboardGet },
    notifications: { summary: notificationsSummary },
    revenue: { get: revenueGet },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Camila" },
      tenant: { name: "Studio Camila" },
      user: { email: "camila@studio.com.br", name: "Camila Reis" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

const TODAY = "2026-10-15";

const CAPABILITIES: CalendarState["capabilities"] = {
  activationTestCompleted: true,
  aiActivationReady: true,
  createAppointments: true,
  hoursConfigured: true,
  manageAvailability: true,
  manageCustomers: true,
  manageServices: true,
  migrate: false,
};

function appointment(
  id: string,
  name: string,
  startTime: string,
  endTime: string,
  status: string,
  price: number,
  source: Appointment["source"] = "USER",
): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: `c-${id}`, name, phone: "5511900000000" },
    customerId: `c-${id}`,
    date: TODAY,
    durationMinutes: 45,
    endTime,
    finalValue: null,
    id,
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [
      {
        durationMinutes: 45,
        name: "Corte feminino",
        price,
        priceType: "FIXED",
        serviceId: "s1",
      },
    ],
    source,
    startTime,
    status,
    title: null,
    totalPrice: price,
    totalPriceType: "FIXED",
  };
}

const APPOINTMENTS = [
  appointment("bia", "Bia Castro", "09:00", "09:40", "COMPLETED", 80),
  appointment(
    "marina",
    "Marina Lopes",
    "10:00",
    "10:45",
    "COMPLETED",
    120,
    "AI",
  ),
  appointment("renata", "Renata Souza", "11:00", "12:30", "COMPLETED", 260),
  appointment("ana", "Ana Paula", "14:00", "14:45", "CONFIRMED", 120, "AI"),
  appointment("carla", "Carla Dias", "17:15", "19:15", "CONFIRMED", 350, "AI"),
];

function dashboard(): Dashboard {
  return {
    ai: {
      data: {
        aiAppointmentsThisWeek: 9,
        aiAppointmentsToday: 2,
        automatedConversationsToday: 6,
        conversationsNeedingAttention: [],
        conversationsNeedingAttentionCount: 2,
        conversationsTakenOverThisWeek: 1,
      },
      status: "ok",
    },
    degraded: false,
    platform: {
      onboardingCompleted: true,
      tenantName: "Studio Camila",
      timezone: "America/Sao_Paulo",
    },
    scheduling: {
      data: {
        appointmentsThisWeek: 30,
        appointmentsToday: APPOINTMENTS.length,
        calendar: {
          capabilities: CAPABILITIES,
          integration: null,
          source: "AVENLY",
          timezone: "America/Sao_Paulo",
        },
        estimatedRevenueToday: null,
        nextAppointment: null,
        todayAppointments: APPOINTMENTS,
      },
      status: "ok",
    },
    whatsapp: {
      data: { phoneNumber: "5511999990000", status: "CONNECTED" },
      status: "ok",
    },
  };
}

const STATUS: SystemStatus = {
  accountDeletion: { dueAt: null, status: "NONE" },
  ai: {
    desiredEnabled: true,
    effectiveEnabled: true,
    reconciled: "NOOP",
    state: "ACTIVE",
  },
  degraded: false,
  whatsapp: {
    checkedAt: "2026-10-15T12:00:00.000Z",
    phoneNumber: "5511999990000",
    status: "CONNECTED",
  },
};

const NO_AI: RevenueReport["ai"] = {
  acquired: { amount: 0, customers: 0 },
  afterHours: { amount: 0, count: 0 },
  billed: { amount: 0, count: 0 },
  expected: { amount: 0, count: 0 },
  newCustomers: { amount: 0, count: 0, names: [] },
  rescheduled: { amount: 0, count: 0 },
  share: null,
};

function report(overrides: Partial<RevenueReport>): RevenueReport {
  return {
    ai: NO_AI,
    billed: { amount: 0, averageTicket: null, count: 0, unvaluedCount: 0 },
    customers: [],
    end: TODAY,
    expected: { amount: 0, count: 0, unvaluedCount: 0 },
    lost: {
      cancelledAmount: 0,
      cancelledCount: 0,
      noShowAmount: 0,
      noShowCount: 0,
    },
    messages: null,
    period: "day",
    previous: { amount: 0, count: 0, end: TODAY, partial: true, start: TODAY },
    series: [],
    services: [],
    start: TODAY,
    timezone: "America/Sao_Paulo",
    today: TODAY,
    weekdays: Array.from({ length: 7 }, (_, weekday) => ({
      amount: weekday === 6 ? 900 : 100,
      count: 1,
      weekday,
    })),
    window: {
      from: "2026-10-15T03:00:00.000Z",
      to: "2026-10-15T16:40:00.000Z",
    },
    ...overrides,
  };
}

const DAY = report({
  ai: {
    ...NO_AI,
    billed: { amount: 120, count: 1 },
    expected: { amount: 470, count: 2 },
  },
  billed: { amount: 460, averageTicket: 153.33, count: 3, unvaluedCount: 0 },
  expected: { amount: 640, count: 3, unvaluedCount: 0 },
  previous: {
    amount: 410,
    count: 3,
    end: "2026-10-14",
    partial: true,
    start: "2026-10-14",
  },
});

const WEEK = report({
  ai: {
    ...NO_AI,
    acquired: { amount: 6300, customers: 28 },
    afterHours: { amount: 410, count: 2 },
    billed: { amount: 1180, count: 9 },
    newCustomers: { amount: 470, count: 3, names: ["Marina", "Carla"] },
    rescheduled: { amount: 170, count: 1 },
    share: 0.437,
  },
  billed: { amount: 2700, averageTicket: 135, count: 20, unvaluedCount: 0 },
  end: "2026-10-18",
  expected: { amount: 2770, count: 18, unvaluedCount: 0 },
  period: "week",
  previous: {
    amount: 2410,
    count: 17,
    end: "2026-10-08",
    partial: true,
    start: "2026-10-05",
  },
  series: [
    ["2026-10-12", 720, 0],
    ["2026-10-13", 540, 0],
    ["2026-10-14", 980, 0],
    [TODAY, 460, 640],
    ["2026-10-16", 0, 890],
    ["2026-10-17", 0, 1240],
    ["2026-10-18", 0, 0],
  ].map(([start, amount, expectedAmount]) => ({
    aiAmount: 0,
    amount: amount as number,
    count: 1,
    expectedAmount: expectedAmount as number,
    start: start as string,
  })),
  start: "2026-10-12",
});

const MONTH = report({
  billed: { amount: 6840, averageTicket: 134, count: 51, unvaluedCount: 0 },
  end: "2026-10-31",
  expected: { amount: 3910, count: 26, unvaluedCount: 0 },
  period: "month",
  start: "2026-10-01",
});

const REPORTS: Record<string, RevenueReport> = {
  day: DAY,
  month: MONTH,
  week: WEEK,
};

let memoryOwner = 0;

beforeEach(() => {
  vi.useFakeTimers({
    now: new Date("2026-10-15T13:40:00-03:00"),
    toFake: ["Date"],
  });
  claimSessionMemory(`teste-${(memoryOwner += 1)}`);
  stubViewport(402);
  dashboardGet.mockReset().mockResolvedValue(dashboard());
  statusGet.mockReset().mockResolvedValue(STATUS);
  notificationsSummary.mockReset().mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  revenueGet
    .mockReset()
    .mockImplementation(({ period }: { period: string }) =>
      Promise.resolve(REPORTS[period]),
    );
});

afterEach(() => {
  vi.useRealTimers();
  clearViewport();
});

function home() {
  return render(
    <ShellConfigProvider>
      <SystemStatusProvider>
        <ProductDashboardScreen />
      </SystemStatusProvider>
    </ShellConfigProvider>,
  );
}

/** O texto com espaços comuns no lugar do não separável do "R$". */
function text(node: HTMLElement): string {
  return (node.textContent ?? "").replace(/\s+/g, " ");
}

async function panel(): Promise<HTMLElement> {
  return await screen.findByRole("region", { name: "Faturamento" });
}

describe("1b · Painel do dia no celular", () => {
  test("é o padrão: número do dia, comparação a esta hora, fatos e o mês", async () => {
    const { container } = home();
    const region = await panel();

    expect(
      screen.getByRole("button", { name: "Faturamento em painel" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(region).getByRole("button", { name: "Hoje" }),
    ).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() =>
      expect(text(region)).toContain("faturado hoje · 3 de 6 atendimentos"),
    );
    expect(text(region)).toContain("+12%que ontem a esta hora (R$ 410)");
    expect(text(region)).toContain("R$ 1.100 no dia, se tudo confirmar");
    expect(text(region)).toContain("A entrarR$ 6403 confirmados");
    // Sem ticket médio (pedido de 2026-10-18): dois indicadores dividem a linha.
    expect(text(region)).not.toMatch(/ticket/i);
    expect(within(region).getAllByRole("term")).toHaveLength(2);
    expect(text(region)).toContain("Pela IAR$ 59054% do dia · 3 atendimentos");

    const month = within(region).getByRole("link", { name: /Outubro/ });
    expect(month).toHaveAttribute("href", "/faturamento");
    expect(text(month)).toContain("Outubro · R$ 6.840");
    expect(text(month)).toContain(
      "R$ 3.910 a entrar até o fim do mês · faltam 16 dias",
    );

    // Sem meta e sem projeção: nada estimado.
    expect(container.textContent).not.toMatch(/meta|Projeção/i);

    // Abaixo, só o que ainda vem hoje.
    expect(
      screen.getByRole("heading", { level: 2, name: "Próximos" }),
    ).toBeVisible();
    expect(screen.getByText("Ana Paula")).toBeVisible();
    expect(screen.queryByText("Bia Castro")).toBeNull();

    await expectNoA11yViolations(container);
  });

  test("Semana alterna de verdade: total, colunas por dia e o que veio pela IA", async () => {
    const user = userEvent.setup();
    home();
    const region = await panel();
    await vi.waitFor(() => expect(text(region)).toContain("faturado hoje"));

    await user.click(within(region).getByRole("button", { name: "Semana" }));

    expect(text(region)).toContain("faturados nesta semana · 20 atendimentos");
    expect(text(region)).toContain(
      "+12%que a semana passada até quinta (R$ 2.410)",
    );
    const days = within(region).getByRole("list", {
      name: "Dia a dia da semana",
    });
    expect(within(days).getAllByRole("listitem")).toHaveLength(7);
    expect(
      within(days).getByRole("listitem", {
        name: /^quinta, 15 de outubro: R\$\s460 faturado, R\$\s640 a entrar$/,
      }),
    ).toBeInTheDocument();
    expect(text(region)).toContain("A entrarR$ 2.77018 confirmados até sábado");
    expect(text(region)).toContain("Pela IAR$ 1.18044% do faturado");
  });

  test("sem faturamento ainda no dia, nenhuma comparação", async () => {
    REPORTS.day = report({
      billed: { amount: 0, averageTicket: null, count: 0, unvaluedCount: 0 },
      expected: { amount: 640, count: 3, unvaluedCount: 0 },
      previous: {
        amount: 410,
        count: 3,
        end: "2026-10-14",
        partial: true,
        start: "2026-10-14",
      },
    });
    try {
      home();
      const region = await panel();
      await vi.waitFor(() => expect(text(region)).toContain("faturado hoje"));
      expect(text(region)).not.toMatch(/que ontem/);
    } finally {
      REPORTS.day = DAY;
    }
  });

  test("se a leitura do faturamento falhar, só ele sai e a agenda continua", async () => {
    revenueGet.mockReset().mockRejectedValue(new Error("fora do ar"));
    home();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Próximos" }),
    ).toBeVisible();
    expect(screen.queryByRole("region", { name: "Faturamento" })).toBeNull();
    expect(screen.getByText("Ana Paula")).toBeVisible();
  });
});

describe("1a · Agenda que fatura", () => {
  test("o seletor troca para a agenda com valores, com a coreografia de entrada, e fica lembrado", async () => {
    const user = userEvent.setup();
    const first = home();
    await panel();

    await user.click(
      screen.getByRole("button", { name: "Faturamento na agenda" }),
    );

    expect(
      screen.getByRole("button", { name: "Faturamento na agenda" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(first.container.querySelector(".dashboard-page")).toHaveClass(
      "is-entering",
    );
    expect(screen.queryByRole("region", { name: "Faturamento" })).toBeNull();

    const today = screen
      .getByRole("heading", { level: 2, name: "Hoje" })
      .closest("article") as HTMLElement;
    expect(text(today)).toContain("R$ 460 faturado · R$ 640 a entrar");
    expect(text(today)).toContain("+12% que ontem a esta hora");

    // No celular, os três concluídos viram uma linha só.
    const done = within(today).getByRole("button", {
      name: /3 concluídos até 12:30/,
    });
    expect(done).toHaveAttribute("aria-expanded", "false");
    expect(text(done)).toContain("Bia, Marina e Renata");
    expect(text(done)).toContain("R$ 460");
    expect(within(today).queryByText("Bia Castro")).toBeNull();
    expect(
      text(within(today).getByRole("link", { name: /Carla Dias/ })),
    ).toContain("R$ 350");

    await user.click(done);
    expect(done).toHaveAttribute("aria-expanded", "true");
    expect(within(today).getByText("Bia Castro")).toBeVisible();

    expect(
      screen.getByRole("heading", { level: 2, name: "Esta semana" }),
    ).toBeVisible();
    const month = screen
      .getByRole("heading", { level: 2, name: "Outubro" })
      .closest("section") as HTMLElement;
    expect(text(month)).toContain("R$ 6.840 faturados");
    expect(text(month)).toContain(
      "R$ 3.910 a entrar até o fim do mês · faltam 16 dias",
    );

    first.unmount();
    const second = home();
    await screen.findByRole("heading", { level: 2, name: "Hoje" });
    expect(
      screen.getByRole("button", { name: "Faturamento na agenda" }),
    ).toHaveAttribute("aria-pressed", "true");
    // A volta mostra a leitura lembrada parada, sem coreografia.
    expect(second.container.querySelector(".dashboard-page")).not.toHaveClass(
      "is-entering",
    );
  });
});

describe("tablet e desktop", () => {
  test("desktop: painel em três zonas, agenda inteira e a prova da IA da semana", async () => {
    stubViewport(1366);
    const { container } = home();
    const region = await panel();

    for (const zone of ["Hoje", "Esta semana", "Outubro"]) {
      expect(
        within(region).getByRole("heading", { level: 3, name: zone }),
      ).toBeVisible();
    }
    await vi.waitFor(() =>
      expect(text(region)).toContain("3 de 6 atendimentos concluídos"),
    );
    expect(text(region)).toContain(
      "faltam 16 dias · sábado é seu dia mais forte",
    );
    expect(text(region)).not.toMatch(/ticket/i);
    expect(text(region)).toContain("Pela IAR$ 59054% do dia · 3 atendimentos");
    expect(
      within(region).getByRole("link", { name: /Ver faturamento completo/ }),
    ).toHaveAttribute("href", "/faturamento");

    expect(
      screen.getByRole("heading", { level: 2, name: "Hoje" }),
    ).toBeVisible();
    expect(screen.getByText("Bia Castro")).toBeVisible();
    expect(screen.getByText("agora")).toBeInTheDocument();

    const proof = screen.getByRole("region", {
      name: "O que a IA fez por você",
    });
    expect(text(proof)).toContain(
      "A IA marcou R$ 1.180 dos seus R$ 2.700 nesta semana.",
    );
    expect(text(proof)).toContain(
      "Já gastaram R$ 470 · Marina, Carla e mais 1",
    );
    expect(text(proof)).toContain(
      "Desde que você começou, a IA trouxe 28 clientes novos, que já faturaram R$ 6.300.",
    );

    // A saudação carrega as conversas; a IA ativa vive na sidebar.
    expect(screen.getByText(/6 conversas hoje, 2 aguardam você/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("tablet: os próximos atendimentos e a faixa da IA com quem aguarda", async () => {
    stubViewport(1024);
    home();
    await panel();
    expect(
      screen.getByRole("heading", { level: 2, name: "Próximos" }),
    ).toBeVisible();
    expect(
      await screen.findByText(/6 conversas hoje · 2 aguardam você/),
    ).toBeVisible();
    const proof = screen.getByRole("region", {
      name: "O que a IA fez por você",
    });
    expect(text(proof)).not.toContain("Desde que você começou");
  });
});
