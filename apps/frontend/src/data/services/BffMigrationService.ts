import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type ImportCategory,
  type ImportCategorySelectionResult,
  type ImportCompletion,
  type ImportDecision,
  type ImportDecisionKind,
  type ImportItemsPage,
  type ImportItemStatus,
  type ImportPreviewSnapshot,
  type ImportProgress,
  type ImportSessionStart,
  type ImportState,
  type ImportWorkStart,
} from "../mappers/publicApiSchemas";

export interface StartImportInput {
  sourceAccountId: string;
  sourceAccountLabel?: string | null;
  /**
   * Substitui a sessão viva por uma nova. Não existe "segunda importação":
   * substituir só é possível enquanto o negócio não concluiu.
   */
  replace?: boolean;
}

export interface ImportDecisionInput {
  decision: ImportDecisionKind;
  targetInternalId?: string;
  noteCode?: string;
}

export interface SetImportCategorySelectionInput {
  selected: boolean;
}

export interface ExecuteImportInput {
  /**
   * Versão de preview aprovada. Obrigatória: executar é executar um preview
   * que o negócio viu, e não a versão vigente qualquer que seja ela — origem
   * mudada desde a análise responde `409 IMPORT_PREVIEW_STALE`.
   */
  previewVersion: number;
  maxItems?: number;
}

/**
 * Importação única do Minha Agenda (Goal010).
 *
 * Sem tela: a experiência é do Goal019, e o que esta camada entrega é só o
 * contrato do ciclo de importação abaixo.
 */
export class BffMigrationService {
  constructor(private readonly http: BffHttpClient) {}

  /** Direito, sessão viva e histórico da importação do negócio; sem efeito. */
  getImportState(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/calendar/imports",
      schema: routeSchema<ImportState>("GET", "/v1/calendar/imports"),
      signal,
    });
  }

  /** Abre a sessão de importação do negócio. */
  startImport(
    input: StartImportInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: "/v1/calendar/imports",
      schema: routeSchema<ImportSessionStart>("POST", "/v1/calendar/imports"),
      signal,
    });
  }

  /**
   * Início curto da análise (Goal061 §1): reivindica o lease e responde
   * `202` com `{ sessionId, status, previewVersion }`, sem tocar a origem
   * nesta requisição. O preview é lido por `getImportPreview`, nunca aqui.
   */
  analyzeImport(
    sessionId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: {},
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: `/v1/calendar/imports/${encodeURIComponent(sessionId)}/analyze`,
      schema: routeSchema<ImportWorkStart>(
        "POST",
        "/v1/calendar/imports/:sessionId/analyze",
      ),
      signal,
    });
  }

  /** Lê o preview gravado pela última análise, sem reler a origem (Goal061 §4). */
  getImportPreview(sessionId: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/calendar/imports/${encodeURIComponent(sessionId)}/preview`,
      schema: routeSchema<ImportPreviewSnapshot>(
        "GET",
        "/v1/calendar/imports/:sessionId/preview",
      ),
      signal,
    });
  }

  /** Itens de uma categoria, paginados; `status` filtra os que precisam de decisão. */
  listImportItems(
    sessionId: string,
    category: ImportCategory,
    query: { status?: ImportItemStatus; limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) {
    return this.http.request({
      path: `/v1/calendar/imports/${encodeURIComponent(sessionId)}/categories/${encodeURIComponent(category)}/items`,
      query,
      schema: routeSchema<ImportItemsPage>(
        "GET",
        "/v1/calendar/imports/:sessionId/categories/:category/items",
      ),
      signal,
    });
  }

  /** Marca/desmarca uma categoria inteira; não muda `previewVersion` nem os itens. */
  setImportCategorySelection(
    sessionId: string,
    category: ImportCategory,
    input: SetImportCategorySelectionInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: `/v1/calendar/imports/${encodeURIComponent(sessionId)}/categories/${encodeURIComponent(category)}/selection`,
      schema: routeSchema<ImportCategorySelectionResult>(
        "POST",
        "/v1/calendar/imports/:sessionId/categories/:category/selection",
      ),
      signal,
    });
  }

  /** Decisão explícita sobre um item; o ator vem da sessão, nunca do corpo. */
  decideImportItem(
    sessionId: string,
    itemId: string,
    input: ImportDecisionInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: `/v1/calendar/imports/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}/decision`,
      schema: routeSchema<ImportDecision>(
        "POST",
        "/v1/calendar/imports/:sessionId/items/:itemId/decision",
      ),
      signal,
    });
  }

  /**
   * Início curto da execução (Goal061 §1), no mesmo formato da análise: `202`
   * com `{ sessionId, status, previewVersion }`. O andamento é lido por
   * `getImportProgress`, nunca devolvido aqui.
   */
  executeImport(
    sessionId: string,
    input: ExecuteImportInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: `/v1/calendar/imports/${encodeURIComponent(sessionId)}/execute`,
      schema: routeSchema<ImportWorkStart>(
        "POST",
        "/v1/calendar/imports/:sessionId/execute",
      ),
      signal,
    });
  }

  /** Progresso real, lido do banco a cada chamada. */
  getImportProgress(sessionId: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/calendar/imports/${encodeURIComponent(sessionId)}/progress`,
      schema: routeSchema<ImportProgress>(
        "GET",
        "/v1/calendar/imports/:sessionId/progress",
      ),
      signal,
    });
  }

  /**
   * Conclui a importação: decisão única e irreversível do negócio.
   * `acceptPending` é o aceite explícito quando ainda há itens pendentes.
   */
  completeImport(
    sessionId: string,
    input: { acceptPending?: boolean },
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: `/v1/calendar/imports/${encodeURIComponent(sessionId)}/complete`,
      schema: routeSchema<ImportCompletion>(
        "POST",
        "/v1/calendar/imports/:sessionId/complete",
      ),
      signal,
    });
  }
}
