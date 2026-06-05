import { Loader2 } from "lucide-react";

export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted">
      <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
