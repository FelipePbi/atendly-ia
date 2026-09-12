import { type BffHttpClient } from "../http/BffHttpClient";
import {
  type CalendarSource,
  type ImportCategory,
  importCompletionSchema,
  type ImportDecisionKind,
  importDecisionSchema,
  importExecutionSchema,
  importItemsPageSchema,
  type ImportItemStatus,
  importPreviewSchema,
  importProgressSchema,
  importSessionStartSchema,
  migrationDiagnosisSchema,
  migrationSchema,
  migrationStartSchema,
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
 * Importação única do Minha Agenda (Goal010) e o protocolo antigo de migração
 * bidirecional, no mesmo serviço.
 *
 * `diagnose`/`create`/`get` continuam aqui porque as respostas já gravadas do
 * protocolo anterior precisam seguir decodificáveis até o Goal024; o caminho
 * de produto é o ciclo de importação abaixo. Sem tela: a experiência é do
 * Goal019, e o que esta camada entrega é só o contrato.
 */
export class BffMigrationService {
  constructor(private readonly http: BffHttpClient) {}

  diagnose(target: CalendarSource, signal?: AbortSignal) {
    return this.http.request({
      body: { target },
      method: "POST",
      path: "/v1/calendar/migrations/diagnose",
      schema: migrationDiagnosisSchema,
      signal,
    });
  }

  create(target: CalendarSource, signal?: AbortSignal) {
    return this.http.request({
      body: { target },
      method: "POST",
      path: "/v1/calendar/migrations",
      schema: migrationStartSchema,
      signal,
    });
  }

  get(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/calendar/migrations/${encodeURIComponent(id)}`,
      schema: migrationSchema,
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
      schema: importSessionStartSchema,
      signal,
    });
  }

  /** Analisa a origem e gera uma versão de preview; não escreve na agenda. */
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
      schema: importPreviewSchema,
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
      schema: importItemsPageSchema,
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
      schema: importDecisionSchema,
      signal,
    });
  }

  /** Executa (ou retoma) a importação da versão de preview aprovada. */
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
      schema: importExecutionSchema,
      signal,
    });
  }

  /** Progresso real, lido do banco a cada chamada. */
  getImportProgress(sessionId: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/calendar/imports/${encodeURIComponent(sessionId)}/progress`,
      schema: importProgressSchema,
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
      schema: importCompletionSchema,
      signal,
    });
  }
}
