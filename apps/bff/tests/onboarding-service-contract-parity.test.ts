import {
  onboardingStateSchema,
  serviceSchema,
} from "@avenly-ia/public-api-contract";
import { describe, expect, it } from "vitest";

// O `service` do onboarding é o serviço ativo devolvido por
// `scheduling.listServices`, repassado sem forma reduzida. Campo novo em
// `serviceSchema` que não entre aqui vira 500 da checagem de contrato no
// `PATCH /v1/onboarding` (foi o caso de `usageCount`, D-170).
describe("onboarding service contract parity", () => {
  it("declares exactly the fields of serviceSchema", () => {
    const onboardingService = onboardingStateSchema.shape.service.unwrap();

    expect(Object.keys(onboardingService.shape).sort()).toEqual(
      Object.keys(serviceSchema.shape).sort(),
    );
  });

  it("accepts a service carrying usageCount", () => {
    const parsed = onboardingStateSchema.shape.service.parse({
      id: "service-1",
      name: "Corte",
      durationMinutes: 45,
      priceType: "FIXED",
      price: 50,
      active: true,
      usageCount: 7,
    });

    expect(parsed?.usageCount).toBe(7);
  });
});
