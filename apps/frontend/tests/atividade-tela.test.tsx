// @vitest-environment jsdom
/**
 * Configurações → Atividade (D-176).
 *
 * A lista mostra quem fez, a frase e o antes/depois; os filtros ficam no
 * menu "Filtros" (D-200) e aplicar pede a lista de novo ao servidor; o sentinela perto do fim pede a
 * próxima leva pelo cursor, sem repetir linha; falha da primeira leva mostra
 * "Tentar novamente"; sem atividade, um vazio que explica; e a primeira carga
 * não pisca esqueleto (D-168).
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { type ActivityEntry, type ActivityQuery, BffHttpError } from "@/data";
import { ActivityScreen } from "@/features/activity/ActivityScreen";
import { forget } from "@/shared/runtime/sessionMemory";

import { expectNoA11yViolations } from "./support/a11y";

const activityList = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/configuracoes/atividade",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ activity: { list: activityList } }),
}));

/** IntersectionObserver de mentira: o teste decide quando o fim aparece. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  disconnect() {
    this.disconnected = true;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  static reachEnd() {
    for (const observer of FakeObserver.instances) {
      if (observer.disconnected) continue;
      observer.callback(
        [...observer.targets].map(
          (target) =>
            ({ isIntersecting: true, target }) as IntersectionObserverEntry,
        ),
        observer as unknown as IntersectionObserver,
      );
    }
  }
}

function row(
  index: number,
  overrides: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    id: `scheduling:${index}`,
    occurredAt: new Date(Date.now() - index * 60_000).toISOString(),
    actor: index % 2 === 0 ? "AI" : "USER",
    area: "CUSTOMERS",
    action: "customer.created",
    entity: {
      type: "customer",
      id: `customer-${index}`,
      label: `Cliente ${index}`,
    },
    changes: [],
    details: null,
    ...overrides,
  };
}

const RESCHEDULED = row(0, {
  actor: "AI",
  area: "AGENDA",
  action: "appointment.rescheduled",
  entity: { type: "appointment", id: "appointment-1", label: "Ana" },
  changes: [
    {
      field: "startsAt",
      before: "2026-10-20T14:00",
      after: "2026-10-20T15:30",
    },
  ],
  details: { customerName: "Ana" },
});

const EDITED = row(1, {
  action: "customer.updated",
  entity: { type: "customer", id: "customer-1", label: "Ana Souza" },
  changes: [{ field: "name", before: "Ana", after: "Ana Souza" }],
});

beforeEach(() => {
  forget();
  activityList.mockReset();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderScreen() {
  return render(<ActivityScreen timeZone="America/Sao_Paulo" />);
}

describe("tela de atividade", () => {
  test("mostra quem fez, a frase e o antes e o depois", async () => {
    activityList.mockResolvedValue({
      items: [RESCHEDULED, EDITED],
      nextCursor: null,
    });
    const { container } = renderScreen();

    const rescheduled = await screen.findByRole("link", {
      name: "A IA remarcou Ana de 14:00 para 15:30 em 20/10",
    });
    expect(rescheduled).toHaveAttribute(
      "href",
      "/agenda/agendamento?id=appointment-1&voltar=%2Fconfiguracoes%2Fatividade",
    );
    const edited = screen
      .getByRole("link", {
        name: "Você alterou o cadastro de Ana Souza",
      })
      .closest("li") as HTMLElement;
    const label = within(edited).getByText("Nome");
    expect(label).toBeVisible();
    expect(label.nextElementSibling).toHaveTextContent(
      /^de Ana\s*→\s*para Ana Souza$/u,
    );
    expect(screen.getByRole("heading", { name: "Hoje" })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("os filtros ficam no menu Filtros e só valem ao aplicar", async () => {
    activityList.mockResolvedValue({ items: [EDITED], nextCursor: null });
    const user = userEvent.setup();
    const { container } = renderScreen();
    await screen.findByText("Você alterou o cadastro de Ana Souza");
    expect(activityList).toHaveBeenLastCalledWith(
      { limit: 30 },
      expect.any(AbortSignal),
    );
    // Só a busca fica à vista; os selects antigos não existem mais.
    expect(screen.queryByLabelText("Quem fez")).toBeNull();
    const button = screen.getByRole("button", { name: "Filtros" });

    await user.click(button);
    const dialog = screen.getByRole("dialog", { name: "Filtros" });
    expect(
      within(dialog).getByRole("group", { name: "Período" }),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("radio", { name: "Só a IA" }));
    await user.click(within(dialog).getByRole("radio", { name: "Agenda" }));
    await user.click(
      within(dialog).getByRole("radio", { name: "Cancelou ou removeu" }),
    );
    // Nada vai ao servidor antes de aplicar.
    expect(activityList).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(document.body);

    await user.click(within(dialog).getByRole("button", { name: "Aplicar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(activityList).toHaveBeenLastCalledWith(
        { actor: "AI", areas: ["AGENDA"], kinds: ["REMOVED"], limit: 30 },
        expect.any(AbortSignal),
      ),
    );
    // O botão conta os filtros ligados e o foco volta para ele.
    const counted = screen.getByRole("button", { name: "Filtros, 3 ativos" });
    expect(counted).toHaveFocus();
    expect(within(counted).getByText("3")).toBeVisible();
    const chips = screen.getByRole("list", { name: "Filtros ativos" });
    expect(within(chips).getByText("Só a IA")).toBeVisible();
    expect(within(chips).getByText("Agenda")).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(counted);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("radio", {
        name: "Últimos 7 dias",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => {
      const query = activityList.mock.lastCall?.[0] as ActivityQuery;
      expect(query.from).toBeDefined();
      // Início do dia do negócio, seis dias atrás: no máximo sete dias.
      const age = Date.now() - Date.parse(query.from!);
      expect(age).toBeGreaterThan(6 * 86_400_000);
      expect(age).toBeLessThanOrEqual(7 * 86_400_000);
    });

    await user.type(screen.getByLabelText("Buscar"), "Ana");
    await waitFor(() =>
      expect((activityList.mock.lastCall?.[0] as ActivityQuery).q).toBe("Ana"),
    );
  });

  test("fechar descarta o rascunho; chip remove um filtro e Limpar tira todos", async () => {
    activityList.mockResolvedValue({ items: [EDITED], nextCursor: null });
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Você alterou o cadastro de Ana Souza");

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("radio", { name: "Só você" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Filtros" })).toBeVisible();
    expect(activityList).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    // O rascunho descartado não volta.
    expect(screen.getByRole("radio", { name: "Você e a IA" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Só você" }));
    await user.click(screen.getByRole("radio", { name: "Clientes" }));
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() =>
      expect(activityList).toHaveBeenLastCalledWith(
        { actor: "USER", areas: ["CUSTOMERS"], limit: 30 },
        expect.any(AbortSignal),
      ),
    );

    await user.click(
      screen.getByRole("button", { name: "Remover filtro: Só você" }),
    );
    await waitFor(() =>
      expect(activityList).toHaveBeenLastCalledWith(
        { areas: ["CUSTOMERS"], limit: 30 },
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Filtros, 1 ativo" }),
    ).toBeVisible();

    // "Limpar filtros" no menu zera o rascunho; aplicar volta para tudo.
    await user.click(screen.getByRole("button", { name: "Filtros, 1 ativo" }));
    const dialog = screen.getByRole("dialog", { name: "Filtros" });
    await user.click(
      within(dialog).getByRole("button", { name: "Limpar filtros" }),
    );
    expect(
      within(dialog).getByRole("radio", { name: "Todas as áreas" }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("button", { name: "Limpar filtros" }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Aplicar" }));
    await waitFor(() =>
      expect(activityList).toHaveBeenLastCalledWith(
        { limit: 30 },
        expect.any(AbortSignal),
      ),
    );
    expect(screen.queryByRole("list", { name: "Filtros ativos" })).toBeNull();
  });

  test("cor do serviço com círculo e contato com telefone formatado", async () => {
    const color = row(2, {
      actor: "USER",
      area: "SERVICES",
      action: "service.updated",
      entity: { type: "service", id: "service-1", label: "Teste alérgico" },
      changes: [{ field: "color", before: "ROSE", after: "#d479ff" }],
    });
    const ignored = row(3, {
      actor: "USER",
      area: "CONVERSATIONS",
      action: "conversation.contact_ignored",
      entity: { type: "contact", id: "contact-1", label: "555596936463" },
    });
    activityList.mockResolvedValue({
      items: [color, ignored],
      nextCursor: null,
    });
    const { container } = renderScreen();

    const sentence = await screen.findByText(
      "Você alterou o serviço Teste alérgico",
    );
    const item = sentence.closest("li") as HTMLElement;
    const label = within(item).getByText("Cor");
    expect(label.nextElementSibling).toHaveTextContent(
      /^de Rosa-antigo\s*→\s*para #D479FF$/u,
    );
    const swatches = item.querySelectorAll(".activity-swatch");
    expect(swatches).toHaveLength(2);
    expect(swatches[0]).toHaveAttribute("data-color", "ROSE");
    expect(swatches[1]).toHaveAttribute("data-color", "CUSTOM");
    expect(within(item).getByText("Serviços")).toBeVisible();
    expect(
      screen.getByText("Você pediu para a IA não atender +55 55 99693-6463"),
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("carrega a próxima leva pelo cursor, sem repetir linha", async () => {
    const first = Array.from({ length: 30 }, (_, index) => row(index + 10));
    const second = [row(39), row(40), row(41)];
    activityList.mockImplementation(async (query: ActivityQuery) =>
      query.cursor === "cursor-2"
        ? { items: second, nextCursor: null }
        : { items: first, nextCursor: "cursor-2" },
    );
    renderScreen();
    await screen.findByText("Você cadastrou Cliente 11");
    expect(screen.queryByText("A IA cadastrou Cliente 40")).toBeNull();

    act(() => FakeObserver.reachEnd());

    await screen.findByText("A IA cadastrou Cliente 40");
    expect(activityList).toHaveBeenLastCalledWith(
      { cursor: "cursor-2", limit: 30 },
      expect.any(AbortSignal),
    );
    // A linha 39 veio nas duas levas e aparece uma vez só.
    expect(screen.getAllByText("Você cadastrou Cliente 39")).toHaveLength(1);
    expect(screen.getByText("Fim da lista")).toBeVisible();
  });

  test("falha da primeira leva oferece Tentar novamente", async () => {
    activityList
      .mockRejectedValueOnce(
        new BffHttpError({
          code: "UPSTREAM_ERROR",
          message: "falhou",
          requestId: "req-1",
          status: 502,
        }),
      )
      .mockResolvedValueOnce({ items: [EDITED], nextCursor: null });
    const user = userEvent.setup();
    renderScreen();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Atividade indisponível")).toBeVisible();
    await user.click(
      within(alert).getByRole("button", { name: "Tentar novamente" }),
    );
    await screen.findByText("Você alterou o cadastro de Ana Souza");
  });

  test("sem atividade, um vazio que explica; com filtro, outro", async () => {
    activityList.mockResolvedValue({ items: [], nextCursor: null });
    const user = userEvent.setup();
    renderScreen();
    expect(await screen.findByText("Ainda não há atividade")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("radio", { name: "Só a IA" }));
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(
      await screen.findByText("Nenhuma atividade encontrada"),
    ).toBeVisible();
  });

  test("carga rápida não pisca o A animado; demorada mostra", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolve!: (value: unknown) => void;
    activityList.mockReturnValue(new Promise((done) => (resolve = done)));
    renderScreen();
    expect(screen.queryByLabelText("Carregando atividade")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(document.querySelector(".brand-loader-screen")).not.toBeNull();
    await act(async () => resolve({ items: [EDITED], nextCursor: null }));
    expect(document.querySelector(".brand-loader-screen")).toBeNull();
    expect(
      screen.getByText("Você alterou o cadastro de Ana Souza"),
    ).toBeVisible();
  });
});
