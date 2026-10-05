// @vitest-environment jsdom
/**
 * Goal115 — o menu "•••" do chat igual ao quadro K6 e a gravação com escopo.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - as linhas da folha por estado (Não classificada, Comercial, Pessoal e
 *   contato ignorado);
 * - "Ver contato" abre o contexto; "Mover para Comercial" grava com
 *   `scope: "CONTACT"`;
 * - "Marcar como pessoal" abre as duas opções no lugar, sem gravar, com "Só
 *   esta conversa" marcada, e o botão grava com o escopo escolhido;
 * - o erro da gravação fica na folha (`role="alert"`) e a folha só fecha
 *   depois do sucesso;
 * - `Escape` fecha, o foco volta ao "•••" e o foco fica preso enquanto aberta;
 * - "Assumir conversa" mora no contexto e o selo de categoria diz de quem é a
 *   decisão; com você atendendo não há "•••".
 */

import { render, screen, within } from "@testing-library/react";
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
const setCategory = vi.fn();
const setIgnored = vi.fn();
const getCustomer = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { listAppointments: vi.fn().mockResolvedValue([]) },
    customers: { generateSummary: vi.fn(), get: getCustomer },
    conversations: {
      generateSuggestions: vi.fn(),
      get: getConversation,
      getMedia: vi.fn(),
      list: listConversations,
      listEvents,
      listMessages,
      release: vi.fn(),
      resolve: vi.fn(),
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
    customerName: "Renata",
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

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Mais ações" }));
  return screen.findByRole("dialog", { name: "Mais ações" });
}

beforeEach(() => {
  for (const mock of [
    getConversation,
    listMessages,
    listEvents,
    listConversations,
    takeover,
    setCategory,
    setIgnored,
    getCustomer,
  ]) {
    mock.mockReset();
  }
  getCustomer.mockResolvedValue({
    id: "cust-1",
    name: "Renata",
    phone: "5511900000007",
  });
  listConversations.mockResolvedValue([]);
});

describe("as linhas da folha por estado", () => {
  test.each([
    {
      absent: [],
      conversation: { category: "UNCLASSIFIED" as const },
      name: "Não classificada",
      present: [
        "Ver contato",
        "Mover para Comercial",
        "Marcar como pessoal",
        "Ignorar IA para este contato",
      ],
    },
    {
      absent: ["Mover para Comercial"],
      conversation: { category: "COMMERCIAL" as const },
      name: "Comercial",
      present: [
        "Ver contato",
        "Marcar como pessoal",
        "Ignorar IA para este contato",
      ],
    },
    {
      absent: ["Marcar como pessoal"],
      conversation: { category: "PERSONAL" as const },
      name: "Pessoal",
      present: [
        "Ver contato",
        "Mover para Comercial",
        "Ignorar IA para este contato",
      ],
    },
    {
      absent: ["Ignorar IA para este contato"],
      conversation: { ignored: true },
      name: "contato ignorado",
      present: ["Ver contato", "Voltar a usar na IA"],
    },
  ])("$name", async ({ absent, conversation, present }) => {
    await renderThread(conversationFixture(conversation));
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    for (const label of present) {
      expect(within(sheet).getByRole("button", { name: label })).toBeVisible();
    }
    for (const label of absent) {
      expect(within(sheet).queryByRole("button", { name: label })).toBeNull();
    }
    expect(setCategory).not.toHaveBeenCalled();
  });

  test("a folha aberta, com as opções à mostra, não tem violação no axe", async () => {
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    await user.click(
      within(sheet).getByRole("button", { name: "Marcar como pessoal" }),
    );

    await expectNoA11yViolations(sheet);
  });
});

describe("Ver contato e Mover para Comercial", () => {
  test("Ver contato fecha a folha e abre o contexto", async () => {
    await renderThread(conversationFixture({ customerId: "cust-1" }));
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    await user.click(
      within(sheet).getByRole("button", { name: "Ver contato" }),
    );

    expect(screen.queryByRole("dialog", { name: "Mais ações" })).toBeNull();
    const context = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    expect(
      await within(context).findByRole("link", { name: "Ver perfil" }),
    ).toBeVisible();
  });

  test("Mover para Comercial grava com scope CONTACT e fecha a folha", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({
        category: "COMMERCIAL",
        categoryScope: "CONTACT",
        categorySource: "MANUAL",
      }),
    );
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    await user.click(
      within(sheet).getByRole("button", { name: "Mover para Comercial" }),
    );

    expect(setCategory).toHaveBeenCalledTimes(1);
    expect(setCategory).toHaveBeenCalledWith("conv-1", "COMMERCIAL", "CONTACT");
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Mais ações" })).toBeNull(),
    );
  });
});

describe("Marcar como pessoal pergunta onde vale", () => {
  test("abre as opções sem gravar, com Só esta conversa marcada e o nome do contato", async () => {
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    const row = within(sheet).getByRole("button", {
      name: "Marcar como pessoal",
    });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(within(sheet).queryByRole("radiogroup")).toBeNull();

    await user.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    const group = within(sheet).getByRole("radiogroup", {
      name: "Onde a IA para de responder",
    });
    const conversationOnly = within(group).getByRole("radio", {
      name: /Só esta conversa/,
    });
    const always = within(group).getByRole("radio", {
      name: /Sempre, para Renata/,
    });
    expect(conversationOnly).toBeChecked();
    expect(always).not.toBeChecked();
    expect(
      within(group).getByText(
        "A IA para de responder aqui. Uma nova conversa volta ao normal.",
      ),
    ).toBeVisible();
    expect(
      within(group).getByText("A IA nunca mais responde este contato."),
    ).toBeVisible();
    expect(setCategory).not.toHaveBeenCalled();
  });

  test("o botão grava Só esta conversa com scope CONVERSATION e a folha fecha no sucesso", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({
        category: "PERSONAL",
        categoryScope: "CONVERSATION",
        categorySource: "MANUAL",
      }),
    );
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    await user.click(
      within(sheet).getByRole("button", { name: "Marcar como pessoal" }),
    );
    const buttons = within(sheet).getAllByRole("button", {
      name: "Marcar como pessoal",
    });
    await user.click(buttons[buttons.length - 1]);

    expect(setCategory).toHaveBeenCalledTimes(1);
    expect(setCategory).toHaveBeenCalledWith(
      "conv-1",
      "PERSONAL",
      "CONVERSATION",
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Mais ações" })).toBeNull(),
    );
    expect(await screen.findByText(/Pessoal · IA desativada/)).toBeVisible();
  });

  test("escolher Sempre, para {nome} grava com scope CONTACT", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({
        category: "PERSONAL",
        categoryScope: "CONTACT",
        categorySource: "MANUAL",
      }),
    );
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    await user.click(
      within(sheet).getByRole("button", { name: "Marcar como pessoal" }),
    );
    await user.click(
      within(sheet).getByRole("radio", { name: /Sempre, para Renata/ }),
    );
    expect(setCategory).not.toHaveBeenCalled();
    const buttons = within(sheet).getAllByRole("button", {
      name: "Marcar como pessoal",
    });
    await user.click(buttons[buttons.length - 1]);

    expect(setCategory).toHaveBeenCalledWith("conv-1", "PERSONAL", "CONTACT");
  });

  test("a falha fica na folha com role=alert e a folha continua aberta", async () => {
    setCategory.mockRejectedValue(
      new BffHttpError({
        code: "UPSTREAM_ERROR",
        message: "A IA não respondeu.",
        requestId: "req-9",
        status: 502,
      }),
    );
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    await user.click(
      within(sheet).getByRole("button", { name: "Marcar como pessoal" }),
    );
    const buttons = within(sheet).getAllByRole("button", {
      name: "Marcar como pessoal",
    });
    await user.click(buttons[buttons.length - 1]);

    const alert = await within(sheet).findByRole("alert");
    expect(alert).toHaveTextContent("A IA não respondeu. (ID req-9)");
    expect(screen.getByRole("dialog", { name: "Mais ações" })).toBeVisible();
    expect(
      within(sheet).getByRole("radio", { name: /Só esta conversa/ }),
    ).toBeChecked();
  });
});

describe("teclado e foco", () => {
  test("Escape fecha a folha e devolve o foco ao •••", async () => {
    await renderThread(conversationFixture());
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Mais ações" });

    await openSheet(user);
    expect(screen.getByRole("button", { name: "Ver contato" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Mais ações" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test("o foco fica preso enquanto a folha está aberta", async () => {
    await renderThread(conversationFixture({ category: "COMMERCIAL" }));
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    const rows = within(sheet).getAllByRole("button");
    expect(rows).toHaveLength(3);
    rows[rows.length - 1].focus();
    await user.tab();
    expect(rows[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(rows[rows.length - 1]).toHaveFocus();
  });

  test("Ignorar IA para este contato abre o diálogo de ignorar de hoje", async () => {
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const sheet = await openSheet(user);
    await user.click(
      within(sheet).getByRole("button", {
        name: "Ignorar IA para este contato",
      }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Ignorar este contato na IA?",
      }),
    ).toBeVisible();
    expect(setIgnored).not.toHaveBeenCalled();
  });
});

describe("assumir e o selo de categoria moram no contexto", () => {
  async function openContext(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      screen.getByRole("button", { name: "Abrir contexto de Renata" }),
    );
    return screen.findByRole("dialog", { name: "Contexto da conversa" });
  }

  test("Assumir conversa aparece no contexto e chama takeover", async () => {
    takeover.mockResolvedValue(conversationFixture({ handling: "HUMAN" }));
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const context = await openContext(user);
    await user.click(
      within(context).getByRole("button", { name: "Assumir conversa" }),
    );

    expect(takeover).toHaveBeenCalledWith("conv-1");
  });

  test("conversa resolvida não oferece Assumir conversa", async () => {
    await renderThread(conversationFixture({ status: "CLOSED" }));
    const user = userEvent.setup();

    const context = await openContext(user);

    expect(
      within(context).queryByRole("button", { name: "Assumir conversa" }),
    ).toBeNull();
  });

  // Goal116: o selo de quem decidiu virou a frase do controle de tratamento.
  test.each([
    {
      expected: /Só esta conversa está em Pessoal/,
      scope: "CONVERSATION" as const,
    },
    { expected: /está em Pessoal para sempre/, scope: "CONTACT" as const },
  ])(
    "a frase diz de quem é a decisão para categoryScope $scope",
    async ({ expected, scope }) => {
      await renderThread(
        conversationFixture({
          category: "PERSONAL",
          categoryScope: scope,
          categorySource: "MANUAL",
        }),
      );
      const user = userEvent.setup();

      const context = await openContext(user);

      expect(within(context).getByText(expected)).toBeVisible();
    },
  );

  test("sem decisão manual a posição é Automático", async () => {
    await renderThread(conversationFixture({ categoryScope: null }));
    const user = userEvent.setup();

    const context = await openContext(user);

    expect(
      within(context).getByText(/Automático: a IA decide pela conversa/),
    ).toBeVisible();
    expect(
      within(context).getByRole("radio", { name: "Automático" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("as posições do contexto gravam com scope CONTACT", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({
        category: "COMMERCIAL",
        categorySource: "MANUAL",
        contactCategory: "COMMERCIAL",
      }),
    );
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const context = await openContext(user);
    await user.click(
      within(context).getByRole("radio", { name: "Sempre atende" }),
    );

    expect(setCategory).toHaveBeenCalledWith("conv-1", "COMMERCIAL", "CONTACT");
  });
});

describe("com você atendendo não há •••", () => {
  test("o cabeçalho tem Retomar IA e nenhum Mais ações", async () => {
    await renderThread(conversationFixture({ handling: "HUMAN" }));

    expect(screen.queryByRole("button", { name: "Mais ações" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retomar IA" })).toBeVisible();
  });
});
