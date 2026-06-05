import Link from "next/link";
import { Smartphone } from "lucide-react";
import type { ApiWhatsAppInstance } from "@/types/domain";
import { whatsappStatusMeta } from "@/lib/status-labels";

export function ChatDisconnectedState({ instance }: { instance: ApiWhatsAppInstance | null }) {
  const meta = whatsappStatusMeta(instance?.status);

  return (
    <div className="flex h-full min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-6">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Smartphone className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-black text-foreground">Seu WhatsApp ainda nao esta conectado</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Conecte um numero para comecar a receber mensagens no painel. Status atual:{" "}
          <span className="font-bold text-foreground">{meta.label}</span>.
        </p>
        <Link
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-strong"
          href="/settings/whatsapp"
        >
          Conectar WhatsApp
        </Link>
      </section>
    </div>
  );
}
