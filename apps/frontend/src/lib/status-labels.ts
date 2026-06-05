import type { WhatsAppInstanceStatus } from "@/generated/prisma/client";

type Tone = "success" | "warning" | "danger" | "neutral";

export type StatusMeta = {
  label: string;
  shortLabel: string;
  tone: Tone;
};

export function whatsappStatusMeta(status: WhatsAppInstanceStatus | null | undefined): StatusMeta {
  switch (status) {
    case "CONNECTED":
      return { label: "WhatsApp conectado", shortLabel: "WA online", tone: "success" };
    case "CONNECTING":
    case "CREATED":
      return { label: "Conectando...", shortLabel: "WA", tone: "warning" };
    case "WAITING_QR":
      return { label: "Aguardando QR", shortLabel: "WA QR", tone: "warning" };
    case "QR_EXPIRED":
      return { label: "QR expirado", shortLabel: "WA QR", tone: "warning" };
    case "DISCONNECTED":
    case "LOGGED_OUT":
    case "ERROR":
      return { label: "WhatsApp desconectado", shortLabel: "WA offline", tone: "danger" };
    default:
      return { label: "WhatsApp desconectado", shortLabel: "WA offline", tone: "danger" };
  }
}

export function aiStatusMeta(enabled: boolean): StatusMeta {
  return enabled
    ? { label: "IA ativa", shortLabel: "IA ativa", tone: "success" }
    : { label: "IA pausada", shortLabel: "IA pausada", tone: "warning" };
}

export function statusToneClasses(tone: Tone): string {
  switch (tone) {
    case "success":
      return "border-brand/20 bg-brand/10 text-brand-strong";
    case "warning":
      return "border-warning/25 bg-warning/10 text-warning";
    case "danger":
      return "border-danger/25 bg-danger/10 text-danger";
    default:
      return "border-border bg-surface-muted text-muted";
  }
}

export function isWhatsAppConnected(status: WhatsAppInstanceStatus | null | undefined): boolean {
  return status === "CONNECTED";
}
