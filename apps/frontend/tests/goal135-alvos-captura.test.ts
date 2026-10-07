/**
 * Goal135/WU-02 — os alvos 2.I8 e 2.I9 do `visual:compare`: as respostas
 * fixas são válidas para o contrato real (a captura não pode provar uma tela
 * com um corpo que o BFF nunca responderia), o direito, a sessão, o andamento,
 * os caminhos e as páginas de itens falam do mesmo `sessionId`, que não é o de
 * nenhum outro alvo da importação, as contagens da sessão e do andamento são
 * as mesmas, `counts` é a soma das categorias (1.843 importados e 3 em
 * revisão) e cada página de itens traz só `NEEDS_REVIEW`, no número do
 * `needsReview` da categoria. Os dois alvos têm as mesmas respostas, só leem
 * com GET, o 2.I8 não tem passo e o 2.I9 só clica em "Concluir importação".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findPublicApiRoute,
  importItemsPageSchema,
  importProgressSchema,
  importStateSchema,
} from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

type FixedResponse = {
  method: string;
  path: string;
  json: { data: unknown; requestId?: string };
};

type Step = { clickRole?: { role: string; name: string } };

type Target = {
  code: string;
  file: string;
  label?: string;
  route: string;
  account?: string;
  notes?: string;
  responses?: FixedResponse[];
  steps?: Step[];
};

const FILE = "Onboarding-2-Importacao.dc.html";
const SESSION_ID = "visual-compare-import-pending";
const STATE_PATH = "/v1/calendar/imports";
const PROGRESS_PATH = `/v1/calendar/imports/${SESSION_ID}/progress`;
const SERVICE_PATH = `/v1/calendar/imports/${SESSION_ID}/categories/SERVICE/items`;
const CUSTOMER_PATH = `/v1/calendar/imports/${SESSION_ID}/categories/CUSTOMER/items`;
const PATHS = [STATE_PATH, PROGRESS_PATH, SERVICE_PATH, CUSTOMER_PATH];
const CODES = ["2.I8", "2.I9"] as const;

const targets = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../e2e/visual/targets.json"), "utf8"),
  ) as { targets: Target[] }
).targets;

function target(code: string, file = FILE): Target {
  const found = targets.find(
    (item) => item.code === code && item.file === file,
  );
  if (!found) throw new Error(`alvo ${code} ausente`);
  return found;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bodyOf(code: string, path: string): unknown {
  const entry = target(code).responses?.find((item) => item.path === path);
  if (!entry) throw new Error(`alvo ${code} sem resposta de ${path}`);
  return clone(entry.json.data);
}

type Counts = {
  pending: number;
  imported: number;
  skipped: number;
  failed: number;
  needsReview: number;
};

const COUNT_KEYS = [
  "pending",
  "imported",
  "skipped",
  "failed",
  "needsReview",
] as const;

function sum(categories: Counts[]): Counts {
  const total: Counts = {
    pending: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    needsReview: 0,
  };
  for (const item of categories) {
    for (const key of COUNT_KEYS) total[key] += item[key];
  }
  return total;
}

function countsOf(item: Counts): Counts {
  return {
    pending: item.pending,
    imported: item.imported,
    skipped: item.skipped,
    failed: item.failed,
    needsReview: item.needsReview,
  };
}

describe.each(CODES)("alvo %s do visual:compare", (code) => {
  test("conta de onboarding, rota do onboarding e mesmo arquivo dos outros alvos da importação", () => {
    const t = target(code);
    expect(t.account).toBe("onboarding");
    expect(t.route).toBe("/onboarding/importacao");
    expect(t.route).toBe(target("2.I3").route);
    expect(t.file).toBe(FILE);
  });

  test("declara só os quatro GET, com requestId, nunca escrita", () => {
    const { responses } = target(code);
    expect(responses?.map((item) => `${item.method} ${item.path}`)).toEqual(
      PATHS.map((path) => `GET ${path}`),
    );
    for (const item of responses ?? []) {
      expect(typeof item.json.requestId).toBe("string");
    }
  });

  test("cada caminho é rota do contrato e cada corpo é válido para o schema da rota", () => {
    for (const item of target(code).responses ?? []) {
      // O contrato registra o padrão (`:sessionId`, `:category`), não o caminho concreto.
      const pattern = item.path
        .replace(`/${SESSION_ID}/`, "/:sessionId/")
        .replace(/\/categories\/[A-Z_]+\//, "/categories/:category/");
      const contract = findPublicApiRoute("GET", pattern);
      expect(contract, `${pattern} precisa ser rota do contrato`).toBeDefined();
      const parsed = contract?.schema.safeParse(clone(item.json.data));
      expect(parsed?.success, `${item.path}: ${JSON.stringify(parsed)}`).toBe(
        true,
      );
    }
  });

  test("a leitura do estado é válida para importStateSchema, o andamento para importProgressSchema e as páginas para importItemsPageSchema", () => {
    expect(importStateSchema.safeParse(bodyOf(code, STATE_PATH)).success).toBe(
      true,
    );
    expect(
      importProgressSchema.safeParse(bodyOf(code, PROGRESS_PATH)).success,
    ).toBe(true);
    for (const path of [SERVICE_PATH, CUSTOMER_PATH]) {
      expect(
        importItemsPageSchema.safeParse(bodyOf(code, path)).success,
        path,
      ).toBe(true);
    }
  });

  test("o sessionId é o mesmo no direito, na sessão, no andamento, nos caminhos e nas páginas, e diferente dos outros alvos da importação", () => {
    const state = importStateSchema.parse(bodyOf(code, STATE_PATH));
    const progress = importProgressSchema.parse(bodyOf(code, PROGRESS_PATH));
    expect(state.right.sessionId).toBe(SESSION_ID);
    expect(state.session?.sessionId).toBe(SESSION_ID);
    expect(progress.sessionId).toBe(SESSION_ID);
    for (const path of [SERVICE_PATH, CUSTOMER_PATH]) {
      expect(importItemsPageSchema.parse(bodyOf(code, path)).sessionId).toBe(
        SESSION_ID,
      );
    }
    for (const path of PATHS.slice(1)) expect(path).toContain(SESSION_ID);
    for (const other of ["2.I3", "2.I4", "2.I5", "2.I7", "2.I10"]) {
      expect(JSON.stringify(target(other).responses), other).not.toContain(
        SESSION_ID,
      );
    }
    const i1 = target("I1", "Mais-WhatsApp-Importacao-Conta.dc.html");
    expect(JSON.stringify(i1.responses)).not.toContain(SESSION_ID);
  });

  test("a sessão está PARTIAL e executada: direito disponível, início e fim preenchidos, sem interrupção e sem erro, histórico nulo", () => {
    const state = importStateSchema.parse(bodyOf(code, STATE_PATH));
    expect(state.right.available).toBe(true);
    expect(state.right.completedAt).toBeNull();
    expect(state.history).toBeNull();
    expect(state.session?.status).toBe("PARTIAL");
    expect(state.session?.previewVersion).toBe(1);
    expect(state.session?.startedAt).not.toBeNull();
    expect(state.session?.finishedAt).not.toBeNull();
    expect(state.session?.interrupted).toBe(false);
    expect(state.session?.lastError).toBeNull();
    for (const item of state.session?.categories ?? []) {
      expect(item.selected, item.category).toBe(true);
    }
    const progress = importProgressSchema.parse(bodyOf(code, PROGRESS_PATH));
    expect(progress.status).toBe("PARTIAL");
    expect(progress.previewVersion).toBe(1);
    expect(progress.startedAt).toBe(state.session?.startedAt);
    expect(progress.finishedAt).toBe(state.session?.finishedAt);
    expect(progress.interrupted).toBe(false);
    expect(progress.lastError).toBeNull();
  });

  test("a sessão e o andamento têm as mesmas contagens, no total e por categoria, na mesma ordem", () => {
    const state = importStateSchema.parse(bodyOf(code, STATE_PATH));
    const progress = importProgressSchema.parse(bodyOf(code, PROGRESS_PATH));
    expect(state.session?.counts).toEqual(progress.counts);
    expect(
      (state.session?.categories ?? []).map((item) => [
        item.category,
        countsOf(item),
      ]),
    ).toEqual(
      progress.categories.map((item) => [item.category, countsOf(item)]),
    );
  });

  test("counts é a soma das categorias: 1.843 importados e 3 em revisão, sem pendente, ignorado nem falho", () => {
    const state = importStateSchema.parse(bodyOf(code, STATE_PATH));
    const progress = importProgressSchema.parse(bodyOf(code, PROGRESS_PATH));
    expect(progress.counts).toEqual(sum(progress.categories));
    expect(state.session?.counts).toEqual(sum(state.session?.categories ?? []));
    expect(progress.counts).toEqual({
      pending: 0,
      imported: 1843,
      skipped: 0,
      failed: 0,
      needsReview: 3,
    });
    const byCategory = Object.fromEntries(
      progress.categories.map((item) => [
        item.category,
        [item.imported, item.needsReview],
      ]),
    );
    expect(byCategory).toEqual({
      SERVICE: [10, 2],
      CUSTOMER: [385, 1],
      FUTURE_APPOINTMENT: [42, 0],
      PAST_APPOINTMENT: [1400, 0],
      AVAILABILITY: [6, 0],
    });
    for (const item of progress.categories) {
      expect(item.pending, item.category).toBe(0);
      expect(item.skipped, item.category).toBe(0);
      expect(item.failed, item.category).toBe(0);
      expect(item.failedReasons, item.category).toEqual([]);
    }
  });

  test("cada página de itens é a da sua categoria, com todos NEEDS_REVIEW e o total igual ao needsReview do andamento", () => {
    const progress = importProgressSchema.parse(bodyOf(code, PROGRESS_PATH));
    const needsReview = Object.fromEntries(
      progress.categories.map((item) => [item.category, item.needsReview]),
    );
    for (const [path, category] of [
      [SERVICE_PATH, "SERVICE"],
      [CUSTOMER_PATH, "CUSTOMER"],
    ] as const) {
      const page = importItemsPageSchema.parse(bodyOf(code, path));
      expect(page.category).toBe(category);
      expect(page.items).toHaveLength(needsReview[category] ?? -1);
      expect(page.total).toBe(needsReview[category]);
      expect(page.offset).toBe(0);
      expect(page.limit).toBeGreaterThanOrEqual(page.items.length);
      for (const item of page.items) {
        expect(item.category, item.id).toBe(category);
        expect(item.status, item.id).toBe("NEEDS_REVIEW");
        expect(item.reasonCode, item.id).not.toBeNull();
      }
    }
  });

  test("os itens do quadro: dois serviços sem duração e um cliente sem nome, com o label que o Scheduling grava", () => {
    const services = importItemsPageSchema.parse(bodyOf(code, SERVICE_PATH));
    expect(services.items.map((item) => [item.label, item.reasonCode])).toEqual(
      [
        ["Escova", "SERVICE_DURATION_MISSING"],
        ["Design de sobrancelha", "SERVICE_DURATION_MISSING"],
      ],
    );
    const customers = importItemsPageSchema.parse(bodyOf(code, CUSTOMER_PATH));
    expect(customers.items).toHaveLength(1);
    expect(customers.items[0]?.reasonCode).toBe("CUSTOMER_NAME_MISSING");
    expect(customers.items[0]?.label).toMatch(
      /^Cliente sem nome \(origem #\d+\)$/,
    );
  });

  test("as notes declaram as respostas fixas, a leitura sem escrita e as divergências do Goal135", () => {
    const notes = target(code).notes ?? "";
    expect(notes).toContain("Goal135");
    expect(notes).toContain(SESSION_ID);
    for (const path of PATHS) expect(notes).toContain(`GET ${path}`);
    expect(notes).toContain("não chama nenhuma rota de escrita");
    for (const divergence of [
      "1.843",
      "Cliente sem nome (origem #1042)",
      "ReplaceAccountZone",
      "D-145",
      "D-104",
      "iPhone",
      "reducedMotion",
    ]) {
      expect(notes, divergence).toContain(divergence);
    }
  });
});

describe("os dois alvos", () => {
  test("têm as mesmas respostas, caminho a caminho", () => {
    expect(target("2.I9").responses).toEqual(target("2.I8").responses);
  });

  test("labels do quadro", () => {
    expect(target("2.I8").label).toBe("Pendências da importação");
    expect(target("2.I9").label).toBe("Confirmar conclusão");
  });

  test("o 2.I8 não tem passo", () => {
    expect(target("2.I8").steps).toBeUndefined();
  });

  test("o 2.I9 só tem o clickRole no botão Concluir importação, sem tocar a folha", () => {
    const { steps, notes } = target("2.I9");
    expect(steps).toEqual([
      { clickRole: { role: "button", name: "Concluir importação" } },
    ]);
    expect(notes).toContain("outstanding > 0");
    expect(notes).toContain("nenhum passo toca");
  });

  test("o 2.I9 declara que o fundo sob o véu tem mais do que o quadro desenha, e não que é como no quadro", () => {
    const notes = target("2.I9").notes ?? "";
    expect(notes).toContain("a nota, o rodapé e a ReplaceAccountZone, que o quadro não desenha");
    expect(notes).toContain("com o círculo sem o visto");
    expect(notes).not.toContain("com o painel das pendências, como no quadro");
  });

  test("2.I3, 2.I4, 2.I5, 2.I7, 2.I8, 2.I9 e 2.I10 são os únicos donos de responses no arquivo", () => {
    const owners = targets
      .filter((item) => item.file === FILE && item.responses !== undefined)
      .map((item) => item.code);
    expect(owners).toEqual([
      "2.I3",
      "2.I4",
      "2.I5",
      "2.I7",
      "2.I8",
      "2.I9",
      "2.I10",
    ]);
  });
});
