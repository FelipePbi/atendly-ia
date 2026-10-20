// @vitest-environment jsdom
/**
 * Retorno de clientes no menu (D-210): a visão geral diz o que o retorno
 * trouxe, leva a chamar clientes, às aprovações e às configurações, e mostra
 * a situação das mensagens e a fila dos próximos dias; cada aprovação mostra
 * o andamento de cada cliente, com filtro por situação, e deixa pausar,
 * cancelar o que falta e tirar alguém da fila.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ReturnCampaignCounts,
  ReturnCampaignDetail,
  ReturnOverview,
  ReturnTarget,
} from "@/data";
import { ReturnApprovalScreen } from "@/features/customer-return/ReturnApprovalScreen";
import { ReturnApprovalsScreen } from "@/features/customer-return/ReturnApprovalsScreen";
import { ReturnOverviewScreen } from "@/features/customer-return/ReturnOverviewScreen";
import {
  groupCounts,
  localToday,
  timelineLabel,
} from "@/features/customer-return/returnProgress";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const overview = vi.fn();
const settingsRead = vi.fn();
const candidates = vi.fn();
const campaigns = vi.fn();
const campaign = vi.fn();
const changeCampaign = vi.fn();
const skipTarget = vi.fn();
const showToast = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/retorno",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    customerReturn: {
      overview,
      settings: settingsRead,
      candidates,
      campaigns,
      campaign,
      changeCampaign,
      skipTarget,
    },
  }),
}));

vi.mock("@/shared/ui/toastBus", () => ({
  showToast: (...args: unknown[]) => {
    showToast(...args);
  },
}));

const TODAY = localToday();

function plus(days: number): string {
  const value = new Date(`${TODAY}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localToday(value);
}

function counts(
  overrides: Partial<ReturnCampaignCounts> = {},
): ReturnCampaignCounts {
  return {
    total: 0,
    queued: 0,
    sent: 0,
    replied: 0,
    booked: 0,
    declined: 0,
    skipped: 0,
    failed: 0,
    awaiting: 0,
    noReply: 0,
    revenue: 0,
    expectedRevenue: 0,
    ...overrides,
  };
}

function overviewFixture(
  overrides: Partial<ReturnOverview> = {},
): ReturnOverview {
  return {
    timezone: "America/Sao_Paulo",
    today: TODAY,
    campaigns: { total: 2, live: 1 },
    // 20 clientes: 6 na fila, 2 não enviadas e 12 enviadas — 3 agendaram,
    // 2 responderam, 3 aguardam, 3 não responderam e 1 recusou.
    totals: counts({
      total: 20,
      queued: 6,
      sent: 12,
      replied: 6,
      booked: 3,
      declined: 1,
      skipped: 2,
      awaiting: 3,
      noReply: 3,
      revenue: 240,
      expectedRevenue: 120,
    }),
    customersBack: 3,
    upcoming: {
      days: Array.from({ length: 7 }, (_, index) => ({
        date: plus(index),
        count: [2, 3, 1, 0, 0, 0, 0][index] ?? 0,
      })),
      next: [
        {
          targetId: "t8",
          campaignId: "campaign-1",
          customerId: "helena",
          customerName: "Helena Costa",
          kind: "RENEWAL",
          serviceName: "Manutenção 5D",
          plannedDate: TODAY,
        },
      ],
      later: 0,
      paused: 0,
    },
    ...overrides,
  };
}

function target(overrides: Partial<ReturnTarget>): ReturnTarget {
  return {
    id: "t",
    customerId: "c",
    customerName: "Cliente",
    state: "QUEUED",
    reason: null,
    serviceName: "Manutenção 5D",
    expectedDate: plus(4),
    lastVisitDate: plus(-11),
    sendBy: plus(2),
    plannedDate: plus(1),
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
    ...overrides,
  };
}

function detailFixture(
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
    counts: counts({
      total: 4,
      queued: 1,
      sent: 3,
      replied: 1,
      booked: 1,
      noReply: 1,
      awaiting: 1,
      expectedRevenue: 120,
    }),
    messageTemplate: null,
    targets: [
      target({
        id: "t1",
        customerId: "adri",
        customerName: "Adriana Souza",
        state: "BOOKED",
        outcome: "BOOKED",
        sentAt: "2026-10-19T13:10:00.000Z",
        repliedAt: "2026-10-19T14:00:00.000Z",
        appointmentId: "appointment-1",
        messageBody: "Oi, Adri! Sua manutenção completa 15 dias na sexta.",
        appointment: {
          startAt: "2026-10-24T20:30:00.000Z",
          status: "CONFIRMED",
          value: 120,
        },
      }),
      target({
        id: "t2",
        customerId: "bia",
        customerName: "Bia",
        state: "SENT",
        outcome: "AWAITING",
        sentAt: "2026-10-19T15:00:00.000Z",
        messageBody: "Oi, Bia!",
      }),
      target({
        id: "t3",
        customerId: "carla",
        customerName: "Carla",
        state: "SENT",
        outcome: "NO_REPLY",
        sentAt: "2026-10-10T15:00:00.000Z",
        followUpState: "SENT",
        followUpSentAt: "2026-10-13T15:00:00.000Z",
        messageBody: "Oi, Carla!",
      }),
      target({
        id: "t4",
        customerId: "dani",
        customerName: "Daniela",
        plannedDate: plus(1),
      }),
    ],
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of [
    overview,
    settingsRead,
    candidates,
    campaigns,
    campaign,
    changeCampaign,
    skipTarget,
    showToast,
  ]) {
    mock.mockReset();
  }
  overview.mockResolvedValue(overviewFixture());
  settingsRead.mockResolvedValue({
    configured: true,
    dailyLimit: 10,
    windowDays: [1, 2, 3, 4, 5, 6],
    windowStart: "09:00",
    windowEnd: "19:00",
    leadDays: 2,
    winbackDays: 60,
    winbackIncentive: null,
    renewalMessage: null,
    winbackMessage: null,
  });
  candidates.mockResolvedValue({
    kind: "RENEWAL",
    timezone: "America/Sao_Paulo",
    today: TODAY,
    weekStart: TODAY,
    weekEnd: plus(6),
    days: null,
    candidates: [{ customerId: "x" }, { customerId: "y" }],
    excluded: {},
  });
  campaigns.mockResolvedValue([]);
  campaign.mockResolvedValue(detailFixture());
});

function renderWithShell(element: React.ReactElement) {
  return render(<ShellConfigProvider>{element}</ShellConfigProvider>);
}

describe("D-210: a situação de cada cliente", () => {
  test("os grupos não se sobrepõem: somados, dão o total", () => {
    const byGroup = groupCounts(overviewFixture().totals);
    expect(byGroup).toEqual({
      booked: 3,
      replied: 2,
      awaiting: 3,
      noReply: 3,
      declined: 1,
      queued: 6,
      notSent: 2,
    });
    expect(Object.values(byGroup).reduce((sum, value) => sum + value)).toBe(20);
  });

  test("a linha diz quando sai, e a pausada diz que espera você", () => {
    const queued = target({ plannedDate: plus(1) });
    expect(timelineLabel(queued, "ACTIVE", TODAY)).toBe("Sai amanhã");
    expect(timelineLabel(target({ plannedDate: TODAY }), "ACTIVE", TODAY)).toBe(
      "Sai hoje",
    );
    expect(timelineLabel(queued, "PAUSED", TODAY)).toBe(
      "Pausada: sairia amanhã",
    );
    expect(
      timelineLabel(target({ plannedDate: plus(-2) }), "ACTIVE", TODAY),
    ).toBe("Sai no próximo horário de envio");
  });

  test("quem não respondeu nem ao lembrete, quem recusou e quem nem recebeu", () => {
    expect(
      timelineLabel(
        target({
          outcome: "NO_REPLY",
          state: "SENT",
          sentAt: "2026-10-10T15:00:00.000Z",
          followUpState: "SENT",
        }),
        "DONE",
        TODAY,
      ),
    ).toMatch(/não respondeu, nem depois do lembrete$/u);
    expect(timelineLabel(target({ outcome: "DECLINED" }), "DONE", TODAY)).toBe(
      "Recusou: fica 90 dias sem convite",
    );
    expect(timelineLabel(target({ outcome: "STOPPED" }), "DONE", TODAY)).toBe(
      "Pediu para não receber mais",
    );
    expect(
      timelineLabel(
        target({ outcome: "NOT_SENT", reason: "HAS_APPOINTMENT" }),
        "DONE",
        TODAY,
      ),
    ).toBe("Não enviada: marcou antes da mensagem");
  });
});

describe("D-210: visão geral do retorno", () => {
  test("o valor que o retorno trouxe, os atalhos, a situação e a fila", async () => {
    const { container } = renderWithShell(<ReturnOverviewScreen />);
    expect(
      await screen.findByRole("heading", { name: "Retorno de clientes" }),
    ).toBeVisible();
    expect(screen.getByText("R$ 360,00")).toBeVisible();
    expect(
      screen.getByText(
        "R$ 240,00 já faturados · R$ 120,00 em horários marcados",
      ),
    ).toBeVisible();
    expect(screen.getByText("25%")).toBeVisible();

    const shortcuts = screen.getByRole("navigation", {
      name: "Atalhos do retorno",
    });
    expect(
      within(shortcuts).getByRole("link", { name: /Chamar clientes/u }),
    ).toHaveAttribute("href", "/retorno/chamar");
    expect(
      await within(shortcuts).findByText("2 clientes no prazo esta semana"),
    ).toBeVisible();
    expect(
      within(shortcuts).getByRole("link", { name: /Aprovações/u }),
    ).toHaveAttribute("href", "/retorno/aprovacoes");
    expect(
      within(shortcuts).getByRole("link", { name: /Configurações/u }),
    ).toHaveAttribute("href", "/retorno/configuracoes");

    const situation = screen.getByRole("region", {
      name: "Como as clientes responderam",
    });
    const legend = within(situation)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(legend).toEqual([
      "Agendaram3",
      "Responderam2",
      "Aguardando resposta3",
      "Sem resposta3",
      "Recusaram1",
    ]);

    const upcoming = screen.getByRole("region", { name: "Próximos envios" });
    expect(
      within(upcoming).getByText(
        "6 mensagens na fila, seg a sáb, das 9h às 19h.",
      ),
    ).toBeVisible();
    expect(within(upcoming).getByText("hoje: 2 mensagens")).toBeInTheDocument();
    expect(
      within(upcoming).getByRole("link", { name: /Helena Costa/u }),
    ).toHaveAttribute("href", "/retorno/aprovacoes/detalhes?id=campaign-1");
    await expectNoA11yViolations(container);
  });

  test("antes da primeira aprovação: como funciona e o atalho para começar", async () => {
    overview.mockResolvedValue(
      overviewFixture({
        campaigns: { total: 0, live: 0 },
        totals: counts(),
        customersBack: 0,
      }),
    );
    renderWithShell(<ReturnOverviewScreen />);
    expect(
      await screen.findByRole("heading", {
        name: "Traga de volta quem já é sua cliente",
      }),
    ).toBeVisible();
    expect(screen.queryByText("O que o retorno trouxe")).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Próximos envios" }),
    ).toBeNull();
    expect(screen.getByText("Nenhuma ainda")).toBeVisible();
  });

  test("erro com tentar de novo", async () => {
    const user = userEvent.setup();
    overview.mockRejectedValueOnce(new Error("offline"));
    renderWithShell(<ReturnOverviewScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o retorno de clientes.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("O que o retorno trouxe")).toBeVisible();
  });
});

describe("D-210: aprovações", () => {
  test("as em andamento vêm primeiro, cada uma com o andamento e o link", async () => {
    campaigns.mockResolvedValue([
      detailFixture({
        id: "done",
        state: "DONE",
        kind: "WINBACK",
        winbackDays: 60,
      }),
      detailFixture(),
    ]);
    const { container } = renderWithShell(<ReturnApprovalsScreen />);
    const live = await screen.findByRole("heading", { name: "Em andamento" });
    expect(live).toBeVisible();
    const links = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.includes("detalhes"));
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/retorno/aprovacoes/detalhes?id=campaign-1",
      "/retorno/aprovacoes/detalhes?id=done",
    ]);
    expect(links[0]).toHaveTextContent("Semana de 19/10");
    expect(links[0]).toHaveTextContent(
      "3 de 4 enviadas · 1 na fila · 1 agendou",
    );
    expect(links[1]).toHaveTextContent("60 dias ou mais sem vir");
    await expectNoA11yViolations(container);
  });

  test("sem nenhuma aprovação: o convite para chamar clientes", async () => {
    renderWithShell(<ReturnApprovalsScreen />);
    expect(
      await screen.findByRole("heading", { name: "Nenhuma aprovação ainda" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Chamar clientes" }),
    ).toHaveAttribute("href", "/retorno/chamar");
  });
});

describe("D-210: andamento de uma aprovação", () => {
  test("cada cliente com a situação e o quando; o filtro mostra só um grupo", async () => {
    const user = userEvent.setup();
    const { container } = renderWithShell(
      <ReturnApprovalScreen id="campaign-1" />,
    );
    expect(
      await screen.findByRole("heading", { name: "Semana de 19/10" }),
    ).toBeVisible();
    expect(screen.getByText("R$ 120,00 em horários marcados")).toBeVisible();

    const adri = screen.getByRole("button", { name: /Adriana Souza/u });
    expect(adri).toHaveTextContent("Agendou");
    expect(adri).toHaveTextContent(
      /Marcou para sáb, 24\/10 às .+ · R\$ 120,00/u,
    );
    expect(screen.getByRole("button", { name: /Daniela/u })).toHaveTextContent(
      "Sai amanhã",
    );

    await user.click(screen.getByRole("button", { name: /^Sem resposta/u }));
    expect(
      screen.getByRole("button", { name: /^Sem resposta/u }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Adriana Souza/u })).toBeNull();
    expect(screen.getByRole("button", { name: /Carla/u })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("abrir a cliente mostra a mensagem que saiu e o link para o perfil", async () => {
    const user = userEvent.setup();
    renderWithShell(<ReturnApprovalScreen id="campaign-1" />);
    const adri = await screen.findByRole("button", { name: /Adriana Souza/u });
    expect(adri).toHaveAttribute("aria-expanded", "false");
    await user.click(adri);
    expect(adri).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Oi, Adri! Sua manutenção completa 15 dias na sexta."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver cliente" })).toHaveAttribute(
      "href",
      "/clientes/detalhes?id=adri",
    );
  });

  test("tira da fila quem ainda não recebeu", async () => {
    const user = userEvent.setup();
    skipTarget.mockResolvedValue(detailFixture());
    renderWithShell(<ReturnApprovalScreen id="campaign-1" />);
    await user.click(await screen.findByRole("button", { name: /Daniela/u }));
    await user.click(screen.getByRole("button", { name: "Tirar da fila" }));
    await waitFor(() =>
      expect(skipTarget).toHaveBeenCalledWith("campaign-1", "t4"),
    );
    expect(showToast).toHaveBeenCalledWith("Daniela saiu da fila.");
  });

  test("pausa os envios e cancela o que falta com confirmação", async () => {
    const user = userEvent.setup();
    changeCampaign.mockImplementation(async (_id: string, action: string) =>
      detailFixture({
        state: action === "pause" ? "PAUSED" : "CANCELLED",
      }),
    );
    renderWithShell(<ReturnApprovalScreen id="campaign-1" />);
    await user.click(
      await screen.findByRole("button", { name: "Pausar envios" }),
    );
    await waitFor(() =>
      expect(changeCampaign).toHaveBeenCalledWith("campaign-1", "pause"),
    );
    expect(showToast).toHaveBeenCalledWith(
      "Envios pausados: nada sai até você retomar.",
    );
    expect(
      await screen.findByRole("button", { name: "Retomar envios" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Daniela/u })).toHaveTextContent(
      "Pausada: sairia amanhã",
    );

    await user.click(
      screen.getByRole("button", { name: "Cancelar o que falta" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Cancelar o que falta?",
    });
    expect(
      within(dialog).getByText(/1 cliente ainda na fila não vai receber/u),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Cancelar envios" }),
    );
    await waitFor(() =>
      expect(changeCampaign).toHaveBeenCalledWith("campaign-1", "cancel"),
    );
  });

  test("aprovação que não existe mais leva de volta à lista", async () => {
    const { BffHttpError } = await import("@/data");
    campaign.mockRejectedValue(
      new BffHttpError({
        code: "NOT_FOUND",
        message: "Return campaign was not found.",
        requestId: "r",
        status: 404,
      }),
    );
    renderWithShell(<ReturnApprovalScreen id="x" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Essa aprovação não existe mais.",
    );
    expect(
      screen.getByRole("link", { name: "Ver aprovações" }),
    ).toHaveAttribute("href", "/retorno/aprovacoes");
  });
});
