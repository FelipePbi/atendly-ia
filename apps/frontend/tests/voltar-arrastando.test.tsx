// @vitest-environment jsdom
/**
 * Voltar arrastando da borda esquerda (pedido do usuário, 2026-10-18, D-198):
 * numa tela empurrada com voltar, abaixo de 1024 px, o dedo que sai da borda
 * esquerda arrasta a tela e, solto depois de ~35% da largura ou num
 * arremesso, leva ao mesmo destino do botão voltar; antes disso a tela volta
 * ao lugar. Só toque, só na borda, nunca com movimento reduzido, nunca ao
 * lado da lista (1024 px+), nunca sobre conteúdo com rolagem horizontal.
 *
 * jsdom não anima (`element.animate` não existe): soltar aplica o estado
 * final na hora. A fluidez foi conferida no navegador, com toque emulado.
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PushedBar } from "@/shared/layout/PushedBar";
import {
  resetSwipeBackForTests,
  SWIPE_BACK_EDGE_PX,
} from "@/shared/motion/swipeBack";

import { expectNoA11yViolations } from "./support/a11y";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/clientes/c1",
  useRouter: () => ({ push }),
}));

const WIDTH = 390;
let wide = false;
let reduced = false;
let clock = 0;

beforeEach(() => {
  push.mockReset();
  wide = false;
  reduced = false;
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: WIDTH,
  });
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width: 1024px")
      ? wide
      : query.includes("prefers-reduced-motion")
        ? reduced
        : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  resetSwipeBackForTests();
  vi.restoreAllMocks();
});

function Screen({
  backIcon,
  children,
  swipeBack,
}: {
  backIcon?: "chevron-left" | "x";
  children?: React.ReactNode;
  swipeBack?: boolean;
}) {
  return (
    <main id="main-content" tabIndex={-1}>
      <PushedBar
        backHref="/clientes"
        backIcon={backIcon}
        backLabel="Voltar para clientes"
        swipeBack={swipeBack}
        title="Cliente"
      />
      <div data-testid="content">{children ?? <p>Perfil da cliente</p>}</div>
    </main>
  );
}

function pointer(
  type: string,
  target: Element,
  x: number,
  y = 300,
  init: PointerEventInit = {},
) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        isPrimary: true,
        pointerId: 1,
        pointerType: "touch",
        ...init,
      }),
    );
  });
}

/** Arrasto em passos de 16 ms (um quadro), de `from` até `to`. */
async function drag(
  target: Element,
  from: number,
  to: number,
  {
    msPerStep = 16,
    pointerType = "touch",
    steps = 10,
    dy = 0,
  }: {
    msPerStep?: number;
    pointerType?: string;
    steps?: number;
    dy?: number;
  } = {},
) {
  pointer("pointerdown", target, from, 300, { pointerType });
  for (let step = 1; step <= steps; step += 1) {
    clock += msPerStep;
    pointer(
      "pointermove",
      target,
      from + ((to - from) * step) / steps,
      300 + (dy * step) / steps,
      { pointerType },
    );
  }
  clock += msPerStep;
  pointer("pointerup", target, to, 300 + dy, { pointerType });
  // Soltar resolve as "animações" (ausentes no jsdom) num microtask.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function main(): HTMLElement {
  return document.getElementById("main-content") as HTMLElement;
}

describe("voltar arrastando da borda (D-198)", () => {
  test("solto além de 35% da largura, vai para o destino do voltar", async () => {
    render(<Screen />);
    await drag(screen.getByTestId("content"), 4, 200, { msPerStep: 60 });
    expect(push).toHaveBeenCalledWith("/clientes");
  });

  test("enquanto arrasta, a tela segue o dedo e o véu entra por trás, fora da árvore acessível", async () => {
    const { container } = render(<Screen />);
    const content = screen.getByTestId("content");
    pointer("pointerdown", content, 6);
    clock += 16;
    pointer("pointermove", content, 46);
    clock += 16;
    pointer("pointermove", content, 106);
    expect(main().style.transform).toBe("translate3d(100px, 0, 0)");
    expect(main()).toHaveClass("is-swipe-back");
    const scrim = document.querySelector(".swipe-back-scrim");
    expect(scrim).not.toBeNull();
    expect(scrim).toHaveAttribute("aria-hidden", "true");
    expect(scrim?.nextElementSibling).toBe(main());
    // O voltar continua sendo o caminho acessível.
    expect(
      screen.getByRole("link", { name: "Voltar para clientes" }),
    ).toHaveAttribute("href", "/clientes");
    await expectNoA11yViolations(container);
  });

  test("solto antes do limite e devagar, a tela volta ao lugar sem navegar", async () => {
    render(<Screen />);
    await drag(screen.getByTestId("content"), 4, 110, { msPerStep: 60 });
    expect(push).not.toHaveBeenCalled();
    expect(main().style.transform).toBe("");
    expect(main()).not.toHaveClass("is-swipe-back");
    expect(document.querySelector(".swipe-back-scrim")).toBeNull();
  });

  test("um arremesso rápido volta mesmo antes do limite", async () => {
    render(<Screen />);
    // 100 px em 50 ms: 2 px/ms.
    await drag(screen.getByTestId("content"), 4, 104, {
      msPerStep: 5,
      steps: 10,
    });
    expect(push).toHaveBeenCalledWith("/clientes");
  });

  test("toque que não começa na borda esquerda não faz nada", async () => {
    render(<Screen />);
    const content = screen.getByTestId("content");
    await drag(content, SWIPE_BACK_EDGE_PX + 1, 300, { msPerStep: 60 });
    expect(push).not.toHaveBeenCalled();
    expect(main().style.transform).toBe("");
  });

  test("arrasto vertical a partir da borda é rolagem, não gesto", async () => {
    render(<Screen />);
    await drag(screen.getByTestId("content"), 4, 40, { dy: 300 });
    expect(push).not.toHaveBeenCalled();
    expect(main().style.transform).toBe("");
  });

  test("mouse não arrasta a tela (desktop)", async () => {
    render(<Screen />);
    await drag(screen.getByTestId("content"), 4, 300, {
      msPerStep: 60,
      pointerType: "mouse",
    });
    expect(push).not.toHaveBeenCalled();
  });

  test("de 1024 px em diante não liga: a lista está ao lado", async () => {
    wide = true;
    render(<Screen />);
    await drag(screen.getByTestId("content"), 4, 300, { msPerStep: 60 });
    expect(push).not.toHaveBeenCalled();
    expect(main().style.transform).toBe("");
  });

  test("com movimento reduzido não liga: o botão voltar continua", async () => {
    reduced = true;
    render(<Screen />);
    await drag(screen.getByTestId("content"), 4, 300, { msPerStep: 60 });
    expect(push).not.toHaveBeenCalled();
    expect(main().style.transform).toBe("");
  });

  test("toque dentro de conteúdo com rolagem horizontal é da rolagem", async () => {
    render(
      <Screen>
        <div data-testid="strip" style={{ overflowX: "auto" }}>
          <span data-testid="chip">Chip</span>
        </div>
      </Screen>,
    );
    const strip = screen.getByTestId("strip");
    Object.defineProperty(strip, "scrollWidth", { value: 900 });
    Object.defineProperty(strip, "clientWidth", { value: 390 });
    await drag(screen.getByTestId("chip"), 4, 300, { msPerStep: 60 });
    expect(push).not.toHaveBeenCalled();
    expect(main().style.transform).toBe("");
  });

  test("controle deslizante e opt-out explícito não iniciam o gesto", async () => {
    render(
      <Screen>
        <div aria-label="Volume" aria-valuenow={3} role="slider" tabIndex={0}>
          <span data-testid="thumb">•</span>
        </div>
        <div data-swipe-back="off">
          <span data-testid="off">Fora</span>
        </div>
      </Screen>,
    );
    await drag(screen.getByTestId("thumb"), 4, 300, { msPerStep: 60 });
    await drag(screen.getByTestId("off"), 4, 300, { msPerStep: 60 });
    expect(push).not.toHaveBeenCalled();
  });

  test("tela com `x` (formulário) não fecha arrastando, a menos que peça", async () => {
    const { unmount } = render(<Screen backIcon="x" />);
    await drag(screen.getByTestId("content"), 4, 300, { msPerStep: 60 });
    expect(push).not.toHaveBeenCalled();
    unmount();
    render(<Screen backIcon="x" swipeBack />);
    await drag(screen.getByTestId("content"), 4, 300, { msPerStep: 60 });
    expect(push).toHaveBeenCalledWith("/clientes");
  });

  test("segura o touchmove horizontal (senão o navegador assume o toque) e solta o vertical", () => {
    render(<Screen />);
    const content = screen.getByTestId("content");
    pointer("pointerdown", content, 4);
    const touchmove = (x: number, y: number) => {
      const event = new Event("touchmove", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "touches", {
        value: [{ clientX: x, clientY: y }],
      });
      content.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(touchmove(10, 302)).toBe(true);
    expect(touchmove(6, 340)).toBe(false);
  });

  test("a tela que saiu devolve a casca ao lugar", async () => {
    function Host({ show }: { show: boolean }) {
      return (
        <main id="main-content" tabIndex={-1}>
          {show ? (
            <>
              <PushedBar
                backHref="/clientes"
                backLabel="Voltar para clientes"
                title="Cliente"
              />
              <div data-testid="content">Perfil</div>
            </>
          ) : (
            <p>Lista de clientes</p>
          )}
        </main>
      );
    }
    const { rerender } = render(<Host show />);
    await drag(screen.getByTestId("content"), 4, 300, { msPerStep: 60 });
    expect(push).toHaveBeenCalledWith("/clientes");
    // Fora da tela, esperando a rota nova.
    expect(main().style.transform).toBe(`translate3d(${WIDTH}px, 0, 0)`);
    rerender(<Host show={false} />);
    expect(main().style.transform).toBe("");
    expect(main()).not.toHaveClass("is-swipe-back");
    expect(document.querySelector(".swipe-back-scrim")).toBeNull();
  });
});
