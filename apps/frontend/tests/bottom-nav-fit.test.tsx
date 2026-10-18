// @vitest-environment jsdom
/**
 * D-192 — barra inferior dinâmica (abaixo de 1100 px).
 *
 * O que esta suíte prova:
 *
 * 1. quantos destinos cabem na barra em cada largura (celular 4 + "Mais";
 *    de 600 px, 6 + "Mais"; de 768 px, os 8 + "Conta"), na ordem de
 *    prioridade, e quais sobram para o "Mais";
 * 2. o CSS da primeira pintura (`data-bottom-from` / `data-bottom-until`) usa
 *    os mesmos degraus de `BOTTOM_NAV_TIERS`;
 * 3. na casca renderizada, com `matchMedia` simulando a largura: o "Mais" só
 *    fica ativo quando a tela atual não coube na barra, o modal lista só o
 *    que sobrou, e quando tudo cabe o último item é "Conta" (conta e Sair).
 *
 * Que os itens escondidos pelo CSS somem de verdade, e que nada fica atrás da
 * barra, é medido no navegador (G-1 e G-2 de `e2e/authenticated-matrix`).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "@/shared/layout/AppShell";
import {
  BOTTOM_NAV_DESTINATIONS,
  BOTTOM_NAV_TIERS,
  bottomNavFitsAll,
  bottomNavMinWidth,
  bottomNavOverflow,
  bottomNavSectionOf,
  bottomNavTabCount,
  isMoreActive,
  type PlatformSection,
} from "@/shared/layout/navigation";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    notifications: {
      summary: vi.fn().mockResolvedValue({
        byLevel: { INFO: 0, ATTENTION: 2, CRITICAL: 0 },
        unreadCount: 2,
        openConditionsCount: 0,
      }),
    },
    status: {
      get: vi.fn().mockResolvedValue({
        accountDeletion: { status: "NONE", dueAt: null },
        ai: {
          desiredEnabled: true,
          effectiveEnabled: true,
          reconciled: "CONVERGED",
          state: "ACTIVE",
        },
        degraded: false,
        whatsapp: {
          checkedAt: "2026-09-15T12:00:00.000Z",
          phoneNumber: "5511999990000",
          status: "CONNECTED",
        },
      }),
    },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

const labels = (items: { label: string }[]) => items.map((item) => item.label);

describe("quantos destinos cabem na barra", () => {
  test("a ordem de prioridade: os quatro do celular, depois Serviços, Faturamento, Notificações e Configurações", () => {
    expect(labels(BOTTOM_NAV_DESTINATIONS)).toEqual([
      "Início",
      "Conversas",
      "Agenda",
      "Clientes",
      "Serviços",
      "Faturamento",
      "Notificações",
      "Configurações",
    ]);
  });

  test.each([
    [320, 4],
    [360, 4],
    [390, 4],
    [599, 4],
    [600, 6],
    [700, 6],
    [767, 6],
    [768, 8],
    [900, 8],
    [1024, 8],
    [1099, 8],
  ])("a %i px cabem %i destinos", (width, tabs) => {
    expect(bottomNavTabCount(width)).toBe(tabs);
  });

  test("o que não cabe vai para o 'Mais'; quando tudo cabe, não sobra nada", () => {
    expect(labels(bottomNavOverflow(bottomNavTabCount(390)))).toEqual([
      "Serviços",
      "Faturamento",
      "Notificações",
      "Configurações",
    ]);
    expect(labels(bottomNavOverflow(bottomNavTabCount(600)))).toEqual([
      "Notificações",
      "Configurações",
    ]);
    expect(bottomNavOverflow(bottomNavTabCount(1024))).toEqual([]);
    expect(bottomNavFitsAll(bottomNavTabCount(767))).toBe(false);
    expect(bottomNavFitsAll(bottomNavTabCount(768))).toBe(true);
  });

  test("cada destino sabe a partir de que largura entra na barra", () => {
    expect(
      BOTTOM_NAV_DESTINATIONS.map((item) => bottomNavMinWidth(item.section)),
    ).toEqual([0, 0, 0, 0, 600, 600, 768, 768]);
  });

  test("as telas de dentro de Configurações acendem Configurações (ou o 'Mais', se ela não coube)", () => {
    for (const section of ["negocio", "ia", "conta", "importacao"] as const) {
      expect(bottomNavSectionOf(section)).toBe("configuracoes");
      expect(isMoreActive(section, bottomNavTabCount(390))).toBe(true);
      expect(isMoreActive(section, bottomNavTabCount(1024))).toBe(false);
    }
  });

  test.each<[PlatformSection, number, boolean]>([
    ["servicos", 390, true],
    ["servicos", 600, false],
    ["notificacoes", 600, true],
    ["notificacoes", 768, false],
    ["inicio", 390, false],
  ])("'Mais' ativo para %s a %i px: %s", (section, width, expected) => {
    expect(isMoreActive(section, bottomNavTabCount(width))).toBe(expected);
  });
});

describe("o CSS da primeira pintura usa os mesmos degraus", () => {
  const css = readFileSync(
    path.join(process.cwd(), "src/shared/styles/avenly.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  test.each(BOTTOM_NAV_TIERS.filter((tier) => tier.minWidth > 0))(
    "o degrau de $minWidth px esconde o item antes e mostra a partir dele",
    ({ minWidth }) => {
      const selector = `.bottom-nav-item[data-bottom-from="${minWidth}"]`;
      const hidden = new RegExp(
        `${escape(selector)}[^{]*\\{\\s*display:\\s*none;`,
      );
      expect(css).toMatch(hidden);
      const shown = new RegExp(
        `@media \\(min-width: ${minWidth}px\\) \\{[^@]*${escape(selector)}\\s*\\{\\s*display:\\s*flex;`,
      );
      expect(css).toMatch(shown);
    },
  );

  test("o 'Mais' some e o 'Conta' aparece no degrau em que tudo cabe", () => {
    const last = BOTTOM_NAV_TIERS.at(-1)?.minWidth;
    expect(bottomNavFitsAll(bottomNavTabCount(last ?? 0))).toBe(true);
    expect(css).toMatch(
      new RegExp(
        `@media \\(min-width: ${last}px\\) \\{[^@]*${escape(`.bottom-nav-item[data-bottom-until="${last}"]`)}\\s*\\{\\s*display:\\s*none;`,
      ),
    );
  });
});

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `matchMedia` de uma janela de `width` px (só `min-width`, que é o que a barra consulta). */
function mockWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const minWidth = /min-width:\s*(\d+)px/.exec(query)?.[1];
    return {
      matches: minWidth !== undefined && width >= Number(minWidth),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  });
}

const originalMatchMedia = window.matchMedia;

function renderShell(active: PlatformSection) {
  return render(
    <AppShell active={active} title="Tela">
      <p>Conteúdo</p>
    </AppShell>,
  );
}

function bottomNav(): HTMLElement {
  return document.querySelector('nav[class$="bottom-nav"]') as HTMLElement;
}

describe("a casca em cada largura", () => {
  beforeEach(() => {
    window.matchMedia = originalMatchMedia;
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test("390 px, em Serviços: 'Mais' ativo, e o modal lista os quatro que sobraram", async () => {
    mockWidth(390);
    renderShell("servicos");
    const more = within(bottomNav()).getByRole("button", { name: "Mais" });
    expect(more).toHaveAttribute("aria-current", "page");
    expect(more).toHaveClass("is-active");

    await userEvent.setup().click(more);
    const dialog = screen.getByRole("dialog", { name: "Mais" });
    expect(
      [...dialog.querySelectorAll(".more-tile")].map(
        (tile) => tile.querySelector(".more-tile-label")?.textContent,
      ),
    ).toEqual(["Serviços", "Faturamento", "Notificações", "Configurações"]);
  });

  test("600 px, em Serviços: a aba Serviços fica ativa, o 'Mais' não, e ele lista só Notificações e Configurações", async () => {
    mockWidth(600);
    renderShell("servicos");
    const nav = bottomNav();
    expect(within(nav).getByRole("link", { name: "Serviços" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const more = within(nav).getByRole("button", { name: "Mais" });
    expect(more).not.toHaveAttribute("aria-current");

    await userEvent.setup().click(more);
    const dialog = screen.getByRole("dialog", { name: "Mais" });
    expect(
      [...dialog.querySelectorAll(".more-tile-label")].map(
        (label) => label.textContent,
      ),
    ).toEqual(["Notificações", "Configurações"]);
    expect(within(dialog).getByRole("button", { name: "Sair" })).toBeVisible();
  });

  test("1024 px, numa tela de Configurações: Configurações ativa na barra, e 'Conta' abre só a conta e o Sair", async () => {
    mockWidth(1024);
    const { container } = renderShell("ia");
    const nav = bottomNav();
    expect(
      within(nav).getByRole("link", { name: "Configurações" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("button", { name: "Mais" }),
    ).not.toHaveAttribute("aria-current");
    await expectNoA11yViolations(container);

    const account = within(nav).getByRole("button", { name: "Conta" });
    // As iniciais da pessoa, não o ícone de Clientes.
    expect(account.querySelector(".bottom-nav-avatar")).toHaveTextContent("D");
    await userEvent.setup().click(account);
    const dialog = screen.getByRole("dialog", { name: "Conta" });
    expect(dialog.querySelector(".more-tiles")).toBeNull();
    expect(
      within(dialog).getByRole("link", { name: "Sua conta" }),
    ).toHaveAttribute("href", "/configuracoes/conta");
    expect(within(dialog).getByRole("button", { name: "Sair" })).toBeVisible();
  });

  test("os itens que dependem de largura levam o degrau no HTML, para o CSS decidir antes da hidratação", () => {
    renderShell("inicio");
    const nav = bottomNav();
    expect(
      [...nav.querySelectorAll(".bottom-nav-item")].map((item) => [
        item.querySelector("span:not([aria-hidden]):not(.badge-count)")
          ?.textContent,
        item.getAttribute("data-bottom-from"),
        item.getAttribute("data-bottom-until"),
      ]),
    ).toEqual([
      ["Início", null, null],
      ["Conversas", null, null],
      ["Agenda", null, null],
      ["Clientes", null, null],
      ["Serviços", "600", null],
      ["Faturamento", "600", null],
      ["Notificações", "768", null],
      ["Configurações", "768", null],
      ["Mais", null, "768"],
      ["Conta", "768", null],
    ]);
  });
});
