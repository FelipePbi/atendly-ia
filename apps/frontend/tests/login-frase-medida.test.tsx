// @vitest-environment jsdom
/**
 * Pedido de 2026-10-13: no celular, a frase de apoio do login fica quando a
 * tela inteira cabe na altura visível de verdade (`innerHeight`) e sai quando
 * não cabe. Vale para login e cadastro. Tablet e desktop não são medidos (a
 * frase fica sempre).
 */
import { render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ auth: {} }),
  useProductRuntime: () => ({ refreshSession: vi.fn() }),
}));

const { AuthScreen } = await import("@/features/auth/AuthScreen");

function setup({ wide, panel, main, viewport }: { wide: boolean; panel: number; main: number; viewport: number }) {
  vi.stubGlobal("innerHeight", viewport);
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({ matches: wide && query.includes("min-width: 768px"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("entry-panel")) return panel;
    if (this.classList.contains("entry-main")) return main;
    return 0;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("frase de apoio do login medida na altura visível", () => {
  test("cabe: data-support=fits", () => {
    setup({ wide: false, panel: 280, main: 360, viewport: 660 });
    const { container } = render(<AuthScreen scenario="login" />);
    expect(container.querySelector(".entry-shell")).toHaveAttribute("data-support", "fits");
  });

  test("não cabe: data-support=tight", () => {
    setup({ wide: false, panel: 300, main: 380, viewport: 600 });
    const { container } = render(<AuthScreen scenario="login" />);
    expect(container.querySelector(".entry-shell")).toHaveAttribute("data-support", "tight");
  });

  test("tablet e desktop não são medidos", () => {
    setup({ wide: true, panel: 900, main: 900, viewport: 600 });
    const { container } = render(<AuthScreen scenario="login" />);
    expect(container.querySelector(".entry-shell")).not.toHaveAttribute("data-support");
  });

  test("cadastro também mede: cabe, a frase fica; não cabe, sai", () => {
    setup({ wide: false, panel: 260, main: 420, viewport: 760 });
    const fits = render(<AuthScreen scenario="signup" />);
    expect(fits.container.querySelector(".entry-shell")).toHaveAttribute("data-support", "fits");
    fits.unmount();
    vi.restoreAllMocks();
    setup({ wide: false, panel: 300, main: 470, viewport: 660 });
    const tight = render(<AuthScreen scenario="signup" />);
    expect(tight.container.querySelector(".entry-shell")).toHaveAttribute("data-support", "tight");
  });
});
