import type {
  ImportAvailabilityGridRule,
  ImportCategory,
  ImportCompletion,
  ImportDecisionKind,
  ImportHistory,
  ImportItem,
  ImportLiveSession,
  ImportPreviewCategory,
  ImportPreviewSnapshot,
  ImportProgress,
  ImportSessionStatus,
  ImportState,
  ImportWorkErrorCode,
} from "@/data/mappers/publicApiSchemas";

// --- Importacao unica do Minha Agenda (Goal010, Goal020) --------------------
// Vocabulario da importacao para quem monta as telas (Goal020). Aqui nao ha
// tela nem estado de UI: sao os tipos do contrato, reexportados de
// `publicApiSchemas` para que a feature tenha um unico lugar de referencia —
// e e por aqui que todo arquivo de `features/imports` os importa. A lista e
// exatamente a que as telas usam: tipo reexportado sem consumidor aqui seria
// o mesmo codigo morto que este arquivo existe para nao criar.
// Substitui `features/migration/types.ts`, sem consumidor e removido neste
// Goal.
//
// Nao ha interface de porta aqui de proposito: quem implementa as operacoes
// do contrato e `BffMigrationService`, com a assinatura que ele de fato tem
// (`Idempotency-Key` explicita por mutacao). Uma segunda descricao da porta,
// sem implementador, so poderia divergir dela.
export type {
  ImportAvailabilityGridRule,
  ImportCategory,
  ImportCompletion,
  ImportDecisionKind,
  ImportHistory,
  ImportItem,
  ImportLiveSession,
  ImportPreviewCategory,
  ImportPreviewSnapshot,
  ImportProgress,
  ImportSessionStatus,
  ImportState,
  ImportWorkErrorCode,
};
