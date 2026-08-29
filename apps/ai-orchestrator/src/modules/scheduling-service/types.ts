export interface SchedulingServiceDefinition {
  id: string;
  name: string;
  duration: number;
  priceType: "FIXED" | "ON_REQUEST";
  price: number | null;
  colorId: number | null;
}

export interface SchedulingCustomerSummary {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface SchedulingAppointmentServiceItem {
  serviceId: string;
  name: string;
  duration: number;
  priceType: "FIXED" | "ON_REQUEST";
  price: number | null;
}

export interface SchedulingAppointment {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  customerId: string | null;
  customer: SchedulingCustomerSummary | null;
  services: SchedulingAppointmentServiceItem[];
  price: number | null;
  comments: string | null;
  status: string;
  serviceId: string | null;
  serviceIds: string[];
  serviceName: string | null;
  customerName: string | null;
}

export interface ScheduleAppointmentInput {
  serviceId: string;
  serviceIds?: string[];
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  comments?: string;
}

export interface RescheduleAppointmentInput {
  appointmentId: string;
  date: string;
  startTime: string;
}

export interface SchedulingRequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
}
