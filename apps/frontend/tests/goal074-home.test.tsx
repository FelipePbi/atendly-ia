// @vitest-environment jsdom
/**
 * Goal074/WU-04 §7.5 — a Home vira uma faixa de estado só, na ordem
 * estado → Precisa da sua atenção → Hoje (com o marcador "agora") →
 * Esta semana. Saem StatusStrip, Próximo atendimento, "O que a Avenly fez
 * hoje", receita e Ações rápidas; entra o sino, com link para /notificacoes e
 * ponto só com notificações não lidas.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - a ordem das seções (por título de nível 2) é sempre a mesma;
 * - existe só UMA faixa de estado por render, mesmo quando há um problema
 *   (nada de alerta duplicado sobre o resumo operacional);
 * - nenhuma copy proibida aparece ("fonte oficial", "persistência",
 *   "O que a Avenly fez hoje", "Status honesto") e nenhuma data ISO
 *   (AAAA-MM-DD) aparece na tela;
 * - "Esta semana" mostra os três números reais e cai para "—" quando a fonte
 *   que os produz falhou;
 * - o sino tem nome acessível, aponta para /notificacoes e só mostra o ponto
 *   quando há notificação não lida;
 * - o invólucro `.dashboard-page` continua presente.
 *
 * Fidelidade visual aos protótipos não é provada aqui — fica na conferência
 * humana (Goal074 §7.5).
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Appointment, CalendarState, Dashboard, SystemStatus } from "@/data";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const dashboardGet = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    dashboard: { get: dashboardGet },
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br", name: "Marina Alves" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

function calendarCapabilitiesFixture(): CalendarState["capabilities"] {
  return {
    activationTestCompleted: true,
    aiActivationReady: true,
    createAppointments: true,
    hoursConfigured: true,
    manageAvailability: true,
    manageCustomers: true,
    manageServices: true,
    migrate: true,
  };
}

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Ana Paula", phone: "+5511999990000" },
    customerId: "c1",
    date: "2026-09-29",
    durationMinutes: 30,
    endTime: "10:30",
    finalValue: null,
    id: "apt-1",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [
      {
        durationMinutes: 30,
        name: "Corte feminino",
        price: 90,
        priceType: "FIXED",
        serviceId: "s1",
      },
    ],
    source: "USER",
    startTime: "10:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
    ...overrides,
  };
}

function dashboardFixture(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    ai: {
      data: {
        aiAppointmentsThisWeek: 8,
        aiAppointmentsToday: 2,
        automatedConversationsToday: 3,
        conversationsNeedingAttention: [],
        conversationsNeedingAttentionCount: 0,
        conversationsTakenOverThisWeek: 2,
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
        appointmentsThisWeek: 12,
        appointmentsToday: 0,
        calendar: {
          capabilities: calendarCapabilitiesFixture(),
          integration: null,
          source: "AVENLY",
          timezone: "America/Sao_Paulo",
        },
        estimatedRevenueToday: null,
        nextAppointment: null,
        todayAppointments: [],
      },
      status: "ok",
    },
    whatsapp: {
      data: { phoneNumber: "5511999990000", status: "CONNECTED" },
      status: "ok",
    },
    ...overrides,
  };
}

function systemStatusFixture(overrides: Partial<SystemStatus> = {}): SystemStatus {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-27T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
    ...overrides,
  };
}

const FORBIDDEN = /fonte oficial|persistência|O que a Avenly fez hoje|Status honesto/i;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;

async function renderHome() {
  const utils = render(
    <ShellConfigProvider>
      <SystemStatusProvider>
        <ProductDashboardScreen />
      </SystemStatusProvider>
    </ShellConfigProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return utils;
}

beforeEach(() => {
  dashboardGet.mockReset();
  statusGet.mockReset();
  notificationsSummary.mockReset();
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
});

describe("Goal074/WU-04: Home conforme o protótipo", () => {
  test("sem pendência, a ordem das seções é Hoje → Esta semana, sem copy proibida, sem data ISO", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(systemStatusFixture());

    const { container } = await renderHome();

    expect(container.querySelector(".dashboard-page")).not.toBeNull();

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Hoje", "Esta semana"]);
    expect(screen.queryByText("Precisa da sua atenção")).toBeNull();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Próximo atendimento")).toBeNull();
    expect(screen.queryByText("O que a Avenly fez hoje")).toBeNull();
    expect(screen.queryByText("Ações rápidas")).toBeNull();
    expect(screen.queryByText(/^Status honesto$/)).toBeNull();

    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
    expect(container.textContent ?? "").not.toMatch(ISO_DATE);

    await expectNoA11yViolations(container);
  });

  test("com pendência, 'Precisa da sua atenção' aparece primeiro, na ordem completa", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture({
        ai: {
          data: {
            aiAppointmentsThisWeek: 8,
            aiAppointmentsToday: 2,
            automatedConversationsToday: 3,
            conversationsNeedingAttention: [
              {
                customerName: "Ana",
                externalContactId: "5511900000000",
                handoffReason: null,
                humanHandoff: true,
                id: "conv-1",
                lastMessage: {
                  body: "Preciso remarcar",
                  createdAt: "2026-09-29T12:00:00.000Z",
                  direction: "INBOUND",
                  id: "msg-1",
                  source: "CUSTOMER",
                },
                status: "HUMAN_HANDOFF",
                unreadCount: 1,
                updatedAt: "2026-09-29T12:00:00.000Z",
              },
            ],
            conversationsNeedingAttentionCount: 1,
            conversationsTakenOverThisWeek: 2,
          },
          status: "ok",
        },
      }),
    );
    statusGet.mockResolvedValue(systemStatusFixture());

    await renderHome();

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Precisa da sua atenção", "Hoje", "Esta semana"]);
    expect(screen.getByText("Ana")).toBeVisible();
  });

  test("com um problema, existe uma única faixa de estado (nunca duas)", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(
      systemStatusFixture({
        whatsapp: {
          checkedAt: "2026-09-27T12:00:00.000Z",
          phoneNumber: null,
          status: "DISCONNECTED",
        },
      }),
    );

    await renderHome();

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    const banner = screen.getByRole("alert");
    expect(banner.textContent).toMatch(/WhatsApp desconectado/);
    expect(
      screen.getByRole("link", { name: "Reconectar WhatsApp" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");
  });

  test("Esta semana mostra os três números quando as fontes respondem", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(systemStatusFixture());

    await renderHome();

    const week = screen
      .getByRole("heading", { level: 2, name: "Esta semana" })
      .closest("article") as HTMLElement;
    const values = within(week)
      .getAllByText(/^(\d+|—)$/)
      .map((node) => node.textContent);
    expect(values).toEqual(["12", "8", "2"]);
  });

  test("Esta semana cai para — quando a fonte falhou", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture({
        ai: { code: "DEPENDENCY_UNAVAILABLE", data: null, status: "error" },
        scheduling: { code: "DEPENDENCY_UNAVAILABLE", data: null, status: "error" },
      }),
    );
    statusGet.mockResolvedValue(systemStatusFixture());

    await renderHome();

    const week = screen
      .getByRole("heading", { level: 2, name: "Esta semana" })
      .closest("article") as HTMLElement;
    const values = within(week)
      .getAllByText(/^(\d+|—)$/)
      .map((node) => node.textContent);
    expect(values).toEqual(["—", "—", "—"]);
  });

  test("sino: nome acessível, link para /notificacoes, sem ponto quando não há não lidas", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(systemStatusFixture());
    notificationsSummary.mockResolvedValue({
      byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
      openConditionsCount: 0,
      unreadCount: 0,
    });

    const { container } = await renderHome();

    const bell = await screen.findByRole("link", { name: "Notificações" });
    expect(bell).toHaveAttribute("href", "/notificacoes");
    expect(container.querySelector(".home-bell-dot")).toBeNull();
  });

  test("sino: ponto aparece só com notificações não lidas", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(systemStatusFixture());
    notificationsSummary.mockResolvedValue({
      byLevel: { INFO: 1, ATTENTION: 0, CRITICAL: 0 },
      openConditionsCount: 1,
      unreadCount: 3,
    });

    const { container } = await renderHome();

    await screen.findByRole("link", { name: /não lidas/ });
    expect(container.querySelector(".home-bell-dot")).not.toBeNull();
  });
});

describe("Goal074/WU-04: 'Hoje' vazio e marcador 'agora'", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("sem atendimento hoje, mostra o vazio com a ação de criar agendamento", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture({
        scheduling: {
          data: {
            appointmentsThisWeek: 12,
            appointmentsToday: 0,
            calendar: {
              capabilities: calendarCapabilitiesFixture(),
              integration: null,
              source: "AVENLY",
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
    statusGet.mockResolvedValue(systemStatusFixture());

    await renderHome();

    expect(screen.getByText("Nenhum atendimento hoje.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Novo agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo");
  });

  test("o marcador 'agora' aparece antes do atendimento em curso", async () => {
    // 13:15 UTC = 10:15 em America/Sao_Paulo (UTC-3, sem DST).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-29T13:15:00.000Z"));

    const past = appointmentFixture({
      customer: { id: "c-past", name: "Ana Paula", phone: "+5511999990000" },
      customerId: "c-past",
      endTime: "09:30",
      id: "apt-past",
      startTime: "09:00",
    });
    const inProgress = appointmentFixture({
      customer: { id: "c-now", name: "Bia Ramos", phone: "+5511999990001" },
      customerId: "c-now",
      endTime: "10:30",
      id: "apt-now",
      startTime: "10:00",
    });
    const upcoming = appointmentFixture({
      customer: { id: "c-next", name: "Caio Souza", phone: "+5511999990002" },
      customerId: "c-next",
      endTime: "11:30",
      id: "apt-next",
      startTime: "11:00",
    });

    dashboardGet.mockResolvedValue(
      dashboardFixture({
        scheduling: {
          data: {
            appointmentsThisWeek: 12,
            appointmentsToday: 3,
            calendar: {
              capabilities: calendarCapabilitiesFixture(),
              integration: null,
              source: "AVENLY",
              timezone: "America/Sao_Paulo",
            },
            estimatedRevenueToday: null,
            nextAppointment: null,
            todayAppointments: [past, inProgress, upcoming],
          },
          status: "ok",
        },
      }),
    );
    statusGet.mockResolvedValue(systemStatusFixture());

    const { container } = await renderHome();

    const names = within(container.querySelector(".agenda-stack") as HTMLElement)
      .getAllByText(/^(Ana Paula|Bia Ramos|Caio Souza|agora)$/)
      .map((node) => node.textContent);
    expect(names).toEqual(["Ana Paula", "agora", "Bia Ramos", "Caio Souza"]);
    expect(container.querySelectorAll(".agenda-now-marker")).toHaveLength(1);
  });

  test("sem atendimento em curso, o marcador 'agora' fica entre o anterior e o próximo", async () => {
    // 13:45 UTC = 10:45 em America/Sao_Paulo (UTC-3, sem DST): entre
    // 10:00–10:30 e 11:00–11:30, nenhum atendimento em curso.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-29T13:45:00.000Z"));

    const first = appointmentFixture({
      customer: { id: "c-first", name: "Ana Paula", phone: "+5511999990000" },
      customerId: "c-first",
      endTime: "10:30",
      id: "apt-first",
      startTime: "10:00",
    });
    const second = appointmentFixture({
      customer: { id: "c-second", name: "Bia Ramos", phone: "+5511999990001" },
      customerId: "c-second",
      endTime: "11:30",
      id: "apt-second",
      startTime: "11:00",
    });

    dashboardGet.mockResolvedValue(
      dashboardFixture({
        scheduling: {
          data: {
            appointmentsThisWeek: 12,
            appointmentsToday: 2,
            calendar: {
              capabilities: calendarCapabilitiesFixture(),
              integration: null,
              source: "AVENLY",
              timezone: "America/Sao_Paulo",
            },
            estimatedRevenueToday: null,
            nextAppointment: null,
            todayAppointments: [first, second],
          },
          status: "ok",
        },
      }),
    );
    statusGet.mockResolvedValue(systemStatusFixture());

    const { container } = await renderHome();

    const names = within(container.querySelector(".agenda-stack") as HTMLElement)
      .getAllByText(/^(Ana Paula|Bia Ramos|agora)$/)
      .map((node) => node.textContent);
    expect(names).toEqual(["Ana Paula", "agora", "Bia Ramos"]);
    expect(container.querySelectorAll(".agenda-now-marker")).toHaveLength(1);
  });
});

/**
 * Goal074 rodada 4, blocker 1: a faixa de estado quando a IA não está ativa.
 * WhatsApp sempre CONNECTED, para a faixa não ser tomada pelo WhatsApp. Em
 * cada estado, "IA ativa" não aparece em lugar nenhum da tela e só existe uma
 * faixa (#operational-status), com o título esperado dentro dela.
 */
describe("Goal074: faixa de estado quando a IA não está ativa", () => {
  function incompleteCapabilities(): CalendarState["capabilities"] {
    return {
      ...calendarCapabilitiesFixture(),
      activationTestCompleted: false,
    };
  }

  function dashboardWithCapabilities(
    capabilities: CalendarState["capabilities"],
  ): Dashboard {
    const base = dashboardFixture();
    if (base.scheduling.status !== "ok") throw new Error("fixture");
    return {
      ...base,
      scheduling: {
        data: {
          ...base.scheduling.data,
          calendar: { ...base.scheduling.data.calendar, capabilities },
        },
        status: "ok",
      },
    };
  }

  function aiState(
    state: SystemStatus["ai"]["state"],
    effectiveEnabled = false,
  ): Partial<SystemStatus> {
    return {
      ai: {
        desiredEnabled: state !== "OFF",
        effectiveEnabled,
        reconciled: "NOOP",
        state,
      },
    };
  }

  async function expectSingleBand(container: HTMLElement, title: string) {
    // "IA em ativação" também é a cópia do ponto de status da IA, dentro da
    // mesma faixa; o título é o <strong> de .operational-copy.
    await screen.findAllByText(title);
    expect(screen.queryByText("IA ativa")).toBeNull();
    const bands = container.querySelectorAll("#operational-status");
    expect(bands).toHaveLength(1);
    const band = bands[0] as HTMLElement;
    const heading = band.querySelector(".operational-copy strong");
    expect(heading?.textContent).toBe(title);
    expect(heading).toBeVisible();
    return band;
  }

  test("PENDING com checklist incompleto: 'IA em ativação', aponta para os passos visíveis", async () => {
    dashboardGet.mockResolvedValue(dashboardWithCapabilities(incompleteCapabilities()));
    statusGet.mockResolvedValue(systemStatusFixture(aiState("PENDING")));

    const { container } = await renderHome();

    const band = await expectSingleBand(container, "IA em ativação");
    expect(
      within(band).getByText("Conclua os passos abaixo para a IA responder no WhatsApp."),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Ative sua IA" })).toBeVisible();
  });

  test("PENDING com checklist completo: checklist oculto e a faixa não fala em passos abaixo", async () => {
    dashboardGet.mockResolvedValue(dashboardWithCapabilities(calendarCapabilitiesFixture()));
    statusGet.mockResolvedValue(systemStatusFixture(aiState("PENDING")));

    const { container } = await renderHome();

    const band = await expectSingleBand(container, "IA em ativação");
    expect(screen.queryByRole("heading", { level: 2, name: "Ative sua IA" })).toBeNull();
    expect(band.textContent ?? "").not.toMatch(/passos abaixo/);
    expect(
      within(band).getByText("Os passos estão concluídos; falta a IA confirmar a ativação."),
    ).toBeVisible();
  });

  test("OFF com checklist incompleto: 'IA inativa', com o checklist visível", async () => {
    dashboardGet.mockResolvedValue(dashboardWithCapabilities(incompleteCapabilities()));
    statusGet.mockResolvedValue(systemStatusFixture(aiState("OFF")));

    const { container } = await renderHome();

    await expectSingleBand(container, "IA inativa");
    expect(screen.queryByText("IA pausada")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Ative sua IA" })).toBeVisible();
  });

  test("UNKNOWN: 'IA não confirmada'", async () => {
    dashboardGet.mockResolvedValue(dashboardWithCapabilities(incompleteCapabilities()));
    statusGet.mockResolvedValue(systemStatusFixture(aiState("UNKNOWN")));

    const { container } = await renderHome();

    await expectSingleBand(container, "IA não confirmada");
  });
});

describe("Goal087: 'Pausar' na faixa e sem pontos de estado", () => {
  test("IA ativa: 'Pausar' é link para /configuracoes/ia e não há linha de pontos", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(systemStatusFixture());

    const { container } = await renderHome();

    const band = container.querySelector("#operational-status") as HTMLElement;
    expect(within(band).getByText("IA ativa")).toBeVisible();
    expect(within(band).getByRole("link", { name: "Pausar" })).toHaveAttribute(
      "href",
      "/configuracoes/ia",
    );
    expect(container.querySelector(".operational-points")).toBeNull();
    expect(container.querySelector(".status-dot")).toBeNull();
  });

  test("fora de IA ativa nenhum 'Pausar' é oferecido", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(
      systemStatusFixture({
        ai: {
          desiredEnabled: false,
          effectiveEnabled: false,
          reconciled: "NOOP",
          state: "OFF",
        },
      }),
    );

    await renderHome();

    await screen.findAllByText(/IA (inativa|pausada)/);
    expect(screen.queryByRole("link", { name: "Pausar" })).toBeNull();
  });
});
