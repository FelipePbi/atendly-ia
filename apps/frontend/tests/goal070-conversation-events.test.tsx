// @vitest-environment jsdom
/**
 * Goal070 (WU-03) — o chat mostra o que a agenda fez.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - as três linhas de evento (`HOLD_PLACED`, `APPOINTMENT_CREATED`,
 *   `HOLD_EXPIRED`) aparecem como linha central entre as bolhas, na ordem do
 *   protótipo, com instante igual desempatando o evento antes da bolha;
 * - "Ver" do agendamento criado aponta para `/agenda/agendamento?id=`;
 * - a hora de vencimento da reserva sai no fuso do negócio, mesmo com o fuso
 *   do processo de teste diferente;
 * - falha na consulta de eventos não esconde as mensagens nem afirma erro;
 * - conversa sem eventos fica igual a hoje.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, ConversationEvent, Message } from "@/data";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

process.env.TZ = "Asia/Tokyo";

const getConversation = vi.fn();
const listMessages = vi.fn();
const listConversations = vi.fn();
const listEvents = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      get: getConversation,
      list: listConversations,
      listEvents,
      listMessages,
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
    customerName: "Ana Paula",
    externalContactId: "5511999990000@c.us",
    handling: "HUMAN",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-09-18T16:42:00.000Z",
    ...overrides,
  };
}

function messageFixture(overrides: Partial<Message> = {}): Message {
  return {
    body: "mensagem",
    createdAt: "2026-09-18T16:39:00.000Z",
    direction: "OUTBOUND",
    id: "msg-1",
    source: "OWNER",
    ...overrides,
  };
}

async function renderThread(
  conversation: Conversation,
  messages: Message[],
  events: ConversationEvent[] | Error,
  rail: Conversation[] = [conversation],
) {
  getConversation.mockResolvedValue(conversation);
  listMessages.mockResolvedValue(messages);
  listConversations.mockResolvedValue(rail);
  if (events instanceof Error) listEvents.mockRejectedValue(events);
  else listEvents.mockResolvedValue(events);
  render(
    <ShellConfigProvider>
      <ConversationThread conversationId="conv-1" />
    </ShellConfigProvider>,
  );
  await screen.findByLabelText("Histórico da conversa com Ana Paula");
}

beforeEach(() => {
  getConversation.mockReset();
  listMessages.mockReset();
  listConversations.mockReset();
  listEvents.mockReset();
});

describe("as três linhas de evento entre as bolhas", () => {
  test("aparecem na ordem do protótipo, com instante igual antes da bolha", async () => {
    const holdPlaced: ConversationEvent = {
      date: "2026-09-18",
      holdExpiresAt: "2026-09-18T16:46:00.000Z",
      id: "event-hold",
      occurredAt: "2026-09-18T16:41:00.000Z",
      startTime: "15:30",
      type: "HOLD_PLACED",
    };
    const appointmentCreated: ConversationEvent = {
      appointmentId: "appt-1",
      date: "2026-09-18",
      id: "event-created",
      occurredAt: "2026-09-18T16:42:00.000Z",
      startTime: "15:30",
      type: "APPOINTMENT_CREATED",
    };
    const messages = [
      messageFixture({
        body: "15h30",
        createdAt: "2026-09-18T16:39:00.000Z",
        direction: "INBOUND",
        id: "msg-slot",
        source: "CUSTOMER",
      }),
      messageFixture({
        body: "Posso confirmar?",
        // mesmo instante do HOLD_PLACED: o evento vem antes desta bolha.
        createdAt: holdPlaced.occurredAt,
        direction: "OUTBOUND",
        id: "msg-confirm-ask",
        source: "AI",
      }),
      messageFixture({
        body: "Pode!",
        createdAt: "2026-09-18T16:41:30.000Z",
        direction: "INBOUND",
        id: "msg-yes",
        source: "CUSTOMER",
      }),
      messageFixture({
        body: "Confirmado!",
        // mesmo instante do APPOINTMENT_CREATED: o evento vem antes desta bolha.
        createdAt: appointmentCreated.occurredAt,
        direction: "OUTBOUND",
        id: "msg-confirmed",
        source: "AI",
      }),
    ];

    await renderThread(conversationFixture(), messages, [
      holdPlaced,
      appointmentCreated,
    ]);

    const timeline = screen.getByLabelText("Histórico da conversa com Ana Paula");
    const rows = Array.from(
      timeline.querySelectorAll(".conversation-event, .message-bubble"),
    ).map((element) => element.textContent ?? "");

    expect(rows).toEqual([
      "15h30",
      expect.stringContaining("Horário reservado até 13:46 · sex 15:30"),
      "Posso confirmar?",
      "Pode!",
      expect.stringContaining("Agendamento criado · sex 18/09, 15:30"),
      "Confirmado!",
    ]);

    expect(
      screen.getByText("Horário reservado até 13:46 · sex 15:30"),
    ).toBeVisible();
    const link = screen.getByRole("link", { name: "Ver" });
    expect(link).toHaveAttribute("href", "/agenda/agendamento?id=appt-1");
  });

  test("reserva vencida sem confirmação aparece como linha central", async () => {
    const holdExpired: ConversationEvent = {
      date: "2026-09-25",
      id: "event-expired",
      occurredAt: "2026-09-25T13:00:00.000Z",
      startTime: "10:00",
      type: "HOLD_EXPIRED",
    };

    await renderThread(
      conversationFixture(),
      [messageFixture({ createdAt: "2026-09-25T12:00:00.000Z" })],
      [holdExpired],
    );

    expect(
      screen.getByText("Reserva de sex 10:00 venceu sem confirmação"),
    ).toBeVisible();
  });
});

describe("a hora de vencimento sai no fuso do negócio", () => {
  test("mesmo com o fuso do processo de teste diferente", async () => {
    expect(process.env.TZ).toBe("Asia/Tokyo");

    const holdPlaced: ConversationEvent = {
      date: "2026-09-18",
      holdExpiresAt: "2026-09-18T16:46:00.000Z",
      id: "event-hold",
      occurredAt: "2026-09-18T16:41:00.000Z",
      startTime: "15:30",
      type: "HOLD_PLACED",
    };

    await renderThread(
      conversationFixture(),
      [messageFixture({ createdAt: "2026-09-18T16:39:00.000Z" })],
      [holdPlaced],
    );

    // 16:46 UTC = 13:46 em America/Sao_Paulo (UTC-3), nunca 01:46 de
    // Asia/Tokyo (fuso do processo de teste).
    expect(
      screen.getByText("Horário reservado até 13:46 · sex 15:30"),
    ).toBeVisible();
    expect(screen.queryByText(/01:46/)).toBeNull();
  });
});

describe("falha na consulta de eventos", () => {
  test("não esconde as mensagens nem afirma erro na conversa", async () => {
    await renderThread(
      conversationFixture(),
      [messageFixture({ body: "Confirmo seu horário amanhã às 10h." })],
      new Error("falha de rede"),
    );

    expect(
      screen.getByText("Confirmo seu horário amanhã às 10h."),
    ).toBeVisible();
    expect(
      screen.queryByText("Não foi possível abrir a conversa"),
    ).toBeNull();
  });
});

describe("conversa sem eventos", () => {
  test("fica igual a hoje", async () => {
    await renderThread(
      conversationFixture(),
      [messageFixture({ body: "Confirmo seu horário amanhã às 10h." })],
      [],
    );

    expect(
      screen.getByText("Confirmo seu horário amanhã às 10h."),
    ).toBeVisible();
    expect(
      screen.queryByText(/Horário reservado|Agendamento criado|venceu sem confirmação/),
    ).toBeNull();
  });
});
