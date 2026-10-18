import { describe, expect, it } from "vitest";

import { Prisma } from "../../src/generated/prisma/client.js";
import {
  actorFromContext,
  actorFromSource,
  diffFields,
  sanitizeActivityJson,
} from "../../src/modules/activity/activity-log.js";
import {
  SERVICE_ACTIVITY_FIELDS,
  serviceActivityRow,
} from "../../src/modules/activity/entity-activity.js";

/** Registro de atividade (D-176): o que entra no antes/depois e o que nunca entra. */
describe("activity log", () => {
  it("compara só os campos pedidos e só os que mudaram", () => {
    expect(
      diffFields(
        { name: "Ana", phone: "+5511988887777", internal: 1 },
        { name: "Ana Souza", phone: "+5511988887777", internal: 2 },
        ["name", "phone"],
      ),
    ).toEqual([{ field: "name", before: "Ana", after: "Ana Souza" }]);
  });

  it("normaliza Decimal, data e ausência", () => {
    expect(
      diffFields(
        { price: new Prisma.Decimal("80.00"), at: null },
        { price: new Prisma.Decimal("95.50"), at: new Date("2026-10-16T12:00:00Z") },
        ["price", "at", "missing"],
      ),
    ).toEqual([
      { field: "price", before: 80, after: 95.5 },
      { field: "at", before: null, after: "2026-10-16T12:00:00.000Z" },
    ]);
  });

  it("nunca registra campo com cara de segredo, mesmo se pedido", () => {
    expect(
      diffFields({ password: "a" }, { password: "b" }, ["password"]),
    ).toEqual([]);
    expect(
      sanitizeActivityJson({
        source: "Minha Agenda",
        credentials: { email: "x@y.z", password: "segredo" },
        apiKey: "k",
        nested: [{ accessToken: "t", label: "ok" }],
      }),
    ).toEqual({ source: "Minha Agenda", nested: [{ label: "ok" }] });
  });

  it("deriva o autor da credencial e da origem gravada", () => {
    expect(
      actorFromContext({ caller: "ai-orchestrator", userId: "owner-1" }),
    ).toEqual({ type: "AI", id: null });
    expect(actorFromContext({ caller: "bff", userId: "owner-1" })).toEqual({
      type: "USER",
      id: "owner-1",
    });
    expect(actorFromSource("INTEGRATION", "owner-1")).toBeNull();
    expect(actorFromSource("SYSTEM", null)).toBeNull();
  });

  it("cor do servico e um campo so, de token para hex e de volta (D-200)", () => {
    const rose = { colorToken: "ROSE", colorHex: null, name: "Teste" };
    const custom = { colorToken: null, colorHex: "#D479FF", name: "Teste" };
    expect(
      diffFields(
        serviceActivityRow(rose),
        serviceActivityRow(custom),
        SERVICE_ACTIVITY_FIELDS,
      ),
    ).toEqual([{ field: "color", before: "ROSE", after: "#d479ff" }]);
    expect(
      diffFields(
        serviceActivityRow(custom),
        serviceActivityRow({ ...rose, colorToken: "SKY" }),
        SERVICE_ACTIVITY_FIELDS,
      ),
    ).toEqual([{ field: "color", before: "#d479ff", after: "SKY" }]);
    // Token para token tambem entra: antes, `colorToken` caia no filtro de
    // segredo e a troca sumia do registro.
    expect(
      diffFields(
        serviceActivityRow(rose),
        serviceActivityRow({ ...rose, colorToken: "SKY" }),
        SERVICE_ACTIVITY_FIELDS,
      ),
    ).toEqual([{ field: "color", before: "ROSE", after: "SKY" }]);
  });
});
