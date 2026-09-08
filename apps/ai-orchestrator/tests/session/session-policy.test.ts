import { describe, expect, it } from "vitest";

import {
  aiEligibilityReason,
  categoryFromClassification,
  executionGuardReason,
  isSessionExpired,
  resolveEffectiveCategory,
  type SessionPolicy,
  sessionExpiresAt,
} from "../../src/modules/session/session-policy.js";

const policy: SessionPolicy = { inactivitySeconds: 86_400 };

const eligible = {
  contactIgnored: false,
  contactAiPaused: false,
  category: "COMMERCIAL" as const,
  humanHandling: false,
  aiEnabled: true,
  channelConnected: true,
};

describe("expiracao da sessao", () => {
  it("expira pela inatividade do contato, no limite configurado", () => {
    const last = new Date("2026-09-07T10:00:00.000Z");
    const expiresAt = sessionExpiresAt(last, policy);
    expect(expiresAt.toISOString()).toBe("2026-09-08T10:00:00.000Z");

    // Exatamente no instante de expiracao a sessao ainda vale.
    expect(isSessionExpired({ expiresAt, now: expiresAt })).toBe(false);
    expect(
      isSessionExpired({
        expiresAt,
        now: new Date(expiresAt.getTime() - 1),
      }),
    ).toBe(false);
    expect(
      isSessionExpired({
        expiresAt,
        now: new Date(expiresAt.getTime() + 1),
      }),
    ).toBe(true);
  });

  it("respeita a fronteira configurada, e nao um valor fixo de 24 h", () => {
    const short: SessionPolicy = { inactivitySeconds: 60 };
    const last = new Date("2026-09-07T10:00:00.000Z");
    expect(sessionExpiresAt(last, short).toISOString()).toBe(
      "2026-09-07T10:01:00.000Z",
    );
  });
});

describe("categoria vigente", () => {
  it("o override manual prevalece sobre a sugestao automatica", () => {
    expect(
      resolveEffectiveCategory({
        override: "COMMERCIAL",
        suggestion: "PERSONAL",
      }),
    ).toEqual({ category: "COMMERCIAL", source: "MANUAL" });
  });

  it("a sugestao so vale quando ninguem decidiu manualmente", () => {
    expect(
      resolveEffectiveCategory({ override: null, suggestion: "PERSONAL" }),
    ).toEqual({ category: "PERSONAL", source: "AUTOMATIC" });
  });

  it("sem override nem sugestao a conversa fica em Nao classificadas", () => {
    expect(resolveEffectiveCategory({})).toEqual({
      category: "UNCLASSIFIED",
      source: "AUTOMATIC",
    });
  });

  it("traduz a classificacao tecnica do agente sem inventar Comercial", () => {
    expect(categoryFromClassification("potential_customer")).toBe("COMMERCIAL");
    expect(categoryFromClassification("existing_customer")).toBe("COMMERCIAL");
    expect(categoryFromClassification("personal_contact")).toBe("PERSONAL");
    expect(categoryFromClassification("supplier_or_partner")).toBe(
      "UNCLASSIFIED",
    );
    expect(categoryFromClassification("spam")).toBe("UNCLASSIFIED");
    expect(categoryFromClassification("unknown")).toBe("UNCLASSIFIED");
    expect(categoryFromClassification(undefined)).toBeNull();
    expect(categoryFromClassification("algo_que_o_modelo_inventou")).toBeNull();
  });
});

describe("elegibilidade da IA", () => {
  it("aceita a sessao comercial com tudo ligado", () => {
    expect(aiEligibilityReason(eligible)).toBeNull();
  });

  it("contato ignorado prevalece sobre qualquer outro estado", () => {
    expect(
      aiEligibilityReason({
        ...eligible,
        contactIgnored: true,
        category: "COMMERCIAL",
        aiEnabled: true,
        humanHandling: false,
      }),
    ).toBe("contact_ignored");
  });

  it("sessao pessoal desliga a IA antes de qualquer leitura de conteudo", () => {
    expect(
      aiEligibilityReason({ ...eligible, category: "PERSONAL" }),
    ).toBe("session_personal");
  });

  it("distingue canal desconectado, IA desligada, pausa e atendimento humano", () => {
    expect(
      aiEligibilityReason({ ...eligible, channelConnected: false }),
    ).toBe("channel_disconnected");
    expect(aiEligibilityReason({ ...eligible, aiEnabled: false })).toBe(
      "ai_disabled",
    );
    expect(aiEligibilityReason({ ...eligible, contactAiPaused: true })).toBe(
      "contact_ai_paused",
    );
    expect(aiEligibilityReason({ ...eligible, humanHandling: true })).toBe(
      "human_handling",
    );
  });
});

describe("guard antes de tool com efeito e antes de enviar", () => {
  it("libera quando a versao de entrada nao mudou", () => {
    expect(
      executionGuardReason({
        ...eligible,
        observedInboundVersion: 7,
        currentInboundVersion: 7,
      }),
    ).toBeNull();
  });

  it("descarta quando o contato falou de novo durante o turno", () => {
    expect(
      executionGuardReason({
        ...eligible,
        observedInboundVersion: 7,
        currentInboundVersion: 8,
      }),
    ).toBe("input_superseded");
  });

  it("a elegibilidade vem antes da versao: ignorado recusa mesmo sem mensagem nova", () => {
    expect(
      executionGuardReason({
        ...eligible,
        contactIgnored: true,
        observedInboundVersion: 7,
        currentInboundVersion: 7,
      }),
    ).toBe("contact_ignored");
  });
});
