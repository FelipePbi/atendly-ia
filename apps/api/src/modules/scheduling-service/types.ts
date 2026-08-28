export interface SchedulingServiceDefinition {
  id: number;
  name: string;
  duration: number;
  price: number;
  colorId: number | null;
}

export interface SchedulingCustomerSummary {
  id: number;
  name: string | null;
  phone: string | null;
}

export interface SchedulingAppointmentServiceItem {
  serviceId: number;
  name: string;
  duration: number;
  price: number;
}

export interface SchedulingAppointment {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  customerId: number | null;
  customer: SchedulingCustomerSummary | null;
  services: SchedulingAppointmentServiceItem[];
  price: number;
  comments: string | null;
  status: string;
  serviceId: number | null;
  serviceIds: number[];
  serviceName: string | null;
  customerName: string | null;
}

export interface ScheduleAppointmentInput {
  serviceId: number;
  serviceIds?: number[];
  date: string;
  startTime: string;
  customerName: string;
  customerPhone: string;
  comments?: string;
}

export interface RescheduleAppointmentInput {
  appointmentId: number;
  date: string;
  startTime: string;
}

export interface SchedulingRequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
}
