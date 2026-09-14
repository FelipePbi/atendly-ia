// @vitest-environment jsdom
/**
 * Goal015 (WU-07): provas renderizadas do domínio de Clientes.
 *
 * Cobre o que só um DOM de verdade mostra: cliente sem nome e sem telefone
 * não vira dado inventado; observação, tag e memória nascem sem autorização
 * de uso pela IA e só mudam por ação explícita; a agenda do perfil é pedida
 * sempre por `customerId`, nunca por `customerPhone`, mesmo quando duas
 * pessoas compartilham o mesmo número ou a fonte é externa; e o número
 * compartilhado no cadastro exige escolha explícita entre um cadastro
 * existente ou uma pessoa nova.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  CalendarState,
  Customer,
  CustomerDetail,
  CustomerNote,
  CustomerTag,
} from "@/data";
import { CustomerMemory } from "@/features/customers/CustomerMemory";
import { CustomerNotes } from "@/features/customers/CustomerNotes";
import { CustomerTags } from "@/features/customers/CustomerTags";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const customersList = vi.fn();
const customersGet = vi.fn();
const customersCreate = vi.fn();
const customersListCandidatesByPhone = vi.fn();
const customersListMemory = vi.fn();
const customersCreateMemory = vi.fn();
const customersSetMemoryPermission = vi.fn();
const customersCreateNote = vi.fn();
const customersSetNoteAuthorization = vi.fn();
const customersCreateTag = vi.fn();
const customersSetTagAuthorization = vi.fn();
const calendarGetCalendar = vi.fn();
const calendarListAppointments = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getCalendar: calendarGetCalendar,
      listAppointments: calendarListAppointments,
    },
    customers: {
      create: customersCreate,
      createMemory: customersCreateMemory,
      createNote: customersCreateNote,
      createTag: customersCreateTag,
      get: customersGet,
      list: customersList,
      listCandidatesByPhone: customersListCandidatesByPhone,
      listMemory: customersListMemory,
      setMemoryPermission: customersSetMemoryPermission,
      setNoteAuthorization: customersSetNoteAuthorization,
      setTagAuthorization: customersSetTagAuthorization,
    },
  }),
}));

function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return { id: "c1", name: "Marina Duarte", phone: "11999990000", ...overrides };
}

function customerDetailFixture(
  overrides: Partial<CustomerDetail> = {},
): CustomerDetail {
  return {
    id: "c1",
    name: "Marina Duarte",
    notes: [],
    phone: "11999990000",
    primaryGuardian: null,
    tags: [],
    ...overrides,
  };
}

function calendarStateFixture(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: true,
    },
    integration: null,
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
    ...overrides,
  };
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  customersList.mockReset();
  customersGet.mockReset();
  customersCreate.mockReset();
  customersListCandidatesByPhone.mockReset();
  customersListMemory.mockReset();
  customersCreateMemory.mockReset();
  customersSetMemoryPermission.mockReset();
  customersCreateNote.mockReset();
  customersSetNoteAuthorization.mockReset();
  customersCreateTag.mockReset();
  customersSetTagAuthorization.mockReset();
  calendarGetCalendar.mockReset();
  calendarListAppointments.mockReset();
});

describe("cliente sem nome e sem telefone não vira dado inventado", () => {
  test("a lista mostra a copy real do produto, não um placeholder fabricado", async () => {
    customersList.mockResolvedValue({
      items: [customerFixture({ name: null, phone: null })],
      managedExternally: false,
      source: "ATENDLY",
    });
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="list" />
      </ShellConfigProvider>,
    );

    expect(await screen.findByText("Cliente sem nome")).toBeVisible();
    expect(screen.getByText("Telefone não informado")).toBeVisible();
    expect(screen.queryByText(/null|undefined/i)).not.toBeInTheDocument();
  });

  test("o perfil mostra a mesma copy real, sem inventar nome ou telefone", async () => {
    customersGet.mockResolvedValue(
      customerDetailFixture({ name: null, phone: null }),
    );
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    calendarListAppointments.mockResolvedValue([]);
    customersListMemory.mockResolvedValue([]);
    const { container } = render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Cliente sem nome" }),
    ).toBeVisible();
    expect(screen.getByText("Telefone não informado")).toBeVisible();
    expect(container.textContent).not.toMatch(/null|undefined/i);
  });
});

describe("autorização de uso pela IA nasce negada e só muda por ação explícita", () => {
  function NotesHarness() {
    const [notes, setNotes] = useState<CustomerNote[]>([]);
    return <CustomerNotes customerId="c1" notes={notes} onChange={setNotes} />;
  }

  function TagsHarness() {
    const [tags, setTags] = useState<CustomerTag[]>([]);
    return <CustomerTags customerId="c1" onChange={setTags} tags={tags} />;
  }

  test("observação: criada não autorizada, autoriza só ao clicar em 'Autorizar uso pela IA'", async () => {
    customersCreateNote.mockResolvedValue({
      aiAuthorized: false,
      authorizedAt: null,
      authorizedBy: null,
      body: "Prefere atendimento à tarde",
      createdAt: "2026-09-01T10:00:00Z",
      createdBy: "professional-1",
      id: "note-1",
      updatedAt: "2026-09-01T10:00:00Z",
    });
    const user = userEvent.setup();
    render(<NotesHarness />);

    await user.click(screen.getByRole("button", { name: "Nova observação" }));
    await user.type(
      screen.getByLabelText("Observação"),
      "Prefere atendimento à tarde",
    );
    await user.click(screen.getByRole("button", { name: "Salvar observação" }));

    expect(await screen.findByText("IA não autorizada a usar")).toBeVisible();
    expect(customersCreateNote).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ body: "Prefere atendimento à tarde" }),
    );

    customersSetNoteAuthorization.mockResolvedValue({
      aiAuthorized: true,
      authorizedAt: "2026-09-01T10:05:00Z",
      authorizedBy: "professional-1",
      body: "Prefere atendimento à tarde",
      createdAt: "2026-09-01T10:00:00Z",
      createdBy: "professional-1",
      id: "note-1",
      updatedAt: "2026-09-01T10:05:00Z",
    });
    await user.click(
      screen.getByRole("button", { name: "Autorizar uso pela IA" }),
    );
    expect(await screen.findByText("IA autorizada a usar")).toBeVisible();
    expect(customersSetNoteAuthorization).toHaveBeenCalledWith("c1", "note-1", true);
  });

  test("tag: criada não autorizada, autoriza só ao clicar em 'Autorizar uso pela IA'", async () => {
    customersCreateTag.mockResolvedValue({
      aiAuthorized: false,
      authorizedAt: null,
      authorizedBy: null,
      createdAt: "2026-09-01T10:00:00Z",
      createdBy: "professional-1",
      id: "tag-1",
      label: "prefere horário da manhã",
      updatedAt: "2026-09-01T10:00:00Z",
    });
    const user = userEvent.setup();
    render(<TagsHarness />);

    await user.click(screen.getByRole("button", { name: "Nova tag" }));
    await user.type(screen.getByLabelText("Tag"), "prefere horário da manhã");
    await user.click(screen.getByRole("button", { name: "Criar tag" }));

    expect(await screen.findByText("IA não autorizada a usar")).toBeVisible();
    expect(customersCreateTag).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ label: "prefere horário da manhã" }),
    );

    customersSetTagAuthorization.mockResolvedValue({
      aiAuthorized: true,
      authorizedAt: "2026-09-01T10:05:00Z",
      authorizedBy: "professional-1",
      createdAt: "2026-09-01T10:00:00Z",
      createdBy: "professional-1",
      id: "tag-1",
      label: "prefere horário da manhã",
      updatedAt: "2026-09-01T10:05:00Z",
    });
    await user.click(
      screen.getByRole("button", { name: "Autorizar uso pela IA" }),
    );
    expect(await screen.findByText("IA autorizada a usar")).toBeVisible();
    expect(customersSetTagAuthorization).toHaveBeenCalledWith("c1", "tag-1", true);
  });

  test("memória: criada não autorizada, autoriza só ao clicar em 'Autorizar uso pela IA'", async () => {
    customersListMemory.mockResolvedValue([]);
    customersCreateMemory.mockResolvedValue({
      aiAllowed: false,
      confidence: null,
      customerId: "c1",
      id: "memory-1",
      kind: "OBSERVATION",
      lastReinforcedAt: null,
      observedAt: "2026-09-01T10:00:00Z",
      origin: "PROFESSIONAL",
      removedAt: null,
      removedBy: null,
      sourceConversationId: null,
      sourceMessageIds: [],
      supersededById: null,
      value: "Prefere atendimentos no fim da tarde",
    });
    const user = userEvent.setup();
    render(<CustomerMemory customerId="c1" />);

    await user.click(screen.getByRole("button", { name: "Cadastrar memória" }));
    await user.type(
      screen.getByLabelText("Descrição"),
      "Prefere atendimentos no fim da tarde",
    );
    await user.click(screen.getByRole("button", { name: "Salvar memória" }));

    expect(await screen.findByText("IA não autorizada a usar")).toBeVisible();
    expect(customersCreateMemory).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ value: "Prefere atendimentos no fim da tarde" }),
    );

    customersSetMemoryPermission.mockResolvedValue({
      aiAllowed: true,
      confidence: null,
      customerId: "c1",
      id: "memory-1",
      kind: "OBSERVATION",
      lastReinforcedAt: null,
      observedAt: "2026-09-01T10:00:00Z",
      origin: "PROFESSIONAL",
      removedAt: null,
      removedBy: null,
      sourceConversationId: null,
      sourceMessageIds: [],
      supersededById: null,
      value: "Prefere atendimentos no fim da tarde",
    });
    await user.click(
      screen.getByRole("button", { name: "Autorizar uso pela IA" }),
    );
    expect(await screen.findByText("IA autorizada a usar")).toBeVisible();
    expect(customersSetMemoryPermission).toHaveBeenCalledWith(
      "c1",
      "memory-1",
      true,
    );
  });
});

describe("na Agenda Atendly, a agenda do perfil pede por customerId", () => {
  test("a requisição emitida carrega customerId e não carrega customerPhone", async () => {
    customersGet.mockResolvedValue(customerDetailFixture({ id: "c1" }));
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    calendarListAppointments.mockResolvedValue([]);
    customersListMemory.mockResolvedValue([]);
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );

    await screen.findByRole("heading", { name: "Marina Duarte" });
    expect(calendarListAppointments).toHaveBeenCalledTimes(1);
    const [query] = calendarListAppointments.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(query.customerId).toBe("c1");
    expect(query).not.toHaveProperty("customerPhone");
  });

  test("dois clientes com o mesmo telefone geram chamadas distintas, cada uma pelo próprio customerId", async () => {
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    calendarListAppointments.mockResolvedValue([]);
    customersListMemory.mockResolvedValue([]);

    customersGet.mockResolvedValueOnce(
      customerDetailFixture({ id: "c1", name: "Marina Duarte", phone: "11999990000" }),
    );
    const first = render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );
    await screen.findByRole("heading", { name: "Marina Duarte" });
    first.unmount();

    customersGet.mockResolvedValueOnce(
      customerDetailFixture({ id: "c2", name: "Bruno Alves", phone: "11999990000" }),
    );
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c2" scenario="detail" />
      </ShellConfigProvider>,
    );
    await screen.findByRole("heading", { name: "Bruno Alves" });

    expect(calendarListAppointments).toHaveBeenCalledTimes(2);
    const [firstQuery, secondQuery] = calendarListAppointments.mock.calls as Array<
      [Record<string, unknown>]
    >;
    expect(firstQuery[0].customerId).toBe("c1");
    expect(secondQuery[0].customerId).toBe("c2");
    expect(firstQuery[0]).not.toHaveProperty("customerPhone");
    expect(secondQuery[0]).not.toHaveProperty("customerPhone");
  });
});

describe("número compartilhado no cadastro exige escolha explícita", () => {
  test("cadastros existentes com o mesmo telefone aparecem como candidatos; a nova pessoa só é criada por ação explícita", async () => {
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    customersListCandidatesByPhone.mockResolvedValue({
      items: [
        customerFixture({ id: "c1", name: "Marina Duarte", phone: "11999990000" }),
        customerFixture({ id: "c2", name: "Bruno Alves", phone: "11999990000" }),
      ],
      managedExternally: false,
      source: "ATENDLY",
    });
    customersCreate.mockResolvedValue(
      customerFixture({ id: "c3", name: "Cliente Novo", phone: "11999990000" }),
    );

    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="new" />
      </ShellConfigProvider>,
    );

    await user.type(await screen.findByLabelText("Nome"), "Cliente Novo");
    await user.type(screen.getByLabelText("Telefone"), "11999990000");
    await user.click(screen.getByRole("button", { name: "Criar cliente" }));

    expect(
      await screen.findByText(/Encontramos 2 cadastros com o telefone/),
    ).toBeVisible();
    const candidateList = screen.getByRole("list", {
      name: "Cadastros com este telefone",
    });
    expect(within(candidateList).getByText("Marina Duarte")).toBeVisible();
    expect(within(candidateList).getByText("Bruno Alves")).toBeVisible();
    expect(customersCreate).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Cadastrar Cliente Novo como nova pessoa" }),
    );
    expect(customersCreate).toHaveBeenCalledWith({
      name: "Cliente Novo",
      phone: "11999990000",
    });
    expect(replace).toHaveBeenCalledWith("/clientes/detalhes?id=c3");
  });
});

describe("acessibilidade das telas novas de Clientes", () => {
  test("lista de clientes com dados não acusa violação de axe", async () => {
    customersList.mockResolvedValue({
      items: [
        customerFixture({ id: "c1" }),
        customerFixture({ id: "c2", name: null, phone: null }),
      ],
      managedExternally: false,
      source: "ATENDLY",
    });
    const { container } = render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="list" />
      </ShellConfigProvider>,
    );
    await screen.findByText("2 clientes");
    await expectNoA11yViolations(container);
  });

  test("formulário de novo cliente não acusa violação de axe", async () => {
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    const { container } = render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="new" />
      </ShellConfigProvider>,
    );
    await screen.findByLabelText("Nome");
    await expectNoA11yViolations(container);
  });

  test("perfil do cliente não acusa violação de axe", async () => {
    customersGet.mockResolvedValue(customerDetailFixture());
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    calendarListAppointments.mockResolvedValue([]);
    customersListMemory.mockResolvedValue([]);
    const { container } = render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );
    await screen.findByRole("heading", { name: "Marina Duarte" });
    await expectNoA11yViolations(container);
  });
});

describe("em fonte externa a agenda do perfil também pede por customerId", () => {
  test("a requisição sai por customerId, mesmo com fonte externa e telefone cadastrado", async () => {
    customersGet.mockResolvedValue(
      customerDetailFixture({ id: "c1", phone: "11999990000" }),
    );
    calendarGetCalendar.mockResolvedValue(
      calendarStateFixture({ source: "EXTERNAL" }),
    );
    calendarListAppointments.mockResolvedValue([]);
    customersListMemory.mockResolvedValue([]);
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );

    await screen.findByRole("heading", { name: "Marina Duarte" });
    expect(calendarListAppointments).toHaveBeenCalledTimes(1);
    const [query] = calendarListAppointments.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(query.customerId).toBe("c1");
    expect(query).not.toHaveProperty("customerPhone");
  });

  test("sem telefone no cadastro externo, a agenda continua sendo pedida por customerId", async () => {
    customersGet.mockResolvedValue(
      customerDetailFixture({ id: "c1", phone: null }),
    );
    calendarGetCalendar.mockResolvedValue(
      calendarStateFixture({ source: "EXTERNAL" }),
    );
    calendarListAppointments.mockResolvedValue([]);
    customersListMemory.mockResolvedValue([]);
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );

    await screen.findByRole("heading", { name: "Marina Duarte" });
    expect(calendarListAppointments).toHaveBeenCalledTimes(1);
    const [query] = calendarListAppointments.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(query.customerId).toBe("c1");
    expect(query).not.toHaveProperty("customerPhone");
    expect(screen.queryByText("Agenda deste cliente indisponível")).toBeNull();
  });
});

describe("itens de lista continuam sendo link e botão para o leitor de tela", () => {
  test("na lista de clientes cada item é um listitem e continua sendo um link", async () => {
    customersList.mockResolvedValue({
      items: [
        customerFixture({ id: "c1", name: "Marina Duarte" }),
        customerFixture({ id: "c2", name: "Bruno Alves" }),
      ],
      managedExternally: false,
      source: "ATENDLY",
    });
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="list" />
      </ShellConfigProvider>,
    );

    const list = await screen.findByRole("list", { name: "Clientes" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    const link = within(list).getByRole("link", { name: /Marina Duarte/ });
    expect(link).toHaveAttribute(
      "href",
      "/clientes/detalhes?id=c1",
    );
  });

  test("no seletor de responsável cada candidato é um listitem e continua sendo um botão", async () => {
    customersGet.mockResolvedValue(customerDetailFixture({ id: "c1" }));
    calendarGetCalendar.mockResolvedValue(calendarStateFixture());
    calendarListAppointments.mockResolvedValue([]);
    customersListMemory.mockResolvedValue([]);
    customersList.mockResolvedValue({
      items: [customerFixture({ id: "c2", name: "Bruno Alves" })],
      managedExternally: false,
      source: "ATENDLY",
    });
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      </ShellConfigProvider>,
    );

    await screen.findByRole("heading", { name: "Marina Duarte" });
    await user.click(
      screen.getByRole("button", { name: "Propor responsável" }),
    );

    const list = await screen.findByRole("list", {
      name: "Selecionar responsável",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(
      within(list).getByRole("button", { name: /Bruno Alves/ }),
    ).toBeEnabled();
  });
});
