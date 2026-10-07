import {
  importCandidateSchema,
  importItemSchema,
} from "@avenly-ia/public-api-contract";
import { describe, expect, it } from "vitest";

/**
 * Goal136/WU-02 — `candidates` e `proposedService` no item da importação
 * (contrato público). Os dois campos são aditivos e opcionais; o candidato de
 * cliente nunca leva telefone nem outro dado pessoal.
 */
function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    category: "CUSTOMER",
    externalId: "77",
    label: "Maria",
    status: "NEEDS_REVIEW",
    reasonCode: "CUSTOMER_MATCH_FOUND",
    reasonDetail: null,
    entityType: null,
    internalId: null,
    attemptCount: 0,
    lastAttemptAt: null,
    processedAt: null,
    disappearedAt: null,
    ...overrides,
  };
}

describe("importItemSchema: candidates e proposedService (Goal136)", () => {
  it("aceita o item sem os dois campos", () => {
    const parsed = importItemSchema.parse(baseItem());
    expect(parsed.candidates).toBeUndefined();
    expect(parsed.proposedService).toBeUndefined();
  });

  it("aceita candidato de cliente com só internalId e name", () => {
    const parsed = importItemSchema.parse(
      baseItem({ candidates: [{ internalId: "cust-1", name: "Maria Souza" }] }),
    );
    expect(parsed.candidates).toEqual([
      { internalId: "cust-1", name: "Maria Souza" },
    ]);
  });

  it("recusa candidato de cliente com telefone ou outro dado pessoal", () => {
    expect(
      importItemSchema.safeParse(
        baseItem({
          candidates: [
            { internalId: "cust-1", name: "Maria", phone: "+5555999990001" },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      importItemSchema.safeParse(
        baseItem({
          candidates: [{ internalId: "cust-1", name: "Maria", email: "a@b.c" }],
        }),
      ).success,
    ).toBe(false);
  });

  it("recusa candidato malformado", () => {
    for (const candidate of [
      {},
      { name: "Sem id" },
      { internalId: "", name: "Id vazio" },
      { internalId: "cust-1" },
      { internalId: 7, name: "Id numérico" },
    ]) {
      expect(importCandidateSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("aceita candidato de serviço completo e recusa o incompleto", () => {
    const service = {
      internalId: "svc-1",
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
      active: true,
    };
    expect(importCandidateSchema.safeParse(service).success).toBe(true);
    expect(
      importCandidateSchema.safeParse({ ...service, price: undefined })
        .success,
    ).toBe(false);
    expect(
      importCandidateSchema.safeParse({ ...service, priceType: "FREE" })
        .success,
    ).toBe(false);
    expect(
      importCandidateSchema.safeParse({ ...service, durationMinutes: 0 })
        .success,
    ).toBe(false);
  });

  it("aceita proposedService preenchido, com preço não informado e nulo", () => {
    const filled = importItemSchema.parse(
      baseItem({
        category: "SERVICE",
        proposedService: {
          durationMinutes: 45,
          priceType: "FIXED",
          price: 80,
        },
      }),
    );
    expect(filled.proposedService).toEqual({
      durationMinutes: 45,
      priceType: "FIXED",
      price: 80,
    });

    expect(
      importItemSchema.parse(
        baseItem({
          category: "SERVICE",
          proposedService: {
            durationMinutes: null,
            priceType: "NOT_INFORMED",
            price: null,
          },
        }),
      ).proposedService,
    ).toEqual({ durationMinutes: null, priceType: "NOT_INFORMED", price: null });

    expect(
      importItemSchema.parse(
        baseItem({ category: "SERVICE", proposedService: null }),
      ).proposedService,
    ).toBeNull();
  });

  it("recusa proposedService malformado", () => {
    expect(
      importItemSchema.safeParse(
        baseItem({
          category: "SERVICE",
          proposedService: { durationMinutes: 30, priceType: "FIXED" },
        }),
      ).success,
    ).toBe(false);
    expect(
      importItemSchema.safeParse(
        baseItem({
          category: "SERVICE",
          proposedService: {
            durationMinutes: 30,
            priceType: "FIXED",
            price: -1,
          },
        }),
      ).success,
    ).toBe(false);
  });
});
