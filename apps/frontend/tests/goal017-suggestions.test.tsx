// @vitest-environment jsdom
/**
 * Goal017 (WU-05) — sugestões da IA para o atendimento humano.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela:
 *
 * - a sugestão só é oferecida com atendimento humano vigente — some do chat
 *   em qualquer outro estado;
 * - até três sugestões aparecem, cada uma preenche o rascunho ao ser usada
 *   (editável antes de enviar) e nenhuma é enviada sozinha;
 * - as cinco recusas próprias (`error.details.upstreamCode`) têm copy
 *   distinta entre si, nunca um erro genérico nem uma lista vazia silenciosa.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type Conversation, type Message } from "@/data";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getConversation = vi.fn();
const listMessages = vi.fn();
const listConversations = vi.fn();
const sendMessage = vi.fn();
const generateSuggestions = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      generateSuggestions,
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
    humanHandoff: true,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "HUMAN_HANDOFF",
    unreadCount: 0,
    updatedAt: "2026-09-14T12:00:00.000Z",
    ...overrides,
  };
}

function messageFixture(overrides: Partial<Message> = {}): Message {
  return {
    body: "Vocês têm horário amanhã de manhã?",
    createdAt: "2026-09-14T12:00:00.000Z",
    direction: "INBOUND",
    id: "msg-1",
    source: "CUSTOMER",
    ...overrides,
  };
}

async function renderThread(conversation: Conversation) {
  getConversation.mockResolvedValue(conversation);
  listMessages.mockResolvedValue([messageFixture()]);
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
  generateSuggestions.mockReset();
});

describe("só oferecida com atendimento humano vigente", () => {
  test("some do chat quando a IA está atendendo", async () => {
    await renderThread(
      conversationFixture({ handling: "AI", humanHandoff: false, status: "ACTIVE" }),
    );

    expect(
      screen.queryByRole("button", { name: /Sugerir resposta/ }),
    ).toBeNull();
  });

  test("some do chat quando a conversa está aguardando você, mas ainda não assumida", async () => {
    await renderThread(
      conversationFixture({
        handling: "AI",
        handoffReason: "cliente pediu atendimento",
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
      }),
    );

    expect(
      screen.queryByRole("button", { name: /Sugerir resposta/ }),
    ).toBeNull();
  });

  test("aparece quando você está atendendo", async () => {
    await renderThread(conversationFixture({ handling: "HUMAN" }));

    expect(
      screen.getByRole("button", { name: /Sugerir resposta/ }),
    ).toBeVisible();
  });
});

describe("até três sugestões, editáveis, nenhuma enviada sozinha", () => {
  test("usar uma sugestão preenche o rascunho sem enviar nada", async () => {
    generateSuggestions.mockResolvedValue({
      aiRunId: "run-1",
      conversationId: "conv-1",
      promptVersion: "v1",
      suggestions: [
        "Sim, temos às 9h e às 10h30.",
        "Temos horário amanhã, qual período prefere?",
        "Posso confirmar às 9h da manhã?",
      ],
    });
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Sugerir resposta/ }),
    );

    expect(generateSuggestions).toHaveBeenCalledWith("conv-1");
    const first = await screen.findByText("Sim, temos às 9h e às 10h30.");
    expect(first).toBeVisible();
    expect(
      screen.getByText("Temos horário amanhã, qual período prefere?"),
    ).toBeVisible();
    expect(screen.getByText("Posso confirmar às 9h da manhã?")).toBeVisible();

    await user.click(first);

    const field = screen.getByLabelText<HTMLTextAreaElement>("Mensagem");
    expect(field.value).toBe("Sim, temos às 9h e às 10h30.");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("nunca renderiza uma lista vazia silenciosa", async () => {
    generateSuggestions.mockResolvedValue({
      aiRunId: "run-1",
      conversationId: "conv-1",
      promptVersion: "v1",
      suggestions: [],
    });
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Sugerir resposta/ }),
    );

    expect(
      await screen.findByText("Nenhuma sugestão desta vez."),
    ).toBeVisible();
  });
});

describe("as cinco recusas têm copy própria e distinta", () => {
  test.each([
    [
      "CONTACT_IGNORED",
      "Este contato está marcado para a IA não usar — sugestões não estão disponíveis.",
    ],
    ["SESSION_PERSONAL", "Conversas pessoais não recebem sugestão da IA."],
    [
      "HUMAN_HANDLING_REQUIRED",
      "Assuma a conversa para pedir sugestões da IA.",
    ],
    [
      "AI_DISABLED",
      "A IA está desligada para este negócio. Ative a IA para receber sugestões.",
    ],
    [
      "NO_TEXTUAL_MESSAGE",
      "Não há uma mensagem de texto recente do cliente para basear a sugestão.",
    ],
  ])("a recusa %s tem copy própria, nunca erro genérico", async (upstreamCode, copy) => {
    generateSuggestions.mockRejectedValue(
      new BffHttpError({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode },
        message: "upstream refused",
        requestId: "req-1",
        status: 409,
      }),
    );
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Sugerir resposta/ }),
    );

    expect(await screen.findByText(copy)).toBeVisible();
    expect(screen.queryByText(/upstream refused/)).toBeNull();
  });

  test("as cinco recusas usam textos diferentes entre si", async () => {
    const codes = [
      "CONTACT_IGNORED",
      "SESSION_PERSONAL",
      "HUMAN_HANDLING_REQUIRED",
      "AI_DISABLED",
      "NO_TEXTUAL_MESSAGE",
    ] as const;
    const texts = new Set<string>();
    for (const upstreamCode of codes) {
      generateSuggestions.mockRejectedValue(
        new BffHttpError({
          code: "UPSTREAM_ERROR",
          details: { upstreamCode },
          message: "upstream refused",
          requestId: "req-1",
          status: 409,
        }),
      );
      const { unmount } = await renderThread(conversationFixture());
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", { name: /Sugerir resposta/ }),
      );
      const node = await screen.findByRole("alert");
      texts.add(node.textContent ?? "");
      unmount();
    }
    expect(texts.size).toBe(5);
  });
});
