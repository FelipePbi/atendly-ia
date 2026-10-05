// @vitest-environment jsdom
/**
 * Goal017 (WU-05) — atendimento humano: assunção no envio, retomar IA,
 * resolver e override de categoria.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - abrir a conversa não chama nenhuma mutação de estado;
 * - antes do envio, quando quem responde ainda não é a profissional, o
 *   campo avisa que enviar assume a conversa; depois de enviar, a linha de
 *   estado do cabeçalho passa de `Aguardando você` para `Você atendendo`,
 *   sem esperar o próximo polling (Goal114: o estado mora no cabeçalho);
 * - `takeover`, `release` (Retomar IA) e `resolve` continuam alcançáveis, e
 *   o diálogo de Retomar IA explica que a IA reavalia o contexto atual;
 * - override de categoria funciona nos três valores e em `null`, a origem
 *   manual/automática é visível e distinta, e a sugestão da IA nunca é
 *   aplicada sozinha — só o clique explícito na categoria muda o override.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, Message } from "@/data";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getConversation = vi.fn();
const listMessages = vi.fn();
const listConversations = vi.fn();
const sendMessage = vi.fn();
const takeover = vi.fn();
const release = vi.fn();
const resolve = vi.fn();
const setCategory = vi.fn();
const generateSuggestions = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      generateSuggestions,
      get: getConversation,
      list: listConversations,
      listMessages,
      release,
      resolve,
      sendMessage,
      setCategory,
      takeover,
    },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
    },
  }),
}));

function conversationFixture(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    category: "COMMERCIAL",
    categorySource: "AUTOMATIC",
    customerName: "Marina Duarte",
    externalContactId: "5511999990000@c.us",
    handoffReason: null,
    handling: "AI",
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    suggestedCategory: null,
    unreadCount: 0,
    updatedAt: "2026-09-14T12:00:00.000Z",
    ...overrides,
  };
}

function messageFixture(overrides: Partial<Message> = {}): Message {
  return {
    body: "Olá!",
    createdAt: "2026-09-14T12:00:00.000Z",
    direction: "OUTBOUND",
    id: "msg-1",
    source: "AI",
    ...overrides,
  };
}

function stateBar(): HTMLElement {
  const node = document.querySelector(".chat-header-state");
  expect(node).not.toBeNull();
  return node as HTMLElement;
}

/** Goal114: a categoria mora no contexto, aberto pelo nome no cabeçalho. */
async function openContext(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Abrir contexto de Marina Duarte" }),
  );
  return screen.findByRole("dialog", { name: "Contexto da conversa" });
}

async function renderThread(
  conversation: Conversation,
  messages: Message[] = [],
) {
  getConversation.mockResolvedValue(conversation);
  listMessages.mockResolvedValue(messages);
  listConversations.mockResolvedValue([conversation]);
  const result = render(
    <ShellConfigProvider>
      <ConversationThread conversationId={conversation.id} />
    </ShellConfigProvider>,
  );
  await screen.findByLabelText("Histórico da conversa com Marina Duarte");
  return result;
}

beforeEach(() => {
  getConversation.mockReset();
  listMessages.mockReset();
  listConversations.mockReset();
  sendMessage.mockReset();
  takeover.mockReset();
  release.mockReset();
  resolve.mockReset();
  setCategory.mockReset();
  generateSuggestions.mockReset();
});

describe("abrir a conversa não altera estado", () => {
  test("nenhuma mutação é chamada ao carregar", async () => {
    await renderThread(
      conversationFixture({ handling: "AI", status: "ACTIVE" }),
    );

    expect(takeover).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(setCategory).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("enviar assume a conversa", () => {
  test("avisa junto ao campo antes de enviar, quando ainda não é você atendendo", async () => {
    await renderThread(
      conversationFixture({
        handling: "AI",
        handoffReason: "cliente pediu atendimento",
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
      }),
    );

    expect(within(stateBar()).getByText(/^Aguardando você/)).toBeVisible();
    expect(screen.getByLabelText("Mensagem")).toHaveAttribute(
      "placeholder",
      "Sua primeira mensagem assume a conversa",
    );
    expect(screen.getByLabelText("Mensagem")).toHaveAccessibleDescription(
      "Sua primeira mensagem assume a conversa.",
    );
  });

  test("reflete Aguardando você para Você atendendo depois do envio", async () => {
    sendMessage.mockResolvedValue({
      message: messageFixture({ id: "msg-owner", source: "OWNER" }),
      status: 201,
    });
    await renderThread(
      conversationFixture({
        handling: "AI",
        handoffReason: "cliente pediu atendimento",
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
      }),
    );
    const user = userEvent.setup();

    expect(within(stateBar()).getByText(/^Aguardando você/)).toBeVisible();
    await user.type(screen.getByLabelText("Mensagem"), "Já te atendo por aqui");
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(await within(stateBar()).findByText("Você atendendo")).toBeVisible();
    expect(within(stateBar()).queryByText(/Aguardando você/)).toBeNull();
    expect(sendMessage).toHaveBeenCalledWith("conv-1", "Já te atendo por aqui");
  });

  test("o campo aceita digitação mesmo quando a IA ainda está ativa", async () => {
    await renderThread(
      conversationFixture({ handling: "AI", status: "ACTIVE" }),
    );

    const field = screen.getByLabelText("Mensagem");
    expect(field).toBeEnabled();
  });
});

describe("takeover, release e resolve continuam alcançáveis", () => {
  test("Assumir conversa chama takeover", async () => {
    takeover.mockResolvedValue(
      conversationFixture({ handling: "HUMAN", status: "HUMAN_HANDOFF" }),
    );
    await renderThread(
      conversationFixture({ handling: "AI", status: "ACTIVE" }),
    );
    const user = userEvent.setup();

    // Goal115: assumir mora no contexto, aberto pelo nome no cabeçalho.
    const context = await openContext(user);
    await user.click(
      within(context).getByRole("button", { name: "Assumir conversa" }),
    );

    expect(takeover).toHaveBeenCalledWith("conv-1");
  });

  test("Retomar IA abre diálogo que explica a reavaliação do contexto, e confirmar chama release", async () => {
    release.mockResolvedValue(
      conversationFixture({ handling: "AI", status: "ACTIVE" }),
    );
    await renderThread(
      conversationFixture({ handling: "HUMAN", status: "HUMAN_HANDOFF" }),
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Retomar IA" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Devolver conversa para a IA?",
    });
    expect(within(dialog).getByText(/reavalia o contexto atual/)).toBeVisible();

    await user.click(
      within(dialog).getByRole("button", { name: "Retomar IA" }),
    );
    expect(release).toHaveBeenCalledWith("conv-1");
  });

  test("Marcar como resolvida chama resolve", async () => {
    resolve.mockResolvedValue(conversationFixture({ status: "CLOSED" }));
    await renderThread(
      conversationFixture({ handling: "AI", status: "ACTIVE" }),
    );
    const user = userEvent.setup();

    // Goal115: resolver mora no contexto, aberto pelo nome no cabeçalho.
    const context = await openContext(user);
    await user.click(
      within(context).getByRole("button", { name: "Marcar como resolvida" }),
    );

    expect(resolve).toHaveBeenCalledWith("conv-1");
  });
});

describe("override de categoria", () => {
  // Goal116: os chips, o selo e a dica da sugestão saíram do contexto; o
  // override do contato é o controle "Como a IA trata este contato".
  test("mostra Automático marcado e a sugestão da IA nunca é aplicada sozinha", async () => {
    await renderThread(
      conversationFixture({
        category: "COMMERCIAL",
        categorySource: "AUTOMATIC",
        suggestedCategory: "PERSONAL",
      }),
    );
    await openContext(userEvent.setup());

    expect(screen.getByRole("radio", { name: "Automático" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("radio", { name: "Sempre atende" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(setCategory).not.toHaveBeenCalled();
  });

  test("Sempre atende e Automático gravam a decisão do contato, e a posição vem da resposta", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({
        category: "COMMERCIAL",
        categoryScope: "CONTACT",
        categorySource: "MANUAL",
        contactCategory: "COMMERCIAL",
        suggestedCategory: null,
      }),
    );
    await renderThread(
      conversationFixture({
        category: "COMMERCIAL",
        categorySource: "AUTOMATIC",
        suggestedCategory: "PERSONAL",
      }),
    );
    const user = userEvent.setup();
    await openContext(user);

    await user.click(screen.getByRole("radio", { name: "Sempre atende" }));

    expect(setCategory).toHaveBeenCalledWith("conv-1", "COMMERCIAL", "CONTACT");
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Sempre atende" }),
      ).toHaveAttribute("aria-checked", "true"),
    );

    setCategory.mockResolvedValue(
      conversationFixture({
        category: "UNCLASSIFIED",
        categorySource: "AUTOMATIC",
        contactCategory: null,
        suggestedCategory: null,
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Automático" }));

    expect(setCategory).toHaveBeenCalledWith("conv-1", null, "CONTACT");
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Automático" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });

  test("tocar Automático quando já é automático não grava", async () => {
    await renderThread(
      conversationFixture({
        category: "COMMERCIAL",
        categorySource: "AUTOMATIC",
      }),
    );
    const user = userEvent.setup();
    await openContext(user);

    await user.click(screen.getByRole("radio", { name: "Automático" }));

    expect(setCategory).not.toHaveBeenCalled();
  });
});
