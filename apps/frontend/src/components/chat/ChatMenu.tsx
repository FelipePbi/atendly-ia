import { Archive, Inbox, MessageSquare } from "lucide-react";
import { clsx } from "clsx";

export type ChatFilter = "all" | "unread" | "archived";

const filterOptions = [
  { value: "all" as const, label: "Todas", icon: Inbox },
  { value: "unread" as const, label: "Nao lidas", icon: MessageSquare },
  { value: "archived" as const, label: "Arquivadas", icon: Archive },
];

export function ChatMenu({
  filter,
  onChange,
}: {
  filter: ChatFilter;
  onChange: (filter: ChatFilter) => void;
}) {
  return (
    <div className="border-b border-border p-2">
      <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-muted p-1">
        {filterOptions.map((option) => {
          const Icon = option.icon;
          const active = filter === option.value;

          return (
            <button
              className={clsx(
                "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-bold transition",
                active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
              )}
              type="button"
              onClick={() => onChange(option.value)}
              key={option.value}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
