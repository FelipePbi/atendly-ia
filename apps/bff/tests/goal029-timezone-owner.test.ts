import { describe, expect, it, vi } from "vitest";

import type { InternalRequestContext } from "../src/clients/internal-http-client.js";
import {
  businessTimezoneOwner,
  reconcileBusinessTimezone,
  type TimezoneReconciliationDeps,
} from "../src/lib/timezone-reconciliation.js";

/**
 * Goal029/WU-05 — reconciliação dono/réplica do fuso do negócio (D-010), sem
 * HTTP e sem PostgreSQL. Prova as quatro propriedades do módulo direto contra
 * dublês do Scheduling: limitada, idempotente, nunca lança, honesta.
 */
const context: InternalRequestContext = {
  tenantId: "tenant-1",
  userId: "user-1",
  requestId: "req-1",
};

function deps(overrides: {
  calendar?: ReturnType<typeof vi.fn>;
  configureCalendar?: ReturnType<typeof vi.fn>;
}): {
  deps: TimezoneReconciliationDeps;
  calendar: ReturnType<typeof vi.fn>;
  configureCalendar: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  const calendar = overrides.calendar ?? vi.fn();
  const configureCalendar = overrides.configureCalendar ?? vi.fn();
  const warn = vi.fn();
  return {
    deps: {
      scheduling: {
        calendar,
        configureCalendar,
      } as unknown as TimezoneReconciliationDeps["scheduling"],
      log: { warn },
    },
    calendar,
    configureCalendar,
    warn,
  };
}

describe("Goal029/WU-05: businessTimezoneOwner", () => {
  it("deriva do BusinessProfile.timezone", () => {
    expect(businessTimezoneOwner({ timezone: "America/Sao_Paulo" })).toBe(
      "America/Sao_Paulo",
    );
  });

  it("sem perfil gravado, não há dono", () => {
    expect(businessTimezoneOwner(null)).toBeNull();
    expect(businessTimezoneOwner(undefined)).toBeNull();
  });
});

describe("Goal029/WU-05: reconcileBusinessTimezone", () => {
  it("réplica já igual ao dono não chama o Scheduling para escrever", async () => {
    const { deps: d, configureCalendar } = deps({});

    const result = await reconcileBusinessTimezone(context, d, {
      businessTimezone: "America/Sao_Paulo",
      calendarTimezone: "America/Sao_Paulo",
    });

    expect(result.outcome).toBe("NOOP");
    expect(result.converged).toBe(true);
    expect(configureCalendar).not.toHaveBeenCalled();
  });

  it("divergência aciona exatamente uma escrita, com source AVENLY e o fuso do dono", async () => {
    const configureCalendar = vi.fn(async () => ({
      timezone: "America/Sao_Paulo",
    }));
    const { deps: d } = deps({ configureCalendar });

    const result = await reconcileBusinessTimezone(context, d, {
      businessTimezone: "America/Sao_Paulo",
      calendarTimezone: "America/New_York",
    });

    expect(result.outcome).toBe("CONVERGED");
    expect(result.converged).toBe(true);
    expect(configureCalendar).toHaveBeenCalledTimes(1);
    expect(configureCalendar).toHaveBeenCalledWith(context, {
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    });
  });

  it("negócio ainda sem BusinessProfile.timezone não escreve nada e devolve UNKNOWN", async () => {
    const { deps: d, calendar, configureCalendar } = deps({});

    const result = await reconcileBusinessTimezone(context, d, {
      businessTimezone: null,
      calendarTimezone: "America/Sao_Paulo",
    });

    expect(result.outcome).toBe("UNKNOWN");
    expect(result.converged).toBe(false);
    expect(calendar).not.toHaveBeenCalled();
    expect(configureCalendar).not.toHaveBeenCalled();
  });

  it("tenant sem CalendarSettings não é criado pela reconciliação: ABSENT, sem escrita", async () => {
    const { deps: d, configureCalendar } = deps({});

    // `calendarTimezone: null` é exatamente o que `GET /internal/calendar`
    // devolve para um negócio que nunca escolheu agenda — junto com
    // `source: null` e todas as `capabilities` em `false`.
    const result = await reconcileBusinessTimezone(context, d, {
      businessTimezone: "America/Sao_Paulo",
      calendarTimezone: null,
    });

    expect(result.outcome).toBe("ABSENT");
    expect(result.converged).toBe(false);
    expect(result.calendarTimezone).toBeNull();
    expect(configureCalendar).not.toHaveBeenCalled();
  });

  it("réplica ausente lida do próprio Scheduling também não vira escrita", async () => {
    const calendar = vi.fn(async () => ({ timezone: null }));
    const configureCalendar = vi.fn();
    const { deps: d } = deps({ calendar, configureCalendar });

    // Caminho da escrita do negócio, que não carrega o calendário antes: a
    // ausência é descoberta pela leitura do módulo e continua sem escrita.
    const result = await reconcileBusinessTimezone(context, d, {
      businessTimezone: "America/Sao_Paulo",
    });

    expect(calendar).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("ABSENT");
    expect(configureCalendar).not.toHaveBeenCalled();
  });

  it("escrita que devolve fuso diferente do pedido é FAILED, não sucesso disfarçado", async () => {
    const configureCalendar = vi.fn(async () => ({
      timezone: "America/New_York",
    }));
    const { deps: d } = deps({ configureCalendar });

    const result = await reconcileBusinessTimezone(context, d, {
      businessTimezone: "America/Sao_Paulo",
      calendarTimezone: "America/New_York",
    });

    expect(result.outcome).toBe("FAILED");
    expect(result.converged).toBe(false);
    expect(result.calendarTimezone).toBe("America/New_York");
  });

  it("Scheduling fora do ar na escrita nunca lança: vira FAILED com log, réplica lida fica como estava", async () => {
    const configureCalendar = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const { deps: d, warn } = deps({ configureCalendar });

    await expect(
      reconcileBusinessTimezone(context, d, {
        businessTimezone: "America/Sao_Paulo",
        calendarTimezone: "America/New_York",
      }),
    ).resolves.toEqual({
      outcome: "FAILED",
      businessTimezone: "America/Sao_Paulo",
      calendarTimezone: "America/New_York",
      converged: false,
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("segunda passada sobre tenant já convergido não escreve de novo (idempotente)", async () => {
    const configureCalendar = vi.fn(async () => ({
      timezone: "America/Sao_Paulo",
    }));
    const { deps: d } = deps({ configureCalendar });

    const first = await reconcileBusinessTimezone(context, d, {
      businessTimezone: "America/Sao_Paulo",
      calendarTimezone: "America/New_York",
    });
    expect(first.outcome).toBe("CONVERGED");
    expect(configureCalendar).toHaveBeenCalledTimes(1);

    // A próxima leitura já traz a réplica no valor que a primeira passada
    // gravou — é assim que uma segunda requisição encontraria o tenant.
    const second = await reconcileBusinessTimezone(context, d, {
      businessTimezone: "America/Sao_Paulo",
      calendarTimezone: first.calendarTimezone,
    });

    expect(second.outcome).toBe("NOOP");
    expect(configureCalendar).toHaveBeenCalledTimes(1);
  });

  it("sem calendarTimezone informado, lê o Scheduling uma vez antes de decidir", async () => {
    const calendar = vi.fn(async () => ({ timezone: "America/Sao_Paulo" }));
    const configureCalendar = vi.fn();
    const { deps: d } = deps({ calendar, configureCalendar });

    const result = await reconcileBusinessTimezone(context, d, {
      businessTimezone: "America/Sao_Paulo",
    });

    expect(calendar).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("NOOP");
    expect(configureCalendar).not.toHaveBeenCalled();
  });
});
