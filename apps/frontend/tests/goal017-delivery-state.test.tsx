// @vitest-environment jsdom
/**
 * Goal017 (WU-04) — chat: estado de entrega.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - `deliveryState` nos quatro valores (`PENDING`, `SENT`, `FAILED`,
 *   `UNKNOWN`) é composto no balão da mensagem enviada, cada um com texto
 *   próprio;
 * - `UNKNOWN` se apresenta como "não confirmado" e não oferece reenviar —
 *   reenviar duplicaria a mensagem no WhatsApp do cliente;
 * - `FAILED` oferece "Tentar reenviar", que reenvia pelo mesmo caminho de
 *   envio (`sendMessage`);
 * - mensagem sem `deliveryState` não vira erro, e mensagem recebida nunca
 *   exibe estado de entrega, mesmo que o dado viesse preenchido;
 * - o envio distingue `201` confirmado de `202` tentativa registrada.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, Message } from "@/data";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getConversation = vi.fn();
const listMessages = vi.fn();
const listConversations = vi.fn();
const sendMessage = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      get: getConversation,
      list: listConversations,
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
    source: "OWNER",
    ...overrides,
  };
}

async function renderThread(messages: Message[]) {
  getConversation.mockResolvedValue(conversationFixture());
  listMessages.mockResolvedValue(messages);
  listConversations.mockResolvedValue([]);
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
  sendMessage.mockReset();
});

describe("deliveryState nos quatro valores, composto no balão", () => {
  test("PENDING é tentativa em curso", async () => {
    await renderThread([messageFixture({ deliveryState: "PENDING" })]);

    expect(screen.getByText("Enviando…")).toBeVisible();
  });

  test("SENT é entrega confirmada", async () => {
    await renderThread([messageFixture({ deliveryState: "SENT" })]);

    expect(screen.getByText("Enviado")).toBeVisible();
  });

  test("FAILED mostra o detalhe e oferece reenviar", async () => {
    await renderThread([
      messageFixture({
        deliveryDetail: "número não respondeu a tempo",
        deliveryState: "FAILED",
      }),
    ]);

    expect(
      screen.getByText("Não entregue · número não respondeu a tempo"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Tentar reenviar" }),
    ).toBeVisible();
  });

  test("UNKNOWN se apresenta como não confirmado e não oferece reenviar", async () => {
    await renderThread([messageFixture({ deliveryState: "UNKNOWN" })]);

    expect(screen.getByText("Não confirmado")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Tentar reenviar" }),
    ).toBeNull();
  });

  test("os quatro valores usam rótulos diferentes entre si", async () => {
    await renderThread([
      messageFixture({ deliveryState: "PENDING", id: "m-pending" }),
      messageFixture({ deliveryState: "SENT", id: "m-sent" }),
      messageFixture({ deliveryState: "FAILED", id: "m-failed" }),
      messageFixture({ deliveryState: "UNKNOWN", id: "m-unknown" }),
    ]);

    const labels = new Set(
      Array.from(document.querySelectorAll(".message-delivery")).map(
        (node) => node.textContent,
      ),
    );
    expect(labels.size).toBe(4);
  });
});

describe("reenviar (só FAILED)", () => {
  test("Tentar reenviar chama sendMessage com o mesmo texto", async () => {
    sendMessage.mockResolvedValue({
      message: messageFixture({
        deliveryState: "PENDING",
        id: "msg-2",
      }),
      status: 201,
    });
    await renderThread([
      messageFixture({
        deliveryDetail: "falha definitiva do transporte",
        deliveryState: "FAILED",
      }),
    ]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Tentar reenviar" }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        "conv-1",
        "Confirmo seu horário amanhã às 10h.",
      ),
    );
    await waitFor(() =>
      expect(
        screen.getAllByText("Confirmo seu horário amanhã às 10h."),
      ).toHaveLength(2),
    );
  });
});

describe("ausência e mensagem recebida", () => {
  test("mensagem sem deliveryState não vira erro nem exibe estado de entrega", async () => {
    await renderThread([messageFixture({ deliveryState: undefined })]);

    expect(
      document.querySelector(".message-delivery"),
    ).toBeNull();
    expect(
      screen.getByText("Confirmo seu horário amanhã às 10h."),
    ).toBeVisible();
  });

  test("mensagem recebida nunca exibe estado de entrega, mesmo com o campo preenchido", async () => {
    await renderThread([
      messageFixture({
        deliveryState: "SENT",
        direction: "INBOUND",
        source: "CUSTOMER",
      }),
    ]);

    expect(document.querySelector(".message-delivery")).toBeNull();
  });
});

describe("registro do envio: 202 tentativa vs 201 confirmação", () => {
  test("201 diz registro e envio, nunca entrega confirmada", async () => {
    sendMessage.mockResolvedValue({
      message: messageFixture({ id: "msg-new", deliveryState: "PENDING" }),
      status: 201,
    });
    await renderThread([]);
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText("Mensagem"),
      "Confirmado, te espero às 10h.",
    );
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(
      await screen.findByText(/Mensagem registrada e enviada ao WhatsApp/),
    ).toBeVisible();
    expect(screen.queryByText(/entregue/iu)).toBeNull();
  });

  test("202 é apresentado como tentativa registrada", async () => {
    sendMessage.mockResolvedValue({
      message: messageFixture({ id: "msg-new", deliveryState: "PENDING" }),
      status: 202,
    });
    await renderThread([]);
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText("Mensagem"),
      "Confirmado, te espero às 10h.",
    );
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(await screen.findByText(/Tentativa registrada/)).toBeVisible();
  });
});
