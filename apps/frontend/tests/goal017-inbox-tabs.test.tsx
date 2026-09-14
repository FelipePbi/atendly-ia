// @vitest-environment jsdom
/**
 * Goal017 (WU-03) — a inbox decomposta.
 *
 * O que este arquivo prova, pelo que a usuária encontra na tela e pelo que o
 * cliente HTTP recebe:
 *
 * - as três abas do vault mandam `category` ao BFF e a aba corrente é visível;
 * - quem está em `Aguardando você` sobe no topo da aba Comercial;
 * - ignorados têm entrada própria por `ignored`, com a copy do vault;
 * - a busca viaja por `search` junto da aba corrente, e buscando, sem
 *   resultado e aba vazia são três estados distintos;
 * - os seis estados de linguagem interna saem do contrato, não de heurística;
 * - aba, contador e badge de não lidas não existem mais.
 *
 * A invariante do shell entra de graça: tudo aqui roda dentro de
 * `ShellConfigProvider` com a tela real. Se um cenário declarasse
 * `useShellConfig` mais de uma vez por árvore, ou se um efeito não
 * estabilizasse, React lançaria "Maximum update depth exceeded" e estes
 * `render` cairiam.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation } from "@/data";
import {
  conversationState,
  conversationStateView,
} from "@/features/conversations/conversationState";
import { ProductConversationsScreen } from "@/features/conversations/ProductConversationsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
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

function conversationFixture(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    category: "COMMERCIAL",
    categorySource: "AUTOMATIC",
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

function renderInbox() {
  return render(
    <ShellConfigProvider>
      <ProductConversationsScreen />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  listConversations.mockReset();
  getConversation.mockReset();
  listMessages.mockReset();
  listConversations.mockResolvedValue([]);
});

describe("as três abas são servidas pelo backend", () => {
  test("a aba inicial pede a categoria comercial, não a lista inteira", async () => {
    listConversations.mockResolvedValue([conversationFixture()]);
    renderInbox();

    expect(await screen.findByText("Marina Duarte")).toBeVisible();
    expect(listConversations).toHaveBeenCalledWith(
      { category: "COMMERCIAL", limit: 50 },
      expect.anything(),
    );
  });

  test("trocar de aba refaz a consulta com a categoria da aba e a aba corrente fica visível", async () => {
    listConversations.mockResolvedValue([conversationFixture()]);
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText("Marina Duarte");

    await user.click(screen.getByRole("tab", { name: "Não classificadas" }));

    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith(
        { category: "UNCLASSIFIED", limit: 50 },
        expect.anything(),
      ),
    );
    expect(
      screen.getByRole("tab", { name: "Não classificadas" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Comercial" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(
      await screen.findByRole("tabpanel", {
        name: "Conversas · Não classificadas",
      }),
    ).toBeVisible();
  });

  test("a aba Pessoal declara que a IA está desativada naquela sessão", async () => {
    const user = userEvent.setup();
    renderInbox();
    await screen.findByRole("tab", { name: "Pessoal" });

    await user.click(screen.getByRole("tab", { name: "Pessoal" }));

    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith(
        { category: "PERSONAL", limit: 50 },
        expect.anything(),
      ),
    );
    expect(
      screen.getByText(/A IA está desativada nestas sessões/),
    ).toBeVisible();
  });

  test("quem está aguardando você sobe no topo da aba Comercial", async () => {
    listConversations.mockResolvedValue([
      conversationFixture({ customerName: "Ana IA", id: "conv-ai" }),
      conversationFixture({
        customerName: "Bruno Espera",
        handoffReason: "cliente pediu atendimento",
        humanHandoff: true,
        id: "conv-waiting",
        status: "HUMAN_HANDOFF",
      }),
    ]);
    renderInbox();

    await screen.findByText("Bruno Espera");
    const rows = screen.getAllByRole("link");
    expect(within(rows[0]).getByText("Bruno Espera")).toBeVisible();
    expect(within(rows[0]).getByText("Aguardando você")).toBeVisible();
    expect(within(rows[1]).getByText("Ana IA")).toBeVisible();
  });
});

describe("ignorados têm entrada própria", () => {
  test("a entrada consulta por ignored e diz que a IA não usa a conversa", async () => {
    const user = userEvent.setup();
    renderInbox();
    await screen.findByRole("button", { name: "Ignorados" });

    await user.click(screen.getByRole("button", { name: "Ignorados" }));

    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith(
        { ignored: true, limit: 50 },
        expect.anything(),
      ),
    );
    const note = screen.getByText(/A IA não usa estas conversas/);
    expect(note).toBeVisible();
    expect(note.textContent).toContain("As mensagens continuam aqui");
    expect(note.textContent).not.toMatch(/apagad|excluíd|bloquead/i);
  });
});

describe("a busca é do backend e tem estados próprios", () => {
  test("a busca viaja com a aba corrente e o vazio de busca não é o vazio de aba", async () => {
    listConversations.mockResolvedValue([conversationFixture()]);
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText("Marina Duarte");

    await user.click(screen.getByRole("tab", { name: "Pessoal" }));
    await waitFor(() =>
      expect(listConversations).toHaveBeenCalledWith(
        { category: "PERSONAL", limit: 50 },
        expect.anything(),
      ),
    );

    listConversations.mockResolvedValue([]);
    await user.type(
      screen.getByLabelText("Buscar por nome ou telefone"),
      "Bruno",
    );

    await waitFor(
      () =>
        expect(listConversations).toHaveBeenCalledWith(
          { category: "PERSONAL", limit: 50, search: "Bruno" },
          expect.anything(),
        ),
      { timeout: 3000 },
    );
    expect(
      await screen.findByText(/Nenhuma conversa em Pessoal corresponde a/),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: "Nenhuma conversa pessoal por enquanto",
      }),
    ).toBeNull();
  });

  test("aba vazia sem busca mostra o estado próprio da aba, com ação", async () => {
    renderInbox();

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma conversa comercial por enquanto",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Atualizar lista" }),
    ).toBeVisible();
  });

  test("enquanto a busca está em voo a tela diz que está buscando", async () => {
    listConversations.mockResolvedValue([conversationFixture()]);
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText("Marina Duarte");

    let release: (value: Conversation[]) => void = () => {};
    listConversations.mockImplementation(
      () =>
        new Promise<Conversation[]>((resolve) => {
          release = resolve;
        }),
    );
    await user.type(screen.getByLabelText("Buscar por nome ou telefone"), "Ma");

    expect(
      await screen.findByText(/Buscando conversas em Comercial/, undefined, {
        timeout: 3000,
      }),
    ).toBeVisible();
    release([conversationFixture()]);
    expect(await screen.findByText("Marina Duarte")).toBeVisible();
  });
});

describe("os seis estados de linguagem interna saem do contrato", () => {
  const cases: Array<[string, Partial<Conversation>, string]> = [
    ["IA ativa", {}, "ai-active"],
    [
      "IA atendendo",
      {
        session: {
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          id: "s1",
          startedAt: new Date().toISOString(),
        },
      },
      "ai-handling",
    ],
    ["IA pausada", { aiPaused: true }, "ai-paused"],
    ["IA pausada", { category: "PERSONAL" }, "ai-paused"],
    ["IA pausada", { ignored: true }, "ai-paused"],
    [
      "IA com instabilidade",
      {
        handoffReason: "erro: provedor indisponivel",
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
      },
      "ai-unstable",
    ],
    [
      "Aguardando você",
      {
        handoffReason: "cliente pediu atendimento",
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
      },
      "waiting-you",
    ],
    ["Você atendendo", { handling: "HUMAN" }, "you-handling"],
    [
      "Você atendendo",
      {
        handoffReason: "OWNER_TAKEOVER",
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
      },
      "you-handling",
    ],
  ];

  test.each(cases)(
    "%s é derivado de status/humanHandoff/handling/aiPaused/ignored/category/session",
    (label, overrides, state) => {
      const conversation = conversationFixture(overrides);
      expect(conversationState(conversation)).toBe(state);
      expect(conversationStateView(conversationState(conversation)).label).toBe(
        label,
      );
    },
  );

  test("os seis estados são exatamente o vocabulário do vault", () => {
    const labels = new Set(
      cases.map(
        ([, overrides]) =>
          conversationStateView(
            conversationState(conversationFixture(overrides)),
          ).label,
      ),
    );
    expect([...labels].sort()).toEqual([
      "Aguardando você",
      "IA atendendo",
      "IA ativa",
      "IA com instabilidade",
      "IA pausada",
      "Você atendendo",
    ]);
  });

  test("o estado derivado aparece na linha da conversa", async () => {
    listConversations.mockResolvedValue([
      conversationFixture({ aiPaused: true }),
    ]);
    renderInbox();

    const row = await screen.findByRole("link");
    expect(within(row).getByText("IA pausada")).toBeVisible();
  });
});

describe("a contagem de não lidas saiu da tela", () => {
  test("não há aba, contador nem badge de não lidas", async () => {
    listConversations.mockResolvedValue([
      conversationFixture({ unreadCount: 7 }),
    ]);
    const { container } = renderInbox();

    await screen.findByText("Marina Duarte");
    expect(screen.queryByRole("button", { name: /não lidas/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /não lidas/i })).toBeNull();
    expect(screen.queryByText("7")).toBeNull();
    expect(screen.queryByLabelText(/não lidas/i)).toBeNull();
    expect(container.querySelector(".unread-count")).toBeNull();
  });
});

describe("o despachante separa os dois cenários", () => {
  test("sem id monta a inbox; com id monta o chat, e cada um declara o shell uma vez", async () => {
    listConversations.mockResolvedValue([conversationFixture()]);
    const { unmount } = renderInbox();
    expect(
      await screen.findByRole("heading", { name: "Conversas", level: 1 }),
    ).toBeVisible();
    unmount();

    getConversation.mockResolvedValue(conversationFixture());
    listMessages.mockResolvedValue([]);
    render(
      <ShellConfigProvider>
        <ProductConversationsScreen conversationId="conv-1" />
      </ShellConfigProvider>,
    );

    expect(
      await screen.findByLabelText("Histórico da conversa com Marina Duarte"),
    ).toBeVisible();
    expect(
      screen.getByText("A IA responde em nome do negócio na próxima mensagem."),
    ).toBeVisible();
  });
});
