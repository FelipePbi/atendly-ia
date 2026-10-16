// @vitest-environment jsdom
/**
 * Conversas sem piscar (pedido de 2026-10-16), o mesmo ajuste de Clientes.
 *
 * Clicar numa conversa trocava a rota `/conversas/[id]` e remontava a tela
 * inteira: a coluna da lista sumia até a conversa carregar, era buscada de
 * novo e o chat mostrava esqueleto. Agora a lista e o chat moram na casca do
 * layout (`ConversationsWorkspace`): de 1024 px em diante, trocar de conversa
 * não remonta nem busca a lista, a anterior fica no painel até a nova chegar
 * (sem esqueleto) e a troca é a View Transition `conversation-swap`.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation, Message } from "@/data";
import {
  ShellConfigProvider,
  useShellConfigValue,
} from "@/shared/layout/ShellConfig";
import { SystemStatusProvider } from "@/shared/runtime/systemStatus";

let currentPath = "/conversas/conv-1";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const listConversations = vi.fn();
const getConversation = vi.fn();
const listMessages = vi.fn();
const statusGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { listAppointments: vi.fn().mockResolvedValue([]) },
    customers: { generateSummary: vi.fn(), get: vi.fn() },
    conversations: {
      get: getConversation,
      list: listConversations,
      listMessages,
    },
    notifications: {
      summary: vi.fn().mockResolvedValue({
        byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
        openConditionsCount: 0,
        unreadCount: 0,
      }),
    },
    status: { get: statusGet },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
    },
  }),
}));

import ConversationDetailPage from "@/app/(platform)/conversas/[id]/page";
import ConversasLayout from "@/app/(platform)/conversas/layout";
import ConversationsPage from "@/app/(platform)/conversas/page";

function conversation(id: string, customerName: string): Conversation {
  return {
    category: "COMMERCIAL",
    categorySource: "AUTOMATIC",
    customerId: null,
    customerName,
    externalContactId: `55119999${id}@c.us`,
    handling: "AI",
    handoffReason: null,
    humanHandoff: false,
    id,
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-10-16T12:00:00.000Z",
  };
}

const CONVERSATIONS = {
  "conv-1": conversation("conv-1", "Marina Duarte"),
  "conv-2": conversation("conv-2", "Bruno Nunes"),
};

function setWideViewport() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      matches: /min-width:\s*1024px/.test(query),
      media: query,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
    writable: true,
  });
}

/** View Transition fake: aplica a atualização na hora e anota o tipo. */
function stubViewTransition() {
  const types: string[][] = [];
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (update: () => void) => {
      types.push(
        [...document.documentElement.classList].filter((c) =>
          c.startsWith("vt-"),
        ),
      );
      update();
      return { finished: Promise.resolve() };
    },
  });
  return types;
}

/** Pedido da conversa que só responde quando o teste manda. */
function deferredConversation() {
  let resolve: (value: Conversation) => void = () => undefined;
  getConversation.mockImplementationOnce(
    () =>
      new Promise<Conversation>((done) => {
        resolve = done;
      }),
  );
  return (value: Conversation) => act(async () => resolve(value));
}

function workspace() {
  return (
    <SystemStatusProvider>
      <ShellConfigProvider>
        <ConversasLayout>
          <ConversationDetailPage />
        </ConversasLayout>
      </ShellConfigProvider>
    </SystemStatusProvider>
  );
}

beforeEach(() => {
  setWideViewport();
  currentPath = "/conversas/conv-1";
  listConversations.mockReset();
  getConversation.mockReset();
  listMessages.mockReset();
  statusGet.mockReset();
  listConversations.mockResolvedValue(Object.values(CONVERSATIONS));
  getConversation.mockImplementation(
    async (id: keyof typeof CONVERSATIONS) => CONVERSATIONS[id],
  );
  listMessages.mockResolvedValue([] satisfies Message[]);
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
      checkedAt: "2026-10-16T12:00:00.000Z",
      phoneNumber: "5511999990000",
      status: "CONNECTED",
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(document, "startViewTransition");
});

describe("trocar de conversa ao lado da lista", () => {
  test("não remonta nem busca a lista, não mostra esqueleto e faz crossfade", async () => {
    const transitions = stubViewTransition();
    const { rerender } = render(workspace());

    await screen.findByLabelText("Histórico da conversa com Marina Duarte");
    const column = screen.getByRole("complementary", { name: "Conversas" });
    await within(column).findByRole("link", { name: /Bruno Nunes/ });
    const listCalls = listConversations.mock.calls.length;
    transitions.length = 0;

    const arrive = deferredConversation();
    currentPath = "/conversas/conv-2";
    rerender(workspace());

    // Enquanto a nova não chega: a anterior fica, sem esqueleto, e a lista
    // é a mesma coluna, já com a nova conversa marcada.
    expect(
      screen.getByLabelText("Histórico da conversa com Marina Duarte"),
    ).toBeInTheDocument();
    expect(document.querySelector(".skeleton")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Conversas" })).toBe(
      column,
    );

    await arrive(CONVERSATIONS["conv-2"]);
    expect(
      await screen.findByLabelText("Histórico da conversa com Bruno Nunes"),
    ).toBeVisible();

    expect(transitions).toEqual([["vt-conversation-swap"]]);
    expect(screen.getByRole("complementary", { name: "Conversas" })).toBe(
      column,
    );
    expect(listConversations.mock.calls.length).toBe(listCalls);
  });
});

/** A classe que a tela pediu para o `<main>` da casca. */
const shell: { mainClass?: string } = {};
function MainClassProbe() {
  const value = useShellConfigValue()?.mainClassName;
  useEffect(() => {
    shell.mainClass = value;
  });
  return null;
}

function inbox() {
  return (
    <SystemStatusProvider>
      <ShellConfigProvider>
        <MainClassProbe />
        <ConversasLayout>
          <ConversationsPage />
        </ConversasLayout>
      </ShellConfigProvider>
    </SystemStatusProvider>
  );
}

describe("entrar em Conversas e abrir a primeira conversa (vídeo de 2026-10-16)", () => {
  test("sem esqueleto: a tela já nasce dividida, só com o título até o status responder", () => {
    currentPath = "/conversas";
    statusGet.mockImplementation(() => new Promise(() => undefined));
    listConversations.mockImplementation(() => new Promise(() => undefined));
    const { container } = render(inbox());

    // Dividida desde o primeiro quadro: a coluna e o painel vazio ao lado.
    expect(
      screen.getByRole("complementary", { name: "Conversas" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Selecione uma conversa")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Conversas" }),
    ).toBeInTheDocument();
    // Nada de esqueleto nem de abas enquanto o status não responde.
    expect(container.querySelector(".skeleton")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  test("a lista chega com fade; abrir a primeira conversa não troca a moldura da tela", async () => {
    currentPath = "/conversas";
    const view = render(inbox());

    const column = await screen.findByRole("complementary", {
      name: "Conversas",
    });
    await within(column).findByRole("link", { name: /Marina Duarte/ });
    expect(column.querySelector(".conversation-list-page")).toHaveClass(
      "is-arriving",
    );
    expect(view.container.querySelector(".skeleton")).toBeNull();
    // A moldura do chat já vale na caixa de entrada dividida.
    await waitFor(() =>
      expect(shell.mainClass).toBe("conversation-detail-main"),
    );

    currentPath = "/conversas/conv-1";
    view.rerender(inbox());
    expect(shell.mainClass).toBe("conversation-detail-main");
    expect(
      await screen.findByLabelText("Histórico da conversa com Marina Duarte"),
    ).toBeVisible();
    expect(shell.mainClass).toBe("conversation-detail-main");
    expect(screen.getByRole("complementary", { name: "Conversas" })).toBe(
      column,
    );
  });
});
