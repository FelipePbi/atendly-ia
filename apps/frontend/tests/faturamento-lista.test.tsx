// @vitest-environment jsdom
/**
 * Os atendimentos por trás dos números do Faturamento (D-179).
 *
 * Prova, pelo que a profissional encontra:
 * - "Cancelamentos" e "Faltas" viram botões quando há algum; zero não é botão;
 * - tocar abre a lista do período com quem marcou e quem cancelou (IA, você,
 *   automático, importação), o motivo escrito e o resumo por quem fez; cada
 *   linha leva ao atendimento;
 * - o aviso de "atendimentos concluídos sem valor" é clicável e abre a lista
 *   deles, com o motivo e "Registrar valor";
 * - falha mostra "Tentar novamente", que pede de novo.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type RevenueAppointmentList,
  type RevenueReport,
} from "@/data";
import { RevenueScreen } from "@/features/revenue/RevenueScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { forget } from "@/shared/runtime/sessionMemory";

import { expectNoA11yViolations } from "./support/a11y";

const revenueGet = vi.fn();
const revenueAppointments = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/faturamento",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    revenue: { appointments: revenueAppointments, get: revenueGet },
  }),
}));

const NO_AI: RevenueReport["ai"] = {
  billed: { amount: 0, count: 0 },
  expected: { amount: 0, count: 0 },
  share: null,
  newCustomers: { count: 0, amount: 0, names: [] },
  afterHours: { count: 0, amount: 0 },
  rescheduled: { count: 0, amount: 0 },
  acquired: { customers: 0, amount: 0 },
};

function report(overrides: Partial<RevenueReport> = {}): RevenueReport {
  return {
    period: "month",
    start: "2026-10-01",
    end: "2026-10-31",
    today: "2026-10-16",
    timezone: "America/Sao_Paulo",
    window: {
      from: "2026-10-01T03:00:00.000Z",
      to: "2026-10-16T18:00:00.000Z",
    },
    billed: { amount: 1000, count: 8, unvaluedCount: 1, averageTicket: 125 },
    expected: { amount: 0, count: 0, unvaluedCount: 0 },
    previous: {
      start: "2026-09-01",
      end: "2026-09-16",
      amount: 0,
      count: 0,
      partial: true,
    },
    lost: {
      cancelledCount: 2,
      cancelledAmount: 230,
      noShowCount: 0,
      noShowAmount: 0,
    },
    services: [],
    customers: [],
    weekdays: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      amount: 0,
      count: 0,
    })),
    series: [],
    ai: NO_AI,
    messages: null,
    ...overrides,
  };
}

const CANCELLED: RevenueAppointmentList = {
  kind: "cancelled",
  start: "2026-10-01",
  end: "2026-10-31",
  total: 2,
  items: [
    {
      id: "apt-1",
      date: "2026-10-16",
      time: "15:30",
      customerId: "cus-ana",
      customerName: "Ana Souza",
      services: ["Cílios 5D"],
      amount: 150,
      bookedBy: "AI",
      changedBy: "AI",
      note: "Cliente pediu pelo WhatsApp",
      unvaluedReason: null,
    },
    {
      id: "apt-2",
      date: "2026-10-09",
      time: "09:00",
      customerId: "cus-bia",
      customerName: "Bia",
      services: ["Sobrancelha"],
      amount: 80,
      bookedBy: "USER",
      changedBy: "USER",
      note: null,
      unvaluedReason: null,
    },
  ],
};

const UNVALUED: RevenueAppointmentList = {
  kind: "unvalued",
  start: "2026-10-01",
  end: "2026-10-31",
  total: 1,
  items: [
    {
      id: "apt-3",
      date: "2026-10-07",
      time: "14:00",
      customerId: "cus-carla",
      customerName: "Carla",
      services: ["Mechas"],
      amount: null,
      bookedBy: "USER",
      changedBy: null,
      note: null,
      unvaluedReason: "ON_REQUEST",
    },
  ],
};

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <RevenueScreen />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  forget();
  revenueGet.mockReset().mockResolvedValue(report());
  revenueAppointments.mockReset();
});

describe("faltas e cancelamentos", () => {
  test("cancelamentos abre a lista com quem marcou, quem cancelou e o motivo", async () => {
    const user = userEvent.setup();
    revenueAppointments.mockResolvedValue(CANCELLED);
    renderScreen();

    // Zero faltas: só o número, sem botão.
    expect(
      await screen.findByRole("button", {
        name: "Cancelamentos: 2, R$ 230,00. Ver quais foram",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Faltas/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /^Cancelamentos: 2/ }));
    expect(revenueAppointments).toHaveBeenCalledWith(
      { period: "month", date: "2026-10-01", kind: "cancelled" },
      expect.any(AbortSignal),
    );

    const dialog = await screen.findByRole("dialog", { name: "Cancelamentos" });
    // Abre no body, fora do conteúdo: lá dentro, a animação da página criava
    // camada própria e a barra inferior do celular cobria a folha.
    expect(dialog.closest(".overlay")?.parentElement).toBe(document.body);
    expect(within(dialog).getByText("1 pela IA · 1 por você")).toBeVisible();
    const [first, second] = within(dialog).getAllByRole("link");
    expect(first).toHaveAttribute("href", "/agenda/agendamento?id=apt-1");
    expect(first).toHaveTextContent("sex, 16 out");
    expect(first).toHaveTextContent("Ana Souza");
    expect(first).toHaveTextContent("Cancelado pela IA");
    expect(first).toHaveTextContent("Marcado pela IA");
    expect(first).toHaveTextContent("“Cliente pediu pelo WhatsApp”");
    expect(first).toHaveTextContent("R$ 150,00");
    expect(second).toHaveTextContent("Cancelado por você");
    expect(second).not.toHaveTextContent("Marcado pela IA");
    await expectNoA11yViolations(dialog);

    await user.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("falha mostra 'Tentar novamente', que pede de novo", async () => {
    const user = userEvent.setup();
    revenueAppointments
      .mockRejectedValueOnce(
        new BffHttpError({
          code: "SCHEDULING_UNAVAILABLE",
          message: "Agenda indisponível.",
          requestId: "req-1",
          status: 503,
        }),
      )
      .mockResolvedValue(CANCELLED);
    renderScreen();
    await user.click(
      await screen.findByRole("button", { name: /^Cancelamentos: 2/ }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Cancelamentos" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Agenda indisponível.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Tentar novamente" }),
    );
    expect(await within(dialog).findByText("Ana Souza")).toBeVisible();
    expect(revenueAppointments).toHaveBeenCalledTimes(2);
  });
});

describe("concluídos sem valor", () => {
  test("o aviso é clicável e abre os atendimentos sem valor, com o motivo", async () => {
    const user = userEvent.setup();
    revenueAppointments.mockResolvedValue(UNVALUED);
    renderScreen();

    await user.click(
      await screen.findByRole("button", {
        name: /1 atendimento concluído sem valor.*Ver qual/,
      }),
    );
    expect(revenueAppointments).toHaveBeenCalledWith(
      { period: "month", date: "2026-10-01", kind: "unvalued" },
      expect.any(AbortSignal),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Atendimentos sem valor",
    });
    const link = await within(dialog).findByRole("link");
    expect(link).toHaveAttribute("href", "/agenda/agendamento?id=apt-3");
    expect(link).toHaveTextContent("Carla");
    expect(link).toHaveTextContent("Serviço sob consulta");
    expect(link).toHaveTextContent("Registrar valor");
  });
});
