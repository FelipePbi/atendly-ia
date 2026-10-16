// @vitest-environment jsdom
/**
 * Goal117/WU-03 — a Home dos quadros H2 (pendências), H4 (checklist), H5
 * (IA pausada) e H7 (confirmação de pausa).
 *
 * Prova, pelo que a usuária encontra:
 *
 * - as pendências na ordem conversa com instabilidade → conversa aguardando →
 *   serviço sem duração, com o texto do quadro, e a falha de `GET /v1/services`
 *   que só tira a linha de serviço;
 * - "Reativar" grava `{ enabled: true, tone }` com o estilo lido; a recusa
 *   `409 AI_ACTIVATION_TEST_REQUIRED` mostra a frase e o link para
 *   `/configuracoes/ia#teste-real`; outra falha mostra `role="alert"`;
 * - "Pausar" só abre a confirmação; "Pausar IA" grava `{ enabled: false, tone }`;
 *   "Continuar atendendo" e `Escape` fecham sem gravar e o foco volta a "Pausar";
 * - o checklist do H4 e a frase do que falta, e a exceção do H4: com o
 *   checklist na tela e "Conectar o WhatsApp" pendente, "IA inativa" vence
 *   "WhatsApp desconectado" (review117, rodada 1);
 * - "Hoje · {n} restantes" com pendências e "Hoje · {n} atendimentos" sem elas;
 * - "Esta semana" fora com pendências ou checklist (H2, H4) e na tela em H1 e H5;
 * - o traço de cada atendimento com a cor do serviço lida do catálogo, e neutro
 *   quando o catálogo falha.
 *
 * Fidelidade visual não é provada aqui: fica no `visual:compare`.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type Appointment,
  BffHttpError,
  type Conversation,
  type Dashboard,
  type SystemStatus,
} from "@/data";
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
const settingsGet = vi.fn();
const updateAi = vi.fn();
const servicesList = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    dashboard: { get: dashboardGet },
    notifications: { summary: notificationsSummary },
    serviceCatalog: { list: servicesList },
    settings: { get: settingsGet, updateAi },
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

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    customerName: "Cliente",
    externalContactId: "5511900000000",
    handoffReason: null,
    humanHandoff: true,
    id: "conv",
    lastMessage: {
      body: "Oi",
      createdAt: new Date().toISOString(),
      direction: "INBOUND",
      id: "msg",
      source: "CUSTOMER",
    },
    status: "HUMAN_HANDOFF",
    unreadCount: 1,
    updatedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    ...overrides,
  };
}

function appointment(
  id: string,
  customerName: string,
  startTime: string,
  endTime: string,
  services: Array<[string, string]>,
): Appointment {
  return {
    comments: null,
    customer: { id: `${id}-c`, name: customerName, phone: "5511900000000" },
    customerId: `${id}-c`,
    date: "2026-10-05",
    durationMinutes: 45,
    endTime,
    id,
    services: services.map(([serviceId, name]) => ({
      durationMinutes: null,
      name,
      price: null,
      priceType: "NOT_INFORMED",
      serviceId,
    })),
    source: "USER",
    startTime,
    status: "CONFIRMED",
    title: null,
    totalPrice: null,
    totalPriceType: "NONE",
  } as Appointment;
}

function dashboardFixture(
  attention: Conversation[] = [],
  capabilities: Partial<Record<string, boolean>> = {},
  todayAppointments: Appointment[] = [],
): Dashboard {
  return {
    ai: {
      data: {
        aiAppointmentsThisWeek: 8,
        aiAppointmentsToday: 2,
        automatedConversationsToday: 7,
        conversationsNeedingAttention: attention,
        conversationsNeedingAttentionCount: attention.length,
        conversationsTakenOverThisWeek: 2,
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
            ...capabilities,
          },
          integration: null,
          source: "AVENLY",
          timezone: "America/Sao_Paulo",
        },
        estimatedRevenueToday: null,
        nextAppointment: null,
        todayAppointments,
      },
      status: "ok",
    },
    whatsapp: {
      data: { phoneNumber: "5511999990000", status: "CONNECTED" },
      status: "ok",
    },
  };
}

function statusFixture(options: {
  aiOn: boolean;
  whatsapp?: boolean;
}): SystemStatus {
  const connected = options.whatsapp ?? true;
  return {
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: options.aiOn,
      effectiveEnabled: options.aiOn,
      reconciled: "NOOP",
      state: options.aiOn ? "ACTIVE" : "OFF",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-14T12:00:00.000Z",
      phoneNumber: connected ? "5511999990000" : null,
      status: connected ? "CONNECTED" : "DISCONNECTED",
    },
  };
}

function settingsFixture(pausedAt: string | null = null, tone = "CASUAL") {
  return { ai: { pausedAt, tone } };
}

function service(
  id: string,
  name: string,
  needsReview: boolean,
  colorToken: string | null = null,
) {
  return {
    active: true,
    colorToken,
    durationMinutes: needsReview ? null : 45,
    id,
    name,
    needsReview,
    price: null,
    priceType: "NOT_INFORMED",
    reviewOrigin: null,
  };
}

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
  for (const fn of [
    dashboardGet,
    statusGet,
    notificationsSummary,
    settingsGet,
    updateAi,
    servicesList,
  ]) {
    fn.mockReset();
  }
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  settingsGet.mockResolvedValue(settingsFixture());
  servicesList.mockResolvedValue({ editable: true, items: [], source: "AVENLY" });
  updateAi.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Goal117: pendências do H2", () => {
  test("conversa com instabilidade, conversa aguardando e serviço sem duração, nessa ordem", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture([
        conversation({
          customerName: "Marcos Vieira",
          handoffReason: "Pediu desconto",
          id: "conv-b",
        }),
        conversation({
          customerName: "Fernanda Lima",
          handoffReason: "erro ao responder",
          id: "conv-a",
        }),
      ]),
    );
    statusFixtureFor(true);
    servicesList.mockResolvedValue({
      editable: true,
      items: [
        service("s1", "Corte feminino", false),
        service("s2", "Design de sobrancelha", true),
      ],
      source: "AVENLY",
    });

    await renderHome();
    const heading = await screen.findByRole("heading", {
      level: 2,
      name: "Precisa da sua atenção",
    });
    const block = heading.parentElement as HTMLElement;
    await within(block).findByText("Design de sobrancelha");

    const rows = within(block).getAllByText(
      /Fernanda Lima|Marcos Vieira|Design de sobrancelha/,
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      "Fernanda Lima",
      "Marcos Vieira",
      "Design de sobrancelha",
    ]);
    expect(block.textContent).toContain("Design de sobrancelha está sem duração");
    expect(block.textContent).toContain("A IA não consegue marcar esse serviço");
    expect(within(block).getByRole("link", { name: /Corrigir/ })).toHaveAttribute(
      "href",
      "/servicos/editar?id=s2",
    );
    expect(
      within(block).getByRole("link", { name: /Marcos Vieira/ }),
    ).toHaveAttribute("href", "/conversas/conv-b");
    expect(block.textContent).toMatch(/Aguardando há 12 min/);

    await expectNoA11yViolations(block);
  });

  test("a falha de GET /v1/services tira só a linha de serviço e mantém a agenda", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-05T16:45:00.000Z"));
    dashboardGet.mockResolvedValue(
      dashboardFixture(
        [
          conversation({
            customerName: "Marcos Vieira",
            handoffReason: "Pediu desconto",
            id: "conv-b",
          }),
        ],
        {},
        [appointment("apt-ana", "Ana Paula", "14:00", "14:45", [["s-corte", "Corte feminino"]])],
      ),
    );
    statusFixtureFor(true);
    servicesList.mockRejectedValue(new Error("fora do ar"));

    await renderHome();

    expect(
      await screen.findByRole("link", { name: /Marcos Vieira/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Precisa da sua atenção" }),
    ).toBeVisible();
    await waitFor(() => expect(servicesList).toHaveBeenCalled());
    expect(screen.queryByText(/está sem duração/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Corrigir/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Ana Paula/ })).toBeVisible();
    expect(screen.getByText("· 1 restante")).toBeVisible();
  });
});

describe("Goal117: Hoje com e sem pendências", () => {
  // 16:45 UTC = 13:45 em America/Sao_Paulo (UTC-3, sem DST): o relógio do H2.
  const agenda = () => [
    appointment("apt-bia", "Bia Castro", "10:00", "10:40", [["s-escova", "Escova"]]),
    appointment("apt-caio", "Caio Souza", "13:30", "14:15", [["s-corte", "Corte feminino"]]),
    appointment("apt-ana", "Ana Paula", "14:00", "14:45", [["s-corte", "Corte feminino"]]),
    appointment("apt-juliana", "Juliana Mendes", "15:00", "16:10", [
      ["s-escova", "Escova"],
      ["s-hidratacao", "Hidratação"],
    ]),
  ];

  function names(container: HTMLElement) {
    return within(container.querySelector(".agenda-stack") as HTMLElement)
      .getAllByText(/^(Bia Castro|Caio Souza|Ana Paula|Juliana Mendes|agora)$/)
      .map((node) => node.textContent);
  }

  test("com pendências, '· n restantes' lista só o que ainda não começou, sem 'agora'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-05T16:45:00.000Z"));
    dashboardGet.mockResolvedValue(
      dashboardFixture(
        [conversation({ customerName: "Fernanda Lima", id: "conv-a" })],
        {},
        agenda(),
      ),
    );
    statusFixtureFor(true);

    const { container } = await renderHome();
    await screen.findByRole("heading", { level: 2, name: "Precisa da sua atenção" });

    expect(screen.getByText("· 2 restantes")).toBeVisible();
    expect(names(container)).toEqual(["Ana Paula", "Juliana Mendes"]);
    expect(screen.queryByText("Bia Castro")).toBeNull();
    expect(screen.queryByText("Caio Souza")).toBeNull();
    expect(screen.queryByText("agora")).toBeNull();
    expect(container.querySelector(".agenda-now-marker")).toBeNull();
    expect(screen.getByText("Escova + Hidratação · 45 min")).toBeVisible();
  });

  test("sem pendências, '· n atendimentos' lista o dia inteiro com 'agora', como no H1", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-05T16:45:00.000Z"));
    dashboardGet.mockResolvedValue(dashboardFixture([], {}, agenda()));
    statusFixtureFor(true);

    const { container } = await renderHome();
    await screen.findByText("Bia Castro");

    expect(screen.getByText("· 4 atendimentos")).toBeVisible();
    expect(screen.queryByText(/restante/)).toBeNull();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Precisa da sua atenção" }),
    ).toBeNull();
    expect(names(container)).toEqual([
      "Bia Castro",
      "agora",
      "Caio Souza",
      "Ana Paula",
      "Juliana Mendes",
    ]);
  });
});

describe("Goal117: o traço de cada atendimento tem a cor do serviço", () => {
  const agenda = () => [
    appointment("apt-ana", "Ana Paula", "14:00", "14:45", [["s-corte", "Corte feminino"]]),
    appointment("apt-juliana", "Juliana Mendes", "15:00", "16:10", [
      ["s-escova", "Escova"],
      ["s-hidratacao", "Hidratação"],
    ]),
    appointment("apt-rita", "Rita Alves", "16:00", "16:30", [["s-sem-cor", "Manicure"]]),
  ];

  function bar(name: string) {
    const row = screen.getByRole("link", { name: new RegExp(name) });
    return Array.from(row.querySelectorAll(".agenda-bar-part")).map(
      (part) => part.getAttribute("data-color"),
    );
  }

  test("o token vem do catálogo; dois serviços dividem o traço; serviço sem cor fica neutro", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture([], {}, agenda()));
    statusFixtureFor(true);
    servicesList.mockResolvedValue({
      editable: true,
      items: [
        service("s-corte", "Corte feminino", false, "SKY"),
        service("s-escova", "Escova", false, "AMBER"),
        service("s-hidratacao", "Hidratação", false, "EMERALD"),
        service("s-sem-cor", "Manicure", false, null),
      ],
      source: "AVENLY",
    });

    await renderHome();
    await screen.findByText("Ana Paula");

    await waitFor(() => expect(bar("Ana Paula")).toEqual(["SKY"]));
    expect(bar("Juliana Mendes")).toEqual(["AMBER", "EMERALD"]);
    expect(bar("Rita Alves")).toEqual([null]);
  });

  test("com o catálogo falhado, o traço fica neutro e a agenda continua", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture([], {}, agenda()));
    statusFixtureFor(true);
    servicesList.mockRejectedValue(new Error("fora do ar"));

    await renderHome();
    await screen.findByText("Ana Paula");
    await waitFor(() => expect(servicesList).toHaveBeenCalled());

    expect(bar("Ana Paula")).toEqual([null]);
    expect(bar("Juliana Mendes")).toEqual([null, null]);
    expect(screen.getByRole("link", { name: /Rita Alves/ })).toBeVisible();
  });
});

describe("Goal117: 'Esta semana' só fora dos quadros H2 e H4", () => {
  const week = () =>
    screen.queryByRole("heading", { level: 2, name: "Esta semana" });

  test("com pendências (H2) o bloco sai", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture([conversation({ customerName: "Fernanda Lima", id: "conv-a" })]),
    );
    statusFixtureFor(true);

    await renderHome();
    await screen.findByRole("heading", { level: 2, name: "Precisa da sua atenção" });

    expect(week()).toBeNull();
  });

  test("com o checklist (H4) o bloco sai", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture([], { activationTestCompleted: false }),
    );
    statusFixtureFor(false, false);

    await renderHome();
    await screen.findByText("Ative sua IA");

    expect(week()).toBeNull();
  });

  test("com a IA ativa e sem pendências (H1) o bloco fica", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusFixtureFor(true);

    await renderHome();

    expect(await screen.findByRole("heading", { level: 2, name: "Esta semana" })).toBeVisible();
  });

  test("com a IA pausada (H5) o bloco fica", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusFixtureFor(false);

    await renderHome();
    await screen.findByRole("button", { name: "Reativar" });

    expect(week()).toBeVisible();
  });
});

describe("Goal117: IA pausada e Reativar (H5)", () => {
  test("mostra a hora da pausa de hoje e nada quando pausedAt é null", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusFixtureFor(false);
    settingsGet.mockResolvedValue(settingsFixture(new Date().toISOString()));

    const { unmount } = await renderHome();
    expect(await screen.findByText(/^Desde \d{2}:\d{2}\./)).toBeVisible();
    expect(screen.getByText(/ninguém recebe resposta automática/)).toBeVisible();
    unmount();

    settingsGet.mockResolvedValue(settingsFixture(null));
    await renderHome();
    await screen.findByText(/As conversas continuam chegando/);
    expect(screen.queryByText(/Desde /)).toBeNull();
  });

  test("mostra o dia quando a pausa é de outro dia", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusFixtureFor(false);
    settingsGet.mockResolvedValue(settingsFixture("2020-01-05T12:30:00.000Z"));

    await renderHome();

    expect(await screen.findByText(/Desde 05\/01, 09:30\./)).toBeVisible();
  });

  test("Reativar grava { enabled: true, tone } com o estilo lido", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusFixtureFor(false);
    settingsGet.mockResolvedValue(settingsFixture(null, "FORMAL"));
    const user = userEvent.setup();

    const { container } = await renderHome();
    const reativar = await screen.findByRole("button", { name: "Reativar" });
    await waitFor(() => expect(reativar).toBeEnabled());
    await expectNoA11yViolations(container);

    await user.click(reativar);

    await waitFor(() =>
      expect(updateAi).toHaveBeenCalledWith({ enabled: true, tone: "FORMAL" }),
    );
    expect(updateAi).toHaveBeenCalledTimes(1);
  });

  test("409 AI_ACTIVATION_TEST_REQUIRED mostra a frase e o link para o teste real", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusFixtureFor(false);
    updateAi.mockRejectedValue(
      new BffHttpError({
        code: "AI_ACTIVATION_TEST_REQUIRED",
        message: "test required",
        requestId: "req-1",
        status: 409,
      }),
    );
    const user = userEvent.setup();

    await renderHome();
    const reativar = await screen.findByRole("button", { name: "Reativar" });
    await waitFor(() => expect(reativar).toBeEnabled());
    await user.click(reativar);

    expect(
      await screen.findByText(
        /A IA só liga depois de um teste real que terminou bem\./,
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Fazer o teste" })).toHaveAttribute(
      "href",
      "/configuracoes/ia#teste-real",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  test("outra falha ao reativar mostra role=alert", async () => {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusFixtureFor(false);
    updateAi.mockRejectedValue(
      new BffHttpError({
        code: "INTERNAL",
        message: "boom",
        requestId: "req-2",
        status: 500,
      }),
    );
    const user = userEvent.setup();

    await renderHome();
    const reativar = await screen.findByRole("button", { name: "Reativar" });
    await waitFor(() => expect(reativar).toBeEnabled());
    await user.click(reativar);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível reativar a IA.");
    expect(screen.queryByRole("link", { name: "Fazer o teste" })).toBeNull();
  });
});

describe("Goal117: confirmação de pausa (H7)", () => {
  async function openPause() {
    dashboardGet.mockResolvedValue(dashboardFixture());
    statusFixtureFor(true);
    settingsGet.mockResolvedValue(settingsFixture(null, "CASUAL"));
    const user = userEvent.setup();
    await renderHome();
    const pausar = await screen.findByRole("button", { name: "Pausar" });
    await waitFor(() => expect(pausar).toBeEnabled());
    await user.click(pausar);
    const dialog = await screen.findByRole("dialog", { name: "Pausar sua IA?" });
    return { dialog, pausar, user };
  }

  test("Pausar abre a confirmação sem gravar", async () => {
    const { dialog } = await openPause();

    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Pausar IA" })).toBeVisible();
    expect(updateAi).not.toHaveBeenCalled();
    await expectNoA11yViolations(dialog);
  });

  test("Pausar IA grava { enabled: false, tone } e fecha", async () => {
    const { dialog, user } = await openPause();

    await user.click(within(dialog).getByRole("button", { name: "Pausar IA" }));

    await waitFor(() =>
      expect(updateAi).toHaveBeenCalledWith({ enabled: false, tone: "CASUAL" }),
    );
    expect(updateAi).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("Continuar atendendo fecha sem gravar e o foco volta a Pausar", async () => {
    const { dialog, pausar, user } = await openPause();

    await user.click(
      within(dialog).getByRole("button", { name: "Continuar atendendo" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateAi).not.toHaveBeenCalled();
    expect(pausar).toHaveFocus();
  });

  test("Escape fecha sem gravar e o foco volta a Pausar", async () => {
    const { pausar, user } = await openPause();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateAi).not.toHaveBeenCalled();
    expect(pausar).toHaveFocus();
  });

  test("a falha ao pausar fica na confirmação com role=alert", async () => {
    updateAi.mockRejectedValue(new Error("boom"));
    const { dialog, user } = await openPause();

    await user.click(within(dialog).getByRole("button", { name: "Pausar IA" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Não foi possível pausar a IA.",
    );
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});

describe("Goal117: checklist e faixa do H4", () => {
  test("a faixa diz o que falta e só o primeiro passo pendente tem ação", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture([], {
        activationTestCompleted: false,
        aiActivationReady: true,
        hoursConfigured: false,
      }),
    );
    statusFixtureFor(false, true);

    const { container } = await renderHome();

    expect(await screen.findByText("IA inativa")).toBeVisible();
    expect(
      screen.getByText("Falta definir os horários de atendimento e fazer o teste"),
    ).toBeVisible();
    expect(screen.getByText("Ative sua IA")).toBeVisible();
    expect(screen.getByText("2 de 4 passos concluídos")).toBeVisible();
    for (const label of [
      "Cadastrar um serviço",
      "Definir horários de atendimento",
      "Conectar o WhatsApp",
      "Fazer o teste real",
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getByRole("link", { name: "Definir" })).toHaveAttribute(
      "href",
      "/configuracoes/disponibilidade",
    );
    expect(screen.queryByRole("link", { name: "Fazer o teste" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Conectar" })).toBeNull();
    expect(screen.getByText("Nenhum atendimento hoje.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Criar agendamento" })).toHaveAttribute(
      "href",
      "/agenda/novo",
    );

    await expectNoA11yViolations(container);
  });

  test("com o WhatsApp pendente, 'Conectar' é a única ação e o teste diz 'depois do WhatsApp'", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture([], {
        activationTestCompleted: false,
        aiActivationReady: true,
        hoursConfigured: true,
      }),
    );
    statusFixtureFor(false, false);

    await renderHome();

    expect(await screen.findByText("Ative sua IA")).toBeVisible();
    expect(screen.getByRole("link", { name: "Conectar" })).toHaveAttribute(
      "href",
      "/configuracoes/whatsapp",
    );
    expect(screen.queryByRole("link", { name: "Fazer o teste" })).toBeNull();
    expect(screen.getByText("depois do WhatsApp")).toBeVisible();
  });

  test("exceção do H4: com o checklist e o WhatsApp pendente, 'IA inativa' vence 'WhatsApp desconectado'", async () => {
    dashboardGet.mockResolvedValue(
      dashboardFixture([], {
        activationTestCompleted: false,
        aiActivationReady: true,
        hoursConfigured: true,
      }),
    );
    statusFixtureFor(false, false);

    await renderHome();

    const band = await screen.findByRole("alert");
    expect(within(band).getByText("IA inativa")).toBeVisible();
    expect(
      within(band).getByText("Falta conectar o WhatsApp e fazer o teste"),
    ).toBeVisible();
    expect(screen.queryByText("WhatsApp desconectado")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Reconectar WhatsApp" }),
    ).toBeNull();
    expect(within(band).queryByRole("button")).toBeNull();
  });

  test("sem o checklist na tela (IA ligada), WhatsApp desligado continua 'WhatsApp desconectado'", async () => {
    // Com o WhatsApp desligado o passo "Conectar o WhatsApp" nunca está
    // concluído; o checklist só sai da tela com a IA ativa (H3).
    dashboardGet.mockResolvedValue(
      dashboardFixture([], { activationTestCompleted: true }),
    );
    statusFixtureFor(true, false);

    await renderHome();

    expect(await screen.findByText("WhatsApp desconectado")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Reconectar WhatsApp" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");
    expect(screen.queryByText("IA inativa")).toBeNull();
    expect(screen.queryByText("Ative sua IA")).toBeNull();
  });

  test("com a agenda indisponível, ela continua em primeiro lugar mesmo com o checklist", async () => {
    const fixture = dashboardFixture([], { activationTestCompleted: false });
    dashboardGet.mockResolvedValue({
      ...fixture,
      scheduling: { error: { code: "UNAVAILABLE", message: "fora" }, status: "error" },
    });
    statusFixtureFor(false, false);

    await renderHome();

    expect(
      await screen.findByText("Não foi possível consultar a agenda"),
    ).toBeVisible();
    expect(screen.queryByText("IA inativa")).toBeNull();
  });
});

function statusFixtureFor(aiOn: boolean, whatsapp = true) {
  statusGet.mockResolvedValue(statusFixture({ aiOn, whatsapp }));
}

/**
 * Início sem esqueleto (vídeo de 2026-10-16): entrar na Home não mostra mais
 * blocos cinza. A área fica vazia; se a leitura demorar, o "A" animado
 * aparece no centro; o painel entra com fade; e a volta à Home mostra a
 * última leitura da aba na hora, revalidando em segundo plano.
 */
describe("Início sem esqueleto", () => {
  function pending<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  function home() {
    return (
      <ShellConfigProvider>
        <SystemStatusProvider>
          <ProductDashboardScreen />
        </SystemStatusProvider>
      </ShellConfigProvider>
    );
  }

  test("leitura rápida: nem esqueleto nem carregando, e o painel entra com fade", async () => {
    statusFixtureFor(true);
    dashboardGet.mockResolvedValue(dashboardFixture());
    const { container } = render(home());

    expect(container.querySelector(".skeleton")).toBeNull();
    expect(screen.queryByText("Carregando dados do início")).toBeNull();
    await screen.findByRole("heading", { level: 1 });
    expect(container.querySelector(".dashboard-page")).toHaveClass(
      "is-arriving",
    );
    expect(screen.queryByText("Carregando dados do início")).toBeNull();
  });

  test("leitura lenta: depois de ~150 ms, o A animado, nunca o esqueleto", async () => {
    statusFixtureFor(true);
    const read = pending<Dashboard>();
    dashboardGet.mockReturnValue(read.promise);
    const { container } = render(home());

    expect(screen.queryByText("Carregando dados do início")).toBeNull();
    expect(
      await screen.findByText("Carregando dados do início"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".brand-loader-screen.is-inline"),
    ).not.toBeNull();
    expect(container.querySelector(".skeleton")).toBeNull();

    read.resolve(dashboardFixture());
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText("Carregando dados do início")).toBeNull();
  });

  test("voltar à Home mostra a última leitura na hora, sem fade, e revalida", async () => {
    statusFixtureFor(true);
    dashboardGet.mockResolvedValue(dashboardFixture());
    const first = render(home());
    await screen.findByRole("heading", { level: 1 });
    first.unmount();

    const read = pending<Dashboard>();
    dashboardGet.mockReturnValue(read.promise);
    const { container } = render(home());

    // Na hora, sem esperar a rede.
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    expect(container.querySelector(".dashboard-page")).not.toHaveClass(
      "is-arriving",
    );
    expect(dashboardGet).toHaveBeenCalledTimes(2);
    read.resolve(dashboardFixture());
  });
});
