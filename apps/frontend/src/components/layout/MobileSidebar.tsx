"use client";

import { X } from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";

export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button
        className="absolute inset-0 bg-foreground/35"
        type="button"
        onClick={onClose}
        aria-label="Fechar menu"
      />
      <div className="relative h-full w-64 max-w-[86vw] bg-surface shadow-xl">
        <button
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-muted transition hover:bg-surface-muted hover:text-foreground"
          type="button"
          onClick={onClose}
          aria-label="Fechar menu"
          title="Fechar menu"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <AppSidebar className="w-full border-r-0" onNavigate={onClose} />
      </div>
    </div>
  );
}
