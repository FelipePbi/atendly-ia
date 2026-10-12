// @vitest-environment jsdom
/**
 * Bug de 2026-10-12: em Novo agendamento, "Manutenção Brasileiro" (75 min,
 * sem buffer) na sexta 16/10/2026. A tela reservou 13:00 e, ao trocar para
 * 13:30, a liberação de 13:00 ia sem esperar resposta: o pedido de 13:30
 * chegava antes ao Scheduling, batia na reserva da própria tela
 * (13:00–14:15) e era recusado. Como a leitura da agenda não mostra reserva,
 * o aviso dizia "fora do seu horário de atendimento", o que era falso: sexta
 * é 08:00–12:00 e 13:00–19:00, granularidade 30, e 13:30–14:45 está livre.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AppointmentHold, CreateHoldInput } from "@/data";
import { useHoldSession } from "@/features/agenda/holdSession";
import {
  CONFLICT_NOT_RELEASED_TITLE,
  CONFLICT_OFF_GRID_TITLE,
  CONFLICT_OUTSIDE_TITLE,
  type ConflictAvailability,
  describeSlotConflict,
} from "@/features/agenda/SlotConflictNotice";

const createHold = vi.fn<
  (input: CreateHoldInput, key: string) => Promise<AppointmentHold>
>();
const releaseHold = vi.fn<(id: string) => Promise<void>>();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ calendar: { createHold, releaseHold } }),
}));

const FRIDAY = "2026-10-16";

function rule(dayOfWeek: number, startTime: string, endTime: string) {
  return { active: true, dayOfWeek, endTime, startTime };
}

/** Segunda a sexta 08:00–12:00 e 13:00–19:00, como no banco do usuário. */
const availability: ConflictAvailability = {
  granularityMinutes: 30,
  rules: [1, 2, 3, 4, 5].flatMap((day) => [
    rule(day, "08:00", "12:00"),
    rule(day, "13:00", "19:00"),
  ]),
};

function text(node: unknown): string {
  // O corpo do aviso sem ocupante é sempre string.
  return String(node);
}

describe("aviso de recusa sem ocupante diz o motivo verdadeiro", () => {
  test("sexta 13:30 (75 min) está no expediente e na grade: não diz 'fora do horário'", () => {
    const { body, title } = describeSlotConflict({
      availability,
      date: FRIDAY,
      durationMinutes: 75,
      entries: [],
      loading: false,
      startTime: "13:30",
    });
    expect(title).toBe(CONFLICT_NOT_RELEASED_TITLE);
    expect(text(body)).toBe(
      "Nada na sua agenda ocupa 13:30–14:45, mas a agenda não liberou o horário agora. Ele pode estar reservado numa confirmação em andamento. Você pode encaixar mesmo assim.",
    );
    expect(text(body)).not.toContain("fora do seu horário");
  });

  test("sexta 19:30 está fora do expediente: continua o aviso de fora do horário", () => {
    const { body, title } = describeSlotConflict({
      availability,
      date: FRIDAY,
      durationMinutes: 75,
      entries: [],
      loading: false,
      startTime: "19:30",
    });
    expect(title).toBe(CONFLICT_OUTSIDE_TITLE);
    expect(text(body)).toBe(
      "Nada na sua agenda ocupa 19:30–20:45, mas esse intervalo fica fora do seu horário de atendimento: seu atendimento neste dia é das 08:00 às 12:00 e das 13:00 às 19:00. Você pode encaixar mesmo assim.",
    );
  });

  test("terminar depois do fim do período também é fora do horário (18:30 + 75 min)", () => {
    const { title } = describeSlotConflict({
      availability,
      date: FRIDAY,
      durationMinutes: 75,
      entries: [],
      loading: false,
      startTime: "18:30",
    });
    expect(title).toBe(CONFLICT_OUTSIDE_TITLE);
  });

  test("dia sem atendimento diz que não atende neste dia", () => {
    const { body, title } = describeSlotConflict({
      availability,
      date: "2026-10-18", // domingo
      durationMinutes: 75,
      entries: [],
      loading: false,
      startTime: "10:00",
    });
    expect(title).toBe(CONFLICT_OUTSIDE_TITLE);
    expect(text(body)).toContain("você não atende neste dia");
  });

  test("dentro do expediente mas fora do passo da grade diz isso, em linguagem clara", () => {
    const thirty = describeSlotConflict({
      availability,
      date: FRIDAY,
      durationMinutes: 75,
      entries: [],
      loading: false,
      startTime: "13:15",
    });
    expect(thirty.title).toBe(CONFLICT_OFF_GRID_TITLE);
    expect(text(thirty.body)).toBe(
      "Nada na sua agenda ocupa 13:15–14:30, mas 13:15 não está entre os horários que a sua agenda oferece (de 30 em 30 minutos). Você pode encaixar mesmo assim.",
    );

    const hourly = describeSlotConflict({
      availability: { ...availability, granularityMinutes: 60 },
      date: FRIDAY,
      durationMinutes: 75,
      entries: [],
      loading: false,
      startTime: "13:30",
    });
    expect(hourly.title).toBe(CONFLICT_OFF_GRID_TITLE);
    expect(text(hourly.body)).toContain("(de 1 em 1 hora)");
  });
});

describe("trocar de horário espera a liberação da reserva anterior", () => {
  function hold(id: string, startTime: string): AppointmentHold {
    return {
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      id,
      startTime,
      status: "ACTIVE",
    } as unknown as AppointmentHold;
  }

  beforeEach(() => {
    createHold.mockReset();
    releaseHold.mockReset();
  });

  test("13:00 → 13:30: o pedido de 13:30 só sai depois que 13:00 foi liberado", async () => {
    const order: string[] = [];
    createHold.mockImplementation(async (input) => {
      order.push(`create ${input.startTime}`);
      return hold(`hold-${input.startTime}`, input.startTime);
    });
    let finishRelease: () => void = () => undefined;
    releaseHold.mockImplementation(
      (id) =>
        new Promise<void>((resolve) => {
          finishRelease = () => {
            order.push(`released ${id}`);
            resolve();
          };
        }),
    );
    const input = (startTime: string): CreateHoldInput =>
      ({ date: FRIDAY, serviceIds: ["svc"], startTime });

    const { result } = renderHook(() => useHoldSession());
    await act(() => result.current.reserve(input("13:00")));
    expect(result.current.holdId).toBe("hold-13:00");

    let second: Promise<void> = Promise.resolve();
    act(() => {
      second = result.current.reserve(input("13:30"));
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Antes da resposta da liberação, nada de pedir 13:30.
    expect(releaseHold).toHaveBeenCalledWith("hold-13:00");
    expect(order).toEqual(["create 13:00"]);

    await act(async () => {
      finishRelease();
      await second;
    });
    expect(order).toEqual([
      "create 13:00",
      "released hold-13:00",
      "create 13:30",
    ]);
    expect(result.current.holdId).toBe("hold-13:30");
  });
});
