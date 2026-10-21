// @vitest-environment jsdom
/**
 * Retorno de clientes › Chamar clientes (D-206, D-210,
 * `06-Retorno-de-Clientes.md`): a lista chega toda marcada, a profissional
 * desmarca quem não quer, vê a mensagem que vai sair e aprova; quem não cabe
 * até a própria data é avisado antes, com a escolha de aumentar o limite do
 * dia ou deixar de fora. Aprovada, a tela leva ao andamento da aprovação. O
 * perfil mostra o bloqueio e só a profissional libera quem pediu para parar.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ReturnCampaignDetail,
  ReturnCandidateList,
  ReturnSettings,
} from "@/data";
import { CustomerReturnMessages } from "@/features/customer-return/CustomerReturnMessages";
import {
  candidatesPerPage,
  ReturnCallScreen,
} from "@/features/customer-return/ReturnCallScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const candidates = vi.fn();
const settingsRead = vi.fn();
const plan = vi.fn();
const approve = vi.fn();
const campaigns = vi.fn();
const campaign = vi.fn();
const changeCampaign = vi.fn();
const skipTarget = vi.fn();
const updateSettings = vi.fn();
const customerStatus = vi.fn();
const setCustomerBlocked = vi.fn();
const showToast = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/retorno/chamar",
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    customerReturn: {
      candidates,
      settings: settingsRead,
      plan,
      approve,
      campaigns,
      campaign,
      changeCampaign,
      skipTarget,
      updateSettings,
      customerStatus,
      setCustomerBlocked,
    },
    settings: {
      get: async () => ({
        ai: aiSettings,
        business: { name: "Studio Bela" },
      }),
    },
  }),
}));
// Como a IA envia (D-208); cada teste pode trocar.
let aiSettings: {
  enabled: boolean;
  tone: "BALANCED";
  messageDelivery?: "PARTS" | "SINGLE";
} = { enabled: true, tone: "BALANCED" };

vi.mock("@/shared/ui/toastBus", () => ({
  showToast: (...args: unknown[]) => {
    showToast(...args);
  },
}));

const SETTINGS: ReturnSettings = {
  configured: false,
  dailyLimit: 10,
  windowDays: [1, 2, 3, 4, 5, 6],
  windowStart: "09:00",
  windowEnd: "19:00",
  leadDays: 2,
  winbackDays: 60,
  winbackIncentive: "hidratação de brinde na volta",
  renewalMessage: null,
  winbackMessage: null,
};

function renewalList(): ReturnCandidateList {
  return {
    kind: "RENEWAL",
    timezone: "America/Sao_Paulo",
    today: "2026-10-19",
    weekStart: "2026-10-19",
    weekEnd: "2026-10-25",
    days: null,
    candidates: [
      {
        customerId: "adri",
        name: "Adriana Souza",
        phone: "+55 11 99999-0001",
        serviceName: "Manutenção 5D",
        expectedDate: "2026-10-24",
        intervalDays: 15,
        intervalSource: "SERVICE",
        lastVisitDate: "2026-10-09",
        daysSinceLastVisit: 10,
        sendBy: "2026-10-22",
        habit: { weekdays: [5, 6], bandStart: "16:00", bandEnd: "19:00" },
      },
      {
        customerId: "bia",
        name: "Bia",
        phone: "+55 11 99999-0002",
        serviceName: "Design de sobrancelha",
        expectedDate: "2026-10-17",
        intervalDays: 21,
        intervalSource: "AVERAGE",
        lastVisitDate: "2026-09-26",
        daysSinceLastVisit: 23,
        sendBy: null,
        habit: null,
      },
    ],
    excluded: {
      deactivated: 0,
      noPhone: 1,
      futureAppointment: 2,
      blocked: 0,
      recentlyContacted: 0,
      queued: 0,
      ignored: 1,
      personal: 0,
    },
  };
}

function detail(
  overrides: Partial<ReturnCampaignDetail> = {},
): ReturnCampaignDetail {
  return {
    id: "campaign-1",
    kind: "RENEWAL",
    state: "ACTIVE",
    dailyLimit: 10,
    incentive: null,
    weekStart: "2026-10-19",
    winbackDays: null,
    createdAt: "2026-10-19T12:00:00.000Z",
    pausedAt: null,
    cancelledAt: null,
    completedAt: null,
    counts: {
      total: 2,
      queued: 1,
      sent: 1,
      replied: 1,
      booked: 1,
      declined: 0,
      skipped: 0,
      failed: 0,
      awaiting: 0,
      noReply: 0,
      revenue: 120,
      expectedRevenue: 0,
    },
    messageTemplate: null,
    targets: [
      {
        id: "t1",
        customerId: "adri",
        customerName: "Adriana Souza",
        state: "BOOKED",
        reason: null,
        serviceName: "Manutenção 5D",
        expectedDate: "2026-10-24",
        lastVisitDate: "2026-10-09",
        sendBy: "2026-10-22",
        plannedDate: "2026-10-19",
        sentAt: "2026-10-19T12:10:00.000Z",
        repliedAt: "2026-10-19T13:00:00.000Z",
        bookedAt: "2026-10-19T13:05:00.000Z",
        appointmentId: "appointment-1",
        followUpState: null,
        followUpSentAt: null,
        offeredSlots: [],
        messageBody: "Oi, Adriana!",
        outcome: "BOOKED",
        appointment: {
          startAt: "2026-10-24T20:00:00.000Z",
          status: "COMPLETED",
          value: 120,
        },
      },
      {
        id: "t2",
        customerId: "bia",
        customerName: "Bia",
        state: "QUEUED",
        reason: null,
        serviceName: "Design de sobrancelha",
        expectedDate: "2026-10-17",
        lastVisitDate: "2026-09-26",
        sendBy: null,
        plannedDate: "2026-10-20",
        sentAt: null,
        repliedAt: null,
        bookedAt: null,
        appointmentId: null,
        followUpState: null,
        followUpSentAt: null,
        offeredSlots: [],
        messageBody: null,
        outcome: "QUEUED",
        appointment: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of [
    candidates,
    settingsRead,
    plan,
    approve,
    campaigns,
    campaign,
    changeCampaign,
    skipTarget,
    updateSettings,
    customerStatus,
    setCustomerBlocked,
    showToast,
    push,
  ]) {
    mock.mockReset();
  }
  settingsRead.mockResolvedValue(SETTINGS);
  candidates.mockImplementation(async (query: { kind: string }) =>
    query.kind === "RENEWAL"
      ? renewalList()
      : {
          ...renewalList(),
          kind: "WINBACK",
          weekStart: null,
          weekEnd: null,
          days: 60,
          candidates: [
            {
              ...renewalList().candidates[0],
              customerId: "joice",
              name: "Joice",
              expectedDate: null,
              intervalDays: null,
              intervalSource: null,
              daysSinceLastVisit: 95,
              sendBy: null,
            },
          ],
        },
  );
  campaigns.mockResolvedValue([]);
  plan.mockResolvedValue({
    dailyLimit: 10,
    total: 2,
    notFitting: [],
    minimumDailyLimit: 10,
    lastPlannedDate: "2026-10-19",
  });
  approve.mockResolvedValue(detail());
});

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <ReturnCallScreen />
    </ShellConfigProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function next(user: User) {
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

/** Da primeira etapa (tipo) para a lista de clientes. */
async function openClients(user: User, name = "Adriana Souza") {
  await next(user);
  await screen.findByText(name);
}

/** Da primeira etapa até a revisão, com a lista como chegou. */
async function openReview(user: User) {
  await openClients(user);
  await next(user);
  await next(user);
  await screen.findByRole("heading", { name: "Revisar e aprovar" });
}

function manyCandidates(count: number): ReturnCandidateList {
  const base = renewalList();
  return {
    ...base,
    candidates: Array.from({ length: count }, (_, index) => ({
      ...base.candidates[0],
      customerId: `c${index + 1}`,
      name: `Cliente ${String(index + 1).padStart(2, "0")}`,
    })),
  };
}

describe("Retorno de clientes › etapas (D-212)", () => {
  test("começa no tipo: escolher explica o que cada um faz e o período", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    expect(
      await screen.findByRole("heading", { name: "Quem você quer chamar?" }),
    ).toBeVisible();
    const steps = screen.getByRole("list", { name: "Etapas" });
    expect(
      within(steps)
        .getByText(/Etapa 1 de 4/u)
        .closest("li"),
    ).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("radio", { name: /Renovação/u })).toBeChecked();
    expect(
      screen.getByText(/Lembrar quem está na hora de refazer/u),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Esta semana" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("radio", { name: /Resgate/u }));
    expect(screen.getByText(/Reaproximar quem sumiu/u)).toBeVisible();
    expect(
      screen.getByText(
        "Quem não vem há 60 dias ou mais e não tem horário marcado.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "60 dias" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Na primeira etapa não há "Voltar": o voltar da barra leva ao Retorno.
    expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
  });

  test("continuar leva o foco ao título da etapa; voltar guarda o que foi desmarcado", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openClients(user);
    expect(screen.getByRole("heading", { name: "Quem recebe" })).toHaveFocus();
    await user.click(screen.getByRole("checkbox", { name: /Bia/u }));
    await next(user);
    expect(screen.getByRole("heading", { name: "A mensagem" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("checkbox", { name: /Bia/u })).not.toBeChecked();
    expect(screen.getByText(/1 de 2 marcadas/u)).toBeVisible();
  });
});

describe("Retorno de clientes › Renovação", () => {
  test("a lista chega toda marcada, com prazo, último atendimento e costume", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await openClients(user);
    const adri = screen.getByRole("checkbox", { name: /Adriana Souza/u });
    const bia = screen.getByRole("checkbox", { name: /Bia/u });
    expect(adri).toBeChecked();
    expect(bia).toBeChecked();
    expect(screen.getByText("Manutenção 5D vence em 5 dias")).toBeVisible();
    expect(
      screen.getByText("Design de sobrancelha venceu há 2 dias"),
    ).toBeVisible();
    expect(
      screen.getByText("costuma vir sex ou sáb, das 16h às 19h"),
    ).toBeVisible();
    expect(screen.getByText(/a cada 21 dias, pela média dela/u)).toBeVisible();
    // Quem ficou de fora é uma linha que abre o porquê.
    const why =
      "Ficaram de fora: 2 já têm horário marcado, 1 está nos contatos ignorados, 1 não tem telefone.";
    expect(screen.getByText(why)).not.toBeVisible();
    await user.click(screen.getByText("4 clientes ficaram de fora"));
    expect(screen.getByText(why)).toBeVisible();
    expect(candidates).toHaveBeenCalledWith(
      { kind: "RENEWAL", week: "this" },
      expect.any(AbortSignal),
    );
    await expectNoA11yViolations(container);
  });

  test("a mensagem que vai sair usa o nome, o serviço e o prazo da primeira marcada", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openClients(user);
    await next(user);
    // Em várias mensagens (D-208, o padrão): um balão por mensagem, em ordem.
    const bubbles = [
      ...document.querySelectorAll(".return-message .return-message-bubble"),
    ].map((bubble) => bubble.textContent);
    expect(bubbles.slice(0, 4)).toEqual([
      "Oi, Adriana!",
      "Tudo bem?",
      "Seu atendimento de Manutenção 5D completa 15 dias no sábado.",
      "Quer que eu já reserve um horário?",
    ]);
    expect(bubbles[4]).toMatch(/^Tenho .+ ou .+\.$/u);
  });

  test("desmarcar tira da lista; aprovar simula o ritmo, aprova só as marcadas e abre o andamento", async () => {
    const user = userEvent.setup();
    renderScreen();
    await openClients(user);
    await user.click(screen.getByRole("checkbox", { name: /Bia/u }));
    await next(user);
    await next(user);
    const review = screen.getByRole("region", { name: "Resumo" });
    expect(within(review).getByText("Renovação")).toBeVisible();
    expect(
      within(review).getByText("Esta semana · 19/10 a 25/10"),
    ).toBeVisible();
    expect(within(review).getByText("1 cliente")).toBeVisible();
    expect(
      within(review).getByText(/Até 10 por dia, seg a sáb, das 9h às 19h/u),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Aprovar 1 cliente" }));

    await waitFor(() => expect(approve).toHaveBeenCalled());
    expect(plan).toHaveBeenCalledWith({
      kind: "RENEWAL",
      week: "this",
      customerIds: ["adri"],
    });
    expect(approve).toHaveBeenCalledWith({
      kind: "RENEWAL",
      week: "this",
      customerIds: ["adri"],
    });
    expect(showToast).toHaveBeenCalledWith(
      "Aprovado: 2 mensagens saem aos poucos.",
    );
    expect(push).toHaveBeenCalledWith(
      "/retorno/aprovacoes/detalhes?id=campaign-1",
    );
  });

  test("quem não cabe antes da data: aumentar o limite ou deixar de fora", async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue({
      dailyLimit: 10,
      total: 2,
      notFitting: ["bia"],
      minimumDailyLimit: 11,
      lastPlannedDate: "2026-10-20",
    });
    renderScreen();
    await openReview(user);
    await user.click(
      screen.getByRole("button", { name: "Aprovar 2 clientes" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Nem todas cabem antes da data",
    });
    expect(
      within(dialog).getByText(/1 cliente não cabe no limite de 10 por dia/u),
    ).toBeVisible();
    expect(approve).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Deixar essa de fora" }),
    );
    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith({
        kind: "RENEWAL",
        week: "this",
        customerIds: ["adri"],
      }),
    );
  });

  test("aumentar o limite aprova todas com o novo limite do dia", async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue({
      dailyLimit: 10,
      total: 2,
      notFitting: ["bia"],
      minimumDailyLimit: 11,
      lastPlannedDate: "2026-10-20",
    });
    renderScreen();
    await openReview(user);
    await user.click(
      screen.getByRole("button", { name: "Aprovar 2 clientes" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Aumentar para 11 por dia" }),
    );
    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith({
        kind: "RENEWAL",
        week: "this",
        customerIds: ["adri", "bia"],
        dailyLimit: 11,
      }),
    );
  });

  test("lista vazia e erro com tentar de novo", async () => {
    const user = userEvent.setup();
    candidates.mockRejectedValueOnce(new Error("offline"));
    renderScreen();
    await screen.findByRole("heading", { name: "Quem você quer chamar?" });
    await next(user);
    expect(
      await screen.findByText("Não foi possível carregar a lista de clientes."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    candidates.mockResolvedValueOnce({ ...renewalList(), candidates: [] });
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByText(
        "Ninguém vence nesta semana sem horário marcado.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /Aprovar/u }),
    ).not.toBeInTheDocument();
  });
});

describe("Retorno de clientes › lista paginada (D-212)", () => {
  // jsdom abre com 1024 × 768; cada teste escolhe o tamanho da tela.
  function setViewport(width: number, height: number) {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: height,
    });
  }
  afterEach(() => setViewport(1024, 768));

  test("quantas cabem por página: mais no tablet, duas colunas no desktop", () => {
    expect(candidatesPerPage(390, 844)).toBe(5);
    expect(candidatesPerPage(360, 640)).toBe(3);
    expect(candidatesPerPage(768, 1024)).toBe(7);
    expect(candidatesPerPage(1440, 900)).toBe(12);
    // Nunca menos de 3 linhas, nem mais de 8.
    expect(candidatesPerPage(390, 400)).toBe(3);
    expect(candidatesPerPage(768, 2000)).toBe(8);
  });

  test("a lista longa vem em páginas, sem rolar a tela", async () => {
    setViewport(390, 844);
    candidates.mockResolvedValue(manyCandidates(12));
    const user = userEvent.setup();
    renderScreen();
    await openClients(user, "Cliente 01");
    const list = screen.getByRole("region", { name: "Clientes" });
    expect(within(list).getAllByRole("checkbox")).toHaveLength(5);
    expect(screen.getByText("Página 1 de 3")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Página anterior" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(screen.getByText("Página 2 de 3")).toBeVisible();
    expect(screen.getByText("Cliente 06")).toBeVisible();
    expect(screen.queryByText("Cliente 01")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(within(list).getAllByRole("checkbox")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Próxima página" }),
    ).toBeDisabled();
  });

  test("marcar todas vale para todas as páginas, e a aprovação leva as de todas", async () => {
    setViewport(390, 844);
    candidates.mockResolvedValue(manyCandidates(12));
    const user = userEvent.setup();
    renderScreen();
    await openClients(user, "Cliente 01");

    await user.click(screen.getByRole("button", { name: "Desmarcar todas" }));
    expect(screen.getByText(/0 de 12 marcadas/u)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Marque quem vai receber" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(
      screen.getByRole("checkbox", { name: /Cliente 06/u }),
    ).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Marcar todas" }));
    expect(screen.getByText(/12 de 12 marcadas/u)).toBeVisible();
    // Desmarca uma da segunda página e aprova as outras onze.
    await user.click(screen.getByRole("checkbox", { name: /Cliente 07/u }));
    await next(user);
    await next(user);
    await user.click(
      screen.getByRole("button", { name: "Aprovar 11 clientes" }),
    );
    await waitFor(() => expect(approve).toHaveBeenCalled());
    const [input] = approve.mock.calls[0] as [{ customerIds: string[] }];
    const ids = input.customerIds;
    expect(ids).toHaveLength(11);
    expect(ids).not.toContain("c7");
    expect(ids).toContain("c12");
  });
});

describe("Retorno de clientes › Resgate", () => {
  test("pede pelos dias da configuração e mostra o incentivo na mensagem", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("heading", { name: "Quem você quer chamar?" });
    await user.click(screen.getByRole("radio", { name: /Resgate/u }));
    expect(screen.getByRole("button", { name: "60 dias" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await openClients(user, "Joice");
    expect(candidates).toHaveBeenCalledWith(
      { kind: "WINBACK", days: 60 },
      expect.any(AbortSignal),
    );
    expect(screen.getByText(/Última vez há 3 meses/u)).toBeVisible();
    await next(user);
    expect(screen.getByText("“hidratação de brinde na volta”")).toBeVisible();
    const bubbles = [
      ...document.querySelectorAll(".return-message .return-message-bubble"),
    ].map((bubble) => bubble.textContent);
    expect(bubbles).toContain(
      "Pra sua volta, tenho uma condição especial: hidratação de brinde na volta.",
    );
  });
});

describe("Perfil › mensagens de retorno", () => {
  test("quem pediu para parar só volta a receber quando a profissional libera", async () => {
    const user = userEvent.setup();
    customerStatus.mockResolvedValue({
      customerId: "c1",
      blocked: true,
      permanent: true,
      blockedUntil: null,
      reason: "STOPPED",
      lastMessageAt: "2026-10-15T12:00:00.000Z",
    });
    setCustomerBlocked.mockResolvedValue({
      customerId: "c1",
      blocked: false,
      permanent: false,
      blockedUntil: null,
      reason: null,
      lastMessageAt: "2026-10-15T12:00:00.000Z",
    });
    const { container } = render(<CustomerReturnMessages customerId="c1" />);
    expect(
      await screen.findByText(
        "Pediu para não receber mais mensagens de retorno. Só você pode liberar.",
      ),
    ).toBeVisible();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Voltar a enviar" }));
    await waitFor(() =>
      expect(setCustomerBlocked).toHaveBeenCalledWith("c1", false),
    );
    expect(showToast).toHaveBeenCalledWith("Mensagens de retorno liberadas.");
    expect(
      await screen.findByRole("button", {
        name: "Não enviar mensagens de retorno",
      }),
    ).toBeVisible();
  });
});

// D-208 — o exemplo por cliente: um celular com a conversa como ela recebe.
describe("Retorno de clientes › ver a mensagem de cada cliente", () => {
  function stubReducedMotion(reduce: boolean) {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: reduce && query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          onchange: null,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
  }

  function phoneBubbles(dialog: HTMLElement): string[] {
    return within(within(dialog).getByRole("log"))
      .queryAllByText(/./u, { selector: ".chat-phone-text" })
      .map((node) => node.textContent ?? "");
  }

  test("abre o celular com a mensagem daquela cliente, sem marcar nem desmarcar", async () => {
    stubReducedMotion(true);
    const user = userEvent.setup();
    const { container } = renderScreen();
    await openClients(user);
    const adriana = screen.getByRole("checkbox", { name: /Adriana/u });
    expect(adriana).toBeChecked();

    await user.click(
      screen.getByRole("button", { name: "Ver a mensagem para Adriana Souza" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Como a IA chama Adriana",
    });
    expect(adriana).toBeChecked();
    expect(within(dialog).getByText("Studio Bela")).toBeVisible();
    const bubbles = phoneBubbles(dialog);
    expect(bubbles.slice(0, 4)).toEqual([
      "Oi, Adriana!",
      "Tudo bem?",
      "Seu atendimento de Manutenção 5D completa 15 dias no sábado.",
      "Quer que eu já reserve um horário?",
    ]);
    expect(bubbles[4]).toMatch(/^Tenho .+ ou .+\.$/u);
    // Menos movimento: tudo de uma vez, sem "digitando…".
    expect(within(dialog).queryByText("digitando…")).toBeNull();
    await expectNoA11yViolations(container);
    vi.unstubAllGlobals();
  });

  test("cada cliente recebe a dela: o celular da Bia fala com a Bia", async () => {
    stubReducedMotion(true);
    const user = userEvent.setup();
    renderScreen();
    await openClients(user);

    await user.click(
      screen.getByRole("button", { name: /^Ver a mensagem para Bia/u }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /^Como a IA chama Bia/u,
    });
    expect(phoneBubbles(dialog)[0]).toMatch(/^Oi, Bia/u);
    await user.click(within(dialog).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    vi.unstubAllGlobals();
  });

  test("numa mensagem só, o celular mostra um balão", async () => {
    stubReducedMotion(true);
    aiSettings = { enabled: true, tone: "BALANCED", messageDelivery: "SINGLE" };
    const user = userEvent.setup();
    renderScreen();
    await openClients(user);

    await user.click(
      screen.getByRole("button", { name: "Ver a mensagem para Adriana Souza" }),
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(phoneBubbles(dialog)).toHaveLength(1));
    expect(phoneBubbles(dialog)[0]).toMatch(/^Oi, Adriana! Tudo bem\?\n\n/u);
    aiSettings = { enabled: true, tone: "BALANCED" };
    vi.unstubAllGlobals();
  });
});
