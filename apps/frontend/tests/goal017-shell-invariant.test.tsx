// @vitest-environment jsdom
/**
 * Goal017 (WU-07): fecha a mesma invariante que goal016-shell-invariant.test.tsx
 * fechou para Agenda — `ShellConfigProvider` mais cada tela real de Conversas
 * precisa sobreviver a montagem, carregamento e interação sem violar a regra
 * de uma chamada de `useShellConfig` por árvore. Se essa invariante for
 * violada (por exemplo, duas montagens concorrentes do mesmo config, ou um
 * efeito que nunca estabiliza), React lança "Maximum update depth exceeded" e
 * a interação abaixo lança essa mesma exceção, derrubando o teste — não há
 * necessidade de capturá-la explicitamente.
 *
 * Duas telas cobrem os dois cenários entregues pelo Goal017:
 * `ConversationInbox` (lista, abas, busca) e `ConversationThread` (chat,
 * contexto, override de categoria, sugestões, diálogo de Retomar IA).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, Message } from "@/data";
import { ConversationInbox } from "@/features/conversations/ConversationInbox";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const listConversations = vi.fn();
const getConversation = vi.fn();
const listMessages = vi.fn();
const sendMessage = vi.fn();
const takeover = vi.fn();
const release = vi.fn();
const resolve = vi.fn();
const setCategory = vi.fn();
const generateSuggestions = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();

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
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
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
    customerId: null,
    customerName: "Marina Duarte",
    externalContactId: "5511999990000@c.us",
    handling: "HUMAN",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "HUMAN_HANDOFF",
    suggestedCategory: "PERSONAL",
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

beforeEach(() => {
  for (const spy of [
    push,
    replace,
    listConversations,
    getConversation,
    listMessages,
    sendMessage,
    takeover,
    release,
    resolve,
    setCategory,
    generateSuggestions,
    statusGet,
    notificationsSummary,
  ]) {
    spy.mockReset();
  }
  listConversations.mockResolvedValue([]);
  // Goal096: a inbox com abas é provada com o WhatsApp conectado; sem número e
  // sem conversa a tela é o C5.
  statusGet.mockResolvedValue({
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-14T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  });
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
});

function renderWithShell(node: React.ReactElement) {
  return render(
    <SystemStatusProvider>
      <ShellConfigProvider>{node}</ShellConfigProvider>
    </SystemStatusProvider>,
  );
}

describe("ShellConfigProvider + Inbox de conversas não excede a profundidade de atualização", () => {
  test("alterna repetidamente entre as abas e digita continuamente na busca", async () => {
    listConversations.mockResolvedValue([conversationFixture()]);
    const user = userEvent.setup();

    renderWithShell(<ConversationInbox />);

    expect(await screen.findByText("Marina Duarte")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Não classificadas" }));
    await user.click(screen.getByRole("tab", { name: "Pessoal" }));
    await user.click(screen.getByRole("tab", { name: "Comercial" }));
    await user.click(screen.getByRole("button", { name: "Ignorados" }));
    await user.click(screen.getByRole("tab", { name: "Comercial" }));
    await user.type(
      screen.getByLabelText("Buscar por nome ou telefone"),
      "Marina",
    );

    expect(screen.getByLabelText("Buscar por nome ou telefone")).toHaveValue(
      "Marina",
    );
  });
});

describe("ShellConfigProvider + Chat da conversa não excede a profundidade de atualização", () => {
  test("abre e fecha o contexto repetidamente e alterna a categoria continuamente", async () => {
    getConversation.mockResolvedValue(conversationFixture());
    listMessages.mockResolvedValue([messageFixture()]);
    listConversations.mockResolvedValue([conversationFixture()]);
    const user = userEvent.setup();

    renderWithShell(<ConversationThread conversationId="conv-1" />);

    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    const openContext = screen.getByRole("button", { name: "Abrir contexto" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(openContext);
      await user.click(await screen.findByRole("button", { name: "Fechar" }));
    }

    setCategory.mockResolvedValue(
      conversationFixture({ category: "PERSONAL", categorySource: "MANUAL" }),
    );
    await user.click(screen.getByRole("button", { name: "Pessoal" }));
    setCategory.mockResolvedValue(
      conversationFixture({
        category: "COMMERCIAL",
        categorySource: "MANUAL",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Comercial" }));

    expect(
      await screen.findByRole("button", { name: "Comercial" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("abre e fecha o diálogo de Retomar IA repetidamente sem confirmar", async () => {
    getConversation.mockResolvedValue(conversationFixture());
    listMessages.mockResolvedValue([]);
    listConversations.mockResolvedValue([conversationFixture()]);
    const user = userEvent.setup();

    renderWithShell(<ConversationThread conversationId="conv-1" />);

    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    const releaseTrigger = screen.getByRole("button", { name: "Retomar IA" });
    for (let i = 0; i < 4; i += 1) {
      await user.click(releaseTrigger);
      const dialog = await screen.findByRole("dialog", {
        name: "Devolver conversa para a IA?",
      });
      await user.click(
        within(dialog).getByRole("button", {
          name: "Manter atendimento humano",
        }),
      );
    }

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(release).not.toHaveBeenCalled();
  });

  test("responde a digitação contínua na mensagem sem chamar takeover sozinho", async () => {
    getConversation.mockResolvedValue(
      conversationFixture({ handling: "AI", status: "ACTIVE" }),
    );
    listMessages.mockResolvedValue([]);
    listConversations.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithShell(<ConversationThread conversationId="conv-1" />);

    const field = await screen.findByLabelText("Mensagem");
    await user.type(field, "Olá, já te atendo por aqui");

    expect(field).toHaveValue("Olá, já te atendo por aqui");
    expect(takeover).not.toHaveBeenCalled();
  });
});
