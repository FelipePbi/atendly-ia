/**
 * Goal022 (WU-08): modelo puro do chrome de Notificações — a entrada de
 * navegação e o teto de exibição do contador. Testados em `node`, sem DOM,
 * como o restante do modelo de navegação em goal014-shell.test.ts.
 */

import { describe, expect, test } from "vitest";

import {
  isMobileTab,
  isMoreActive,
  MORE_DESTINATIONS,
  NOTIFICATIONS_DESTINATION,
  notificationsBadgeLabel,
  SIDEBAR_DESTINATIONS,
} from "@/shared/layout/navigation";

describe("entrada de Notificações no chrome", () => {
  test("não é um sexto destino da sidebar nem uma quinta aba do mobile", () => {
    expect(SIDEBAR_DESTINATIONS.some((item) => item.section === "notificacoes")).toBe(
      false,
    );
    expect(isMobileTab("notificacoes")).toBe(false);
    expect(isMoreActive("notificacoes")).toBe(true);
  });

  test("está em MORE_DESTINATIONS, disponível para 'Mais' no mobile", () => {
    expect(MORE_DESTINATIONS).toContainEqual(NOTIFICATIONS_DESTINATION);
  });
});

describe("teto de exibição do contador de não lidas", () => {
  test("zero ou negativo não mostra nada", () => {
    expect(notificationsBadgeLabel(0)).toBeNull();
    expect(notificationsBadgeLabel(-1)).toBeNull();
  });

  test("abaixo do teto mostra o número exato", () => {
    expect(notificationsBadgeLabel(1)).toBe("1");
    expect(notificationsBadgeLabel(9)).toBe("9");
  });

  test("acima do teto mostra '9+', não o número exato", () => {
    expect(notificationsBadgeLabel(10)).toBe("9+");
    expect(notificationsBadgeLabel(120)).toBe("9+");
  });
});
