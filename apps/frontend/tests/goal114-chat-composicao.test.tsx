// @vitest-environment jsdom
/**
 * Goal114 — a composição do chat nas duas faixas.
 *
 * O matchMedia daqui guarda os ouvintes e os chama quando a largura muda, que é
 * o que `useWideLayout` escuta (mesma técnica do Goal112 e do Goal113). O que
 * este arquivo prova:
 *
 * - abaixo de 1024 px o chat é tela empurrada e a lista nem é lida;
 * - de 1024 px em diante a coluna ao lado é a lista de `/conversas`, aberta na
 *   aba da categoria da conversa e com a linha aberta marcada
 *   (`aria-current="page"`);
 * - o rascunho e o próprio nó do campo (`toBe`) sobrevivem a 390 → 1280 → 390
 *   e a 1280 → 390 → 1280;
 * - uma só chamada viva de `useShellConfig` por árvore, nas duas faixas e ao
 *   cruzar.
 */

import { act, cleanup, render, screen, within } from "@testing-library/react";
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

const getConversation = vi.fn();
const listMessages = vi.fn();
const listEvents = vi.fn();
const listConversations = vi.fn();
const statusGet = vi.fn();
const notificationsSummary = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      get: getConversation,
      list: listConversations,
      listEvents,
      listMessages,
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
    customerName: "Ana Paula",
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

const other = conversationFixture({
  customerName: "Juliana Mendes",
  id: "conv-2",
  updatedAt: "2026-09-14T15:10:00.000Z",
});

function serve(open: Conversation, byCategory: Record<string, Conversation[]>) {
  getConversation.mockResolvedValue(open);
  listMessages.mockResolvedValue([]);
  listEvents.mockResolvedValue([]);
  listConversations.mockImplementation(async (query: ConversationQuery) => {
    if (query.ignored) return [];
    return byCategory[query.category ?? ""] ?? [];
  });
}

function renderChat(id = "conv-1") {
  return render(
    <SystemStatusProvider>
      <ShellConfigProvider>
        <ProductConversationsScreen conversationId={id} />
      </ShellConfigProvider>
    </SystemStatusProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-14T16:45:00.000Z"));
  shellDeclarers.active = 0;
  shellDeclarers.max = 0;
  for (const mock of [
    getConversation,
    listMessages,
    listEvents,
    listConversations,
    statusGet,
    notificationsSummary,
  ]) {
    mock.mockReset();
  }
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
      checkedAt: "2026-09-14T16:45:00.000Z",
      phoneNumber: "5511987654321",
      status: "CONNECTED",
    },
  });
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

async function chatReady() {
  return screen.findByLabelText("Histórico da conversa com Ana Paula");
}

describe("abaixo de 1024 px o chat é tela empurrada", () => {
  test("sem coluna da lista, sem leitura da lista e com o voltar", async () => {
    serve(conversationFixture(), { COMMERCIAL: [conversationFixture(), other] });
    installMatchMedia(390);
    const { container } = renderChat();

    await chatReady();
    expect(
      screen.queryByRole("complementary", { name: "Conversas" }),
    ).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(listConversations).not.toHaveBeenCalled();
    expect(container.querySelector(".list-detail-flat")).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Voltar para conversas" }),
    ).toHaveAttribute("href", "/conversas");
  });
});

describe("de 1024 px em diante a coluna é a lista do Goal113", () => {
  test("aba da categoria da conversa e a linha aberta marcada", async () => {
    serve(conversationFixture(), { COMMERCIAL: [conversationFixture(), other] });
    installMatchMedia(1280);
    const { container } = renderChat();

    await chatReady();
    const column = await screen.findByRole("complementary", {
      name: "Conversas",
    });
    expect(
      within(column).getByRole("heading", { level: 1, name: "Conversas" }),
    ).toBeVisible();
    expect(
      within(column).getByRole("tab", { name: "Comercial" }),
    ).toHaveAttribute("aria-selected", "true");
    const open = await within(column).findByRole("link", { name: /Ana Paula/ });
    const rest = within(column).getByRole("link", { name: /Juliana Mendes/ });
    expect(open).toHaveAttribute("aria-current", "page");
    expect(open).toHaveClass("is-selected");
    expect(rest).not.toHaveAttribute("aria-current");
    expect(container.querySelector(".conversation-rail")).toBeNull();
    expect(container.querySelector(".conversation-context")).toBeNull();
    expect(
      container.querySelector(".list-detail.conversation-list-detail"),
    ).not.toBeNull();
    for (const call of listConversations.mock.calls) {
      expect((call[0] as ConversationQuery).limit).toBe(50);
      expect((call[0] as ConversationQuery).category).toBeDefined();
    }
  });

  test("a conversa pessoal abre a coluna na aba Pessoal", async () => {
    const mother = conversationFixture({
      category: "PERSONAL",
      customerName: "Ana Paula",
      ignored: true,
    });
    serve(mother, { PERSONAL: [mother] });
    installMatchMedia(1366);
    renderChat();

    await chatReady();
    const column = await screen.findByRole("complementary", {
      name: "Conversas",
    });
    expect(within(column).getByRole("tab", { name: "Pessoal" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await within(column).findByRole("link", { name: /Ana Paula/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(listConversations).toHaveBeenCalledWith(
      expect.objectContaining({ category: "PERSONAL" }),
      expect.anything(),
    );
  });
});

describe("cruzar 1024 px não apaga o rascunho nem troca o campo", () => {
  test("390 -> 1280 -> 390 mantém o texto e o mesmo nó", async () => {
    serve(conversationFixture(), { COMMERCIAL: [conversationFixture()] });
    const media = installMatchMedia(390);
    const user = userEvent.setup();
    renderChat();
    await chatReady();

    const field = screen.getByLabelText<HTMLTextAreaElement>("Mensagem");
    await user.type(field, "Oi, Ana!");

    media.resize(1280);
    await screen.findByRole("complementary", { name: "Conversas" });
    expect(screen.getByLabelText("Mensagem")).toBe(field);
    expect(field.value).toBe("Oi, Ana!");

    media.resize(390);
    expect(
      screen.queryByRole("complementary", { name: "Conversas" }),
    ).toBeNull();
    expect(screen.getByLabelText("Mensagem")).toBe(field);
    expect(field.value).toBe("Oi, Ana!");
  });

  test("1280 -> 390 -> 1280 mantém o texto e o mesmo nó", async () => {
    serve(conversationFixture(), { COMMERCIAL: [conversationFixture()] });
    const media = installMatchMedia(1280);
    const user = userEvent.setup();
    renderChat();
    await chatReady();

    const field = screen.getByLabelText<HTMLTextAreaElement>("Mensagem");
    await user.type(field, "Confirmo sexta");

    media.resize(390);
    expect(screen.getByLabelText("Mensagem")).toBe(field);
    media.resize(1280);
    await screen.findByRole("complementary", { name: "Conversas" });
    expect(screen.getByLabelText("Mensagem")).toBe(field);
    expect(field.value).toBe("Confirmo sexta");
  });
});

describe("um só useShellConfig por árvore", () => {
  test("nas duas faixas e ao cruzar", async () => {
    serve(conversationFixture(), { COMMERCIAL: [conversationFixture(), other] });
    const media = installMatchMedia(390);
    renderChat();
    await chatReady();
    expect(shellDeclarers.active).toBe(1);

    media.resize(1280);
    await screen.findByRole("complementary", { name: "Conversas" });
    await screen.findByRole("link", { name: /Juliana Mendes/ });
    expect(shellDeclarers.active).toBe(1);

    media.resize(390);
    expect(shellDeclarers.active).toBe(1);
    expect(shellDeclarers.max).toBe(1);
  });
});
