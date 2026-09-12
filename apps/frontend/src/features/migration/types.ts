import type {
  ImportCategory,
  ImportCompletion,
  ImportDecisionKind,
  ImportExecution,
  ImportItem,
  ImportItemsPage,
  ImportItemStatus,
  ImportPreview,
  ImportProgress,
  ImportSessionStart,
  ImportSessionStatus,
} from "@/data/mappers/publicApiSchemas";

export type MigrationTarget = "atendly" | "external";
export type MigrationScenario =
  | "to-atendly-intro"
  | "to-external-intro"
  | "diagnosis"
  | "diagnosis-external"
  | "diagnosis-external-available"
  | "conflicts"
  | "review"
  | "progress"
  | "success"
  | "partial"
  | "error";
export interface MigrationService {
  diagnose(
    target: MigrationTarget,
  ): Promise<{ conflicts: number; supported: boolean }>;
  run(target: MigrationTarget): Promise<void>;
}

// --- Importacao unica do Minha Agenda (Goal010) ----------------------------
// O vocabulario da importacao para quem for montar a tela no Goal019. Aqui
// nao ha tela nem estado de UI: sao os tipos do contrato, reexportados de
// `publicApiSchemas` para que a feature tenha um unico lugar de referencia.
export type {
  ImportCategory,
  ImportCompletion,
  ImportDecisionKind,
  ImportExecution,
  ImportItem,
  ImportItemsPage,
  ImportItemStatus,
  ImportPreview,
  ImportProgress,
  ImportSessionStart,
  ImportSessionStatus,
};

/**
 * A jornada da importacao, uma etapa por operacao do contrato. Nao substitui
 * `MigrationScenario`, que descreve as telas do protocolo bidirecional
 * anterior e vive ate o Goal024.
 */
export type ImportStage =
  | "origin"
  | "preview"
  | "review"
  | "executing"
  | "partial"
  | "completed";

/**
 * Porta da importacao para a camada de apresentacao (Goal019). Espelha as
 * sete operacoes do contrato publico, sem sincronizacao e sem troca de fonte:
 * uma sessao por negocio, concluida uma unica vez.
 */
export interface ImportSessionService {
  start(input: {
    sourceAccountId: string;
    sourceAccountLabel?: string | null;
    replace?: boolean;
  }): Promise<ImportSessionStart>;
  analyze(sessionId: string): Promise<ImportPreview>;
  listItems(
    sessionId: string,
    category: ImportCategory,
    query?: { status?: ImportItemStatus; limit?: number; offset?: number },
  ): Promise<ImportItemsPage>;
  decide(
    sessionId: string,
    itemId: string,
    input: {
      decision: ImportDecisionKind;
      targetInternalId?: string;
      noteCode?: string;
    },
  ): Promise<ImportItem>;
  /** `previewVersion` e obrigatoria: executar e sempre executar o preview aprovado. */
  execute(
    sessionId: string,
    input: { previewVersion: number; maxItems?: number },
  ): Promise<ImportExecution>;
  progress(sessionId: string): Promise<ImportProgress>;
  complete(
    sessionId: string,
    input?: { acceptPending?: boolean },
  ): Promise<ImportCompletion>;
}
