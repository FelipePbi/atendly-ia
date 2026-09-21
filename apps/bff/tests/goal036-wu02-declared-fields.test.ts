import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import { responseContractViolation } from "../src/lib/response-contract.js";

/**
 * Goal036/WU-02 — o contrato declara o que o produtor já devolve.
 *
 * Três achados do FINAL_AUDIT (A-21, A-22, A-23): `ai.reconciled` em
 * `systemStatusSchema`, `modalities`/`address` em `businessProfileSchema` e os
 * sete campos de serviço no `service` inline de `onboardingStateSchema`. Cada
 * teste monta o corpo real que o produtor emite (`status/routes.ts`,
 * `lib/dto.ts#businessProfileDto`, `lib/onboarding-state.ts`) e verifica que
 * `responseContractViolation` não acha chave não declarada. Se a declaração
 * regredir, o achado volta e o teste fica vermelho.
 */

function requestFor(method: string, pathPattern: string): FastifyRequest {
  return {
    method,
    routeOptions: { url: pathPattern },
  } as unknown as FastifyRequest;
}

function envelope(data: unknown): string {
  return JSON.stringify({ data, requestId: "req-goal036-wu02" });
}

describe("A-21: systemStatusSchema declara ai.reconciled", () => {
  it("não acha chave a mais no corpo real de GET /v1/status", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/status"),
      200,
      envelope({
        whatsapp: {
          status: "CONNECTED",
          phoneNumber: "+5511999999999",
          checkedAt: "2026-09-20T10:00:00.000Z",
        },
        ai: {
          desiredEnabled: true,
          effectiveEnabled: true,
          state: "ACTIVE",
          reconciled: "CONVERGED",
        },
        accountDeletion: { status: "NONE", dueAt: null },
        degraded: false,
      }),
    );

    expect(violation).toBeNull();
  });
});

describe("A-22: businessProfileSchema declara modalities e address", () => {
  it("não acha chave a mais no corpo real de GET /v1/auth/session", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/auth/session"),
      200,
      envelope({
        user: {
          id: "usr-1",
          email: "dona@negocio.com",
          createdAt: "2026-09-20T10:00:00.000Z",
        },
        tenant: {
          id: "ten-1",
          name: "Negócio",
          role: "OWNER",
          createdAt: "2026-09-20T10:00:00.000Z",
          updatedAt: "2026-09-20T10:00:00.000Z",
        },
        businessProfile: {
          id: "biz-1",
          businessName: "Negócio",
          category: "Salão",
          timezone: "America/Sao_Paulo",
          language: "pt-BR",
          currency: "BRL",
          modalities: ["ON_SITE", "ONLINE"],
          address: "Rua Exemplo, 123",
          createdAt: "2026-09-20T10:00:00.000Z",
          updatedAt: "2026-09-20T10:00:00.000Z",
        },
        onboardingCompleted: true,
      }),
    );

    expect(violation).toBeNull();
  });
});

describe("A-23: onboardingStateSchema.service declara os sete campos de serviço", () => {
  it("não acha chave a mais no corpo real de GET /v1/onboarding", () => {
    const violation = responseContractViolation(
      requestFor("GET", "/v1/onboarding"),
      200,
      envelope({
        business: {
          name: "Negócio",
          category: "Salão",
          timezone: "America/Sao_Paulo",
          modalities: ["ON_SITE"],
          address: "Rua Exemplo, 123",
          contextVersion: 3,
          contextProjectedVersion: 3,
          contextProjectionStatus: "PROJECTED",
        },
        calendar: {
          source: "ATENDLY",
          timezone: "America/Sao_Paulo",
          integration: null,
        },
        ai: { tone: "BALANCED" },
        service: {
          id: "svc-1",
          name: "Corte",
          durationMinutes: 30,
          priceType: "FIXED",
          price: 50,
          active: true,
          needsReview: false,
          reviewOrigin: "MANUAL",
          description: "Corte de cabelo",
          colorToken: "ROSE",
          bufferBeforeMinutes: 5,
          bufferAfterMinutes: 5,
          recurrenceIntervalDays: 30,
        },
        availability: null,
        whatsapp: null,
        completed: false,
        completedAt: null,
      }),
    );

    expect(violation).toBeNull();
  });
});
