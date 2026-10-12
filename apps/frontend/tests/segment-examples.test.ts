import { describe, expect, test } from "vitest";

import { buildDemoConversation } from "@/features/onboarding/demo";
import {
  GENERIC_EXAMPLES,
  segmentExamples,
  toneExamples,
  welcomeAskFor,
} from "@/features/onboarding/segmentExamples";

/**
 * Exemplos de conversa por segmento (validação de 2026-10-11): o serviço é o
 * real do negócio; o jeito de o cliente falar segue o segmento.
 */
describe("segmentExamples", () => {
  test("cada segmento frequente tem a própria variação; Cabelo é a de sempre", () => {
    expect(segmentExamples("Cabelo")).toBe(GENERIC_EXAMPLES);
    expect(segmentExamples("Barbearia").sampleService).toBe("Corte + barba");
    expect(segmentExamples("Unhas").sampleService).toBe("Manicure e pedicure");
    expect(segmentExamples("Sobrancelhas e cílios").clientName).toBe("Carla");
    expect(segmentExamples("Estética").emoji).toBe("✨");
    expect(segmentExamples("Massagem e terapias").greeting).toBe("Olá!");
    expect(segmentExamples("Personal trainer").greeting).toBe("Opa!");
  });

  test("texto livre cai no segmento pelas palavras, sem acento nem caixa", () => {
    expect(segmentExamples("Studio de LASH")).toBe(
      segmentExamples("Sobrancelhas e cílios"),
    );
    expect(segmentExamples("salão de beleza")).toBe(GENERIC_EXAMPLES);
    expect(segmentExamples("Nail designer")).toBe(segmentExamples("Unhas"));
    expect(segmentExamples("Pilates")).toBe(segmentExamples("Personal trainer"));
    expect(segmentExamples("Veterinária")).toBe(GENERIC_EXAMPLES);
    expect(segmentExamples(null)).toBe(GENERIC_EXAMPLES);
  });

  test("boas-vindas: com serviço real ele é citado; sem, a frase do segmento", () => {
    const barber = segmentExamples("Barbearia");
    expect(welcomeAskFor(barber, "")).toBe(
      "Fala! Tem horário pra cortar na sexta?",
    );
    expect(welcomeAskFor(barber, "Corte degradê")).toBe(
      "Fala! Tem horário pra corte degradê na sexta?",
    );
    expect(welcomeAskFor(GENERIC_EXAMPLES, "")).toBe(
      "Oi! Tem horário na sexta?",
    );
  });

  test("estilos da IA: genérico sem serviço mantém as frases; com serviço, ele entra", () => {
    expect(toneExamples(GENERIC_EXAMPLES, null).CASUAL).toBe(
      "“Oiii! Bora marcar? 😄”",
    );
    expect(toneExamples(segmentExamples("Unhas"), "Esmaltação em gel")).toEqual({
      BALANCED: "“Oi! Quer marcar esmaltação em gel? 😊”",
      CASUAL: "“Oiii! Bora marcar esmaltação em gel? 💅”",
      PROFESSIONAL: "“Olá! Gostaria de agendar esmaltação em gel?”",
    });
  });

  test("a demonstração usa o serviço real e fala do jeito do segmento", () => {
    const conversation = buildDemoConversation(
      {
        businessCategory: "Barbearia",
        dayHours: {},
        days: [1, 2, 3, 4, 5],
        endTime: "18:00",
        serviceDuration: 40,
        serviceName: "Corte degradê",
        servicePrice: "50",
        servicePriceType: "FIXED",
        startTime: "09:00",
        timezone: "America/Sao_Paulo",
      },
      new Date("2026-10-07T12:00:00.000Z"),
    );
    const clients = conversation?.items
      .filter((item) => item.kind === "client")
      .map((item) => item.text);
    expect(clients?.[0]).toBe("Fala! Quanto tá corte degradê?");
    expect(clients?.[1]).toMatch(/^Fechou! Tem /u);
    expect(clients?.at(-1)).toBe("Pode marcar!");
    expect(conversation?.items.at(-1)?.text).toMatch(/💈$/u);
  });
});
