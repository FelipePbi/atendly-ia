export type ServiceScenario =
  | "list"
  | "external"
  | "external-empty"
  | "empty"
  | "loading"
  | "error"
  | "new"
  | "edit";
export interface CatalogService {
  id: string;
  name: string;
  duration: number;
  price?: number;
  active: boolean;
  origin: "atendly" | "external";
}
export interface ServiceCatalogService {
  list(): Promise<CatalogService[]>;
  save(service: CatalogService): Promise<CatalogService>;
}
