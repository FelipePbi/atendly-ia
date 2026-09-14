/**
 * Goal014 (WU-04): o modelo de navegação do shell (cinco destinos, "Mais"
 * como aba sintética) e o mapeamento de status de WhatsApp/IA são funções
 * puras — testadas aqui em `node`, sem DOM, porque o AppShell só as consome.
 */

import { describe, expect, test } from "vitest";

import {
  isDestinationActive,
  isMobileTab,
  isMoreActive,
  MOBILE_TAB_SECTIONS,
  MORE_DESTINATIONS,
  SIDEBAR_DESTINATIONS,
} from "@/shared/layout/navigation";
import {
  aiStatusView,
  whatsappStatusView,
} from "@/shared/runtime/systemStatus";

describe("modelo de navegação", () => {
  test("a sidebar tem os cinco destinos do produto, na ordem do vault", () => {
    expect(SIDEBAR_DESTINATIONS.map((item) => item.label)).toEqual([
      "Início",
      "Conversas",
      "Agenda",
      "Clientes",
      "Serviços",
    ]);
  });

  test("o bottom nav mobile tem quatro abas próprias: Início, Conversas, Agenda, Clientes", () => {
    expect(MOBILE_TAB_SECTIONS).toEqual([
      "inicio",
      "conversas",
      "agenda",
      "clientes",
    ]);
  });

  test("'Mais' lista Serviços e os destinos de Configurações da Especificação das Telas", () => {
    expect(MORE_DESTINATIONS.map((item) => item.section)).toEqual([
      "servicos",
      "negocio",
      "config-agenda",
      "ia",
      "whatsapp",
      "importacao",
      "conta",
    ]);
  });

  test.each(["inicio", "conversas", "agenda", "clientes"] as const)(
    "%s tem aba própria no bottom nav",
    (section) => {
      expect(isMobileTab(section)).toBe(true);
      expect(isMoreActive(section)).toBe(false);
    },
  );

  test.each([
    "servicos",
    "negocio",
    "config-agenda",
    "ia",
    "whatsapp",
    "importacao",
    "conta",
  ] as const)(
    "%s marca 'Mais' como destino ativo, não uma aba própria",
    (section) => {
      expect(isMobileTab(section)).toBe(false);
      expect(isMoreActive(section)).toBe(true);
    },
  );

  test("isDestinationActive só é verdadeiro para o destino que bate com o ativo", () => {
    expect(isDestinationActive("agenda", "agenda")).toBe(true);
    expect(isDestinationActive("agenda", "clientes")).toBe(false);
  });
});

describe("mapeamento de status (WhatsApp e IA)", () => {
  test("antes da primeira resposta de /v1/status, o estado é 'loading' — nunca 'active'", () => {
    expect(whatsappStatusView("loading")).toBe("loading");
    expect(whatsappStatusView("loading", "CONNECTED")).toBe("loading");
    expect(aiStatusView("loading")).toBe("loading");
    expect(aiStatusView("loading", "ACTIVE")).toBe("loading");
  });

  test("se a requisição falhar, o estado é 'unknown' — nunca 'active'", () => {
    expect(whatsappStatusView("error")).toBe("unknown");
    expect(whatsappStatusView("error", "CONNECTED")).toBe("unknown");
    expect(aiStatusView("error")).toBe("unknown");
    expect(aiStatusView("error", "ACTIVE")).toBe("unknown");
  });

  test("WhatsApp: CONNECTED é 'active', UNKNOWN é 'unknown', DISCONNECTED é 'off'", () => {
    expect(whatsappStatusView("loaded", "CONNECTED")).toBe("active");
    expect(whatsappStatusView("loaded", "UNKNOWN")).toBe("unknown");
    expect(whatsappStatusView("loaded", "DISCONNECTED")).toBe("off");
  });

  test("IA: ACTIVE é 'active', UNKNOWN é 'unknown', OFF é 'off', PENDING tem apresentação própria (Goal018/WU-10)", () => {
    expect(aiStatusView("loaded", "ACTIVE")).toBe("active");
    expect(aiStatusView("loaded", "UNKNOWN")).toBe("unknown");
    expect(aiStatusView("loaded", "OFF")).toBe("off");
    expect(aiStatusView("loaded", "PENDING")).toBe("pending");
  });

  test("nenhuma combinação produz 'active' sem uma leitura 'loaded' e um estado confirmado", () => {
    const phases = ["loading", "error"] as const;
    for (const phase of phases) {
      expect(whatsappStatusView(phase, "CONNECTED")).not.toBe("active");
      expect(aiStatusView(phase, "ACTIVE")).not.toBe("active");
    }
  });
});
