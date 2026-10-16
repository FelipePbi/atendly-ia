// @vitest-environment jsdom
/**
 * Goal147 (WU-01) — a conversa do perfil é de quem escreve: o cliente sem
 * telefone próprio com responsável CONFIRMED (`dependent`) abre a conversa do
 * responsável ("Conversa com Maria"); os outros perfis abrem a própria
 * ("Conversa"). O pedido é `conversations.list({ customerId: <dono>, limit:
 * 1 })`, um por dono, e só sai depois de o perfil carregar. "Ver <responsável>"
 * tem nome acessível que começa pelo texto visível.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { CalendarState, CustomerDetail } from "@/data";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const customersGet = vi.fn();
const customersListMemory = vi.fn();
const customersList = vi.fn();
const customersConfirmPrimaryGuardian = vi.fn();
const customersClearPrimaryGuardian = vi.fn();
const customersSetPrimaryGuardian = vi.fn();
const calendarGetCalendar = vi.fn();
const calendarListAppointments = vi.fn();
const conversationsList = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getCalendar: calendarGetCalendar,
      listAppointments: calendarListAppointments,
    },
    conversations: { list: conversationsList },
    customers: {
      clearPrimaryGuardian: customersClearPrimaryGuardian,
      confirmPrimaryGuardian: customersConfirmPrimaryGuardian,
      get: customersGet,
      list: customersList,
      listMemory: customersListMemory,
      setPrimaryGuardian: customersSetPrimaryGuardian,
    },
  }),
}));

type Guardian = NonNullable<CustomerDetail["primaryGuardian"]>;

function guardianFixture(overrides: Partial<Guardian> = {}): Guardian {
  return {
    confirmedAt: "2026-08-12T15:00:00.000Z",
    confirmedBy: "PROFESSIONAL",
    confirmedByActor: null,
    guardian: {
      id: "maria-1",
      name: "Maria Souza",
      phone: "5511987651100",
    },
    id: "rel-1",
    proposedAt: "2026-08-12T14:00:00.000Z",
    proposedBy: "PROFESSIONAL",
    proposedByActor: null,
    status: "CONFIRMED",
    ...overrides,
  };
}

function proposedGuardian(): Guardian {
  return guardianFixture({
    confirmedAt: null,
    confirmedBy: null,
    status: "PROPOSED",
  });
}

function guardianOf(overrides: Partial<Guardian["guardian"]> = {}): Guardian {
  const base = guardianFixture();
  return { ...base, guardian: { ...base.guardian, ...overrides } };
}

function detailFixture(
  overrides: Partial<CustomerDetail> = {},
): CustomerDetail {
  return {
    appointmentStats: {
      averageIntervalDays: 28,
      cancelled: 0,
      completed: 2,
      firstAppointmentDate: "2026-08-02",
      noShows: 0,
    },
    createdAt: "2026-08-02T10:00:00.000Z",
    id: "pedro-1",
    lastAppointment: null,
    name: "Pedro Souza",
    nextAppointment: null,
    notes: [],
    phone: null,
    primaryGuardian: guardianFixture(),
    tags: [],
    ...overrides,
  };
}

function calendarFixture(): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: true,
    },
    integration: null,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  };
}

async function renderProfile(detail: CustomerDetail = detailFixture()) {
  customersGet.mockResolvedValue(detail);
  calendarGetCalendar.mockResolvedValue(calendarFixture());
  const view = render(
    <ShellConfigProvider>
      <ProductCustomersScreen customerId={detail.id} scenario="detail" />
    </ShellConfigProvider>,
  );
  await screen.findByRole("heading", {
    name: detail.name ?? "Cliente sem nome",
  });
  return view;
}

/** Cada dono tem a sua conversa: o id da conversa diz de quem foi o pedido. */
function conversationsByOwner(byOwner: Record<string, string>) {
  conversationsList.mockImplementation(
    async (query: { customerId?: string }) =>
      query.customerId && byOwner[query.customerId]
        ? [{ id: byOwner[query.customerId] }]
        : [],
  );
}

function requestedOwners(): Array<string | undefined> {
  return conversationsList.mock.calls.map(
    (call) => (call[0] as { customerId?: string }).customerId,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const CARD_NAME = "Quem agenda por este cliente";

function card() {
  return screen.getByRole("region", { name: CARD_NAME });
}

beforeEach(() => {
  for (const mock of [
    customersGet,
    customersListMemory,
    customersList,
    customersConfirmPrimaryGuardian,
    customersClearPrimaryGuardian,
    customersSetPrimaryGuardian,
    calendarGetCalendar,
    calendarListAppointments,
    conversationsList,
  ])
    mock.mockReset();
  calendarListAppointments.mockResolvedValue([]);
  customersListMemory.mockResolvedValue([]);
  customersList.mockResolvedValue({ items: [], total: 0 });
  conversationsList.mockResolvedValue([]);
  window.history.pushState({}, "", "/clientes/detalhes?id=pedro-1");
});

/** O responsável principal abre pelo menu ⋯ do perfil, numa janela (2026-10-16). */
async function openGuardianPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Mais ações do cliente" }),
  );
  await user.click(
    screen.getByRole("menuitem", { name: "Responsável principal" }),
  );
  return screen.getByRole("dialog", { name: "Responsável principal" });
}

describe("De quem é a conversa do perfil (escolha 2)", () => {
  test("o dependente pede só pelo id do responsável, nunca pelo próprio", async () => {
    conversationsByOwner({ "maria-1": "conv-maria", "pedro-1": "conv-pedro" });
    await renderProfile();

    await screen.findByRole("link", { name: "Conversa com Maria" });
    expect(conversationsList).toHaveBeenCalledWith(
      { customerId: "maria-1", limit: 1 },
      expect.anything(),
    );
    expect(requestedOwners()).not.toContain("pedro-1");
    expect(conversationsList).toHaveBeenCalledTimes(1);
  });

  test("o dependente não mostra uma conversa vinculada a ele mesmo", async () => {
    conversationsByOwner({ "pedro-1": "conv-pedro" });
    await renderProfile();

    await waitFor(() => expect(conversationsList).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: /Agendar/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /^Conversa/ })).toBeNull();
    expect(requestedOwners()).toEqual(["maria-1"]);
  });

  test("o pedido só sai depois de o perfil carregar", async () => {
    const detail = deferred<CustomerDetail>();
    customersGet.mockReturnValue(detail.promise);
    calendarGetCalendar.mockResolvedValue(calendarFixture());
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="pedro-1" scenario="detail" />
      </ShellConfigProvider>,
    );

    await waitFor(() => expect(customersGet).toHaveBeenCalled());
    expect(conversationsList).not.toHaveBeenCalled();

    detail.resolve(detailFixture());
    await waitFor(() => expect(conversationsList).toHaveBeenCalledTimes(1));
    expect(requestedOwners()).toEqual(["maria-1"]);
  });

  test("cliente sem responsável pede pelo próprio id", async () => {
    conversationsByOwner({ "pedro-1": "conv-pedro" });
    await renderProfile(
      detailFixture({ phone: "11991234567", primaryGuardian: null }),
    );

    await screen.findByRole("link", { name: "Conversa" });
    expect(requestedOwners()).toEqual(["pedro-1"]);
  });

  test("cliente com telefone próprio e responsável CONFIRMED pede pelo próprio id", async () => {
    conversationsByOwner({ "maria-1": "conv-maria", "pedro-1": "conv-pedro" });
    await renderProfile(detailFixture({ phone: "11991234567" }));

    const link = await screen.findByRole("link", { name: "Conversa" });
    expect(link).toHaveAttribute("href", "/conversas/conv-pedro");
    expect(requestedOwners()).toEqual(["pedro-1"]);
  });

  test("com responsável PROPOSED e sem telefone, pede pelo próprio id", async () => {
    conversationsByOwner({ "maria-1": "conv-maria", "pedro-1": "conv-pedro" });
    await renderProfile(detailFixture({ primaryGuardian: proposedGuardian() }));

    const link = await screen.findByRole("link", { name: "Conversa" });
    expect(link).toHaveAttribute("href", "/conversas/conv-pedro");
    expect(requestedOwners()).toEqual(["pedro-1"]);
  });
});

describe("Acesso rápido ao chat ao lado de Agendar (2026-10-16)", () => {
  test("sem conversa, o botão fica desabilitado em vez de sumir, nas três abas", async () => {
    const user = userEvent.setup();
    conversationsList.mockResolvedValue([]);
    await renderProfile(detailFixture({ primaryGuardian: null }));

    const disabled = () => screen.getByRole("button", { name: /^Conversa/ });
    await waitFor(() => expect(disabled()).toBeDisabled());
    expect(screen.getByRole("link", { name: /Agendar/ })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Atendimentos" }));
    expect(disabled()).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "Notas" }));
    expect(disabled()).toBeDisabled();
  });
});

describe("O rótulo e o destino (escolha 3)", () => {
  test("dependente: 'Conversa com Maria' leva para a conversa da Maria", async () => {
    conversationsByOwner({ "maria-1": "conv-9" });
    await renderProfile();

    const link = await screen.findByRole("link", {
      name: "Conversa com Maria",
    });
    expect(link).toHaveAttribute("href", "/conversas/conv-9");
  });

  test("o id da conversa vai codificado na URL", async () => {
    conversationsByOwner({ "maria-1": "a b&c" });
    await renderProfile();

    expect(
      await screen.findByRole("link", { name: "Conversa com Maria" }),
    ).toHaveAttribute("href", "/conversas/a%20b%26c");
  });

  test("responsável sem nome: 'Conversa com o responsável'", async () => {
    conversationsByOwner({ "maria-1": "conv-9" });
    await renderProfile(
      detailFixture({ primaryGuardian: guardianOf({ name: null }) }),
    );

    const link = await screen.findByRole("link", {
      name: "Conversa com o responsável",
    });
    expect(link).toHaveAttribute("href", "/conversas/conv-9");
  });

  test("o rótulo usa a primeira palavra do nome do responsável", async () => {
    conversationsByOwner({ "maria-1": "conv-9" });
    await renderProfile(
      detailFixture({
        primaryGuardian: guardianOf({ name: "  Maria  das Dores Souza " }),
      }),
    );

    expect(
      await screen.findByRole("link", { name: "Conversa com Maria" }),
    ).toBeVisible();
  });

  test("dono = cliente: 'Conversa', como antes", async () => {
    conversationsByOwner({ "pedro-1": "conv-pedro" });
    await renderProfile(
      detailFixture({ phone: "11991234567", primaryGuardian: null }),
    );

    const link = await screen.findByRole("link", { name: "Conversa" });
    expect(link).toHaveTextContent(/^Conversa$/);
    expect(link).toHaveAttribute("href", "/conversas/conv-pedro");
  });

  test("o nome acessível é o texto visível, sem aria-label", async () => {
    conversationsByOwner({ "maria-1": "conv-9" });
    await renderProfile();

    const link = await screen.findByRole("link", {
      name: "Conversa com Maria",
    });
    expect(link).not.toHaveAttribute("aria-label");
    expect(link).toHaveTextContent("Conversa com Maria");
  });

  test("sem conversa, nenhuma ação 'Conversa'; 'Agendar' continua", async () => {
    await renderProfile();

    await waitFor(() => expect(conversationsList).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /^Conversa/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Agendar/ })).toBeVisible();
  });

  test("com erro no pedido, nenhuma ação 'Conversa'", async () => {
    conversationsList.mockRejectedValue(new Error("falhou"));
    await renderProfile();

    await waitFor(() => expect(conversationsList).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /^Conversa/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Agendar/ })).toBeVisible();
  });

  test("as ações não têm violação de acessibilidade", async () => {
    conversationsByOwner({ "maria-1": "conv-9" });
    const { container } = await renderProfile();
    await screen.findByRole("link", { name: "Conversa com Maria" });

    await expectNoA11yViolations(container);
  });
});

describe("Trocar o dono da conversa (escolha 2)", () => {
  test("confirmar pelo painel troca o pedido para o responsável", async () => {
    const user = userEvent.setup();
    conversationsByOwner({ "maria-1": "conv-maria", "pedro-1": "conv-pedro" });
    customersConfirmPrimaryGuardian.mockResolvedValue(guardianFixture());
    await renderProfile(detailFixture({ primaryGuardian: proposedGuardian() }));
    expect(
      await screen.findByRole("link", { name: "Conversa" }),
    ).toHaveAttribute("href", "/conversas/conv-pedro");

    await openGuardianPanel(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    const link = await screen.findByRole("link", {
      name: "Conversa com Maria",
    });
    expect(link).toHaveAttribute("href", "/conversas/conv-maria");
    expect(requestedOwners()).toEqual(["pedro-1", "maria-1"]);
    expect(screen.queryByRole("link", { name: "Conversa" })).toBeNull();
  });

  test("remover pelo painel volta ao pedido pelo próprio cliente", async () => {
    const user = userEvent.setup();
    conversationsByOwner({ "maria-1": "conv-maria", "pedro-1": "conv-pedro" });
    customersClearPrimaryGuardian.mockResolvedValue({ deleted: true });
    await renderProfile();
    await screen.findByRole("link", { name: "Conversa com Maria" });

    await openGuardianPanel(user);
    await user.click(screen.getByRole("button", { name: "Remover" }));

    const link = await screen.findByRole("link", { name: "Conversa" });
    expect(link).toHaveAttribute("href", "/conversas/conv-pedro");
    expect(requestedOwners()).toEqual(["maria-1", "pedro-1"]);
    expect(
      screen.queryByRole("link", { name: "Conversa com Maria" }),
    ).toBeNull();
  });

  test("a ação some até o pedido do novo dono responder", async () => {
    const user = userEvent.setup();
    const next = deferred<Array<{ id: string }>>();
    conversationsList.mockImplementation(
      async (query: { customerId?: string }) =>
        query.customerId === "maria-1" ? [{ id: "conv-maria" }] : next.promise,
    );
    customersClearPrimaryGuardian.mockResolvedValue({ deleted: true });
    await renderProfile();
    await screen.findByRole("link", { name: "Conversa com Maria" });

    await openGuardianPanel(user);
    await user.click(screen.getByRole("button", { name: "Remover" }));

    await waitFor(() => expect(requestedOwners()).toContain("pedro-1"));
    expect(screen.queryByRole("link", { name: /^Conversa/ })).toBeNull();

    next.resolve([{ id: "conv-pedro" }]);
    expect(
      await screen.findByRole("link", { name: "Conversa" }),
    ).toHaveAttribute("href", "/conversas/conv-pedro");
  });

  test("o resultado atrasado do responsável não aparece depois de remover a relação", async () => {
    const user = userEvent.setup();
    const late = deferred<Array<{ id: string }>>();
    conversationsList.mockImplementation(
      async (query: { customerId?: string }) =>
        query.customerId === "maria-1" ? late.promise : [],
    );
    customersClearPrimaryGuardian.mockResolvedValue({ deleted: true });
    await renderProfile();
    await waitFor(() => expect(requestedOwners()).toEqual(["maria-1"]));

    await openGuardianPanel(user);
    await user.click(screen.getByRole("button", { name: "Remover" }));
    await waitFor(() =>
      expect(requestedOwners()).toEqual(["maria-1", "pedro-1"]),
    );
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: CARD_NAME })).toBeNull(),
    );

    late.resolve([{ id: "conv-maria" }]);
    await late.promise;
    await new Promise((done) => setTimeout(done, 20));

    expect(screen.queryByRole("link", { name: /^Conversa/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Agendar/ })).toBeVisible();
  });

  test("o resultado atrasado do próprio cliente não aparece depois de confirmar o responsável", async () => {
    const user = userEvent.setup();
    const late = deferred<Array<{ id: string }>>();
    conversationsList.mockImplementation(
      async (query: { customerId?: string }) =>
        query.customerId === "pedro-1" ? late.promise : [],
    );
    customersConfirmPrimaryGuardian.mockResolvedValue(guardianFixture());
    await renderProfile(detailFixture({ primaryGuardian: proposedGuardian() }));
    await waitFor(() => expect(requestedOwners()).toEqual(["pedro-1"]));

    await openGuardianPanel(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(card()).toBeVisible());
    await waitFor(() =>
      expect(requestedOwners()).toEqual(["pedro-1", "maria-1"]),
    );

    late.resolve([{ id: "conv-pedro" }]);
    await late.promise;
    await new Promise((done) => setTimeout(done, 20));

    expect(screen.queryByRole("link", { name: /^Conversa/ })).toBeNull();
  });
});

describe("'Ver <responsável>' (escolha 5)", () => {
  test("com nome: o nome acessível é 'Ver <nome completo>', que contém o texto visível", async () => {
    await renderProfile();

    const link = within(card()).getByRole("link", { name: "Ver Maria Souza" });
    expect(link).toHaveAttribute("aria-label", "Ver Maria Souza");
    expect(link).toHaveTextContent("Ver Maria");
    expect(link).toHaveAttribute("href", "/clientes/detalhes?id=maria-1");
    expect("Ver Maria Souza".startsWith(link.textContent ?? "")).toBe(true);
  });

  test("sem nome: 'Ver responsável', sem aria-label, mesmo destino", async () => {
    await renderProfile(
      detailFixture({ primaryGuardian: guardianOf({ name: null }) }),
    );

    const link = within(card()).getByRole("link", { name: "Ver responsável" });
    expect(link).not.toHaveAttribute("aria-label");
    expect(link).toHaveTextContent("Ver responsável");
    expect(link).toHaveAttribute("href", "/clientes/detalhes?id=maria-1");
  });

  test("o nome 'Ver perfil de ...' não existe mais", async () => {
    await renderProfile();

    expect(screen.queryByRole("link", { name: /Ver perfil/ })).toBeNull();
  });
});

describe("O que não muda", () => {
  test("'Agendar', as abas, o cartão e a nota seguem", async () => {
    conversationsByOwner({ "maria-1": "conv-9" });
    await renderProfile();
    await screen.findByRole("link", { name: "Conversa com Maria" });

    expect(screen.getByRole("link", { name: /Agendar/ })).toHaveAttribute(
      "href",
      "/agenda/novo?customerId=pedro-1",
    );
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Resumo",
      "Atendimentos",
      "Notas",
    ]);
    expect(
      within(card()).getByText("Maria Souza agenda para Pedro"),
    ).toBeVisible();
    expect(
      within(card()).getByText(/As mensagens chegam pelo WhatsApp de Maria/),
    ).toBeVisible();
  });
});
