// @vitest-environment jsdom
/**
 * Goal064/WU-03: a Home cumprimenta pela pessoa, nunca pelo negócio, e a
 * troca de senha em Configurações › Conta aplica a mesma regra do pacote
 * (U-10) na recusa do cliente.
 *
 * O que esta suíte prova:
 *
 * - com nome na sessão, a Home mostra "Bom dia"/"Boa tarde"/"Boa noite"
 *   (pelo horário no fuso do negócio) seguido do primeiro nome;
 * - sem nome na sessão, a Home cumprimenta só pelo horário e nunca mostra o
 *   nome do negócio;
 * - em Configurações › Conta, uma senha só de letras é recusada no cliente,
 *   sem chamar o servidor, com o texto da mesma regra do cadastro;
 * - uma senha que atende a regra chega a `auth.changePassword` normalmente.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type { CalendarState, Dashboard } from "@/data";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { AccountSettings } from "@/features/settings/AccountSettings";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import type * as systemStatusModule from "@/shared/runtime/systemStatus";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const dashboardGet = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const logout = vi.fn();
const changePassword = vi.fn();

let sessionUser: { email: string; name?: string | null } = {
  email: "dona@studiomarina.com.br",
};

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    account: { requestDeletion: vi.fn(), cancelDeletion: vi.fn() },
    auth: { changePassword, logout, logoutAllDevices: vi.fn() },
    dashboard: { get: dashboardGet },
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: sessionUser,
    },
    setUnauthenticated: vi.fn(),
  }),
}));

vi.mock("@/shared/runtime/systemStatus", async () => {
  const actual =
    await vi.importActual<typeof systemStatusModule>(
      "@/shared/runtime/systemStatus",
    );
  return {
    ...actual,
    useSystemStatus: () => ({
      accountDeletion: { status: "NONE", dueAt: null },
      phase: "loaded",
      refresh: vi.fn(),
    }),
  };
});

function calendarCapabilitiesFixture(): CalendarState["capabilities"] {
  return {
    activationTestCompleted: false,
    aiActivationReady: true,
    createAppointments: true,
    hoursConfigured: true,
    manageAvailability: true,
    manageCustomers: true,
    manageServices: true,
    migrate: true,
  };
}

function dashboardFixture(): Dashboard {
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
      data: { phoneNumber: null, status: "DISCONNECTED" },
      status: "ok",
    },
  };
}

describe("cumprimento da Home", () => {
  beforeEach(() => {
    dashboardGet.mockReset();
    statusGet.mockReset();
    notificationsSummary.mockReset();
    notificationsSummary.mockResolvedValue({
      byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
      unreadCount: 0,
      openConditionsCount: 0,
    });
    logout.mockReset();
    statusGet.mockResolvedValue({
      accountDeletion: { status: "NONE", dueAt: null },
      ai: {
        desiredEnabled: true,
        effectiveEnabled: true,
        reconciled: "NOOP",
        state: "ACTIVE",
      },
      degraded: false,
      whatsapp: {
        checkedAt: "2026-01-15T12:00:00.000Z",
        phoneNumber: "5511987654321",
        status: "CONNECTED",
      },
    });
    // 12:00 UTC = 09:00 em America/Sao_Paulo (UTC-3, sem DST) — manhã.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("com nome na sessão, cumprimenta pelo horário e pelo primeiro nome", async () => {
    sessionUser = { email: "dona@studiomarina.com.br", name: "Maria Clara Souza" };
    dashboardGet.mockResolvedValue(dashboardFixture());

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Bom dia, Maria");
  });

  test("sem nome na sessão, cumprimenta só pelo horário e nunca pelo negócio", async () => {
    sessionUser = { email: "dona@studiomarina.com.br", name: null };
    dashboardGet.mockResolvedValue(dashboardFixture());

    render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^Bom dia$/);
    expect(screen.queryByText(/Studio Marina/)).toBeNull();
  });
});

describe("troca de senha em Configurações › Conta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUser = { email: "dona@studiomarina.com.br" };
  });

  test("recusa no cliente uma senha só de letras, com a mesma regra do pacote", async () => {
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.click(await screen.findByRole("button", { name: /^Senha/ }));
    await user.type(screen.getByLabelText("Senha atual"), "senhaAtual123");
    await user.type(screen.getByLabelText("Nova senha"), "somenteletras");
    await user.type(
      screen.getByLabelText("Repita a nova senha"),
      "somenteletras",
    );
    await user.click(screen.getByRole("button", { name: "Alterar senha" }));

    expect(
      await screen.findByText(/A nova senha precisa ter letras e números\./),
    ).toBeVisible();
    expect(changePassword).not.toHaveBeenCalled();
  });

  test("aceita e envia uma senha que cumpre a regra", async () => {
    changePassword.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.click(await screen.findByRole("button", { name: /^Senha/ }));
    await user.type(screen.getByLabelText("Senha atual"), "senhaAtual123");
    await user.type(screen.getByLabelText("Nova senha"), "novaSenha123");
    await user.type(
      screen.getByLabelText("Repita a nova senha"),
      "novaSenha123",
    );
    await user.click(screen.getByRole("button", { name: "Alterar senha" }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1));
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "senhaAtual123",
      newPassword: "novaSenha123",
      confirmPassword: "novaSenha123",
    });
    expect(await screen.findByText("Senha alterada.")).toBeVisible();
  });

  test("recusa no cliente quando a confirmação não coincide com a nova senha", async () => {
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.click(await screen.findByRole("button", { name: /^Senha/ }));
    await user.type(screen.getByLabelText("Senha atual"), "senhaAtual123");
    await user.type(screen.getByLabelText("Nova senha"), "novaSenha123");
    await user.type(
      screen.getByLabelText("Repita a nova senha"),
      "novaSenha124",
    );
    await user.click(screen.getByRole("button", { name: "Alterar senha" }));

    expect(
      await screen.findByText("As senhas não coincidem."),
    ).toBeVisible();
    expect(changePassword).not.toHaveBeenCalled();
  });
});
