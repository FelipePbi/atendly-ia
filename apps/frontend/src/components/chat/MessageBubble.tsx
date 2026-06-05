import { FileText } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { ChatMessage } from "@/types/domain";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isText = message.type === "TEXT" && message.contentText;

  return (
    <div className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-lg px-3 py-2 shadow-sm ${
          message.fromMe ? "bg-brand text-white" : "border border-border bg-surface text-foreground"
        }`}
      >
        {isText ? (
          <p className="whitespace-pre-wrap text-sm leading-6">{message.contentText}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span>Midia recebida{message.mediaType ? `: ${message.mediaType}` : ""}</span>
          </div>
        )}
        <p className={`mt-1 text-right text-[11px] ${message.fromMe ? "text-white/75" : "text-muted"}`}>
          {formatDateTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
