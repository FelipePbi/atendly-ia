// @vitest-environment jsdom
/**
 * Goal116 — a folha do cliente (quadro K5) e o controle "Como a IA trata este
 * contato".
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - o nome com o chevron e "Ver contato" abrem a folha; o foco fica preso,
 *   `Escape` fecha e o foco volta a quem abriu;
 * - a posição marcada e a frase de cada combinação de `ignored`,
 *   `contactCategory` e `categoryScope`, inclusive a resposta antiga sem
 *   `contactCategory`;
 * - Automático e Sempre atende gravam `scope: "CONTACT"`; Nunca responde só
 *   grava `ignored: true` depois do diálogo;
 * - sair de Nunca responde grava a categoria antes de `ignored: false`, e a
 *   falha da primeira gravação impede a segunda;
 * - tocar a posição já marcada não grava, e a posição vem da resposta;
 * - o cliente: "cliente desde", Ver perfil, Próximo e Último com serviços e
 *   valor só com `finalValue`; estado próprio sem `customerId`; carregamento e
 *   erro com "Tentar de novo";
 * - sem resumo da IA (saiu em 2026-10-12);
 * - "Nesta conversa": Assumir conversa, Criar agendamento e Marcar como
 *   resolvida.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation } from "@/data";
import { BffHttpError } from "@/data/http/BffHttpClient";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getConversation = vi.fn();
const listMessages = vi.fn();
const listEvents = vi.fn();
const listConversations = vi.fn();
const takeover = vi.fn();
const resolve = vi.fn();
const setCategory = vi.fn();
const setIgnored = vi.fn();
const getCustomer = vi.fn();
const generateSummary = vi.fn();
const listAppointments = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { listAppointments },
    customers: { generateSummary, get: getCustomer },
    conversations: {
      generateSuggestions: vi.fn(),
      get: getConversation,
      getMedia: vi.fn(),
      list: listConversations,
      listEvents,
      listMessages,
      release: vi.fn(),
      resolve,
      sendMessage: vi.fn(),
      setCategory,
      setIgnored,
      takeover,
    },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: {
        businessName: "Studio Marina",
        timezone: "America/Sao_Paulo",
      },
      tenant: { name: "Studio Marina" },
    },
  }),
}));

function conversationFixture(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    category: "UNCLASSIFIED",
    categorySource: "AUTOMATIC",
    customerId: "cust-1",
    customerName: "Ana Paula",
    externalContactId: "5511900000007@c.us",
    handling: "AI",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function customerFixture(overrides: Record<string, unknown> = {}) {
  return {
    appointmentStats: {
      averageIntervalDays: null,
      cancelled: 0,
      completed: 3,
      firstAppointmentDate: "2025-03-12",
      noShows: 0,
    },
    id: "cust-1",
    lastAppointment: {
      date: "2026-08-15",
      startTime: "10:00",
      status: "COMPLETED",
    },
    name: "Ana Paula",
    nextAppointment: {
      date: "2026-10-20",
      startTime: "15:30",
      status: "CONFIRMED",
    },
    phone: "5511900000007",
    ...overrides,
  };
}

function appointmentFixture(overrides: Record<string, unknown>) {
  return {
    finalValue: null,
    services: [],
    title: "",
    ...overrides,
  };
}

function bffError(status: number, requestId: string) {
  return new BffHttpError({
    code: "REQUEST_FAILED",
    message: "A gravação falhou.",
    requestId,
    status,
  });
}

async function renderThread(conversation: Conversation) {
  getConversation.mockResolvedValue(conversation);
  listMessages.mockResolvedValue([]);
  listEvents.mockResolvedValue([]);
  const result = render(
    <ShellConfigProvider>
      <ConversationThread conversationId={conversation.id} />
    </ShellConfigProvider>,
  );
  await screen.findByLabelText(
    `Histórico da conversa com ${conversation.customerName}`,
  );
  return result;
}

async function openSheetByName(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Abrir contexto de Ana Paula" }),
  );
  return screen.findByRole("dialog", { name: "Contexto da conversa" });
}

beforeEach(() => {
  for (const mock of [
    getConversation,
    listMessages,
    listEvents,
    listConversations,
    takeover,
    resolve,
    setCategory,
    setIgnored,
    getCustomer,
    generateSummary,
    listAppointments,
  ]) {
    mock.mockReset();
  }
  getCustomer.mockResolvedValue(
    customerFixture({ lastAppointment: null, nextAppointment: null }),
  );
  listAppointments.mockResolvedValue([]);
  listConversations.mockResolvedValue([]);
});

describe("abrir e fechar a folha", () => {
  test("o nome com o chevron abre a folha e Escape devolve o foco ao nome", async () => {
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", {
      name: "Abrir contexto de Ana Paula",
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test("Ver contato do menu abre a mesma folha", async () => {
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(screen.getByRole("button", { name: "Ver contato" }));

    expect(
      await screen.findByRole("dialog", { name: "Contexto da conversa" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Mais ações" })).toBeNull();
  });

  test("o foco fica preso na folha: Tab e Shift+Tab não saem dela", async () => {
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    for (let step = 0; step < 14; step += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let step = 0; step < 14; step += 1) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  test("a folha aberta não tem violações de acessibilidade", async () => {
    getCustomer.mockResolvedValue(customerFixture());
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);
    await within(dialog).findByRole("link", { name: "Ver perfil" });

    await expectNoA11yViolations(document.body);
  });
});

describe("a posição e a frase por combinação", () => {
  test.each([
    {
      checked: "Automático",
      name: "sem decisão: Automático",
      overrides: { contactCategory: null },
      phrase: /Automático: a IA decide pela conversa/,
    },
    {
      checked: "Sempre atende",
      name: "contactCategory COMMERCIAL: Sempre atende",
      overrides: { contactCategory: "COMMERCIAL" as const },
      phrase: /Sempre atende: a IA responde Ana Paula/,
    },
    {
      checked: "Nunca responde",
      name: "ignorada: Nunca responde",
      overrides: { ignored: true },
      phrase: /Nunca responde: a IA não responde nem usa as conversas/,
    },
    {
      checked: null,
      name: "Pessoal para sempre: nenhuma posição",
      overrides: {
        category: "PERSONAL" as const,
        contactCategory: "PERSONAL" as const,
      },
      phrase: /Ana Paula está em Pessoal para sempre/,
    },
    {
      checked: "Automático",
      name: "Pessoal só nesta conversa, contato sem decisão: Automático",
      overrides: {
        category: "PERSONAL" as const,
        categoryScope: "CONVERSATION" as const,
        contactCategory: null,
      },
      phrase: /Só esta conversa está em Pessoal/,
    },
  ])("$name", async ({ checked, overrides, phrase }) => {
    await renderThread(conversationFixture(overrides));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    for (const label of ["Automático", "Sempre atende", "Nunca responde"]) {
      expect(
        within(dialog).getByRole("radio", { name: label }),
      ).toHaveAttribute("aria-checked", String(label === checked));
    }
    expect(within(dialog).getByText(phrase)).toBeVisible();
  });

  test.each([
    {
      checked: "Automático",
      name: "sem escopo",
      overrides: { categoryScope: null },
    },
    {
      checked: "Sempre atende",
      name: "escopo CONTACT com Comercial",
      overrides: {
        category: "COMMERCIAL" as const,
        categoryScope: "CONTACT" as const,
      },
    },
    {
      checked: null,
      name: "escopo CONTACT com Pessoal",
      overrides: {
        category: "PERSONAL" as const,
        categoryScope: "CONTACT" as const,
      },
    },
    {
      checked: null,
      name: "escopo CONVERSATION",
      overrides: {
        category: "PERSONAL" as const,
        categoryScope: "CONVERSATION" as const,
      },
    },
  ])(
    "resposta antiga sem contactCategory: $name",
    async ({ checked, overrides }) => {
      const conversation = conversationFixture(overrides);
      expect("contactCategory" in conversation).toBe(false);
      await renderThread(conversation);
      const user = userEvent.setup();
      const dialog = await openSheetByName(user);

      for (const label of ["Automático", "Sempre atende", "Nunca responde"]) {
        expect(
          within(dialog).getByRole("radio", { name: label }),
        ).toHaveAttribute("aria-checked", String(label === checked));
      }
    },
  );
});

describe("as gravações do controle", () => {
  test("Sempre atende grava COMMERCIAL com scope CONTACT e a posição vem da resposta", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({
        category: "COMMERCIAL",
        categoryScope: "CONTACT",
        categorySource: "MANUAL",
        contactCategory: "COMMERCIAL",
      }),
    );
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);
    const always = within(dialog).getByRole("radio", { name: "Sempre atende" });
    expect(always).toHaveAttribute("aria-checked", "false");

    await user.click(always);

    expect(setCategory).toHaveBeenCalledWith("conv-1", "COMMERCIAL", "CONTACT");
    expect(setIgnored).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        within(dialog).getByRole("radio", { name: "Sempre atende" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
  });

  test("Automático grava category null com scope CONTACT", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({ contactCategory: null }),
    );
    await renderThread(
      conversationFixture({
        category: "COMMERCIAL",
        categoryScope: "CONTACT",
        categorySource: "MANUAL",
        contactCategory: "COMMERCIAL",
      }),
    );
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    await user.click(within(dialog).getByRole("radio", { name: "Automático" }));

    expect(setCategory).toHaveBeenCalledWith("conv-1", null, "CONTACT");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("radio", { name: "Automático" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
  });

  test("tocar a posição já marcada não grava", async () => {
    await renderThread(conversationFixture({ contactCategory: null }));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    await user.click(within(dialog).getByRole("radio", { name: "Automático" }));

    expect(setCategory).not.toHaveBeenCalled();
    expect(setIgnored).not.toHaveBeenCalled();
  });

  test("Pessoal só nesta conversa: tocar Automático, já marcado, grava para tirar a conversa de Pessoal", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({ contactCategory: null }),
    );
    await renderThread(
      conversationFixture({
        category: "PERSONAL",
        categoryScope: "CONVERSATION",
        contactCategory: null,
      }),
    );
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);
    const automatic = within(dialog).getByRole("radio", { name: "Automático" });
    expect(automatic).toHaveAttribute("aria-checked", "true");

    await user.click(automatic);

    expect(setCategory).toHaveBeenCalledWith("conv-1", null, "CONTACT");
  });

  test("tocar Nunca responde já marcado não abre o diálogo nem grava", async () => {
    await renderThread(conversationFixture({ ignored: true }));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    await user.click(
      within(dialog).getByRole("radio", { name: "Nunca responde" }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Ignorar este contato na IA?" }),
    ).toBeNull();
    expect(setCategory).not.toHaveBeenCalled();
    expect(setIgnored).not.toHaveBeenCalled();
  });

  test("falha da gravação fica na folha com role=alert e não muda a posição", async () => {
    setCategory.mockRejectedValue(bffError(400, "req-9"));
    await renderThread(conversationFixture({ contactCategory: null }));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    await user.click(
      within(dialog).getByRole("radio", { name: "Sempre atende" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "A gravação falhou. (ID",
    );
    expect(
      within(dialog).getByRole("radio", { name: "Automático" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

describe("Nunca responde e a saída dele", () => {
  test("Nunca responde abre o diálogo e só grava ignored:true ao confirmar", async () => {
    setIgnored.mockResolvedValue(conversationFixture({ ignored: true }));
    await renderThread(conversationFixture({ contactCategory: null }));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    await user.click(
      within(dialog).getByRole("radio", { name: "Nunca responde" }),
    );

    const confirm = await screen.findByRole("dialog", {
      name: "Ignorar este contato na IA?",
    });
    expect(setIgnored).not.toHaveBeenCalled();
    expect(setCategory).not.toHaveBeenCalled();

    await user.click(
      within(confirm).getByRole("button", { name: "Ignorar contato" }),
    );

    expect(setIgnored).toHaveBeenCalledWith("conv-1", true);
    expect(setCategory).not.toHaveBeenCalled();
    const reopened = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    await waitFor(() =>
      expect(
        within(reopened).getByRole("radio", { name: "Nunca responde" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
  });

  test("cancelar o diálogo não grava e devolve a folha", async () => {
    await renderThread(conversationFixture({ contactCategory: null }));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    await user.click(
      within(dialog).getByRole("radio", { name: "Nunca responde" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Ignorar este contato na IA?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));

    expect(setIgnored).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("dialog", { name: "Contexto da conversa" }),
    ).toBeVisible();
  });

  test("a falha de ignored:true volta para a folha com role=alert", async () => {
    setIgnored.mockRejectedValue(bffError(400, "req-3"));
    await renderThread(conversationFixture({ contactCategory: null }));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    await user.click(
      within(dialog).getByRole("radio", { name: "Nunca responde" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Ignorar este contato na IA?",
    });
    await user.click(
      within(confirm).getByRole("button", { name: "Ignorar contato" }),
    );

    const reopened = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    expect(await within(reopened).findByRole("alert")).toBeVisible();
    expect(
      within(reopened).getByRole("radio", { name: "Automático" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  async function leaveNeverRespond(
    user: ReturnType<typeof userEvent.setup>,
    label: string,
  ) {
    const dialog = await openSheetByName(user);
    await user.click(within(dialog).getByRole("radio", { name: label }));
    return screen.findByRole("dialog", {
      name: "Voltar a usar este contato na IA?",
    });
  }

  test.each([
    {
      expected: ["conv-1", null, "CONTACT"] as const,
      label: "Automático",
    },
    {
      expected: ["conv-1", "COMMERCIAL", "CONTACT"] as const,
      label: "Sempre atende",
    },
  ])(
    "sair para $label abre o diálogo, não grava antes e grava a categoria antes de ignored:false",
    async ({ expected, label }) => {
      const order: string[] = [];
      setCategory.mockImplementation(async () => {
        order.push("category");
        return conversationFixture({ ignored: true });
      });
      setIgnored.mockImplementation(async () => {
        order.push("ignored");
        return conversationFixture({ ignored: false });
      });
      await renderThread(conversationFixture({ ignored: true }));
      const user = userEvent.setup();

      const confirm = await leaveNeverRespond(user, label);

      expect(setCategory).not.toHaveBeenCalled();
      expect(setIgnored).not.toHaveBeenCalled();

      await user.click(
        within(confirm).getByRole("button", { name: "Voltar a usar na IA" }),
      );

      await waitFor(() => expect(setIgnored).toHaveBeenCalled());
      expect(setCategory).toHaveBeenCalledWith(...expected);
      expect(setIgnored).toHaveBeenCalledWith("conv-1", false);
      expect(order).toEqual(["category", "ignored"]);
      expect(
        await screen.findByRole("dialog", { name: "Contexto da conversa" }),
      ).toBeVisible();
    },
  );

  test("cancelar o diálogo de saída não grava e devolve a folha", async () => {
    await renderThread(conversationFixture({ ignored: true }));
    const user = userEvent.setup();

    const confirm = await leaveNeverRespond(user, "Automático");
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));

    expect(setCategory).not.toHaveBeenCalled();
    expect(setIgnored).not.toHaveBeenCalled();
    const sheet = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    expect(
      within(sheet).getByRole("radio", { name: "Nunca responde" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("se a categoria falha, setIgnored não é chamado e o erro fica na folha", async () => {
    setCategory.mockRejectedValue(bffError(400, "req-5"));
    await renderThread(conversationFixture({ ignored: true }));
    const user = userEvent.setup();

    const confirm = await leaveNeverRespond(user, "Automático");
    await user.click(
      within(confirm).getByRole("button", { name: "Voltar a usar na IA" }),
    );

    const sheet = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "A gravação falhou. (ID",
    );
    expect(setCategory).toHaveBeenCalledTimes(1);
    expect(setIgnored).not.toHaveBeenCalled();
    expect(
      within(sheet).getByRole("radio", { name: "Nunca responde" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("se a categoria grava e ignored:false falha, o contato continua ignorado e o erro fica na folha", async () => {
    setCategory.mockResolvedValue(conversationFixture({ ignored: true }));
    setIgnored.mockRejectedValue(bffError(400, "req-6"));
    await renderThread(conversationFixture({ ignored: true }));
    const user = userEvent.setup();

    const confirm = await leaveNeverRespond(user, "Automático");
    await user.click(
      within(confirm).getByRole("button", { name: "Voltar a usar na IA" }),
    );

    const sheet = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    expect(await within(sheet).findByRole("alert")).toBeVisible();
    expect(setCategory).toHaveBeenCalledTimes(1);
    expect(setIgnored).toHaveBeenCalledTimes(1);
    expect(
      within(sheet).getByRole("radio", { name: "Nunca responde" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

describe("o cliente na folha", () => {
  test("cliente desde, Ver perfil, Próximo e Último com serviços; valor só com finalValue", async () => {
    getCustomer.mockResolvedValue(customerFixture());
    listAppointments.mockResolvedValue([
      appointmentFixture({
        date: "2026-08-15",
        finalValue: 90,
        services: [{ name: "Corte feminino" }],
        startTime: "10:00",
      }),
      appointmentFixture({
        date: "2026-10-20",
        finalValue: null,
        services: [{ name: "Escova" }, { name: "Hidratação" }],
        startTime: "15:30",
      }),
    ]);
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    expect(
      await within(dialog).findByRole("link", { name: "Ver perfil" }),
    ).toHaveAttribute("href", "/clientes/detalhes?id=cust-1&voltar=%2Fconversas%2Fconv-1");
    expect(getCustomer).toHaveBeenCalledWith("cust-1", expect.anything());
    expect(listAppointments).toHaveBeenCalledWith(
      {
        customerId: "cust-1",
        endDate: "2026-10-20",
        startDate: "2026-08-15",
      },
      expect.anything(),
    );
    expect(within(dialog).getByText(/cliente desde mar 2025/)).toBeVisible();
    expect(within(dialog).getByText("Próximo")).toBeVisible();
    expect(
      within(dialog).getByText(/15:30 · Escova, Hidratação/),
    ).toBeVisible();
    expect(within(dialog).queryByText(/Escova, Hidratação.*R\$/)).toBeNull();
    expect(within(dialog).getByText("Confirmado")).toBeVisible();
    expect(within(dialog).getByText("Último")).toBeVisible();
    expect(within(dialog).getByText(/Corte feminino · R\$\s90/)).toBeVisible();
  });

  test("sem finalValue o Último não mostra valor", async () => {
    getCustomer.mockResolvedValue(customerFixture({ nextAppointment: null }));
    listAppointments.mockResolvedValue([
      appointmentFixture({
        date: "2026-08-15",
        finalValue: null,
        services: [{ name: "Corte feminino" }],
        startTime: "10:00",
      }),
    ]);
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    const line = await within(dialog).findByText(/Corte feminino/);
    expect(line).not.toHaveTextContent("R$");
  });

  test("conversa sem customerId tem estado próprio e não lê cliente", async () => {
    await renderThread(conversationFixture({ customerId: null }));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    expect(
      within(dialog).getByText(
        "Este contato ainda não é um cliente cadastrado.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("link", { name: "Ver perfil" }),
    ).toBeNull();
    expect(getCustomer).not.toHaveBeenCalled();
    expect(
      within(dialog).getByRole("radiogroup", {
        name: "Como a IA trata este contato",
      }),
    ).toBeVisible();
  });

  test("carregando o cliente a folha mostra aria-busy e o controle já está lá", async () => {
    getCustomer.mockReturnValue(new Promise(() => {}));
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Carregando cliente",
    );
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(
      within(dialog).getByRole("radio", { name: "Automático" }),
    ).toBeVisible();
  });

  test("erro ao carregar tem Tentar de novo, que lê de novo", async () => {
    getCustomer.mockRejectedValueOnce(bffError(500, "req-1"));
    getCustomer.mockResolvedValue(customerFixture());
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar este cliente.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Tentar de novo" }),
    );

    expect(
      await within(dialog).findByRole("link", { name: "Ver perfil" }),
    ).toBeVisible();
    expect(getCustomer).toHaveBeenCalledTimes(2);
  });
});

describe("o resumo da IA", () => {
  // Decisao de 2026-10-12: o resumo da IA saiu da folha do cliente na
  // conversa (o perfil do cliente continua com o dele).
  test("a folha do cliente na conversa não tem resumo da IA", async () => {
    getCustomer.mockResolvedValue(customerFixture());
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);
    await within(dialog).findByRole("link", { name: "Ver perfil" });

    expect(within(dialog).queryByRole("region", { name: "Resumo da IA" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Gerar resumo" })).toBeNull();
    expect(generateSummary).not.toHaveBeenCalled();
  });
});

describe("atalho para os agendamentos do cliente", () => {
  // Pedido de 2026-10-12: ir direto da folha para a lista de agendamentos.
  test("Ver agendamentos abre o perfil na aba Atendimentos", async () => {
    getCustomer.mockResolvedValue(customerFixture());
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);
    const link = await within(dialog).findByRole("link", { name: "Ver agendamentos" });

    expect(link).toHaveAttribute(
      "href",
      "/clientes/detalhes?id=cust-1&aba=atendimentos&voltar=%2Fconversas%2Fconv-1",
    );
  });
});

describe("a seção Nesta conversa", () => {
  test("Assumir conversa chama takeover e fecha a folha", async () => {
    takeover.mockResolvedValue(conversationFixture({ handling: "HUMAN" }));
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    await user.click(
      within(dialog).getByRole("button", { name: "Assumir conversa" }),
    );

    expect(takeover).toHaveBeenCalledWith("conv-1");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("com você atendendo não há Assumir conversa", async () => {
    await renderThread(conversationFixture({ handling: "HUMAN" }));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    expect(
      within(dialog).queryByRole("button", { name: "Assumir conversa" }),
    ).toBeNull();
  });

  test("conversa resolvida não oferece Assumir e desabilita Marcar como resolvida", async () => {
    await renderThread(conversationFixture({ status: "CLOSED" }));
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    expect(
      within(dialog).queryByRole("button", { name: "Assumir conversa" }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Marcar como resolvida" }),
    ).toBeDisabled();
  });

  test("Criar agendamento é o link da agenda", async () => {
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    expect(
      within(dialog).getByRole("link", { name: "Criar agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo");
  });

  test("Marcar como resolvida chama resolve e fecha a folha", async () => {
    resolve.mockResolvedValue(conversationFixture({ status: "CLOSED" }));
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const dialog = await openSheetByName(user);

    await user.click(
      within(dialog).getByRole("button", { name: "Marcar como resolvida" }),
    );

    expect(resolve).toHaveBeenCalledWith("conv-1");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
