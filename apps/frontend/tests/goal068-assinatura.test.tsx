// @vitest-environment jsdom
/**
 * Goal068/WU-02 — assinatura animada da marca (§2, §5.3): três traços uma vez
 * por sessão na entrada, só o check na sidebar, nada com movimento reduzido
 * ou sem sessionStorage, símbolo nunca incompleto.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "@/shared/layout/AppShell";
import { Brand } from "@/shared/ui/Brand";

const appDir = path.join(__dirname, "..");

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    notifications: {
      summary: vi.fn().mockResolvedValue({
        byLevel: { INFO: 0, ATTENTION: 0, CRITICAL: 0 },
        unreadCount: 0,
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
          checkedAt: "2026-09-16T12:00:00.000Z",
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

function stubMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  });
}

function stubMissingSessionStorage() {
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("sessionStorage indisponível");
    },
  });
}

const realSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "sessionStorage",
);

describe("Brand — assinatura animada", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    if (realSessionStorageDescriptor) {
      Object.defineProperty(
        window,
        "sessionStorage",
        realSessionStorageDescriptor,
      );
    }
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test("entrada: primeira montagem da sessão desenha os três traços com os tempos de 820 ms", () => {
    render(<Brand signature="entry" />);

    const svg = screen
      .getByRole("link", { name: "Atendly — Início" })
      .querySelector("svg.brand-mark");

    expect(svg).toHaveClass("brand-mark--entry");

    const [leg, legRest, check] = Array.from(svg!.querySelectorAll("path"));
    expect(leg).toHaveClass("brand-mark-leg");
    expect(legRest).toHaveClass("brand-mark-leg-rest");
    expect(check).toHaveClass("brand-mark-check");

    // símbolo continua completo (mesmos três traços) mesmo animando
    expect(leg).toHaveAttribute("d", "M6 56L28 9L40.85 36.5");
    expect(legRest).toHaveAttribute("d", "M44.7 44.8L50 56");
    expect(check).toHaveAttribute("d", "M25.5 38L32 44.5L58 21");
  });

  test("entrada: segunda montagem na mesma sessão mostra o símbolo pronto, sem animar de novo", () => {
    render(<Brand signature="entry" />);
    cleanup();

    render(<Brand signature="entry" />);
    const svg = screen
      .getByRole("link", { name: "Atendly — Início" })
      .querySelector("svg.brand-mark");

    expect(svg).not.toHaveClass("brand-mark--entry");
    expect(svg!.querySelectorAll("path.brand-mark-leg")).toHaveLength(0);
  });

  test("sidebar: primeira montagem da sessão anima só o check, em 420 ms, com chave própria em sessionStorage", () => {
    render(<Brand signature="check" />);

    const svg = screen
      .getByRole("link", { name: "Atendly — Início" })
      .querySelector("svg.brand-mark");

    expect(svg).toHaveClass("brand-mark--check");
    expect(svg!.querySelectorAll("path.brand-mark-leg")).toHaveLength(0);
    expect(svg!.querySelectorAll("path.brand-mark-leg-rest")).toHaveLength(0);
    expect(svg!.querySelector("path.brand-mark-check")).not.toBeNull();

    expect(window.sessionStorage.getItem("atendly:brand-signature-check")).toBe(
      "1",
    );
    expect(
      window.sessionStorage.getItem("atendly:brand-signature-entry"),
    ).toBeNull();
  });

  test("sidebar: segunda montagem na mesma sessão não anima", () => {
    render(<Brand signature="check" />);
    cleanup();

    render(<Brand signature="check" />);
    const svg = screen
      .getByRole("link", { name: "Atendly — Início" })
      .querySelector("svg.brand-mark");

    expect(svg).not.toHaveClass("brand-mark--check");
  });

  test("entrada e sidebar usam chaves de sessão independentes: tocar uma não consome a outra", () => {
    render(<Brand signature="entry" />);
    cleanup();

    render(<Brand signature="check" />);
    const svg = screen
      .getByRole("link", { name: "Atendly — Início" })
      .querySelector("svg.brand-mark");

    expect(svg).toHaveClass("brand-mark--check");
  });

  test("com prefers-reduced-motion: reduce, a assinatura não toca e o símbolo aparece completo", () => {
    stubMatchMedia(true);

    render(<Brand signature="entry" />);
    const svg = screen
      .getByRole("link", { name: "Atendly — Início" })
      .querySelector("svg.brand-mark");

    expect(svg).not.toHaveClass("brand-mark--entry");
    expect(svg!.querySelectorAll("path")).toHaveLength(3);
    expect(
      window.sessionStorage.getItem("atendly:brand-signature-entry"),
    ).toBeNull();
  });

  test("sem sessionStorage disponível, a assinatura não toca e o símbolo aparece parado", () => {
    stubMissingSessionStorage();

    render(<Brand signature="entry" />);
    const svg = screen
      .getByRole("link", { name: "Atendly — Início" })
      .querySelector("svg.brand-mark");

    expect(svg).not.toHaveClass("brand-mark--entry");
    expect(svg!.querySelectorAll("path")).toHaveLength(3);
  });

  test("sem signature, o símbolo é estático (uso atual em telas internas)", () => {
    render(<Brand />);
    const svg = screen
      .getByRole("link", { name: "Atendly — Início" })
      .querySelector("svg.brand-mark");

    expect(svg?.getAttribute("class")).toBe("brand-mark");
  });
});

describe("AppShell — a sidebar de verdade passa signature=\"check\" para Brand", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    if (realSessionStorageDescriptor) {
      Object.defineProperty(
        window,
        "sessionStorage",
        realSessionStorageDescriptor,
      );
    }
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test("a marca da sidebar anima o check na primeira montagem da sessão", async () => {
    render(
      <AppShell active="inicio" title="Início">
        <p>Conteúdo</p>
      </AppShell>,
    );

    const sidebarBrand = document.querySelector(".sidebar-brand .brand-mark");
    expect(sidebarBrand).not.toBeNull();
    expect(sidebarBrand).toHaveClass("brand-mark--check");
    expect(
      window.sessionStorage.getItem("atendly:brand-signature-check"),
    ).toBe("1");
  });

  test("o cabeçalho do celular nunca anima o check: a sidebar consome a sessão primeiro", () => {
    render(
      <AppShell active="inicio" title="Início">
        <p>Conteúdo</p>
      </AppShell>,
    );

    const mobileHeaderBrand = document.querySelector("header .brand-mark");
    expect(mobileHeaderBrand).not.toBeNull();
    expect(mobileHeaderBrand).not.toHaveClass("brand-mark--check");
  });

  test("segunda montagem de AppShell na mesma sessão: a sidebar não anima de novo", () => {
    render(
      <AppShell active="inicio" title="Início">
        <p>Conteúdo</p>
      </AppShell>,
    );
    cleanup();

    render(
      <AppShell active="inicio" title="Início">
        <p>Conteúdo</p>
      </AppShell>,
    );
    const sidebarBrand = document.querySelector(".sidebar-brand .brand-mark");
    expect(sidebarBrand).not.toBeNull();
    expect(sidebarBrand).not.toHaveClass("brand-mark--check");
  });
});

describe("atendly.css — regras da assinatura", () => {
  const css = readFileSync(
    path.join(appDir, "src/shared/styles/atendly.css"),
    "utf8",
  );

  test("os três traços da entrada somam 820 ms com os tempos do Marca.dc.html", () => {
    expect(css).toMatch(
      /\.brand-mark--entry \.brand-mark-leg\s*\{[^}]*animation:\s*at-brand-draw 0\.46s[^;]*0s forwards/,
    );
    expect(css).toMatch(
      /\.brand-mark--entry \.brand-mark-check\s*\{[^}]*animation:\s*at-brand-draw 0\.38s[^;]*0\.34s forwards/,
    );
    expect(css).toMatch(
      /\.brand-mark--entry \.brand-mark-leg-rest\s*\{[^}]*animation:\s*at-brand-draw 0\.22s[^;]*0\.6s forwards/,
    );
  });

  test("a sidebar anima só o check, em 420 ms", () => {
    expect(css).toMatch(
      /\.brand-mark--check \.brand-mark-check\s*\{[^}]*animation:\s*at-brand-draw 0\.42s/,
    );
  });

  test("prefers-reduced-motion: reduce neutraliza as animações da assinatura", () => {
    const reducedMotionBlock = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.brand-mark--entry[\s\S]*?\}\s*\}/,
    );
    expect(reducedMotionBlock).not.toBeNull();
    expect(reducedMotionBlock![0]).toMatch(/animation:\s*none/);
    expect(reducedMotionBlock![0]).toMatch(/stroke-dashoffset:\s*0/);
  });
});
