"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, BotOff, Loader2, RotateCcw, Send, UserRound } from "lucide-react";
import { ContactAvatar } from "@/components/chat/ContactAvatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { displayContactName } from "@/lib/format";
import type { ChatMessage, ConversationListItem } from "@/types/domain";

export function ChatThread({
  conversation,
  messages,
  loading,
  aiPauseLoading,
  aiResumeLoading,
  messageSending,
  onBack,
  onArchiveChange,
  onPauseAi,
  onResumeAi,
  onSendMessage,
}: {
  conversation: ConversationListItem | null;
  messages: ChatMessage[];
  loading: boolean;
  aiPauseLoading: boolean;
  aiResumeLoading: boolean;
  messageSending: boolean;
  onBack: () => void;
  onArchiveChange: (id: string, archived: boolean) => void;
  onPauseAi: (id: string) => void;
  onResumeAi: (id: string) => void;
  onSendMessage: (text: string) => Promise<{ ok: boolean; error?: string; warning?: string }>;
}) {
  const [draft, setDraft] = useState("");
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);

  if (!conversation) {
    return (
      <EmptyState
        icon={UserRound}
        title="Selecione uma conversa"
        description="Abra um contato para ver o historico em ordem cronologica."
      />
    );
  }

  const archived = Boolean(conversation.archivedAt);
  const ArchiveIcon = archived ? ArchiveRestore : Archive;
  const archiveLabel = archived ? "Restaurar conversa" : "Arquivar conversa";
  const canSend = Boolean(draft.trim()) && !messageSending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || messageSending) return;

    setSendFeedback(null);
    const result = await onSendMessage(text);

    if (!result.ok) {
      setSendFeedback(result.error ?? "Nao foi possivel enviar a mensagem.");
      return;
    }

    setDraft("");
    setSendFeedback(result.warning ?? null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex min-h-14 items-center gap-3 border-b border-border bg-surface px-3">
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted md:hidden"
          type="button"
          onClick={onBack}
          title="Voltar"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <ContactAvatar conversation={conversation} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black text-foreground">
            {displayContactName(conversation.contactName, conversation.contactJid)}
          </h2>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-xs text-muted">{conversation.contactJid}</p>
            {conversation.aiPaused ? (
              <span
                className="inline-flex max-w-full items-center gap-1 rounded-md bg-warning/10 px-2 py-1 text-[11px] font-black text-warning"
                title={conversation.aiPausedReason ?? "IA pausada para este contato"}
              >
                <BotOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">IA pausada</span>
              </span>
            ) : null}
          </div>
        </div>
        {conversation.aiPaused ? (
          <button
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-brand px-3 text-xs font-bold text-white transition hover:bg-brand-strong disabled:opacity-60"
            type="button"
            onClick={() => onResumeAi(conversation.id)}
            disabled={aiResumeLoading}
            title="Reativar IA neste chat"
          >
            {aiResumeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="whitespace-nowrap">Reativar IA</span>
          </button>
        ) : (
          <button
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-bold text-muted transition hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
            type="button"
            onClick={() => onPauseAi(conversation.id)}
            disabled={aiPauseLoading}
            title="Pausar IA neste chat"
          >
            {aiPauseLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <BotOff className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden whitespace-nowrap sm:inline">Pausar IA</span>
          </button>
        )}
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted transition hover:bg-surface-muted hover:text-foreground"
          type="button"
          onClick={() => onArchiveChange(conversation.id, !archived)}
          title={archiveLabel}
          aria-label={archiveLabel}
        >
          <ArchiveIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {conversation.aiPaused ? (
        <div className="border-b border-warning/20 bg-warning/10 px-3 py-3">
          <div className="flex items-start gap-2 text-sm leading-6 text-warning">
            <BotOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-black text-warning">IA pausada para este contato</p>
              <p>A IA nao respondera automaticamente. Voce ainda pode atender manualmente.</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {loading ? (
          <LoadingState label="Carregando mensagens..." />
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      <form className="border-t border-border bg-surface p-3" onSubmit={handleSubmit}>
        <div className="flex items-end gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground focus-within:border-brand">
          <textarea
            className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 leading-5 outline-none placeholder:text-muted"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (sendFeedback) setSendFeedback(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem"
            rows={1}
            aria-label="Mensagem"
            disabled={messageSending}
          />
          <button
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand text-white transition hover:bg-brand-strong disabled:bg-border disabled:text-muted"
            type="submit"
            disabled={!canSend}
            title="Enviar"
            aria-label="Enviar"
          >
            {messageSending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {sendFeedback ? <p className="mt-2 text-xs font-bold text-warning">{sendFeedback}</p> : null}
      </form>
    </section>
  );
}
