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

/**
 * Candidato a pessoa atendida.
 *
 * O telefone do contato pode devolver zero, um ou varios candidatos: ele nao
 * prova identidade. A escolha entre eles e sempre explicita.
 */
export interface SchedulingCustomerCandidate {
  id: string;
  name: string | null;
  phone: string | null;
}

/** Recorte do cliente que a IA esta autorizada a usar. */
export interface SchedulingAuthorizedCustomerContext {
  id: string;
  name: string | null;
  phone: string | null;
  notes: string[];
  tags: string[];
  primaryGuardian: { id: string; name: string | null } | null;
}

export interface ScheduleAppointmentInput {
  serviceId: string;
  serviceIds?: string[];
  date: string;
  startTime: string;
  /** Pessoa ja resolvida. Quando ausente, o cadastro nasce na confirmacao. */
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
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
