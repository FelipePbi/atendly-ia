// @vitest-environment jsdom
/**
 * Goal137 (2.I6): os conflitos da importação iguais ao protótipo.
 *
 * O que esta suíte prova, pelo que a pessoa encontra na tela:
 *
 * - a lista única dos itens em revisão (uma leitura por categoria, na ordem de
 *   `CATEGORY_ORDER`), com o título e a descrição do quadro, "Continuar" e a nota;
 * - um cartão sem decisão aberto por vez, e o cartão decidido que fica;
 * - cada botão envia a decisão do contrato, com o `targetInternalId` do
 *   candidato só em `KEEP_EXISTING` e `MERGE_WITH_EXISTING`, e nenhuma decisão
 *   pede um identificador digitado;
 * - o motivo curto, a pergunta e o resultado de cada caso;
 * - as duas entradas (a prévia e a tela parada) e as duas molduras.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BffHttpError,
  type ImportCategory,
  type ImportItem,
  type ImportLiveSession,
  type ImportPreviewSnapshot,
  type ImportProgress,
} from "@/data";
import {
  type ConflictCategorySummary,
  ImportConflictsScreen,
} from "@/features/imports/ImportConflictsScreen";
import { ImportRunScreen } from "@/features/imports/ImportRunScreen";
import {
  type ImportsFrame,
  ImportsFrameProvider,
} from "@/features/imports/ImportsLayout";
import { ImportsScreen } from "@/features/imports/ImportsScreen";
import {
  conflictReasonLabel,
  conflictResultLabel,
  conflictsDescription,
  conflictShortReason,
  conflictsTitle,
  customerQuestionLabel,
} from "@/features/imports/labels";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const analyzeImport = vi.fn();
const decideImportItem = vi.fn();
const executeImport = vi.fn();
const getImportPreview = vi.fn();
const getImportProgress = vi.fn();
const getImportState = vi.fn();
const listImportItems = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: { connectIntegration: vi.fn() },
    migration: {
      analyzeImport,
      completeImport: vi.fn(),
      decideImportItem,
      executeImport,
      getImportPreview,
      getImportProgress,
      getImportState,
      listImportItems,
      setImportCategorySelection: vi.fn(),
      startImport: vi.fn(),
    },
    settings: { get: () => new Promise<never>(() => undefined) },
  }),
}));

type ServiceCandidate = {
  active: boolean;
  durationMinutes: number | null;
  internalId: string;
  name: string;
  price: number | null;
  priceType: "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";
};

function serviceCandidate(overrides: Partial<ServiceCandidate> = {}): ServiceCandidate {
  return {
    active: true,
    durationMinutes: 45,
    internalId: "svc-1",
    name: "Corte feminino",
    price: 90,
    priceType: "FIXED",
    ...overrides,
  };
}

function itemOf(overrides: Partial<ImportItem> & Pick<ImportItem, "category" | "id">): ImportItem {
  return {
    attemptCount: 0,
    disappearedAt: null,
    entityType: null,
    externalId: `ext-${overrides.id}`,
    internalId: null,
    label: overrides.id,
    lastAttemptAt: null,
    processedAt: null,
    reasonCode: null,
    reasonDetail: null,
    status: "NEEDS_REVIEW",
    ...overrides,
  };
}

/** O "Corte feminino" do quadro: 45 min e R$ 90 na Avenly, 50 min e R$ 95 na origem. */
function divergentService(overrides: Partial<ImportItem> = {}): ImportItem {
  return itemOf({
    candidates: [serviceCandidate()],
    category: "SERVICE",
    id: "s1",
    label: "Corte feminino",
    proposedService: { durationMinutes: 50, price: 95, priceType: "FIXED" },
    reasonCode: "SERVICE_MATCH_DIVERGENT",
    ...overrides,
  });
}

/** A "Escova" do quadro: só a duração difere. */
function durationService(overrides: Partial<ImportItem> = {}): ImportItem {
  return itemOf({
    candidates: [serviceCandidate({ durationMinutes: 40, internalId: "svc-2", name: "Escova", price: 70 })],
    category: "SERVICE",
    id: "s2",
    label: "Escova",
    proposedService: { durationMinutes: 50, price: 70, priceType: "FIXED" },
    reasonCode: "SERVICE_MATCH_DIVERGENT",
    ...overrides,
  });
}

function similarCustomer(overrides: Partial<ImportItem> = {}): ImportItem {
  return itemOf({
    candidates: [{ internalId: "cus-1", name: "Ana P. Souza" }],
    category: "CUSTOMER",
    id: "c1",
    label: "Ana Paula",
    reasonCode: "CUSTOMER_MATCH_SIMILAR",
    ...overrides,
  });
}

function availabilityItem(): ImportItem {
  return itemOf({
    category: "AVAILABILITY",
    currentAvailability: [{ dayOfWeek: 1, endTime: "12:00", startTime: "08:00" }],
    id: "a1",
    label: "Horários de atendimento",
    proposedAvailability: [{ dayOfWeek: 1, endTime: "18:00", startTime: "09:00" }],
    reasonCode: "AVAILABILITY_REPLACES_CURRENT",
  });
}

/** O que a rota de itens devolve: a fila em revisão por categoria, cortada pelo deslocamento. */
let queues: Partial<Record<ImportCategory, ImportItem[]>> = {};

function serveQueues() {
  listImportItems.mockImplementation(
    async (
      sessionId: string,
      category: ImportCategory,
      query: { limit: number; offset: number },
    ) => {
      const queue = queues[category] ?? [];
      return {
        category,
        items: queue.slice(query.offset, query.offset + query.limit),
        limit: query.limit,
        offset: query.offset,
        sessionId,
        total: queue.length,
      };
    },
  );
}

/** Uma decisão tira o item da fila em revisão, como no Scheduling. */
function serveDecisions() {
  decideImportItem.mockImplementation(
    async (_session: string, itemId: string) => {
      for (const category of Object.keys(queues) as ImportCategory[]) {
        queues[category] = (queues[category] ?? []).filter((item) => item.id !== itemId);
      }
      return {};
    },
  );
}

const SUMMARY: ConflictCategorySummary[] = [
  { category: "SERVICE", needsReviewCount: 2 },
  { category: "CUSTOMER", needsReviewCount: 1 },
];

function renderScreen(
  props: Partial<Parameters<typeof ImportConflictsScreen>[0]> = {},
  frame: ImportsFrame = "onboarding",
) {
  const onBack = vi.fn();
  const view = render(
    <ImportsFrameProvider frame={frame}>
      <ImportConflictsScreen
        categories={SUMMARY}
        onBack={onBack}
        sessionId="session-1"
        {...props}
      />
    </ImportsFrameProvider>,
  );
  return { onBack, ...view };
}

/** Os três itens do quadro: dois serviços e um cliente. */
function quadro() {
  queues = {
    CUSTOMER: [similarCustomer()],
    SERVICE: [divergentService(), durationService()],
  };
  serveQueues();
  serveDecisions();
}

function decisionCalls() {
  return decideImportItem.mock.calls as [string, string, Record<string, unknown>, string][];
}

function upstreamRefusal(code: string, status = 409) {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: { upstreamCode: code },
    message: "refused",
    requestId: "req-1",
    status,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  queues = {};
  serveQueues();
  serveDecisions();
});

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "a lista e o topo, na moldura %s",
  (frame) => {
    test("uma leitura por categoria com revisão, e os cartões na ordem de CATEGORY_ORDER", async () => {
      quadro();
      renderScreen(
        {
          categories: [
            { category: "CUSTOMER", needsReviewCount: 1 },
            { category: "AVAILABILITY", needsReviewCount: 0 },
            { category: "SERVICE", needsReviewCount: 2 },
          ],
        },
        frame,
      );

      await screen.findByText("Corte feminino");
      expect(listImportItems).toHaveBeenCalledTimes(2);
      expect(listImportItems).toHaveBeenCalledWith(
        "session-1",
        "SERVICE",
        { limit: 20, offset: 0, status: "NEEDS_REVIEW" },
        expect.any(AbortSignal),
      );
      expect(listImportItems).toHaveBeenCalledWith(
        "session-1",
        "CUSTOMER",
        { limit: 20, offset: 0, status: "NEEDS_REVIEW" },
        expect.any(AbortSignal),
      );
      const names = screen
        .getAllByRole("listitem")
        .map((item) => item.querySelector(".imports-conflict-name")?.textContent);
      expect(names).toEqual(["Corte feminino", "Escova", "Ana Paula · Ana P. Souza"]);
    });

    test("o título conta os itens, a descrição traz os prontos e a nota do quadro aparece", async () => {
      quadro();
      renderScreen({ readyCount: 1843 }, frame);

      expect(
        await screen.findByRole("heading", { name: "3 registros precisam da sua decisão" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Encontramos dados parecidos aqui e no Minha Agenda. Os outros 1.843 já estão prontos.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Itens sem decisão ficam de fora até você resolver."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
      if (frame === "onboarding") {
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      }
    });

    test("nenhum campo do identificador, nenhum 'Resolver' e nenhuma das duas telas de antes", async () => {
      quadro();
      renderScreen({}, frame);

      await screen.findByText("Corte feminino");
      expect(screen.queryByLabelText("Identificador do cadastro existente")).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("button", { name: "Resolver" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Confirmar decisão" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
      expect(screen.queryByRole("group", { name: "O que fazer com este item?" })).toBeNull();
      expect(screen.queryByText("Itens que precisam da sua decisão")).toBeNull();

      // O cartão do cliente também não pede identificador digitado.
      await userEvent.setup().click(
        screen.getByRole("button", { name: "Ana Paula · Ana P. Souza cliente" }),
      );
      expect(await screen.findByRole("button", { name: "Sim, juntar" })).toBeEnabled();
      expect(screen.queryByLabelText("Identificador do cadastro existente")).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  },
);

describe("o título e a descrição", () => {
  test("o singular e o plural do título", () => {
    expect(conflictsTitle(1)).toBe("1 registro precisa da sua decisão");
    expect(conflictsTitle(3)).toBe("3 registros precisam da sua decisão");
    expect(conflictsTitle(1200)).toBe("1.200 registros precisam da sua decisão");
  });

  test("a descrição com e sem readyCount, e no singular", () => {
    const lead = "Encontramos dados parecidos aqui e no Minha Agenda.";
    expect(conflictsDescription()).toBe(lead);
    expect(conflictsDescription(0)).toBe(lead);
    expect(conflictsDescription(1)).toBe(`${lead} O outro já está pronto.`);
    expect(conflictsDescription(1837)).toBe(`${lead} Os outros 1.837 já estão prontos.`);
  });

  test("sem readyCount a tela mostra só a primeira frase, e o título com 1 vai ao singular", async () => {
    queues = { SERVICE: [divergentService()] };
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    expect(
      await screen.findByRole("heading", { name: "1 registro precisa da sua decisão" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Encontramos dados parecidos aqui e no Minha Agenda."),
    ).toBeInTheDocument();
  });

  test("Continuar chama onBack", async () => {
    quadro();
    const user = userEvent.setup();
    const { onBack } = renderScreen();

    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("initialCategory mostra só a categoria, e o título conta só ela", async () => {
    quadro();
    const user = userEvent.setup();
    const { onBack } = renderScreen({ initialCategory: "CUSTOMER" });

    expect(
      await screen.findByRole("heading", { name: "1 registro precisa da sua decisão" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Ana Paula · Ana P. Souza")).toBeInTheDocument();
    expect(screen.queryByText("Corte feminino")).toBeNull();
    expect(listImportItems).toHaveBeenCalledTimes(1);
    expect(listImportItems.mock.calls[0][1]).toBe("CUSTOMER");

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("leitura", () => {
  test("enquanto lê, a lista avisa e fica ocupada; a leitura é cancelada ao desmontar", async () => {
    listImportItems.mockReturnValue(new Promise(() => undefined));
    const { unmount } = renderScreen();

    expect(screen.getByText("Carregando itens…")).toHaveAttribute("aria-busy", "true");
    const signal = listImportItems.mock.calls[0][3] as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  test("uma leitura que falha mostra o que leu, a nota com role=alert e Continuar livre", async () => {
    queues = { CUSTOMER: [similarCustomer()] };
    const served = listImportItems.getMockImplementation() as (
      ...args: unknown[]
    ) => Promise<unknown>;
    listImportItems.mockImplementation(
      async (session: string, category: ImportCategory, query: { limit: number; offset: number }) => {
        if (category === "SERVICE") throw new Error("rede");
        return await served(session, category, query);
      },
    );
    const user = userEvent.setup();
    const { onBack } = renderScreen();

    expect(await screen.findByText("Ana Paula · Ana P. Souza")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar todos os itens agora.",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("todas as leituras falhando mostram o painel de erro, com Continuar livre", async () => {
    listImportItems.mockRejectedValue(new Error("rede"));
    const user = userEvent.setup();
    const { onBack } = renderScreen();

    expect(await screen.findByText("Itens indisponíveis")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("'Carregar mais' lê a página seguinte contando só o que ainda está na fila", async () => {
    queues = {
      SERVICE: Array.from({ length: 25 }, (_, index) =>
        itemOf({ category: "SERVICE", id: `s${index}`, label: `Serviço ${index}`, reasonCode: "SERVICE_DURATION_MISSING" }),
      ),
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 25 }] });

    await screen.findByText("Serviço 0");
    expect(screen.queryByText("Serviço 20")).toBeNull();

    // Uma decisão tira o item da fila: o deslocamento da próxima página não
    // pode contar o cartão decidido que continua na lista.
    await user.click(screen.getByRole("button", { name: "Importar mesmo assim" }));
    await screen.findByText("Vai ser importado");
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));

    await screen.findByText("Serviço 24");
    expect(listImportItems).toHaveBeenLastCalledWith(
      "session-1",
      "SERVICE",
      { limit: 20, offset: 19, status: "NEEDS_REVIEW" },
      expect.anything(),
    );
    expect(screen.getAllByText(/^Serviço \d+$/)).toHaveLength(25);
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });
});

describe("um cartão por vez", () => {
  test("só o primeiro abre, e o outro é um botão fechado com o título e o motivo no nome", async () => {
    quadro();
    renderScreen();

    await screen.findByText("Corte feminino");
    expect(screen.getByRole("button", { name: "Manter o da Avenly" })).toBeInTheDocument();
    const closed = screen.getByRole("button", { name: "Escova serviço · duração diferente" });
    expect(closed).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Ana Paula · Ana P. Souza cliente" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("button", { name: "Manter o da Avenly" })).toHaveLength(1);
  });

  test("tocar um cartão fechado o abre e fecha o que estava aberto", async () => {
    quadro();
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Corte feminino");
    await user.click(screen.getByRole("button", { name: "Escova serviço · duração diferente" }));

    expect(
      screen.getByRole("button", { name: "Corte feminino serviço · preço e duração diferentes" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("button", { name: "Manter o da Avenly" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Escova/ })).toBeNull();
    expect(listImportItems).toHaveBeenCalledTimes(2);
  });

  test("depois da decisão o próximo abre sozinho, e o decidido fica com o resultado e sem ações", async () => {
    quadro();
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Manter o da Avenly" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Vai manter o da Avenly");
    // O cartão decidido continua na lista, sem ação nenhuma.
    const decided = screen.getByText("Corte feminino").closest("li");
    expect(decided).not.toBeNull();
    expect(within(decided as HTMLElement).queryByRole("button")).toBeNull();
    // O próximo, na ordem, abriu.
    expect(screen.queryByRole("button", { name: /^Escova/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Manter o da Avenly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ana Paula/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // A tela não relê a lista, e o título continua contando o decidido.
    expect(listImportItems).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "3 registros precisam da sua decisão" })).toBeInTheDocument();
  });

  test("decidir o último deixa todos decididos, sem cartão aberto", async () => {
    queues = { SERVICE: [divergentService()] };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Criar outro serviço" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Vai entrar como outro serviço");
    expect(screen.queryByRole("button", { name: /Manter|Criar|Importar/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });
});

describe("o serviço com cadastro sugerido", () => {
  test("as duas peças mostram os valores da Avenly e da origem, com a borda neutra sem decisão", async () => {
    queues = { SERVICE: [divergentService()] };
    const { container } = renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    await screen.findByText("Corte feminino");
    expect(screen.getByText("Avenly")).toBeInTheDocument();
    expect(screen.getByText("45 min · R$ 90")).toBeInTheDocument();
    expect(screen.getByText("Minha Agenda")).toBeInTheDocument();
    expect(screen.getByText("50 min · R$ 95")).toBeInTheDocument();
    expect(screen.getByText("serviço · preço e duração diferentes")).toBeInTheDocument();
    expect(container.querySelectorAll(".imports-conflict-piece")).toHaveLength(2);
    expect(container.querySelectorAll(".imports-conflict-piece.is-selected")).toHaveLength(0);
  });

  test("'Manter o da Avenly' envia KEEP_EXISTING com o candidato, e a peça da Avenly ganha o estilo depois", async () => {
    queues = { SERVICE: [divergentService()] };
    const user = userEvent.setup();
    const { container } = renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Manter o da Avenly" }));

    expect(decideImportItem).toHaveBeenCalledTimes(1);
    expect(decisionCalls()[0].slice(0, 3)).toEqual([
      "session-1",
      "s1",
      { decision: "KEEP_EXISTING", targetInternalId: "svc-1" },
    ]);
    expect(typeof decisionCalls()[0][3]).toBe("string");
    await screen.findByText("Vai manter o da Avenly");
    const selected = container.querySelectorAll(".imports-conflict-piece.is-selected");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("Avenly");
  });

  test("'Criar outro serviço' envia CREATE_NEW sem alvo", async () => {
    queues = { SERVICE: [divergentService()] };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Criar outro serviço" }));

    expect(decisionCalls()[0][2]).toEqual({ decision: "CREATE_NEW" });
    expect(Object.keys(decisionCalls()[0][2])).toEqual(["decision"]);
    await screen.findByText("Vai entrar como outro serviço");
  });

  test("'Não importar este item' envia EXCLUDE sem alvo", async () => {
    queues = { SERVICE: [divergentService()] };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Não importar este item" }));

    expect(decisionCalls()[0][2]).toEqual({ decision: "EXCLUDE" });
    expect(Object.keys(decisionCalls()[0][2])).toEqual(["decision"]);
    await screen.findByText("Não vai ser importado");
  });

  test("dois ou mais candidatos exigem escolha, e KEEP_EXISTING leva o escolhido", async () => {
    queues = {
      SERVICE: [
        divergentService({
          candidates: [
            serviceCandidate(),
            serviceCandidate({ durationMinutes: 60, internalId: "svc-9", name: "Corte feminino longo", price: 120 }),
          ],
          reasonCode: "SERVICE_MATCH_AMBIGUOUS",
        }),
      ],
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    const group = await screen.findByRole("radiogroup", { name: "Qual serviço da Avenly é este?" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("serviço · mais de um com esse nome")).toBeInTheDocument();
    const keep = screen.getByRole("button", { name: "Manter o escolhido" });
    expect(keep).toBeDisabled();
    expect(screen.getByRole("button", { name: "Criar outro serviço" })).toBeEnabled();

    await user.click(within(group).getByRole("radio", { name: /Corte feminino longo/ }));
    expect(keep).toBeEnabled();
    await user.click(keep);

    expect(decisionCalls()[0][2]).toEqual({ decision: "KEEP_EXISTING", targetInternalId: "svc-9" });
    await screen.findByText("Vai manter o da Avenly");
  });

  test("dois candidatos: 'Criar outro serviço' funciona sem escolha", async () => {
    queues = {
      SERVICE: [
        divergentService({
          candidates: [serviceCandidate(), serviceCandidate({ internalId: "svc-9", name: "Corte B" })],
          reasonCode: "SERVICE_MATCH_AMBIGUOUS",
        }),
      ],
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Criar outro serviço" }));
    expect(decisionCalls()[0][2]).toEqual({ decision: "CREATE_NEW" });
  });

  test("SERVICE_DURATION_MISSING com candidato mostra as peças, com a duração desconhecida escrita", async () => {
    queues = {
      SERVICE: [
        divergentService({
          proposedService: { durationMinutes: null, price: null, priceType: "NOT_INFORMED" },
          reasonCode: "SERVICE_DURATION_MISSING",
        }),
      ],
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    expect(await screen.findByText("serviço · sem duração")).toBeInTheDocument();
    expect(screen.getByText("sem duração · sem preço informado")).toBeInTheDocument();
    expect(screen.getByText("45 min · R$ 90")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manter o da Avenly" }));
    expect(decisionCalls()[0][2]).toEqual({ decision: "KEEP_EXISTING", targetInternalId: "svc-1" });
  });

  test("sem proposedService a peça da origem diz 'Valores não informados'", async () => {
    queues = { SERVICE: [divergentService({ proposedService: null })] };
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    expect(await screen.findByText("Valores não informados")).toBeInTheDocument();
    expect(screen.getByText("serviço · valores diferentes")).toBeInTheDocument();
  });

  test("o nome do candidato só entra na peça quando difere do nome do item", async () => {
    queues = {
      SERVICE: [
        divergentService({
          candidates: [serviceCandidate({ name: "Corte feminino longo" })],
          reasonCode: "SERVICE_MATCH_SIMILAR",
        }),
      ],
    };
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    expect(await screen.findByText("Corte feminino longo")).toBeInTheDocument();
    expect(screen.getByText("serviço · nome parecido")).toBeInTheDocument();
  });
});

describe("o cliente com cadastro sugerido", () => {
  test("o título leva o nome do candidato, a pergunta do motivo e nenhum dado além do nome", async () => {
    queues = {
      CUSTOMER: [
        similarCustomer({
          candidates: [
            { internalId: "cus-1", name: "Ana P. Souza", phone: "11999990000" } as never,
          ],
        }),
      ],
    };
    const { container } = renderScreen({ categories: [{ category: "CUSTOMER", needsReviewCount: 1 }] });

    expect(await screen.findByText("Ana Paula · Ana P. Souza")).toBeInTheDocument();
    expect(screen.getByText("cliente")).toBeInTheDocument();
    expect(screen.getByText("Nomes parecidos. São a mesma pessoa?")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d{5,}/);
  });

  test("'Sim, juntar' envia MERGE_WITH_EXISTING com o candidato, e o resultado diz com quem", async () => {
    queues = { CUSTOMER: [similarCustomer()] };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "CUSTOMER", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Sim, juntar" }));

    expect(decisionCalls()[0].slice(0, 3)).toEqual([
      "session-1",
      "c1",
      { decision: "MERGE_WITH_EXISTING", targetInternalId: "cus-1" },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent("Vai juntar com Ana P. Souza");
  });

  test("'Não, manter separadas' envia CREATE_NEW sem alvo", async () => {
    queues = { CUSTOMER: [similarCustomer()] };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "CUSTOMER", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Não, manter separadas" }));

    expect(decisionCalls()[0][2]).toEqual({ decision: "CREATE_NEW" });
    expect(Object.keys(decisionCalls()[0][2])).toEqual(["decision"]);
    expect(await screen.findByRole("status")).toHaveTextContent("Vão ficar separadas");
  });

  test("'Não importar este item' envia EXCLUDE", async () => {
    queues = { CUSTOMER: [similarCustomer()] };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "CUSTOMER", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Não importar este item" }));
    expect(decisionCalls()[0][2]).toEqual({ decision: "EXCLUDE" });
  });

  test("dois ou mais candidatos: o título é o nome do item e 'Sim, juntar' pede escolha", async () => {
    queues = {
      CUSTOMER: [
        similarCustomer({
          candidates: [
            { internalId: "cus-1", name: "Ana P. Souza" },
            { internalId: "cus-2", name: "Ana Paula Souza" },
          ],
          reasonCode: "CUSTOMER_MATCH_AMBIGUOUS",
        }),
      ],
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "CUSTOMER", needsReviewCount: 1 }] });

    const group = await screen.findByRole("radiogroup", { name: "Qual cliente da Avenly é esta pessoa?" });
    expect(screen.getByText("Ana Paula")).toBeInTheDocument();
    expect(
      screen.getByText("Mais de um cliente com o mesmo nome e telefone. Qual é a mesma pessoa?"),
    ).toBeInTheDocument();
    const join = screen.getByRole("button", { name: "Sim, juntar" });
    expect(join).toBeDisabled();
    expect(screen.getByRole("button", { name: "Não, manter separadas" })).toBeEnabled();

    await user.click(within(group).getByRole("radio", { name: "Ana Paula Souza" }));
    await user.click(join);

    expect(decisionCalls()[0][2]).toEqual({ decision: "MERGE_WITH_EXISTING", targetInternalId: "cus-2" });
    expect(await screen.findByRole("status")).toHaveTextContent("Vai juntar com Ana Paula Souza");
  });

  test("a pergunta de cada motivo", () => {
    expect(customerQuestionLabel("CUSTOMER_MATCH_SIMILAR")).toBe("Nomes parecidos. São a mesma pessoa?");
    expect(customerQuestionLabel("CUSTOMER_MATCH_AMBIGUOUS")).toBe(
      "Mais de um cliente com o mesmo nome e telefone. Qual é a mesma pessoa?",
    );
    expect(customerQuestionLabel("CUSTOMER_PHONE_SHARED")).toBe(
      "Mesmo telefone, nomes diferentes. São a mesma pessoa?",
    );
    expect(customerQuestionLabel("OUTRO")).toBe(
      "Parece alguém que já está na Avenly. São a mesma pessoa?",
    );
    expect(customerQuestionLabel(null)).toBe(
      "Parece alguém que já está na Avenly. São a mesma pessoa?",
    );
  });
});

describe("o item sem cadastro sugerido e as outras categorias", () => {
  test("sem candidato: o texto longo do motivo, INCLUDE e EXCLUDE", async () => {
    queues = {
      SERVICE: [
        itemOf({ category: "SERVICE", id: "s9", label: "Design", reasonCode: "SERVICE_DURATION_MISSING" }),
      ],
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    expect(
      await screen.findByText(/Esse serviço não tem duração informada/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Importar mesmo assim" }));
    expect(decisionCalls()[0][2]).toEqual({ decision: "INCLUDE" });
    expect(await screen.findByRole("status")).toHaveTextContent("Vai ser importado");
  });

  test("sem candidato: 'Não importar' envia EXCLUDE", async () => {
    queues = {
      SERVICE: [
        itemOf({ category: "SERVICE", id: "s9", label: "Design", reasonCode: "SERVICE_DURATION_MISSING" }),
      ],
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Não importar" }));
    expect(decisionCalls()[0][2]).toEqual({ decision: "EXCLUDE" });
    expect(await screen.findByRole("status")).toHaveTextContent("Não vai ser importado");
  });

  test("SERVICE_MATCH_* sem candidato: o cadastro sugerido sumiu, e a primeira saída é CREATE_NEW", async () => {
    queues = {
      SERVICE: [
        itemOf({
          candidates: [],
          category: "SERVICE",
          id: "s9",
          label: "Corte",
          reasonCode: "SERVICE_MATCH_SIMILAR",
        }),
      ],
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    expect(await screen.findByText("O cadastro sugerido não está mais na Avenly.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importar mesmo assim" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Criar outro serviço" }));
    expect(decisionCalls()[0][2]).toEqual({ decision: "CREATE_NEW" });
  });

  test("CUSTOMER_MATCH_* sem candidato: 'Manter separadas' envia CREATE_NEW", async () => {
    queues = {
      CUSTOMER: [
        itemOf({ category: "CUSTOMER", id: "c9", label: "Ana", reasonCode: "CUSTOMER_MATCH_SIMILAR" }),
      ],
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "CUSTOMER", needsReviewCount: 1 }] });

    expect(await screen.findByText("O cadastro sugerido não está mais na Avenly.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manter separadas" }));
    expect(decisionCalls()[0][2]).toEqual({ decision: "CREATE_NEW" });
    expect(await screen.findByRole("status")).toHaveTextContent("Vão ficar separadas");
  });

  test("horários: as duas grades, EXCLUDE e INCLUDE como antes, e o resultado", async () => {
    queues = { AVAILABILITY: [availabilityItem()] };
    const user = userEvent.setup();
    const { unmount } = renderScreen({ categories: [{ category: "AVAILABILITY", needsReviewCount: 1 }] });

    expect(await screen.findByText("Horários atuais")).toBeInTheDocument();
    expect(screen.getByText("Horários do Minha Agenda")).toBeInTheDocument();
    expect(screen.getAllByText("Segunda")).toHaveLength(2);
    expect(screen.getByText("08:00–12:00")).toBeInTheDocument();
    expect(screen.getByText("09:00–18:00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manter meus horários" }));
    expect(decisionCalls()[0][2]).toEqual({ decision: "EXCLUDE" });
    expect(await screen.findByRole("status")).toHaveTextContent("Vai manter seus horários");
    unmount();

    queues = { AVAILABILITY: [availabilityItem()] };
    renderScreen({ categories: [{ category: "AVAILABILITY", needsReviewCount: 1 }] });
    await user.click(await screen.findByRole("button", { name: "Usar os horários da Minha Agenda" }));
    expect(decisionCalls()[1][2]).toEqual({ decision: "INCLUDE" });
    expect(await screen.findByRole("status")).toHaveTextContent("Vai usar os horários da Minha Agenda");
  });

  test("agendamento: INCLUDE e EXCLUDE com o texto longo do motivo", async () => {
    queues = {
      FUTURE_APPOINTMENT: [
        itemOf({
          category: "FUTURE_APPOINTMENT",
          id: "f1",
          label: "Corte, 12/10",
          reasonCode: "APPOINTMENT_SLOT_TAKEN",
        }),
      ],
    };
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "FUTURE_APPOINTMENT", needsReviewCount: 1 }] });

    expect(await screen.findByText(/Esse horário já está ocupado/)).toBeInTheDocument();
    expect(screen.getByText("agendamento futuro")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Importar mesmo assim" }));
    expect(decisionCalls()[0][2]).toEqual({ decision: "INCLUDE" });
  });
});

describe("o envio", () => {
  test("cada pedido sai uma vez, com a chave, e os botões do cartão ficam desabilitados enquanto envia", async () => {
    queues = { SERVICE: [divergentService()] };
    let finish: () => void = () => undefined;
    decideImportItem.mockImplementation(
      () => new Promise<void>((resolve) => { finish = () => resolve(); }),
    );
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    const keep = await screen.findByRole("button", { name: "Manter o da Avenly" });
    await user.click(keep);

    expect(await screen.findByRole("button", { name: "Enviando..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Criar outro serviço" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Não importar este item" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Criar outro serviço" }));
    expect(decideImportItem).toHaveBeenCalledTimes(1);
    expect(typeof decisionCalls()[0][3]).toBe("string");

    finish();
    await screen.findByText("Vai manter o da Avenly");
    expect(decideImportItem).toHaveBeenCalledTimes(1);
  });

  test("cada pedido leva uma chave de idempotência nova", async () => {
    quadro();
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Manter o da Avenly" }));
    await screen.findByText("Vai manter o da Avenly");
    await user.click(screen.getByRole("button", { name: "Criar outro serviço" }));
    await waitFor(() => expect(decideImportItem).toHaveBeenCalledTimes(2));
    expect(decisionCalls()[0][3]).not.toBe(decisionCalls()[1][3]);
  });

  test("IMPORT_ITEM_ALREADY_DECIDED vira 'Já decidido', sem ações e sem a mensagem genérica, e o próximo abre", async () => {
    quadro();
    decideImportItem.mockRejectedValue(upstreamRefusal("IMPORT_ITEM_ALREADY_DECIDED"));
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Manter o da Avenly" }));

    expect(
      await screen.findByText("Este item já foi decidido antes de você confirmar."),
    ).toBeInTheDocument();
    expect(screen.getByText("Já decidido")).toBeInTheDocument();
    expect(
      screen.queryByText("Não foi possível registrar essa decisão agora. Tente novamente."),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /^Corte feminino/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Manter o da Avenly" })).toHaveLength(1);
  });

  test("outro erro fica no cartão com role=alert, e os botões voltam", async () => {
    queues = { SERVICE: [divergentService()] };
    decideImportItem.mockRejectedValue(upstreamRefusal("SOMETHING_ELSE", 502));
    const user = userEvent.setup();
    renderScreen({ categories: [{ category: "SERVICE", needsReviewCount: 1 }] });

    await user.click(await screen.findByRole("button", { name: "Manter o da Avenly" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível registrar essa decisão agora. Tente novamente.",
    );
    expect(screen.getByRole("button", { name: "Manter o da Avenly" })).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("o motivo curto e o resultado", () => {
  const candidate = serviceCandidate() as never;

  test("duração, preço, os dois, e o valor desconhecido da origem nunca diverge", () => {
    const reason = (proposedService: ImportItem["proposedService"]) =>
      conflictShortReason(divergentService({ candidates: [candidate], proposedService }));
    expect(reason({ durationMinutes: 50, price: 95, priceType: "FIXED" })).toBe(
      "serviço · preço e duração diferentes",
    );
    expect(reason({ durationMinutes: 50, price: 90, priceType: "FIXED" })).toBe(
      "serviço · duração diferente",
    );
    expect(reason({ durationMinutes: 45, price: 95, priceType: "FIXED" })).toBe(
      "serviço · preço diferente",
    );
    // Duração desconhecida na origem: não conta como diferença.
    expect(reason({ durationMinutes: null, price: 95, priceType: "FIXED" })).toBe(
      "serviço · preço diferente",
    );
    expect(reason({ durationMinutes: null, price: 90, priceType: "FIXED" })).toBe(
      "serviço · valores diferentes",
    );
    // Preço desconhecido (não informado ou sob consulta) na origem: idem.
    expect(reason({ durationMinutes: 50, price: null, priceType: "NOT_INFORMED" })).toBe(
      "serviço · duração diferente",
    );
    expect(reason({ durationMinutes: 45, price: null, priceType: "ON_REQUEST" })).toBe(
      "serviço · valores diferentes",
    );
    expect(reason(null)).toBe("serviço · valores diferentes");
    expect(conflictShortReason(divergentService({ candidates: [] }))).toBe(
      "serviço · valores diferentes",
    );
  });

  test("preço fixo da origem contra um cadastro sem preço fixo diverge", () => {
    expect(
      conflictShortReason(
        divergentService({
          candidates: [serviceCandidate({ price: null, priceType: "ON_REQUEST" }) as never],
          proposedService: { durationMinutes: 45, price: 90, priceType: "FIXED" },
        }),
      ),
    ).toBe("serviço · preço diferente");
  });

  test("os outros motivos", () => {
    const reason = (item: Partial<ImportItem> & Pick<ImportItem, "category">) =>
      conflictShortReason(itemOf({ id: "x", ...item }));
    expect(reason({ category: "SERVICE", reasonCode: "SERVICE_MATCH_SIMILAR" })).toBe(
      "serviço · nome parecido",
    );
    expect(reason({ category: "SERVICE", reasonCode: "SERVICE_MATCH_AMBIGUOUS" })).toBe(
      "serviço · mais de um com esse nome",
    );
    expect(reason({ category: "SERVICE", reasonCode: "SERVICE_DURATION_MISSING" })).toBe(
      "serviço · sem duração",
    );
    expect(reason({ category: "SERVICE", reasonCode: "SERVICE_PRICE_NOT_INFORMED" })).toBe("serviço");
    expect(reason({ category: "CUSTOMER", reasonCode: "CUSTOMER_MATCH_SIMILAR" })).toBe("cliente");
    expect(reason({ category: "CUSTOMER", reasonCode: null })).toBe("cliente");
    expect(reason({ category: "AVAILABILITY", reasonCode: "AVAILABILITY_REPLACES_CURRENT" })).toBe(
      "horário de atendimento",
    );
    expect(reason({ category: "FUTURE_APPOINTMENT", reasonCode: "APPOINTMENT_SLOT_TAKEN" })).toBe(
      "agendamento futuro",
    );
  });

  test("o texto longo de SERVICE_MATCH_DIVERGENT", () => {
    expect(conflictReasonLabel("SERVICE_MATCH_DIVERGENT")).toBe(
      "Esse serviço já existe na Avenly com outra duração ou outro preço. Compare e escolha qual fica.",
    );
  });

  test("o resultado de cada decisão", () => {
    expect(conflictResultLabel("SERVICE", "KEEP_EXISTING")).toBe("Vai manter o da Avenly");
    expect(conflictResultLabel("SERVICE", "CREATE_NEW")).toBe("Vai entrar como outro serviço");
    expect(conflictResultLabel("CUSTOMER", "MERGE_WITH_EXISTING", "Ana P. Souza")).toBe(
      "Vai juntar com Ana P. Souza",
    );
    expect(conflictResultLabel("CUSTOMER", "CREATE_NEW")).toBe("Vão ficar separadas");
    expect(conflictResultLabel("FUTURE_APPOINTMENT", "INCLUDE")).toBe("Vai ser importado");
    expect(conflictResultLabel("FUTURE_APPOINTMENT", "EXCLUDE")).toBe("Não vai ser importado");
    expect(conflictResultLabel("AVAILABILITY", "EXCLUDE")).toBe("Vai manter seus horários");
    expect(conflictResultLabel("AVAILABILITY", "INCLUDE")).toBe(
      "Vai usar os horários da Minha Agenda",
    );
  });
});

describe("a acessibilidade", () => {
  test("a lista do quadro, com um cartão aberto e dois fechados", async () => {
    quadro();
    const { container } = renderScreen({ readyCount: 1843 });

    await screen.findByText("Corte feminino");
    await expectNoA11yViolations(container);
  });

  test("o cartão com escolha entre candidatos e o cartão decidido", async () => {
    queues = {
      SERVICE: [
        divergentService({
          candidates: [serviceCandidate(), serviceCandidate({ internalId: "svc-9", name: "Corte B" })],
          reasonCode: "SERVICE_MATCH_AMBIGUOUS",
        }),
      ],
      CUSTOMER: [
        similarCustomer({
          candidates: [
            { internalId: "cus-1", name: "Ana P. Souza" },
            { internalId: "cus-2", name: "Ana Souza" },
          ],
        }),
      ],
    };
    const user = userEvent.setup();
    const { container } = renderScreen();

    await screen.findByRole("radiogroup", { name: "Qual serviço da Avenly é este?" });
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Criar outro serviço" }));
    await screen.findByRole("radiogroup", { name: "Qual cliente da Avenly é esta pessoa?" });
    await expectNoA11yViolations(container);
  });

  test("o cartão de horários", async () => {
    queues = { AVAILABILITY: [availabilityItem()] };
    const { container } = renderScreen({ categories: [{ category: "AVAILABILITY", needsReviewCount: 1 }] });

    await screen.findByText("Horários atuais");
    await expectNoA11yViolations(container);
  });
});

/* --- As duas entradas ------------------------------------------------------ */

function sessionOf(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
  return {
    categories: [],
    counts: { failed: 0, imported: 0, needsReview: 1, pending: 11, skipped: 0 },
    createdAt: "2026-09-15T10:00:00.000Z",
    finishedAt: null,
    interrupted: false,
    lastError: null,
    previewGeneratedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: null,
    status: "READY",
    ...overrides,
  };
}

function previewOf(): ImportPreviewSnapshot {
  const base = {
    failedCount: 0,
    importedCount: 0,
    limitationCode: null,
    limitationDetail: null,
    skippedCount: 0,
    sourceSupported: true,
  };
  return {
    categories: [
      { ...base, category: "SERVICE", discoveredCount: 12, needsReviewCount: 2, pendingCount: 10, readCount: 12, sourceReportedCount: 12 },
      { ...base, category: "CUSTOMER", discoveredCount: 386, needsReviewCount: 1, pendingCount: 385, readCount: 386, sourceReportedCount: 386 },
    ],
    generatedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    sessionId: "session-1",
  };
}

describe("a entrada pela prévia", () => {
  test("'Revisar conflitos' abre a lista com os prontos da prévia, e Continuar volta ao resumo", async () => {
    quadro();
    getImportState.mockResolvedValue({
      history: null,
      right: { available: true, completedAt: null, sessionId: "session-1" },
      session: sessionOf(),
    });
    getImportPreview.mockResolvedValue(previewOf());
    getImportProgress.mockResolvedValue({});
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ImportsScreen />
      </ShellConfigProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Revisar conflitos" }));

    expect(
      await screen.findByRole("heading", { name: "3 registros precisam da sua decisão" }),
    ).toBeInTheDocument();
    // (12 − 2) serviços e (386 − 1) clientes já estão prontos.
    expect(
      screen.getByText(
        "Encontramos dados parecidos aqui e no Minha Agenda. Os outros 395 já estão prontos.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manter o da Avenly" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByRole("heading", { name: "Encontramos isto no Minha Agenda" }),
    ).toBeInTheDocument();
  });
});

function progressOf(): ImportProgress {
  const entry = (category: ImportCategory, imported: number, needsReview: number) => ({
    category,
    failed: 0,
    failedReasons: [],
    imported,
    needsReview,
    pending: 0,
    skipped: 0,
  });
  return {
    categories: [entry("SERVICE", 10, 2), entry("CUSTOMER", 385, 1), entry("AVAILABILITY", 6, 0)],
    counts: { failed: 0, imported: 401, needsReview: 3, pending: 0, skipped: 0 },
    finishedAt: "2026-09-15T10:20:00.000Z",
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
  };
}

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "a entrada pela tela parada, na moldura %s",
  (frame) => {
    test("'Revisar pendências' abre a lista com os importados como prontos, e Continuar relê o andamento", async () => {
      quadro();
      getImportProgress.mockResolvedValue(progressOf());
      const user = userEvent.setup();
      render(
        <ImportsFrameProvider frame={frame}>
          <ImportRunScreen
            onChanged={vi.fn()}
            onReplaceAccount={vi.fn()}
            session={sessionOf({ status: "PARTIAL", startedAt: "2026-09-15T10:10:00.000Z" })}
          />
        </ImportsFrameProvider>,
      );

      await user.click(await screen.findByRole("button", { name: "Revisar pendências" }));

      expect(
        await screen.findByRole("heading", { name: "3 registros precisam da sua decisão" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Encontramos dados parecidos aqui e no Minha Agenda. Os outros 401 já estão prontos.",
        ),
      ).toBeInTheDocument();
      expect(await screen.findByText("Corte feminino")).toBeInTheDocument();

      const reads = getImportProgress.mock.calls.length;
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      await screen.findByRole("heading", { name: "Importação quase concluída" });
      expect(getImportProgress.mock.calls.length).toBeGreaterThan(reads);
    });
  },
);

/* --- O CSS ---------------------------------------------------------------- */

function readCss(): string {
  return readFileSync(
    path.join(process.cwd(), "src", "shared", "styles", "avenly-imports.css"),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n|,\\s*)${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`).exec(css);
  expect(match, selector).not.toBeNull();
  return match?.[1] ?? "";
}

describe("o CSS do 2.I6", () => {
  test("o cartão: 16 px de respiro, raio 16 px, borda #e5ded4 e fundo #fffdfa", () => {
    const body = ruleBody(readCss(), ".imports-conflict-card");
    expect(body).toMatch(/padding:\s*16px/);
    expect(body).toMatch(/border-radius:\s*16px/);
    expect(body).toMatch(/border:\s*1px solid #e5ded4/);
    expect(body).toMatch(/background:\s*#fffdfa/);
    expect(body).toMatch(/gap:\s*12px/);
  });

  test("as peças: 10 px 12 px, raio 12 px, borda #d6cec2; a escolhida, 1,5 px #0f5f63 sobre #edf4f3", () => {
    const css = readCss();
    const piece = ruleBody(css, ".imports-conflict-piece");
    expect(piece).toMatch(/padding:\s*10px 12px/);
    expect(piece).toMatch(/border-radius:\s*12px/);
    expect(piece).toMatch(/border:\s*1px solid #d6cec2/);
    expect(piece).toMatch(/box-sizing:\s*content-box/);
    const selected = ruleBody(css, ".imports-conflict-piece.is-selected");
    expect(selected).toMatch(/border:\s*1\.5px solid #0f5f63/);
    expect(selected).toMatch(/background:\s*#edf4f3/);
    const label = ruleBody(css, ".imports-conflict-piece-label");
    expect(label).toMatch(/font-size:\s*11px/);
    expect(label).toMatch(/letter-spacing:\s*0\.06em/);
    expect(label).toMatch(/text-transform:\s*uppercase/);
    expect(ruleBody(css, ".imports-conflict-pieces")).toMatch(/gap:\s*8px/);
  });

  test("os botões do cartão: 40 px, raio 12 px, borda #d6cec2, 14 px 600; o alvo de toque da ação de texto passa de 24 px", () => {
    const css = readCss();
    const button = ruleBody(css, ".imports-conflict-button");
    expect(button).toMatch(/min-height:\s*40px/);
    expect(button).toMatch(/border:\s*1px solid #d6cec2/);
    expect(button).toMatch(/border-radius:\s*12px/);
    expect(button).toMatch(/font-size:\s*14px/);
    expect(button).toMatch(/font-weight:\s*600/);
    expect(ruleBody(css, ".imports-conflict-actions")).toMatch(/gap:\s*8px/);
    const action = ruleBody(css, ".imports-conflict-text-action");
    // 12 px + 12 px de preenchimento e uma linha de 13 px: pelo menos 40 px de alvo.
    expect(action).toMatch(/padding:\s*12px 8px/);
    expect(action).toMatch(/margin:\s*-12px 0/);
  });

  test("o cartão fechado: 14 px 16 px, raio 16 px, e o chevron não encolhe", () => {
    const css = readCss();
    const closed = ruleBody(css, ".imports-conflict-closed");
    expect(closed).toMatch(/padding:\s*14px 16px/);
    expect(closed).toMatch(/border-radius:\s*16px/);
    expect(closed).toMatch(/border:\s*1px solid #e5ded4/);
    expect(ruleBody(css, ".imports-conflict-reason.is-closed")).toMatch(/font-size:\s*13px/);
    expect(ruleBody(css, ".imports-conflict-reason")).toMatch(/color:\s*#716859/);
  });

  test("o título e o rodapé: 28 px na moldura, Continuar com 52 px, raio 14 px, e a nota 12 px #716859", () => {
    const css = readCss();
    const footer = ruleBody(css, ".imports-conflicts-footer .btn");
    expect(footer).toMatch(/min-height:\s*52px/);
    expect(footer).toMatch(/border-radius:\s*14px/);
    expect(footer).toMatch(/background:\s*#0f5f63/);
    expect(footer).toMatch(/color:\s*#f7f4ef/);
    expect(ruleBody(css, ".imports-conflicts-footer span")).toMatch(/font-size:\s*12px/);
    expect(ruleBody(css, ".imports-conflicts-footer")).toMatch(/padding:\s*12px 0 0/);
    // O `h2` da moldura da plataforma recebe a cor do quadro explicitamente.
    expect(
      ruleBody(css, ".imports-page:has(.imports-conflicts) .imports-header :is(h1, h2)"),
    ).toMatch(/color:\s*#221e1a/);
  });

  test("o respiro do rodapé é 46 px no celular e 32 px de 768 px em diante", () => {
    const css = readCss();
    expect(ruleBody(css, ".imports-page:has(.imports-conflicts):not(.is-pushed)")).toMatch(
      /padding-bottom:\s*46px/,
    );
    expect(css).toMatch(
      /@media \(min-width: 768px\) \{\s*\.imports-page:has\(\.imports-conflicts\):not\(\.is-pushed\) \{\s*padding-bottom: 32px;/,
    );
  });

  test("movimento só com movimento permitido", () => {
    const css = readCss();
    const start = css.indexOf("@media (prefers-reduced-motion: no-preference) {\n  .imports-conflict-button");
    expect(start).toBeGreaterThan(0);
    const outside = css.slice(0, start);
    const rules = css.slice(css.indexOf(".imports-page:has(.imports-conflicts),"), start);
    expect(rules).not.toMatch(/transition|animation/);
    expect(outside).toContain(".imports-conflicts-footer");
  });

  test("as classes antigas sem uso saíram", () => {
    const css = readCss();
    for (const old of [
      ".imports-conflict-row",
      ".imports-conflict-items",
      ".imports-conflict-item",
      ".imports-decision-option",
    ]) {
      expect(css).not.toContain(old);
    }
  });
});
