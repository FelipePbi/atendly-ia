import { Archive, ArchiveRestore, BotOff, Building2 } from "lucide-react";
import { ContactAvatar } from "@/components/chat/ContactAvatar";
import { displayContactName, formatRelativeTime } from "@/lib/format";
import type { ConversationListItem } from "@/types/domain";

export function ConversationItem({
  conversation,
  active,
  onSelect,
  onArchiveChange,
}: {
  conversation: ConversationListItem;
  active: boolean;
  onSelect: () => void;
  onArchiveChange: (archived: boolean) => void;
}) {
  const archived = Boolean(conversation.archivedAt);
  const ArchiveIcon = archived ? ArchiveRestore : Archive;
  const archiveLabel = archived ? "Restaurar conversa" : "Arquivar conversa";

  return (
    <div
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border px-4 py-3 transition hover:bg-surface-muted ${
        active ? "bg-brand/10" : "bg-surface"
      }`}
    >
      <button className="min-w-0 text-left" type="button" onClick={onSelect}>
        <div className="flex min-w-0 items-center gap-2">
          <ContactAvatar conversation={conversation} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-foreground">
              {displayContactName(conversation.contactName, conversation.contactJid)}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
              {conversation.lastMessageFromMe ? <Building2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              <span className="truncate">{conversation.lastMessagePreview ?? "Sem mensagens"}</span>
            </span>
            {conversation.aiPaused ? (
              <span className="mt-2 inline-flex max-w-full items-center gap-1 rounded-md bg-warning/10 px-2 py-1 text-[11px] font-black text-warning">
                <BotOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">IA pausada</span>
              </span>
            ) : null}
          </span>
        </div>
      </button>
      <div className="flex flex-col items-end gap-2">
        <span className="text-xs text-muted">{formatRelativeTime(conversation.lastMessageAt)}</span>
        {conversation.unreadCount > 0 ? (
          <span className="min-w-6 rounded-full bg-brand px-2 py-0.5 text-center text-xs font-black text-white">
            {conversation.unreadCount}
          </span>
        ) : null}
        <button
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-border hover:text-foreground"
          type="button"
          onClick={() => onArchiveChange(!archived)}
          title={archiveLabel}
          aria-label={archiveLabel}
        >
          <ArchiveIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
