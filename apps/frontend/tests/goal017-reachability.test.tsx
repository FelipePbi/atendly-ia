// @vitest-environment jsdom
/**
 * Goal017 (WU-07) — alcançabilidade pela rota.
 *
 * `implementationHints` desta unidade é direto: "teste que passe sobre
 * componente sem importador não prova fluxo entregue". Esta suíte monta as
 * duas páginas reais de `app/(platform)/conversas/` — não os componentes de
 * `features/conversations/` importados direto — e prova, pelo `href` real,
 * que a inbox leva ao chat e o chat volta para a inbox pela mesma rota
 * dinâmica. `ConversationContextPanel` e `ConversationSuggestions` também são
 * alcançados por aqui: nenhum dos dois existe só como import de teste.
 */

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation } from "@/data";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const listConversations = vi.fn();
const getConversation = vi.fn();
const listMessages = vi.fn();

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

import ConversationDetailPage from "@/app/(platform)/conversas/[id]/page";
import ConversationsPage from "@/app/(platform)/conversas/page";

function conversationFixture(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    category: "COMMERCIAL",
    categorySource: "AUTOMATIC",
    customerId: null,
    customerName: "Marina Duarte",
    externalContactId: "5511999990000@c.us",
    handling: "AI",
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

beforeEach(() => {
  listConversations.mockReset();
  getConversation.mockReset();
  listMessages.mockReset();
  listConversations.mockResolvedValue([]);
});

function renderPage(page: React.ReactElement) {
  return render(<ShellConfigProvider>{page}</ShellConfigProvider>);
}

async function renderConversation(id: string) {
  const element = await ConversationDetailPage({
    params: Promise.resolve({ id }),
  });
  return renderPage(element);
}

describe("as duas telas do Goal017 montam pela própria rota", () => {
  test("/conversas monta a inbox", async () => {
    renderPage(<ConversationsPage />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Conversas" }),
    ).toBeVisible();
  });

  test("/conversas/[id] monta o chat da conversa", async () => {
    getConversation.mockResolvedValue(conversationFixture());
    listMessages.mockResolvedValue([]);
    listConversations.mockResolvedValue([conversationFixture()]);

    await renderConversation("conv-1");

    expect(
      await screen.findByLabelText("Histórico da conversa com Marina Duarte"),
    ).toBeVisible();
  });
});

describe("a inbox leva ao chat pela rota dinâmica, e o chat volta pela mesma rota", () => {
  test("a linha da conversa aponta para /conversas/{id}", async () => {
    listConversations.mockResolvedValue([
      conversationFixture({ id: "conv-42" }),
    ]);

    renderPage(<ConversationsPage />);

    const link = await screen.findByRole("link", { name: /Marina Duarte/ });
    expect(link).toHaveAttribute("href", "/conversas/conv-42");
  });

  test("o chat oferece o caminho de volta para /conversas", async () => {
    getConversation.mockResolvedValue(conversationFixture());
    listMessages.mockResolvedValue([]);
    listConversations.mockResolvedValue([]);

    await renderConversation("conv-1");

    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    expect(
      screen.getByRole("link", { name: "Voltar para conversas" }),
    ).toHaveAttribute("href", "/conversas");
  });

  test("o rail de conversas recentes do chat também aponta para a rota de cada conversa", async () => {
    getConversation.mockResolvedValue(conversationFixture({ id: "conv-1" }));
    listMessages.mockResolvedValue([]);
    listConversations.mockResolvedValue([
      conversationFixture({ id: "conv-1" }),
      conversationFixture({ customerName: "Bruno Nunes", id: "conv-2" }),
    ]);

    await renderConversation("conv-1");

    const rail = await screen.findByLabelText("Conversas recentes");
    const other = within(rail).getByRole("link", { name: /Bruno Nunes/ });
    expect(other).toHaveAttribute("href", "/conversas/conv-2");
  });
});

describe("ConversationContextPanel e ConversationSuggestions não ficam sem importador", () => {
  test("o contexto do cliente é alcançado pelo chat real, ligando por customerId", async () => {
    getConversation.mockResolvedValue(
      conversationFixture({ customerId: "cust-1" }),
    );
    listMessages.mockResolvedValue([]);
    listConversations.mockResolvedValue([]);

    await renderConversation("conv-1");

    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    const context = await screen.findByLabelText("Contexto da conversa");
    expect(
      within(context).getByRole("link", { name: "Abrir cliente" }),
    ).toHaveAttribute("href", "/clientes/detalhes?id=cust-1");
  });

  test("a sugestão da IA só é alcançada pelo chat quando há atendimento humano vigente", async () => {
    getConversation.mockResolvedValue(
      conversationFixture({ handling: "HUMAN", status: "HUMAN_HANDOFF" }),
    );
    listMessages.mockResolvedValue([]);
    listConversations.mockResolvedValue([]);

    await renderConversation("conv-1");

    expect(
      await screen.findByRole("button", { name: "Sugerir resposta" }),
    ).toBeVisible();
  });

  test("sem atendimento humano vigente, a sugestão da IA não aparece", async () => {
    getConversation.mockResolvedValue(
      conversationFixture({ handling: "AI", status: "ACTIVE" }),
    );
    listMessages.mockResolvedValue([]);
    listConversations.mockResolvedValue([]);

    await renderConversation("conv-1");

    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    expect(
      screen.queryByRole("button", { name: "Sugerir resposta" }),
    ).toBeNull();
  });
});
