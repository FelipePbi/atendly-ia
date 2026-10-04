// @vitest-environment jsdom
/**
 * Goal114 — o chat igual aos quadros K1 a K4.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - o estado mora numa linha do cabeçalho, uma por estado (os quatro com
 *   quadro seguem o texto do quadro; os sem quadro usam o rótulo de hoje), e a
 *   barra de estado e o botão "Contexto" não existem mais;
 * - "Retomar IA" fica no cabeçalho com você atendendo e abre o diálogo de
 *   devolver; assumir, resolver, criar agendamento, mudar a categoria e
 *   ignorar continuam alcançáveis pelo menu "Mais ações" ou pelo contexto;
 * - o nome no cabeçalho abre o contexto;
 * - autoria "IA · hh:mm" e "Você · hh:mm", linhas de evento (reserva,
 *   agendamento com "Ver", "Você assumiu a conversa" e o motivo da espera),
 *   áudio com transcrição na mesma bolha, a nota do contato ignorado com
 *   "alterar" e os avisos do composer;
 * - abrir a conversa não pede sugestão nem mídia; "Usar" preenche o rascunho
 *   e nunca envia.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, ConversationEvent, Message } from "@/data";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getConversation = vi.fn();
const listMessages = vi.fn();
const listEvents = vi.fn();
const listConversations = vi.fn();
const sendMessage = vi.fn();
const takeover = vi.fn();
const release = vi.fn();
const resolve = vi.fn();
const setCategory = vi.fn();
const setIgnored = vi.fn();
const generateSuggestions = vi.fn();
const getMedia = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      generateSuggestions,
      get: getConversation,
      getMedia,
      list: listConversations,
      listEvents,
      listMessages,
      release,
      resolve,
      sendMessage,
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

const NOW = new Date("2026-09-14T16:45:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function conversationFixture(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    category: "COMMERCIAL",
    categorySource: "AUTOMATIC",
    customerName: "Ana Paula",
    externalContactId: "5511999990000@c.us",
    handling: "AI",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: minutesAgo(3),
    ...overrides,
  };
}

const liveSession = {
  expiresAt: "2026-09-14T23:00:00.000Z",
  id: "session-1",
  startedAt: "2026-09-14T12:00:00.000Z",
};

function messageFixture(overrides: Partial<Message> = {}): Message {
  return {
    body: "Oi Camila! Quanto tá o corte?",
    createdAt: minutesAgo(8),
    direction: "INBOUND",
    id: "msg-1",
    source: "CUSTOMER",
    ...overrides,
  };
}

const states: Array<{
  conversation: Partial<Conversation>;
  name: string;
  text: string | RegExp;
}> = [
  {
    conversation: { session: liveSession },
    name: "IA atendendo (K1)",
    text: "IA atendendo",
  },
  {
    conversation: {
      handoffReason: "cliente pediu atendimento",
      humanHandoff: true,
      status: "HUMAN_HANDOFF",
      updatedAt: minutesAgo(12),
    },
    name: "aguardando você (K2)",
    text: "Aguardando você · há 12 min",
  },
  {
    conversation: { handling: "HUMAN" },
    name: "você atendendo (K3)",
    text: "Você atendendo",
  },
  {
    conversation: { category: "PERSONAL", ignored: true },
    name: "pessoal (K4)",
    text: "Pessoal · IA desativada",
  },
  { conversation: {}, name: "IA ativa (sem quadro)", text: "IA ativa" },
  {
    conversation: { aiPaused: true },
    name: "IA pausada (sem quadro)",
    text: "IA pausada",
  },
  {
    conversation: {
      handoffReason: "erro: timeout do modelo",
      humanHandoff: true,
      status: "HUMAN_HANDOFF",
    },
    name: "IA com instabilidade (sem quadro)",
    text: "IA com instabilidade",
  },
  {
    conversation: { status: "CLOSED" },
    name: "resolvida (sem quadro)",
    text: "Resolvida",
  },
];

async function renderThread(
  conversation: Conversation,
  messages: Message[] = [messageFixture()],
  events: ConversationEvent[] = [],
) {
  getConversation.mockResolvedValue(conversation);
  listMessages.mockResolvedValue(messages);
  listEvents.mockResolvedValue(events);
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

function headerState(): HTMLElement {
  const node = document.querySelector<HTMLElement>(".chat-header-state");
  expect(node).not.toBeNull();
  return node as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const mock of [
    getConversation,
    listMessages,
    listEvents,
    listConversations,
    sendMessage,
    takeover,
    release,
    resolve,
    setCategory,
    setIgnored,
    generateSuggestions,
    getMedia,
  ]) {
    mock.mockReset();
  }
  listConversations.mockResolvedValue([]);
  URL.createObjectURL = vi.fn(() => "blob:mock-media-url");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("o estado mora no cabeçalho, uma linha por estado", () => {
  test.each(states)("$name", async ({ conversation, text }) => {
    await renderThread(conversationFixture(conversation));

    expect(headerState()).toHaveTextContent(text);
    expect(headerState()).toBeVisible();
  });

  test("o ponto da IA atendendo pulsa, e só nesse estado", async () => {
    const { unmount } = await renderThread(
      conversationFixture({ session: liveSession }),
    );
    expect(document.querySelector(".chat-header-pulse.is-live")).not.toBeNull();
    unmount();

    await renderThread(conversationFixture());
    expect(document.querySelector(".chat-header-pulse")).not.toBeNull();
    expect(document.querySelector(".chat-header-pulse.is-live")).toBeNull();
  });

  test("não há barra de estado nem botão Contexto, e o estado aparece uma vez só", async () => {
    await renderThread(conversationFixture({ session: liveSession }));

    expect(document.querySelector(".conversation-state-bar")).toBeNull();
    expect(screen.getAllByText("IA atendendo")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Contexto$/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Abrir contexto" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Assumir conversa" }),
    ).toBeNull();
    expect(screen.queryByText(/A IA está conduzindo/)).toBeNull();
  });

  test("abaixo de 1024 px o cabeçalho volta para /conversas", async () => {
    await renderThread(conversationFixture());

    expect(
      screen.getByRole("link", { name: "Voltar para conversas" }),
    ).toHaveAttribute("href", "/conversas");
  });
});

describe("toda ação de hoje continua alcançável", () => {
  test("Retomar IA fica no cabeçalho com você atendendo e abre o diálogo de devolver", async () => {
    release.mockResolvedValue(conversationFixture({ handling: "AI" }));
    await renderThread(conversationFixture({ handling: "HUMAN" }));
    const user = userEvent.setup();

    const header = document.querySelector(".chat-header") as HTMLElement;
    await user.click(within(header).getByRole("button", { name: "Retomar IA" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Devolver conversa para a IA?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Retomar IA" }));

    expect(release).toHaveBeenCalledWith("conv-1");
  });

  test("o menu Mais ações traz assumir, criar agendamento, categoria, ignorar e resolver", async () => {
    takeover.mockResolvedValue(conversationFixture({ handling: "HUMAN" }));
    await renderThread(conversationFixture({ session: liveSession }));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    const menu = document.querySelector(".chat-header-more .menu") as HTMLElement;
    expect(menu).not.toBeNull();
    expect(
      within(menu).getByRole("link", { name: "Criar agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo");
    expect(
      within(menu).getByRole("button", { name: "Mudar categoria" }),
    ).toBeVisible();
    expect(
      within(menu).getByRole("button", { name: "Ignorar contato na IA" }),
    ).toBeVisible();
    expect(
      within(menu).getByRole("button", { name: "Marcar como resolvida" }),
    ).toBeEnabled();

    await user.click(
      within(menu).getByRole("button", { name: "Assumir conversa" }),
    );
    expect(takeover).toHaveBeenCalledWith("conv-1");
  });

  test("resolver pelo menu chama resolve", async () => {
    resolve.mockResolvedValue(conversationFixture({ status: "CLOSED" }));
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(
      screen.getByRole("button", { name: "Marcar como resolvida" }),
    );

    expect(resolve).toHaveBeenCalledWith("conv-1");
  });

  test("Mudar categoria abre o contexto com o grupo de categorias", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({ category: "PERSONAL", categorySource: "MANUAL" }),
    );
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(screen.getByRole("button", { name: "Mudar categoria" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    const group = within(dialog).getByRole("group", {
      name: "Categoria da conversa",
    });
    await user.click(within(group).getByRole("button", { name: "Pessoal" }));

    expect(setCategory).toHaveBeenCalledWith("conv-1", "PERSONAL");
  });

  test("Ignorar contato na IA pelo menu pede confirmação antes do efeito", async () => {
    setIgnored.mockResolvedValue(conversationFixture({ ignored: true }));
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(
      screen.getByRole("button", { name: "Ignorar contato na IA" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Ignorar este contato na IA?",
    });
    expect(setIgnored).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Ignorar contato" }),
    );

    expect(setIgnored).toHaveBeenCalledWith("conv-1", true);
  });

  test("com você atendendo (K3, sem menu) resolver, criar agendamento, categoria e ignorar ficam no contexto", async () => {
    await renderThread(conversationFixture({ handling: "HUMAN" }));
    const user = userEvent.setup();

    expect(screen.queryByRole("button", { name: "Mais ações" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Abrir contexto de Ana Paula" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });

    expect(
      within(dialog).getByRole("link", { name: "Criar agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo");
    expect(
      within(dialog).getByRole("group", { name: "Categoria da conversa" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Ignorar contato na IA" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Marcar como resolvida" }),
    ).toBeEnabled();
  });

  test("o nome com o chevron abre o contexto", async () => {
    await renderThread(conversationFixture({ customerId: "cust-7" }));
    const user = userEvent.setup();

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Abrir contexto de Ana Paula" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });
    expect(
      within(dialog).getByRole("link", { name: "Abrir cliente" }),
    ).toHaveAttribute("href", "/clientes/detalhes?id=cust-7");
  });
});

describe("a timeline do quadro", () => {
  test("rótulos de autoria: IA e Você com hora, cliente só com hora", async () => {
    await renderThread(conversationFixture(), [
      messageFixture(),
      messageFixture({
        body: "Oi, Ana! O corte é R$ 90.",
        direction: "OUTBOUND",
        id: "msg-ai",
        source: "AI",
      }),
      messageFixture({
        body: "Consigo sim!",
        direction: "OUTBOUND",
        id: "msg-owner",
        source: "OWNER",
      }),
    ]);

    const meta = (text: string) =>
      screen.getByText(text).closest(".message-group")?.querySelector(
        ".message-meta",
      )?.textContent;
    expect(meta("Oi, Ana! O corte é R$ 90.")).toMatch(/^IA · \d{2}:\d{2}$/);
    expect(meta("Consigo sim!")).toMatch(/^Você · \d{2}:\d{2}$/);
    expect(meta("Oi Camila! Quanto tá o corte?")).toMatch(/^\d{2}:\d{2}$/);
  });

  test("reserva e agendamento criado viram linhas de evento, com o link Ver", async () => {
    await renderThread(
      conversationFixture({ session: liveSession }),
      [messageFixture()],
      [
        {
          date: "2026-09-19",
          holdExpiresAt: "2026-09-14T16:46:00.000Z",
          id: "hold-1",
          occurredAt: minutesAgo(5),
          startTime: "15:30",
          type: "HOLD_PLACED",
        },
        {
          appointmentId: "appt-1",
          date: "2026-09-19",
          id: "created-1",
          occurredAt: minutesAgo(4),
          startTime: "15:30",
          type: "APPOINTMENT_CREATED",
        },
      ],
    );

    const timeline = screen.getByRole("log");
    expect(
      await within(timeline).findByText(/Horário reservado até 13:46/),
    ).toBeVisible();
    expect(within(timeline).getByText(/Agendamento criado/)).toBeVisible();
    expect(within(timeline).getByRole("link", { name: "Ver" })).toHaveAttribute(
      "href",
      "/agenda/agendamento?id=appt-1",
    );
    expect(
      timeline.querySelectorAll(".conversation-event .conversation-event-label"),
    ).toHaveLength(2);
  });

  test("Você assumiu a conversa entra no seu instante, vindo de humanHandlingSince", async () => {
    await renderThread(
      conversationFixture({
        handling: "HUMAN",
        session: { ...liveSession, humanHandlingSince: minutesAgo(6) },
      }),
      [
        messageFixture({ createdAt: minutesAgo(8), id: "m-before" }),
        messageFixture({
          body: "Consigo sim!",
          createdAt: minutesAgo(4),
          direction: "OUTBOUND",
          id: "m-after",
          source: "OWNER",
        }),
      ],
    );

    const line = screen.getByText(/Você assumiu a conversa · \d{2}:\d{2}/);
    const rows = Array.from(
      screen.getByRole("log").querySelectorAll(".message-group, .conversation-event"),
    );
    const index = rows.indexOf(line.closest(".conversation-event") as Element);
    expect(index).toBe(1);
  });

  test("o motivo da espera vira a linha do K2, logo depois da imagem recebida", async () => {
    await renderThread(
      conversationFixture({
        handoffReason: "image_received",
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        updatedAt: minutesAgo(12),
      }),
      [
        messageFixture({ createdAt: minutesAgo(17), id: "m-1" }),
        messageFixture({
          attachment: {
            durationSeconds: null,
            fileName: null,
            kind: "IMAGE",
            mediaAvailable: true,
            mimetype: "image/jpeg",
            sizeBytes: 1024,
            tooLarge: false,
            transcript: null,
            transcriptError: null,
            transcriptStatus: null,
          },
          body: "",
          createdAt: minutesAgo(16),
          id: "m-image",
          kind: "IMAGE",
        }),
        messageFixture({
          body: "Quero falar com a Camila, por favor",
          createdAt: minutesAgo(15),
          id: "m-3",
        }),
      ],
    );

    expect(headerState()).toHaveTextContent("Aguardando você · há 12 min");
    const notice = screen.getByText(
      "Imagem recebida · a IA pausou e está aguardando você",
    );
    const rows = Array.from(
      screen.getByRole("log").querySelectorAll(".message-group, .conversation-event"),
    );
    expect(rows.indexOf(notice.closest(".conversation-event") as Element)).toBe(2);
    expect(
      screen.getByRole("button", { name: /Ver mídia/ }),
    ).toBeVisible();
  });

  test("áudio e transcrição ficam dentro da mesma bolha", async () => {
    await renderThread(conversationFixture({ handling: "HUMAN" }), [
      messageFixture({
        attachment: {
          durationSeconds: 14,
          fileName: null,
          kind: "AUDIO",
          mediaAvailable: true,
          mimetype: "audio/ogg",
          sizeBytes: 2048,
          tooLarge: false,
          transcript: "Consegue encaixar uma hidratação?",
          transcriptError: null,
          transcriptStatus: "DONE",
        },
        body: "",
        id: "m-audio",
        kind: "AUDIO",
      }),
    ]);

    const bubble = screen
      .getByText("Consegue encaixar uma hidratação?")
      .closest(".message-bubble") as HTMLElement;
    expect(bubble).not.toBeNull();
    expect(within(bubble).getByText("Transcrição")).toBeVisible();
    expect(within(bubble).getByRole("button", { name: "Ouvir áudio" })).toBeVisible();
    expect(within(bubble).getByText("0:14")).toBeVisible();
  });

  test("K4: contato ignorado mostra a nota, e alterar abre o diálogo de ignorar", async () => {
    setIgnored.mockResolvedValue(
      conversationFixture({ category: "PERSONAL", ignored: false }),
    );
    await renderThread(
      conversationFixture({ category: "PERSONAL", ignored: true }),
    );
    const user = userEvent.setup();

    expect(screen.getByText(/A IA nunca responde este contato/)).toBeVisible();
    const note = screen
      .getByText(/A IA nunca responde este contato/)
      .closest(".chat-ignored-note") as HTMLElement;
    const alterar = screen.getByRole("button", { name: "alterar" });
    expect(alterar.parentElement).toBe(note);
    expect(
      screen.getByText(/A IA nunca responde este contato/).parentElement,
    ).toBe(note);
    await user.click(alterar);
    const dialog = await screen.findByRole("dialog", {
      name: "Voltar a usar este contato na IA?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Voltar a usar na IA" }),
    );

    expect(setIgnored).toHaveBeenCalledWith("conv-1", false);
  });

  test("sem ignorar não há nota", async () => {
    await renderThread(conversationFixture());

    expect(screen.queryByText(/A IA nunca responde este contato/)).toBeNull();
  });
});

describe("os avisos do composer", () => {
  test("K1: com a IA atendendo, o aviso diz que enviar assume", async () => {
    await renderThread(conversationFixture({ session: liveSession }));

    const field = screen.getByLabelText("Mensagem");
    expect(
      screen.getByText(
        "Ao enviar uma mensagem, você assume a conversa e a IA pausa aqui.",
      ),
    ).toBeVisible();
    expect(field).toHaveAccessibleDescription(
      "Ao enviar uma mensagem, você assume a conversa e a IA pausa aqui.",
    );
    expect(field).toHaveAttribute("placeholder", "Mensagem");
  });

  test("K2: aguardando você, o campo diz que a primeira mensagem assume", async () => {
    await renderThread(
      conversationFixture({ humanHandoff: true, status: "HUMAN_HANDOFF" }),
    );

    expect(screen.getByLabelText("Mensagem")).toHaveAttribute(
      "placeholder",
      "Sua primeira mensagem assume a conversa",
    );
    expect(screen.queryByText(/Ao enviar uma mensagem/)).toBeNull();
  });

  test("K3 e K4: sem aviso, só Mensagem", async () => {
    const { unmount } = await renderThread(
      conversationFixture({ handling: "HUMAN" }),
    );
    expect(screen.getByLabelText("Mensagem")).toHaveAttribute(
      "placeholder",
      "Mensagem",
    );
    expect(screen.queryByText(/assume a conversa/)).toBeNull();
    unmount();

    await renderThread(
      conversationFixture({ category: "PERSONAL", ignored: true }),
    );
    expect(screen.getByLabelText("Mensagem")).toHaveAttribute(
      "placeholder",
      "Mensagem",
    );
  });

  test("resolvida: o aviso diz isso e o campo fica bloqueado", async () => {
    await renderThread(conversationFixture({ status: "CLOSED" }));

    expect(
      screen.getByText("Esta conversa foi marcada como resolvida."),
    ).toBeVisible();
    expect(screen.getByLabelText("Mensagem")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Enviar mensagem" }),
    ).toBeDisabled();
  });
});

describe("sugestão e mídia só sob demanda", () => {
  test("abrir a conversa não pede sugestão nem mídia", async () => {
    await renderThread(
      conversationFixture({ humanHandoff: true, status: "HUMAN_HANDOFF" }),
      [
        messageFixture({
          attachment: {
            durationSeconds: 3,
            fileName: null,
            kind: "AUDIO",
            mediaAvailable: true,
            mimetype: "audio/ogg",
            sizeBytes: 10,
            tooLarge: false,
            transcript: null,
            transcriptError: null,
            transcriptStatus: "PENDING",
          },
          id: "m-audio",
        }),
      ],
    );

    expect(
      screen.getByRole("button", { name: "Sugerir resposta" }),
    ).toBeVisible();
    expect(generateSuggestions).not.toHaveBeenCalled();
    expect(getMedia).not.toHaveBeenCalled();
    expect(listConversations).not.toHaveBeenCalled();
  });

  test("o cartão aberto é tracejado e rotulado; Usar preenche e nunca envia, Editar preenche e foca", async () => {
    generateSuggestions.mockResolvedValue({
      suggestions: ["Então fica Escova + Hidratação, hoje às 15h."],
    });
    await renderThread(conversationFixture({ handling: "HUMAN" }));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sugerir resposta" }));
    const card = await screen.findByRole("group", { name: "Sugestões da IA" });
    expect(within(card).getByText("Sugestão da IA")).toBeVisible();
    expect(card).toHaveClass("composer-suggestion-card");

    await user.click(within(card).getByRole("button", { name: /^Usar/ }));
    const field = screen.getByLabelText<HTMLTextAreaElement>("Mensagem");
    expect(field.value).toBe("Então fica Escova + Hidratação, hoje às 15h.");
    expect(sendMessage).not.toHaveBeenCalled();

    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Sugerir resposta" }));
    const again = await screen.findByRole("group", { name: "Sugestões da IA" });
    await user.click(within(again).getByRole("button", { name: /^Editar/ }));
    expect(field.value).toBe("Então fica Escova + Hidratação, hoje às 15h.");
    expect(field).toHaveFocus();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
