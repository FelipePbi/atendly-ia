import { CheckCircle2, CircleDashed, LogOut, Smartphone, Trash2, Wifi } from "lucide-react";
import type { ApiWhatsAppInstance } from "@/types/domain";
import { whatsappStatusMeta } from "@/lib/status-labels";

export function WhatsAppConnectionCard({
  status,
  phoneNumber,
  connected,
  connecting = false,
  disconnecting = false,
  removing = false,
  onConnect,
  onDisconnect,
  onRemove,
}: {
  status: ApiWhatsAppInstance["status"] | null;
  phoneNumber?: string | null;
  connected: boolean;
  connecting?: boolean;
  disconnecting?: boolean;
  removing?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onRemove?: () => void;
}) {
  const meta = whatsappStatusMeta(status);
  const actionDisabled = connecting || disconnecting || removing;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
          <Smartphone className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-foreground">
            {connected ? "WhatsApp conectado" : "Conecte seu WhatsApp"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {connected
              ? "Seu painel esta pronto para receber e responder conversas."
              : "Conecte seu WhatsApp para comecar a receber mensagens no painel."}
          </p>
        </div>
      </div>

      {!connected ? (
        <div className="mt-5 rounded-md bg-surface-muted p-4 text-sm text-foreground">
          <ol className="space-y-2">
            <li>1. Abra o WhatsApp no celular.</li>
            <li>2. Acesse Dispositivos conectados.</li>
            <li>3. Toque em Conectar dispositivo.</li>
            <li>4. Escaneie o QR Code exibido no painel.</li>
          </ol>
        </div>
      ) : null}

      <div className="mt-5 flex items-center gap-2 text-sm">
        {connected ? (
          <CheckCircle2 className="h-5 w-5 text-brand" aria-hidden="true" />
        ) : (
          <CircleDashed className="h-5 w-5 animate-spin text-warning" aria-hidden="true" />
        )}
        <span className={connected ? "font-bold text-brand-strong" : "font-bold text-warning"}>
          {meta.label}
        </span>
      </div>

      <div className="mt-4 rounded-md border border-border px-3 py-2 text-sm">
        <p className="text-muted">Numero conectado</p>
        <p className="mt-1 break-all font-bold text-foreground">{phoneNumber ?? "Nao identificado"}</p>
      </div>

      {!connected && onConnect ? (
        <button
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-base font-bold text-white transition hover:bg-brand-strong disabled:opacity-60"
          type="button"
          onClick={onConnect}
          disabled={actionDisabled}
        >
          <Wifi className="h-5 w-5" aria-hidden="true" />
          {connecting ? "Conectando..." : "Conectar agora"}
        </button>
      ) : null}

      {connected ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-base font-bold text-foreground transition hover:bg-surface-muted disabled:opacity-60"
            type="button"
            onClick={onDisconnect}
            disabled={actionDisabled || !onDisconnect}
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            {disconnecting ? "Desconectando..." : "Desconectar"}
          </button>
          <button
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-4 text-base font-bold text-danger transition hover:bg-danger/15 disabled:opacity-60"
            type="button"
            onClick={onRemove}
            disabled={actionDisabled || !onRemove}
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            {removing ? "Removendo..." : "Remover integracao"}
          </button>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-muted">Cada conta pode conectar apenas um numero de WhatsApp nesta versao.</p>
    </section>
  );
}
