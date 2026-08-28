import type {
  CatalogService,
  ServiceCatalogService,
} from "@/features/services/types";
import { mockServices } from "@/mocks/data/directory";
export class MockServiceCatalogService implements ServiceCatalogService {
  private services = structuredClone(mockServices);
  async list() {
    return Promise.resolve(this.services);
  }
  async save(service: CatalogService) {
    this.services = [
      ...this.services.filter((item) => item.id !== service.id),
      service,
    ];
    return Promise.resolve(service);
  }
}
