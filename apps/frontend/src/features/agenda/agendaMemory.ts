import type {
  Appointment,
  AppointmentEvent,
  AppointmentNotification,
  AvailabilityException,
  CalendarState,
  Customer,
  CustomerList,
  ServiceList,
  TimeBlock,
} from "@/data";
import {
  forget,
  recall,
  recallAll,
  remember,
} from "@/shared/runtime/sessionMemory";

import type { ServiceColorMap } from "./occupancy";

/**
 * O que a Agenda já leu nesta aba (D-167): o calendário, as janelas de datas
 * com agendamentos, bloqueios e exceções, cada agendamento aberto, os dias
 * visíveis e as cores do catálogo. A rota do detalhe e a coluna do Dia ao
 * lado usam isto para aparecer já preenchidas e sempre revalidam em segundo
 * plano. Uma gravação da Agenda (criar, remarcar, cancelar, mexer em
 * bloqueio) esquece janelas e agendamentos, para nunca semear dado velho.
 */

export type AgendaWindow = {
  appointments: Appointment[];
  endDate: string;
  exceptions: AvailabilityException[];
  source: string;
  startDate: string;
  timeBlocks: TimeBlock[];
};

const CALENDAR = "agenda:calendar";
const HIDDEN_WEEKDAYS = "agenda:hidden-weekdays";
const SERVICE_COLORS = "agenda:service-colors";
const WINDOW = "agenda:window:";
const APPOINTMENT = "agenda:appointment:";

export function rememberCalendar(calendar: CalendarState): void {
  remember(CALENDAR, calendar);
}

export function recalledCalendar(): CalendarState | null {
  return recall<CalendarState>(CALENDAR) ?? null;
}

export function rememberHiddenWeekdays(hiddenWeekdays: number[]): void {
  remember(HIDDEN_WEEKDAYS, hiddenWeekdays);
}

export function recalledHiddenWeekdays(): number[] | null {
  return recall<number[]>(HIDDEN_WEEKDAYS) ?? null;
}

export function rememberServiceColors(colors: ServiceColorMap): void {
  remember(SERVICE_COLORS, colors);
}

export function recalledServiceColors(): ServiceColorMap | null {
  return recall<ServiceColorMap>(SERVICE_COLORS) ?? null;
}

export function rememberAgendaWindow(window: AgendaWindow): void {
  remember(
    `${WINDOW}${window.source}:${window.startDate}:${window.endDate}`,
    window,
  );
}

/**
 * A janela mais recente da mesma fonte que cobre o período inteiro (a semana
 * da coluna cabe na semana ou no mês que a Agenda leu). Janela que cobre só
 * parte não serve: a lista do dia sairia incompleta.
 */
export function recalledAgendaWindow(
  source: string,
  startDate: string,
  endDate: string,
): AgendaWindow | null {
  for (const [, window] of recallAll<AgendaWindow>(WINDOW)) {
    if (
      window.source === source &&
      window.startDate <= startDate &&
      window.endDate >= endDate
    ) {
      return window;
    }
  }
  return null;
}

/**
 * Grava o agendamento lido (ou mudado pelo "•••") e o troca nas janelas que o
 * têm, para a coluna e o detalhe não discordarem.
 */
export function rememberAppointment(appointment: Appointment): void {
  for (const [key, window] of recallAll<AgendaWindow>(WINDOW)) {
    if (!window.appointments.some((item) => item.id === appointment.id))
      continue;
    remember(key, {
      ...window,
      appointments: window.appointments.map((item) =>
        item.id === appointment.id ? appointment : item,
      ),
    });
  }
  remember(`${APPOINTMENT}${appointment.id}`, appointment);
}

/** O agendamento como foi visto por último: aberto ou numa janela lida. */
export function recalledAppointment(id: string): Appointment | null {
  const own = `${APPOINTMENT}${id}`;
  for (const [key, value] of recallAll<unknown>("agenda:")) {
    if (key === own) return value as Appointment;
    if (!key.startsWith(WINDOW)) continue;
    const found = (value as AgendaWindow).appointments.find(
      (item) => item.id === id,
    );
    if (found) return found;
  }
  return null;
}

const HISTORY = "agenda:history:";
const NOTIFICATIONS = "agenda:notifications:";

/**
 * Histórico e avisos (lembrete) de um agendamento, como vieram por último
 * (D-168): voltar ao detalhe mostra os dois na hora, e a leitura em segundo
 * plano os substitui no lugar. Uma gravação os esquece junto com o resto.
 */
export function rememberAppointmentHistory(
  appointmentId: string,
  events: AppointmentEvent[],
): void {
  remember(`${HISTORY}${appointmentId}`, events);
}

export function recalledAppointmentHistory(
  appointmentId: string,
): AppointmentEvent[] | null {
  return recall<AppointmentEvent[]>(`${HISTORY}${appointmentId}`) ?? null;
}

export function rememberAppointmentNotifications(
  appointmentId: string,
  notifications: AppointmentNotification[],
): void {
  remember(`${NOTIFICATIONS}${appointmentId}`, notifications);
}

export function recalledAppointmentNotifications(
  appointmentId: string,
): AppointmentNotification[] | null {
  return (
    recall<AppointmentNotification[]>(`${NOTIFICATIONS}${appointmentId}`) ??
    null
  );
}

const SERVICE_CATALOG = "agenda:lists:services";
const CUSTOMERS = "agenda:lists:customers";

/**
 * As listas que o novo agendamento precisa (serviços com uso e clientes),
 * como vieram por último (D-168): a folha do "+ Novo" as pré-lê, e a tela
 * abre pronta, revalidando em segundo plano.
 */
export function rememberServiceCatalog(list: ServiceList): void {
  remember(SERVICE_CATALOG, list);
}

export function recalledServiceCatalog(): ServiceList | null {
  return recall<ServiceList>(SERVICE_CATALOG) ?? null;
}

export function rememberCustomers(list: CustomerList): void {
  remember(CUSTOMERS, list);
}

export function recalledCustomers(): CustomerList | null {
  return recall<CustomerList>(CUSTOMERS) ?? null;
}

const CUSTOMER = "agenda:customer:";

/**
 * A cliente de quem o "Agendar" do perfil parte (2026-10-16): o novo
 * agendamento abre com ela escolhida, sem esperar a lista inteira de clientes.
 */
export function rememberCustomer(customer: Customer): void {
  remember(`${CUSTOMER}${customer.id}`, customer);
}

export function recalledCustomer(id: string): Customer | null {
  return recall<Customer>(`${CUSTOMER}${id}`) ?? null;
}

/** Depois de uma gravação: janelas, agendamentos e listas lidos antes deixam de valer. */
export function forgetAgendaChanges(): void {
  forget(WINDOW);
  forget(APPOINTMENT);
  forget(HISTORY);
  forget(NOTIFICATIONS);
  forget(CUSTOMERS);
}
