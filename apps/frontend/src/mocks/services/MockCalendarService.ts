import type { Appointment, CalendarService } from "@/features/calendar/types";
import { mockAppointments } from "@/mocks/data/appointments";
export class MockCalendarService implements CalendarService {
  private appointments = structuredClone(mockAppointments);
  async list() {
    return Promise.resolve(this.appointments);
  }
  async create(appointment: Appointment) {
    this.appointments.push(appointment);
    return Promise.resolve(appointment);
  }
  async cancel(id: string) {
    this.appointments = this.appointments.map((item) =>
      item.id === id ? { ...item, status: "cancelled" } : item,
    );
    return Promise.resolve();
  }
}
