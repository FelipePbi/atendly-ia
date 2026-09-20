import type { AiTone, SettingsState } from "@/data";

export function sourceLabel(source: SettingsState["calendar"]["source"]) {
  return source === "ATENDLY" ? "Agenda Atendly" : "Não configurada";
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
