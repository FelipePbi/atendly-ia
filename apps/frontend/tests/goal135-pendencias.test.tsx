// @vitest-environment jsdom
/**
 * Goal135 (WU-01): a tela parada é o quadro 2.I8 e a confirmação é o 2.I9, nas
 * duas molduras.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - "Importação quase concluída" é o único `h1` (onboarding), sem o eyebrow
 *   "Importação", com o cartão do sucesso ("<N> registros" / "já estão na
 *   Avenly", singular com 1) e o círculo decorativo;
 * - uma leitura de itens (`status: "NEEDS_REVIEW"`, `limit: 5`) por categoria
 *   com `needsReview`, nenhuma para as outras; no máximo 5 linhas e "Mais N em
 *   Revisar pendências.";
 * - o motivo curto e a ação por `reasonCode`, o nome acessível da ação e a
 *   abertura de `ImportConflictsScreen` na categoria do item;
 * - falha da leitura: nota com `role="status"`, sem bloquear nada;
 * - falhas e pendentes como linhas sem ação, a nota do vault e o rodapé;
 * - a confirmação (2.I9): abre sem pedido, texto do vault com o número em
 *   negrito, `{ acceptPending: true }` uma vez, "Voltar e revisar";
 * - o que não muda: retomada com `pending`, em andamento, interrompida,
 *   terminal e `ImportConflictsScreen` sem a prop nova.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ImportItem, ImportLiveSession, ImportProgress } from "@/data";
import { BffHttpError } from "@/data";
import { ImportConflictsScreen } from "@/features/imports/ImportConflictsScreen";
import { ImportRunScreen } from "@/features/imports/ImportRunScreen";
import {
  type ImportsFrame,
  ImportsFrameProvider,
} from "@/features/imports/ImportsLayout";
import {
  importReviewCopy,
  SINGLE_IMPORT_CONFIRMATION_BODY,
  SINGLE_IMPORT_CONFIRMATION_LEAD,
  SINGLE_IMPORT_CONFIRMATION_TAIL,
  SINGLE_IMPORT_CONFIRMATION_TITLE,
} from "@/features/imports/labels";

import { expectNoA11yViolations } from "./support/a11y";

const getImportProgress = vi.fn();
const getImportState = vi.fn();
const executeImport = vi.fn();
const completeImport = vi.fn();
const listImportItems = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    migration: {
      completeImport,
      decideImportItem: vi.fn(),
      executeImport,
      getImportProgress,
      getImportState,
      listImportItems,
    },
  }),
}));

type Category = ImportProgress["categories"][number];
type CategoryName = Category["category"];

function entry(
  category: CategoryName,
  counts: Partial<Omit<Category, "category" | "failedReasons">> = {},
  failedReasons: Category["failedReasons"] = [],
): Category {
  return {
    category,
    failed: 0,
    failedReasons,
    imported: 0,
    needsReview: 0,
    pending: 0,
    skipped: 0,
    ...counts,
  };
}

function sumOf(categories: Category[]): ImportProgress["counts"] {
  const counts = { failed: 0, imported: 0, needsReview: 0, pending: 0, skipped: 0 };
  for (const category of categories) {
    counts.failed += category.failed;
    counts.imported += category.imported;
    counts.needsReview += category.needsReview;
    counts.pending += category.pending;
    counts.skipped += category.skipped;
  }
  return counts;
}

/** O quadro 2.I8: 2 serviços e 1 cliente em revisão, nada mais pendente. */
function quadro(): Category[] {
  return [
    entry("SERVICE", { imported: 10, needsReview: 2 }),
    entry("CUSTOMER", { imported: 385, needsReview: 1 }),
    entry("AVAILABILITY", { imported: 6 }),
  ];
}

function progressOf(
  categories: Category[] = quadro(),
  overrides: Partial<ImportProgress> = {},
): ImportProgress {
  return {
    categories,
    counts: sumOf(categories),
    finishedAt: "2026-09-15T10:20:00.000Z",
    interrupted: false,
    lastError: null,
    previewVersion: 1,
    sessionId: "session-1",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
    ...overrides,
  };
}

function sessionOf(overrides: Partial<ImportLiveSession> = {}): ImportLiveSession {
  const categories = quadro();
  return {
    categories: categories.map((category) => ({ ...category, selected: true })),
    counts: sumOf(categories),
    createdAt: "2026-09-15T10:00:00.000Z",
    finishedAt: "2026-09-15T10:20:00.000Z",
    interrupted: false,
    lastError: null,
    previewGeneratedAt: "2026-09-15T10:05:00.000Z",
    previewVersion: 1,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    startedAt: "2026-09-15T10:10:00.000Z",
    status: "PARTIAL",
    ...overrides,
  };
}

function itemOf(
  id: string,
  category: CategoryName,
  label: string | null,
  reasonCode: string | null,
): ImportItem {
  return {
    attemptCount: 0,
    category,
    disappearedAt: null,
    entityType: null,
    externalId: id,
    id,
    internalId: null,
    label,
    lastAttemptAt: null,
    processedAt: null,
    reasonCode,
    reasonDetail: null,
    status: "NEEDS_REVIEW",
  };
}

function pageOf(category: CategoryName, items: ImportItem[], total = items.length) {
  return { category, items, limit: 5, offset: 0, sessionId: "session-1", total };
}

/** As respostas do quadro: dois serviços sem duração e um cliente sem nome. */
function quadroItems() {
  listImportItems.mockImplementation(async (_session: string, category: CategoryName) => {
    if (category === "SERVICE") {
      return pageOf("SERVICE", [
        itemOf("s1", "SERVICE", "Escova", "SERVICE_DURATION_MISSING"),
        itemOf("s2", "SERVICE", "Design de sobrancelha", "SERVICE_DURATION_MISSING"),
      ]);
    }
    return pageOf("CUSTOMER", [
      itemOf("c1", "CUSTOMER", "Cliente sem nome (origem #1042)", "CUSTOMER_NAME_MISSING"),
    ]);
  });
}

function renderRun(
  frame: ImportsFrame,
  session: ImportLiveSession = sessionOf(),
  onChanged = vi.fn(),
) {
  return render(
    <ImportsFrameProvider frame={frame}>
      <ImportRunScreen
        onChanged={onChanged}
        onReplaceAccount={vi.fn()}
        session={session}
      />
    </ImportsFrameProvider>,
  );
}

function completedState() {
  return {
    history: null,
    right: {
      available: false,
      completedAt: "2026-09-15T12:00:00.000Z",
      sessionId: "session-1",
    },
    session: null,
  };
}

function completion() {
  return {
    categories: [],
    completedAt: "2026-09-15T12:00:00.000Z",
    completedBy: "user-1",
    counts: { failed: 0, imported: 401, needsReview: 0, pending: 0, skipped: 0 },
    pendingAcceptance: null,
    provider: "MINHA_AGENDA",
    sessionId: "session-1",
    sourceAccountId: "camila@example.com",
    sourceAccountLabel: "camila@example.com",
    status: "COMPLETED",
  };
}

async function settled() {
  return screen.findByRole("heading", { name: "Importação quase concluída" });
}

beforeEach(() => {
  vi.resetAllMocks();
  getImportProgress.mockResolvedValue(progressOf());
  quadroItems();
});

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "2.I8 na moldura %s",
  (frame) => {
    test("título único, sem o eyebrow, e o cartão do sucesso com o círculo decorativo", async () => {
      const { container } = renderRun(frame);

      await settled();
      if (frame === "onboarding") {
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(
          screen.getByRole("heading", { level: 1, name: "Importação quase concluída" }),
        ).toBeInTheDocument();
      }
      expect(container.querySelector("p.eyebrow")).toBeNull();
      expect(screen.queryByText("Continuar importação")).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.getByText("401 registros")).toBeInTheDocument();
      expect(screen.getByText("já estão na Avenly")).toBeInTheDocument();
      const seal = container.querySelector(".imports-pending-seal");
      expect(seal).toHaveAttribute("aria-hidden", "true");
    });

    test("com 1 importado o cartão vai para o singular", async () => {
      getImportProgress.mockResolvedValue(
        progressOf([entry("SERVICE", { imported: 1 })], { status: "READY" }),
      );
      renderRun(frame, sessionOf({ status: "READY" }));

      await settled();
      expect(screen.getByText("1 registro")).toBeInTheDocument();
      expect(screen.getByText("já está na Avenly")).toBeInTheDocument();
    });

    test("o cabeçalho conta os itens em revisão e vai ao singular com 1", async () => {
      const { unmount } = renderRun(frame);
      expect(
        await screen.findByRole("heading", { level: 2, name: "3 registros precisam de revisão" }),
      ).toBeInTheDocument();
      unmount();

      getImportProgress.mockResolvedValue(
        progressOf([entry("CUSTOMER", { imported: 5, needsReview: 1 })]),
      );
      renderRun(frame);
      expect(
        await screen.findByRole("heading", { level: 2, name: "1 registro precisa de revisão" }),
      ).toBeInTheDocument();
    });

    test("sem item em revisão, o cabeçalho diz o que ainda não entrou e nenhuma leitura de itens é feita", async () => {
      getImportProgress.mockResolvedValue(
        progressOf([
          entry("SERVICE", { imported: 10 }),
          entry(
            "FUTURE_APPOINTMENT",
            { failed: 2, imported: 3 },
            [{ count: 2, reasonCode: "IMPORT_SERVICE_MAPPING_MISSING" }],
          ),
        ]),
      );
      renderRun(frame);

      expect(
        await screen.findByRole("heading", { level: 2, name: "2 registros ainda não entraram" }),
      ).toBeInTheDocument();
      expect(listImportItems).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Revisar pendências" })).not.toBeInTheDocument();
    });

    test("uma leitura por categoria com needsReview, filtrada e com limite 5; nenhuma para as outras", async () => {
      renderRun(frame);

      await screen.findByRole("button", { name: "Corrigir Escova" });
      expect(listImportItems).toHaveBeenCalledTimes(2);
      expect(listImportItems).toHaveBeenCalledWith(
        "session-1",
        "SERVICE",
        { limit: 5, status: "NEEDS_REVIEW" },
        expect.any(AbortSignal),
      );
      expect(listImportItems).toHaveBeenCalledWith(
        "session-1",
        "CUSTOMER",
        { limit: 5, status: "NEEDS_REVIEW" },
        expect.any(AbortSignal),
      );
      const categories = (listImportItems.mock.calls as unknown[][]).map((call) => call[1]);
      expect(categories).not.toContain("AVAILABILITY");
    });

    test("motivo curto e ação por reasonCode, com o item no nome acessível", async () => {
      renderRun(frame);

      expect(await screen.findByRole("button", { name: "Corrigir Escova" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Corrigir Design de sobrancelha" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Nomear Cliente sem nome (origem #1042)" }),
      ).toBeInTheDocument();
      expect(screen.getAllByText("sem duração · precisa de revisão")).toHaveLength(2);
      expect(screen.getByText("cliente sem nome")).toBeInTheDocument();
    });

    test("no máximo 5 linhas, e 'Mais N em Revisar pendências.' com o resto", async () => {
      getImportProgress.mockResolvedValue(
        progressOf([entry("SERVICE", { imported: 10, needsReview: 8 })]),
      );
      listImportItems.mockResolvedValue(
        pageOf(
          "SERVICE",
          [1, 2, 3, 4, 5].map((n) => itemOf(`s${n}`, "SERVICE", `Serviço ${n}`, "SERVICE_DURATION_MISSING")),
          8,
        ),
      );
      renderRun(frame);

      await screen.findByRole("button", { name: "Corrigir Serviço 1" });
      expect(screen.getAllByRole("button", { name: /^Corrigir / })).toHaveLength(5);
      expect(screen.getByText("Mais 3 em Revisar pendências.")).toBeInTheDocument();
    });

    test("seis itens lidos entre as categorias mostram só 5, na ordem das categorias", async () => {
      getImportProgress.mockResolvedValue(
        progressOf([
          entry("SERVICE", { needsReview: 4 }),
          entry("CUSTOMER", { needsReview: 3 }),
        ]),
      );
      listImportItems.mockImplementation(async (_s: string, category: CategoryName) =>
        category === "SERVICE"
          ? pageOf("SERVICE", [1, 2, 3, 4].map((n) => itemOf(`s${n}`, "SERVICE", `S${n}`, "SERVICE_DURATION_MISSING")), 4)
          : pageOf("CUSTOMER", [1, 2, 3].map((n) => itemOf(`c${n}`, "CUSTOMER", `C${n}`, "CUSTOMER_NAME_MISSING")), 3),
      );
      renderRun(frame);

      await screen.findByRole("button", { name: "Corrigir S1" });
      const actions = screen.getAllByRole("button", { name: /^(Corrigir|Nomear) / });
      expect(actions.map((button) => button.textContent)).toEqual([
        "Corrigir S1",
        "Corrigir S2",
        "Corrigir S3",
        "Corrigir S4",
        "Nomear C1",
      ]);
      expect(screen.getByText("Mais 2 em Revisar pendências.")).toBeInTheDocument();
    });

    test("item sem label vira 'Sem nome', e o motivo genérico usa a categoria no singular", async () => {
      getImportProgress.mockResolvedValue(
        progressOf([entry("FUTURE_APPOINTMENT", { imported: 4, needsReview: 1 })]),
      );
      listImportItems.mockResolvedValue(
        pageOf("FUTURE_APPOINTMENT", [itemOf("f1", "FUTURE_APPOINTMENT", null, "APPOINTMENT_SLOT_TAKEN")]),
      );
      renderRun(frame);

      expect(await screen.findByRole("button", { name: "Corrigir Sem nome" })).toBeInTheDocument();
      expect(screen.getByText("agendamento futuro · precisa de revisão")).toBeInTheDocument();
      expect(importReviewCopy(null, "CUSTOMER")).toEqual({
        action: "Corrigir",
        reason: "cliente · precisa de revisão",
      });
    });

    test("'Corrigir' e 'Nomear' abrem a categoria do item, e voltar volta ao 2.I8 relendo o andamento", async () => {
      const user = userEvent.setup();
      renderRun(frame);

      await user.click(await screen.findByRole("button", { name: "Nomear Cliente sem nome (origem #1042)" }));
      // Abre direto na categoria, sem passar pela lista.
      expect(
        screen.queryByRole("heading", { name: "Itens que precisam da sua decisão" }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(listImportItems).toHaveBeenCalledWith(
          "session-1",
          "CUSTOMER",
          { limit: 20, offset: 0, status: "NEEDS_REVIEW" },
          expect.any(AbortSignal),
        ),
      );
      const reads = getImportProgress.mock.calls.length;
      await user.click(await screen.findByRole("button", { name: "Voltar" }));

      await settled();
      await waitFor(() => expect(getImportProgress.mock.calls.length).toBeGreaterThan(reads));
    });

    test("'Revisar pendências' abre a lista de categorias", async () => {
      const user = userEvent.setup();
      renderRun(frame);

      await user.click(await screen.findByRole("button", { name: "Revisar pendências" }));

      expect(
        await screen.findByRole("heading", { name: "Itens que precisam da sua decisão" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /serviços/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /clientes/ })).toBeInTheDocument();
    });

    test("falha da leitura dos itens: nota com role=status, uma linha por categoria e ações livres", async () => {
      listImportItems.mockRejectedValue(new Error("rede"));
      const user = userEvent.setup();
      renderRun(frame);

      const note = await screen.findByRole("status");
      expect(note).toHaveTextContent("Não foi possível listar os itens agora.");
      expect(screen.getByText("2 serviços")).toBeInTheDocument();
      expect(screen.getByText("1 clientes")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Concluir importação" })).toBeEnabled();
      const review = screen.getByRole("button", { name: "Revisar pendências" });
      expect(review).toBeEnabled();
      await user.click(review);
      expect(
        await screen.findByRole("heading", { name: "Itens que precisam da sua decisão" }),
      ).toBeInTheDocument();
    });

    test("enquanto lê, o painel tem aria-busy e o cabeçalho já aparece", async () => {
      listImportItems.mockReturnValue(new Promise(() => undefined));
      renderRun(frame);

      const heading = await screen.findByRole("heading", { name: "3 registros precisam de revisão" });
      expect(heading.closest("section")).toHaveAttribute("aria-busy", "true");
    });

    test("falhas e pendentes entram como linhas sem ação, com os motivos", async () => {
      getImportProgress.mockResolvedValue(
        progressOf([
          entry("CUSTOMER", { imported: 5, needsReview: 1 }),
          entry(
            "FUTURE_APPOINTMENT",
            { failed: 2, imported: 3 },
            [{ count: 2, reasonCode: "IMPORT_SERVICE_MAPPING_MISSING" }],
          ),
          entry("PAST_APPOINTMENT", { pending: 4 }),
        ]),
      );
      renderRun(frame);

      await screen.findByRole("button", { name: /^Nomear / });
      expect(screen.getByText("Agendamentos futuros")).toBeInTheDocument();
      expect(screen.getByText("2 não importados")).toBeInTheDocument();
      expect(
        screen.getByText(/O serviço deste atendimento não veio da Minha Agenda.*\(2\)/),
      ).toBeInTheDocument();
      expect(screen.getByText("4 ainda não foram importados")).toBeInTheDocument();
    });

    test("a nota do vault e o rodapé: 'Concluir importação' primária e 'Revisar pendências' secundária", async () => {
      renderRun(frame);

      await settled();
      expect(
        screen.getByText(
          "Você pode revisar agora. O que continuar pendente não será importado quando você concluir.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/em Serviços e Clientes/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Concluir importação" })).toHaveClass("btn-primary");
      expect(screen.getByRole("button", { name: "Revisar pendências" })).toHaveClass("btn-secondary");
      expect(screen.queryByRole("button", { name: "Revisar itens" })).not.toBeInTheDocument();
    });

    test("com pending a retomada é primária e 'Concluir importação' é secundária", async () => {
      getImportProgress.mockResolvedValue(
        progressOf([entry("SERVICE", { imported: 10, pending: 636 })]),
      );
      renderRun(frame);

      expect(await screen.findByRole("button", { name: "Importar os 636 que faltam" })).toHaveClass(
        "btn-primary",
      );
      expect(screen.getByRole("button", { name: "Concluir importação" })).toHaveClass("btn-secondary");
    });

    test("sem pendência não há painel, e concluir envia {} direto", async () => {
      const user = userEvent.setup();
      getImportProgress.mockResolvedValue(
        progressOf([entry("SERVICE", { imported: 12 })], { status: "READY" }),
      );
      completeImport.mockResolvedValue(completion());
      getImportState.mockResolvedValue(completedState());
      const { container } = renderRun(frame, sessionOf({ status: "READY" }));

      await user.click(await screen.findByRole("button", { name: "Concluir importação" }));

      expect(container.querySelector(".imports-pending-panel")).toBeNull();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(completeImport).toHaveBeenCalledWith("session-1", {}, expect.any(String)),
      );
    });

    test("axe: a tela parada e a folha da confirmação", async () => {
      const user = userEvent.setup();
      const { container } = renderRun(frame);

      await screen.findByRole("button", { name: "Corrigir Escova" });
      await expectNoA11yViolations(container);
      await user.click(screen.getByRole("button", { name: "Concluir importação" }));
      await screen.findByRole("dialog");
      await expectNoA11yViolations(document.body);
    });
  },
);

describe.each<ImportsFrame>(["onboarding", "platform"])(
  "2.I9 na moldura %s",
  (frame) => {
    async function openConfirmation() {
      const user = userEvent.setup();
      renderRun(frame);
      await user.click(await screen.findByRole("button", { name: "Concluir importação" }));
      return { dialog: await screen.findByRole("dialog"), user };
    }

    test("abre sem pedido, com o título, sem o eyebrow, e o texto do vault com o número em negrito", async () => {
      const { dialog } = await openConfirmation();

      expect(completeImport).not.toHaveBeenCalled();
      expect(
        within(dialog).getByRole("heading", { name: SINGLE_IMPORT_CONFIRMATION_TITLE }),
      ).toBeInTheDocument();
      expect(within(dialog).queryByText("Isto não pode ser desfeito")).not.toBeInTheDocument();
      const copy = dialog.querySelector(".imports-confirm-copy") as HTMLElement;
      expect(copy.textContent).toBe(
        "Depois de concluir, não será possível importar novamente do Minha Agenda. 3 registros não serão importados. Deseja concluir mesmo assim?",
      );
      expect(copy.querySelector("strong")).toHaveTextContent("3 registros não serão importados.");
      expect(copy.textContent).not.toMatch(/Serviços e Clientes/);
    });

    test("o texto é o do vault: a frase cortada em três partes recompõe a constante", () => {
      expect(
        `${SINGLE_IMPORT_CONFIRMATION_LEAD} Alguns registros não serão importados. ${SINGLE_IMPORT_CONFIRMATION_TAIL}`,
      ).toBe(SINGLE_IMPORT_CONFIRMATION_BODY);
      expect(SINGLE_IMPORT_CONFIRMATION_TITLE).toBe("Esta é sua única importação.");
    });

    test("com 1 registro o negrito vai ao singular", async () => {
      getImportProgress.mockResolvedValue(
        progressOf([entry("SERVICE", { imported: 10, needsReview: 1 })]),
      );
      listImportItems.mockResolvedValue(
        pageOf("SERVICE", [itemOf("s1", "SERVICE", "Escova", "SERVICE_DURATION_MISSING")]),
      );
      const { dialog } = await openConfirmation();

      expect(dialog.querySelector("strong")).toHaveTextContent("1 registro não será importado.");
    });

    test("'Concluir importação' da folha envia {acceptPending:true} uma vez, com a chave por corpo", async () => {
      const { dialog, user } = await openConfirmation();
      completeImport.mockReturnValue(new Promise(() => undefined));

      const confirm = within(dialog).getByRole("button", { name: "Concluir importação" });
      await user.click(confirm);
      await user.click(within(dialog).getByRole("button", { name: "Concluindo..." }));

      expect(completeImport).toHaveBeenCalledTimes(1);
      expect(completeImport).toHaveBeenCalledWith(
        "session-1",
        { acceptPending: true },
        expect.any(String),
      );
    });

    test("'Voltar e revisar' fecha sem pedido e não fecha enquanto conclui", async () => {
      const { dialog, user } = await openConfirmation();

      await user.click(within(dialog).getByRole("button", { name: "Voltar e revisar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(completeImport).not.toHaveBeenCalled();

      completeImport.mockReturnValue(new Promise(() => undefined));
      await user.click(screen.getByRole("button", { name: "Concluir importação" }));
      const reopened = await screen.findByRole("dialog");
      await user.click(within(reopened).getByRole("button", { name: "Concluir importação" }));
      expect(within(reopened).getByRole("button", { name: "Voltar e revisar" })).toBeDisabled();
      await user.keyboard("{Escape}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("IMPORT_PENDING_ACCEPTANCE_REQUIRED abre a folha", async () => {
      const user = userEvent.setup();
      getImportProgress.mockResolvedValue(
        progressOf([entry("SERVICE", { imported: 12 })], { status: "READY" }),
      );
      completeImport.mockRejectedValueOnce(
        new BffHttpError({
          code: "IMPORT_PENDING_ACCEPTANCE_REQUIRED",
          message: "x",
          requestId: "r",
          status: 409,
        }),
      );
      renderRun(frame, sessionOf({ status: "READY" }));

      await user.click(await screen.findByRole("button", { name: "Concluir importação" }));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(completeImport).toHaveBeenCalledWith("session-1", {}, expect.any(String));
    });

    test("o erro da conclusão aparece com role=alert", async () => {
      const { dialog, user } = await openConfirmation();
      completeImport.mockRejectedValue(
        new BffHttpError({ code: "UPSTREAM_ERROR", message: "x", requestId: "r", status: 502 }),
      );

      await user.click(within(dialog).getByRole("button", { name: "Concluir importação" }));

      expect(
        (await within(dialog).findByRole("alert")),
      ).toHaveTextContent("Não foi possível concluir agora. Nada foi concluído. Tente novamente.");
    });
  },
);

describe("o que não muda", () => {
  test("a tela em andamento segue a do 2.I7", async () => {
    getImportProgress.mockResolvedValue(
      progressOf([entry("PAST_APPOINTMENT", { imported: 764, pending: 636 })], {
        status: "EXECUTING",
      }),
    );
    const { container } = renderRun("onboarding", sessionOf({ status: "EXECUTING" }));

    expect(await screen.findByRole("heading", { name: "Importando…" })).toBeInTheDocument();
    expect(container.querySelector(".imports-running")).not.toBeNull();
    expect(container.querySelector(".imports-pending")).toBeNull();
    expect(listImportItems).not.toHaveBeenCalled();
  });

  test("a interrompida e a terminal seguem as de hoje, sem a leitura de itens", async () => {
    getImportProgress.mockResolvedValue(
      progressOf(quadro(), { interrupted: true, status: "EXECUTING" }),
    );
    const first = renderRun("onboarding", sessionOf({ interrupted: true, status: "EXECUTING" }));
    expect(
      await screen.findByRole("heading", { name: "Isso parou no meio do caminho" }),
    ).toBeInTheDocument();
    expect(first.container.querySelector(".imports-pending")).toBeNull();
    first.unmount();

    getImportProgress.mockResolvedValue(progressOf(quadro(), { status: "FAILED" }));
    renderRun("onboarding", sessionOf({ status: "FAILED" }));
    expect(
      await screen.findByRole("heading", { name: "Esta importação não pode continuar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Falhou")).toBeInTheDocument();
    expect(listImportItems).not.toHaveBeenCalled();
  });

  test("ImportConflictsScreen sem a prop nova abre na lista de categorias", async () => {
    render(
      <ImportsFrameProvider frame="onboarding">
        <ImportConflictsScreen
          categories={[{ category: "SERVICE", needsReviewCount: 2 }]}
          onBack={vi.fn()}
          sessionId="session-1"
        />
      </ImportsFrameProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Itens que precisam da sua decisão" }),
    ).toBeInTheDocument();
    expect(listImportItems).not.toHaveBeenCalled();
  });

  test("ImportConflictsScreen com initialCategory abre na categoria e voltar sai da tela", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    listImportItems.mockResolvedValue(pageOf("SERVICE", []));
    render(
      <ImportsFrameProvider frame="onboarding">
        <ImportConflictsScreen
          categories={[{ category: "SERVICE", needsReviewCount: 2 }]}
          initialCategory="SERVICE"
          onBack={onBack}
          sessionId="session-1"
        />
      </ImportsFrameProvider>,
    );

    await waitFor(() => expect(listImportItems).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByRole("button", { name: "Voltar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
