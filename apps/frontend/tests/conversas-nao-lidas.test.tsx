// @vitest-environment jsdom
/**
 * Conversas não lidas (D-195): o contador do item "Conversas" na sidebar e na
 * barra inferior, o aviso de mensagem nova que desce do topo em qualquer tela
 * menos a da própria conversa, e a conversa aberta marcada como vista.
 */
import { readFileSync } from "node:fs";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  Conversation,
  ConversationUnreadSummary,
  Message,
  UnreadMessagePreview,
} from "@/data";
import { useMarkConversationRead } from "@/features/conversations/useMarkConversationRead";
import { AppShell } from "@/shared/layout/AppShell";
import { unreadConversationsLabel } from "@/shared/layout/navigation";
import {
  MAX_MESSAGE_ALERTS,
  mergeAlerts,
  MESSAGE_ALERT_DURATION_MS,
  newMessagesToAlert,
  openConversationId,
  UNREAD_POLL_MS,
} from "@/shared/runtime/conversationAlerts";
import {
  MESSAGE_ALERT_EXIT_MS,
  messageAlertPreview,
  MessageAlertStack,
} from "@/shared/ui/MessageAlertHost";

import { expectNoA11yViolations } from "./support/a11y";

const navigation = vi.hoisted(() => ({ pathname: "/agenda" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const unreadSummary = vi.fn<() => Promise<ConversationUnreadSummary>>();
const markRead = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    conversations: { markRead, unreadSummary },
    notifications: {
      summary: vi.fn().mockResolvedValue({
        byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
        unreadCount: 0,
        openConditionsCount: 0,
      }),
    },
    status: {
      get: vi.fn().mockResolvedValue({
        accountDeletion: { status: "NONE", dueAt: null },
        ai: {
          desiredEnabled: true,
          effectiveEnabled: true,
          reconciled: "CONVERGED",
          state: "ACTIVE",
        },
        degraded: false,
        whatsapp: {
          checkedAt: "2026-10-18T12:00:00.000Z",
          phoneNumber: null,
          status: "CONNECTED",
        },
      }),
    },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

function preview(
  overrides: Partial<UnreadMessagePreview> & { conversationId: string },
): UnreadMessagePreview {
  return {
    messageId: `msg-${overrides.conversationId}`,
    customerName: "Maria Souza",
    externalContactId: "5511976543210",
    customerId: null,
    kind: "TEXT",
    preview: "Tem horário amanhã?",
    createdAt: "2026-10-18T12:00:00.000Z",
    ...overrides,
  };
}

function summary(
  unreadConversations: number,
  recent: UnreadMessagePreview[] = [],
): ConversationUnreadSummary {
  return { unreadConversations, recent };
}

function renderShell() {
  return render(
    <AppShell active="agenda" title="Agenda">
      <p>Conteúdo</p>
    </AppShell>,
  );
}

/** Deixa as promessas da leitura assentarem dentro do `act`. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  navigation.pathname = "/agenda";
  unreadSummary.mockReset();
  markRead.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("regras puras", () => {
  test("a primeira leitura é a base: nada do que já estava lá vira aviso", () => {
    expect(newMessagesToAlert([preview({ conversationId: "a" })], null, null)).toEqual([]);
  });

  test("só avisa o que chegou depois da leitura anterior e nunca a conversa aberta", () => {
    const old = preview({
      conversationId: "a",
      createdAt: "2026-10-18T12:00:00.000Z",
    });
    const fresh = preview({
      conversationId: "b",
      createdAt: "2026-10-18T12:01:00.000Z",
    });
    const open = preview({
      conversationId: "c",
      createdAt: "2026-10-18T12:02:00.000Z",
    });
    expect(
      newMessagesToAlert([open, fresh, old], "2026-10-18T12:00:00.000Z", "c"),
    ).toEqual([fresh]);
  });

  test("um aviso por conversa, o mais novo em cima, no teto da pilha", () => {
    const first = preview({ conversationId: "a", messageId: "1" });
    const replaced = preview({ conversationId: "a", messageId: "2" });
    const others = ["b", "c", "d"].map((id) =>
      preview({ conversationId: id }),
    );
    expect(mergeAlerts([first], [replaced])).toEqual([replaced]);
    expect(mergeAlerts([first], others)).toHaveLength(MAX_MESSAGE_ALERTS);
    expect(mergeAlerts([first], others)[0]?.conversationId).toBe("b");
  });

  test("lê a conversa aberta da rota", () => {
    expect(openConversationId("/conversas/conv%201")).toBe("conv 1");
    expect(openConversationId("/conversas")).toBeNull();
    expect(openConversationId("/agenda")).toBeNull();
  });

  test("mídia sem legenda vira o nome do tipo; o leitor de tela ouve o que é o número", () => {
    expect(
      messageAlertPreview(
        preview({ conversationId: "a", kind: "AUDIO", preview: "" }),
      ),
    ).toBe("Áudio");
    expect(unreadConversationsLabel(0)).toBeNull();
    expect(unreadConversationsLabel(1)).toBe("1 conversa com mensagem nova");
    expect(unreadConversationsLabel(12)).toBe("12 conversas com mensagem nova");
  });
});

describe("contador de Conversas na navegação", () => {
  test("mostra o número na sidebar e na barra inferior, com o sentido para o leitor de tela", async () => {
    unreadSummary.mockResolvedValue(summary(2));
    const { container } = renderShell();
    await flush();

    const sidebar = screen.getByRole("complementary", {
      name: "Navegação da aplicação",
    });
    const sidebarLink = within(sidebar).getByRole("link", {
      name: /^Conversas/u,
    });
    expect(sidebarLink).toHaveAccessibleName(
      "Conversas, 2 conversas com mensagem nova",
    );
    expect(sidebarLink.querySelector(".badge-count")).toHaveTextContent("2");

    const bottom = container.querySelector('nav[class$="-bottom-nav"]');
    const bottomLink = within(bottom as HTMLElement).getByRole("link", {
      name: /^Conversas/u,
    });
    expect(bottomLink.querySelector(".bottom-nav-badge")).toHaveTextContent(
      "2",
    );
    await expectNoA11yViolations(container);
  });

  test("some no zero e quando a leitura falha; acima de 9 mostra 9+", async () => {
    unreadSummary.mockResolvedValueOnce(summary(0));
    const zero = renderShell();
    await flush();
    expect(zero.container.querySelector(".bottom-nav-badge")).toBeNull();
    zero.unmount();

    unreadSummary.mockRejectedValueOnce(new Error("fora do ar"));
    const failed = renderShell();
    await flush();
    expect(failed.container.querySelector(".bottom-nav-badge")).toBeNull();
    failed.unmount();

    unreadSummary.mockResolvedValueOnce(summary(14));
    const many = renderShell();
    await flush();
    expect(many.container.querySelector(".bottom-nav-badge")).toHaveTextContent(
      "9+",
    );
  });
});

describe("aviso de mensagem nova", () => {
  test("mensagem que chega com a profissional na Agenda desce do topo e leva à conversa", async () => {
    vi.useFakeTimers();
    const before = preview({
      conversationId: "conv-velha",
      createdAt: "2026-10-18T11:00:00.000Z",
    });
    unreadSummary.mockResolvedValueOnce(summary(1, [before]));
    const { container } = renderShell();
    await flush();
    // O que já estava não lido quando a tela abriu não vira aviso.
    expect(container.querySelector(".message-alert")).toBeNull();

    unreadSummary.mockResolvedValueOnce(
      summary(2, [
        preview({
          conversationId: "conv-maria",
          createdAt: "2026-10-18T12:05:00.000Z",
        }),
        before,
      ]),
    );
    await act(async () => {
      vi.advanceTimersByTime(UNREAD_POLL_MS);
    });
    await flush();

    const region = screen.getByRole("region", { name: "Mensagens novas" });
    expect(region).toHaveAttribute("aria-live", "polite");
    const link = within(region).getByRole("link", {
      name: /Maria Souza/u,
    });
    expect(link).toHaveAttribute("href", "/conversas/conv-maria");
    expect(link).toHaveTextContent("Tem horário amanhã?");
    // O contador acompanha a mesma leitura.
    expect(container.querySelector(".bottom-nav-badge")).toHaveTextContent(
      "2",
    );
    // Toasts e aviso na mesma coluna: nunca um por cima do outro.
    expect(region.closest(".shell-float-layer")).not.toBeNull();
    // O axe usa os relógios de verdade.
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  test("não avisa a mensagem da conversa que já está aberta", async () => {
    vi.useFakeTimers();
    navigation.pathname = "/conversas/conv-maria";
    unreadSummary.mockResolvedValueOnce(summary(0));
    const { container } = renderShell();
    await flush();
    unreadSummary.mockResolvedValueOnce(
      summary(1, [preview({ conversationId: "conv-maria" })]),
    );
    await act(async () => {
      vi.advanceTimersByTime(UNREAD_POLL_MS);
    });
    await flush();
    expect(container.querySelector(".message-alert")).toBeNull();
  });

  test("some sozinho em 5 s, pausa com o ponteiro em cima e fecha pelo botão", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const alert = preview({ conversationId: "conv-maria" });
    const { container, rerender } = render(
      <MessageAlertStack alerts={[alert]} onDismiss={onDismiss} />,
    );
    const card = container.querySelector(".message-alert") as HTMLElement;

    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(MESSAGE_ALERT_DURATION_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(card);
    act(() => {
      vi.advanceTimersByTime(MESSAGE_ALERT_DURATION_MS);
    });
    expect(card).toHaveClass("is-leaving");
    act(() => {
      vi.advanceTimersByTime(MESSAGE_ALERT_EXIT_MS);
    });
    expect(onDismiss).toHaveBeenCalledWith("conv-maria");

    onDismiss.mockReset();
    rerender(
      <MessageAlertStack
        alerts={[preview({ conversationId: "conv-joao", customerName: null })]}
        onDismiss={onDismiss}
      />,
    );
    // Sem nome, o telefone no formato da lista de Conversas.
    const close = screen.getByRole("button", {
      name: "Fechar aviso de +55 11 97654-3210",
    });
    fireEvent.click(close);
    act(() => {
      vi.advanceTimersByTime(MESSAGE_ALERT_EXIT_MS);
    });
    expect(onDismiss).toHaveBeenCalledWith("conv-joao");
  });

  test("com movimento reduzido, entra e sai só com fade de opacidade (D-173)", () => {
    const motion = readFileSync("src/shared/styles/avenly-motion.css", "utf8");
    const reduced = motion.slice(
      motion.lastIndexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toMatch(
      /\.message-alert \{\s*animation: motion-fade-in[^}]*!important;/u,
    );
    expect(reduced).toMatch(
      /\.message-alert\.is-leaving \{\s*animation: motion-fade-out[^}]*!important;/u,
    );
  });
});

describe("conversa aberta é conversa vista", () => {
  function message(id: string, createdAt: string): Message {
    return {
      id,
      direction: "INBOUND",
      source: "CUSTOMER",
      body: "Oi",
      createdAt,
    };
  }

  function Harness({
    conversation,
    messages,
    onRead,
  }: {
    conversation: Conversation;
    messages: Message[];
    onRead: (id: string, unread: number) => void;
  }) {
    useMarkConversationRead(conversation, messages, onRead);
    return null;
  }

  const conversation = {
    id: "conv-maria",
    externalContactId: "5511976543210",
    customerName: "Maria",
    status: "ACTIVE",
    humanHandoff: false,
    handoffReason: null,
    lastMessage: null,
    unreadCount: 2,
    updatedAt: "2026-10-18T12:00:00.000Z",
  } satisfies Conversation;

  test("marca até a mensagem mais nova da tela, uma vez só", async () => {
    markRead.mockResolvedValue({ ...conversation, unreadCount: 0 });
    const onRead = vi.fn();
    const messages = [
      message("m1", "2026-10-18T12:00:00.000Z"),
      message("m2", "2026-10-18T12:03:00.000Z"),
    ];
    const { rerender } = render(
      <Harness conversation={conversation} messages={messages} onRead={onRead} />,
    );
    await flush();
    expect(markRead).toHaveBeenCalledWith(
      "conv-maria",
      "2026-10-18T12:03:00.000Z",
    );
    expect(onRead).toHaveBeenCalledWith("conv-maria", 0);

    rerender(
      <Harness conversation={conversation} messages={messages} onRead={onRead} />,
    );
    await flush();
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  test("sem não lidas, não marca nada", async () => {
    render(
      <Harness
        conversation={{ ...conversation, unreadCount: 0 }}
        messages={[message("m1", "2026-10-18T12:00:00.000Z")]}
        onRead={vi.fn()}
      />,
    );
    await flush();
    expect(markRead).not.toHaveBeenCalled();
  });
});
