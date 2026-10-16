/**
 * Próximo atendimento detalhado no perfil do cliente (2026-10-16, D-174): o
 * BFF lê do Scheduling serviços, duração, valor do acordo e quem marcou, e o
 * schema da leitura não pode descartar esses campos no caminho.
 */
import { describe, expect, it } from "vitest";

import { customerDetailSchema } from "../src/clients/scheduling/index.js";

describe("detalhe do cliente vindo do Scheduling", () => {
  it("mantém os detalhes do próximo atendimento", () => {
    const parsed = customerDetailSchema.parse({
      id: "c1",
      name: "Ana Paula",
      phone: "5511991234567",
      nextAppointment: {
        date: "2026-09-19",
        startTime: "15:30",
        status: "CONFIRMED",
        serviceNames: ["Corte feminino"],
        title: null,
        durationMinutes: 45,
        totalPrice: 90,
        totalPriceType: "FIXED",
        source: "AI",
      },
      lastAppointment: null,
    });
    expect(parsed.nextAppointment).toEqual({
      date: "2026-09-19",
      startTime: "15:30",
      status: "CONFIRMED",
      serviceNames: ["Corte feminino"],
      title: null,
      durationMinutes: 45,
      totalPrice: 90,
      totalPriceType: "FIXED",
      source: "AI",
    });
  });

  it("a resposta sem os detalhes continua válida", () => {
    const parsed = customerDetailSchema.parse({
      id: "c1",
      name: "Ana Paula",
      phone: null,
      nextAppointment: {
        date: "2026-09-19",
        startTime: "15:30",
        status: "CONFIRMED",
      },
    });
    expect(parsed.nextAppointment).toEqual({
      date: "2026-09-19",
      startTime: "15:30",
      status: "CONFIRMED",
    });
  });
});
