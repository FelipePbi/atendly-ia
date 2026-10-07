/**
 * Goal134/WU-02 — o alvo 2.I10 do `visual:compare`: a resposta fixa é válida
 * para o contrato real (a captura não pode provar uma tela com um corpo que o
 * BFF nunca responderia), o direito e o histórico falam do mesmo `sessionId`,
 * que não é o de nenhum outro alvo da importação, a sessão é nula, o histórico
 * está COMPLETED sem pendência aceita, e `counts` é a soma das categorias. O
 * alvo não tem passo e só declara um GET.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findPublicApiRoute, importStateSchema } from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

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
const SESSION_ID = "visual-compare-import-done";
const STATE_PATH = "/v1/calendar/imports";

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

function stateBody(): unknown {
  const entry = target("2.I10").responses?.find(
    (item) => item.path === STATE_PATH,
  );
  if (!entry) throw new Error(`alvo 2.I10 sem resposta de ${STATE_PATH}`);
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

describe("alvo 2.I10 do visual:compare", () => {
  test("label Importação concluída, conta de onboarding, rota do onboarding e nenhum passo", () => {
    const t = target("2.I10");
    expect(t.label).toBe("Importação concluída");
    expect(t.account).toBe("onboarding");
    expect(t.route).toBe("/onboarding/importacao");
    expect(t.route).toBe(target("2.I3").route);
    expect(t.steps).toBeUndefined();
  });

  test("declara só um GET, com requestId, nunca escrita", () => {
    const { responses } = target("2.I10");
    expect(responses?.map((item) => `${item.method} ${item.path}`)).toEqual([
      `GET ${STATE_PATH}`,
    ]);
    for (const item of responses ?? []) {
      expect(typeof item.json.requestId).toBe("string");
    }
  });

  test("o caminho é rota do contrato e o corpo é válido para o schema da rota", () => {
    const [item] = target("2.I10").responses ?? [];
    const contract = findPublicApiRoute("GET", STATE_PATH);
    expect(contract, `${STATE_PATH} precisa ser rota do contrato`).toBeDefined();
    const parsed = contract?.schema.safeParse(clone(item?.json.data));
    expect(parsed?.success, JSON.stringify(parsed)).toBe(true);
  });

  test("a leitura é válida para importStateSchema", () => {
    const state = importStateSchema.safeParse(stateBody());
    expect(state.success, JSON.stringify(state)).toBe(true);
  });

  test("o sessionId é o mesmo no direito e no histórico e diferente dos outros alvos da importação", () => {
    const state = importStateSchema.parse(stateBody());
    expect(state.right.sessionId).toBe(SESSION_ID);
    expect(state.history?.sessionId).toBe(SESSION_ID);
    expect(state.right.sessionId).toBe(state.history?.sessionId);
    for (const code of ["2.I3", "2.I4", "2.I5", "2.I7"]) {
      expect(JSON.stringify(target(code).responses), code).not.toContain(
        SESSION_ID,
      );
    }
    const i1 = target("I1", "Mais-WhatsApp-Importacao-Conta.dc.html");
    expect(JSON.stringify(i1.responses)).not.toContain(SESSION_ID);
  });

  test("a session é null, o direito está indisponível e o histórico está COMPLETED, com início, fim e conclusão", () => {
    const state = importStateSchema.parse(stateBody());
    expect(state.session).toBeNull();
    expect(state.right.available).toBe(false);
    expect(state.right.completedAt).not.toBeNull();
    expect(state.history?.status).toBe("COMPLETED");
    expect(state.history?.startedAt).not.toBeNull();
    expect(state.history?.finishedAt).not.toBeNull();
    expect(state.history?.completedAt).toBe(state.right.completedAt);
  });

  test("pendingAcceptance é null", () => {
    const state = importStateSchema.parse(stateBody());
    expect(state.history?.pendingAcceptance).toBeNull();
  });

  test("counts é a soma das categorias, com as cinco do quadro", () => {
    const state = importStateSchema.parse(stateBody());
    const history = state.history;
    expect(history?.counts).toEqual(sum(history?.categories ?? []));
    expect(history?.counts).toEqual({
      pending: 0,
      imported: 1846,
      skipped: 0,
      failed: 0,
      needsReview: 0,
    });
    const imported = Object.fromEntries(
      (history?.categories ?? []).map((item) => [item.category, item.imported]),
    );
    expect(imported).toEqual({
      SERVICE: 12,
      CUSTOMER: 386,
      FUTURE_APPOINTMENT: 42,
      PAST_APPOINTMENT: 1400,
      AVAILABILITY: 6,
    });
  });

  test("todas as categorias têm a origem suportada, nada pendente, ignorado, falho ou esperando decisão", () => {
    const state = importStateSchema.parse(stateBody());
    for (const item of state.history?.categories ?? []) {
      expect(item.sourceSupported, item.category).toBe(true);
      expect(item.limitationCode, item.category).toBeNull();
      expect(item.pending, item.category).toBe(0);
      expect(item.skipped, item.category).toBe(0);
      expect(item.failed, item.category).toBe(0);
      expect(item.needsReview, item.category).toBe(0);
      expect(item.discovered, item.category).toBe(item.imported);
    }
  });

  test("as notes declaram a resposta fixa, o GET /v1/onboarding real e as divergências do Goal134", () => {
    const notes = target("2.I10").notes ?? "";
    expect(notes).toContain("Goal134");
    expect(notes).toContain(SESSION_ID);
    expect(notes).toContain("GET /v1/calendar/imports");
    expect(notes).toContain("GET /v1/onboarding");
    expect(notes).toContain("D-104");
    expect(notes).toContain("I1");
  });
});

describe("os outros alvos do arquivo", () => {
  test("2.I3, 2.I4, 2.I5, 2.I7 e 2.I10 são os únicos donos de responses; o 2.I10 não tem passo", () => {
    const owners = targets
      .filter((item) => item.file === FILE && item.responses !== undefined)
      .map((item) => item.code);
    expect(owners).toEqual(["2.I3", "2.I4", "2.I5", "2.I7", "2.I10"]);
    expect(target("2.I10").steps).toBeUndefined();
  });
});
