import type { Customer } from "@/features/customers/types";
import type { CatalogService } from "@/features/services/types";
export const mockCustomers: Customer[] = [
  {
    id: "c1",
    name: "Cliente demonstrativo 01",
    phone: "(11) 99999-1234",
    lastContact: "Hoje, 09:18",
    nextAppointment: "25 ago · 14:30",
    appointments: 6,
  },
  {
    id: "c2",
    name: "Contato sem nome",
    phone: "(11) 98888-4321",
    lastContact: "Hoje, 08:42",
    appointments: 1,
  },
  {
    id: "c3",
    name: "Cliente demonstrativo 02",
    phone: "(11) 97777-6543",
    lastContact: "Ontem, 17:05",
    nextAppointment: "28 ago · 10:00",
    appointments: 3,
  },
  {
    id: "c4",
    name: "Cliente demonstrativo 03",
    phone: "(11) 96666-7890",
    lastContact: "12 ago, 11:20",
    appointments: 2,
  },
];
export const mockServices: CatalogService[] = [
  {
    id: "s1",
    name: "Serviço de demonstração",
    duration: 60,
    price: 120,
    active: true,
    origin: "atendly",
  },
  {
    id: "s2",
    name: "Serviço sob consulta",
    duration: 45,
    active: true,
    origin: "atendly",
  },
  {
    id: "s3",
    name: "Serviço inativo de exemplo",
    duration: 30,
    price: 80,
    active: false,
    origin: "atendly",
  },
];
