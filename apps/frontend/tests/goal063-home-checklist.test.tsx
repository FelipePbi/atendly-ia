// @vitest-environment jsdom
/**
 * Goal063 §4 — cada item do checklist da Home leva ao módulo que o resolve.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - "Cadastrar um serviço" leva a `/servicos`, "Definir horários de
 *   atendimento" a `/configuracoes/disponibilidade`, "Conectar o WhatsApp" a
 *   `/configuracoes/whatsapp` (com "Conectar" na linha enquanto pendente) e
 *   "Concluir o teste da IA" ao teste em Configurações › IA;
 * - com o WhatsApp pendente, o último item diz "depois do WhatsApp" em vez de
 *   oferecer o teste;
 * - item concluído continua marcado e continua alcançável;
 * - nenhum texto do checklist contém termo técnico proibido.
 */

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CalendarState, Dashboard, SystemStatus } from "@/data";
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

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    dashboard: { get: dashboardGet },
    notifications: {
      summary: vi.fn().mockResolvedValue({
        byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
        openConditionsCount: 0,
        unreadCount: 0,
      }),
    },
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

function dashboardFixture(
  capabilities: Partial<CalendarState["capabilities"]>,
  whatsappConnected: boolean,
): Dashboard {
  return {
    ai: {
      data: {
        aiAppointmentsThisWeek: 0,
        aiAppointmentsToday: 0,
        automatedConversationsToday: 0,
        conversationsNeedingAttention: [],
        conversationsNeedingAttentionCount: 0,
        conversationsTakenOverThisWeek: 0,
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
        appointmentsThisWeek: 0,
        appointmentsToday: 0,
        calendar: {
          capabilities: {
            activationTestCompleted: false,
            aiActivationReady: false,
            createAppointments: true,
            hoursConfigured: false,
            manageAvailability: true,
            manageCustomers: true,
            manageServices: true,
            migrate: true,
            ...capabilities,
          },
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
      data: whatsappConnected
        ? { phoneNumber: "5511999990000", status: "CONNECTED" }
        : { phoneNumber: null, status: "DISCONNECTED" },
      status: "ok",
    },
  };
}

function statusFixture(whatsappConnected: boolean): SystemStatus {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: false,
      effectiveEnabled: false,
      reconciled: "NOOP",
      state: "OFF",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-14T12:00:00.000Z",
      phoneNumber: whatsappConnected ? "5511999990000" : null,
      status: whatsappConnected ? "CONNECTED" : "DISCONNECTED",
    },
  };
}

const FORBIDDEN = /\b(token|API|HTTP|run|projeção|reconciliação|desired|effective)\b/i;

async function renderHome(
  capabilities: Partial<CalendarState["capabilities"]>,
  whatsappConnected: boolean,
) {
  dashboardGet.mockResolvedValue(dashboardFixture(capabilities, whatsappConnected));
  statusGet.mockResolvedValue(statusFixture(whatsappConnected));
  const utils = render(
    <ShellConfigProvider>
      <SystemStatusProvider>
        <ProductDashboardScreen />
      </SystemStatusProvider>
    </ShellConfigProvider>,
  );
  const checklist = await screen.findByRole("region", { name: "Ative sua IA" });
  return { ...utils, checklist };
}

function row(checklist: HTMLElement, name: string) {
  return within(checklist).getByRole("listitem", { name });
}

beforeEach(() => {
  dashboardGet.mockReset();
  statusGet.mockReset();
});

describe("checklist da Home: cada item é uma ação alcançável", () => {
  test("tudo pendente: cada item leva ao seu módulo, e o teste espera o WhatsApp", async () => {
    const { checklist, container } = await renderHome({}, false);

    const service = row(checklist, "Cadastrar um serviço: pendente");
    expect(
      within(service).getByRole("link", { name: "Cadastrar um serviço" }),
    ).toHaveAttribute("href", "/servicos");

    const hours = row(checklist, "Definir horários de atendimento: pendente");
    expect(
      within(hours).getByRole("link", { name: "Definir horários de atendimento" }),
    ).toHaveAttribute("href", "/configuracoes/disponibilidade");

    const whatsapp = row(checklist, "Conectar o WhatsApp: pendente");
    expect(
      within(whatsapp).getByRole("link", { name: "Conectar o WhatsApp" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");
    expect(
      within(whatsapp).getByRole("link", { name: "Conectar" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");

    const test = row(checklist, "Concluir o teste da IA: pendente");
    expect(
      within(test).getByRole("link", { name: "Concluir o teste da IA" }),
    ).toHaveAttribute("href", "/configuracoes/ia#teste-real");
    expect(within(test).getByText("depois do WhatsApp")).toBeVisible();
    expect(within(test).queryByRole("link", { name: "Fazer o teste" })).toBeNull();

    expect(checklist.textContent ?? "").not.toMatch(FORBIDDEN);
    await expectNoA11yViolations(container);
  });

  test("WhatsApp conectado: a linha dele não oferece 'Conectar' e o teste passa a ser oferecido", async () => {
    const { checklist } = await renderHome({}, true);

    const whatsapp = row(checklist, "Conectar o WhatsApp: concluído");
    expect(within(whatsapp).queryByRole("link", { name: "Conectar" })).toBeNull();
    // Concluído continua alcançável.
    expect(
      within(whatsapp).getByRole("link", { name: "Conectar o WhatsApp" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");

    const test = row(checklist, "Concluir o teste da IA: pendente");
    expect(within(test).queryByText("depois do WhatsApp")).toBeNull();
    expect(
      within(test).getByRole("link", { name: "Fazer o teste" }),
    ).toHaveAttribute("href", "/configuracoes/ia#teste-real");
  });

  test("itens concluídos continuam marcados e alcançáveis, mesmo com um passo pendente", async () => {
    // Goal074, blocker 1: com os 4 passos concluídos, o estado vira "IA
    // pausada" e o checklist some (não fica ao lado dela, contradizendo-a).
    // Este teste prova a marcação/alcançabilidade dos itens já concluídos
    // enquanto o checklist ainda está visível, com um passo por concluir.
    const { checklist } = await renderHome(
      {
        activationTestCompleted: true,
        aiActivationReady: true,
        hoursConfigured: false,
      },
      true,
    );

    expect(screen.getByText("3 de 4 passos concluídos")).toBeVisible();
    for (const [name, href] of [
      ["Cadastrar um serviço", "/servicos"],
      ["Conectar o WhatsApp", "/configuracoes/whatsapp"],
      ["Concluir o teste da IA", "/configuracoes/ia#teste-real"],
    ] as const) {
      const item = row(checklist, `${name}: concluído`);
      expect(within(item).getByRole("link", { name })).toHaveAttribute(
        "href",
        href,
      );
    }
    const hours = row(checklist, "Definir horários de atendimento: pendente");
    expect(
      within(hours).getByRole("link", { name: "Definir horários de atendimento" }),
    ).toHaveAttribute("href", "/configuracoes/disponibilidade");
    expect(within(checklist).queryByRole("link", { name: "Fazer o teste" })).toBeNull();
    expect(within(checklist).queryByRole("link", { name: "Conectar" })).toBeNull();
  });

  test("todos os 4 passos concluídos: o checklist some (vira 'IA pausada', não 'IA inativa')", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture(
        {
          activationTestCompleted: true,
          aiActivationReady: true,
          hoursConfigured: true,
        },
        true,
      ),
    );
    statusGet.mockResolvedValue(statusFixture(true));
    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    await screen.findByText("IA pausada");
    expect(screen.queryByRole("region", { name: "Ative sua IA" })).toBeNull();
    expect(screen.queryByText("Ative sua IA")).toBeNull();
  });
});
