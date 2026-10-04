import type { AiTone, SettingsState } from "@/data";

export function sourceLabel(source: SettingsState["calendar"]["source"]) {
  return source === "AVENLY" ? "Agenda Avenly" : "Não configurada";
}

export function toneLabel(tone: AiTone | null) {
  return tone === "PROFESSIONAL"
    ? "Profissional"
    : tone === "BALANCED"
      ? "Equilibrada"
      : tone === "CASUAL"
        ? "Descontraída"
        : "Não configurado";
}

export const weekdayLabels = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export const weekdayShortLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function servicesDetail(items: { active: boolean; needsReview: boolean }[]) {
  const active = items.filter((item) => item.active && !item.needsReview).length;
  const review = items.filter((item) => item.needsReview).length;
  const base = `${active} ${active === 1 ? "ativo" : "ativos"}`;
  if (review === 0) return { review: false, text: base };
  const reviewText = `${review} ${review === 1 ? "precisa" : "precisam"} de revisão`;
  return { review: true, text: `${base} · ${reviewText}` };
}

export function importDetail(
  state: {
    history: { completedAt: string } | null;
    session: object | null;
  },
  timeZone: string,
) {
  if (state.history) {
    let date = "";
    try {
      date = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone,
      }).format(new Date(state.history.completedAt));
    } catch {
      date = "";
    }
    return date ? `Concluída em ${date} · Minha Agenda` : "Concluída · Minha Agenda";
  }
  if (state.session) return "Continuar importação";
  return "Importar do Minha Agenda";
}

export function retentionDetail(retention: {
  commercialRetentionDays: number;
  personalRetentionDays: number;
}) {
  return `Guardar por ${retention.commercialRetentionDays} dias · pessoais por ${retention.personalRetentionDays}`;
}
