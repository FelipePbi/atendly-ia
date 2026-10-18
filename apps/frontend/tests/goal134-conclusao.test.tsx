// @vitest-environment jsdom
/**
 * Goal134 (WU-01): a importação concluída da etapa `importacao` do onboarding
 * é o quadro 2.I10.
 *
 * O que esta suíte prova:
 *
 * - na moldura `onboarding`, com `history`, a tela mostra "Importação
 *   concluída" como único `h1`, a descrição do quadro e o selo decorativo,
 *   sem `ImportHistoryCard` e sem o eyebrow "Importação";
 * - há uma pílula por categoria com `imported` maior que 0, na ordem de
 *   `HISTORY_CATEGORY_ORDER`, com o texto curto, no singular quando é 1, e o
 *   nome inteiro em texto oculto; "Horários" sem número; categoria com
 *   `imported` 0 sem pílula;
 * - a nota de pendência e de falha só existe quando há pendência ou falha;
 * - o aviso de sucesso de `stepAfterImport` não aparece; os dois que mudam o
 *   destino ficam, com o texto e o `role` de hoje, e o erro continua `alert`;
 * - "Continuar" faz o mesmo pedido, vai ao mesmo destino e mostra "Abrindo..."
 *   enquanto ocupado; a nota do rodapé mostra o caminho real de cada largura;
 * - na moldura `platform`, o histórico (I1) e as outras telas ficam como hoje;
 * - o CSS usa classes novas, escopadas, e só anima com movimento permitido.
 */

import { join } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ImportHistory, ImportState, OnboardingState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const getImportState = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout: vi.fn().mockResolvedValue(undefined) },
    calendar: { connectIntegration: vi.fn() },
    migration: {
      getImportProgress: vi.fn(),
      getImportState,
      startImport: vi.fn(),
    },
    onboarding: { get: getOnboarding, update: vi.fn() },
    settings: { get: () => new Promise<never>(() => undefined) },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn().mockResolvedValue(null),
    setUnauthenticated: vi.fn(),
  }),
}));

import { HISTORY_CATEGORY_ORDER, historyPillLabel } from "@/features/imports/labels";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

import { expectNoA11yViolations } from "./support/a11y";
import { readLightStylesheet } from "./support/stylesheet";

type Category = ImportHistory["categories"][number];

function entry(
  category: Category["category"],
  imported: number,
  overrides: Partial<Category> = {},
): Category {
  return {
    category,
    discovered: imported,
    failed: 0,
    imported,
    limitationCode: null,
    needsReview: 0,
    pending: 0,
    skipped: 0,
    sourceSupported: true,
    ...overrides,
  };
}

/** As cinco categorias do quadro 2.I10, como a captura as devolve. */
function quadroCategories(): Category[] {
  return [
    entry("SERVICE", 12),
    entry("CUSTOMER", 386),
    entry("FUTURE_APPOINTMENT", 42),
    entry("PAST_APPOINTMENT", 1400),
    entry("AVAILABILITY", 6),
  ];
}

function historyFixture(
  categories: Category[] = quadroCategories(),
  overrides: Partial<ImportHistory> = {},
): ImportHistory {
  const counts = { failed: 0, imported: 0, needsReview: 0, pending: 0, skipped: 0 };
  for (const category of categories) {
    counts.failed += category.failed;
    counts.imported += category.imported;
  }
  return {
    categories,
    completedAt: "2026-09-18T13:42:00.000Z",
    completedBy: "user-1",
    counts,
    finishedAt: "2026-09-18T13:42:00.000Z",
    pendingAcceptance: null,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: null,
    startedAt: "2026-09-18T13:38:00.000Z",
    status: "COMPLETED",
    ...overrides,
  };
}

function doneState(history: ImportHistory = historyFixture()): ImportState {
  return {
    history,
    right: { available: false, completedAt: history.completedAt, sessionId: null },
    session: null,
  };
}

function onboardingState(
  overrides: Partial<OnboardingState> = {},
): OnboardingState {
  return {
    ai: { tone: null },
    availability: null,
    business: null,
    calendar: { integration: null, source: "AVENLY", timezone: "America/Sao_Paulo" },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
    ...overrides,
  };
}

const serviceDone: Partial<OnboardingState> = {
  service: {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 60,
    id: "svc-1",
    name: "Corte",
    needsReview: false,
    price: 100,
    priceType: "FIXED",
  },
};
const availabilityDone: Partial<OnboardingState> = {
  availability: {
    customerChangeMinNoticeMinutes: 0,
    granularityMinutes: 30,
    maxLeadDays: 90,
    minLeadMinutes: 0,
    rules: [
      { active: true, dayOfWeek: 1, endTime: "18:00", id: "rule-1", startTime: "09:00" },
    ],
    timezone: "America/Sao_Paulo",
  },
};
/** Com serviço e horários ativos, `stepAfterImport` sai em `demonstracao-da-ia`. */
const everythingReady = onboardingState({ ...serviceDone, ...availabilityDone });

function renderStep(state: OnboardingState = everythingReady) {
  getOnboarding.mockResolvedValue(state);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="importacao" />
    </OnboardingRuntimeProvider>,
  );
}

/** Espera a conclusão e a releitura do onboarding (a do provider e a de `ImportDoneActions`). */
async function renderDone(
  history: ImportHistory = historyFixture(),
  state: OnboardingState = everythingReady,
) {
  getImportState.mockResolvedValue(doneState(history));
  const rendered = renderStep(state);
  await screen.findByRole("heading", { level: 1, name: "Importação concluída" });
  await waitFor(() => expect(getOnboarding).toHaveBeenCalledTimes(2));
  return rendered;
}

function setViewportMatches(matches: (query: string) => boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      addEventListener: vi.fn(),
      matches: matches(query),
      media: query,
      removeEventListener: vi.fn(),
    }),
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: globalThis.matchMedia,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("a conclusão no onboarding é o quadro 2.I10", () => {
  test("'Importação concluída' é o único h1, com a descrição do quadro e sem o cartão do histórico", async () => {
    const { container } = await renderDone();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Importação concluída");
    expect(
      screen.getByText(
        "Seus dados agora estão na Avenly. A partir de agora, sua agenda é gerenciada por aqui. Alterações futuras no Minha Agenda não serão refletidas.",
      ),
    ).toBeVisible();
    // Sem `ImportHistoryCard`: nem o título de nível 2, nem as linhas, nem a data.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(container.querySelector(".import-history")).toBeNull();
    expect(screen.queryByText(/Minha Agenda · /)).toBeNull();
    expect(screen.queryByText(/A importação do Minha Agenda é feita uma única vez/)).toBeNull();
    expect(screen.queryByText("Importação")).toBeNull();
    // O único eyebrow é o da moldura.
    expect(container.querySelector(".eyebrow")).toBeNull();
    expect(screen.getByText("Sua agenda", { selector: ".onboarding-eyebrow" })).toBeVisible();
  });

  test("o selo é decorativo: anel e círculo com o visto, todos aria-hidden", async () => {
    const { container } = await renderDone();
    const seal = container.querySelector(".imports-done-seal");
    expect(seal).not.toBeNull();
    expect(seal).toHaveAttribute("aria-hidden", "true");
    expect(seal?.querySelector(".imports-done-ring")).not.toBeNull();
    expect(seal?.querySelector(".imports-done-disc svg path")).toHaveAttribute(
      "d",
      "M5 12.5l4.5 4.5L19 7.5",
    );
    // Nada do selo entra na árvore acessível.
    expect(screen.queryByRole("img")).toBeNull();
  });

  test("não passa pelo cabeçalho da tela: sem imports-header e sem o título repetido", async () => {
    const { container } = await renderDone();
    expect(container.querySelector(".imports-header")).toBeNull();
    expect(screen.getAllByText("Importação concluída")).toHaveLength(1);
  });

  test("não tem acessibilidade quebrada", async () => {
    const { container } = await renderDone(
      historyFixture(quadroCategories(), {
        pendingAcceptance: {
          acceptedAt: "2026-09-18T13:42:00.000Z",
          acceptedBy: "user-1",
          pendingCount: 3,
        },
      }),
    );
    await expectNoA11yViolations(container);
  });
});

describe("as pílulas", () => {
  function pillTexts(): string[] {
    const list = screen.getByRole("list", { name: "O que foi importado" });
    return within(list)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("[aria-hidden='true']")?.textContent ?? "");
  }

  test("as cinco do quadro, na ordem do quadro, com o texto curto", async () => {
    await renderDone();
    expect(pillTexts()).toEqual([
      "12 serviços",
      "386 clientes",
      "42 futuros",
      "1.400 anteriores",
      "Horários",
    ]);
  });

  test("a ordem é a de HISTORY_CATEGORY_ORDER, não a da resposta, e as demais vêm depois", async () => {
    await renderDone(
      historyFixture([
        entry("NO_SHOW_APPOINTMENT", 5),
        entry("AVAILABILITY", 6),
        entry("TIME_BLOCK", 7),
        entry("CANCELLED_APPOINTMENT", 8),
        entry("PAST_APPOINTMENT", 9),
        entry("FUTURE_APPOINTMENT", 10),
        entry("CUSTOMER", 11),
        entry("SERVICE", 12),
      ]),
    );
    expect(pillTexts()).toEqual([
      "12 serviços",
      "11 clientes",
      "10 futuros",
      "9 anteriores",
      "Horários",
      "7 bloqueios",
      "8 cancelamentos",
      "5 faltas",
    ]);
    expect(HISTORY_CATEGORY_ORDER.slice(0, 5)).toEqual([
      "SERVICE",
      "CUSTOMER",
      "FUTURE_APPOINTMENT",
      "PAST_APPOINTMENT",
      "AVAILABILITY",
    ]);
  });

  test("com 1, o texto é o singular", async () => {
    await renderDone(
      historyFixture([
        entry("SERVICE", 1),
        entry("CUSTOMER", 1),
        entry("FUTURE_APPOINTMENT", 1),
        entry("PAST_APPOINTMENT", 1),
        entry("TIME_BLOCK", 1),
        entry("CANCELLED_APPOINTMENT", 1),
        entry("NO_SHOW_APPOINTMENT", 1),
      ]),
    );
    expect(pillTexts()).toEqual([
      "1 serviço",
      "1 cliente",
      "1 futuro",
      "1 anterior",
      "1 bloqueio",
      "1 cancelamento",
      "1 falta",
    ]);
  });

  test("o texto curto é de historyPillLabel: o número em pt-BR e os horários sem número", () => {
    expect(historyPillLabel("PAST_APPOINTMENT", 1400)).toBe("1.400 anteriores");
    expect(historyPillLabel("PAST_APPOINTMENT", 1)).toBe("1 anterior");
    expect(historyPillLabel("AVAILABILITY", 6)).toBe("Horários");
    expect(historyPillLabel("AVAILABILITY", 1)).toBe("Horários");
  });

  test("'Horários' aparece sem número, qualquer que seja a contagem", async () => {
    await renderDone(historyFixture([entry("SERVICE", 12), entry("AVAILABILITY", 42)]));
    const list = screen.getByRole("list", { name: "O que foi importado" });
    const item = within(list).getAllByRole("listitem")[1];
    expect(item.querySelector("[aria-hidden='true']")).toHaveTextContent(/^Horários$/);
    expect(within(list).queryByText(/42/)).toBeNull();
  });

  test("categoria com imported 0 não tem pílula, e a lista some quando nada foi importado", async () => {
    const { unmount } = await renderDone(
      historyFixture([
        entry("SERVICE", 12),
        entry("CUSTOMER", 0, { discovered: 30, failed: 30 }),
        entry("AVAILABILITY", 0),
        entry("TIME_BLOCK", 0),
      ]),
    );
    expect(pillTexts()).toEqual(["12 serviços"]);
    unmount();

    vi.clearAllMocks();
    await renderDone(historyFixture([entry("SERVICE", 0), entry("CUSTOMER", 0)]));
    expect(screen.queryByRole("list", { name: "O que foi importado" })).toBeNull();
  });

  test("o nome inteiro da categoria fica em texto visualmente oculto, sem mudar o texto visível", async () => {
    await renderDone();
    const list = screen.getByRole("list", { name: "O que foi importado" });
    const items = within(list).getAllByRole("listitem");
    const hidden = items.map((item) => item.querySelector(".sr-only")?.textContent);
    expect(hidden).toEqual([
      "serviços: 12",
      "clientes: 386",
      "agendamentos futuros: 42",
      "atendimentos anteriores: 1.400",
      "horários de atendimento",
    ]);
    // O visível é o curto, em aria-hidden; o nome inteiro é o que a leitura de tela diz.
    expect(items[2].querySelector("[aria-hidden='true']")).toHaveTextContent("42 futuros");
    expect(within(items[2]).getByText("agendamentos futuros: 42")).toHaveClass("sr-only");
  });
});

describe("a nota de pendência e de falha", () => {
  const pending = (pendingCount: number): ImportHistory["pendingAcceptance"] => ({
    acceptedAt: "2026-09-18T13:42:00.000Z",
    acceptedBy: "user-1",
    pendingCount,
  });

  test("sem pendência e sem falha, não há nota", async () => {
    const { container } = await renderDone();
    expect(container.querySelector(".imports-done-note")).toBeNull();
    expect(screen.queryByText(/com pendência/)).toBeNull();
    expect(screen.queryByText(/não importados/)).toBeNull();
  });

  test("com pendência, a nota diz quantos registros, no singular com 1", async () => {
    const { unmount } = await renderDone(
      historyFixture(quadroCategories(), { pendingAcceptance: pending(3) }),
    );
    expect(screen.getByText("3 registros com pendência")).toBeVisible();
    unmount();

    vi.clearAllMocks();
    await renderDone(
      historyFixture(quadroCategories(), { pendingAcceptance: pending(1) }),
    );
    expect(screen.getByText("1 registro com pendência")).toBeVisible();
  });

  test("pendingCount 0 não mostra nota", async () => {
    const { container } = await renderDone(
      historyFixture(quadroCategories(), { pendingAcceptance: pending(0) }),
    );
    expect(container.querySelector(".imports-done-note")).toBeNull();
  });

  test("com falha, a nota soma os não importados de todas as categorias", async () => {
    await renderDone(
      historyFixture([
        entry("SERVICE", 12, { failed: 1 }),
        entry("CUSTOMER", 386, { failed: 4 }),
        entry("AVAILABILITY", 6),
      ]),
    );
    expect(screen.getByText("5 não importados")).toBeVisible();
    expect(screen.queryByText(/com pendência/)).toBeNull();
  });

  test("com as duas, a nota junta pendência e falha com ' · '", async () => {
    await renderDone(
      historyFixture(
        [entry("SERVICE", 12, { failed: 2 }), entry("CUSTOMER", 386)],
        { pendingAcceptance: pending(3) },
      ),
    );
    expect(screen.getByText("3 registros com pendência · 2 não importados")).toBeVisible();
  });

  test("a nota vem abaixo das pílulas, dentro do mesmo bloco", async () => {
    const { container } = await renderDone(
      historyFixture(quadroCategories(), { pendingAcceptance: pending(3) }),
    );
    const tally = container.querySelector(".imports-done-tally");
    expect(tally?.children[0]).toHaveClass("imports-done-pills");
    expect(tally?.children[1]).toHaveClass("imports-done-note");
  });
});

describe("o rodapé: avisos, erro e 'Continuar'", () => {
  test("o aviso de sucesso de stepAfterImport não aparece", async () => {
    await renderDone();
    expect(
      screen.queryByText(
        "Seus serviços e horários foram importados. Agora é só ver sua IA em ação.",
      ),
    ).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("sem serviço ativo, o aviso de servico-nome continua, com o texto e o role de hoje", async () => {
    await renderDone(historyFixture(), onboardingState());
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(
      "Nenhum serviço importado está ativo. Cadastre pelo menos um serviço para continuar.",
    );
    expect(notice).toBeVisible();
  });

  test("sem horário ativo, o aviso de dias-de-atendimento continua, com o texto e o role de hoje", async () => {
    await renderDone(historyFixture(), onboardingState(serviceDone));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "A importação não trouxe seus horários de atendimento. Informe os dias e horários em que você atende.",
    );
  });

  test("os avisos ficam acima de 'Continuar', no rodapé", async () => {
    const { container } = await renderDone(historyFixture(), onboardingState());
    await screen.findByRole("status");
    const footer = container.querySelector(".imports-done-footer");
    expect(footer).not.toBeNull();
    const children = [...(footer?.children ?? [])].map((child) => child.className);
    expect(children).toEqual(["onboarding-note", "onboarding-actions", "imports-done-path"]);
  });

  test("o erro da releitura continua com role=alert", async () => {
    getImportState.mockResolvedValue(doneState());
    getOnboarding
      .mockResolvedValueOnce(everythingReady)
      .mockRejectedValue(new Error("falha"));
    render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="importacao" />
      </OnboardingRuntimeProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Algo deu errado do nosso lado e esta etapa não foi salva. Tente de novo em alguns instantes.",
    );
  });

  test.each([
    { destination: "/onboarding/servico-nome", state: onboardingState() },
    {
      destination: "/onboarding/dias-de-atendimento",
      state: onboardingState(serviceDone),
    },
    { destination: "/onboarding/demonstracao-da-ia", state: everythingReady },
  ])("'Continuar' vai a $destination, com um clique e sem outro pedido", async ({
    destination,
    state,
  }) => {
    const user = userEvent.setup();
    await renderDone(historyFixture(), state);

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(push).toHaveBeenCalledWith(destination);
    expect(push).toHaveBeenCalledTimes(1);
    expect(getOnboarding).toHaveBeenCalledTimes(2);
    expect(getImportState).toHaveBeenCalledTimes(1);
  });

  test("com a releitura ainda a caminho, 'Continuar' mostra 'Abrindo...' e fica desabilitado", async () => {
    getImportState.mockResolvedValue(doneState());
    const pendingReads: Array<(state: OnboardingState) => void> = [];
    getOnboarding
      .mockResolvedValueOnce(everythingReady)
      .mockImplementation(
        () =>
          new Promise<OnboardingState>((resolve) => {
            pendingReads.push(resolve);
          }),
      );
    const user = userEvent.setup();
    render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="importacao" />
      </OnboardingRuntimeProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    const busy = await screen.findByRole("button", { name: "Abrindo..." });
    expect(busy).toBeDisabled();
    expect(push).not.toHaveBeenCalled();

    // A releitura do clique é a última pendente.
    pendingReads[pendingReads.length - 1](everythingReady);
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/demonstracao-da-ia"),
    );
    expect(await screen.findByRole("button", { name: "Continuar" })).toBeEnabled();
  });
});

describe("a nota do rodapé mostra o caminho real de cada largura", () => {
  test("onde Configurações fica dentro do 'Mais' (abaixo de 768 px, D-194), o caminho é Mais › Importação", async () => {
    setViewportMatches(() => false);
    await renderDone();
    expect(
      screen.getByText("O histórico desta importação fica em Mais › Importação."),
    ).toBeVisible();
  });

  test("onde a barra ou a sidebar têm Configurações (de 768 px em diante, D-194), o caminho é Configurações › Importação", async () => {
    setViewportMatches((query) => query === "(min-width: 768px)");
    await renderDone();
    expect(
      screen.getByText(
        "O histórico desta importação fica em Configurações › Importação.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/em Mais ›/)).toBeNull();
  });

  test("a nota vem depois de 'Continuar'", async () => {
    const { container } = await renderDone();
    const footer = container.querySelector(".imports-done-footer");
    const button = within(footer as HTMLElement).getByRole("button", { name: "Continuar" });
    const note = container.querySelector(".imports-done-path") as HTMLElement;
    expect(button.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("o que não muda", () => {
  test("na moldura platform, com history, o histórico (I1) fica como hoje, sem a tela nova", async () => {
    getImportState.mockResolvedValue(
      doneState(
        historyFixture(
          [entry("SERVICE", 12), entry("CUSTOMER", 386, { failed: 1 }), entry("AVAILABILITY", 6)],
          {
            pendingAcceptance: {
              acceptedAt: "2026-09-18T13:42:00.000Z",
              acceptedBy: "user-1",
              pendingCount: 3,
            },
          },
        ),
      ),
    );
    const { ImportsScreen } = await import("@/features/imports/ImportsScreen");
    const { ShellConfigProvider } = await import("@/shared/layout/ShellConfig");
    const { container } = render(
      <ShellConfigProvider>
        <ImportsScreen />
      </ShellConfigProvider>,
    );

    expect(
      await screen.findByRole("heading", { level: 2, name: "Importação concluída" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Importação" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "3 registros com pendência" })).toBeVisible();
    expect(screen.getByText("1 não importados")).toBeVisible();
    expect(screen.getByText(/A importação do Minha Agenda é feita uma única vez\./)).toBeVisible();
    expect(container.querySelector(".import-history")).not.toBeNull();
    expect(container.querySelector(".imports-done")).toBeNull();
    expect(container.querySelector(".imports-done-seal")).toBeNull();
    expect(screen.queryByRole("list", { name: "O que foi importado" })).toBeNull();
    expect(screen.queryByText(/O histórico desta importação fica em/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
    // A rota de Configurações › Importação não lê o onboarding.
    expect(getOnboarding).not.toHaveBeenCalled();
  });

  test("sem history, na moldura do onboarding, a origem continua como hoje", async () => {
    getImportState.mockResolvedValue({
      history: null,
      right: { available: true, completedAt: null, sessionId: null },
      session: null,
    });
    const { container } = renderStep();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "De onde vamos trazer seus dados?",
      }),
    ).toBeVisible();
    expect(container.querySelector(".imports-done")).toBeNull();
    expect(getOnboarding).toHaveBeenCalledTimes(1);
  });

  test("a leitura do estado e a releitura do onboarding são uma vez cada, na conclusão", async () => {
    await renderDone();
    expect(getImportState).toHaveBeenCalledTimes(1);
    expect(getOnboarding).toHaveBeenCalledTimes(2);
  });
});

function readCss(): string {
  return readLightStylesheet(
    join(process.cwd(), "src/shared/styles/avenly-imports.css"));
}

/** Só o bloco do 2.I10: do comentário do Goal134 até o do andamento (2.I7), que vem depois. */
function doneCss(): string {
  const css = readCss();
  const marker = css.indexOf("Importação concluída no onboarding (2.I10, Goal134)");
  expect(marker).toBeGreaterThan(-1);
  const end = css.indexOf("Andamento (2.I7, Goal133)", marker);
  return css.slice(css.lastIndexOf("/*", marker), end > -1 ? css.lastIndexOf("/*", end) : undefined);
}

/** Corpo da primeira regra `selector { … }` em `css`. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[{}/])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `regra ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

function mediaBlock(css: string, query: string): string {
  const start = css.lastIndexOf(`@media (${query})`);
  expect(start, `@media (${query})`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  throw new Error(`@media (${query}) sem fechamento`);
}

describe("o CSS do 2.I10 tem os valores do quadro", () => {
  test("o selo: 96 px, anel de 2 px #2e7d4f a 35%, círculo de 72 px #2e7d4f e visto #fffdfa", () => {
    const css = doneCss();
    const seal = ruleBody(css, ".imports-done-seal");
    expect(seal).toMatch(/width:\s*96px/);
    expect(seal).toMatch(/height:\s*96px/);
    const ring = ruleBody(css, ".imports-done-ring");
    expect(ring).toMatch(/inset:\s*0/);
    expect(ring).toMatch(/border:\s*2px solid #2e7d4f/);
    expect(ring).toMatch(/opacity:\s*0?\.35/);
    const disc = ruleBody(css, ".imports-done-disc");
    expect(disc).toMatch(/width:\s*72px/);
    expect(disc).toMatch(/height:\s*72px/);
    expect(disc).toMatch(/background:\s*#2e7d4f/);
    expect(disc).toMatch(/color:\s*#fffdfa/);
  });

  test("o corpo é centrado, com 26 px entre os blocos", () => {
    const body = ruleBody(doneCss(), ".imports-done-body");
    expect(body).toMatch(/flex:\s*1/);
    expect(body).toMatch(/justify-content:\s*center/);
    expect(body).toMatch(/gap:\s*26px/);
  });

  test("o título é Literata 32 px 500, e a descrição 15 px #5f574e", () => {
    const css = doneCss();
    const title = ruleBody(css, ".imports-done-text h1");
    expect(title).toMatch(/font-size:\s*32px/);
    expect(title).toMatch(/font-weight:\s*500/);
    expect(title).toMatch(/line-height:\s*1\.15/);
    expect(title).toMatch(/letter-spacing:\s*-0\.015em/);
    expect(title).toMatch(/font-family:\s*var\(--font-display, Literata/);
    const text = ruleBody(css, ".imports-done-text p");
    expect(text).toMatch(/font-size:\s*15px/);
    expect(text).toMatch(/line-height:\s*1\.5/);
    expect(text).toMatch(/color:\s*#5f574e/);
    expect(text).toMatch(/text-wrap:\s*pretty/);
    expect(ruleBody(css, ".imports-done-text")).toMatch(/gap:\s*10px/);
  });

  test("a pílula tem 32 px, 0 12px, raio 999 px, #efeae2, 13 px 600 e algarismos tabulares", () => {
    const css = doneCss();
    const pill = ruleBody(css, ".imports-done-pill");
    expect(pill).toMatch(/height:\s*32px/);
    expect(pill).toMatch(/padding:\s*0 12px/);
    expect(pill).toMatch(/border-radius:\s*999px/);
    expect(pill).toMatch(/background:\s*#efeae2/);
    expect(pill).toMatch(/font-size:\s*13px/);
    expect(pill).toMatch(/font-weight:\s*600/);
    expect(pill).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(ruleBody(css, ".imports-done-pill.is-plain")).toMatch(/font-variant-numeric:\s*normal/);
    const pills = ruleBody(css, ".imports-done-pills");
    expect(pills).toMatch(/flex-wrap:\s*wrap/);
    expect(pills).toMatch(/justify-content:\s*center/);
    expect(pills).toMatch(/gap:\s*8px/);
  });

  test("a nota de pendência é 13 px #716859, e a do rodapé 12 px #716859", () => {
    const css = doneCss();
    const note = ruleBody(css, ".imports-done-note");
    expect(note).toMatch(/font-size:\s*13px/);
    expect(note).toMatch(/color:\s*#716859/);
    const path = ruleBody(css, ".imports-done-path");
    expect(path).toMatch(/font-size:\s*12px/);
    expect(path).toMatch(/color:\s*#716859/);
    expect(path).toMatch(/text-align:\s*center/);
  });

  test("'Continuar' tem 52 px (a regra de hoje), raio 14 px, #0f5f63 e texto #f7f4ef; o rodapé tem 12 px de respiro em cima e 10 px de espaço", () => {
    const css = doneCss();
    const footer = ruleBody(css, ".imports-done-footer");
    expect(footer).toMatch(/padding-top:\s*12px/);
    expect(footer).toMatch(/gap:\s*10px/);
    expect(ruleBody(css, ".imports-done-footer .onboarding-actions")).toMatch(/margin:\s*0/);
    expect(ruleBody(css, ".imports-done-footer .onboarding-actions .btn")).toMatch(
      /border-radius:\s*14px/,
    );
    const primary = ruleBody(
      css,
      ".imports-done-footer .onboarding-actions .btn-primary:not(:disabled)",
    );
    expect(primary).toMatch(/background:\s*#0f5f63/);
    expect(primary).toMatch(/color:\s*#f7f4ef/);
    // A altura de 52 px é da regra compartilhada, que este bloco não repete.
    const shared = readLightStylesheet(
      join(process.cwd(), "src/shared/styles/avenly.css"));
    expect(ruleBody(shared, ".onboarding-actions .btn")).toMatch(/min-height:\s*52px/);
  });

  test("o respiro do rodapé é 46 px no celular e 32 px de 768 px em diante", () => {
    const css = doneCss();
    expect(ruleBody(css, ".imports-page:has(.imports-done):not(.is-pushed)")).toMatch(
      /padding-bottom:\s*46px/,
    );
    expect(mediaBlock(css, "min-width: 768px")).toMatch(
      /\.imports-page:has\(\.imports-done\):not\(\.is-pushed\)\s*\{[^}]*padding-bottom:\s*32px/,
    );
  });

  test("as animações só rodam com prefers-reduced-motion: no-preference", () => {
    const css = doneCss();
    const permitted = mediaBlock(css, "prefers-reduced-motion: no-preference");
    expect(permitted).toMatch(/\.imports-done-ring\s*\{[^}]*animation:\s*at-pop 0\.6s ease-out 0\.1s both/);
    expect(permitted).toMatch(/\.imports-done-disc\s*\{[^}]*animation:\s*at-pop 0\.5s ease-out both/);
    expect(permitted).toMatch(
      /\.imports-done-text\s*\{[^}]*animation:\s*at-reveal 0\.4s cubic-bezier\(0\.2, 0\.7, 0\.2, 1\) 0\.3s both/,
    );
    expect(permitted).toMatch(
      /\.imports-done-tally\s*\{[^}]*animation:\s*at-reveal 0\.4s cubic-bezier\(0\.2, 0\.7, 0\.2, 1\) 0\.5s both/,
    );
    const outside = doneCss().replace(permitted, "");
    expect(outside).not.toMatch(/animation:/);
  });

  test("só classes novas: nenhuma regra do bloco toca .import-history nem as classes de outras telas", () => {
    const css = doneCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((match) =>
      match[2].trim(),
    );
    expect(selectors.length).toBeGreaterThan(20);
    for (const selector of selectors) {
      expect(selector).not.toMatch(/\.import-history/);
      // Toda regra do bloco é escopada pela conclusão.
      expect(selector, selector).toMatch(/\.imports-done/);
    }
  });
});
