/**
 * Goal137/WU-02 — o alvo 2.I6 do `visual:compare`: as respostas fixas são
 * válidas para o contrato real (a captura não pode provar uma tela com um
 * corpo que o BFF nunca responderia), o direito, a sessão, a prévia, os
 * caminhos e as páginas de itens falam do mesmo `sessionId`, que não é o de
 * nenhum outro alvo da importação, cada página traz tantos itens
 * `NEEDS_REVIEW` quanto o `needsReviewCount` da categoria e o candidato de
 * cliente leva só `internalId` e `name`. O alvo só lê com GET e só clica em
 * "Revisar conflitos": nenhum passo grava nem toca decisão ou "Continuar".
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findPublicApiRoute,
  importItemsPageSchema,
  importPreviewSnapshotSchema,
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
const CODE = "2.I6";
const SESSION_ID = "visual-compare-import-conflicts";
const STATE_PATH = "/v1/calendar/imports";
const PREVIEW_PATH = `/v1/calendar/imports/${SESSION_ID}/preview`;
const SERVICE_PATH = `/v1/calendar/imports/${SESSION_ID}/categories/SERVICE/items`;
const CUSTOMER_PATH = `/v1/calendar/imports/${SESSION_ID}/categories/CUSTOMER/items`;
const PATHS = [STATE_PATH, PREVIEW_PATH, SERVICE_PATH, CUSTOMER_PATH];

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

function bodyOf(path: string): unknown {
  const entry = target(CODE).responses?.find((item) => item.path === path);
  if (!entry) throw new Error(`alvo ${CODE} sem resposta de ${path}`);
  return clone(entry.json.data);
}

const state = () => importStateSchema.parse(bodyOf(STATE_PATH));
const preview = () => importPreviewSnapshotSchema.parse(bodyOf(PREVIEW_PATH));
const page = (path: string) => importItemsPageSchema.parse(bodyOf(path));

describe("alvo 2.I6 do visual:compare", () => {
  test("conta de onboarding, rota do onboarding, arquivo e label do quadro", () => {
    const t = target(CODE);
    expect(t.account).toBe("onboarding");
    expect(t.route).toBe("/onboarding/importacao");
    expect(t.route).toBe(target("2.I3").route);
    expect(t.file).toBe(FILE);
    expect(t.label).toBe("Conflitos da importação");
  });

  test("declara só os quatro GET, com requestId, nunca escrita", () => {
    const { responses } = target(CODE);
    expect(responses?.map((item) => `${item.method} ${item.path}`)).toEqual(
      PATHS.map((path) => `GET ${path}`),
    );
    for (const item of responses ?? []) {
      expect(typeof item.json.requestId).toBe("string");
    }
  });

  test("cada caminho é rota do contrato e cada corpo é válido para o schema da rota", () => {
    for (const item of target(CODE).responses ?? []) {
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

  test("a leitura do estado é válida para importStateSchema, a prévia para importPreviewSnapshotSchema e as páginas para importItemsPageSchema", () => {
    expect(importStateSchema.safeParse(bodyOf(STATE_PATH)).success).toBe(true);
    expect(
      importPreviewSnapshotSchema.safeParse(bodyOf(PREVIEW_PATH)).success,
    ).toBe(true);
    for (const path of [SERVICE_PATH, CUSTOMER_PATH]) {
      expect(importItemsPageSchema.safeParse(bodyOf(path)).success, path).toBe(
        true,
      );
    }
  });

  test("o sessionId é o mesmo no direito, na sessão, na prévia, nos caminhos e nas páginas, e diferente dos outros alvos da importação", () => {
    expect(state().right.sessionId).toBe(SESSION_ID);
    expect(state().session?.sessionId).toBe(SESSION_ID);
    expect(preview().sessionId).toBe(SESSION_ID);
    for (const path of [SERVICE_PATH, CUSTOMER_PATH]) {
      expect(page(path).sessionId).toBe(SESSION_ID);
    }
    for (const path of PATHS.slice(1)) expect(path).toContain(SESSION_ID);
    for (const other of [
      "2.I3",
      "2.I4",
      "2.I5",
      "2.I7",
      "2.I8",
      "2.I9",
      "2.I10",
    ]) {
      expect(JSON.stringify(target(other).responses), other).not.toContain(
        SESSION_ID,
      );
    }
    const i1 = target("I1", "Mais-WhatsApp-Importacao-Conta.dc.html");
    expect(JSON.stringify(i1.responses)).not.toContain(SESSION_ID);
  });

  test("a sessão está READY e ainda não executada: direito disponível, sem início nem fim, sem interrupção e sem erro, histórico nulo", () => {
    const { right, session, history } = state();
    expect(right.available).toBe(true);
    expect(right.completedAt).toBeNull();
    expect(history).toBeNull();
    expect(session?.status).toBe("READY");
    expect(session?.previewVersion).toBe(1);
    expect(session?.startedAt).toBeNull();
    expect(session?.finishedAt).toBeNull();
    expect(session?.interrupted).toBe(false);
    expect(session?.lastError).toBeNull();
    expect(preview().previewVersion).toBe(session?.previewVersion);
    for (const item of session?.categories ?? []) {
      expect(item.selected, item.category).toBe(true);
    }
  });

  test("a prévia tem as categorias do 2.I4, todas sourceSupported, com needsReviewCount 2 em SERVICE, 1 em CUSTOMER e 0 nas outras", () => {
    const byCategory = Object.fromEntries(
      preview().categories.map((item) => [
        item.category,
        [item.discoveredCount, item.needsReviewCount, item.sourceSupported],
      ]),
    );
    expect(byCategory).toEqual({
      SERVICE: [12, 2, true],
      CUSTOMER: [386, 1, true],
      FUTURE_APPOINTMENT: [42, 0, true],
      PAST_APPOINTMENT: [1400, 0, true],
      AVAILABILITY: [6, 0, true],
    });
  });

  test("a sessão e a prévia contam o mesmo needsReview por categoria, e counts é a soma das categorias", () => {
    const { session } = state();
    const needsReview = Object.fromEntries(
      preview().categories.map((item) => [
        item.category,
        item.needsReviewCount,
      ]),
    );
    expect(
      Object.fromEntries(
        (session?.categories ?? []).map((item) => [
          item.category,
          item.needsReview,
        ]),
      ),
    ).toEqual(needsReview);
    const total = {
      pending: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      needsReview: 0,
    };
    for (const item of session?.categories ?? []) {
      for (const key of Object.keys(total) as (keyof typeof total)[]) {
        total[key] += item[key];
      }
    }
    expect(session?.counts).toEqual(total);
    expect(total).toEqual({
      pending: 1843,
      imported: 0,
      skipped: 0,
      failed: 0,
      needsReview: 3,
    });
  });

  test("cada página de itens é a da sua categoria, com todos NEEDS_REVIEW e o número de itens igual ao needsReviewCount", () => {
    const needsReview = Object.fromEntries(
      preview().categories.map((item) => [
        item.category,
        item.needsReviewCount,
      ]),
    );
    for (const [path, category] of [
      [SERVICE_PATH, "SERVICE"],
      [CUSTOMER_PATH, "CUSTOMER"],
    ] as const) {
      const result = page(path);
      expect(result.category).toBe(category);
      expect(result.items).toHaveLength(needsReview[category] ?? -1);
      expect(result.total).toBe(needsReview[category]);
      expect(result.offset).toBe(0);
      expect(result.limit).toBeGreaterThanOrEqual(result.items.length);
      for (const item of result.items) {
        expect(item.category, item.id).toBe(category);
        expect(item.status, item.id).toBe("NEEDS_REVIEW");
        expect(item.reasonCode, item.id).not.toBeNull();
      }
    }
  });

  test("os itens de serviço: Corte feminino e Escova, SERVICE_MATCH_DIVERGENT, cada um com candidates e proposedService", () => {
    const { items } = page(SERVICE_PATH);
    expect(items.map((item) => [item.label, item.reasonCode])).toEqual([
      ["Corte feminino", "SERVICE_MATCH_DIVERGENT"],
      ["Escova", "SERVICE_MATCH_DIVERGENT"],
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const item of items) {
      expect(item.candidates, item.id).toHaveLength(1);
      expect(item.proposedService, item.id).toBeTruthy();
    }
    expect(items[0]?.candidates).toEqual([
      {
        internalId: expect.stringMatching(/.+/) as string,
        name: "Corte feminino",
        durationMinutes: 45,
        priceType: "FIXED",
        price: 90,
        active: true,
      },
    ]);
    expect(items[0]?.proposedService).toEqual({
      durationMinutes: 50,
      priceType: "FIXED",
      price: 95,
    });
    expect(items[1]?.candidates).toEqual([
      {
        internalId: expect.stringMatching(/.+/) as string,
        name: "Escova",
        durationMinutes: 40,
        priceType: "FIXED",
        price: 70,
        active: true,
      },
    ]);
    expect(items[1]?.proposedService).toEqual({
      durationMinutes: 50,
      priceType: "FIXED",
      price: 70,
    });
  });

  test("o item de cliente: Ana Paula, CUSTOMER_MATCH_SIMILAR, com um candidato só com internalId e name e sem proposedService", () => {
    const { items } = page(CUSTOMER_PATH);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item?.label).toBe("Ana Paula");
    expect(item?.reasonCode).toBe("CUSTOMER_MATCH_SIMILAR");
    expect(item?.proposedService ?? null).toBeNull();
    expect(item?.candidates).toHaveLength(1);
    const candidate = item?.candidates?.[0] as Record<string, unknown>;
    expect(Object.keys(candidate).sort()).toEqual(["internalId", "name"]);
    expect(candidate.name).toBe("Ana P. Souza");
    expect(typeof candidate.internalId).toBe("string");
  });

  test("um telefone no candidato de cliente seria recusado pelo contrato", () => {
    const body = bodyOf(CUSTOMER_PATH) as {
      items: { candidates: Record<string, unknown>[] }[];
    };
    const candidate = body.items[0]?.candidates[0];
    expect(candidate).toBeDefined();
    if (candidate) candidate.phone = "11999990000";
    expect(importItemsPageSchema.safeParse(body).success).toBe(false);
  });

  test("só tem o clickRole no botão Revisar conflitos: nenhum passo grava nem toca decisão ou Continuar", () => {
    const { steps } = target(CODE);
    expect(steps).toEqual([
      { clickRole: { role: "button", name: "Revisar conflitos" } },
    ]);
    for (const step of steps ?? []) {
      expect(Object.keys(step)).toEqual(["clickRole"]);
      expect(step.clickRole?.name).not.toMatch(
        /Manter|Criar outro|Juntar|Mesclar|Não importar|Continuar|Concluir/,
      );
    }
  });

  test("as notes declaram as respostas fixas, a leitura sem escrita e as divergências do Goal137", () => {
    const notes = target(CODE).notes ?? "";
    expect(notes).toContain("Goal137");
    expect(notes).toContain(SESSION_ID);
    for (const path of PATHS) expect(notes).toContain(`GET ${path}`);
    expect(notes).toContain("não chama nenhuma rota de escrita");
    expect(notes).toContain("nenhum passo grava");
    for (const divergence of [
      "decidido do quadro",
      "Manter o da Avenly",
      "Criar outro serviço",
      "Não importar este item",
      "borda neutra",
      "um por vez",
      "Nomes parecidos. São a mesma pessoa?",
      "CUSTOMER_PHONE_SHARED",
      "1.843",
      "1.837",
      "D-147",
      "formatServicePrice",
      "color: var(--fg)",
      "D-145",
      "D-104",
      "chapterFraction",
      "iPhone",
      "reducedMotion",
    ]) {
      expect(notes, divergence).toContain(divergence);
    }
  });

  test("2.I3, 2.I4, 2.I5, 2.I6, 2.I7, 2.I8, 2.I9 e 2.I10 são os únicos donos de responses no arquivo", () => {
    const owners = targets
      .filter((item) => item.file === FILE && item.responses !== undefined)
      .map((item) => item.code);
    expect(owners).toEqual([
      "2.I3",
      "2.I4",
      "2.I5",
      "2.I6",
      "2.I7",
      "2.I8",
      "2.I9",
      "2.I10",
    ]);
  });
});
