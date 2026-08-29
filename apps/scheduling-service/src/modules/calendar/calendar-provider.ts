export interface CalendarServiceDefinition {
  id: string;
  name: string;
  durationMinutes: number;
  priceType: "FIXED" | "ON_REQUEST";
  price: number | null;
  active: boolean;
  colorId?: number | null;
}

export interface CalendarCustomerSummary {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface CalendarAppointmentServiceItem {
  serviceId: string;
  name: string;
  durationMinutes: number;
  priceType: "FIXED" | "ON_REQUEST";
  price: number | null;
}

export interface CalendarAppointment {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  customerId: string | null;
  customer: CalendarCustomerSummary | null;
  services: CalendarAppointmentServiceItem[];
  totalPrice: number | null;
  comments: string | null;
  status: string;
}

export interface AvailableSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface ListAppointmentsInput {
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
  serviceIds: string[];
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
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
