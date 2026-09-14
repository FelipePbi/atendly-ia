import type { CalendarState } from "@/data";

/**
 * Só as capabilities de escrita, nunca os sinais de leitura de prontidão
 * (`aiActivationReady`, `hoursConfigured` — Goal018/WU-10, consumidos pelo
 * checklist da Home, não por um guard de operação).
 */
export type CalendarCapabilityKey =
  | "createAppointments"
  | "manageAvailability"
  | "manageCustomers"
  | "manageServices"
  | "migrate";

/**
 * Rótulo da operação por capability — nunca um "operação indisponível"
 * genérico. `ReadOnlyState` (AppointmentFlowShell) consome este texto, então
 * toda recusa por fonte/capability se explica pela mesma frase em toda a
 * Agenda (Goal016).
 */
const CAPABILITY_OPERATION_LABELS: Record<CalendarCapabilityKey, string> = {
  createAppointments: "criar agendamentos",
  manageAvailability:
    "abrir ou remover disponibilidade extra e indisponibilidade",
  manageCustomers: "editar clientes",
  manageServices: "editar serviços",
  migrate: "migrar dados",
};

export function operationLabel(capability: CalendarCapabilityKey): string {
  return CAPABILITY_OPERATION_LABELS[capability];
}

/** Guard explícito antes de montar qualquer fluxo de escrita (Goal016). */
export function canPerform(
  calendar: CalendarState | null,
  capability: CalendarCapabilityKey,
): boolean {
  return Boolean(calendar?.capabilities[capability]);
}

export interface PersonAgendaGuardResult {
  allowed: boolean;
  reason: string | null;
}

/**
 * A leitura de agenda por pessoa nunca é oferecida em fonte externa: o
 * provider de Minha Agenda ignora `customerId` e só filtra por
 * `customerPhone` (`minha-agenda/provider.ts`), então confiar nele para
 * "a agenda desta pessoa" sem telefone devolveria a agenda inteira do
 * profissional disfarçada de agenda de uma pessoa só. Não é ausência de
 * capability — é ausência de oferta, e por isso é explicada, nunca um erro
 * genérico nem um filtro silenciosamente incorreto (Goal016).
 */
export function personAgendaGuard(
  calendar: CalendarState | null,
): PersonAgendaGuardResult {
  if (!calendar?.source) {
    return {
      allowed: false,
      reason:
        "Configure a fonte oficial da agenda antes de consultar atendimentos por pessoa.",
    };
  }
  if (calendar.source === "EXTERNAL") {
    return {
      allowed: false,
      reason:
        "A fonte Minha Agenda não oferece agenda filtrada por pessoa: a consulta aqui é sempre pela agenda inteira, por data.",
    };
  }
  return { allowed: true, reason: null };
}
