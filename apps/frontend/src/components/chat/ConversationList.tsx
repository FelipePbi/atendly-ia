import { MessageSquare } from "lucide-react";
import { ConversationItem } from "@/components/chat/ConversationItem";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ConversationListItem } from "@/types/domain";

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onArchiveChange,
  archived,
}: {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onArchiveChange: (id: string, archived: boolean) => void;
  archived: boolean;
}) {
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title={archived ? "Nenhuma conversa arquivada" : "Nenhuma conversa ainda"}
        description={
          archived
            ? "Conversas arquivadas ficam aqui ate serem restauradas ou receberem uma nova mensagem."
            : "Quando clientes enviarem mensagens para o WhatsApp conectado, elas aparecerao separadas por contato."
        }
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          active={selectedId === conversation.id}
          onSelect={() => onSelect(conversation.id)}
          onArchiveChange={(nextArchived) => onArchiveChange(conversation.id, nextArchived)}
        />
      ))}
    </div>
  );
}
