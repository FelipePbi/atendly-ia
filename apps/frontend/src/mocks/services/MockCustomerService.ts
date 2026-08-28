import type { Customer, CustomerService } from "@/features/customers/types";
import { mockCustomers } from "@/mocks/data/directory";
export class MockCustomerService implements CustomerService {
  private customers = structuredClone(mockCustomers);
  async list() {
    return Promise.resolve(this.customers);
  }
  async create(customer: Customer) {
    this.customers.push(customer);
    return Promise.resolve(customer);
  }
}
