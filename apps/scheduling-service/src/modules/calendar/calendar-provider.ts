export type ServicePriceType =
  | "FIXED"
  | "STARTING_AT"
  | "ON_REQUEST"
  | "NOT_INFORMED";

export interface CalendarServiceDefinition {
  id: string;
  name: string;
  /** Ausente e pendencia de revisao; nunca zero fabricado. */
  durationMinutes: number | null;
  priceType: ServicePriceType;
  price: number | null;
  active: boolean;
  /** Numero legado do Minha Agenda; sempre nulo para a Agenda Atendly. */
  colorId?: number | null;
  /** Token estavel da identidade visual do servico (Agenda Atendly). */
  colorToken?: string | null;
}

export interface CalendarCustomerSummary {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface CalendarAppointmentServiceItem {
  serviceId: string;
  name: string;
  /** Ausente quando o item nao tem duracao propria conhecida. */
  durationMinutes: number | null;
  priceType: ServicePriceType;
  price: number | null;
}

/**
 * Regra unica do total do acordo (Goal007): soma quando todos os itens sao
 * `FIXED`; `STARTING_AT` quando ha algum "a partir de" e nenhum "sob
 * consulta" ou "nao informado"; sem total (`NONE`) nos demais casos. Usada
 * pelo Scheduling e reimplementada de forma equivalente na IA — os dois lados
 * nao compartilham pacote de contrato para este calculo (D-011).
 */
export type AgreementTotalType = "FIXED" | "STARTING_AT" | "NONE";

export interface AgreementTotal {
  type: AgreementTotalType;
  amount: number | null;
}

export function computeAgreementTotal(
  items: Array<{ priceType: ServicePriceType; price: number | null }>,
): AgreementTotal {
  if (items.length === 0) return { type: "NONE", amount: null };
  const hasUnpriced = items.some(
    (item) => item.priceType === "ON_REQUEST" || item.priceType === "NOT_INFORMED",
  );
  if (hasUnpriced) return { type: "NONE", amount: null };
  const amount = items.reduce((total, item) => total + (item.price ?? 0), 0);
  const allFixed = items.every((item) => item.priceType === "FIXED");
  return { type: allFixed ? "FIXED" : "STARTING_AT", amount };
}

export interface CalendarAppointment {
  id: string;
  source: "AI" | "USER" | "INTEGRATION";
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  customerId: string | null;
  customer: CalendarCustomerSummary | null;
  services: CalendarAppointmentServiceItem[];
  totalPrice: number | null;
  totalPriceType: AgreementTotalType;
  comments: string | null;
  status: string;
}

export interface AvailableSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface ListAppointmentsInput {
  /** Pessoa resolvida. Quando presente, o telefone não é consultado. */
  customerId?: string;
  /** Filtro por candidatos: todas as pessoas que compartilham o número. */
  customerPhone?: string;
  startDate: string;
  endDate: string;
}

export interface GetAvailabilityInput {
  serviceIds: string[];
  startDate: string;
  days: number;
  stepMinutes: number;
  maxSlots: number;
}

export interface CreateCalendarAppointmentInput {
  source?: "AI" | "USER";
  serviceIds: string[];
  date: string;
  startTime: string;
  /**
   * Pessoa já resolvida. Quando ausente, o cliente é criado **dentro** da
   * transação de confirmação, depois de o slot ser validado.
   */
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  comments?: string;
  stepMinutes: number;
  idempotencyKey: string;
}

export interface RescheduleCalendarAppointmentInput {
  appointmentId: string;
  date: string;
  startTime: string;
  stepMinutes: number;
  idempotencyKey: string;
}

export interface CancelCalendarAppointmentInput {
  appointmentId: string;
  comments?: string;
  idempotencyKey: string;
}

export interface CalendarProvider {
  listServices(): Promise<CalendarServiceDefinition[]>;
  listAppointments(
    input: ListAppointmentsInput,
  ): Promise<CalendarAppointment[]>;
  getAppointment(appointmentId: string): Promise<CalendarAppointment>;
  getAvailability(input: GetAvailabilityInput): Promise<AvailableSlot[]>;
  createAppointment(
    input: CreateCalendarAppointmentInput,
  ): Promise<CalendarAppointment>;
  rescheduleAppointment(
    input: RescheduleCalendarAppointmentInput,
  ): Promise<CalendarAppointment>;
  cancelAppointment(
    input: CancelCalendarAppointmentInput,
  ): Promise<CalendarAppointment>;
}
