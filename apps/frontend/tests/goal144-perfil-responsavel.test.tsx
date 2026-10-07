// @vitest-environment jsdom
/**
 * Goal144 (WU-01) — perfil de quem é agendado por um responsável (quadro CL8):
 * o cartão "<responsável> agenda para <cliente>", a nota do que a IA faz
 * quando o responsável escreve e a linha "Sem telefone próprio" sob o nome.
 * Tudo lê o mesmo `customer.primaryGuardian` que o painel "Responsável
 * principal" já atualiza; o cartão só existe com a relação CONFIRMED, só no
 * Resumo.
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

function calendarFixture(
  overrides: Partial<CalendarState> = {},
): CalendarState {
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
    ...overrides,
  };
}

function guardianOf(
  overrides: Partial<Guardian["guardian"]> = {},
  relation: Partial<Guardian> = {},
): Guardian {
  const base = guardianFixture(relation);
  return { ...base, guardian: { ...base.guardian, ...overrides } };
}

async function renderProfile(
  detail: CustomerDetail = detailFixture(),
  calendar: CalendarState = calendarFixture(),
) {
  customersGet.mockResolvedValue(detail);
  calendarGetCalendar.mockResolvedValue(calendar);
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

describe("O cartão do responsável (escolhas 2 e 3)", () => {
  test("aparece com a relação CONFIRMED, entre a identidade e as ações", async () => {
    await renderProfile();

    expect(card()).toBeVisible();
    const hero = card().parentElement as HTMLElement;
    const identity = screen.getByRole("heading", { name: "Pedro Souza" });
    const agendar = screen.getByRole("link", { name: /Agendar/ });
    expect(
      identity.compareDocumentPosition(card()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      card().compareDocumentPosition(agendar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(hero).toContainElement(agendar);
  });

  test("não aparece com a relação PROPOSED", async () => {
    await renderProfile(
      detailFixture({
        primaryGuardian: guardianFixture({
          confirmedAt: null,
          confirmedBy: null,
          status: "PROPOSED",
        }),
      }),
    );

    expect(screen.queryByRole("region", { name: CARD_NAME })).toBeNull();
    expect(screen.queryByText(/agenda para/)).toBeNull();
  });

  test("não aparece sem responsável", async () => {
    await renderProfile(detailFixture({ primaryGuardian: null }));

    expect(screen.queryByRole("region", { name: CARD_NAME })).toBeNull();
  });

  test("só no Resumo: Atendimentos e Notas não mostram o cartão", async () => {
    const user = userEvent.setup();
    await renderProfile();
    expect(card()).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Atendimentos" }));
    expect(screen.queryByRole("region", { name: CARD_NAME })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Notas" }));
    expect(screen.queryByRole("region", { name: CARD_NAME })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Resumo" }));
    expect(card()).toBeVisible();
  });

  test("primeira linha: nome do responsável e primeiro nome do cliente", async () => {
    await renderProfile();

    expect(
      within(card()).getByText("Maria Souza agenda para Pedro"),
    ).toBeVisible();
  });

  test("primeira linha sem nome do responsável usa o telefone formatado", async () => {
    await renderProfile(
      detailFixture({ primaryGuardian: guardianOf({ name: null }) }),
    );

    expect(
      within(card()).getByText("+55 11 98765-1100 agenda para Pedro"),
    ).toBeVisible();
  });

  test("primeira linha sem nome nem telefone do responsável", async () => {
    await renderProfile(
      detailFixture({
        primaryGuardian: guardianOf({ name: null, phone: null }),
      }),
    );

    expect(
      within(card()).getByText("Responsável sem nome agenda para Pedro"),
    ).toBeVisible();
  });

  test("primeira linha sem nome do cliente diz 'este cliente'", async () => {
    await renderProfile(detailFixture({ name: null }));

    expect(
      within(card()).getByText("Maria Souza agenda para este cliente"),
    ).toBeVisible();
  });

  test("o avatar do cartão traz as iniciais do responsável", async () => {
    await renderProfile();

    expect(within(card()).getByText("MS")).toBeInTheDocument();
  });

  test("não inventa tipo de relação", async () => {
    await renderProfile();

    expect(card().textContent).not.toMatch(/mãe|pai|filh/i);
    expect(screen.queryByText(/mãe/i)).toBeNull();
  });
});

describe("A segunda linha do cartão", () => {
  test("telefone formatado e 'confirmado por você em <dd/mm>' para PROFESSIONAL", async () => {
    await renderProfile();

    expect(
      within(card()).getByText(
        "+55 11 98765-1100 · confirmado por você em 12/08",
      ),
    ).toBeVisible();
  });

  test.each([
    ["PROFESSIONAL", "confirmado por você em 12/08"],
    ["CUSTOMER", "confirmado pelo cliente em 12/08"],
    ["AI", "confirmado pela IA em 12/08"],
    [null, "confirmado em 12/08"],
  ] as const)("confirmedBy %s dá '%s'", async (confirmedBy, text) => {
    await renderProfile(
      detailFixture({
        primaryGuardian: guardianFixture({ confirmedBy }),
      }),
    );

    expect(
      within(card()).getByText(`+55 11 98765-1100 · ${text}`),
    ).toBeVisible();
  });

  test.each([
    ["PROFESSIONAL", "confirmado por você"],
    ["CUSTOMER", "confirmado pelo cliente"],
    ["AI", "confirmado pela IA"],
    [null, "confirmado"],
  ] as const)(
    "sem data, confirmedBy %s dá '%s' sem ' em <dd/mm>'",
    async (confirmedBy, text) => {
      await renderProfile(
        detailFixture({
          primaryGuardian: guardianFixture({ confirmedAt: null, confirmedBy }),
        }),
      );

      expect(
        within(card()).getByText(`+55 11 98765-1100 · ${text}`),
      ).toBeVisible();
    },
  );

  test("sem telefone do responsável, só quem confirmou e quando", async () => {
    await renderProfile(
      detailFixture({ primaryGuardian: guardianOf({ phone: null }) }),
    );

    expect(
      within(card()).getByText("confirmado por você em 12/08"),
    ).toBeVisible();
  });

  test("telefone que o formatador não reconhece sai como veio", async () => {
    await renderProfile(
      detailFixture({ primaryGuardian: guardianOf({ phone: "12345" }) }),
    );

    expect(
      within(card()).getByText("12345 · confirmado por você em 12/08"),
    ).toBeVisible();
  });

  test("a data vem no fuso do negócio: o mesmo instante muda de dia entre São Paulo e Auckland", async () => {
    // 2026-08-12T02:30Z: 11/08 às 23:30 em São Paulo, 12/08 às 14:30 em Auckland.
    const detail = detailFixture({
      primaryGuardian: guardianFixture({
        confirmedAt: "2026-08-12T02:30:00.000Z",
      }),
    });

    const first = await renderProfile(detail, calendarFixture());
    expect(
      within(card()).getByText(/confirmado por você em 11\/08$/),
    ).toBeVisible();
    first.unmount();

    await renderProfile(
      detail,
      calendarFixture({ timezone: "Pacific/Auckland" }),
    );
    expect(
      within(card()).getByText(/confirmado por você em 12\/08$/),
    ).toBeVisible();
  });
});

describe("'Ver <primeiro nome>'", () => {
  test("é um link para o perfil do responsável com o nome acessível pedido", async () => {
    await renderProfile();

    const link = within(card()).getByRole("link", {
      name: "Ver Maria Souza",
    });
    expect(link).toHaveAttribute("href", "/clientes/detalhes?id=maria-1");
    expect(link).toHaveTextContent("Ver Maria");
  });

  test("o id do responsável vai codificado na URL", async () => {
    await renderProfile(
      detailFixture({ primaryGuardian: guardianOf({ id: "a b&c" }) }),
    );

    expect(
      within(card()).getByRole("link", { name: "Ver Maria Souza" }),
    ).toHaveAttribute("href", "/clientes/detalhes?id=a%20b%26c");
  });

  test("sem nome do responsável: 'Ver responsável'", async () => {
    await renderProfile(
      detailFixture({ primaryGuardian: guardianOf({ name: null }) }),
    );

    expect(
      within(card()).getByRole("link", { name: "Ver responsável" }),
    ).toHaveTextContent("Ver responsável");
  });

  test("o cartão não tem violação de acessibilidade", async () => {
    const { container } = await renderProfile();

    await expectNoA11yViolations(container);
  });
});

describe("A nota do que a IA faz (escolha 4)", () => {
  const NOTE =
    "As mensagens chegam pelo WhatsApp de Maria. Quando Maria escrever, a IA pode perguntar “Seria para Pedro novamente?” em vez de assumir.";

  test("cliente sem telefone e responsável com telefone: o texto exato, com a pergunta em itálico", async () => {
    await renderProfile();

    const note = screen.getByText(/As mensagens chegam pelo WhatsApp/);
    expect(note.textContent).toBe(NOTE);
    expect(
      within(note).getByText("“Seria para Pedro novamente?”").tagName,
    ).toBe("EM");
    expect(note).not.toHaveAttribute("role");
    // A memória do cliente carrega em paralelo e mostra um spinner
    // role="status"; sob carga ele ainda estava na tela quando a asserção
    // rodava. Espere a carga terminar: a nota é que não pode ter status.
    await waitFor(() =>
      expect(screen.queryByText("Carregando memória do cliente")).toBeNull(),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("cliente com telefone próprio: cartão sem nota", async () => {
    await renderProfile(detailFixture({ phone: "11991234567" }));

    expect(card()).toBeVisible();
    expect(screen.queryByText(/As mensagens chegam pelo WhatsApp/)).toBeNull();
  });

  test("responsável sem telefone: cartão sem nota", async () => {
    await renderProfile(
      detailFixture({ primaryGuardian: guardianOf({ phone: null }) }),
    );

    expect(card()).toBeVisible();
    expect(screen.queryByText(/As mensagens chegam pelo WhatsApp/)).toBeNull();
  });

  test("sem nome do cliente a pergunta fala 'este cliente'", async () => {
    await renderProfile(detailFixture({ name: null }));

    expect(
      screen.getByText(/As mensagens chegam pelo WhatsApp/).textContent,
    ).toContain("“Seria para este cliente novamente?”");
  });

  test("sem PROPOSED nem relação, a nota também não aparece", async () => {
    await renderProfile(detailFixture({ primaryGuardian: null }));

    expect(screen.queryByText(/As mensagens chegam pelo WhatsApp/)).toBeNull();
  });
});

describe("A linha sob o nome (escolha 5)", () => {
  test("cliente sem telefone com responsável confirmado: 'Sem telefone próprio'", async () => {
    await renderProfile();

    expect(
      screen.getByText("Sem telefone próprio · cliente desde ago 2026"),
    ).toBeVisible();
    expect(screen.queryByText(/Telefone não informado/)).toBeNull();
  });

  test("cliente sem telefone e sem responsável: 'Telefone não informado'", async () => {
    await renderProfile(detailFixture({ primaryGuardian: null }));

    expect(
      screen.getByText("Telefone não informado · cliente desde ago 2026"),
    ).toBeVisible();
    expect(screen.queryByText(/Sem telefone próprio/)).toBeNull();
  });

  test("cliente sem telefone com responsável só proposto: 'Telefone não informado'", async () => {
    await renderProfile(
      detailFixture({
        primaryGuardian: guardianFixture({
          confirmedAt: null,
          confirmedBy: null,
          status: "PROPOSED",
        }),
      }),
    );

    expect(
      screen.getByText("Telefone não informado · cliente desde ago 2026"),
    ).toBeVisible();
  });

  test("cliente com telefone: o telefone formatado, com ou sem responsável confirmado", async () => {
    await renderProfile(detailFixture({ phone: "11991234567" }));

    expect(
      screen.getByText("+55 11 99123-4567 · cliente desde ago 2026"),
    ).toBeVisible();
    expect(screen.queryByText(/Sem telefone próprio/)).toBeNull();
  });

  test("as outras abas mantêm o cabeçalho compacto de antes", async () => {
    const user = userEvent.setup();
    await renderProfile();

    await user.click(screen.getByRole("tab", { name: "Atendimentos" }));

    expect(screen.getByText("2 atendimentos · desde ago 2026")).toBeVisible();
    expect(screen.queryByText(/Sem telefone próprio/)).toBeNull();
  });
});

describe("O painel Responsável principal e o cartão (escolha 6)", () => {
  const proposed = () =>
    guardianFixture({
      confirmedAt: null,
      confirmedBy: null,
      status: "PROPOSED",
    });

  test("confirmar pelo painel faz o cartão aparecer na hora, sem nova leitura do perfil", async () => {
    const user = userEvent.setup();
    customersConfirmPrimaryGuardian.mockResolvedValue(guardianFixture());
    await renderProfile(detailFixture({ primaryGuardian: proposed() }));
    expect(screen.queryByRole("region", { name: CARD_NAME })).toBeNull();
    const reads = customersGet.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(card()).toBeVisible());
    expect(customersConfirmPrimaryGuardian).toHaveBeenCalledWith("pedro-1", {
      confirmedBy: "PROFESSIONAL",
    });
    expect(
      within(card()).getByText("Maria Souza agenda para Pedro"),
    ).toBeVisible();
    expect(
      screen.getByText("Sem telefone próprio · cliente desde ago 2026"),
    ).toBeVisible();
    expect(customersGet).toHaveBeenCalledTimes(reads);
  });

  test("remover pelo painel faz o cartão e a nota sumirem na hora", async () => {
    const user = userEvent.setup();
    customersClearPrimaryGuardian.mockResolvedValue({ deleted: true });
    await renderProfile();
    expect(card()).toBeVisible();
    const reads = customersGet.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Remover" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: CARD_NAME })).toBeNull(),
    );
    expect(customersClearPrimaryGuardian).toHaveBeenCalledWith("pedro-1");
    expect(screen.queryByText(/As mensagens chegam pelo WhatsApp/)).toBeNull();
    expect(
      screen.getByText("Telefone não informado · cliente desde ago 2026"),
    ).toBeVisible();
    expect(customersGet).toHaveBeenCalledTimes(reads);
  });

  test("o painel segue no fim do Resumo, com a relação e os botões de sempre", async () => {
    await renderProfile();

    const panel = screen.getByRole("region", { name: "Responsável principal" });
    expect(within(panel).getByText("Maria Souza")).toBeVisible();
    expect(
      within(panel).getByText("Confirmado", { selector: ".badge" }),
    ).toBeVisible();
    expect(
      within(panel).getByRole("button", { name: "Trocar responsável" }),
    ).toBeVisible();
    expect(
      within(panel).getByRole("button", { name: "Remover" }),
    ).toBeVisible();
    expect(
      card().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("propor continua pedindo PROFESSIONAL e não mostra cartão enquanto PROPOSED", async () => {
    const user = userEvent.setup();
    customersList.mockResolvedValue({
      items: [{ id: "maria-1", name: "Maria Souza", phone: "5511987651100" }],
      total: 1,
    });
    customersSetPrimaryGuardian.mockResolvedValue(proposed());
    await renderProfile(detailFixture({ primaryGuardian: null }));

    await user.click(
      screen.getByRole("button", { name: /Propor responsável/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Maria Souza/ }),
    );

    await waitFor(() =>
      expect(customersSetPrimaryGuardian).toHaveBeenCalledWith("pedro-1", {
        guardianCustomerId: "maria-1",
        proposedBy: "PROFESSIONAL",
      }),
    );
    expect(
      await screen.findByText("Proposto", { selector: ".badge" }),
    ).toBeVisible();
    expect(screen.queryByRole("region", { name: CARD_NAME })).toBeNull();
  });
});

describe("O que não muda (escolha 6)", () => {
  test("'Agendar' e as três abas seguem; sem conversa, sem 'Conversa'", async () => {
    await renderProfile();

    expect(screen.getByRole("link", { name: /Agendar/ })).toHaveAttribute(
      "href",
      "/agenda/novo?customerId=pedro-1",
    );
    expect(screen.queryByRole("link", { name: /^Conversa/ })).toBeNull();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Resumo",
      "Atendimentos",
      "Notas",
    ]);
  });

  test("com conversa, 'Conversa com Maria' leva para a conversa da Maria, pedida pelo id dela", async () => {
    // A conversa só existe para a Maria: o pedido pelo id do Pedro devolve vazio.
    conversationsList.mockImplementation(
      async (query: { customerId?: string }) =>
        query.customerId === "maria-1" ? [{ id: "conv-9" }] : [],
    );
    await renderProfile();

    expect(
      await screen.findByRole("link", { name: "Conversa com Maria" }),
    ).toHaveAttribute("href", "/conversas/conv-9");
    expect(conversationsList).toHaveBeenCalledWith(
      { customerId: "maria-1", limit: 1 },
      expect.anything(),
    );
    expect(conversationsList).not.toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "pedro-1" }),
      expect.anything(),
    );
  });

  test("cliente sem responsável fica como antes: sem cartão, painel com 'Nenhum responsável'", async () => {
    await renderProfile(
      detailFixture({ phone: "11991234567", primaryGuardian: null }),
    );

    expect(screen.queryByRole("region", { name: CARD_NAME })).toBeNull();
    expect(
      screen.getByText("Nenhum responsável principal definido."),
    ).toBeVisible();
  });
});
