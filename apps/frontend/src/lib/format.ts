export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function previewText(text: string | null | undefined, fallback = "Midia recebida"): string {
  if (!text?.trim()) return fallback;
  return text.trim().slice(0, 140);
}

export function displayContactName(name: string | null | undefined, jid: string): string {
  if (name?.trim()) return name.trim();
  return jid.split("@")[0] || "Contato";
}
