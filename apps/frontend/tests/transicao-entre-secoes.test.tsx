// @vitest-environment jsdom
/**
 * Transição entre seções (vídeo de 2026-10-16: "a transição é seca e
 * direta"). Trocar de tela pelo menu principal anima a área de conteúdo: a
 * tela que sai sobe um pouco e some, a nova entra subindo com fade, e a casca
 * (barra lateral, cabeçalho, barra inferior) fica parada.
 *
 * O que esta suíte prova:
 *
 * 1. o clique num destino de outra seção vira uma View Transition `section`,
 *    também com movimento reduzido (só fade, D-173), e navega pelo router;
 * 2. dentro da mesma seção o clique segue o caminho de sempre: quem anima é
 *    a própria tela (troca de cliente, de conversa, de agendamento);
 * 3. sem suporte à API, o clique segue o caminho de sempre;
 * 4. o CSS dá nome só à área de conteúdo, e o fade de movimento reduzido não
 *    desloca nada.
 *
 * O movimento em si não é provado aqui: jsdom não anima. Ele foi conferido no
 * navegador, com e sem movimento reduzido.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import { AppShell } from "@/shared/layout/AppShell";
import { useShellConfig } from "@/shared/layout/ShellConfig";

const navigation = vi.hoisted(() => ({ pathname: "/clientes" }));
// Estável como o router do App Router: a casca não reinscreve o ouvinte.
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const routerPush = router.push;

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => router,
}));

function goTo(pathname: string) {
  navigation.pathname = pathname;
  window.history.replaceState(null, "", pathname);
}

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn() },
    notifications: {
      summary: async () => ({
        byLevel: { ATTENTION: 0, CRITICAL: 0, INFO: 0 },
        openConditionsCount: 0,
        unreadCount: 0,
      }),
    },
    status: { get: () => new Promise(() => undefined) },
  }),
  useProductRuntime: () => ({
    session: {
      businessProfile: { businessName: "Studio Marina" },
      tenant: { name: "Studio Marina" },
      user: { email: "dona@studiomarina.com.br", name: "Marina Alves" },
    },
    setUnauthenticated: vi.fn(),
  }),
}));

function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: /prefers-reduced-motion:\s*reduce/.test(query) && reduce,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
    writable: true,
  });
}

/** Simula a API e guarda as classes de `<html>` no momento da foto. */
function supportViewTransitions(): string[][] {
  const snapshots: string[][] = [];
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (update: () => Promise<void> | void) => {
      snapshots.push(Array.from(document.documentElement.classList));
      void update();
      return { finished: Promise.resolve() };
    },
  });
  return snapshots;
}

/**
 * Depois da casca, na captura: diz se ela tomou o clique para si e impede
 * que o jsdom tente navegar de verdade.
 */
function watchClicks(): { prevented: boolean[] } {
  const seen = { prevented: [] as boolean[] };
  const listener = (event: MouseEvent) => {
    seen.prevented.push(event.defaultPrevented);
    event.preventDefault();
  };
  document.addEventListener("click", listener, true);
  cleanups.push(() => document.removeEventListener("click", listener, true));
  return seen;
}

const cleanups: (() => void)[] = [];

function renderShell() {
  render(
    <AppShell active="clientes" module="directory" title="Clientes">
      <p>Conteúdo</p>
    </AppShell>,
  );
  // A barra lateral; a barra inferior do celular tem o mesmo nome e a mesma regra.
  const [sidebar] = screen.getAllByRole("navigation", {
    name: "Navegação principal",
  });
  return within(sidebar);
}

beforeEach(() => {
  goTo("/clientes");
  setReducedMotion(false);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(document, "startViewTransition");
  document.documentElement.className = "";
});

describe("trocar de seção pelo menu anima a área de conteúdo", () => {
  test.each([
    ["sem", false],
    ["com", true],
  ])(
    "%s movimento reduzido, outra seção vira a transição `section`",
    async (_label, reduce) => {
      setReducedMotion(reduce);
      const snapshots = supportViewTransitions();
      const nav = renderShell();
      const clicks = watchClicks();

      await userEvent.click(nav.getByRole("link", { name: "Agenda" }));

      expect(clicks.prevented).toEqual([true]);
      expect(routerPush).toHaveBeenCalledWith("/agenda");
      expect(snapshots).toEqual([
        expect.arrayContaining(["is-view-transition", "vt-section"]),
      ]);
      // A rota nova monta e a foto nova é tirada; a classe sai depois.
      goTo("/agenda");
      await waitFor(() =>
        expect(document.documentElement).not.toHaveClass("vt-section"),
      );
    },
  );

  test("dentro da mesma seção, o clique segue o caminho de sempre", async () => {
    goTo("/clientes/detalhes");
    const snapshots = supportViewTransitions();
    const nav = renderShell();
    const clicks = watchClicks();

    await userEvent.click(nav.getByRole("link", { name: "Clientes" }));

    expect(clicks.prevented).toEqual([false]);
    expect(snapshots).toEqual([]);
    expect(routerPush).not.toHaveBeenCalled();
  });

  test("sem suporte à API, o clique segue o caminho de sempre", async () => {
    const nav = renderShell();
    const clicks = watchClicks();

    await userEvent.click(nav.getByRole("link", { name: "Agenda" }));

    expect(clicks.prevented).toEqual([false]);
    expect(routerPush).not.toHaveBeenCalled();
  });
});

function RevenueStandIn() {
  useShellConfig({ active: "faturamento", title: "Faturamento" });
  return <p>Faturamento</p>;
}

function HomeStandIn() {
  useShellConfig({ active: "inicio", module: "dashboard", title: "Início" });
  return <p>Início</p>;
}

describe("a barra fica montada na troca de seção (D-209)", () => {
  test("do Faturamento para o Início, a barra é o mesmo elemento e nunca sai do DOM", () => {
    goTo("/faturamento");
    const { rerender } = render(
      <PlatformLayout>
        <RevenueStandIn />
      </PlatformLayout>,
    );
    const before = screen.getAllByRole("navigation", {
      name: "Navegação principal",
    });
    // Barra lateral e barra inferior (as duas existem no DOM; o CSS escolhe).
    expect(before).toHaveLength(2);
    const removed: Node[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) removed.push(...record.removedNodes);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => observer.disconnect());

    goTo("/inicio");
    rerender(
      <PlatformLayout>
        <HomeStandIn />
      </PlatformLayout>,
    );
    observer.takeRecords().forEach((record) => {
      removed.push(...record.removedNodes);
    });

    const after = screen.getAllByRole("navigation", {
      name: "Navegação principal",
    });
    expect(after).toEqual(before);
    expect(
      removed.some((node) => before.some((nav) => node.contains(nav))),
    ).toBe(false);
    expect(
      within(after[1]).getByRole("link", { name: "Início" }),
    ).toHaveAttribute("aria-current", "page");
  });
});

describe("o CSS da transição entre seções", () => {
  const css = readFileSync(
    path.join(__dirname, "../src/shared/styles/avenly-motion.css"),
    "utf8",
  );
  const reduced = css
    .split("@media (prefers-reduced-motion: reduce) {")
    .slice(1)
    .join("\n");

  function body(source: string, selector: string): string {
    const at = source.indexOf(selector);
    expect(at, selector).toBeGreaterThan(-1);
    const open = source.indexOf("{", at);
    return source.slice(open, source.indexOf("}", open));
  }

  test("só a área de conteúdo ganha nome; dentro dela, só os avisos", () => {
    expect(body(css, "html.vt-section #main-content {")).toMatch(
      /view-transition-name:\s*app-main/,
    );
    // Os avisos e o lembrete do modo sandbox (D-199) ficam parados.
    expect(
      body(
        css,
        "html.vt-section #main-content *:not(.shell-status-banner, .shell-sandbox-chip)",
      ),
    ).toMatch(/view-transition-name:\s*none !important/);
  });

  test("a área de conteúdo é recortada acima da barra inferior (D-209)", () => {
    // A foto de `#main-content` é a do elemento inteiro, mais alta que a
    // janela, e o grupo nomeado é desenhado acima do root, onde a barra
    // está. Recortado na janela menos a barra, o conteúdo nunca a cobre.
    const clip = "html:has(.app-frame > nav)::view-transition-group(app-main) {";
    const phone = css
      .split("@media (max-width: 1099px) {")
      .slice(1)
      .find((rest) => rest.includes(clip));
    expect(phone, "media de até 1099 px").toBeDefined();
    expect(body(phone ?? "", clip)).toMatch(
      /height:\s*calc\(100dvh - 65px - env\(safe-area-inset-bottom\)\);\s*overflow:\s*clip/,
    );
    const wide = css
      .split("@media (min-width: 768px) and (max-width: 1099px) {")
      .slice(1)
      .find((rest) => rest.includes(clip));
    expect(wide, "media de 768 a 1099 px").toBeDefined();
    expect(body(wide ?? "", clip)).toMatch(
      /height:\s*calc\(100dvh - 81px - env\(safe-area-inset-bottom\)\)/,
    );
    // As alturas são as da barra em `avenly.css`.
    const shell = readFileSync(
      path.join(__dirname, "../src/shared/styles/avenly.css"),
      "utf8",
    );
    expect(shell).toMatch(
      /@media \(max-width: 1099px\) \{[\s\S]*?:where\(\.app-frame > nav\) \{[^}]*height: calc\(65px \+ env\(safe-area-inset-bottom\)\)/,
    );
    expect(shell).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 1099px\) \{[\s\S]*?:where\(\.app-frame > nav\) \{\s*height: calc\(81px \+ env\(safe-area-inset-bottom\)\)/,
    );
    // Dar nome à barra não serve: o WebKit desenha vazia a foto nova de um
    // elemento fixo.
    expect(css).not.toMatch(/\.app-frame > nav\s*\{[^}]*view-transition-name/);
  });

  test("com movimento reduzido, a tela antiga aparece e a troca é só fade", () => {
    expect(
      body(reduced, "html.vt-section::view-transition-old(app-main)"),
    ).toMatch(/display:\s*block !important/);
    expect(reduced).toMatch(
      /html\.vt-section::view-transition-old\(app-main\)\s*\{[^}]*animation:\s*motion-fade-out[^;]*!important/,
    );
    expect(reduced).toMatch(
      /html\.vt-section::view-transition-new\(app-main\)\s*\{[^}]*animation:\s*motion-fade-in[^;]*!important/,
    );
  });
});
