import { describe, expect, it } from "vitest";

import {
  type CompletedVisit,
  computeHabit,
  type CustomerReturnHistory,
  expectedReturn,
  mondayOf,
  pickOfferedSlots,
  planSchedule,
  randomSendGapMinutes,
  type ReturnServiceInfo,
  selectRenewalCandidates,
  selectWinbackCandidates,
  sendByFor,
  withinSendWindow,
} from "../../src/modules/customer-return/return-rules.js";

/**
 * Regras do retorno de clientes (D-202, `06-Retorno-de-Clientes.md`): prazo
 * de volta pelo servico ou pela media, exclusoes, horarios de costume, ritmo
 * de N por dia e o prazo que nunca deixa a mensagem sair no dia da data.
 *
 * Datas de referencia: 2026-10-19 e segunda-feira.
 */

const MAINTENANCE: ReturnServiceInfo = {
  id: "svc-maint",
  name: "Manutenção 5D",
  recurrenceIntervalDays: 15,
};
const BROW: ReturnServiceInfo = {
  id: "svc-brow",
  name: "Design de sobrancelha",
  recurrenceIntervalDays: null,
};
const services = new Map([MAINTENANCE, BROW].map((s) => [s.id, s]));

function visit(
  date: string,
  time = "17:00",
  service: ReturnServiceInfo = BROW,
): CompletedVisit {
  return { date, time, services: [{ id: service.id, name: service.name }] };
}

function customer(
  overrides: Partial<CustomerReturnHistory> & { customerId: string },
): CustomerReturnHistory {
  return {
    name: overrides.customerId,
    phone: "+55 11 99999-0000",
    deactivated: false,
    blocked: false,
    hasFutureAppointment: false,
    lastReturnMessageDate: null,
    queued: false,
    completed: [],
    ...overrides,
  };
}

describe("data esperada de volta", () => {
  const week = { start: "2026-10-19", end: "2026-10-25" };

  it("vem do prazo do serviço: último concluído do serviço + recorrência", () => {
    const result = expectedReturn(
      [visit("2026-10-07", "17:00", MAINTENANCE)],
      services,
      week,
    );
    expect(result).toEqual({
      serviceId: MAINTENANCE.id,
      serviceName: "Manutenção 5D",
      expectedDate: "2026-10-22",
      intervalDays: 15,
      intervalSource: "SERVICE",
    });
  });

  it("o prazo do serviço vence a média: com serviço de prazo fora da semana, a média não entra", () => {
    // Média de 7 dias cairia nesta semana; o serviço diz 15 e cai depois.
    const visits = [
      visit("2026-09-28"),
      visit("2026-10-05"),
      visit("2026-10-12", "17:00", MAINTENANCE),
    ];
    expect(expectedReturn(visits, services, week)).toBeNull();
  });

  it("sem prazo no serviço vale a média da cliente, a partir do último atendimento", () => {
    const visits = [
      visit("2026-09-14"),
      visit("2026-09-28"),
      visit("2026-10-08"),
    ];
    // (14 + 10) / 2 = 12 dias depois de 08/10.
    expect(expectedReturn(visits, services, week)).toMatchObject({
      serviceId: BROW.id,
      expectedDate: "2026-10-20",
      intervalDays: 12,
      intervalSource: "AVERAGE",
    });
  });

  it("sem prazo no serviço e com um atendimento só, a cliente não entra", () => {
    expect(expectedReturn([visit("2026-10-10")], services, week)).toBeNull();
  });
});

describe("Renovação: quem entra e quem nunca entra", () => {
  const base = (id: string, extra: Partial<CustomerReturnHistory> = {}) =>
    customer({
      customerId: id,
      completed: [visit("2026-10-06", "17:00", MAINTENANCE)],
      ...extra,
    });

  it("lista quem vence nesta semana, de segunda a domingo, quem vence antes primeiro", () => {
    const selection = selectRenewalCandidates({
      customers: [
        customer({
          customerId: "late",
          completed: [visit("2026-10-10", "17:00", MAINTENANCE)],
        }),
        base("early"),
        customer({
          customerId: "outside",
          completed: [visit("2026-09-01", "17:00", MAINTENANCE)],
        }),
      ],
      services,
      today: "2026-10-19",
      weekStart: "2026-10-19",
    });
    expect(selection.candidates.map((c) => c.customerId)).toEqual([
      "early",
      "late",
    ]);
    expect(selection.candidates[0]).toMatchObject({
      expectedDate: "2026-10-21",
      lastVisitDate: "2026-10-06",
      daysSinceLastVisit: 13,
    });
  });

  it("exclui desativada, sem telefone, com agendamento futuro, bloqueada, chamada há menos de 14 dias e já na fila", () => {
    const selection = selectRenewalCandidates({
      customers: [
        base("ok"),
        base("off", { deactivated: true }),
        base("nophone", { phone: "  " }),
        base("booked", { hasFutureAppointment: true }),
        base("stop", { blocked: true }),
        base("recent", { lastReturnMessageDate: "2026-10-10" }),
        base("old-message", { lastReturnMessageDate: "2026-10-01" }),
        base("queued", { queued: true }),
      ],
      services,
      today: "2026-10-19",
      weekStart: "2026-10-19",
    });
    expect(selection.candidates.map((c) => c.customerId)).toEqual([
      "ok",
      "old-message",
    ]);
    expect(selection.excluded).toEqual({
      deactivated: 1,
      noPhone: 1,
      futureAppointment: 1,
      blocked: 1,
      recentlyContacted: 1,
      queued: 1,
    });
  });

  it("a semana vai de segunda a domingo", () => {
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
    expect(mondayOf("2026-10-25")).toBe("2026-10-19");
  });
});

describe("Resgate", () => {
  it("entra quem não vem há N dias ou mais, com o serviço mais feito; 30 dias sem nova mensagem", () => {
    const selection = selectWinbackCandidates({
      customers: [
        customer({
          customerId: "gone",
          completed: [
            visit("2026-06-01", "10:00", MAINTENANCE),
            visit("2026-07-01", "10:00", BROW),
            visit("2026-07-20", "10:00", MAINTENANCE),
          ],
        }),
        customer({ customerId: "recent", completed: [visit("2026-09-30")] }),
        customer({
          customerId: "messaged",
          completed: [visit("2026-05-01")],
          lastReturnMessageDate: "2026-10-01",
        }),
      ],
      services,
      today: "2026-10-19",
      days: 60,
    });
    expect(selection.candidates).toHaveLength(1);
    expect(selection.candidates[0]).toMatchObject({
      customerId: "gone",
      serviceName: "Manutenção 5D",
      expectedDate: null,
      daysSinceLastVisit: 91,
    });
    expect(selection.excluded.recentlyContacted).toBe(1);
  });
});

describe("horários de costume", () => {
  it("sem pelo menos 3 concluídos não há padrão", () => {
    expect(computeHabit([visit("2026-10-02"), visit("2026-10-09")])).toBeNull();
  });

  it("dias que somam 70% das vezes (até 3) e faixa da mediana ±90 min", () => {
    const habit = computeHabit([
      visit("2026-09-04", "17:00"), // sex
      visit("2026-09-05", "18:00"), // sáb
      visit("2026-09-11", "17:30"), // sex
      visit("2026-09-12", "18:30"), // sáb
      visit("2026-09-15", "10:00"), // ter
    ]);
    expect(habit).toEqual({
      weekdays: [5, 6],
      bandStart: "16:00",
      bandEnd: "19:00",
      usedWeekdays: [2, 5, 6],
      visits: 5,
    });
  });

  it("sem dia claro, o padrão fica só na faixa de horário", () => {
    const habit = computeHabit([
      visit("2026-09-14", "09:00"), // seg
      visit("2026-09-15", "09:00"), // ter
      visit("2026-09-16", "09:00"), // qua
      visit("2026-09-17", "09:00"), // qui
      visit("2026-09-18", "09:00"), // sex: 3 dias somam só 60%
    ]);
    expect(habit?.weekdays).toEqual([]);
    expect(habit?.bandStart).toBe("07:30");
  });

  it("usa só os últimos 10 concluídos", () => {
    const old = Array.from({ length: 6 }, (_, index) =>
      visit(`2026-01-0${index + 1}`, "08:00"),
    );
    const recent = Array.from({ length: 10 }, (_, index) =>
      visit(`2026-09-${String(index + 10).padStart(2, "0")}`, "18:00"),
    );
    expect(computeHabit([...old, ...recent])?.visits).toBe(10);
    expect(computeHabit([...old, ...recent])?.bandStart).toBe("16:30");
  });
});

describe("prazo da cliente: nunca no dia do vencimento", () => {
  it("sai até N dias antes da data esperada", () => {
    expect(sendByFor("2026-10-23", 2, "2026-10-19")).toBe("2026-10-21");
  });

  it("aprovada depois do alvo, vale o último dia antes da data", () => {
    expect(sendByFor("2026-10-20", 2, "2026-10-19")).toBe("2026-10-19");
  });

  it("data que já chegou ou passou na aprovação não tem prazo", () => {
    expect(sendByFor("2026-10-19", 2, "2026-10-19")).toBeNull();
    expect(sendByFor("2026-10-15", 2, "2026-10-19")).toBeNull();
    expect(sendByFor(null, 2, "2026-10-19")).toBeNull();
  });
});

describe("ritmo da rodada", () => {
  const rules = {
    dailyLimit: 2,
    windowDays: [1, 2, 3, 4, 5, 6],
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 19 * 60,
    leadDays: 2,
  };

  it("N por dia, só nos dias da janela, quem vence antes recebe antes", () => {
    const plan = planSchedule({
      targets: [
        { customerId: "c", sendBy: null },
        { customerId: "a", sendBy: "2026-10-20" },
        { customerId: "b", sendBy: "2026-10-21" },
        { customerId: "d", sendBy: null },
        { customerId: "e", sendBy: null },
      ],
      rules,
      // Sábado à tarde: sábado ainda cabe, domingo está fora da janela.
      today: "2026-10-24",
      nowMinutes: 10 * 60,
    });
    expect(plan.targets.map((t) => [t.customerId, t.plannedDate])).toEqual([
      ["a", "2026-10-24"],
      ["b", "2026-10-24"],
      ["c", "2026-10-26"],
      ["d", "2026-10-26"],
      ["e", "2026-10-27"],
    ]);
  });

  it("avisa quem não cabe antes da própria data e o limite que faria todas caberem", () => {
    const plan = planSchedule({
      targets: [
        { customerId: "a", sendBy: "2026-10-19" },
        { customerId: "b", sendBy: "2026-10-19" },
        { customerId: "c", sendBy: "2026-10-19" },
      ],
      rules,
      today: "2026-10-19",
      nowMinutes: 9 * 60,
    });
    expect(plan.notFitting).toEqual(["c"]);
    expect(plan.minimumDailyLimit).toBe(3);
  });

  it("envios de hoje e a fila de outras rodadas ocupam o dia", () => {
    const plan = planSchedule({
      targets: [{ customerId: "a", sendBy: "2026-10-19" }],
      rules,
      today: "2026-10-19",
      nowMinutes: 9 * 60,
      sentToday: 1,
      queuedAhead: 1,
    });
    expect(plan.notFitting).toEqual(["a"]);
  });

  it("fim da janela de hoje passado: começa no próximo dia da janela", () => {
    const plan = planSchedule({
      targets: [{ customerId: "a", sendBy: null }],
      rules,
      today: "2026-10-19",
      nowMinutes: 19 * 60 + 5,
    });
    expect(plan.targets[0].plannedDate).toBe("2026-10-20");
  });

  it("janela de envio por dia e horário; intervalo sorteado entre 3 e 10 min", () => {
    expect(withinSendWindow(rules, "2026-10-19", 9 * 60)).toBe(true);
    expect(withinSendWindow(rules, "2026-10-19", 19 * 60)).toBe(false);
    expect(withinSendWindow(rules, "2026-10-25", 12 * 60)).toBe(false);
    expect(randomSendGapMinutes(() => 0)).toBe(3);
    expect(randomSendGapMinutes(() => 0.999)).toBe(10);
  });
});

describe("horários oferecidos", () => {
  const habit = {
    weekdays: [5, 6],
    bandStart: "16:00",
    bandEnd: "19:00",
    usedWeekdays: [2, 5, 6],
    visits: 5,
  };
  const slots = [
    { date: "2026-10-20", time: "17:00" }, // ter (já usou), na faixa
    { date: "2026-10-21", time: "17:00" }, // qua (nunca usou), na faixa
    { date: "2026-10-23", time: "10:00" }, // sex, fora da faixa
    { date: "2026-10-23", time: "17:30" }, // sex, na faixa
    { date: "2026-10-24", time: "18:00" }, // sáb, na faixa
  ];

  it("primeiro no dia e na faixa de costume, em dias diferentes", () => {
    expect(
      pickOfferedSlots({ slots, habit, anchorDate: "2026-10-22" }),
    ).toEqual([
      { date: "2026-10-23", time: "17:30" },
      { date: "2026-10-24", time: "18:00" },
    ]);
  });

  it("um dia que ela nunca usou só aparece no último passo", () => {
    const picked = pickOfferedSlots({
      slots: slots.filter((slot) => slot.date !== "2026-10-24"),
      habit,
      anchorDate: "2026-10-22",
    });
    // sex 17:30 (passo 1), depois sex 10:00 (passo 2, mesmo dia) só se não
    // houver outro dia: ter 17:00 (passo 3) vem antes de qua (nunca usou).
    expect(picked).toEqual([
      { date: "2026-10-20", time: "17:00" },
      { date: "2026-10-23", time: "17:30" },
    ]);
  });

  it("sem padrão, os horários livres mais próximos da data esperada", () => {
    expect(
      pickOfferedSlots({ slots, habit: null, anchorDate: "2026-10-21" }),
    ).toEqual([
      { date: "2026-10-20", time: "17:00" },
      { date: "2026-10-21", time: "17:00" },
    ]);
  });

  it("sem horário livre, nenhuma oferta", () => {
    expect(
      pickOfferedSlots({ slots: [], habit, anchorDate: "2026-10-21" }),
    ).toEqual([]);
  });
});
