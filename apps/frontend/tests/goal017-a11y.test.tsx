// @vitest-environment jsdom
/**
 * Goal017 (WU-07): prova transversal de acessibilidade das telas novas de
 * Conversas, com o que o axe sozinho não cobre.
 *
 * As suítes de cada Work Unit (goal017-inbox-tabs, goal017-chat-media,
 * goal017-human-handling, goal017-suggestions, goal017-contact-profile,
 * goal017-delivery-state) já provam comportamento pelo que a usuária
 * encontra, mas nenhuma delas roda o axe nem afirma foco por teclado. Esta
 * suíte fecha as duas lacunas, no mesmo padrão que goal016-a11y.test.tsx
 * fechou para Agenda: a inbox e o chat passam pelo axe, e os diálogos novos
 * (Retomar IA e o contexto do cliente em folha) têm foco que entra, fica
 * preso e volta para quem abriu.
 *
 * O que esta suíte não prova: layout real, largura de viewport, contraste
 * computado. Isso é `npm run validate:ui`, não jsdom.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, Message } from "@/data";
import { ConversationInbox } from "@/features/conversations/ConversationInbox";
import { ConversationThread } from "@/features/conversations/ConversationThread";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

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
const getMedia = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      generateSuggestions,
      get: getConversation,
      getMedia,
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
    body: "Posso ajudar em algo?",
    createdAt: "2026-09-14T12:00:00.000Z",
    direction: "OUTBOUND",
    id: "msg-1",
    source: "AI",
    ...overrides,
  };
}

/** Avança Tab até o alvo receber foco, ou até o limite — nunca em loop indefinido. */
async function tabUntilFocused(
  user: UserEvent,
  target: HTMLElement,
  max = 40,
): Promise<void> {
  for (
    let attempt = 0;
    attempt < max && document.activeElement !== target;
    attempt += 1
  ) {
    await user.tab();
  }
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
    getMedia,
  ]) {
    spy.mockReset();
  }
  listConversations.mockResolvedValue([]);
});

describe("inbox de conversas", () => {
  test("sem violação de acessibilidade e abas alcançáveis por teclado com as setas", async () => {
    listConversations.mockResolvedValue([
      conversationFixture({ handling: "AI", status: "ACTIVE" }),
    ]);
    const user = userEvent.setup();

    const { container } = render(
      <ShellConfigProvider>
        <ConversationInbox />
      </ShellConfigProvider>,
    );

    await screen.findByText("Marina Duarte");
    await expectNoA11yViolations(container);

    const commercialTab = screen.getByRole("tab", { name: "Comercial" });
    await tabUntilFocused(user, commercialTab);
    expect(commercialTab).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("tab", { name: "Não classificadas" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Pessoal" })).toHaveFocus();
  });

  test("quem está aguardando é distinguível por texto, não só por cor, e a linha é alcançável por teclado", async () => {
    listConversations.mockResolvedValue([
      conversationFixture({
        handling: "AI",
        handoffReason: "cliente pediu atendimento",
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
      }),
    ]);
    const user = userEvent.setup();

    render(
      <ShellConfigProvider>
        <ConversationInbox />
      </ShellConfigProvider>,
    );

    const row = await screen.findByRole("link", { name: /Marina Duarte/ });
    expect(within(row).getByText("Aguardando você")).toBeVisible();

    await tabUntilFocused(user, row);
    expect(row).toHaveFocus();
  });
});

describe("chat da conversa", () => {
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

  test("sem violação de acessibilidade com autoria mista, categoria e sugestões visíveis", async () => {
    const { container } = await renderThread(conversationFixture(), [
      messageFixture(),
      messageFixture({
        body: "Oi, tudo bem?",
        direction: "INBOUND",
        id: "msg-customer",
        source: "CUSTOMER",
      }),
      messageFixture({ body: "Já te atendo", id: "msg-owner", source: "OWNER" }),
    ]);

    await expectNoA11yViolations(container);
  });

  test("as opções de categoria formam um grupo com estado nunca só por cor", async () => {
    await renderThread(conversationFixture());

    const group = screen.getByRole("group", { name: "Categoria da conversa" });
    const commercial = within(group).getByRole("button", { name: "Comercial" });
    const personal = within(group).getByRole("button", { name: "Pessoal" });
    expect(commercial).toHaveAttribute("aria-pressed", "true");
    expect(personal).toHaveAttribute("aria-pressed", "false");

    const user = userEvent.setup();
    await tabUntilFocused(user, commercial);
    expect(commercial).toHaveFocus();
    await user.tab();
    expect(
      within(group).getByRole("button", { name: "Não classificada" }),
    ).toHaveFocus();
    await user.tab();
    expect(personal).toHaveFocus();
  });

  test("as sugestões da IA formam um grupo alcançável por teclado", async () => {
    generateSuggestions.mockResolvedValue({
      suggestions: ["Claro, temos horário amanhã às 10h", "Posso te ligar?"],
    });
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const trigger = screen.getByRole("button", { name: "Sugerir resposta" });
    await user.click(trigger);

    const group = await screen.findByRole("group", { name: "Sugestões da IA" });
    const first = within(group).getByRole("button", {
      name: "Claro, temos horário amanhã às 10h",
    });
    await tabUntilFocused(user, first);
    expect(first).toHaveFocus();
  });

  test("diálogo de Retomar IA: foco entra, Tab fica preso e Esc devolve o foco a quem abriu", async () => {
    await renderThread(conversationFixture());
    const user = userEvent.setup();

    const trigger = screen.getByRole("button", { name: "Retomar IA" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Devolver conversa para a IA?",
    });

    await expectNoA11yViolations(document.body);
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(
      within(dialog).getByRole("button", { name: "Retomar IA" }),
    ).toHaveFocus();
    await user.tab();
    expect(
      within(dialog).getByRole("button", { name: "Fechar" }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test("contexto do cliente em folha: foco entra no diálogo e Esc devolve o foco a quem abriu", async () => {
    await renderThread(
      conversationFixture({ customerId: "cust-1", handling: "AI", status: "ACTIVE" }),
    );
    const user = userEvent.setup();

    const trigger = screen.getByRole("button", {
      name: "Abrir contexto do cliente",
    });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Contexto da conversa",
    });

    await expectNoA11yViolations(document.body);
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test("mídia sob demanda: sem violação de acessibilidade com a imagem carregada no diálogo", async () => {
    URL.createObjectURL = vi.fn(() => "blob:mock-media-url");
    URL.revokeObjectURL = vi.fn();
    getMedia.mockResolvedValue({
      blob: new Blob(["fake-bytes"], { type: "image/png" }),
      contentType: "image/png",
      fileName: "foto.png",
    });
    await renderThread(conversationFixture(), [
      messageFixture({
        attachment: {
          durationSeconds: null,
          fileName: "foto.png",
          kind: "IMAGE",
          mediaAvailable: true,
          mimetype: "image/png",
          sizeBytes: 2048,
          tooLarge: false,
          transcript: null,
          transcriptError: null,
          transcriptStatus: null,
        },
        kind: "IMAGE",
      }),
    ]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Ver mídia/ }));
    await screen.findByRole("img", { name: "Imagem enviada na conversa" });

    await expectNoA11yViolations(document.body);
  });
});
