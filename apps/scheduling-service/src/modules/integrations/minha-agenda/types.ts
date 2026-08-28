export interface MinhaAgendaAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface MinhaAgendaService {
  id: number;
  name: string;
  duration: number;
  price: number;
  colorId: number | null;
  deleted: boolean;
}

export interface MinhaAgendaCustomer {
  id: number;
  name: string;
  phone1?: string | null;
  phone2?: string | null;
}

export interface CreateCustomerInput {
  name: string;
  phone1: string;
  phone2?: string;
  birthDate?: string | null;
  address?: string;
  remarks?: string;
  cpf?: string;
  cnpj?: string | null;
  comments?: string;
  phoneInternational?: string;
  email?: string;
  isCnpj?: boolean;
}

export interface MinhaAgendaAppointmentServiceItem {
  serviceId: number;
  price: number;
  service?: MinhaAgendaService;
}

export interface MinhaAgendaAppointment {
  id: number;
  userId: number;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  customerId: number | null;
  customer?: MinhaAgendaCustomer | null;
  serviceId: number | null;
  service?: MinhaAgendaService | null;
  price: number;
  paymentMethod?: string | null;
  comments?: string | null;
  colorId?: number | null;
  materialCost?: number | null;
  reminder?: boolean;
  roomId?: string | number | null;
  discount?: number | null;
  discountInPercentage?: boolean;
  tag?: string | null;
  modelVersion?: number | null;
  accountsReceivableId?: number | null;
  loyaltyCardCustomerId?: number | null;
  serviceIds?: number[] | null;
  services?: MinhaAgendaService[] | null;
  appHasServices?: MinhaAgendaAppointmentServiceItem[] | null;
  deleted?: boolean;
  customerName?: string | null;
  serviceName?: string | null;
}

export interface CreateAppointmentInput {
  date: string;
  startTime: string;
  duration: number;
  customerId: number;
  paymentMethod: string;
  comments: string;
  colorId: number | null;
  materialCost: number | null;
  reminder: boolean;
  userId: number;
  roomId: string | null;
  modelVersion: number;
  loyaltyCardCustomerId: number | null;
  items: Array<{ serviceId: number; price: string | number }>;
  productItems: unknown[];
}

export interface UpdateAppointmentInput extends CreateAppointmentInput {
  id: number;
  accountsReceivableId: number | null;
  appointmentRepeatInfoForm: unknown;
  discount: number | null;
  discountInPercentage: boolean;
  tag: string | null;
}

export interface WorkSchedule {
  [key: string]: string | number | boolean | null | undefined;
}

export interface AppointmentRangeQuery {
  startDate: string;
  endDate: string;
  employeeId: number;
  customerId?: number;
  serviceId?: number;
  isSlotBlocker: boolean;
}
