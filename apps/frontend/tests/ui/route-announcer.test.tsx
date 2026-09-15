// @vitest-environment jsdom
/**
 * RouteAnnouncer — the only thing that tells a screen reader the page changed.
 *
 * A client-side route change replaces the content without reloading, so
 * assistive technology is told nothing unless something says it out loud. This
 * asserts the live region exists, is polite, and carries the new page's name.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/inicio" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

const { RouteAnnouncer } = await import("@/shared/ui/RouteAnnouncer");

describe("RouteAnnouncer", () => {
  beforeEach(() => {
    pathname.current = "/inicio";
    document.title = "";
  });

  test("the announcement is a polite live region, not a visual label", () => {
    render(<RouteAnnouncer />);

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    // Atomic matters: without it a reader may announce only the changed words
    // instead of the whole sentence.
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveTextContent("Página carregada: Início");
  });

  test("each route announces its own name", () => {
    for (const [path, expected] of [
      ["/conversas", "Conversas"],
      ["/agenda", "Agenda"],
      ["/clientes", "Clientes"],
      ["/importacao", "Importação"],
      ["/login", "Entrar"],
      ["/configuracoes/ia", "Configurações"],
    ] as const) {
      pathname.current = path;
      const { unmount } = render(<RouteAnnouncer />);
      expect(screen.getByRole("status"), path).toHaveTextContent(`Página carregada: ${expected}`);
      unmount();
    }
  });

  test("an unmapped route falls back instead of announcing an empty name", () => {
    pathname.current = "/rota-que-nao-existe";
    render(<RouteAnnouncer />);

    expect(screen.getByRole("status")).toHaveTextContent("Página carregada: Atendly");
    expect(document.title).toBe("Atendly");
  });

  test("the document title follows the route, which is what a tab shows", () => {
    pathname.current = "/agenda";
    render(<RouteAnnouncer />);
    expect(document.title).toBe("Agenda — Atendly");
  });
});
