export type CustomerScenario =
  | "list"
  | "external"
  | "empty"
  | "loading"
  | "error"
  | "detail"
  | "detail-external"
  | "new";
export interface Customer {
  id: string;
  name: string;
  phone: string;
  lastContact: string;
  nextAppointment?: string;
  appointments: number;
}
export interface CustomerService {
  list(): Promise<Customer[]>;
  create(customer: Customer): Promise<Customer>;
}
