// @vitest-environment jsdom
/**
 * Goal085 — a casca diz o estado real do WhatsApp (quadro H3).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. a tabela do cartão da IA: cada combinação da apresentação da IA com a do
 *    WhatsApp dá o tom, o título, a linha de apoio e a ação esperados;
 *    "WhatsApp desconectado" com "Reconectar" só com o WhatsApp `off`, e
 *    "Pausar" só com a IA `active` e o WhatsApp diferente de `off`;
 * 2. na casca, com a IA `ACTIVE` e o WhatsApp `DISCONNECTED`, o cartão diz
 *    "WhatsApp desconectado", nunca "IA ativa" nem "Pausar";
 * 3. em /inicio com o painel carregado, o banner "Atendimento automático
 *    parado" não repete a faixa; com o painel carregando, ou em outra rota,
 *    ele aparece.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pela comparação com o protótipo (`visual:compare`, quadro H3).
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type { Dashboard, SystemStatus } from "@/data";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import {
  aiCardView,
  type StatusView,
} from "@/shared/runtime/systemStatus";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const statusGet = vi.fn();
const dashboardGet = vi.fn();
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

type AiState = SystemStatus["ai"]["state"];

function statusFixture(
  aiState: AiState = "ACTIVE",
  whatsappStatus: SystemStatus["whatsapp"]["status"] = "CONNECTED",
): SystemStatus {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: aiState !== "OFF",
      effectiveEnabled: aiState === "ACTIVE",
      reconciled: "NOOP",
      state: aiState,
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-27T12:00:00.000Z",
      phoneNumber: whatsappStatus === "CONNECTED" ? "5511999990000" : null,
      status: whatsappStatus,
    },
  };
}

function dashboardFixture(
  schedulingStatus: "error" | "ok" = "ok",
): Dashboard {
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
    scheduling:
      schedulingStatus === "ok"
        ? {
            data: {
              appointmentsThisWeek: 12,
              appointmentsToday: 0,
              calendar: {
                capabilities: {
                  activationTestCompleted: true,
                  aiActivationReady: true,
                  createAppointments: true,
                  hoursConfigured: true,
                  manageAvailability: true,
                  manageCustomers: true,
                  manageServices: true,
                  migrate: true,
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
          }
        : ({ status: "error" } as unknown as Dashboard["scheduling"]),
    whatsapp: {
      data: { phoneNumber: "5511999990000", status: "CONNECTED" },
      status: "ok",
    },
  };
}

function ClientesPage() {
  useShellConfig({ active: "clientes", module: "directory", title: "Clientes" });
  return <p>Lista de clientes</p>;
}

function sidebarCard(container: HTMLElement): HTMLElement {
  const card = container.querySelector<HTMLElement>("aside.sidebar .ia-card");
  if (!card) throw new Error(".ia-card não foi renderizado");
  return card;
}

beforeEach(() => {
  statusGet.mockReset();
  dashboardGet.mockReset();
  notificationsSummary.mockReset();
  statusGet.mockResolvedValue(statusFixture());
  dashboardGet.mockResolvedValue(dashboardFixture());
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
});

const AI_VIEWS: StatusView[] = ["active", "pending", "off", "unknown", "loading"];
const WHATSAPP_VIEWS: StatusView[] = ["active", "off", "unknown", "loading"];

const AI_COPY: Record<StatusView, string> = {
  active: "IA ativa",
  loading: "Verificando IA",
  off: "IA desligada",
  pending: "IA em ativação",
  unknown: "IA não confirmado",
};
const AI_TONE: Record<StatusView, string> = {
  active: "active",
  loading: "neutral",
  off: "danger",
  pending: "warning",
  unknown: "neutral",
};

describe("Goal085 prova 1: a tabela do cartão da IA", () => {
  const combinations = AI_VIEWS.flatMap((ai) =>
    WHATSAPP_VIEWS.map((whatsapp) => [ai, whatsapp] as const),
  );

  test.each(combinations)("IA %s com WhatsApp %s", (ai, whatsapp) => {
    const card = aiCardView(ai, whatsapp);

    if (whatsapp === "off") {
      expect(card).toEqual({
        action: { href: "/configuracoes/whatsapp", label: "Reconectar" },
        support: "a IA não está atendendo",
        title: "WhatsApp desconectado",
        tone: "danger",
      });
      return;
    }

    expect(card.title).toBe(AI_COPY[ai]);
    expect(card.tone).toBe(AI_TONE[ai]);
    expect(card.support).toBe(ai === "active" ? "atendendo pelo WhatsApp" : null);
    expect(card.action).toEqual(
      ai === "active" ? { href: "/configuracoes/ia", label: "Pausar" } : null,
    );
  });

  test("'WhatsApp desconectado' e 'Pausar' nunca aparecem juntos, e cada um só na sua condição", () => {
    for (const [ai, whatsapp] of combinations) {
      const card = aiCardView(ai, whatsapp);
      expect(card.title === "WhatsApp desconectado").toBe(whatsapp === "off");
      expect(card.action?.label === "Reconectar").toBe(whatsapp === "off");
      expect(card.action?.label === "Pausar").toBe(
        ai === "active" && whatsapp !== "off",
      );
    }
  });
});

describe("Goal085 prova 2: o cartão da IA na casca", () => {
  test("com a IA ACTIVE e o WhatsApp DISCONNECTED, diz que o WhatsApp está desconectado e nunca 'IA ativa' nem 'Pausar'", async () => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE", "DISCONNECTED"));
    const { container } = render(
      <PlatformLayout>
        <ClientesPage />
      </PlatformLayout>,
    );
    const card = sidebarCard(container);

    expect(await within(card).findByText("WhatsApp desconectado")).toBeVisible();
    expect(within(card).getByText("a IA não está atendendo")).toBeVisible();
    expect(within(card).getByRole("link", { name: "Reconectar" })).toHaveAttribute(
      "href",
      "/configuracoes/whatsapp",
    );
    expect(within(card).queryByText("IA ativa")).toBeNull();
    expect(within(card).queryByRole("link", { name: "Pausar" })).toBeNull();
    expect(within(card).queryByText("atendendo pelo WhatsApp")).toBeNull();
  });

  test("com o WhatsApp CONNECTED, diz 'IA ativa' e tem 'Pausar'", async () => {
    const { container } = render(
      <PlatformLayout>
        <ClientesPage />
      </PlatformLayout>,
    );
    const card = sidebarCard(container);

    expect(await within(card).findByText("IA ativa")).toBeVisible();
    expect(within(card).getByRole("link", { name: "Pausar" })).toHaveAttribute(
      "href",
      "/configuracoes/ia",
    );
    expect(within(card).queryByText("WhatsApp desconectado")).toBeNull();
    expect(within(card).queryByRole("link", { name: "Reconectar" })).toBeNull();
  });
});

describe("Goal085 prova 3: o banner do WhatsApp na Home", () => {
  test("em /inicio com o painel carregado, o banner não aparece e a faixa diz o estado uma vez", async () => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE", "DISCONNECTED"));
    const { container } = render(
      <PlatformLayout>
        <ProductDashboardScreen />
      </PlatformLayout>,
    );

    await screen.findByRole("heading", { level: 1 });
    const band = container.querySelector<HTMLElement>("#operational-status");
    expect(band).not.toBeNull();
    expect(
      within(band as HTMLElement).getByText("WhatsApp desconectado"),
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText("Atendimento automático parado")).toBeNull();
    });
    expect(
      container.querySelectorAll("main .alert, main #operational-status"),
    ).toHaveLength(1);
    expect(
      within(container.querySelector("main") as HTMLElement).getAllByText(
        "WhatsApp desconectado",
      ),
    ).toHaveLength(1);
  });

  test("com o painel ainda carregando, o banner aparece", async () => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE", "DISCONNECTED"));
    dashboardGet.mockReturnValue(new Promise(() => undefined));
    render(
      <PlatformLayout>
        <ProductDashboardScreen />
      </PlatformLayout>,
    );

    expect(await screen.findByText("Atendimento automático parado")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Reconectar WhatsApp" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");
  });

  test("com a consulta da agenda indisponível, a faixa não fala do WhatsApp e o banner continua", async () => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE", "DISCONNECTED"));
    dashboardGet.mockResolvedValue(dashboardFixture("error"));
    render(
      <PlatformLayout>
        <ProductDashboardScreen />
      </PlatformLayout>,
    );

    expect(
      await screen.findByText("Não foi possível consultar a agenda"),
    ).toBeVisible();
    expect(await screen.findByText("Atendimento automático parado")).toBeVisible();
  });

  test("em /clientes com o WhatsApp DISCONNECTED, o banner aparece uma vez", async () => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE", "DISCONNECTED"));
    render(
      <PlatformLayout>
        <ClientesPage />
      </PlatformLayout>,
    );

    expect(await screen.findByText("Atendimento automático parado")).toBeVisible();
    expect(screen.getAllByText("Atendimento automático parado")).toHaveLength(1);
  });
});
