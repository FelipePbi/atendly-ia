// @vitest-environment jsdom
/**
 * Pedido de 2026-10-12: no celular, o aviso "Atendimento automático parado"
 * era um cartão grande no topo de toda tela e atrapalhava o uso. Agora ele é
 * compacto e tem "Ocultar por 1h": some por uma hora e volta sozinho. O aviso
 * de exclusão de conta não se oculta. Na sidebar, o cartão de WhatsApp
 * desconectado pulsa de leve (tablet e desktop), parado com movimento reduzido.
 */
import { readFileSync } from "node:fs";

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { SystemStatus } from "@/data";
import { AppShell } from "@/shared/layout/AppShell";
import {
  STATUS_BANNER_SNOOZE_MS,
  statusBannerSnoozeKey,
} from "@/shared/layout/statusBannerSnooze";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  usePathname: () => "/clientes",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const statusGet = vi.fn();
const notificationsSummary = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    notifications: { summary: notificationsSummary },
    status: { get: statusGet },
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

function statusFixture(overrides: Partial<SystemStatus> = {}): SystemStatus {
  return {
    accountDeletion: { status: "NONE", dueAt: null },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: true,
      reconciled: "CONVERGED",
      state: "ACTIVE",
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-10-12T12:00:00.000Z",
      phoneNumber: null,
      status: "DISCONNECTED",
    },
    ...overrides,
  };
}

function renderShell() {
  return render(
    <AppShell active="clientes" title="Clientes">
      <p>Conteúdo</p>
    </AppShell>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  statusGet.mockReset();
  notificationsSummary.mockReset();
  statusGet.mockResolvedValue(statusFixture());
  notificationsSummary.mockResolvedValue({
    byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
    unreadCount: 0,
    openConditionsCount: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("aviso de WhatsApp desconectado: ocultar por 1h", () => {
  test("o aviso tem 'Ocultar por 1h' ao lado de 'Reconectar WhatsApp'", async () => {
    const { container } = renderShell();
    const banner = await screen.findByRole("alert");
    expect(
      within(banner).getByText("Atendimento automático parado"),
    ).toBeVisible();
    expect(
      within(banner).getByRole("link", { name: "Reconectar WhatsApp" }),
    ).toHaveAttribute("href", "/configuracoes/whatsapp");
    expect(
      within(banner).getByRole("button", { name: "Ocultar por 1h" }),
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  test("ocultar tira o aviso, grava o prazo de 1h e devolve o foco ao conteúdo", async () => {
    const before = Date.now();
    renderShell();
    const banner = await screen.findByRole("alert");
    await userEvent.click(
      within(banner).getByRole("button", { name: "Ocultar por 1h" }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(
      document.getElementById("main-content"),
    );
    const until = Number(
      window.localStorage.getItem(
        statusBannerSnoozeKey("whatsapp-disconnected"),
      ),
    );
    expect(until - before).toBeGreaterThanOrEqual(STATUS_BANNER_SNOOZE_MS);
    expect(until - Date.now()).toBeLessThanOrEqual(STATUS_BANNER_SNOOZE_MS);
    // A sidebar continua dizendo o estado durante a pausa.
    expect(screen.getByText("WhatsApp desconectado")).toBeVisible();
  });

  test("dentro do prazo, uma tela nova abre sem o aviso", async () => {
    window.localStorage.setItem(
      statusBannerSnoozeKey("whatsapp-disconnected"),
      String(Date.now() + 30 * 60 * 1000),
    );
    renderShell();
    await screen.findByText("WhatsApp desconectado");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("prazo vencido: o aviso volta", async () => {
    window.localStorage.setItem(
      statusBannerSnoozeKey("whatsapp-disconnected"),
      String(Date.now() - 1000),
    );
    renderShell();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Atendimento automático parado",
    );
  });

  test("passada a hora com a tela aberta, o aviso volta sozinho", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderShell();
    const banner = await screen.findByRole("alert");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(
      within(banner).getByRole("button", { name: "Ocultar por 1h" }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(STATUS_BANNER_SNOOZE_MS + 1000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Atendimento automático parado",
    );
  });

  test("ocultar um aviso não oculta o outro", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        ai: {
          desiredEnabled: true,
          effectiveEnabled: false,
          reconciled: "UNKNOWN",
          state: "UNKNOWN",
        },
      }),
    );
    renderShell();
    const whatsapp = (await screen.findAllByRole("alert")).find((alert) =>
      alert.textContent?.includes("Atendimento automático parado"),
    ) as HTMLElement;
    await userEvent.click(
      within(whatsapp).getByRole("button", { name: "Ocultar por 1h" }),
    );
    const left = screen.getAllByRole("alert");
    expect(left).toHaveLength(1);
    expect(left[0]).toHaveTextContent("IA indisponível");
  });

  test("os avisos que se ocultam ficam na camada flutuante; a exclusão não", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        ai: {
          desiredEnabled: true,
          effectiveEnabled: false,
          reconciled: "UNKNOWN",
          state: "UNKNOWN",
        },
      }),
    );
    renderShell();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) {
      expect(alert.parentElement).toHaveClass("shell-status-layer");
    }
  });

  test("o aviso de exclusão de conta não oferece ocultar", async () => {
    statusGet.mockResolvedValue(
      statusFixture({
        accountDeletion: {
          status: "SCHEDULED",
          dueAt: "2026-11-11T12:00:00.000Z",
        },
      }),
    );
    renderShell();
    const banner = await screen.findByRole("alert");
    expect(
      within(banner).getByText("Exclusão de conta agendada"),
    ).toBeVisible();
    expect(
      within(banner).queryByRole("button", { name: /ocultar/i }),
    ).toBeNull();
  });
});

describe("estilo do aviso e do cartão da sidebar", () => {
  const css = readFileSync("src/shared/styles/avenly.css", "utf8");

  test("no celular o aviso é compacto: sem a frase longa e com as ações em texto", () => {
    const mobile = css.slice(css.indexOf(".shell-status-hide {"));
    expect(mobile).toMatch(
      /@media \(max-width: 767px\) \{[^@]*?\n {2}\.shell-status-banner \{[^}]*padding: 10px 12px;/,
    );
    expect(mobile).toMatch(
      /\.shell-status-banner \.alert-text \{\s*display: none;/,
    );
    expect(mobile).toMatch(
      /\.shell-status-banner \.shell-status-link \{[^}]*width: auto;[^}]*background: none;/,
    );
  });

  test("o aviso flutua sobre a tela: camada de altura 0 presa no topo, sem empurrar", () => {
    expect(css).toMatch(
      /\.shell-status-layer \{\s*position: sticky;\s*top: 0;\s*z-index: var\(--at-z-sticky\);\s*height: 0;\s*overflow: visible;/,
    );
    expect(css).toMatch(
      /\.shell-status-layer > \.shell-status-banner \{\s*position: relative;\s*top: 20px;\s*margin: 0 20px 8px;/,
    );
    expect(css).toMatch(
      /@media \(max-width: 767px\) \{\s*\.shell-status-layer > \.shell-status-banner \{\s*top: 12px;\s*margin: 0 12px 8px;/,
    );
    const floating = css.slice(css.indexOf("/* Cartão flutuante"));
    expect(floating).toMatch(
      /\n\.shell-status-banner \{[^}]*border-radius: 14px;[^}]*box-shadow:/,
    );
  });

  test("o foco programático do <main> não desenha a linha verde no topo", () => {
    expect(css).toMatch(/main#main-content:focus-visible \{\s*outline: none;/);
  });

  test("cartão de WhatsApp desconectado: ondas por ~3 s, 20 s parado, e de novo (2026-10-16)", () => {
    const block = (selector: string) => {
      const at = css.indexOf(selector);
      expect(at, selector).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    // Duas ondas encavaladas no mesmo ciclo de 23 s: a segunda 1,2 s depois.
    expect(
      block(
        ".ia-card.is-disconnected::before,\n.ia-card.is-disconnected::after {",
      ),
    ).toMatch(/animation: at-alert-wave 23s [^;]*infinite/);
    expect(css).toMatch(
      /\}\s*\.ia-card\.is-disconnected::after \{\s*animation-delay: 1\.2s;/,
    );
    // A onda se abre e se dispersa em 1,8 s (7,826% de 23 s) e fica parada
    // até o fim do ciclo: nada pisca o tempo todo.
    const wave = css.slice(
      css.indexOf("@keyframes at-alert-wave"),
      css.indexOf("@keyframes at-alert-glow"),
    );
    expect(wave).toMatch(/7\.826%,\s*100% \{[^}]*14px[^}]*transparent 100%/);
    expect((1.2 + 23 * 0.07826).toFixed(1)).toBe("3.0");

    // Movimento reduzido (D-173): mesmo ritmo, sem a onda se abrir.
    const reduced = css.slice(
      css.indexOf(
        "@media (prefers-reduced-motion: reduce)",
        css.indexOf("@keyframes at-alert-glow"),
      ),
    );
    expect(reduced).toMatch(
      /\.ia-card\.is-disconnected::before,\s*\.ia-card\.is-disconnected::after \{\s*animation: at-alert-glow 23s ease-in-out infinite both !important;/,
    );
    const glow = css.slice(
      css.indexOf("@keyframes at-alert-glow"),
      css.indexOf(
        "@media (prefers-reduced-motion: reduce)",
        css.indexOf("@keyframes at-alert-glow"),
      ),
    );
    expect(glow).not.toMatch(/transform/);
    // O anel tem o mesmo tamanho o tempo todo: só a cor acende e apaga.
    expect(glow.match(/0 0 0 4px/g)).toHaveLength(2);
    expect(glow).not.toMatch(/14px/);
  });
});
