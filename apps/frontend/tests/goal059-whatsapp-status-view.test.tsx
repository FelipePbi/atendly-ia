// @vitest-environment jsdom
/**
 * Goal059/WU-03: o banner de WhatsApp da Home deriva de `status.whatsappView`
 * (a mesma fonte da sidebar e do checklist), não mais de `dashboard.whatsapp`
 * (QA H-02) — um estado `unknown` (falha ao consultar `GET /v1/status`) nunca
 * pode virar "desconectado" nem "pausado" na tela. E o número de WhatsApp
 * aparece formatado, nunca como JID ou dígitos crus (QA S-09/A-06), com o 9º
 * dígito restaurado só quando o assinante confirma celular.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CalendarState, Dashboard, SystemStatus } from "@/data";
import { formatPhone } from "@/features/conversations/format";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { WhatsAppConnectionPanel } from "@/features/whatsapp/WhatsAppConnectionPanel";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import {
  formatBrazilianPhone,
  normalizeBrazilianPhoneDigits,
} from "@/shared/phone";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const dashboardGet = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const whatsappGet = vi.fn();
const logout = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout },
    dashboard: { get: dashboardGet },
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
    whatsapp: { get: whatsappGet },
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
    aiActivationReady: true,
    createAppointments: true,
    hoursConfigured: true,
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
      data: { phoneNumber: null, status: "CONNECTED" },
      status: "ok",
    },
    ...overrides,
  };
}

function systemStatusFixture(
  overrides: Partial<SystemStatus> = {},
): SystemStatus {
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
      phoneNumber: null,
      status: "CONNECTED",
    },
    ...overrides,
  };
}

beforeEach(() => {
  dashboardGet.mockReset();
  statusGet.mockReset();
  notificationsSummary.mockReset();
  whatsappGet.mockReset();
  logout.mockReset();
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    unreadCount: 0,
    openConditionsCount: 0,
  });
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
      }) as MediaQueryList;
  }
});

describe("banner de WhatsApp da Home segue status.whatsappView", () => {
  test("unknown nunca afirma desconexão nem pausa, e aponta para /configuracoes/whatsapp", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(
      systemStatusFixture({
        whatsapp: {
          checkedAt: "2026-09-27T12:00:00.000Z",
          phoneNumber: null,
          status: "UNKNOWN",
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

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).not.toMatch(/desconectado/i);
    expect(banner.textContent).not.toMatch(/pausad[oa]/i);
    expect(banner.textContent).not.toMatch(/reconectar/i);
    expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute(
      "href",
      "/configuracoes/whatsapp",
    );
  });

  test("off mostra o banner de hoje", async () => {
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

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toMatch(/WhatsApp desconectado/);
    expect(
      screen.getByRole("link", { name: "Reconectar WhatsApp" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");
  });

  test("active não tem banner de WhatsApp", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockResolvedValue(systemStatusFixture());

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    // Goal064 §7: cumprimento pelo horário, nunca pelo nome do negócio.
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^(Bom dia|Boa tarde|Boa noite)$/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("loading não tem banner de WhatsApp", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusGet.mockReturnValue(new Promise<SystemStatus>(() => {}));

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    // Goal064 §7: cumprimento pelo horário, nunca pelo nome do negócio.
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^(Bom dia|Boa tarde|Boa noite)$/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("número de WhatsApp formatado", () => {
  test("tela de WhatsApp conectado mostra +55 11 98765-4321, nunca JID nem dígitos crus", async () => {
    whatsappGet.mockResolvedValue({
      connectedAt: "2026-09-27T12:00:00.000Z",
      id: "conn-1",
      phoneNumber: "5511987654321@s.whatsapp.net",
      status: "CONNECTED",
      updatedAt: "2026-09-27T12:00:00.000Z",
    });

    render(<WhatsAppConnectionPanel />);

    expect(await screen.findByText("+55 11 98765-4321")).toBeVisible();
    expect(screen.queryByText(/s\.whatsapp\.net/)).toBeNull();
    expect(screen.queryByText(/^5511987654321$/)).toBeNull();
  });

  test("tela de WhatsApp conectado sem número não mostra nada no lugar do telefone", async () => {
    whatsappGet.mockResolvedValue({
      connectedAt: "2026-09-27T12:00:00.000Z",
      id: "conn-2",
      phoneNumber: null,
      status: "CONNECTED",
      updatedAt: "2026-09-27T12:00:00.000Z",
    });

    render(<WhatsAppConnectionPanel />);

    expect(await screen.findByText("WhatsApp conectado")).toBeVisible();
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });
});

describe("normalizeBrazilianPhoneDigits / formatBrazilianPhone", () => {
  test("legado de 12 dígitos com assinante 6-9 ganha o 9º dígito", () => {
    expect(normalizeBrazilianPhoneDigits("551187654321")).toEqual({
      ddd: "11",
      subscriber: "987654321",
    });
    expect(formatBrazilianPhone("551187654321", "parens")).toBe(
      "(11) 98765-4321",
    );
  });

  test("legado de 12 dígitos com assinante 2-5 (fixo) continua fixo", () => {
    expect(normalizeBrazilianPhoneDigits("551133224455")).toEqual({
      ddd: "11",
      subscriber: "33224455",
    });
    expect(formatBrazilianPhone("551133224455", "parens")).toBe(
      "(11) 3322-4455",
    );
  });

  test("JID com sufixo de aparelho é formatado sem o sufixo", () => {
    expect(
      formatBrazilianPhone("5511987654321:42@s.whatsapp.net", "plus"),
    ).toBe("+55 11 98765-4321");
  });

  test("número já com o 9º dígito não é alterado", () => {
    expect(formatBrazilianPhone("5511987654321", "plus")).toBe(
      "+55 11 98765-4321",
    );
  });

  test("valor vazio não é um número reconhecível", () => {
    expect(formatBrazilianPhone("", "plus")).toBeNull();
    expect(formatBrazilianPhone("", "parens")).toBeNull();
  });
});

describe("formatPhone de Conversas mantém o formato de hoje", () => {
  test("continua no formato (DDD) NNNNN-NNNN, agora também para legado de 12 dígitos com 9º dígito restaurado", () => {
    expect(formatPhone("551187654321@s.whatsapp.net")).toBe(
      "(11) 98765-4321",
    );
  });

  test("valor vazio cai no aviso de contato sem telefone", () => {
    expect(formatPhone("")).toBe("Contato sem telefone");
  });
});
