// @vitest-environment jsdom
/**
 * Goal087 — a casca da área logada e a faixa da Home iguais ao protótipo (H1).
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * 1. a sidebar lista, nesta ordem, Início, Conversas, Agenda, Clientes,
 *    Serviços, Configurações e Notificações, todos links, e não tem linha de
 *    estado do WhatsApp;
 * 2. o cartão da IA: com a IA ativa, "IA ativa", "atendendo pelo WhatsApp" e o
 *    link "Pausar" para /configuracoes/ia; nos outros estados, o texto de
 *    sempre e nenhum "Pausar";
 * 3. a conta mostra a pessoa (nome e iniciais, ou o e-mail se o nome for nulo)
 *    e o nome do negócio, e o menu abre com "Minha conta" e "Sair";
 * 4. a casca não renderiza o cabeçalho de marca em nenhuma rota logada;
 * 5. a faixa da Home com a IA ativa tem "Pausar" e não tem a linha de pontos
 *    de estado; com o WhatsApp desconectado, diz o estado e não tem "Pausar".
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pela comparação com o protótipo e pelo gate renderizado (G-1 e G-2).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Dashboard, SystemStatus } from "@/data";
import { ProductDashboardScreen } from "@/features/dashboard/DashboardScreen";
import { AppShell } from "@/shared/layout/AppShell";
import type { ShellConfig } from "@/shared/layout/ShellConfig";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const statusGet = vi.fn();
const dashboardGet = vi.fn();
const notificationsSummary = vi.fn();
const logout = vi.fn();
const sessionUser = vi.hoisted(() => {
  const current: { email: string; name: string | null } = {
    email: "dona@studiomarina.com.br",
    name: "Marina Alves",
  };
  return { current };
});

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout },
    dashboard: { get: dashboardGet },
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: sessionUser.current,
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

function dashboardFixture(): Dashboard {
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
    },
    whatsapp: {
      data: { phoneNumber: "5511999990000", status: "CONNECTED" },
      status: "ok",
    },
  };
}

type ShellRoute = Pick<ShellConfig, "active" | "module" | "title">;

function renderShell(
  route: ShellRoute = {
    active: "inicio",
    module: "dashboard",
    title: "Início",
  },
) {
  return render(
    <AppShell {...route}>
      <p>Conteúdo</p>
    </AppShell>,
  );
}

function sidebarOf(container: HTMLElement): HTMLElement {
  const sidebar = container.querySelector<HTMLElement>("aside.sidebar");
  if (!sidebar) throw new Error("aside.sidebar não foi renderizada");
  return sidebar;
}

beforeEach(() => {
  statusGet.mockReset();
  dashboardGet.mockReset();
  notificationsSummary.mockReset();
  logout.mockReset();
  sessionUser.current = {
    email: "dona@studiomarina.com.br",
    name: "Marina Alves",
  };
  statusGet.mockResolvedValue(statusFixture());
  dashboardGet.mockResolvedValue(dashboardFixture());
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
});

describe("Goal087 prova 1: a sidebar", () => {
  test("lista os sete destinos na ordem do protótipo, todos links, sem linha de estado do WhatsApp", async () => {
    const { container } = renderShell();
    await screen.findByText("IA ativa");

    const sidebar = sidebarOf(container);
    const destinations = Array.from(sidebar.querySelectorAll("nav a")).map(
      (link) => ({
        href: link.getAttribute("href"),
        name: (link.textContent ?? "").trim(),
      }),
    );

    expect(destinations).toEqual([
      { href: "/inicio", name: "Início" },
      { href: "/conversas", name: "Conversas" },
      { href: "/agenda", name: "Agenda" },
      { href: "/clientes", name: "Clientes" },
      { href: "/servicos", name: "Serviços" },
      { href: "/configuracoes", name: "Configurações" },
      { href: "/notificacoes", name: "Notificações" },
    ]);

    const nav = within(sidebar).getByRole("navigation", {
      name: "Navegação principal",
    });
    expect(within(nav).getAllByRole("link")).toHaveLength(7);
    expect(within(nav).getByRole("link", { name: "Início" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    expect(
      within(sidebar).queryByText(/WhatsApp (conectado|desconectado)/),
    ).toBeNull();
    expect(
      within(sidebar).queryByText(
        /Verificando WhatsApp|WhatsApp não confirmado/,
      ),
    ).toBeNull();
  });

  test("com o WhatsApp desconectado, a sidebar continua sem a linha de estado do WhatsApp", async () => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE", "DISCONNECTED"));
    const { container } = renderShell();
    await screen.findByRole("alert");

    const sidebar = sidebarOf(container);
    // Goal085: o cartão da IA passa a dizer a desconexão; a linha de estado
    // própria do WhatsApp (.wa-status) continua ausente.
    expect(within(sidebar).queryByText("WhatsApp conectado")).toBeNull();
    expect(
      within(sidebar).queryByText(
        /Verificando WhatsApp|WhatsApp não confirmado/,
      ),
    ).toBeNull();
    expect(sidebar.querySelector(".wa-status")).toBeNull();
  });
});

describe("Goal087 prova 2: o cartão da IA", () => {
  test("com a IA ativa, mostra o estado, a linha de apoio e o link Pausar para as configurações da IA", async () => {
    const { container } = renderShell();
    const sidebar = sidebarOf(container);

    expect(await within(sidebar).findByText("IA ativa")).toBeVisible();
    expect(within(sidebar).getByText("atendendo pelo WhatsApp")).toBeVisible();
    expect(
      within(sidebar).getByRole("link", { name: "Pausar" }),
    ).toHaveAttribute("href", "/configuracoes/ia");
  });

  test.each<[AiState, string]>([
    ["OFF", "IA desligada"],
    ["PENDING", "IA em ativação"],
    ["UNKNOWN", "IA não confirmado"],
  ])("com a IA em %s, mostra %s e nenhum Pausar", async (state, copy) => {
    statusGet.mockResolvedValue(statusFixture(state));
    const { container } = renderShell();
    const sidebar = sidebarOf(container);

    expect(await within(sidebar).findByText(copy)).toBeVisible();
    expect(within(sidebar).queryByRole("link", { name: "Pausar" })).toBeNull();
    expect(within(sidebar).queryByText("atendendo pelo WhatsApp")).toBeNull();
    expect(within(sidebar).queryByText("IA ativa")).toBeNull();
  });
});

describe("Goal087 prova 3: a conta", () => {
  test("com o nome da pessoa, mostra o nome, as iniciais dele e o negócio embaixo", async () => {
    const { container } = renderShell();
    await screen.findByText("IA ativa");

    const account = within(sidebarOf(container)).getByRole("button", {
      name: /Marina Alves/,
    });
    expect(within(account).getByText("Marina Alves")).toBeVisible();
    expect(account.querySelector(".avatar")?.textContent).toBe("MA");
    expect(within(account).queryByText("dona@studiomarina.com.br")).toBeNull();
    expect(within(account).queryByText("Conta proprietária")).toBeNull();

    expect(
      container.querySelector(
        ".sidebar .business-context .business-name strong",
      )?.textContent,
    ).toBe("Studio Marina");
  });

  test("sem o nome, mostra o e-mail e a inicial dele", async () => {
    sessionUser.current = { email: "dona@studiomarina.com.br", name: null };
    const { container } = renderShell();
    await screen.findByText("IA ativa");

    const account = within(sidebarOf(container)).getByRole("button", {
      name: /dona@studiomarina\.com\.br/,
    });
    expect(within(account).getByText("dona@studiomarina.com.br")).toBeVisible();
    expect(account.querySelector(".avatar")?.textContent).toBe("D");
    expect(
      container.querySelector(
        ".sidebar .business-context .business-name strong",
      )?.textContent,
    ).toBe("Studio Marina");
  });

  test("o menu abre com Minha conta e Sair, fecha com Escape e devolve o foco ao botão", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    await screen.findByText("IA ativa");

    const account = within(sidebarOf(container)).getByRole("button", {
      name: /Marina Alves/,
    });
    await user.click(account);

    const menu = container.querySelector<HTMLElement>("#account-menu");
    expect(menu).not.toBeNull();
    expect(
      within(menu as HTMLElement).getByRole("link", { name: "Minha conta" }),
    ).toHaveAttribute("href", "/configuracoes/conta");
    expect(
      within(menu as HTMLElement).getByRole("button", { name: "Sair" }),
    ).toBeVisible();

    await user.keyboard("{Escape}");
    expect(container.querySelector("#account-menu")).toBeNull();
    expect(account).toHaveFocus();
  });

  test("o menu fecha ao clicar fora e ao escolher Minha conta (2026-10-16)", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    await screen.findByText("IA ativa");
    const account = within(sidebarOf(container)).getByRole("button", {
      name: /Marina Alves/,
    });

    await user.click(account);
    expect(container.querySelector("#account-menu")).not.toBeNull();
    await user.click(document.body);
    expect(container.querySelector("#account-menu")).toBeNull();

    await user.click(account);
    await user.click(
      within(container.querySelector<HTMLElement>("#account-menu")!).getByRole(
        "link",
        { name: "Minha conta" },
      ),
    );
    expect(container.querySelector("#account-menu")).toBeNull();
  });
});

describe("Goal087 prova 4: sem cabeçalho de marca", () => {
  const ROUTES: ShellRoute[] = [
    { active: "inicio", module: "dashboard", title: "Início" },
    { active: "agenda", module: "agenda", title: "Agenda" },
    { active: "clientes", module: "directory", title: "Clientes" },
    { active: "servicos", module: "directory", title: "Serviços" },
    { active: "conversas", module: "conversations", title: "Conversas" },
    { active: "configuracoes", module: "settings", title: "Configurações" },
    { active: "notificacoes", module: "system", title: "Notificações" },
    { active: "importacao", module: "migration", title: "Importação" },
  ];

  test.each(ROUTES)(
    "$title ($module) não renderiza header de marca",
    async (route) => {
      const { container } = renderShell(route);
      await screen.findByText("IA ativa");

      expect(
        container.querySelector('header[class$="-mobile-header"]'),
      ).toBeNull();
      expect(
        container.querySelector("main header .brand, main > header"),
      ).toBeNull();
    },
  );

  test("nem com a casca em atenção ou carregando", async () => {
    const { container } = render(
      <AppShell
        active="inicio"
        attention
        loading
        module="dashboard"
        title="Início"
      >
        <p>Conteúdo</p>
      </AppShell>,
    );
    await screen.findByText("IA ativa");

    expect(
      container.querySelector('header[class$="-mobile-header"]'),
    ).toBeNull();
    expect(container.querySelector("main > header")).toBeNull();
  });
});

describe("Goal087 prova 5: a faixa da Home", () => {
  async function renderHome() {
    const utils = render(
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>,
    );
    await screen.findByRole("heading", { level: 1 });
    const band = utils.container.querySelector<HTMLElement>(
      "#operational-status",
    );
    if (!band) throw new Error("#operational-status não foi renderizada");
    return { ...utils, band };
  }

  test("com a IA ativa, tem o botão Pausar (abre a confirmação) e não tem a linha de pontos de estado", async () => {
    const { band } = await renderHome();

    expect(within(band).getByText("IA ativa")).toBeVisible();
    expect(within(band).getByRole("button", { name: "Pausar" })).toBeVisible();
    expect(
      band.querySelector(".operational-points, .status-line, .status-dot"),
    ).toBeNull();
    expect(
      within(band).queryByText(/WhatsApp conectado|Agenda indisponível/),
    ).toBeNull();
    expect(within(band).queryByText(/^Agenda$/)).toBeNull();
  });

  test("com o WhatsApp desconectado, diz o estado de hoje, não tem Pausar e não tem a linha de pontos", async () => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE", "DISCONNECTED"));
    const { band } = await renderHome();

    expect(within(band).getByText("WhatsApp desconectado")).toBeVisible();
    expect(
      within(band).getByRole("link", { name: "Reconectar WhatsApp" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");
    expect(screen.queryByRole("link", { name: "Pausar" })).toBeNull();
    expect(
      band.querySelector(".operational-points, .status-line, .status-dot"),
    ).toBeNull();
  });
});
