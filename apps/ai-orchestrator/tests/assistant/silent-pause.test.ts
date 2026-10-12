import { describe, expect, it } from "vitest";

import {
  alignFarewellToNow,
  asksBookingConfirmation,
  describesToolCallInsteadOfCalling,
  dropRepeatedPriceAndDuration,
  isSilentPause,
  restorePortugueseAccents,
} from "../../src/modules/assistant/assistant.service.js";
import { buildSystemPrompt } from "../../src/modules/prompts/system.js";
import { DEFAULT_BUSINESS_CONTEXT } from "../../src/modules/tenant-config/business-context.js";

/**
 * Validacao de 2026-10-11: uma cliente puxou assunto pessoal e ofereceu os
 * servicos dela ("se tu quiser botox ou progressiva"). A IA respondeu como se
 * o negocio fizesse botox e perguntou qual dos dois ela queria marcar.
 * Regra do vault (05-WhatsApp): quando fica claro que a conversa e de outro
 * assunto, a IA para de responder.
 */
describe("isSilentPause", () => {
  it.each(["personal_contact", "supplier_or_partner", "spam"])(
    "pause_ai por %s nao manda nada",
    (reason) => {
      expect(
        isSilentPause({ action: "pause_ai", pauseReason: reason, confidence: 0.9 }),
      ).toBe(true);
      expect(
        isSilentPause({
          action: "pause_ai",
          classification: reason as never,
          confidence: 0.9,
        }),
      ).toBe(true);
    },
  );

  it("pausa por pedido de humano ou reclamacao continua avisando a cliente", () => {
    expect(
      isSilentPause({
        action: "pause_ai",
        pauseReason: "human_requested",
        confidence: 0.9,
      }),
    ).toBe(false);
    expect(
      isSilentPause({
        action: "handoff_human",
        pauseReason: "personal_contact",
        confidence: 0.9,
      }),
    ).toBe(false);
  });

  it("o prompt manda parar em silencio fora do assunto do negocio e nao oferecer servico fora do catalogo", () => {
    const { text } = buildSystemPrompt({
      state: {},
      groupedMessages: "Se tu quiser botox ou progressiva",
      currentDateTime: "2026-01-01T00:00:00.000Z",
      businessContext: { ...DEFAULT_BUSINESS_CONTEXT, configured: true },
      aiSettings: { aiEnabled: true, tone: "BALANCED" },
      knowledgeRequested: false,
      retrievedKnowledge: [],
    });
    expect(text).toContain("pare na hora e nao responda nada, mesmo que a pessoa ja seja cliente");
    expect(text).toContain("Ofereca e agende somente servicos que vieram de list_services.");
  });
});

describe("asksBookingConfirmation", () => {
  it.each([
    "posso confirmar design de sobrancelha na sexta as 18h?",
    "oi! tudo bem? posso marcar aplicacao 5d hoje as 8h?",
    "podemos fechar quinta as 15h?",
  ])("%j pede confirmacao", (text) => {
    expect(asksBookingConfirmation(text)).toBe(true);
  });

  it.each([
    "na sexta tenho as 8h, 9h ou 10h. qual voce prefere?",
    "agendado para sexta as 18h. te vejo sexta, obrigada!",
    "posso confirmar que fazemos brasileiro.",
  ])("%j nao pede confirmacao de agendamento", (text) => {
    expect(asksBookingConfirmation(text)).toBe(false);
  });
});

describe("describesToolCallInsteadOfCalling", () => {
  it("decisao call_tool sem mensagem e uma tool descrita, nao chamada", () => {
    expect(
      describesToolCallInsteadOfCalling(
        JSON.stringify({ action: "call_tool", messages: [""], confidence: 0.99 }),
      ),
    ).toBe(true);
  });

  it("resposta normal para a cliente nao dispara o aviso", () => {
    expect(
      describesToolCallInsteadOfCalling(
        JSON.stringify({
          action: "send_message",
          messages: ["Agendado para terca as 8h."],
          confidence: 0.9,
        }),
      ),
    ).toBe(false);
    expect(
      describesToolCallInsteadOfCalling(
        JSON.stringify({
          action: "call_tool",
          messages: ["Na terca tenho as 8h ou 10h."],
          confidence: 0.9,
        }),
      ),
    ).toBe(false);
  });
});

describe("alignFarewellToNow", () => {
  it("troca a parte do dia pela hora real do negocio", () => {
    // 00h20 em Sao Paulo: a IA escreveu "otima tarde".
    expect(
      alignFarewellToNow(
        "Te vejo terça, obrigada e tenha uma ótima tarde.",
        "2026-10-12T03:20:00.000Z",
        "America/Sao_Paulo",
      ),
    ).toBe("Te vejo terça, obrigada e tenha uma ótima noite.");
    expect(
      alignFarewellToNow(
        "Tenha um ótimo dia!",
        "2026-10-12T17:00:00.000Z",
        "America/Sao_Paulo",
      ),
    ).toBe("Tenha uma ótima tarde!");
  });

  it("atendimento no mesmo dia vira te vejo mais tarde, nunca te vejo hoje", () => {
    // Validacao de 2026-10-12: "Te vejo hoje, obrigada, tenha uma otima noite".
    expect(
      alignFarewellToNow(
        "Te vejo hoje, obrigada, tenha uma ótima noite",
        "2026-10-12T03:47:00.000Z",
        "America/Sao_Paulo",
      ),
    ).toBe("Te vejo mais tarde, obrigada, tenha uma ótima noite");
  });

  it("texto sem despedida fica igual", () => {
    expect(
      alignFarewellToNow("Na sexta tenho às 8h.", "2026-10-12T03:20:00.000Z", "America/Sao_Paulo"),
    ).toBe("Na sexta tenho às 8h.");
  });
});

describe("restorePortugueseAccents", () => {
  // Validacao de 2026-10-12: "Para design de sobrancelha, amanha tenho as
  // 9h, 9h30 ou 10h. Tambem tem 11h..." saiu sem acento, copiado do prompt.
  it("corrige as palavras que o modelo copia sem acento", () => {
    expect(
      restorePortugueseAccents(
        "Amanha tenho as 9h ou 10h. Tambem tem 15h, qual voce prefere? Nao tem horario na terca.",
      ),
    ).toBe(
      "Amanhã tenho às 9h ou 10h. Também tem 15h, qual você prefere? Não tem horário na terça.",
    );
    expect(restorePortugueseAccents("tenha uma otima noite")).toBe("tenha uma ótima noite");
  });

  it("nao mexe no que ja esta certo nem em palavras ambiguas", () => {
    const text = "Amanhã às 9h. Esta semana está cheia, e até sexta só tenho às 18h.";
    expect(restorePortugueseAccents(text)).toBe(text);
    expect(restorePortugueseAccents("as unhas e as sobrancelhas")).toBe(
      "as unhas e as sobrancelhas",
    );
  });
});

describe("dropRepeatedPriceAndDuration", () => {
  // Validacao de 2026-10-12: "O design de sobrancelha leva 40 min e custa
  // R$ 35" saia em toda oferta, inclusive para cliente recorrente.
  const before = ["O design de sobrancelha custa R$ 35 e leva 40 minutos."];

  it("tira a frase de valor e duracao ja dita antes", () => {
    expect(
      dropRepeatedPriceAndDuration(
        "Pra hoje, segunda (12/10), tenho às 14h ou 18h. O design de sobrancelha leva 40 min e custa R$ 35.\n\nQual você prefere?",
        before,
        "mas segunda de tarde, tem horario?",
      ),
    ).toBe("Pra hoje, segunda (12/10), tenho às 14h ou 18h.\n\nQual você prefere?");
  });

  it("mantem quando a cliente pergunta o valor ou quando e a primeira vez", () => {
    const text = "O design de sobrancelha leva 40 min e custa R$ 35.";
    expect(dropRepeatedPriceAndDuration(text, before, "qual o valor?")).toBe(text);
    expect(dropRepeatedPriceAndDuration(text, [], "quero sobrancelha")).toBe(text);
  });

  it("nao tira frase com horario junto do valor", () => {
    const text = "Tenho às 14h, o atendimento custa R$ 35.";
    expect(dropRepeatedPriceAndDuration(text, before, "tem horario?")).toBe(text);
  });
});
