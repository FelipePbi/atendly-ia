/**
 * Goal132/WU-03 — os alvos 2.I4 e 2.I5 do `visual:compare`: as respostas fixas
 * são válidas para o contrato real (a captura não pode provar uma tela com um
 * corpo que o BFF nunca responderia), a sessão, a prévia e o caminho falam do
 * mesmo `sessionId`, o 2.I5 difere do 2.I4 só no `selected` de
 * `PAST_APPOINTMENT` e no passo, e nenhum passo toca caixa, primário ou
 * "Conectar outra conta".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findPublicApiRoute,
  importPreviewSnapshotSchema,
  importStateSchema,
} from "@avenly-ia/public-api-contract";
import { describe, expect, test } from "vitest";

type Step = {
  clickRole?: { role: string; name: string };
  fill?: { label: string; value: string };
  press?: string;
  click?: string;
  optional?: boolean;
};

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
  steps?: Step[];
};

const FILE = "Onboarding-2-Importacao.dc.html";
const SESSION_ID = "visual-compare-import-ready";
const STATE_PATH = "/v1/calendar/imports";
const PREVIEW_PATH = `/v1/calendar/imports/${SESSION_ID}/preview`;

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

function entryOf(code: string, path: string): FixedResponse {
  const entry = target(code).responses?.find((item) => item.path === path);
  if (!entry) throw new Error(`alvo ${code} sem resposta de ${path}`);
  return entry;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stateBody(code: string): unknown {
  return clone(entryOf(code, STATE_PATH).json.data);
}

function previewBody(code: string): unknown {
  return clone(entryOf(code, PREVIEW_PATH).json.data);
}

const NEW_TARGETS = ["2.I4", "2.I5"] as const;

describe.each(NEW_TARGETS)("alvo %s do visual:compare", (code) => {
  test("usa a rota do onboarding, na conta de onboarding, na mesma rota do 2.I3", () => {
    const t = target(code);
    expect(t.route).toBe("/onboarding/importacao");
    expect(t.route).toBe(target("2.I3").route);
    expect(t.account).toBe("onboarding");
  });

  test("declara só os dois GET, com requestId, nunca escrita", () => {
    const { responses } = target(code);
    expect(responses?.map((item) => `${item.method} ${item.path}`)).toEqual([
      `GET ${STATE_PATH}`,
      `GET ${PREVIEW_PATH}`,
    ]);
    for (const item of responses ?? []) {
      expect(typeof item.json.requestId).toBe("string");
    }
  });

  test("os dois caminhos são rotas do contrato e os corpos são válidos para o schema da rota", () => {
    for (const item of target(code).responses ?? []) {
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

  test("a leitura da sessão é válida para importStateSchema e a prévia para importPreviewSnapshotSchema", () => {
    const state = importStateSchema.safeParse(stateBody(code));
    expect(state.success, JSON.stringify(state)).toBe(true);
    const preview = importPreviewSnapshotSchema.safeParse(previewBody(code));
    expect(preview.success, JSON.stringify(preview)).toBe(true);
  });

  test("o sessionId é o mesmo na sessão, no direito, na prévia e no caminho", () => {
    const state = importStateSchema.parse(stateBody(code));
    const preview = importPreviewSnapshotSchema.parse(previewBody(code));
    expect(state.session?.sessionId).toBe(SESSION_ID);
    expect(state.right.sessionId).toBe(SESSION_ID);
    expect(preview.sessionId).toBe(SESSION_ID);
    expect(PREVIEW_PATH).toContain(`/${state.session?.sessionId}/`);
    expect(JSON.stringify(target("2.I3").responses)).not.toContain(SESSION_ID);
    const i1 = targets.find((item) => item.code === "I1");
    expect(JSON.stringify(i1?.responses)).not.toContain(SESSION_ID);
  });

  test("a sessão está READY, sem início, sem interrupção, sem erro e sem histórico", () => {
    const state = importStateSchema.parse(stateBody(code));
    expect(state.right.available).toBe(true);
    expect(state.session?.status).toBe("READY");
    expect(state.session?.startedAt).toBeNull();
    expect(state.session?.finishedAt).toBeNull();
    expect(state.session?.previewVersion).toBe(1);
    expect(state.session?.interrupted).toBe(false);
    expect(state.session?.lastError).toBeNull();
    expect(state.history).toBeNull();
  });

  test("a prévia tem as cinco categorias do quadro, todas com origem suportada e sem revisão", () => {
    const preview = importPreviewSnapshotSchema.parse(previewBody(code));
    expect(preview.previewVersion).toBe(1);
    const counts = Object.fromEntries(
      preview.categories.map((item) => [item.category, item.discoveredCount]),
    );
    expect(counts).toEqual({
      SERVICE: 12,
      CUSTOMER: 386,
      FUTURE_APPOINTMENT: 42,
      PAST_APPOINTMENT: 1400,
      AVAILABILITY: 6,
    });
    for (const item of preview.categories) {
      expect(item.sourceSupported).toBe(true);
      expect(item.limitationCode).toBeNull();
      expect(item.needsReviewCount).toBe(0);
    }
  });

  test("a sessão e a prévia falam das mesmas categorias, com o mesmo número descoberto", () => {
    const state = importStateSchema.parse(stateBody(code));
    const preview = importPreviewSnapshotSchema.parse(previewBody(code));
    expect(state.session?.categories.map((item) => item.category)).toEqual(
      preview.categories.map((item) => item.category),
    );
    for (const item of state.session?.categories ?? []) {
      const found = preview.categories.find(
        (candidate) => candidate.category === item.category,
      );
      expect(item.pending).toBe(found?.discoveredCount);
      expect(item.needsReview).toBe(0);
    }
  });

  test("as notes declaram as respostas fixas, o GET da prévia e as divergências do Goal132", () => {
    const notes = target(code).notes ?? "";
    expect(notes).toContain("Goal132");
    expect(notes).toContain("readPreview");
    expect(notes).toContain("D-104");
    expect(notes).toContain("segunda a sábado");
  });
});

describe("alvo 2.I4: o resumo", () => {
  test("label e nenhum passo", () => {
    const t = target("2.I4");
    expect(t.label).toBe("Preview da importação");
    expect(t.steps).toBeUndefined();
  });

  test("as cinco categorias da sessão estão escolhidas", () => {
    const state = importStateSchema.parse(stateBody("2.I4"));
    expect(state.session?.categories).toHaveLength(5);
    for (const item of state.session?.categories ?? []) {
      expect(item.selected, item.category).toBe(true);
    }
  });

  test("as notes citam o agrupamento de cancelamentos e faltas", () => {
    expect(target("2.I4").notes).toContain("incluindo cancelamentos e faltas");
  });
});

describe("alvo 2.I5: a escolha", () => {
  test("label e um só passo, o clickRole em 'Escolher o que importar'", () => {
    const t = target("2.I5");
    expect(t.label).toBe("Escolher o que importar");
    expect(t.steps).toHaveLength(1);
    const [step] = t.steps ?? [];
    expect(step?.clickRole).toEqual({
      role: "button",
      name: "Escolher o que importar",
    });
    expect(Object.keys(step ?? {})).toEqual(["clickRole"]);
    expect(step?.optional).not.toBe(true);
  });

  test("nenhum passo toca caixa, primário ou 'Conectar outra conta'", () => {
    const touched = JSON.stringify(target("2.I5").steps);
    expect(touched).not.toMatch(
      /Importar|Conectar|checkbox|Voltar|Enter|Revisar|Analisar/,
    );
  });

  test("só 'Atendimentos anteriores' chega desmarcado", () => {
    const state = importStateSchema.parse(stateBody("2.I5"));
    for (const item of state.session?.categories ?? []) {
      expect(item.selected, item.category).toBe(
        item.category !== "PAST_APPOINTMENT",
      );
    }
  });

  test("difere do 2.I4 só no selected de PAST_APPOINTMENT (e no passo)", () => {
    type Body = {
      session: { categories: Array<{ category: string; selected: boolean }> };
    };
    const i4 = stateBody("2.I4") as Body;
    const i5 = stateBody("2.I5") as Body;
    const past = i5.session.categories.find(
      (item) => item.category === "PAST_APPOINTMENT",
    );
    expect(past?.selected).toBe(false);
    if (past) past.selected = true;
    expect(i5).toEqual(i4);
    expect(previewBody("2.I5")).toEqual(previewBody("2.I4"));
    expect(target("2.I4").steps).toBeUndefined();
    expect(target("2.I5").steps).toHaveLength(1);
  });

  test("as notes citam a soma de 446 registros e a nota do resumo por IA", () => {
    const notes = target("2.I5").notes ?? "";
    expect(notes).toContain("446");
    expect(notes).toContain("440");
    expect(notes).toContain("resumo por IA");
  });
});

describe("os outros alvos", () => {
  test("2.I1, 2.I2 e 2.I3 mantêm responses e passos de antes", () => {
    expect(target("2.I1").responses).toBeUndefined();
    expect(target("2.I1").steps).toBeUndefined();
    expect(target("2.I2").responses).toBeUndefined();
    expect(target("2.I2").steps).toHaveLength(3);
    expect(target("2.I3").responses).toHaveLength(1);
    expect(target("2.I3").steps).toBeUndefined();
  });

  test("2.I3, 2.I4 e 2.I5 são os únicos donos de responses no arquivo", () => {
    const owners = targets
      .filter((item) => item.file === FILE && item.responses !== undefined)
      .map((item) => item.code);
    expect(owners).toEqual(["2.I3", "2.I4", "2.I5"]);
  });
});
