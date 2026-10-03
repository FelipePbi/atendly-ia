// @vitest-environment jsdom
/**
 * Goal094 — Clientes iguais ao protótipo (CL1, CL4, CL5, CL6 e CL7).
 *
 * Provas, pelo que a usuária encontra:
 *
 * 1. CL1: a linha da lista tem o telefone formatado e uma só informação à
 *    direita, com a classe de cada caso; o cadastro sem nome mostra
 *    "Cadastro sem nome · importado" e "Nomear".
 * 2. CL4: "Nome", "Telefone (opcional)", o texto de apoio do quadro e o CTA
 *    "Salvar cliente"; o campo mostra a máscara e o pedido leva só dígitos; a
 *    linha do responsável diz que o vínculo é feito no perfil.
 * 3. CL6: "Próximo" e "Anteriores", data "dd/mm", traço com a cor do serviço
 *    e rodapé que soma só o valor registrado.
 * 4. CL7: "Observações · só você vê"; a autorização de nota e de tag é um
 *    controle com estado, desmarcado quando `aiAuthorized` é falso; a barra
 *    "Salvar" envia os rascunhos com os mesmos pedidos de hoje.
 * 5. Casca: uma chamada de `useShellConfig` por árvore, nas duas faixas.
 *
 * Fidelidade visual não é provada aqui: jsdom não tem layout. Ela é decidida
 * pelo `visual:compare` e pelo gate renderizado.
 */

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useId } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import type {
  Appointment,
  CalendarState,
  Customer,
  CustomerDetail,
  CustomerNote,
  CustomerTag,
} from "@/data";
import { CustomerList } from "@/features/customers/CustomerList";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import type { ShellConfig } from "@/shared/layout/ShellConfig";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace }),
}));

const shellCallers = vi.hoisted(() => new Set<string>());
const shellActions = vi.hoisted(() => [] as Array<unknown>);

vi.mock("@/shared/layout/ShellConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof ShellConfigModule>();
  return {
    ...actual,
    useShellConfig: (config: ShellConfig) => {
      shellCallers.add(useId());
      shellActions.push(config.action);
      actual.useShellConfig(config);
    },
  };
});

const statusGet = vi.fn();
const notificationsSummary = vi.fn();
const customersList = vi.fn();
const customersGet = vi.fn();
const customersCreate = vi.fn();
const customersListCandidatesByPhone = vi.fn();
const customersListMemory = vi.fn();
const customersCreateNote = vi.fn();
const customersSetNoteAuthorization = vi.fn();
const customersCreateTag = vi.fn();
const customersSetTagAuthorization = vi.fn();
const calendarGetCalendar = vi.fn();
const calendarListAppointments = vi.fn();
const conversationsList = vi.fn();
const serviceCatalogList = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    calendar: {
      getCalendar: calendarGetCalendar,
      listAppointments: calendarListAppointments,
    },
    conversations: { list: conversationsList },
    customers: {
      create: customersCreate,
      createNote: customersCreateNote,
      createTag: customersCreateTag,
      get: customersGet,
      list: customersList,
      listCandidatesByPhone: customersListCandidatesByPhone,
      listMemory: customersListMemory,
      setNoteAuthorization: customersSetNoteAuthorization,
      setTagAuthorization: customersSetTagAuthorization,
    },
    notifications: { summary: notificationsSummary },
    serviceCatalog: { list: serviceCatalogList },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br", name: "Marina Alves" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return { id: "c1", name: "Ana Paula", phone: "11991234567", ...overrides };
}

function noteFixture(overrides: Partial<CustomerNote> = {}): CustomerNote {
  return {
    aiAuthorized: false,
    authorizedAt: null,
    authorizedBy: null,
    body: "Alergia a amônia.",
    createdAt: "2026-09-01T10:00:00Z",
    createdBy: "professional-1",
    id: "note-1",
    updatedAt: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

function tagFixture(overrides: Partial<CustomerTag> = {}): CustomerTag {
  return {
    aiAuthorized: false,
    authorizedAt: null,
    authorizedBy: null,
    createdAt: "2026-09-01T10:00:00Z",
    createdBy: "professional-1",
    id: "tag-1",
    label: "Noiva",
    updatedAt: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

function detailFixture(
  overrides: Partial<CustomerDetail> = {},
): CustomerDetail {
  return {
    appointmentStats: {
      averageIntervalDays: 49,
      cancelled: 1,
      completed: 9,
      firstAppointmentDate: "2025-03-05",
      noShows: 0,
    },
    createdAt: "2025-01-10T10:00:00.000Z",
    id: "c1",
    lastAppointment: null,
    name: "Ana Paula",
    nextAppointment: null,
    notes: [],
    phone: "11991234567",
    primaryGuardian: null,
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
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
  };
}

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Ana Paula", phone: "+5511991234567" },
    customerId: "c1",
    date: "2026-10-02",
    durationMinutes: 60,
    endTime: "16:30",
    finalValue: null,
    id: "apt-1",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [
      {
        durationMinutes: 60,
        name: "Corte feminino",
        price: 90,
        priceType: "FIXED",
        serviceId: "s1",
      },
    ],
    source: "USER",
    startTime: "15:30",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
    ...overrides,
  };
}

const WIDE = 1280;
const NARROW = 390;

function setViewport(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: min ? width >= Number(min[1]) : false,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    },
    writable: true,
  });
}

function renderProfile(tab?: "atendimentos" | "notas") {
  window.history.pushState(
    {},
    "",
    `/clientes/detalhes?id=c1${tab ? `&aba=${tab}` : ""}`,
  );
  return render(
    <ShellConfigProvider>
      <ProductCustomersScreen customerId="c1" scenario="detail" />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  shellCallers.clear();
  shellActions.length = 0;
  for (const mock of [
    push,
    replace,
    statusGet,
    notificationsSummary,
    customersList,
    customersGet,
    customersCreate,
    customersListCandidatesByPhone,
    customersListMemory,
    customersCreateNote,
    customersSetNoteAuthorization,
    customersCreateTag,
    customersSetTagAuthorization,
    calendarGetCalendar,
    calendarListAppointments,
    conversationsList,
    serviceCatalogList,
  ]) {
    mock.mockReset();
  }
  statusGet.mockResolvedValue({
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-27T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  });
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
  customersList.mockResolvedValue({
    items: [customerFixture()],
    managedExternally: false,
    source: "ATENDLY",
  });
  customersGet.mockResolvedValue(detailFixture());
  customersListMemory.mockResolvedValue([]);
  customersListCandidatesByPhone.mockResolvedValue({
    items: [],
    managedExternally: false,
    source: "ATENDLY",
  });
  calendarGetCalendar.mockResolvedValue(calendarFixture());
  calendarListAppointments.mockResolvedValue([]);
  conversationsList.mockResolvedValue([]);
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [],
    managedExternally: false,
    source: "ATENDLY",
  });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Goal094 prova 1 (CL1): a linha da lista", () => {
  test("telefone formatado, uma só informação à direita com a classe de cada caso", async () => {
    customersList.mockResolvedValue({
      items: [
        customerFixture({
          id: "c1",
          name: "Marina Duarte",
          nextAppointment: {
            date: "2026-10-02",
            startTime: "15:30",
            status: "CONFIRMED",
          },
          phone: "11991234567",
        }),
        customerFixture({
          id: "c2",
          lastAppointment: {
            date: "2026-09-08",
            startTime: "10:00",
            status: "COMPLETED",
          },
          name: "Bruno Alves",
          phone: "11988880000",
        }),
        customerFixture({
          id: "c3",
          lastAppointment: {
            date: "2026-09-29",
            startTime: "09:00",
            status: "NO_SHOW",
          },
          name: "Carla Nunes",
          phone: "11977770000",
        }),
        customerFixture({
          id: "c4",
          lastAppointment: null,
          name: "Diego Prado",
          nextAppointment: null,
          phone: "11966660000",
        }),
      ],
      managedExternally: false,
      source: "ATENDLY",
    });
    render(
      <ShellConfigProvider>
        <CustomerList />
      </ShellConfigProvider>,
    );

    const list = await screen.findByRole("list", { name: "Clientes" });
    const rows = within(list).getAllByRole("link");

    const row = (name: string) =>
      rows.find((link) => link.textContent?.includes(name)) as HTMLElement;
    const when = (name: string) =>
      row(name).querySelectorAll(".customer-panel-when");

    expect(
      within(row("Marina Duarte")).getByText("+55 11 99123-4567"),
    ).toBeVisible();
    expect(when("Marina Duarte")).toHaveLength(1);
    expect(when("Marina Duarte")[0]).toHaveClass("is-next");
    expect(when("Bruno Alves")).toHaveLength(1);
    expect(when("Bruno Alves")[0]).toHaveClass("is-last");
    expect(when("Carla Nunes")).toHaveLength(1);
    expect(when("Carla Nunes")[0]).toHaveClass("is-missed");
    expect(when("Diego Prado")).toHaveLength(1);
    expect(when("Diego Prado")[0]).toHaveClass("is-empty");
    expect(when("Diego Prado")[0]).toHaveTextContent("sem atendimentos");
  });

  test("o cadastro sem nome mostra 'Cadastro sem nome · importado' e 'Nomear'", async () => {
    customersList.mockResolvedValue({
      items: [
        customerFixture({ id: "c1", name: "Ana Paula" }),
        customerFixture({ id: "c9", name: null, phone: "11976543210" }),
      ],
      managedExternally: false,
      source: "ATENDLY",
    });
    render(
      <ShellConfigProvider>
        <CustomerList />
      </ShellConfigProvider>,
    );

    const list = await screen.findByRole("list", { name: "Clientes" });
    const unnamed = within(list)
      .getAllByRole("link")
      .find((link) => link.textContent?.includes("Nomear")) as HTMLElement;
    expect(within(unnamed).getByText("+55 11 97654-3210")).toBeVisible();
    expect(
      within(unnamed).getByText("Cadastro sem nome · importado"),
    ).toBeVisible();
    expect(within(unnamed).getByText("Nomear")).toBeVisible();
    expect(unnamed).toHaveAttribute("href", "/clientes/detalhes?id=c9");
  });
});

describe("Goal094 prova 2 (CL4): o formulário de novo cliente", () => {
  async function renderForm() {
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="new" />
      </ShellConfigProvider>,
    );
    return screen.findByLabelText("Nome");
  }

  test("rótulos, texto de apoio e CTA do quadro", async () => {
    await renderForm();

    expect(screen.getByLabelText("Telefone (opcional)")).toBeVisible();
    expect(
      screen.getByText(
        "Com o telefone, a IA reconhece a pessoa quando ela escrever no WhatsApp. Sem telefone serve para crianças ou para quem é agendado por outra pessoa.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Salvar cliente" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Criar cliente" }),
    ).not.toBeInTheDocument();
  });

  test("digitar o telefone mostra a máscara e o pedido leva só os dígitos", async () => {
    customersCreate.mockResolvedValue(customerFixture({ id: "c7" }));
    const user = userEvent.setup();
    await user.type(await renderForm(), "Cliente Novo");
    const phone = screen.getByLabelText("Telefone (opcional)");
    await user.type(phone, "11991234567");

    expect(phone).toHaveValue("+55 (11) 99123-4567");

    await user.click(screen.getByRole("button", { name: "Salvar cliente" }));

    await waitFor(() => expect(customersCreate).toHaveBeenCalledTimes(1));
    expect(customersListCandidatesByPhone).toHaveBeenCalledWith("11991234567");
    expect(customersCreate).toHaveBeenCalledWith({
      name: "Cliente Novo",
      phone: "11991234567",
    });
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/clientes/detalhes?id=c7"),
    );
  });

  test("a linha do responsável aparece e diz que o vínculo é feito no perfil", async () => {
    const user = userEvent.setup();
    await renderForm();

    const guardian = screen.getByRole("button", {
      name: /Alguém agenda por esta pessoa\?/,
    });
    expect(guardian).toHaveTextContent(
      "Vincule um responsável, como mãe ou pai",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(guardian);

    expect(screen.getByRole("status")).toHaveTextContent(
      "O vínculo com o responsável é feito no perfil, depois de salvar o cliente.",
    );
    expect(customersCreate).not.toHaveBeenCalled();
  });
});

describe("Goal094 prova 3 (CL6): Atendimentos", () => {
  const history = [
    appointmentFixture({
      date: "2026-10-02",
      id: "apt-next",
      startTime: "15:30",
      status: "CONFIRMED",
    }),
    appointmentFixture({
      date: "2026-09-19",
      finalValue: 90,
      id: "apt-done-value",
      startTime: "15:30",
      status: "COMPLETED",
    }),
    appointmentFixture({
      date: "2026-09-05",
      finalValue: null,
      id: "apt-done-novalue",
      startTime: "11:00",
      status: "COMPLETED",
      totalPrice: 120,
    }),
    appointmentFixture({
      date: "2026-09-01",
      finalValue: null,
      id: "apt-cancelled",
      startTime: "09:00",
      status: "CANCELLED",
      totalPrice: 200,
    }),
  ];

  function rowOf(name: RegExp): HTMLElement {
    return screen.getByRole("link", { name });
  }

  test("duas seções, data dd/mm, traço na cor do serviço e status em texto", async () => {
    calendarListAppointments.mockResolvedValue(history);
    serviceCatalogList.mockResolvedValue({
      editable: true,
      items: [
        {
          active: true,
          bufferAfterMinutes: 0,
          bufferBeforeMinutes: 0,
          colorToken: "ROSE",
          description: null,
          durationMinutes: 60,
          id: "s1",
          name: "Corte feminino",
          needsReview: false,
          price: 90,
          priceType: "FIXED",
          recurrenceIntervalDays: null,
          reviewOrigin: null,
        },
      ],
      managedExternally: false,
      source: "ATENDLY",
    });
    renderProfile("atendimentos");

    const next = within(
      await screen.findByRole("heading", { name: "Próximo" }),
    ).getByText("Próximo");
    expect(next).toBeVisible();
    expect(screen.getByRole("heading", { name: "Anteriores" })).toBeVisible();
    expect(screen.queryByText("Próximos atendimentos")).not.toBeInTheDocument();
    expect(screen.queryByText("Histórico")).not.toBeInTheDocument();

    const done = await waitFor(() => {
      const link = document.querySelector<HTMLElement>(
        'a[href="/agenda/agendamento?id=apt-done-value"]',
      );
      expect(link).not.toBeNull();
      expect(
        link?.querySelector('.customer-appt-stripe-part[data-color="ROSE"]'),
      ).not.toBeNull();
      return link as HTMLElement;
    });
    expect(done).toHaveTextContent("19/09");
    expect(done).toHaveTextContent("15:30");
    expect(done).toHaveTextContent("Concluído");
    expect(done).toHaveClass("is-past");
    expect(done).not.toHaveClass("is-active");
    expect(done.querySelector(".customer-appt-status-dot")).toBeNull();
    expect(done).toHaveTextContent(/R\$\s90 registrado/);
    expect(rowOf(/02\/10/)).toHaveTextContent("Confirmado");
    expect(rowOf(/01\/09/)).toHaveTextContent("Cancelado");
  });

  test("o rodapé soma só o valor registrado; previsto e cancelado ficam de fora", async () => {
    calendarListAppointments.mockResolvedValue(history);
    const { container } = renderProfile("atendimentos");

    await screen.findByRole("heading", { name: "Anteriores" });
    const footer = container.querySelector(".customer-appts-footer");
    expect(footer).not.toBeNull();
    const text = (footer?.textContent ?? "").replace(/\s/g, " ");
    expect(text).toContain("Valor registrado: R$ 90");
    expect(text).not.toMatch(/R\$ 210|R\$ 120|R\$ 410|R\$ 300/);
    expect(text).toContain("1 atendimento sem valor");
    expect(text).not.toContain("2 atendimentos sem valor");
  });

  test("sem concluído, não há rodapé", async () => {
    calendarListAppointments.mockResolvedValue([
      history[0],
      history[3],
    ] as Appointment[]);
    const { container } = renderProfile("atendimentos");

    await screen.findByRole("heading", { name: "Anteriores" });
    await waitFor(() =>
      expect(
        container.querySelector(
          'a[href="/agenda/agendamento?id=apt-cancelled"]',
        ),
      ).not.toBeNull(),
    );
    expect(container.querySelector(".customer-appts-footer")).toBeNull();
    expect(screen.queryByText(/Valor registrado/)).not.toBeInTheDocument();
  });

  test("atendimento concluído hoje fica em Anteriores, nunca em Próximo", async () => {
    calendarListAppointments.mockResolvedValue([
      appointmentFixture({
        date: "2026-10-02",
        finalValue: null,
        id: "apt-done-today",
        startTime: "14:00",
        status: "COMPLETED",
      }),
    ]);
    renderProfile("atendimentos");

    await screen.findByRole("heading", { name: "Próximo" });
    const upcoming = screen
      .getByRole("heading", { name: "Próximo" })
      .closest("section") as HTMLElement;
    const previous = screen
      .getByRole("heading", { name: "Anteriores" })
      .closest("section") as HTMLElement;
    expect(upcoming).toHaveTextContent("Nenhum agendamento futuro.");
    expect(
      upcoming.querySelector('a[href="/agenda/agendamento?id=apt-done-today"]'),
    ).toBeNull();
    expect(
      previous.querySelector('a[href="/agenda/agendamento?id=apt-done-today"]'),
    ).not.toBeNull();
  });

  test("o cabeçalho do perfil diz 'desde mar 2025', sem 'de'", async () => {
    renderProfile("atendimentos");

    expect(await screen.findByText(/desde mar 2025/)).toBeVisible();
    expect(screen.queryByText(/desde mar de 2025/)).not.toBeInTheDocument();
  });

  test("'registrar' leva ao detalhe do agendamento", async () => {
    calendarListAppointments.mockResolvedValue(history);
    renderProfile("atendimentos");

    const register = await screen.findByText("registrar");
    expect(register.closest("a")).toHaveAttribute(
      "href",
      "/agenda/agendamento?id=apt-done-novalue",
    );
    expect(register.closest("a")).toHaveTextContent("valor não registrado");
  });
});

describe("Goal094 prova 4 (CL7): Notas", () => {
  test("a autorização de nota e de tag é um controle com estado, desmarcado por padrão", async () => {
    customersGet.mockResolvedValue(
      detailFixture({
        notes: [noteFixture({ aiAuthorized: false })],
        tags: [
          tagFixture({ aiAuthorized: true, id: "tag-1", label: "Coloração" }),
          tagFixture({ aiAuthorized: false, id: "tag-2", label: "Noiva" }),
        ],
      }),
    );
    renderProfile("notas");

    expect(
      await screen.findByRole("heading", { name: "Observações · só você vê" }),
    ).toBeVisible();
    const noteBox = screen.getByRole("checkbox", {
      name: "A IA pode usar esta informação",
    });
    expect(noteBox).not.toBeChecked();
    expect(
      screen.getByText(
        "Ela considera a observação ao atender, sem repeti-la para a cliente.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "IA pode usar a tag Coloração" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "IA pode usar a tag Noiva" }),
    ).not.toBeChecked();
    expect(screen.getByText("IA pode usar")).toBeVisible();
    expect(screen.getByText("só você")).toBeVisible();
  });

  test("alternar chama o mesmo serviço de hoje com o mesmo pedido", async () => {
    customersGet.mockResolvedValue(
      detailFixture({
        notes: [noteFixture()],
        tags: [tagFixture({ id: "tag-2", label: "Noiva" })],
      }),
    );
    customersSetNoteAuthorization.mockResolvedValue(
      noteFixture({ aiAuthorized: true }),
    );
    customersSetTagAuthorization.mockResolvedValue(
      tagFixture({ aiAuthorized: true, id: "tag-2", label: "Noiva" }),
    );
    const user = userEvent.setup();
    renderProfile("notas");

    const noteBox = await screen.findByRole("checkbox", {
      name: "A IA pode usar esta informação",
    });
    await user.click(noteBox);
    await waitFor(() => expect(noteBox).toBeChecked());
    expect(customersSetNoteAuthorization).toHaveBeenCalledWith(
      "c1",
      "note-1",
      true,
    );

    const tagBox = screen.getByRole("checkbox", {
      name: "IA pode usar a tag Noiva",
    });
    await user.click(tagBox);
    await waitFor(() => expect(tagBox).toBeChecked());
    expect(customersSetTagAuthorization).toHaveBeenCalledWith(
      "c1",
      "tag-2",
      true,
    );
  });

  test("a barra 'Salvar' envia a observação aberta com o mesmo pedido de hoje", async () => {
    customersCreateNote.mockResolvedValue(
      noteFixture({ body: "Prefere à tarde" }),
    );
    const user = userEvent.setup();
    renderProfile("notas");

    await user.click(
      await screen.findByRole("button", { name: "Nova observação" }),
    );
    await user.type(screen.getByLabelText("Observação"), "Prefere à tarde");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(customersCreateNote).toHaveBeenCalledTimes(1));
    expect(customersCreateNote).toHaveBeenCalledWith("c1", {
      body: "Prefere à tarde",
    });
    expect(
      await screen.findByRole("checkbox", {
        name: "A IA pode usar esta informação",
      }),
    ).not.toBeChecked();
  });

  test("sem rascunho, 'Salvar' diz que o resto já vale na hora e não envia nada", async () => {
    const user = userEvent.setup();
    renderProfile("notas");

    await user.click(await screen.findByRole("button", { name: "Salvar" }));

    expect(screen.getByRole("status")).toHaveTextContent("Tudo salvo.");
    expect(customersCreateNote).not.toHaveBeenCalled();
    expect(customersCreateTag).not.toHaveBeenCalled();
  });
});

describe("Goal094 prova 5b (CL1): o '+' da lista não duplica no FAB", () => {
  test("com a lista ao lado do detalhe a casca não recebe ação; abaixo disso recebe", async () => {
    setViewport(WIDE);
    const wide = render(
      <PlatformLayout>
        <ProductCustomersScreen scenario="list" />
      </PlatformLayout>,
    );
    await screen.findAllByText("Ana Paula", { exact: false });
    expect(shellActions.length).toBeGreaterThan(0);
    expect(shellActions.every((action) => action === undefined)).toBe(true);
    wide.unmount();

    shellActions.length = 0;
    setViewport(NARROW);
    render(
      <PlatformLayout>
        <ProductCustomersScreen scenario="list" />
      </PlatformLayout>,
    );
    await screen.findAllByText("Ana Paula", { exact: false });
    await waitFor(() =>
      expect(shellActions).toContainEqual(
        expect.objectContaining({ href: "/clientes/novo" }),
      ),
    );
  });
});

describe("Goal094 prova 5: uma só chamada de useShellConfig por árvore", () => {
  const ROUTES: Array<{
    loaded: string;
    name: string;
    screen: () => ReactElement;
  }> = [
    {
      loaded: "Ana Paula",
      name: "/clientes",
      screen: () => <ProductCustomersScreen scenario="list" />,
    },
    {
      loaded: "Salvar cliente",
      name: "/clientes/novo",
      screen: () => <ProductCustomersScreen scenario="new" />,
    },
    {
      loaded: "Ana Paula",
      name: "/clientes/detalhes",
      screen: () => (
        <ProductCustomersScreen customerId="c1" scenario="detail" />
      ),
    },
  ];

  test.each([
    ["≥1024", WIDE],
    ["<1024", NARROW],
  ] as const)(
    "nas três rotas de Clientes, na faixa %s",
    async (_label, width) => {
      for (const route of ROUTES) {
        shellCallers.clear();
        setViewport(width);
        const { unmount } = render(
          <PlatformLayout>{route.screen()}</PlatformLayout>,
        );
        await screen.findAllByText(route.loaded, { exact: false });
        await waitFor(() => {
          expect(shellCallers.size, route.name).toBe(1);
        });
        unmount();
      }
    },
  );
});
