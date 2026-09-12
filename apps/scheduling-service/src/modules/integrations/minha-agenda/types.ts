import { z } from "zod";

// Toda forma abaixo espelha o contrato documentado da API do Minha Agenda,
// campo a campo, na mesma obrigatoriedade que a interface TS ja assumia, e e
// usada para validar a resposta antes de qualquer mapeamento (Goal010,
// residuo do review007 obs.3: o cast anterior nao verificava nada disso em
// tempo de execucao). Um campo documentado como obrigatorio que chega de
// outro tipo (ex.: preco numerico enviado como string) passa a falhar de
// forma identificada, em vez de virar "nao informado" fabricado pelo
// mapeamento seguinte. `.passthrough()` nos objetos de registro preserva
// campos desconhecidos da origem: a validacao checa o que o produto precisa,
// mas nunca descarta o resto do registro, que segue disponivel como raw para
// rastreio.

export const minhaAgendaAuthResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number(),
});
export type MinhaAgendaAuthResponse = z.infer<
  typeof minhaAgendaAuthResponseSchema
>;

export const minhaAgendaServiceSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    duration: z.number(),
    price: z.number(),
    colorId: z.number().nullable(),
    deleted: z.boolean(),
  })
  .passthrough();
export type MinhaAgendaService = z.infer<typeof minhaAgendaServiceSchema>;

export const minhaAgendaCustomerSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    phone1: z.string().nullish(),
    phone2: z.string().nullish(),
  })
  .passthrough();
export type MinhaAgendaCustomer = z.infer<typeof minhaAgendaCustomerSchema>;

export const minhaAgendaAppointmentServiceItemSchema = z
  .object({
    serviceId: z.number(),
    price: z.number(),
    service: minhaAgendaServiceSchema.nullish(),
  })
  .passthrough();
export type MinhaAgendaAppointmentServiceItem = z.infer<
  typeof minhaAgendaAppointmentServiceItemSchema
>;

export const minhaAgendaAppointmentSchema = z
  .object({
    id: z.number(),
    userId: z.number(),
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    duration: z.number(),
    customerId: z.number().nullable(),
    customer: minhaAgendaCustomerSchema.nullish(),
    serviceId: z.number().nullable(),
    service: minhaAgendaServiceSchema.nullish(),
    price: z.number(),
    paymentMethod: z.string().nullish(),
    comments: z.string().nullish(),
    colorId: z.number().nullish(),
    materialCost: z.number().nullish(),
    reminder: z.boolean().nullish(),
    roomId: z.union([z.string(), z.number()]).nullish(),
    discount: z.number().nullish(),
    discountInPercentage: z.boolean().nullish(),
    tag: z.string().nullish(),
    modelVersion: z.number().nullish(),
    accountsReceivableId: z.number().nullish(),
    loyaltyCardCustomerId: z.number().nullish(),
    serviceIds: z.array(z.number()).nullish(),
    services: z.array(minhaAgendaServiceSchema).nullish(),
    appHasServices: z.array(minhaAgendaAppointmentServiceItemSchema).nullish(),
    deleted: z.boolean().nullish(),
    customerName: z.string().nullish(),
    serviceName: z.string().nullish(),
  })
  .passthrough();
export type MinhaAgendaAppointment = z.infer<
  typeof minhaAgendaAppointmentSchema
>;

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

export const workScheduleSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]).nullish(),
);
export type WorkSchedule = z.infer<typeof workScheduleSchema>;

export interface AppointmentRangeQuery {
  startDate: string;
  endDate: string;
  employeeId: number;
  customerId?: number;
  serviceId?: number;
  isSlotBlocker: boolean;
}
