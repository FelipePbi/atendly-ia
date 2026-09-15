// @vitest-environment jsdom
/**
 * Goal018/WU-10: checklist pós-onboarding na Home, apresentação própria de
 * `PENDING` e um único poller de `GET /v1/status` por árvore renderizada.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - os três itens do checklist ("Cadastrar um serviço", "Definir horários de
 *   atendimento", "Conectar o WhatsApp") vêm de `GET /v1/dashboard`/
 *   `GET /v1/status`, nunca de configuração local, e cada um aparece marcado
 *   quando a leitura real diz que está feito;
 * - o checklist some assim que `GET /v1/status` confirma a IA ativa;
 * - "teste concluído" — o quarto item do vault — não aparece: não existe
 *   produtor em camada nenhuma até o Goal018B;
 * - `PENDING` tem apresentação própria, distinta de "IA desligada" (`OFF`) e
 *   de "IA não confirmado" (`UNKNOWN`/erro);
 * - `AppShell` e `DashboardScreen`, montados juntos como na árvore real de
 *   `/inicio`, fazem uma única chamada a `GET /v1/status` — não duas.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  AiStateValue,
  CalendarState,
  Dashboard,
  SystemStatus,
} from "@/data";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { AppShell } from "@/shared/layout/AppShell";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const dashboardGet = vi.fn();
const statusGet = vi.fn();
const logout = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout },
    dashboard: { get: dashboardGet },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

function calendarCapabilitiesFixture(
  overrides: Partial<CalendarState["capabilities"]> = {},
): CalendarState["capabilities"] {
  return {
    activationTestCompleted: false,
    aiActivationReady: false,
    createAppointments: true,
    hoursConfigured: false,
    manageAvailability: true,
    manageCustomers: true,
    manageServices: true,
    migrate: true,
    ...overrides,
  };
}

function dashboardFixture(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    ai: {
      data: {
        aiAppointmentsToday: 0,
        automatedConversationsToday: 0,
        conversationsNeedingAttention: [],
        conversationsNeedingAttentionCount: 0,
      },
      status: "ok",
    },
    degraded: false,
    platform: {
      onboardingCompleted: true,
      tenantName: "Studio Marina",
      timezone: "America/Sao_Paulo",
    },
    scheduling: {
      data: {
        appointmentsToday: 0,
        calendar: {
          capabilities: calendarCapabilitiesFixture(),
          integration: null,
          source: "ATENDLY",
          timezone: "America/Sao_Paulo",
        },
        estimatedRevenueToday: null,
        nextAppointment: null,
        todayAppointments: [],
      },
      status: "ok",
    },
    whatsapp: {
      data: { phoneNumber: null, status: "DISCONNECTED" },
      status: "ok",
    },
    ...overrides,
  };
}

function systemStatusFixture(
  overrides: Partial<SystemStatus> = {},
): SystemStatus {
  return {
    ai: { desiredEnabled: true, effectiveEnabled: false, state: "PENDING" },
    degraded: false,
    whatsapp: { checkedAt: "2026-09-14T12:00:00.000Z", phoneNumber: null, status: "DISCONNECTED" },
    ...overrides,
  };
}

function aiStatus(state: AiStateValue): SystemStatus {
  return systemStatusFixture({
    ai: { desiredEnabled: state !== "OFF", effectiveEnabled: state === "ACTIVE", state },
  });
}

beforeEach(() => {
  dashboardGet.mockReset();
  statusGet.mockReset();
  logout.mockReset();
});

describe("checklist pós-onboarding da Home", () => {
  test("mostra os quatro itens com fonte real, cada um marcado conforme a leitura", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture({
        scheduling: {
          data: {
            appointmentsToday: 0,
            calendar: {
              capabilities: calendarCapabilitiesFixture({
                activationTestCompleted: false,
                aiActivationReady: true,
                hoursConfigured: false,
              }),
              integration: null,
              source: "ATENDLY",
              timezone: "America/Sao_Paulo",
            },
            estimatedRevenueToday: null,
            nextAppointment: null,
            todayAppointments: [],
          },
          status: "ok",
        },
      }),
    );
    statusGet.mockResolvedValue(aiStatus("PENDING"));

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    await screen.findByText("Ative sua IA");
    expect(
      screen.getByRole("listitem", { name: "Cadastrar um serviço: concluído" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", {
        name: "Definir horários de atendimento: pendente",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Conectar o WhatsApp: pendente" }),
    ).toBeInTheDocument();
    // Quarto item do vault, agora com produtor real (Goal019 §9): `false` na
    // leitura é "ainda não testou", nunca "concluído".
    expect(
      screen.getByRole("listitem", { name: "Concluir o teste da IA: pendente" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 de 4 passos concluídos")).toBeVisible();
    expect(screen.queryByText(/teste concluído/i)).toBeNull();
  });

  test("some quando a IA está efetivamente ativa", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(aiStatus("ACTIVE"));

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    await screen.findByText(/Olá, Studio Marina/);
    await waitFor(() => {
      expect(screen.queryByText("Ative sua IA")).toBeNull();
    });
  });

  test("WhatsApp conectado marca o item correspondente", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture({
        whatsapp: { data: { phoneNumber: "5511999990000", status: "CONNECTED" }, status: "ok" },
      }),
    );
    statusGet.mockResolvedValue(
      systemStatusFixture({
        whatsapp: {
          checkedAt: "2026-09-14T12:00:00.000Z",
          phoneNumber: "5511999990000",
          status: "CONNECTED",
        },
      }),
    );

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    expect(
      await screen.findByRole("listitem", {
        name: "Conectar o WhatsApp: concluído",
      }),
    ).toBeInTheDocument();
  });

  test("sem violação de acessibilidade com o checklist visível", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(aiStatus("PENDING"));

    const { container } = render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    await screen.findByText("Ative sua IA");
    await expectNoA11yViolations(container);
  });
});

describe("PENDING tem apresentação própria", () => {
  test("distinta de 'IA desligada' (OFF) e de 'IA não confirmado' (erro)", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(aiStatus("PENDING"));

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    const iaLine = (await screen.findByText("IA em ativação")).closest(
      ".status-line",
    );
    expect(iaLine).not.toBeNull();
    const dot = iaLine?.querySelector(".status-dot");
    expect(dot).toHaveClass("warning");
    expect(dot).not.toHaveClass("danger");
    expect(dot).not.toHaveClass("neutral");
  });

  test("OFF continua 'IA desligada'", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(aiStatus("OFF"));

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("IA desligada")).toBeVisible();
  });

  test("UNKNOWN continua 'IA não confirmado'", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(aiStatus("UNKNOWN"));

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("IA não confirmado")).toBeVisible();
  });
});

describe("um único poller de GET /v1/status por árvore renderizada", () => {
  test("AppShell + Home montados juntos fazem uma única leitura de status", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(aiStatus("PENDING"));

    render(
      <ShellConfigProvider>
        <AppShell active="inicio" title="Início">
          <ProductDashboardScreen />
        </AppShell>
      </ShellConfigProvider>,
    );

    await screen.findByText("Ative sua IA");
    await waitFor(() => {
      expect(statusGet).toHaveBeenCalledTimes(1);
    });
  });
});
