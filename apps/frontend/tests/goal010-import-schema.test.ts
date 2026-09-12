import { describe, expect, it } from "vitest";

import {
  importCompletionSchema,
  importDecisionSchema,
  importExecutionSchema,
  importItemsPageSchema,
  importPreviewSchema,
  importProgressSchema,
  importSessionStartSchema,
  migrationDiagnosisSchema,
  migrationSchema,
  migrationStartSchema,
} from "../src/data/mappers/publicApiSchemas";

/**
 * Goal010: a importação única entra como contrato novo, e o protocolo
 * bidirecional anterior continua decodificável — as respostas de
 * `MigrationJob` já gravadas não deixam de existir porque o produto mudou de
 * caminho (o corte delas é do Goal024). Sem tela: isto é só o contrato que a
 * camada de dados precisa entender (a experiência é do Goal019).
 */

const item = {
  id: "item-1",
  category: "FUTURE_APPOINTMENT" as const,
  externalId: "100",
  label: "Corte — 2026-10-01 09:00",
  status: "NEEDS_REVIEW" as const,
  reasonCode: "APPOINTMENT_SLOT_TAKEN",
  reasonDetail: "O horário já está ocupado por um atendimento da Atendly.",
  entityType: null,
  internalId: null,
  attemptCount: 1,
  lastAttemptAt: "2026-09-12T12:00:00.000Z",
  processedAt: "2026-09-12T12:00:00.000Z",
  disappearedAt: null,
};

const counts = {
  pending: 2,
  imported: 10,
  skipped: 1,
  failed: 0,
  needsReview: 1,
};

describe("contrato da importação única (Goal010)", () => {
  it("decodifica a abertura da sessão, inclusive quando substitui a anterior", () => {
    expect(
      importSessionStartSchema.parse({
        sessionId: "session-1",
        status: "DRAFT",
        created: true,
        replacedSessionId: null,
      }),
    ).toMatchObject({ sessionId: "session-1", created: true });

    expect(
      importSessionStartSchema.parse({
        sessionId: "session-2",
        status: "DRAFT",
        created: true,
        replacedSessionId: "session-1",
      }).replacedSessionId,
    ).toBe("session-1");
  });

  it("decodifica o preview com contagens por categoria e limitação declarada", () => {
    const preview = importPreviewSchema.parse({
      sessionId: "session-1",
      previewVersion: 2,
      generatedAt: "2026-09-12T12:00:00.000Z",
      categories: [
        {
          category: "FUTURE_APPOINTMENT",
          sourceSupported: true,
          limitationCode: null,
          limitationDetail: null,
          sourceReportedCount: 12,
          readCount: 12,
          discoveredCount: 12,
          pendingCount: 12,
          needsReviewCount: 0,
          importedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        },
        {
          category: "NO_SHOW_APPOINTMENT",
          sourceSupported: false,
          limitationCode: "SOURCE_CATEGORY_UNAVAILABLE",
          limitationDetail: "A origem não distingue faltas.",
          // Categoria que a origem não fornece: contagem declarada como
          // desconhecida, nunca fabricada como zero implícito.
          sourceReportedCount: null,
          readCount: 0,
          discoveredCount: 0,
          pendingCount: 0,
          needsReviewCount: 0,
          importedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        },
      ],
      changesSincePreviousVersion: {
        newCount: 1,
        changedCount: 2,
        disappearedCount: 0,
      },
    });

    expect(preview.categories.map((category) => category.category)).toEqual([
      "FUTURE_APPOINTMENT",
      "NO_SHOW_APPOINTMENT",
    ]);
    expect(preview.categories[1].limitationCode).toBe(
      "SOURCE_CATEGORY_UNAVAILABLE",
    );
  });

  it("decodifica a página de itens e a decisão explícita de um item", () => {
    expect(
      importItemsPageSchema.parse({
        sessionId: "session-1",
        category: "FUTURE_APPOINTMENT",
        total: 1,
        limit: 50,
        offset: 0,
        items: [item],
      }).items[0].reasonCode,
    ).toBe("APPOINTMENT_SLOT_TAKEN");

    expect(
      importDecisionSchema.parse({
        item: { ...item, status: "SKIPPED", reasonCode: "USER_EXCLUDED" },
        decision: {
          id: "decision-1",
          scope: "ITEM",
          decision: "EXCLUDE",
          category: "FUTURE_APPOINTMENT",
          itemId: item.id,
          externalId: item.externalId,
          targetInternalId: null,
          noteCode: null,
          decidedBy: "user-1",
          decidedAt: "2026-09-12T12:05:00.000Z",
        },
      }).decision.decision,
    ).toBe("EXCLUDE");
  });

  it("decodifica execução parcial e progresso lido do banco", () => {
    const execution = importExecutionSchema.parse({
      sessionId: "session-1",
      previewVersion: 2,
      status: "PARTIAL",
      processed: 14,
      counts,
      categories: [{ category: "SERVICE", ...counts }],
      leaseOwner: "instance-a",
      leaseLost: false,
    });
    expect(execution.status).toBe("PARTIAL");

    const progress = importProgressSchema.parse({
      sessionId: "session-1",
      status: "PARTIAL",
      previewVersion: 2,
      startedAt: "2026-09-12T12:00:00.000Z",
      finishedAt: null,
      counts,
      categories: [{ category: "SERVICE", ...counts }],
    });
    expect(progress.counts.needsReview).toBe(1);
  });

  it("decodifica a conclusão única, com e sem aceite de pendentes", () => {
    const base = {
      sessionId: "session-1",
      provider: "MINHA_AGENDA" as const,
      sourceAccountId: "account-1",
      sourceAccountLabel: "Salão da Ana",
      status: "COMPLETED" as const,
      completedAt: "2026-09-12T12:30:00.000Z",
      completedBy: "user-1",
      counts,
      categories: [
        {
          category: "SERVICE" as const,
          ...counts,
          discovered: 14,
          sourceSupported: true,
          limitationCode: null,
        },
      ],
    };

    expect(
      importCompletionSchema.parse({ ...base, pendingAcceptance: null })
        .pendingAcceptance,
    ).toBeNull();

    expect(
      importCompletionSchema.parse({
        ...base,
        pendingAcceptance: {
          acceptedBy: "user-1",
          acceptedAt: "2026-09-12T12:30:00.000Z",
          pendingCount: 2,
        },
      }).pendingAcceptance?.pendingCount,
    ).toBe(2);
  });

  it("recusa resposta fora do contrato em vez de decodificar pela metade", () => {
    expect(() =>
      importPreviewSchema.parse({
        sessionId: "session-1",
        previewVersion: 1,
        generatedAt: "ontem",
        categories: [],
        changesSincePreviousVersion: {
          newCount: 0,
          changedCount: 0,
          disappearedCount: 0,
        },
      }),
    ).toThrow();

    expect(() =>
      importItemsPageSchema.parse({
        sessionId: "session-1",
        // Categoria que o produto não tem: melhor falhar do que inventar.
        category: "INVOICES",
        total: 0,
        limit: 50,
        offset: 0,
        items: [],
      }),
    ).toThrow();
  });

  it("mantém decodificável a resposta antiga da migração bidirecional", () => {
    expect(
      migrationDiagnosisSchema.parse({
        source: "EXTERNAL",
        target: "ATENDLY",
        supported: true,
        conflicts: [
          {
            entityType: "customer",
            externalId: "500",
            code: "DUPLICATE_PHONE",
            message: "Telefone repetido",
          },
        ],
        entities: {
          services: { total: 4, importable: 4 },
          customers: { total: 10, importable: 9 },
          appointments: { total: 30, importable: 30 },
          availability: { total: 1, importable: 1 },
        },
        warnings: [],
        limitations: [],
      }).supported,
    ).toBe(true);

    expect(
      migrationStartSchema.parse({ migrationId: "migration-1" }).migrationId,
    ).toBe("migration-1");

    expect(
      migrationSchema.parse({
        migrationId: "migration-1",
        source: "EXTERNAL",
        target: "ATENDLY",
        status: "COMPLETED",
        progress: 100,
        currentStep: null,
        summary: { services: 4 },
        warnings: [],
        limitations: [],
        error: null,
        startedAt: "2026-09-01T10:00:00.000Z",
        finishedAt: "2026-09-01T10:05:00.000Z",
        createdAt: "2026-09-01T09:59:00.000Z",
        updatedAt: "2026-09-01T10:05:00.000Z",
        conflicts: [],
      }).status,
    ).toBe("COMPLETED");
  });
});
