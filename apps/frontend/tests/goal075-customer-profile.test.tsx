// @vitest-environment jsdom
/**
 * Goal075 (WU-04) — perfil de Clientes: cabeçalho com "Conversa" e
 * "Agendar", três abas (Resumo/Atendimentos/Notas), os quatro números do
 * histórico e nenhuma copy técnica (§6.8 a §6.11). O Resumo mostra o
 * próximo atendimento que o detalhe devolve de verdade (blocker 1 da
 * rodada 1).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  CalendarState,
  Conversation,
  Customer,
  CustomerDetail,
  CustomerMemory as CustomerMemoryEntry,
} from "@/data";
import { customerDetailSchema } from "@/data/mappers/publicApiSchemas";
import { ProductAgendaScreen } from "@/features/agenda/ProductAgendaScreen";
import { ProductCustomersScreen } from "@/features/customers/ProductCustomersScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const customersGet = vi.fn();
const customersUpdate = vi.fn();
const customersListMemory = vi.fn();
const customersCreateMemory = vi.fn();
const customersSetMemoryPermission = vi.fn();
const customersDeleteMemory = vi.fn();
const customersCreateNote = vi.fn();
const customersSetNoteAuthorization = vi.fn();
const customersDeleteNote = vi.fn();
const customersCreateTag = vi.fn();
const customersSetTagAuthorization = vi.fn();
const customersDeleteTag = vi.fn();
const customersGenerateSummary = vi.fn();
const customersList = vi.fn();
const customersSetPrimaryGuardian = vi.fn();
const customersConfirmPrimaryGuardian = vi.fn();
const customersClearPrimaryGuardian = vi.fn();
const calendarGetCalendar = vi.fn();
const calendarListAppointments = vi.fn();
const conversationsList = vi.fn();
const serviceCatalogList = vi.fn();
const calendarGetAvailability = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getAvailability: calendarGetAvailability,
      getCalendar: calendarGetCalendar,
      listAppointments: calendarListAppointments,
    },
    conversations: { list: conversationsList },
    customers: {
      clearPrimaryGuardian: customersClearPrimaryGuardian,
      confirmPrimaryGuardian: customersConfirmPrimaryGuardian,
      createMemory: customersCreateMemory,
      createNote: customersCreateNote,
      createTag: customersCreateTag,
      deleteMemory: customersDeleteMemory,
      deleteNote: customersDeleteNote,
      deleteTag: customersDeleteTag,
      generateSummary: customersGenerateSummary,
      get: customersGet,
      list: customersList,
      listMemory: customersListMemory,
      setMemoryPermission: customersSetMemoryPermission,
      setNoteAuthorization: customersSetNoteAuthorization,
      setPrimaryGuardian: customersSetPrimaryGuardian,
      setTagAuthorization: customersSetTagAuthorization,
      update: customersUpdate,
    },
    serviceCatalog: { list: serviceCatalogList },
  }),
}));

function customerFixture(overrides: Partial<Customer> = {}): Customer {
  return { id: "c1", name: "Ana Paula", phone: "11991234567", ...overrides };
}

function customerDetailFixture(
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
    lastAppointment: {
      date: "2026-08-01",
      startTime: "16:00",
      status: "COMPLETED",
    },
    name: "Ana Paula",
    nextAppointment: {
      date: "2026-10-02",
      startTime: "15:30",
      status: "CONFIRMED",
    },
    notes: [],
    phone: "11991234567",
    primaryGuardian: null,
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

function conversationFixture(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    customerId: "c1",
    customerName: "Ana Paula",
    externalContactId: "5511999990000@c.us",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-9",
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

function memoryFixture(
  overrides: Partial<CustomerMemoryEntry> = {},
): CustomerMemoryEntry {
  return {
    aiAllowed: true,
    confidence: 0.8,
    customerId: "c1",
    id: "mem-1",
    kind: "PREFERRED_PERIOD",
    lastReinforcedAt: null,
    observedAt: "2026-08-01T10:00:00.000Z",
    origin: "AI_INFERRED",
    removedAt: null,
    removedBy: null,
    sourceConversationId: null,
    sourceMessageIds: [],
    supersededById: null,
    value: "Fim da tarde",
    ...overrides,
  };
}

function renderProfile() {
  return render(
    <ShellConfigProvider>
      <ProductCustomersScreen customerId="c1" scenario="detail" />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  customersGet.mockReset();
  customersUpdate.mockReset();
  customersListMemory.mockReset();
  customersCreateMemory.mockReset();
  customersSetMemoryPermission.mockReset();
  customersDeleteMemory.mockReset();
  customersCreateNote.mockReset();
  customersSetNoteAuthorization.mockReset();
  customersDeleteNote.mockReset();
  customersCreateTag.mockReset();
  customersSetTagAuthorization.mockReset();
  customersDeleteTag.mockReset();
  customersGenerateSummary.mockReset();
  customersList.mockReset();
  customersSetPrimaryGuardian.mockReset();
  customersConfirmPrimaryGuardian.mockReset();
  customersClearPrimaryGuardian.mockReset();
  calendarGetCalendar.mockReset();
  calendarListAppointments.mockReset();
  conversationsList.mockReset();
  serviceCatalogList.mockReset();
  calendarGetAvailability.mockReset();

  customersGet.mockResolvedValue(customerDetailFixture());
  calendarGetCalendar.mockResolvedValue(calendarFixture());
  calendarListAppointments.mockResolvedValue([]);
  customersListMemory.mockResolvedValue([]);
  conversationsList.mockResolvedValue([]);
  window.history.pushState({}, "", "/clientes/detalhes?id=c1");
});

describe("§6.8 — Conversa e Agendar no cabeçalho", () => {
  test("com conversa e createAppointments, os dois links aparecem com o destino certo", async () => {
    conversationsList.mockResolvedValue([conversationFixture()]);
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });

    const conversaLink = await screen.findByRole("link", { name: /Conversa/ });
    expect(conversaLink).toHaveAttribute("href", "/conversas/conv-9");
    expect(conversationsList).toHaveBeenCalledWith(
      { customerId: "c1", limit: 1 },
      expect.anything(),
    );

    const agendarLink = screen.getByRole("link", { name: /Agendar/ });
    expect(agendarLink).toHaveAttribute("href", "/agenda/novo?customerId=c1");
  });

  test("sem conversa da pessoa, 'Conversa' não aparece", async () => {
    conversationsList.mockResolvedValue([]);
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });
    await screen.findByRole("link", { name: /Agendar/ });

    expect(screen.queryByRole("link", { name: /Conversa/ })).toBeNull();
  });

  test("sem createAppointments, 'Agendar' não aparece", async () => {
    calendarGetCalendar.mockResolvedValue(
      calendarFixture({
        capabilities: {
          createAppointments: false,
          manageAvailability: true,
          manageCustomers: true,
          manageServices: true,
          migrate: true,
        },
      }),
    );
    conversationsList.mockResolvedValue([conversationFixture()]);
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });
    await screen.findByRole("link", { name: /Conversa/ });

    expect(screen.queryByRole("link", { name: /Agendar/ })).toBeNull();
  });
});

describe("§6.9 — /agenda/novo?customerId= começa com a pessoa escolhida", () => {
  test("o formulário abre com a pessoa pré-selecionada, e continua trocável", async () => {
    calendarGetCalendar.mockResolvedValue(calendarFixture());
    serviceCatalogList.mockResolvedValue({ items: [], source: "AVENLY" });
    customersList.mockResolvedValue({
      items: [customerFixture()],
      managedExternally: false,
      source: "AVENLY",
    });

    render(
      <ShellConfigProvider>
        <ProductAgendaScreen customerId="c1" scenario="new" />
      </ShellConfigProvider>,
    );

    const swap = await screen.findByRole("button", { name: "Trocar" });
    expect(screen.getByText("Ana Paula")).toBeVisible();
    expect(screen.queryByLabelText("Nome do cliente")).toBeNull();

    const user = userEvent.setup();
    await user.click(swap);
    expect(screen.getByLabelText("Nome do cliente")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Trocar" })).toBeNull();
  });
});

describe("§6.10 — três abas: clique, seta e endereço direto", () => {
  test("trocam por clique, e cada aba mostra o conteúdo certo", async () => {
    const user = userEvent.setup();
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });

    expect(screen.getByRole("tab", { name: "Resumo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("atendimentos")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Atendimentos" }));
    expect(screen.getByRole("tab", { name: "Atendimentos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("Nenhum agendamento futuro.")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Notas" }));
    expect(screen.getByRole("tab", { name: "Notas" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Nova observação" }),
    ).toBeVisible();
  });

  test("trocam por seta do teclado, com roving tabindex", async () => {
    const user = userEvent.setup();
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });

    const resumoTab = screen.getByRole("tab", { name: "Resumo" });
    resumoTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Atendimentos" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Atendimentos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowLeft}");
    expect(resumoTab).toHaveFocus();
    expect(resumoTab).toHaveAttribute("aria-selected", "true");
  });

  test("a aba do endereço abre direto, sem precisar clicar", async () => {
    window.history.pushState({}, "", "/clientes/detalhes?id=c1&aba=notas");
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });

    expect(screen.getByRole("tab", { name: "Notas" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Nova observação" }),
    ).toBeVisible();
  });

  test("aberto pela conversa: abre na aba Atendimentos e volta para a conversa", async () => {
    // Validacao de 2026-10-12: "Ver agendamentos" abria o perfil no Resumo
    // (na navegacao pelo app, window.location ainda tinha a URL anterior) e o
    // voltar levava para a lista de clientes em vez da conversa.
    window.history.pushState({}, "", "/conversas/conv-1");
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen
          customerId="c1"
          initialTab="atendimentos"
          returnTo="/conversas/conv-1"
          scenario="detail"
        />
      </ShellConfigProvider>,
    );
    await screen.findByRole("heading", { name: "Ana Paula" });

    expect(screen.getByRole("tab", { name: "Atendimentos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("link", { name: "Voltar para a conversa" }),
    ).toHaveAttribute("href", "/conversas/conv-1");
  });

  test("origem externa no voltar e ignorada: volta para a lista de clientes", async () => {
    render(
      <ShellConfigProvider>
        <ProductCustomersScreen
          customerId="c1"
          returnTo="//evil.example/phish"
          scenario="detail"
        />
      </ShellConfigProvider>,
    );
    await screen.findByRole("heading", { name: "Ana Paula" });

    expect(
      screen.getByRole("link", { name: "Voltar para clientes" }),
    ).toHaveAttribute("href", "/clientes");
  });

  test("os números aparecem no Histórico em frases (pedido de 2026-10-16)", async () => {
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });

    const history = screen.getByRole("region", { name: "Histórico" });
    expect(history).toHaveTextContent(/9 atendimentos/);
    expect(
      within(history).getByText("Volta a cada 7 semanas, em média."),
    ).toBeVisible();
    // Falta e cancelamento dizem o que houve; só o que aconteceu ganha cor.
    expect(within(history).getByText("Nenhuma falta")).toBeVisible();
    const cancelled = within(history).getByText("1 cancelamento");
    expect(cancelled.closest("li")).toHaveClass("is-warning");
    expect(
      within(history).getByText("Nenhuma falta").closest("li"),
    ).not.toHaveClass("is-alert");
  });

  test("o Resumo da IA saiu do perfil (D-174)", async () => {
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });
    expect(screen.queryByText("Resumo da IA")).toBeNull();
    expect(screen.queryByRole("button", { name: "Gerar resumo" })).toBeNull();
  });

  test("cada capacidade listada continua alcançável, cada uma na aba certa", async () => {
    const user = userEvent.setup();
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });

    // Cabeçalho: editar cadastro, agora no menu "⋯" da barra da tela (CL5).
    await user.click(
      screen.getByRole("button", { name: "Mais ações do cliente" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Editar dados" }),
    ).toBeVisible();
    await user.keyboard("{Escape}");

    // Resumo: preferência (memória). O responsável principal abre pelo menu
    // "⋯" (pedido de 2026-10-16).
    expect(
      screen.getByRole("button", { name: "Cadastrar preferência" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Mais ações do cliente" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Responsável principal" }),
    );
    const guardianDialog = screen.getByRole("dialog", {
      name: "Responsável principal",
    });
    expect(
      within(guardianDialog).getByRole("button", {
        name: "Propor responsável",
      }),
    ).toBeVisible();
    await user.keyboard("{Escape}");

    // Atendimentos.
    await user.click(screen.getByRole("tab", { name: "Atendimentos" }));
    expect(await screen.findByText("Nenhum agendamento futuro.")).toBeVisible();

    // Notas: observação e tag.
    await user.click(screen.getByRole("tab", { name: "Notas" }));
    expect(
      screen.getByRole("button", { name: "Nova observação" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Adicionar tag" })).toBeVisible();
  });

  test("o perfil não acusa violação de axe", async () => {
    const { container } = renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });
    await expectNoA11yViolations(container);
  });
});

describe("§6.11 — nenhuma copy técnica proibida, e a preferência mostra a origem por extenso", () => {
  const FORBIDDEN_PHRASES = [
    "Gerenciado pela",
    "Controle completo",
    "pertencem somente",
    "origem, permissão e idade",
    "nasce sem autorização",
    "fonte oficial",
  ];

  test("nenhuma das copies proibidas aparece no perfil", async () => {
    const { container } = renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });

    for (const phrase of FORBIDDEN_PHRASES) {
      expect(container.textContent).not.toContain(phrase);
    }
  });

  test("cadastro gerenciado externamente não usa mais 'fonte oficial'", async () => {
    calendarGetCalendar.mockResolvedValue(
      calendarFixture({
        capabilities: {
          createAppointments: false,
          manageAvailability: false,
          manageCustomers: false,
          manageServices: false,
          migrate: true,
        },
      }),
    );
    const { container } = render(
      <ShellConfigProvider>
        <ProductCustomersScreen scenario="new" />
      </ShellConfigProvider>,
    );

    await screen.findByRole("heading", { name: /Minha Agenda/ });
    expect(container.textContent).not.toContain("fonte oficial");
  });

  test("a preferência mostra a origem por extenso, para cada uma das três origens", async () => {
    customersListMemory.mockResolvedValue([
      memoryFixture({
        id: "mem-1",
        origin: "AI_INFERRED",
        value: "Fim da tarde",
      }),
      memoryFixture({
        id: "mem-2",
        origin: "CUSTOMER_STATED",
        value: "Sem secador muito quente",
      }),
      memoryFixture({
        id: "mem-3",
        origin: "PROFESSIONAL",
        value: "Prefere corte curto",
      }),
    ]);
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });

    expect(await screen.findByText(/· percebida pela IA ·/)).toBeVisible();
    expect(screen.getByText(/· informada pela cliente ·/)).toBeVisible();
    expect(screen.getByText(/· cadastrada por você ·/)).toBeVisible();
  });
});

/**
 * O corpo que `GET /internal/customers/:id` do Scheduling monta e que o BFF
 * repassa: `customerDto` com `nextAppointment`/`lastAppointment` das mesmas
 * consultas da lista, `primaryGuardian`, `notes`, `tags` e
 * `appointmentStats`. Decodificado pelo schema do contrato, como o cliente
 * HTTP do frontend faz, para a fixture não carregar campo que o backend não
 * devolve.
 */
function customerDetailFromBackend(highlights: {
  nextAppointment: Record<string, unknown> | null;
  lastAppointment: Record<string, unknown> | null;
}): CustomerDetail {
  return customerDetailSchema.parse({
    id: "c1",
    name: "Ana Paula",
    phone: "11991234567",
    createdAt: "2025-01-10T10:00:00.000Z",
    updatedAt: "2025-01-10T10:00:00.000Z",
    ...highlights,
    primaryGuardian: null,
    notes: [],
    tags: [],
    appointmentStats: {
      completed: 9,
      noShows: 0,
      cancelled: 1,
      averageIntervalDays: 49,
      firstAppointmentDate: "2025-03-05",
    },
  });
}

describe("Resumo — o próximo atendimento vem do detalhe do backend", () => {
  test("com nextAppointment no corpo do detalhe, o Resumo mostra dia, hora e estado", async () => {
    customersGet.mockResolvedValue(
      customerDetailFromBackend({
        lastAppointment: {
          date: "2026-08-01",
          startTime: "16:00",
          status: "COMPLETED",
        },
        nextAppointment: {
          date: "2026-10-02",
          startTime: "15:30",
          status: "CONFIRMED",
        },
      }),
    );
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });

    const next = await screen.findByRole("region", {
      name: "Próximo atendimento",
    });
    expect(next).toHaveTextContent("02/10");
    expect(next).toHaveTextContent("15:30");
    expect(next).toHaveTextContent("Confirmado");
  });

  test("com nextAppointment null, o Resumo não inventa próximo atendimento", async () => {
    customersGet.mockResolvedValue(
      customerDetailFromBackend({
        lastAppointment: {
          date: "2026-08-01",
          startTime: "16:00",
          status: "COMPLETED",
        },
        nextAppointment: null,
      }),
    );
    renderProfile();
    await screen.findByRole("heading", { name: "Ana Paula" });
    await screen.findByText("Atendimentos");

    expect(
      screen.queryByRole("region", { name: "Próximo atendimento" }),
    ).not.toBeInTheDocument();
  });
});
