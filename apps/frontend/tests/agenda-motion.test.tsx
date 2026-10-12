// @vitest-environment jsdom
/**
 * Transições da Agenda (pedido do usuário, 2026-10-12: "transição suave e
 * animada, sem nada exagerado, algo fluido"). A base é reutilizável
 * (`src/shared/motion`, `avenly-motion.css`); aqui fica a regra:
 *
 * - os tempos e as curvas vêm dos tokens de `tokens.css`, nada acima de
 *   320 ms e nada elástico;
 * - `prefers-reduced-motion: reduce` desliga tudo: as regras CSS, os
 *   pseudo-elementos das View Transitions e o próprio disparo da API;
 * - sem a API, `runViewTransition` aplica a atualização na hora;
 * - a transição de rota só intercepta links da própria seção e nunca muda a
 *   ordem do DOM: a tela continua dentro de `.motion-page`;
 * - a folha modal continua acessível e fecha com Esc e toque fora, e o foco
 *   volta a quem a abriu; o mini calendário escolhe o dia e fecha.
 *
 * jsdom não anima: a suavidade (CLS 0, quadros sem salto) foi medida no
 * navegador, em 390×844 e 1366×768, com e sem movimento reduzido.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AgendaCalendarSheet } from "@/features/agenda/AgendaCalendarSheet";
import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import {
  directionBetween,
  PageTransition,
} from "@/shared/motion/PageTransition";
import { prefersReducedMotion } from "@/shared/motion/reducedMotion";
import { SheetCloseContext, useSheetClose } from "@/shared/motion/sheetClose";
import {
  runViewTransition,
  supportsViewTransition,
  VIEW_TRANSITION_CLASS,
} from "@/shared/motion/viewTransition";

import { expectNoA11yViolations } from "./support/a11y";

const push = vi.fn();
let pathname = "/agenda";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      listAppointments: () => Promise.resolve([]),
      listAvailabilityExceptions: () => Promise.resolve([]),
      listTimeBlocks: () => Promise.resolve([]),
    },
  }),
}));

const stylesDir = path.join(__dirname, "../src/shared/styles");
const motionCss = readFileSync(
  path.join(stylesDir, "avenly-motion.css"),
  "utf8",
);
const tokensCss = readFileSync(path.join(stylesDir, "tokens.css"), "utf8");
const globalsCss = readFileSync(
  path.join(__dirname, "../src/app/globals.css"),
  "utf8",
);

function reducedMotionBlock(css: string): string {
  const start = css.indexOf("@media (prefers-reduced-motion: reduce) {");
  expect(start).toBeGreaterThan(-1);
  return css.slice(start);
}

type FakeTransition = { finished: Promise<void>; resolve: () => void };

/** `document.startViewTransition` de mentira: chama a atualização e devolve `finished` sob controle do teste. */
function stubViewTransition(): {
  calls: FakeTransition[];
  restore: () => void;
} {
  const calls: FakeTransition[] = [];
  const target = document as unknown as { startViewTransition?: unknown };
  target.startViewTransition = (update: () => void | Promise<void>) => {
    let resolve!: () => void;
    const finished = new Promise<void>((done) => {
      resolve = done;
    });
    const call = { finished, resolve };
    calls.push(call);
    // Como o navegador: a atualização roda já; `finished` só quando a animação acabar (o teste decide).
    void update();
    return { finished };
  };
  return {
    calls,
    restore: () => {
      delete target.startViewTransition;
    },
  };
}

function stubMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }));
}

beforeEach(() => {
  push.mockReset();
  pathname = "/agenda";
  window.history.replaceState({}, "", "/agenda");
  stubMatchMedia(false);
});

afterEach(() => {
  document.documentElement.className = "";
});

describe("linguagem de movimento (avenly-motion.css)", () => {
  test("entra em globals.css depois dos tokens", () => {
    expect(globalsCss).toMatch(
      /@import "\.\.\/shared\/styles\/avenly-motion\.css";/,
    );
    expect(globalsCss.indexOf("tokens.css")).toBeLessThan(
      globalsCss.indexOf("avenly-motion.css"),
    );
  });

  test("usa só os tempos e as curvas dos tokens, e nenhum passa de 320 ms", () => {
    const durations = tokensCss.match(/--at-duration-[a-z]+: (\d+)ms/g) ?? [];
    expect(durations.length).toBeGreaterThan(0);
    for (const declaration of durations) {
      expect(Number(declaration.match(/(\d+)ms/)![1])).toBeLessThanOrEqual(320);
    }
    const rules = motionCss
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // A linha de espera é um laço de 1 s, não uma transição: fica fora da régua.
      .replace(/^.*motion-waiting-bar.*$/gm, "");
    // Nenhuma duração escrita à mão: toda `animation:`/`transition:` é por token.
    expect(rules).not.toMatch(/(animation|transition):[^;]*\d+m?s/);
    expect(rules).toMatch(/var\(--at-duration-(fast|base|moderate)\)/);
    expect(rules).toMatch(/var\(--at-ease-standard\)/);
    expect(rules).toMatch(/var\(--at-ease-exit\)/);
    // Deslocamentos pequenos: 4, 8, 16 e 32 px; nada elástico.
    expect(rules).toMatch(/--motion-shift-md: 16px/);
    expect(rules).not.toMatch(/cubic-bezier\([^)]*,\s*1\.[1-9]/);
  });

  test("tem os utilitários de entrada e as View Transitions nomeadas", () => {
    expect(motionCss).toMatch(/\.motion-enter \{\s*animation: motion-rise-in/);
    expect(motionCss).toMatch(
      /\.motion-page \{\s*view-transition-name: page-content/,
    );
    expect(motionCss).toMatch(/\.chat-sheet \{\s*view-transition-name: sheet/);
    expect(motionCss).toMatch(/::view-transition \{\s*pointer-events: none/);
    expect(motionCss).toMatch(
      /::view-transition-group\(root\) \{\s*animation: none/,
    );
    expect(motionCss).toMatch(
      /html\.vt-nav-forward::view-transition-new\(page-content\)/,
    );
    expect(motionCss).toMatch(
      /html\.vt-step-next::view-transition-new\(agenda-calendar-days\)/,
    );
    expect(motionCss).toMatch(
      /::view-transition-old\(sheet\) \{\s*animation: motion-sheet-out/,
    );
  });

  test("com prefers-reduced-motion: reduce nada se move, nem os pseudo-elementos", () => {
    const reduced = reducedMotionBlock(motionCss);
    expect(reduced).toMatch(/\.motion-enter,[\s\S]*?\{\s*animation: none;/);
    expect(reduced).toMatch(
      /\.agenda-page \.week-map,[\s\S]*?\{\s*animation: none;/,
    );
    expect(reduced).toMatch(
      /::view-transition-group\(\*\),\s*::view-transition-image-pair\(\*\),\s*::view-transition-old\(\*\),\s*::view-transition-new\(\*\) \{\s*animation: none !important;/,
    );
    // E o bloqueio global de tokens.css continua zerando o resto.
    expect(reducedMotionBlock(tokensCss)).toMatch(
      /animation-duration: 0\.001ms !important/,
    );
  });
});

describe("runViewTransition", () => {
  test("sem a API, aplica a atualização na hora e resolve", async () => {
    expect(supportsViewTransition()).toBe(false);
    const update = vi.fn();
    const done = runViewTransition(update, { types: ["sheet-close"] });
    expect(update).toHaveBeenCalledTimes(1);
    expect(
      document.documentElement.classList.contains(VIEW_TRANSITION_CLASS),
    ).toBe(false);
    await done;
  });

  test("com a API, marca <html> com o tipo enquanto a transição roda e limpa ao fim", async () => {
    const stub = stubViewTransition();
    const update = vi.fn();
    const done = runViewTransition(update, { types: ["nav-forward"] });
    expect(stub.calls).toHaveLength(1);
    expect(
      document.documentElement.classList.contains("is-view-transition"),
    ).toBe(true);
    expect(document.documentElement.classList.contains("vt-nav-forward")).toBe(
      true,
    );
    expect(update).toHaveBeenCalledTimes(1);
    stub.calls[0].resolve();
    await done;
    expect(document.documentElement.className).toBe("");
    stub.restore();
  });

  test("com movimento reduzido, nem chama a API", async () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    const stub = stubViewTransition();
    const update = vi.fn();
    await runViewTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(stub.calls).toHaveLength(0);
    stub.restore();
  });
});

describe("PageTransition (template da seção)", () => {
  test("a direção vem da profundidade da rota", () => {
    expect(directionBetween("/agenda", "/agenda/agendamento")).toBe("forward");
    expect(directionBetween("/agenda/agendamento", "/agenda")).toBe("back");
    expect(directionBetween("/agenda/agendamento", "/agenda/cancelar")).toBe(
      "fade",
    );
  });

  test("envolve a tela sem mudar a ordem do conteúdo nem a navegação", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PageTransition scope="/agenda">
        <h1>Agenda</h1>
        <a href="/agenda/agendamento?id=1">Abrir</a>
        <a href="/clientes">Clientes</a>
      </PageTransition>,
    );
    const page = container.querySelector(".motion-page");
    expect(page).not.toBeNull();
    expect(Array.from(page!.children).map((child) => child.tagName)).toEqual([
      "H1",
      "A",
      "A",
    ]);
    // Sem a API o link segue o caminho de sempre: nada interceptado.
    const open = screen.getByRole("link", { name: "Abrir" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    open.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(push).not.toHaveBeenCalled();
    await user.tab();
    expect(open).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  test("com a API, o link da seção navega dentro da transição com a direção certa", async () => {
    const stub = stubViewTransition();
    render(
      <PageTransition scope="/agenda">
        <a href="/agenda/agendamento?id=1">Abrir</a>
        <a href="/agenda?dia=2026-10-13">Mesma tela</a>
        <a href="/clientes">Clientes</a>
        <a data-motion="none" href="/agenda/novo">
          Sem transição
        </a>
      </PageTransition>,
    );
    const click = (name: string) => {
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      screen.getByRole("link", { name }).dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(click("Abrir")).toBe(true);
    expect(push).toHaveBeenCalledWith("/agenda/agendamento?id=1");
    expect(document.documentElement.classList.contains("vt-nav-forward")).toBe(
      true,
    );
    // A tela nova monta: o template remonta com outro pathname.
    pathname = "/agenda/agendamento";
    act(() => {
      stub.calls[0].resolve();
    });
    await act(async () => {
      await stub.calls[0].finished;
    });
    expect(document.documentElement.className).toBe("");
    // Só a query, outra seção ou `data-motion="none"`: navegação de sempre.
    push.mockClear();
    expect(click("Mesma tela")).toBe(false);
    expect(click("Clientes")).toBe(false);
    expect(click("Sem transição")).toBe(false);
    expect(push).not.toHaveBeenCalled();
    stub.restore();
  });

  test("com movimento reduzido o link não é interceptado", () => {
    stubMatchMedia(true);
    const stub = stubViewTransition();
    render(
      <PageTransition scope="/agenda">
        <a href="/agenda/agendamento?id=1">Abrir</a>
      </PageTransition>,
    );
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByRole("link", { name: "Abrir" }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(stub.calls).toHaveLength(0);
    stub.restore();
  });
});

function Opener({ onClose }: { onClose: () => void }) {
  const close = useSheetClose();
  return (
    <button onClick={() => close?.(onClose)} type="button">
      Concluir
    </button>
  );
}

describe("ChatSheetShell com saída animada", () => {
  test("continua um diálogo acessível, fecha por Esc e devolve o foco", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Harness() {
      return (
        <>
          <button type="button">Abrir folha</button>
          <ChatSheetShell onClose={onClose} title="Ações">
            <button type="button">Primeira ação</button>
            <button type="button">Segunda ação</button>
          </ChatSheetShell>
        </>
      );
    }
    const { container, unmount } = render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Ações" });
    expect(
      within(dialog).getByRole("button", { name: "Primeira ação" }),
    ).toHaveFocus();
    await expectNoA11yViolations(container);
    await user.keyboard("{Escape}");
    // Sem a API o fechamento é imediato e síncrono, como antes.
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("toque fora fecha e o fechamento pelo conteúdo passa pela mesma saída", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const after = vi.fn();
    render(
      <ChatSheetShell onClose={onClose} title="Ações">
        <Opener onClose={after} />
      </ChatSheetShell>,
    );
    await user.click(screen.getByRole("button", { name: "Concluir" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    await user.click(document.querySelector(".chat-sheet-wrap") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("com a API, fechar roda numa View Transition do tipo sheet-close", async () => {
    const stub = stubViewTransition();
    const onClose = vi.fn();
    render(
      <ChatSheetShell onClose={onClose} title="Ações">
        <Opener onClose={() => {}} />
      </ChatSheetShell>,
    );
    await userEvent.setup().keyboard("{Escape}");
    expect(stub.calls).toHaveLength(1);
    expect(document.documentElement.classList.contains("vt-sheet-close")).toBe(
      true,
    );
    stub.calls[0].resolve();
    await act(async () => {
      await stub.calls[0].finished;
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.documentElement.className).toBe("");
    stub.restore();
  });

  test("fora de uma folha, useSheetClose devolve null", () => {
    function Probe() {
      const close = useSheetClose();
      return <output>{close === null ? "sem folha" : "com folha"}</output>;
    }
    const { unmount } = render(<Probe />);
    expect(screen.getByText("sem folha")).toBeVisible();
    unmount();
    render(
      <SheetCloseContext.Provider value={() => {}}>
        <Probe />
      </SheetCloseContext.Provider>,
    );
    expect(screen.getByText("com folha")).toBeVisible();
  });
});

describe("mini calendário da Agenda", () => {
  test("escolher um dia fecha a folha e move a Agenda; o passo de mês troca a grade", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onPick = vi.fn<(date: Date) => void>();
    const { container } = render(
      <AgendaCalendarSheet
        avenly
        focusedDate={new Date(2026, 9, 12)}
        onClose={onClose}
        onPick={onPick}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Calendário" });
    await expectNoA11yViolations(container);
    await user.click(
      within(dialog).getByRole("button", { name: "Ver próximo mês" }),
    );
    expect(screen.getByText("Novembro 2026")).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: /^domingo, 15 de novembro/ }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].getDate()).toBe(15);
    await user.click(
      within(dialog).getByRole("button", { name: "Ir para hoje" }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPick).toHaveBeenCalledTimes(2);
  });

  test("com a API, o passo de mês desliza na direção do passo", async () => {
    const stub = stubViewTransition();
    const user = userEvent.setup();
    render(
      <AgendaCalendarSheet
        avenly
        focusedDate={new Date(2026, 9, 12)}
        onClose={() => {}}
        onPick={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Ver mês anterior" }));
    expect(stub.calls).toHaveLength(1);
    expect(document.documentElement.classList.contains("vt-step-prev")).toBe(
      true,
    );
    stub.calls[0].resolve();
    await act(async () => {
      await stub.calls[0].finished;
    });
    expect(screen.getByText("Setembro 2026")).toBeVisible();
    expect(document.documentElement.className).toBe("");
    stub.restore();
  });
});
