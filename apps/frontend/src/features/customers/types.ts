import type { Customer } from "@/data/mappers/publicApiSchemas";

export type CustomerScenario =
  | "list"
  | "external"
  | "empty"
  | "loading"
  | "error"
  | "detail"
  | "detail-external"
  | "new";
export type { Customer };
export interface CustomerService {
  list(): Promise<Customer[]>;
  create(customer: Customer): Promise<Customer>;
}
