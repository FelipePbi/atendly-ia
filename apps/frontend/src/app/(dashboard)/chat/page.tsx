"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ChatDisconnectedState } from "@/components/chat/ChatDisconnectedState";
import { ChatMenu, type ChatFilter } from "@/components/chat/ChatMenu";
import { ChatThread } from "@/components/chat/ChatThread";
import { ConversationList } from "@/components/chat/ConversationList";
import { useDashboard } from "@/components/layout/DashboardContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { isWhatsAppConnected } from "@/lib/status-labels";
import type { ChatMessage, ConversationListItem } from "@/types/domain";

type SendMessageResponse = {
  ok: boolean;
  message?: ChatMessage;
  conversation?: ConversationListItem;
  warning?: string;
  error?: string;
};

export default function ChatPage() {
  const { whatsappInstance } = useDashboard();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationFilter, setConversationFilter] = useState<ChatFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [aiPauseLoadingId, setAiPauseLoadingId] = useState<string | null>(null);
  const [aiResumeLoadingId, setAiResumeLoadingId] = useState<string | null>(null);
  const [messageSendLoading, setMessageSendLoading] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const conversationFilterRef = useRef<ChatFilter>("all");
  const selectedIdRef = useRef<string | null>(null);
  const conversationRequestIdRef = useRef(0);
  const messageRequestIdRef = useRef(0);
  const consolidationRequestedRef = useRef(false);
  const connected = isWhatsAppConnected(whatsappInstance?.status);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const loadConversations = useCallback(async (filter: ChatFilter) => {
    const requestId = conversationRequestIdRef.current + 1;
    conversationRequestIdRef.current = requestId;
    const query = filter === "archived" ? "?archived=true" : "";
    const response = await fetch(`/api/conversations${query}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (conversationRequestIdRef.current !== requestId || conversationFilterRef.current !== filter) return;

    const fetchedConversations = (data.conversations ?? []) as ConversationListItem[];
    const currentSelectedId = selectedIdRef.current;
    const selectedFromFetch = currentSelectedId
      ? fetchedConversations.find((conversation) => conversation.id === currentSelectedId)
      : null;

    let nextConversations =
      filter === "unread"
        ? fetchedConversations.filter((conversation) => conversation.unreadCount > 0)
        : fetchedConversations;

    if (selectedFromFetch && !nextConversations.some((conversation) => conversation.id === selectedFromFetch.id)) {
      nextConversations = [selectedFromFetch, ...nextConversations];
    }

    setConversations(nextConversations);

    if (currentSelectedId && !selectedFromFetch) {
      selectedIdRef.current = null;
      setSelectedId(null);
      setMessages([]);
      setShowThread(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, options?: { silent?: boolean }) => {
    const requestId = messageRequestIdRef.current + 1;
    messageRequestIdRef.current = requestId;
    if (!options?.silent) {
      setMessagesLoading(true);
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (messageRequestIdRef.current === requestId && selectedIdRef.current === conversationId) {
          setMessages(data.messages ?? []);
        }
      }
    } finally {
      if (!options?.silent && selectedIdRef.current === conversationId) {
        setMessagesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!connected) {
      queueMicrotask(() => {
        consolidationRequestedRef.current = false;
        setLoading(false);
        setConversations([]);
      });
      return;
    }

    queueMicrotask(() => {
      setLoading(true);
      void (async () => {
        if (!consolidationRequestedRef.current) {
          consolidationRequestedRef.current = true;
          await fetch("/api/conversations/consolidate", { method: "POST" }).catch(() => null);
        }

        await loadConversations(conversationFilterRef.current);
      })().finally(() => setLoading(false));
    });
  }, [connected, loadConversations]);

  useEffect(() => {
    if (!connected) return;

    const interval = window.setInterval(() => {
      void loadConversations(conversationFilterRef.current);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [connected, loadConversations]);

  useEffect(() => {
    if (!selectedId) return;

    const interval = window.setInterval(() => {
      void loadMessages(selectedId, { silent: true });
    }, 3000);

    return () => window.clearInterval(interval);
  }, [loadMessages, selectedId]);

  async function handleSelectConversation(id: string) {
    selectedIdRef.current = id;
    setSelectedId(id);
    setShowThread(true);
    await loadMessages(id);
    await loadConversations(conversationFilterRef.current);
  }

  function handleConversationFilterChange(filter: ChatFilter) {
    if (filter === conversationFilter) return;

    conversationFilterRef.current = filter;
    selectedIdRef.current = null;
    setConversationFilter(filter);
    setSelectedId(null);
    setMessages([]);
    setShowThread(false);
    setConversations([]);
    void loadConversations(filter);
  }

  async function handleArchiveConversation(id: string, archived: boolean) {
    const response = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived }),
    });

    if (!response.ok) return;

    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    if (selectedId === id) {
      selectedIdRef.current = null;
      setSelectedId(null);
      setMessages([]);
      setShowThread(false);
    }
    await loadConversations(conversationFilterRef.current);
  }

  async function handleResumeAiForConversation(id: string) {
    setAiResumeLoadingId(id);
    try {
      const response = await fetch(`/api/conversations/${id}/ai/resume`, {
        method: "POST",
      });

      if (!response.ok) return;

      const data = (await response.json()) as { conversation?: ConversationListItem };
      if (!data.conversation) return;

      setConversations((current) =>
        current.map((conversation) => (conversation.id === id ? data.conversation ?? conversation : conversation))
      );
    } finally {
      setAiResumeLoadingId(null);
    }
  }

  async function handlePauseAiForConversation(id: string) {
    setAiPauseLoadingId(id);
    try {
      const response = await fetch(`/api/conversations/${id}/ai/pause`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Usuario pausou pelo chat" }),
      });

      if (!response.ok) return;

      const data = (await response.json()) as { conversation?: ConversationListItem };
      if (!data.conversation) return;

      setConversations((current) =>
        current.map((conversation) => (conversation.id === id ? data.conversation ?? conversation : conversation))
      );
    } finally {
      setAiPauseLoadingId(null);
    }
  }

  async function handleSendMessage(text: string): Promise<{ ok: boolean; error?: string; warning?: string }> {
    const conversationId = selectedIdRef.current;
    if (!conversationId) {
      return { ok: false, error: "Selecione uma conversa." };
    }

    setMessageSendLoading(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await response.json().catch(() => null)) as SendMessageResponse | null;

      if (!response.ok || !data?.ok) {
        return { ok: false, error: data?.error ?? "Nao foi possivel enviar a mensagem." };
      }

      const sentMessage = data.message;
      if (sentMessage) {
        setMessages((current) => {
          if (current.some((message) => message.id === sentMessage.id)) return current;
          return sortMessagesByTimestamp([...current, sentMessage]);
        });
      }

      const updatedConversation = data.conversation;
      if (updatedConversation) {
        setConversations((current) => upsertConversationListItem(current, updatedConversation));
      }

      void loadMessages(conversationId, { silent: true });
      void loadConversations(conversationFilterRef.current);

      return { ok: true, warning: data.warning };
    } catch {
      return { ok: false, error: "Nao foi possivel enviar a mensagem." };
    } finally {
      setMessageSendLoading(false);
    }
  }

  if (!connected) {
    return <ChatDisconnectedState instance={whatsappInstance} />;
  }

  if (loading) {
    return <LoadingState label="Abrindo conversas..." />;
  }

  return (
    <main className="h-[calc(100dvh-4rem)] bg-background">
      <div className="grid h-full min-h-0 w-full md:grid-cols-[360px_minmax(0,1fr)]">
        <aside
          className={clsx(
            "min-h-0 flex-col border-r border-border bg-surface md:flex",
            showThread ? "hidden md:flex" : "flex"
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <h1 className="text-base font-black text-foreground">Conversas</h1>
            <span className="rounded-md bg-surface-muted px-2 py-1 text-xs font-bold text-muted">
              {conversations.length}
            </span>
          </div>
          <ChatMenu filter={conversationFilter} onChange={handleConversationFilterChange} />
          <div className="min-h-0 flex-1">
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              archived={conversationFilter === "archived"}
              onSelect={handleSelectConversation}
              onArchiveChange={handleArchiveConversation}
            />
          </div>
        </aside>
        <div className={clsx("min-h-0", showThread ? "block" : "hidden md:block")}>
          <ChatThread
            conversation={selectedConversation}
            messages={messages}
            loading={messagesLoading}
            aiResumeLoading={aiResumeLoadingId === selectedConversation?.id}
            aiPauseLoading={aiPauseLoadingId === selectedConversation?.id}
            messageSending={messageSendLoading}
            onBack={() => setShowThread(false)}
            onArchiveChange={handleArchiveConversation}
            onPauseAi={handlePauseAiForConversation}
            onResumeAi={handleResumeAiForConversation}
            onSendMessage={handleSendMessage}
          />
        </div>
      </div>
    </main>
  );
}

function sortMessagesByTimestamp(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function upsertConversationListItem(
  conversations: ConversationListItem[],
  conversation: ConversationListItem
): ConversationListItem[] {
  const next = conversations.some((item) => item.id === conversation.id)
    ? conversations.map((item) => (item.id === conversation.id ? conversation : item))
    : [conversation, ...conversations];

  return [...next].sort((a, b) => {
    const left = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const right = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return right - left;
  });
}
