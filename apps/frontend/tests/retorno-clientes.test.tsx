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
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ReturnCampaignDetail,
  ReturnCandidateList,
  ReturnSettings,
} from "@/data";
import { CustomerReturnMessages } from "@/features/customer-return/CustomerReturnMessages";
import { ReturnCallScreen } from "@/features/customer-return/ReturnCallScreen";
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

describe("Retorno de clientes › Renovação", () => {
  test("a lista chega toda marcada, com prazo, último atendimento e costume", async () => {
    const { container } = renderScreen();
    await screen.findByText("Adriana Souza");
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
    expect(
      screen.getByText(
        "Ficaram de fora: 2 já têm horário marcado, 1 está nos contatos ignorados, 1 não tem telefone.",
      ),
    ).toBeVisible();
    expect(candidates).toHaveBeenCalledWith(
      { kind: "RENEWAL", week: "this" },
      expect.any(AbortSignal),
    );
    await expectNoA11yViolations(container);
  });

  test("a mensagem que vai sair usa o nome, o serviço e o prazo da primeira marcada", async () => {
    renderScreen();
    await screen.findByText("Adriana Souza");
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
    await screen.findByText("Adriana Souza");
    await user.click(screen.getByRole("checkbox", { name: /Bia/u }));
    const approveButton = screen.getByRole("button", {
      name: "Aprovar 1 cliente",
    });
    await user.click(approveButton);

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
    await screen.findByText("Adriana Souza");
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
    await screen.findByText("Adriana Souza");
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
    expect(
      await screen.findByText("Não foi possível carregar a lista de clientes."),
    ).toBeVisible();
    candidates.mockResolvedValueOnce({ ...renewalList(), candidates: [] });
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByText(
        "Ninguém vence nesta semana sem horário marcado.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Aprovar/u }),
    ).not.toBeInTheDocument();
  });
});

describe("Retorno de clientes › Resgate", () => {
  test("pede pelos dias da configuração e mostra o incentivo na mensagem", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Adriana Souza");
    await user.click(screen.getByRole("button", { name: "Resgate" }));
    expect(await screen.findByText("Joice")).toBeVisible();
    expect(candidates).toHaveBeenCalledWith(
      { kind: "WINBACK", days: 60 },
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "60 dias" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("“hidratação de brinde na volta”")).toBeVisible();
    const bubbles = [
      ...document.querySelectorAll(".return-message .return-message-bubble"),
    ].map((bubble) => bubble.textContent);
    expect(bubbles).toContain(
      "Pra sua volta, tenho uma condição especial: hidratação de brinde na volta.",
    );
    expect(screen.getByText(/Última vez há 3 meses/u)).toBeVisible();
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
    await screen.findByText("Adriana Souza");
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
    await screen.findByText("Adriana Souza");

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
    await screen.findByText("Adriana Souza");

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
