import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import {
  countInboundMessagesByWeekHour,
  WEEK_HOURS,
  weekHourFormatter,
  weekHourOf,
} from "../../src/modules/conversations/inbound-hours.js";

/**
 * Mensagens de clientes por hora da semana (D-178): o Faturamento usa para
 * dizer a quem não usa a IA quantas mensagens chegaram fora do horário.
 */

const timeZone = "America/Sao_Paulo";

describe("posição na semana", () => {
  it("usa o fuso do negócio, com domingo = 0", () => {
    const formatter = weekHourFormatter(timeZone);
    // Terça, 06/10/2026, 23:30 em São Paulo = quarta 02:30 UTC.
    expect(weekHourOf(new Date("2026-10-07T02:30:00Z"), formatter)).toBe(
      2 * 24 + 23,
    );
    // Domingo, 04/10/2026, 00:10 em São Paulo.
    expect(weekHourOf(new Date("2026-10-04T03:10:00Z"), formatter)).toBe(0);
  });
});

describe("contagem", () => {
  it("conta só mensagens recebidas do negócio pedido, no intervalo, fora as conversas pessoais", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { createdAt: new Date("2026-10-07T02:30:00Z") },
        { createdAt: new Date("2026-10-07T02:45:00Z") },
        { createdAt: new Date("2026-10-07T13:00:00Z") },
      ]);
    const prisma = { message: { findMany } } as unknown as PrismaClient;
    const from = new Date("2026-10-01T03:00:00Z");
    const to = new Date("2026-11-01T03:00:00Z");

    const hours = await countInboundMessagesByWeekHour(prisma, "tenant-a", {
      from,
      to,
      timeZone,
    });

    expect(hours).toHaveLength(WEEK_HOURS);
    expect(hours[2 * 24 + 23]).toBe(2);
    expect(hours[3 * 24 + 10]).toBe(1);
    expect(hours.reduce((sum, count) => sum + count, 0)).toBe(3);

    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      tenantId: "tenant-a",
      direction: "INBOUND",
      createdAt: { gte: from, lt: to },
    });
    // Nenhum ramo do filtro deixa passar contato marcado como pessoal.
    expect(JSON.stringify(where.conversation)).not.toContain("PERSONAL");
    expect(findMany.mock.calls[0]?.[0]?.select).toEqual({ createdAt: true });
  });
});

describe("credencial", () => {
  it("a rota pede só leitura de conversas — sem ela o BFF levava 403 INTERNAL_SCOPE_DENIED", async () => {
    vi.stubEnv(
      "INTERNAL_SERVICE_TOKEN",
      "root-internal-secret-with-32-chars-min-178",
    );
    const { requiredScope } =
      await import("../../src/modules/internal/routes.js");
    expect(
      requiredScope({
        method: "GET",
        url: "/internal/inbound-hours?from=a&to=b&timeZone=c",
      } as never),
    ).toBe("conversations:read");
  });
});
