// @vitest-environment jsdom
/**
 * Goal023 (WU-08) — conteúdo expirado, visível na conversa.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - com `contentExpiredThrough` preenchido e mensagens recentes ainda
 *   presentes, a timeline avisa no topo que conteúdo antigo expirou e desde
 *   quando, antes de começar a listar as mensagens que sobraram;
 * - com `contentExpiredThrough` preenchido e nenhuma mensagem restante, a
 *   conversa continua aberta e o vazio é explicado pela expiração, não como
 *   erro nem como "nenhuma mensagem registrada" genérico;
 * - sem `contentExpiredThrough`, o vazio continua sendo o genérico de sempre
 *   — a ausência de mensagem sozinha nunca vira "expirou";
 * - a conversa inteiramente expirada continua na lista/rail normalmente.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, Message } from "@/data";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getConversation = vi.fn();
const listMessages = vi.fn();
const listConversations = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      get: getConversation,
      list: listConversations,
      listMessages,
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
    customerName: "Marina Duarte",
    externalContactId: "5511999990000@c.us",
    handling: "HUMAN",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-09-14T12:00:00.000Z",
    ...overrides,
  };
}

function messageFixture(overrides: Partial<Message> = {}): Message {
  return {
    body: "Confirmo seu horário amanhã às 10h.",
    createdAt: "2026-09-14T12:00:00.000Z",
    direction: "OUTBOUND",
    id: "msg-1",
    source: "OWNER",
    ...overrides,
  };
}

async function renderThread(
  conversation: Conversation,
  messages: Message[],
  rail: Conversation[] = [conversation],
) {
  getConversation.mockResolvedValue(conversation);
  listMessages.mockResolvedValue(messages);
  listConversations.mockResolvedValue(rail);
  render(
    <ShellConfigProvider>
      <ConversationThread conversationId="conv-1" />
    </ShellConfigProvider>,
  );
  await screen.findByLabelText("Histórico da conversa com Marina Duarte");
}

beforeEach(() => {
  getConversation.mockReset();
  listMessages.mockReset();
  listConversations.mockReset();
});

describe("conteúdo expirado com mensagens ainda presentes", () => {
  test("avisa no topo que conteúdo antigo expirou e desde quando", async () => {
    await renderThread(
      conversationFixture({
        contentExpiredThrough: "2026-08-01T12:00:00.000Z",
      }),
      [messageFixture()],
    );

    expect(screen.getByText("Mensagens antigas expiraram")).toBeVisible();
    expect(screen.getByText(/Conteúdo anterior a 01\/08\/2026/)).toBeVisible();
    expect(
      screen.getByText("Confirmo seu horário amanhã às 10h."),
    ).toBeVisible();
  });
});

describe("conversa inteiramente expirada", () => {
  test("continua listada e explica o vazio sem parecer erro", async () => {
    await renderThread(
      conversationFixture({
        contentExpiredThrough: "2026-09-10T00:00:00.000Z",
      }),
      [],
    );

    const empty = screen.getByText("Nenhuma mensagem recente");
    expect(empty).toBeVisible();
    expect(screen.getByText(/expirou pela política de retenção/)).toBeVisible();
    expect(empty.closest(".message-system")).not.toHaveClass("is-error");

    expect(screen.getByRole("link", { name: /Marina Duarte/ })).toBeVisible();
  });
});

describe("sem marca de expiração", () => {
  test("vazio continua sendo o genérico, nunca inferido pela ausência de mensagem", async () => {
    await renderThread(
      conversationFixture({ contentExpiredThrough: null }),
      [],
    );

    expect(screen.getByText("Nenhuma mensagem registrada")).toBeVisible();
    expect(screen.queryByText("Nenhuma mensagem recente")).toBeNull();
    expect(screen.queryByText(/expirou/u)).toBeNull();
  });

  test("mensagens presentes sem contentExpiredThrough não mostram aviso de expiração", async () => {
    await renderThread(
      conversationFixture({ contentExpiredThrough: undefined }),
      [messageFixture()],
    );

    expect(screen.queryByText("Mensagens antigas expiraram")).toBeNull();
  });
});
