// @vitest-environment jsdom
/**
 * Goal112 — o invólucro de lista e detalhe não desloca o painel.
 *
 * Cruzar 1024 px liga ou desliga a divisão. O nó do detalhe tem de continuar
 * o mesmo objeto do DOM (e, portanto, o que a pessoa digitou), a lista só existe
 * com a divisão ligada e, desligada, os invólucros não geram caixa.
 *
 * Diferente da simulação do Goal088, o matchMedia daqui guarda os ouvintes e
 * os chama quando a largura muda: é o que `useWideLayout` escuta.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { ListDetailLayout } from "@/shared/layout/ListDetail";
import { useWideLayout } from "@/shared/layout/useWideLayout";

type Listener = () => void;

function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<Listener>();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        addEventListener: (_type: string, listener: Listener) => {
          listeners.add(listener);
        },
        get matches() {
          return min ? width >= Number(min[1]) : false;
        },
        media: query,
        removeEventListener: (_type: string, listener: Listener) => {
          listeners.delete(listener);
        },
      };
    },
    writable: true,
  });
  return {
    listenerCount: () => listeners.size,
    resize(next: number) {
      width = next;
      act(() => {
        for (const listener of Array.from(listeners)) listener();
      });
    },
  };
}

function Harness({ panelFirst = false }: { panelFirst?: boolean }) {
  const wide = useWideLayout();
  return (
    <ListDetailLayout
      detail={<input aria-label="Nome do detalhe" />}
      list={<p>Itens da lista</p>}
      listLabel="Itens"
      panelFirst={panelFirst}
      split={wide}
    />
  );
}

beforeEach(() => {
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Goal112 ListDetailLayout: o detalhe é o mesmo nó nas duas larguras", () => {
  test.each([
    ["lista à esquerda", false],
    ["painel primeiro", true],
  ] as const)("%s: alternar a divisão mantém o nó e o que foi digitado", async (_name, panelFirst) => {
    const media = installMatchMedia(1280);
    const user = userEvent.setup();
    render(<Harness panelFirst={panelFirst} />);

    const detail = screen.getByLabelText("Nome do detalhe");
    await user.type(detail, "Ana");
    expect(media.listenerCount()).toBeGreaterThan(0);

    media.resize(600);
    expect(screen.getByLabelText("Nome do detalhe")).toBe(detail);
    expect(detail).toHaveValue("Ana");
    expect(detail.isConnected).toBe(true);

    media.resize(1280);
    expect(screen.getByLabelText("Nome do detalhe")).toBe(detail);
    expect(detail).toHaveValue("Ana");

    media.resize(900);
    expect(screen.getByLabelText("Nome do detalhe")).toBe(detail);
    expect(detail).toHaveValue("Ana");
  });

  test("o invólucro do painel também é o mesmo objeto ao cruzar 1024 px", () => {
    const media = installMatchMedia(1280);
    const { container } = render(<Harness />);
    const layout = container.querySelector(".list-detail");
    const panel = container.querySelector(".list-detail-panel");
    expect(layout).not.toBeNull();
    expect(panel).not.toBeNull();

    media.resize(600);
    expect(container.querySelector(".list-detail-flat")).toBe(layout);
    expect(container.querySelector(".list-detail-panel")).toBe(panel);

    media.resize(1280);
    expect(container.querySelector(".list-detail")).toBe(layout);
    expect(container.querySelector(".list-detail-panel")).toBe(panel);
  });
});

describe("Goal112 ListDetailLayout: divisão desligada", () => {
  test("a lista não é montada e os invólucros ficam marcados como sem caixa", () => {
    installMatchMedia(600);
    const { container } = render(<Harness />);

    expect(container.querySelector("aside")).toBeNull();
    expect(screen.queryByText("Itens da lista")).toBeNull();
    expect(container.querySelector(".list-detail")).toBeNull();
    const layout = container.querySelector(".list-detail-flat");
    expect(layout).not.toBeNull();
    expect(layout?.children).toHaveLength(1);
    expect(layout?.firstElementChild).toHaveClass("list-detail-panel");
  });

  test("a lista aparece e perde a marca de sem caixa quando a divisão liga", () => {
    const media = installMatchMedia(600);
    const { container } = render(<Harness />);

    media.resize(1280);

    const list = screen.getByRole("complementary", { name: "Itens" });
    expect(list).toHaveClass("list-detail-list");
    expect(screen.getByText("Itens da lista")).toBeVisible();
    expect(container.querySelector(".list-detail")).not.toBeNull();
    expect(container.querySelector(".list-detail-flat")).toBeNull();
  });

  test("a lista deixa de existir quando a divisão desliga: o ouvinte não vaza", () => {
    const media = installMatchMedia(1280);
    const { container, unmount } = render(<Harness />);
    expect(container.querySelector("aside")).not.toBeNull();

    media.resize(600);
    expect(container.querySelector("aside")).toBeNull();

    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});

describe("Goal112 ListDetailLayout: ordem de foco", () => {
  test("com panelFirst, o detalhe vem antes da lista no DOM, ligada a divisão", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const { container } = render(<Harness panelFirst />);

    const layout = container.querySelector(".list-detail") as HTMLElement;
    expect(layout).toHaveClass("list-detail-panel-first");
    expect(layout.children).toHaveLength(2);
    expect(layout.children[0]).toHaveClass("list-detail-panel");
    expect(layout.children[1]).toHaveClass("list-detail-list");

    await user.tab();
    expect(screen.getByLabelText("Nome do detalhe")).toHaveFocus();
  });

  test("sem panelFirst, a lista vem antes do detalhe", () => {
    installMatchMedia(1280);
    const { container } = render(<Harness />);
    const layout = container.querySelector(".list-detail") as HTMLElement;
    expect(layout.children[0]).toHaveClass("list-detail-list");
    expect(layout.children[1]).toHaveClass("list-detail-panel");
  });
});
