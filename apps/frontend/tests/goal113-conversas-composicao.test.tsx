// @vitest-environment jsdom
/**
 * Goal113 (WU-03) — o vazio conectado (C4) e a composição de 1024 px em diante.
 *
 * O matchMedia daqui guarda os ouvintes e os chama quando a largura muda, que é
 * o que `useWideLayout` escuta (mesma técnica do Goal112). A prova de que aba,
 * termo e busca aberta sobrevivem ao cruzar 1024 px é por valor e por identidade
 * de nó (`toBe`): o mesmo objeto do DOM antes e depois.
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, ConversationQuery } from "@/data";
import { ProductConversationsScreen } from "@/features/conversations/ProductConversationsScreen";
import type * as ShellConfigModule from "@/shared/layout/ShellConfig";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const shellDeclarers = { active: 0, max: 0 };

vi.mock("@/shared/layout/ShellConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof ShellConfigModule>();
  return {
    ...actual,
    useShellConfig: (...args: Parameters<typeof actual.useShellConfig>) => {
      actual.useShellConfig(...args);
      useEffect(() => {
        shellDeclarers.active += 1;
        shellDeclarers.max = Math.max(
          shellDeclarers.max,
          shellDeclarers.active,
        );
        return () => {
          shellDeclarers.active -= 1;
        };
      }, []);
    },
  };
});

const listConversations = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      get: vi.fn(),
      list: listConversations,
      listMessages: vi.fn(),
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

type Listener = () => void;

function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<Listener>();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: (_type: string, listener: Listener) => {
          listeners.add(listener);
        },
        get matches() {
          return min ? width >= Number(min[1]) : false;
        },
        media: query,
        removeEventListener: (_type: string, listener: Listener) => {
          listeners.delete(listener);
        },
      };
    },
    writable: true,
  });
  return {
    resize(next: number) {
      width = next;
      act(() => {
        for (const listener of Array.from(listeners)) listener();
      });
    },
  };
}

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
    updatedAt: "2026-09-14T16:42:00.000Z",
    ...overrides,
  };
}

function serve(byCategory: Record<string, Conversation[]>) {
  listConversations.mockImplementation(async (query: ConversationQuery) => {
    if (query.ignored) return byCategory.IGNORED ?? [];
    return byCategory[query.category ?? ""] ?? [];
  });
}

function statusFixture(phoneNumber: string | undefined) {
  return {
    accountDeletion: { dueAt: null, status: "NONE" },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "NOOP",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-14T16:45:00.000Z",
      phoneNumber,
      status: "CONNECTED",
    },
  };
}

function renderInbox() {
  return render(
    <SystemStatusProvider>
      <ShellConfigProvider>
        <ProductConversationsScreen />
      </ShellConfigProvider>
    </SystemStatusProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-14T16:45:00.000Z"));
  shellDeclarers.active = 0;
  shellDeclarers.max = 0;
  listConversations.mockReset();
  statusGet.mockReset();
  notificationsSummary.mockReset();
  listConversations.mockResolvedValue([]);
  statusGet.mockResolvedValue(statusFixture("5511987654321"));
  notificationsSummary.mockResolvedValue({
    byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
    openConditionsCount: 0,
    unreadCount: 0,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
  vi.useRealTimers();
});

const C4_TITLE =
  "Quando alguém falar com você pelo WhatsApp, a conversa aparecerá aqui.";

describe("C4: vazio com o WhatsApp conectado", () => {
  test("mostra o texto do quadro, as abas e a pílula com o telefone formatado", async () => {
    installMatchMedia(390);
    const { container } = renderInbox();

    expect(
      await screen.findByRole("heading", { name: C4_TITLE }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "A IA responde clientes automaticamente e avisa quando precisar de você.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("tablist")).toBeVisible();
    expect(screen.getByText("Conectado · +55 11 98765-4321")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Atualizar lista" }),
    ).toBeNull();
    expect(container.querySelector(".is-connected-empty")).not.toBeNull();
  });

  test("sem telefone lido a pílula diz só Conectado", async () => {
    installMatchMedia(390);
    statusGet.mockResolvedValue(statusFixture(undefined));
    renderInbox();

    await screen.findByRole("heading", { name: C4_TITLE });
    expect(screen.getByText("Conectado")).toBeVisible();
    expect(screen.queryByText(/Conectado ·/)).toBeNull();
  });

  test("com telefone que não é brasileiro a pílula não mostra dígitos crus", async () => {
    installMatchMedia(390);
    statusGet.mockResolvedValue(statusFixture("14155550123"));
    renderInbox();

    await screen.findByRole("heading", { name: C4_TITLE });
    expect(screen.getByText("Conectado")).toBeVisible();
  });

  test("de 1024 px em diante o C4 não ganha painel nem coluna", async () => {
    installMatchMedia(1280);
    const { container } = renderInbox();

    await screen.findByRole("heading", { name: C4_TITLE });
    expect(screen.queryByText("Selecione uma conversa")).toBeNull();
    expect(
      screen.queryByRole("complementary", { name: "Conversas" }),
    ).toBeNull();
    expect(container.querySelector(".list-detail")).toBeNull();
    expect(container.querySelector(".list-detail-flat")).not.toBeNull();
  });

  test("outra aba vazia continua com o estado próprio e não mostra a pílula", async () => {
    installMatchMedia(390);
    const user = userEvent.setup();
    renderInbox();
    await screen.findByRole("heading", { name: C4_TITLE });

    await user.click(screen.getByRole("tab", { name: "Pessoal" }));

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma conversa pessoal por enquanto",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Conectado")).toBeNull();
  });
});

describe("composição de 1024 px em diante", () => {
  test("de 1024 px em diante a lista fica numa coluna e o painel ao lado", async () => {
    serve({ COMMERCIAL: [conversationFixture()] });
    installMatchMedia(1280);
    const { container } = renderInbox();

    await screen.findByText("Marina Duarte");
    const column = screen.getByRole("complementary", { name: "Conversas" });
    expect(column).toHaveClass("list-detail-list");
    expect(column).toContainElement(screen.getByText("Marina Duarte"));
    expect(screen.getByText("Selecione uma conversa")).toBeVisible();
    expect(container.querySelector(".list-detail")).not.toBeNull();
    expect(
      container.querySelector(".list-detail.conversation-list-detail"),
    ).not.toBeNull();
    expect(container.querySelector(".list-detail-flat")).toBeNull();
  });

  test("abaixo de 1024 px não há painel nem coluna marcada", async () => {
    serve({ COMMERCIAL: [conversationFixture()] });
    installMatchMedia(390);
    const { container } = renderInbox();

    await screen.findByText("Marina Duarte");
    expect(screen.queryByText("Selecione uma conversa")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(container.querySelector(".list-detail")).toBeNull();
    expect(container.querySelector(".list-detail-flat")).not.toBeNull();
  });

  test("o painel some e volta com a aba: C4 na Comercial, painel na Pessoal", async () => {
    serve({
      PERSONAL: [conversationFixture({ category: "PERSONAL", id: "p1" })],
    });
    installMatchMedia(1280);
    const user = userEvent.setup();
    renderInbox();
    await screen.findByRole("heading", { name: C4_TITLE });
    expect(screen.queryByText("Selecione uma conversa")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Pessoal" }));

    await screen.findByText("Marina Duarte");
    expect(screen.getByText("Selecione uma conversa")).toBeVisible();
  });

  test("aba, termo e busca aberta sobrevivem a 390 -> 1280 -> 390, com os mesmos nós", async () => {
    serve({
      COMMERCIAL: [conversationFixture()],
      UNCLASSIFIED: [
        conversationFixture({
          category: "UNCLASSIFIED",
          customerName: "Bruno Lima",
          id: "u1",
        }),
      ],
    });
    const media = installMatchMedia(390);
    const user = userEvent.setup();
    const { container } = renderInbox();
    await screen.findByText("Marina Duarte");

    await user.click(screen.getByRole("tab", { name: "Não classificadas" }));
    await screen.findByText("Bruno Lima");
    await user.click(screen.getByRole("button", { name: "Buscar conversas" }));
    const input = screen.getByRole("searchbox", {
      name: "Buscar por nome ou telefone",
    });
    await user.type(input, "Bru");
    const tablist = screen.getByRole("tablist");
    const tab = screen.getByRole("tab", { name: "Não classificadas" });
    const toggle = screen.getByRole("button", { name: "Buscar conversas" });
    const page = container.querySelector(".conversation-list-page");
    const column = container.querySelector(".conversation-list-column");
    const wrapper = container.querySelector(".list-detail-flat");
    expect(page).not.toBeNull();
    expect(column).not.toBeNull();
    expect(wrapper).not.toBeNull();

    media.resize(1280);

    expect(screen.getByText("Selecione uma conversa")).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "Buscar por nome ou telefone" }),
    ).toBe(input);
    expect(input).toHaveValue("Bru");
    expect(input.isConnected).toBe(true);
    expect(screen.getByRole("tablist")).toBe(tablist);
    expect(screen.getByRole("tab", { name: "Não classificadas" })).toBe(tab);
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Buscar conversas" })).toBe(
      toggle,
    );
    expect(container.querySelector(".conversation-list-page")).toBe(page);
    expect(container.querySelector(".conversation-list-column")).toBe(column);
    expect(container.querySelector(".list-detail")).toBe(wrapper);

    media.resize(390);

    expect(screen.queryByText("Selecione uma conversa")).toBeNull();
    expect(
      screen.getByRole("searchbox", { name: "Buscar por nome ou telefone" }),
    ).toBe(input);
    expect(input).toHaveValue("Bru");
    expect(screen.getByRole("tab", { name: "Não classificadas" })).toBe(tab);
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".conversation-list-page")).toBe(page);
    expect(container.querySelector(".list-detail-flat")).toBe(wrapper);
    await waitFor(() => expect(screen.getByText("Bruno Lima")).toBeVisible());
  });

  test("a mesma travessia de 1280 -> 390 -> 1280 mantém os mesmos nós", async () => {
    serve({ COMMERCIAL: [conversationFixture()] });
    const media = installMatchMedia(1280);
    const user = userEvent.setup();
    renderInbox();
    await screen.findByText("Marina Duarte");
    await user.click(screen.getByRole("button", { name: "Buscar conversas" }));
    const input = screen.getByRole("searchbox", {
      name: "Buscar por nome ou telefone",
    });
    await user.type(input, "Mar");

    media.resize(390);
    expect(
      screen.getByRole("searchbox", { name: "Buscar por nome ou telefone" }),
    ).toBe(input);
    expect(input).toHaveValue("Mar");

    media.resize(1280);
    expect(
      screen.getByRole("searchbox", { name: "Buscar por nome ou telefone" }),
    ).toBe(input);
    expect(input).toHaveValue("Mar");
    expect(screen.getByRole("tab", { name: "Comercial" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("uma declaração de useShellConfig por árvore em todas as larguras", async () => {
    serve({ COMMERCIAL: [conversationFixture()] });
    const media = installMatchMedia(390);
    renderInbox();
    await screen.findByText("Marina Duarte");
    expect(shellDeclarers.active).toBe(1);

    media.resize(1280);
    expect(shellDeclarers.active).toBe(1);

    media.resize(390);
    expect(shellDeclarers.active).toBe(1);
    expect(shellDeclarers.max).toBe(1);
  });
});
