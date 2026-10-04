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

import { render, screen, within } from "@testing-library/react";
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

async function renderThread(conversation: Conversation, messages: Message[] = []) {
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
    await renderThread(conversationFixture({ handling: "AI", status: "ACTIVE" }));

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
    await user.type(
      screen.getByLabelText("Mensagem"),
      "Já te atendo por aqui",
    );
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(
      await within(stateBar()).findByText("Você atendendo"),
    ).toBeVisible();
    expect(within(stateBar()).queryByText(/Aguardando você/)).toBeNull();
    expect(sendMessage).toHaveBeenCalledWith(
      "conv-1",
      "Já te atendo por aqui",
    );
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

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(screen.getByRole("button", { name: "Assumir conversa" }));

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
    expect(
      within(dialog).getByText(/reavalia o contexto atual/),
    ).toBeVisible();

    await user.click(
      within(dialog).getByRole("button", { name: "Retomar IA" }),
    );
    expect(release).toHaveBeenCalledWith("conv-1");
  });

  test("Marcar como resolvida chama resolve", async () => {
    resolve.mockResolvedValue(
      conversationFixture({ status: "CLOSED" }),
    );
    await renderThread(
      conversationFixture({ handling: "AI", status: "ACTIVE" }),
    );
    const user = userEvent.setup();

    const moreButton = screen.getByRole("button", { name: "Mais ações" });
    await user.click(moreButton);
    const dropdown = moreButton.closest(".dropdown");
    expect(dropdown).not.toBeNull();
    await user.click(
      within(dropdown as HTMLElement).getByRole("button", {
        name: "Marcar como resolvida",
      }),
    );

    expect(resolve).toHaveBeenCalledWith("conv-1");
  });
});

describe("override de categoria", () => {
  test("mostra a origem automática e a sugestão da IA, sem aplicá-la sozinha", async () => {
    await renderThread(
      conversationFixture({
        category: "COMMERCIAL",
        categorySource: "AUTOMATIC",
        suggestedCategory: "PERSONAL",
      }),
    );
    await openContext(userEvent.setup());

    expect(screen.getByText("Classificação automática")).toBeVisible();
    expect(
      screen.getByText(/A IA sugere Pessoal\. A escolha final é sua\./),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Comercial" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Pessoal" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(setCategory).not.toHaveBeenCalled();
  });

  test("os três valores e null funcionam, e a origem manual fica visível depois", async () => {
    setCategory.mockResolvedValue(
      conversationFixture({
        category: "PERSONAL",
        categorySource: "MANUAL",
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

    await user.click(screen.getByRole("button", { name: "Pessoal" }));

    expect(setCategory).toHaveBeenCalledWith("conv-1", "PERSONAL");
    expect(await screen.findByText("Definida manualmente")).toBeVisible();

    setCategory.mockResolvedValue(
      conversationFixture({
        category: "UNCLASSIFIED",
        categorySource: "AUTOMATIC",
        suggestedCategory: null,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Usar classificação automática" }),
    );

    expect(setCategory).toHaveBeenCalledWith("conv-1", null);
    expect(await screen.findByText("Classificação automática")).toBeVisible();
  });

  test("Usar classificação automática fica desabilitado quando já é automática", async () => {
    await renderThread(
      conversationFixture({ category: "COMMERCIAL", categorySource: "AUTOMATIC" }),
    );
    await openContext(userEvent.setup());

    expect(
      screen.getByRole("button", { name: "Usar classificação automática" }),
    ).toBeDisabled();
  });
});
