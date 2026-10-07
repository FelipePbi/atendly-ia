/**
 * Goal133/WU-02 — o alvo 2.I7 do `visual:compare`: as respostas fixas são
 * válidas para o contrato real (a captura não pode provar uma tela com um corpo
 * que o BFF nunca responderia), a sessão, o direito, o andamento e o caminho
 * falam do mesmo `sessionId`, `counts` é a soma das categorias, e as categorias
 * seguem a ordem da execução: as de antes da que está em andamento sem nada
 * pendente, as de depois sem nada processado. O alvo não tem passo.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findPublicApiRoute,
  importProgressSchema,
  importStateSchema,
} from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

import { CATEGORY_ORDER } from "../src/features/imports/labels";

type FixedResponse = {
  method: string;
  path: string;
  json: { data: unknown; requestId?: string };
};

type Target = {
  code: string;
  file: string;
  label?: string;
  route: string;
  account?: string;
  notes?: string;
  responses?: FixedResponse[];
  steps?: unknown[];
};

const FILE = "Onboarding-2-Importacao.dc.html";
const SESSION_ID = "visual-compare-import-executing";
const STATE_PATH = "/v1/calendar/imports";
const PROGRESS_PATH = `/v1/calendar/imports/${SESSION_ID}/progress`;

const targets = (
  JSON.parse(
    readFileSync(resolve(__dirname, "../e2e/visual/targets.json"), "utf8"),
  ) as { targets: Target[] }
).targets;

function target(code: string): Target {
  const found = targets.find(
    (item) => item.code === code && item.file === FILE,
  );
  if (!found) throw new Error(`alvo ${code} ausente`);
  return found;
}

function entryOf(path: string): FixedResponse {
  const entry = target("2.I7").responses?.find((item) => item.path === path);
  if (!entry) throw new Error(`alvo 2.I7 sem resposta de ${path}`);
  return entry;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stateBody(): unknown {
  return clone(entryOf(STATE_PATH).json.data);
}

function progressBody(): unknown {
  return clone(entryOf(PROGRESS_PATH).json.data);
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

function processed(item: Counts): number {
  return item.imported + item.skipped + item.failed + item.needsReview;
}

describe("alvo 2.I7 do visual:compare", () => {
  test("label Importando, conta de onboarding, rota do onboarding e nenhum passo", () => {
    const t = target("2.I7");
    expect(t.label).toBe("Importando");
    expect(t.account).toBe("onboarding");
    expect(t.route).toBe("/onboarding/importacao");
    expect(t.route).toBe(target("2.I3").route);
    expect(t.steps).toBeUndefined();
  });

  test("declara só os dois GET, com requestId, nunca escrita", () => {
    const { responses } = target("2.I7");
    expect(responses?.map((item) => `${item.method} ${item.path}`)).toEqual([
      `GET ${STATE_PATH}`,
      `GET ${PROGRESS_PATH}`,
    ]);
    for (const item of responses ?? []) {
      expect(typeof item.json.requestId).toBe("string");
    }
  });

  test("os dois caminhos são rotas do contrato e os corpos são válidos para o schema da rota", () => {
    for (const item of target("2.I7").responses ?? []) {
      // O contrato registra o padrão (`:sessionId`), não o caminho concreto.
      const pattern = item.path.replace(`/${SESSION_ID}/`, "/:sessionId/");
      const contract = findPublicApiRoute("GET", pattern);
      expect(
        contract,
        `${pattern} precisa ser rota do contrato`,
      ).toBeDefined();
      const parsed = contract?.schema.safeParse(clone(item.json.data));
      expect(parsed?.success, JSON.stringify(parsed)).toBe(true);
    }
  });

  test("a leitura da sessão é válida para importStateSchema e o andamento para importProgressSchema", () => {
    const state = importStateSchema.safeParse(stateBody());
    expect(state.success, JSON.stringify(state)).toBe(true);
    const progress = importProgressSchema.safeParse(progressBody());
    expect(progress.success, JSON.stringify(progress)).toBe(true);
  });

  test("o sessionId é o mesmo na sessão, no direito, no andamento e no caminho, e diferente dos outros alvos", () => {
    const state = importStateSchema.parse(stateBody());
    const progress = importProgressSchema.parse(progressBody());
    expect(state.session?.sessionId).toBe(SESSION_ID);
    expect(state.right.sessionId).toBe(SESSION_ID);
    expect(progress.sessionId).toBe(SESSION_ID);
    expect(PROGRESS_PATH).toContain(`/${state.session?.sessionId}/`);
    for (const code of ["2.I3", "2.I4", "2.I5"]) {
      expect(JSON.stringify(target(code).responses)).not.toContain(SESSION_ID);
    }
    const i1 = targets.find((item) => item.code === "I1");
    expect(JSON.stringify(i1?.responses)).not.toContain(SESSION_ID);
  });

  test("a sessão está EXECUTING, com início, sem fim, sem interrupção, sem erro e sem histórico", () => {
    const state = importStateSchema.parse(stateBody());
    expect(state.right.available).toBe(true);
    expect(state.right.completedAt).toBeNull();
    expect(state.session?.status).toBe("EXECUTING");
    expect(state.session?.startedAt).not.toBeNull();
    expect(state.session?.finishedAt).toBeNull();
    expect(state.session?.previewVersion).toBe(1);
    expect(state.session?.interrupted).toBe(false);
    expect(state.session?.lastError).toBeNull();
    expect(state.history).toBeNull();
  });

  test("o andamento está EXECUTING, com início, sem fim, sem interrupção e sem erro, e fala da mesma versão e do mesmo início da sessão", () => {
    const state = importStateSchema.parse(stateBody());
    const progress = importProgressSchema.parse(progressBody());
    expect(progress.status).toBe("EXECUTING");
    expect(progress.startedAt).not.toBeNull();
    expect(progress.startedAt).toBe(state.session?.startedAt);
    expect(progress.finishedAt).toBeNull();
    expect(progress.previewVersion).toBe(1);
    expect(progress.previewVersion).toBe(state.session?.previewVersion);
    expect(progress.interrupted).toBe(false);
    expect(progress.lastError).toBeNull();
  });

  test("counts é a soma das categorias, na sessão e no andamento", () => {
    const state = importStateSchema.parse(stateBody());
    const progress = importProgressSchema.parse(progressBody());
    expect(state.session?.counts).toEqual(sum(state.session?.categories ?? []));
    expect(progress.counts).toEqual(sum(progress.categories));
    expect(state.session?.counts).toEqual(progress.counts);
    expect(progress.counts).toEqual({
      pending: 636,
      imported: 1210,
      skipped: 0,
      failed: 0,
      needsReview: 0,
    });
  });

  test("a sessão e o andamento falam das mesmas categorias, na mesma ordem, com as mesmas contagens, todas escolhidas", () => {
    const state = importStateSchema.parse(stateBody());
    const progress = importProgressSchema.parse(progressBody());
    expect(state.session?.categories.map((item) => item.category)).toEqual(
      progress.categories.map((item) => item.category),
    );
    for (const item of state.session?.categories ?? []) {
      const found = progress.categories.find(
        (candidate) => candidate.category === item.category,
      );
      for (const key of COUNT_KEYS) {
        expect(item[key], `${item.category}.${key}`).toBe(found?.[key]);
      }
      expect(item.selected, item.category).toBe(true);
    }
  });

  test("as categorias seguem a ordem da execução, com as cinco do quadro", () => {
    const progress = importProgressSchema.parse(progressBody());
    const names = progress.categories.map((item) => item.category);
    expect(names).toEqual([
      "SERVICE",
      "CUSTOMER",
      "AVAILABILITY",
      "FUTURE_APPOINTMENT",
      "PAST_APPOINTMENT",
    ]);
    expect(names).toEqual(
      CATEGORY_ORDER.filter((category) => names.includes(category)),
    );
  });

  test("antes da categoria em andamento tudo está concluído (pending 0) e depois dela nada foi processado", () => {
    const progress = importProgressSchema.parse(progressBody());
    const current = progress.categories.findIndex((item) => item.pending > 0);
    expect(current, "precisa haver uma categoria em andamento").toBeGreaterThan(
      -1,
    );
    const running = progress.categories[current];
    expect(running?.category).toBe("PAST_APPOINTMENT");
    expect(running?.imported).toBe(764);
    expect(running?.pending).toBe(636);
    expect(processed(running as Counts)).toBeGreaterThan(0);
    for (const [index, item] of progress.categories.entries()) {
      if (index < current) {
        expect(item.pending, `${item.category} antes da em andamento`).toBe(0);
        expect(item.imported, item.category).toBeGreaterThan(0);
      }
      if (index > current) {
        expect(processed(item), `${item.category} depois da em andamento`).toBe(
          0,
        );
      }
    }
    expect(
      progress.categories.slice(0, current).map((item) => item.imported),
    ).toEqual([12, 386, 6, 42]);
  });

  test("nenhuma categoria tem ignorado, falha ou item esperando decisão, e failedReasons está vazio", () => {
    const progress = importProgressSchema.parse(progressBody());
    for (const item of progress.categories) {
      expect(item.skipped, item.category).toBe(0);
      expect(item.failed, item.category).toBe(0);
      expect(item.needsReview, item.category).toBe(0);
      expect(item.failedReasons, item.category).toEqual([]);
    }
  });

  test("as notes declaram as respostas fixas, o caminho do andamento e as divergências do Goal133", () => {
    const notes = target("2.I7").notes ?? "";
    expect(notes).toContain("Goal133");
    expect(notes).toContain(PROGRESS_PATH);
    expect(notes).toContain("ReplaceAccountZone");
    expect(notes).toContain("D-104");
    expect(notes).toContain("D-145");
  });
});

describe("pendências do review132", () => {
  test("as notes do 2.I4 citam a ReplaceAccountZone abaixo do rodapé e o chevron do topo, e mantêm o resto", () => {
    const notes = target("2.I4").notes ?? "";
    expect(notes).toContain("ReplaceAccountZone");
    expect(notes).toContain("abaixo do rodapé");
    expect(notes).toContain("chevron do topo");
    expect(notes).toContain("Goal132");
    expect(notes).toContain("readPreview");
    expect(notes).toContain("D-104");
    expect(notes).toContain("segunda a sábado");
    expect(notes).toContain("incluindo cancelamentos e faltas");
  });

  test("o 2.I4 não mudou além das notes: label, rota, conta, passos e respostas", () => {
    const t = target("2.I4");
    expect(t.label).toBe("Preview da importação");
    expect(t.route).toBe("/onboarding/importacao");
    expect(t.account).toBe("onboarding");
    expect(t.steps).toBeUndefined();
    expect(t.responses?.map((item) => `${item.method} ${item.path}`)).toEqual([
      "GET /v1/calendar/imports",
      "GET /v1/calendar/imports/visual-compare-import-ready/preview",
    ]);
  });
});

describe("os outros alvos do arquivo", () => {
  test("2.I3, 2.I4, 2.I5, 2.I6, 2.I7, 2.I8, 2.I9 e 2.I10 são os únicos donos de responses; o 2.I7 não tem passo (o 2.I10 entrou no Goal134 e o 2.I8 e o 2.I9 no Goal135 e o 2.I6 no Goal137)", () => {
    const owners = targets
      .filter((item) => item.file === FILE && item.responses !== undefined)
      .map((item) => item.code);
    expect(owners).toEqual(["2.I3", "2.I4", "2.I5", "2.I6", "2.I7", "2.I8", "2.I9", "2.I10"]);
    expect(target("2.I7").steps).toBeUndefined();
  });
});
