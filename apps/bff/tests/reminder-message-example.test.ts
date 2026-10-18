import {
  REMINDER_MESSAGE_EXAMPLE_MAX_LENGTH,
  reminderMessageExampleInputSchema,
  reminderMessageExampleIssue,
  reminderSettingsSchema,
} from "@avenly-ia/public-api-contract";
import { describe, expect, it } from "vitest";

/**
 * D-197: mensagem de exemplo do lembrete. A regra do texto mora no contrato
 * e é a mesma no PATCH /v1/settings/reminders e na validação inline da tela.
 */
describe("D-197: reminderMessageExampleIssue", () => {
  it("aceita o texto com os quatro campos, emoji e linha extra", () => {
    expect(
      reminderMessageExampleIssue(
        "Oii, {nome}! 😊\n\nSeu {servico} é {data}, às {hora}.\nLembre de vir sem rímel 😉",
      ),
    ).toBeNull();
    expect(reminderMessageExampleIssue("")).toBeNull();
    expect(reminderMessageExampleIssue("Chegue 10 min antes 💛")).toBeNull();
  });

  it("recusa campo desconhecido, dizendo qual", () => {
    expect(reminderMessageExampleIssue("Oi {cliente}!")).toEqual({
      id: "UNKNOWN_FIELD",
      field: "cliente",
    });
    expect(reminderMessageExampleIssue("Valor: {valor}")).toEqual({
      id: "UNKNOWN_FIELD",
      field: "valor",
    });
  });

  it("recusa data, horário e valor escritos à mão", () => {
    expect(reminderMessageExampleIssue("Te espero dia 19/10!")).toEqual({
      id: "WRITTEN_DATE",
    });
    for (const time of ["às 15h30", "às 15h", "às 15:30", "às 9H"]) {
      expect(reminderMessageExampleIssue(`Te espero ${time}!`)).toEqual({
        id: "WRITTEN_TIME",
      });
    }
    expect(reminderMessageExampleIssue("Fica R$ 150,00")).toEqual({
      id: "WRITTEN_PRICE",
    });
  });

  it("respeita o teto, depois de aparar o texto", () => {
    const atCeiling = "a".repeat(REMINDER_MESSAGE_EXAMPLE_MAX_LENGTH);
    expect(reminderMessageExampleIssue(`  ${atCeiling}  `)).toBeNull();
    expect(reminderMessageExampleIssue(`${atCeiling}a`)).toEqual({
      id: "TOO_LONG",
    });
  });

  it("o corpo do PATCH aceita null e recusa texto inválido", () => {
    expect(reminderMessageExampleInputSchema.parse(null)).toBeNull();
    expect(reminderMessageExampleInputSchema.safeParse("Oi {x}").success).toBe(
      false,
    );
  });

  it("resposta sem o campo vale como o padrão", () => {
    const parsed = reminderSettingsSchema.parse({
      configured: true,
      confirmationEnabled: false,
      pricePolicy: "NEVER",
      rules: [],
    });
    expect(parsed.messageExample ?? null).toBeNull();
  });
});
