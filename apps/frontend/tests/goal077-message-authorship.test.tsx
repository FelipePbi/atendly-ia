// @vitest-environment jsdom
/**
 * Goal077 (WU-04) — bolha do chat: autoria discreta abaixo da bolha e
 * estados de envio preservados.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - a IA se apresenta como "IA · hora" abaixo da bolha, sem nome do negócio,
 *   sem "resposta automática" e sem selo de "Enviado" (§6.10);
 * - o dono se apresenta como "Você · hora"; a cliente, só a hora;
 * - SENT não tem selo próprio; PENDING, FAILED e UNKNOWN continuam visíveis,
 *   como `role="status"`, e FAILED oferece "Tentar reenviar" (§6.11);
 * - o evento de agenda no meio da conversa (Goal070) continua sem bolha e
 *   sem autoria.
 */

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, Message } from "@/data";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getConversation = vi.fn();
const listMessages = vi.fn();
const listConversations = vi.fn();
const listEvents = vi.fn();
const sendMessage = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      get: getConversation,
      list: listConversations,
      listEvents,
      listMessages,
      sendMessage,
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
    source: "AI",
    ...overrides,
  };
}

async function renderThread(messages: Message[]) {
  getConversation.mockResolvedValue(conversationFixture());
  listMessages.mockResolvedValue(messages);
  listConversations.mockResolvedValue([]);
  listEvents.mockResolvedValue([]);
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
  listEvents.mockReset();
  sendMessage.mockReset();
});

describe("autoria abaixo da bolha, sem rótulo acima (§6.10)", () => {
  test("IA mostra 'IA · hora', sem nome do negócio nem 'resposta automática'", async () => {
    await renderThread([
      messageFixture({ body: "Posso confirmar seu horário?", source: "AI" }),
    ]);

    const bubble = screen
      .getByText("Posso confirmar seu horário?")
      .closest(".message-group") as HTMLElement;
    expect(bubble.querySelector(".message-sender")).toBeNull();
    const meta = bubble.querySelector(".message-meta");
    expect(meta?.textContent).toMatch(/^IA · \d{2}:\d{2}$/);
    expect(screen.queryByText(/Studio Marina/)).toBeNull();
    expect(screen.queryByText(/resposta automática/)).toBeNull();
    expect(screen.queryByText("Enviado")).toBeNull();
  });

  test("dono mostra 'Você · hora'", async () => {
    await renderThread([
      messageFixture({
        body: "Já te atendo por aqui",
        source: "OWNER",
      }),
    ]);

    const bubble = screen
      .getByText("Já te atendo por aqui")
      .closest(".message-group") as HTMLElement;
    const meta = bubble.querySelector(".message-meta");
    expect(meta?.textContent).toMatch(/^Você · \d{2}:\d{2}$/);
    expect(screen.queryByText(/atendimento humano/)).toBeNull();
  });

  test("cliente mostra só a hora, sem rótulo", async () => {
    await renderThread([
      messageFixture({
        body: "Pode ser às 10h",
        direction: "INBOUND",
        source: "CUSTOMER",
      }),
    ]);

    const bubble = screen
      .getByText("Pode ser às 10h")
      .closest(".message-group") as HTMLElement;
    const meta = bubble.querySelector(".message-meta");
    expect(meta?.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(within(bubble).queryByText("Marina Duarte")).toBeNull();
  });
});

describe("estados de envio preservados, SENT sem selo próprio (§6.11)", () => {
  test("SENT não mostra selo", async () => {
    await renderThread([messageFixture({ deliveryState: "SENT" })]);

    expect(document.querySelector(".message-delivery")).toBeNull();
    expect(screen.queryByText("Enviado")).toBeNull();
  });

  test("PENDING mostra 'Enviando…' como status", async () => {
    await renderThread([messageFixture({ deliveryState: "PENDING" })]);

    const badge = screen.getByText("Enviando…").closest(".message-delivery");
    expect(badge).toHaveAttribute("role", "status");
    expect(badge).toBeVisible();
  });

  test("FAILED mostra 'Não entregue' e 'Tentar reenviar'", async () => {
    await renderThread([messageFixture({ deliveryState: "FAILED" })]);

    const badge = screen.getByText("Não entregue").closest(".message-delivery");
    expect(badge).toHaveAttribute("role", "status");
    expect(badge).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Tentar reenviar" }),
    ).toBeVisible();
  });

  test("UNKNOWN mostra 'Não confirmado'", async () => {
    await renderThread([messageFixture({ deliveryState: "UNKNOWN" })]);

    const badge = screen
      .getByText("Não confirmado")
      .closest(".message-delivery");
    expect(badge).toHaveAttribute("role", "status");
    expect(badge).toBeVisible();
  });
});

describe("evento de agenda no chat (Goal070) não muda", () => {
  test("HOLD_PLACED continua sem bolha e sem autoria", async () => {
    getConversation.mockResolvedValue(conversationFixture());
    listMessages.mockResolvedValue([
      messageFixture({ body: "Posso confirmar às 10h?", source: "AI" }),
    ]);
    listConversations.mockResolvedValue([]);
    listEvents.mockResolvedValue([
      {
        date: "2026-09-15",
        holdExpiresAt: "2026-09-14T12:30:00.000Z",
        id: "event-1",
        occurredAt: "2026-09-14T12:00:00.000Z",
        startTime: "10:00",
        type: "HOLD_PLACED",
      },
    ]);
    render(
      <ShellConfigProvider>
        <ConversationThread conversationId="conv-1" />
      </ShellConfigProvider>,
    );

    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    await screen.findByText(/Horário reservado até/);
    expect(
      screen.queryByText(/Horário reservado até/),
    ).not.toBeNull();
  });
});
