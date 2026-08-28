import type { Appointment } from "@/features/calendar/types";
export const mockAppointments: Appointment[] = [
  {
    id: "apt-1",
    customer: "Cliente de demonstração",
    service: "Serviço de demonstração",
    start: "09:00",
    duration: 60,
    origin: "ai",
    status: "confirmed",
  },
  {
    id: "apt-2",
    customer: "Contato de demonstração",
    service: "Serviço de demonstração",
    start: "11:00",
    duration: 45,
    origin: "manual",
    status: "confirmed",
  },
  {
    id: "apt-3",
    customer: "Cliente de demonstração",
    service: "Serviço de demonstração",
    start: "14:30",
    duration: 60,
    origin: "ai",
    status: "confirmed",
  },
];
