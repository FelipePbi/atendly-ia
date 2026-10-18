import { z } from "zod";

// Mensagem de exemplo do lembrete (D-197). A profissional escreve como
// gostaria que o lembrete soasse; o texto é referência de tom, nunca fonte de
// fato. Escrita uma vez aqui e usada pelo PATCH /v1/settings/reminders no BFF
// e pela validação inline da tela de Lembretes. A composição do lembrete
// (ai-orchestrator) troca os campos pelos fatos do agendamento e volta ao
// padrão quando o exemplo não serve.

export const REMINDER_MESSAGE_EXAMPLE_MAX_LENGTH = 600;

/** Campos que o exemplo pode usar no lugar dos dados de cada cliente. */
export const REMINDER_MESSAGE_EXAMPLE_FIELDS = [
  "nome",
  "servico",
  "data",
  "hora",
] as const;

export type ReminderMessageExampleIssue =
  | { id: "TOO_LONG" }
  | { id: "UNKNOWN_FIELD"; field: string }
  | { id: "WRITTEN_DATE" }
  | { id: "WRITTEN_TIME" }
  | { id: "WRITTEN_PRICE" };

const FIELD = /\{([^{}]*)\}/g;
// Data, horário e valor escritos à mão sairiam iguais para toda cliente: são
// exatamente os fatos que o lembrete não pode inventar.
const WRITTEN_DATE = /(^|[^\d])\d{1,2}\/\d{1,2}(?!\d)/;
const WRITTEN_TIME = /(^|[^\d])\d{1,2}(?::\d{2}|h\d{0,2})(?![\p{L}\d])/iu;
const WRITTEN_PRICE = /R\$\s*\d/i;

/**
 * O primeiro problema do texto, ou `null` quando ele pode ser gravado. Texto
 * vazio não tem problema: é o padrão.
 */
export function reminderMessageExampleIssue(
  text: string,
): ReminderMessageExampleIssue | null {
  const trimmed = text.trim();
  if (trimmed.length > REMINDER_MESSAGE_EXAMPLE_MAX_LENGTH) {
    return { id: "TOO_LONG" };
  }
  for (const match of trimmed.matchAll(FIELD)) {
    const field = match[1];
    if (
      !(REMINDER_MESSAGE_EXAMPLE_FIELDS as readonly string[]).includes(field)
    ) {
      return { id: "UNKNOWN_FIELD", field };
    }
  }
  const withoutFields = trimmed.replace(FIELD, " ");
  if (WRITTEN_DATE.test(withoutFields)) return { id: "WRITTEN_DATE" };
  if (WRITTEN_TIME.test(withoutFields)) return { id: "WRITTEN_TIME" };
  if (WRITTEN_PRICE.test(withoutFields)) return { id: "WRITTEN_PRICE" };
  return null;
}

/** Corpo do PATCH: ausente mantém, `null` ou vazio volta ao padrão. */
export const reminderMessageExampleInputSchema = z
  .string()
  .nullable()
  .superRefine((value, context) => {
    if (value === null) return;
    const issue = reminderMessageExampleIssue(value);
    if (issue) {
      context.addIssue({
        code: "custom",
        message: `Reminder message example is invalid (${issue.id}).`,
      });
    }
  });
