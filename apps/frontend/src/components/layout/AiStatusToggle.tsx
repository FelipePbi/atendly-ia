"use client";

import { Bot, PauseCircle } from "lucide-react";

export function AiStatusToggle({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading?: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const Icon = enabled ? PauseCircle : Bot;
  const label = enabled ? "Pausar IA" : "Ativar IA";

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-black text-white shadow-sm transition disabled:opacity-60 ${
        enabled ? "bg-brand hover:bg-brand-strong" : "bg-warning hover:bg-warning/90"
      }`}
      type="button"
      onClick={() => onToggle(!enabled)}
      disabled={loading}
      aria-pressed={enabled}
      title={enabled ? "IA ativa: respostas automaticas liberadas." : "IA pausada: nenhuma resposta automatica sera enviada."}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {loading ? "Salvando..." : label}
    </button>
  );
}
