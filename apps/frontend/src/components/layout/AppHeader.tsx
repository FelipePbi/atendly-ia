"use client";

import Link from "next/link";
import { Bot, Menu, PauseCircle, Wifi, WifiOff } from "lucide-react";
import { useDashboard } from "@/components/layout/DashboardContext";
import { aiStatusMeta, statusToneClasses, whatsappStatusMeta } from "@/lib/status-labels";

export function AppHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const { settings, whatsappInstance } = useDashboard();
  const whatsappMeta = whatsappStatusMeta(whatsappInstance?.status);
  const aiMeta = aiStatusMeta(settings.aiEnabled);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="flex min-h-16 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <button
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted transition hover:bg-surface-muted hover:text-foreground lg:hidden"
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          title="Abrir menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1" />

        <Link
          className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-black transition hover:brightness-95 sm:px-3 ${statusToneClasses(
            whatsappMeta.tone
          )}`}
          href="/settings/whatsapp"
          title={whatsappMeta.label}
          aria-label={whatsappMeta.label}
        >
          {whatsappInstance?.status === "CONNECTED" ? (
            <Wifi className="h-4 w-4" aria-hidden="true" />
          ) : (
            <WifiOff className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{whatsappMeta.label}</span>
          <span className="sm:hidden">{whatsappMeta.shortLabel}</span>
        </Link>

        <Link
          className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-black transition hover:brightness-95 sm:px-3 ${statusToneClasses(
            aiMeta.tone
          )}`}
          href="/automation/ai"
          title={aiMeta.label}
          aria-label={aiMeta.label}
        >
          {settings.aiEnabled ? (
            <Bot className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PauseCircle className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{aiMeta.shortLabel}</span>
        </Link>
      </div>
    </header>
  );
}
