import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { getPrisma } from "../src/lib/prisma.js";
import { HISTORY_WINDOW_DAYS } from "../src/modules/notifications/routes.js";
import { RetentionSweepWorker } from "../src/modules/retention/RetentionSweepWorker.js";
import { RETENTION_DAYS_OPTIONS } from "../src/modules/retention/settings.js";
import {
  intentContentCutoff,
  type RetentionCutoffs,
  type RetentionPurgePorts,
  type RetentionSourceName,
  type RetentionSweepLogger,
  type RetentionSweepPrisma,
  type RetentionTenantSweepResult,
  retentionCutoffs,
  runRetentionSweep,
  sweepTenant,
} from "../src/modules/retention/sweep.js";
import {
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal023/WU-05 — a varredura de retenção contra PostgreSQL real.
 *
 * O que só o banco e o servidor HTTP inteiro provam: o lease exclui de
 * verdade duas instâncias no mesmo negócio; o fencing impede que quem perdeu
 * o lease sobrescreva o resultado de quem assumiu; uma passada abandonada no
 * meio não deixa estado inconsistente e a seguinte continua; uma store fora
 * do ar degrada só ela; o teto de linhas é respeitado e "restou trabalho" é
 * sinalizado; nenhuma rota pública dispara purga; e o desligamento do
 * servidor não fica preso pelo laço.
 *
 * O laço em si **não sobe aqui**: `RETENTION_SWEEP_ENABLED` é falso por
 * default e os testes chamam `sweepTenant`/`runRetentionSweep` diretamente.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = new Date("2026-09-15T12:00:00.000Z");

const baseOptions = {
  owner: "test-owner",
  leaseTtlSeconds: 300,
  tenantBatchLimit: 50,
  maxRowsPerStore: 25,
  // Zero nos testes que não são sobre o piso: cada caso reivindica o negócio
  // que acabou de criar, e um piso real deslocaria o caso para outro assunto.
  minTenantIntervalSeconds: 0,
};

interface PortCall {
  source: RetentionSourceName;
  tenantId: string;
  maxRows: number;
  cutoffs?: RetentionCutoffs;
  now?: Date;
}

interface FakePorts {
  ports: RetentionPurgePorts;
  calls: PortCall[];
}

/**
 * Portas de mentira, uma por store. Cada `behaviour` decide o que aquela
 * fonte faz nesta passada: devolver contagem, sinalizar trabalho restante ou
 * explodir.
 */
function fakePorts(
  behaviour: Partial<
    Record<
      RetentionSourceName,
      | { rows: number; hasMore?: boolean; tables?: Record<string, number> }
      | { throws: string }
    >
  > = {},
  hooks: Partial<Record<RetentionSourceName, () => Promise<void>>> = {},
): FakePorts {
  const calls: PortCall[] = [];

  const run = async (source: RetentionSourceName, call: PortCall) => {
    calls.push(call);
    await hooks[source]?.();
    const declared = behaviour[source];
    if (declared && "throws" in declared) {
      throw new Error(declared.throws);
    }
    const rows = declared?.rows ?? 0;
    return {
      rows,
      hasMore: declared?.hasMore ?? false,
      tables: declared?.tables ?? { Fake: rows },
    };
  };

  return {
    calls,
    ports: {
      ai: (input) =>
        run("ai", {
          source: "ai",
          tenantId: input.tenantId,
          maxRows: input.maxRows,
          cutoffs: input.cutoffs,
        }),
      scheduling: (input) =>
        run("scheduling", {
          source: "scheduling",
          tenantId: input.tenantId,
          maxRows: input.maxRows,
          now: input.now,
        }),
      notifications: (input) =>
        run("notifications", {
          source: "notifications",
          tenantId: input.tenantId,
          maxRows: input.maxRows,
          now: input.now,
        }),
    },
  };
}

function capturingLogger(): {
  logger: RetentionSweepLogger;
  info: Array<{ payload: Record<string, unknown>; message: string }>;
  error: Array<{ payload: Record<string, unknown>; message: string }>;
} {
  const info: Array<{ payload: Record<string, unknown>; message: string }> = [];
  const error: Array<{ payload: Record<string, unknown>; message: string }> =
    [];
  return {
    info,
    error,
    logger: {
      info: (payload, message) => info.push({ payload, message }),
      error: (payload, message) => error.push({ payload, message }),
    },
  };
}

function sweepState(tenantId: string) {
  return getPrisma().retentionSweepState.findUnique({ where: { tenantId } });
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe("Goal023/WU-05: cutoffs derivados do prazo do negócio", () => {
  it("deriva um instante por categoria de conteúdo de conversa, e só isso", () => {
    const cutoffs = retentionCutoffs(NOW, {
      commercialRetentionDays: 180,
      personalRetentionDays: 30,
    });

    expect(cutoffs.commercialCutoff.toISOString()).toBe(
      new Date(NOW.getTime() - 180 * DAY_MS).toISOString(),
    );
    expect(cutoffs.personalCutoff.toISOString()).toBe(
      new Date(NOW.getTime() - 30 * DAY_MS).toISOString(),
    );
    // Prazo técnico não sai de `RetentionSettings` e por isso não pertence a
    // este objeto; o único cutoff sem categoria própria é o de Não classificadas
    // (U-01, D-096), que segue o Comercial.
    expect(Object.keys(cutoffs).sort()).toEqual([
      "commercialCutoff",
      "personalCutoff",
      "unclassifiedCutoff",
    ]);
  });
});

describe("Goal080/§6.6: Não classificadas segue o prazo Comercial", () => {
  it.each(RETENTION_DAYS_OPTIONS)(
    "unclassifiedCutoff é o commercialCutoff com Comercial em %i dias, e não o Pessoal",
    (commercialDays) => {
      const personalDays = commercialDays === 30 ? 365 : 30;
      const cutoffs = retentionCutoffs(NOW, {
        commercialRetentionDays: commercialDays,
        personalRetentionDays: personalDays,
      });

      expect(cutoffs.unclassifiedCutoff.toISOString()).toBe(
        new Date(NOW.getTime() - commercialDays * DAY_MS).toISOString(),
      );
      expect(cutoffs.unclassifiedCutoff.getTime()).toBe(
        cutoffs.commercialCutoff.getTime(),
      );
      expect(cutoffs.unclassifiedCutoff.getTime()).not.toBe(
        cutoffs.personalCutoff.getTime(),
      );
    },
  );
});

describe("Goal023/§6: o prazo técnico das intenções não é o da seção Conversas", () => {
  it("sai da variável de ambiente, com o default declarado", () => {
    expect(env.RETENTION_INTENT_CONTENT_DAYS).toBe(90);
    expect(intentContentCutoff(NOW).toISOString()).toBe(
      new Date(NOW.getTime() - 90 * DAY_MS).toISOString(),
    );
  });

  it("não se move quando o negócio muda o prazo das categorias", () => {
    // 365/365 e 30/30 são os dois extremos da allowlist: se o prazo técnico
    // herdasse a seção Conversas, o cutoff mudaria entre estas duas linhas.
    const permissive = retentionCutoffs(NOW, {
      commercialRetentionDays: 365,
      personalRetentionDays: 365,
    });
    const strict = retentionCutoffs(NOW, {
      commercialRetentionDays: 30,
      personalRetentionDays: 30,
    });
    expect(permissive.personalCutoff).not.toEqual(strict.personalCutoff);
    expect(intentContentCutoff(NOW).toISOString()).toBe(
      new Date(NOW.getTime() - 90 * DAY_MS).toISOString(),
    );
  });
});

describe("Goal023/WU-05: defaults declarados do laço", () => {
  it("nasce desligado e com os tetos conservadores do diff", () => {
    expect(env.RETENTION_SWEEP_ENABLED).toBe(false);
    expect(env.RETENTION_SWEEP_INTERVAL_SECONDS).toBe(900);
    expect(env.RETENTION_SWEEP_LEASE_TTL_SECONDS).toBe(300);
    expect(env.RETENTION_SWEEP_TENANT_BATCH).toBe(20);
    expect(env.RETENTION_SWEEP_MAX_ROWS_PER_STORE).toBe(500);
    expect(env.RETENTION_SWEEP_MIN_TENANT_INTERVAL_SECONDS).toBe(3_600);
  });

  it("o worker parado nunca chamou porta nenhuma e para sem esperar tick", async () => {
    const { ports, calls } = fakePorts({ ai: { rows: 3 } });
    // Sem banco de propósito: um worker que nunca foi iniciado não pode ter
    // tocado no Prisma, e o teste falharia se ele tocasse.
    const worker = new RetentionSweepWorker(
      null as unknown as RetentionSweepPrisma,
      ports,
      { ...baseOptions, pollIntervalMs: 60_000 },
    );

    // Nunca `start()`: é o que `buildApp` faz com o laço desligado.
    const started = Date.now();
    await worker.stop();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(calls).toHaveLength(0);
  });
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal023/WU-05: varredura de retenção com lease e isolamento por fonte",
  () => {
    it("varre um negócio, calcula os cutoffs do prazo dele e liquida o lease", async () => {
      const owner = await business("sweep-basic");
      const { ports, calls } = fakePorts({
        ai: { rows: 4 },
        scheduling: { rows: 2 },
        notifications: { rows: 1 },
      });

      const result = await sweepTenant(getPrisma(), ports, owner.tenantId, {
        ...baseOptions,
        now: NOW,
      });

      expect(result.claimed).toBe(true);
      expect(result.rows).toBe(7);
      expect(result.failed).toEqual([]);
      expect(calls.map((call) => call.source)).toEqual([
        "ai",
        "scheduling",
        "notifications",
      ]);

      // Sem linha em RetentionSettings, o default do produto governa.
      const aiCall = calls.find((call) => call.source === "ai");
      expect(aiCall?.cutoffs?.commercialCutoff.toISOString()).toBe(
        new Date(NOW.getTime() - 90 * DAY_MS).toISOString(),
      );
      expect(aiCall?.cutoffs?.personalCutoff.toISOString()).toBe(
        new Date(NOW.getTime() - 30 * DAY_MS).toISOString(),
      );
      expect(aiCall?.cutoffs?.unclassifiedCutoff.toISOString()).toBe(
        new Date(NOW.getTime() - 90 * DAY_MS).toISOString(),
      );

      const state = await sweepState(owner.tenantId);
      expect(state?.leaseToken).toBeNull();
      expect(state?.leaseOwner).toBeNull();
      expect(state?.leaseExpiresAt).toBeNull();
      expect(state?.lastRunAt).toBeInstanceOf(Date);
      expect(state?.lastError).toBeNull();
      expect(state?.lastAiRows).toBe(4);
      expect(state?.lastSchedulingRows).toBe(2);
      expect(state?.lastNotificationRows).toBe(1);
      expect(state?.lastHasMore).toBe(false);
    });

    it("honra o prazo gravado pela rota pública em vez do default", async () => {
      const owner = await business("sweep-settings");
      const patch = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 365 },
      });
      expect(patch.statusCode).toBe(200);

      const { ports, calls } = fakePorts();
      await sweepTenant(getPrisma(), ports, owner.tenantId, {
        ...baseOptions,
        now: NOW,
      });

      const aiCall = calls.find((call) => call.source === "ai");
      expect(aiCall?.cutoffs?.commercialCutoff.toISOString()).toBe(
        new Date(NOW.getTime() - 365 * DAY_MS).toISOString(),
      );
      // O conteúdo das intenções não recebe cutoff de categoria nenhum: a
      // porta do Scheduling nem enxerga o prazo que o negócio escolheu.
      const schedulingCall = calls.find((call) => call.source === "scheduling");
      expect(schedulingCall?.cutoffs).toBeUndefined();
      expect(schedulingCall?.now?.toISOString()).toBe(NOW.toISOString());
    });

    it("duas instâncias não varrem o mesmo negócio ao mesmo tempo", async () => {
      const owner = await business("sweep-lease");
      const rivalResults: RetentionTenantSweepResult[] = [];

      // A segunda instância tenta reivindicar enquanto a primeira está dentro
      // da passada, com o lease vivo.
      const { ports } = fakePorts(
        { ai: { rows: 1 } },
        {
          ai: async () => {
            const rival = fakePorts({ ai: { rows: 99 } });
            rivalResults.push(
              await sweepTenant(getPrisma(), rival.ports, owner.tenantId, {
                ...baseOptions,
                owner: "rival-owner",
              }),
            );
            expect(rival.calls).toHaveLength(0);
          },
        },
      );

      const first = await sweepTenant(getPrisma(), ports, owner.tenantId, {
        ...baseOptions,
        now: NOW,
      });

      expect(first.claimed).toBe(true);
      expect(rivalResults).toHaveLength(1);
      expect(rivalResults[0]!.claimed).toBe(false);
      expect(rivalResults[0]!.rows).toBe(0);

      const state = await sweepState(owner.tenantId);
      expect(state?.lastAiRows).toBe(1);
    });

    it("quem perdeu o lease não sobrescreve o resultado de quem assumiu", async () => {
      const owner = await business("sweep-fencing");
      const prisma = getPrisma();
      const captured = capturingLogger();

      const { ports } = fakePorts(
        { ai: { rows: 11 } },
        {
          ai: async () => {
            // O lease do primeiro vence no meio da passada e o segundo assume.
            await prisma.$executeRaw`
              UPDATE "RetentionSweepState"
              SET "leaseExpiresAt" = now() - interval '1 second'
              WHERE "tenantId" = ${owner.tenantId}
            `;
            const winner = fakePorts({ ai: { rows: 22 } });
            const taken = await sweepTenant(
              prisma,
              winner.ports,
              owner.tenantId,
              { ...baseOptions, owner: "winner" },
            );
            expect(taken.claimed).toBe(true);
          },
        },
      );

      const loser = await sweepTenant(prisma, ports, owner.tenantId, {
        ...baseOptions,
        owner: "loser",
        logger: captured.logger,
      });

      expect(loser.claimed).toBe(true);
      // A liquidação do perdedor não encontrou linha: o fencing recusou.
      expect(
        captured.error.some((entry) =>
          entry.message.includes("lost its lease"),
        ),
      ).toBe(true);

      const state = await sweepState(owner.tenantId);
      expect(state?.lastAiRows).toBe(22);
      expect(state?.leaseToken).toBeNull();
    });

    it("passada interrompida no meio não deixa estado inconsistente e a seguinte continua", async () => {
      const owner = await business("sweep-resume");
      const prisma = getPrisma();

      // Exatamente o que um processo morto no meio da passada deixa: lease
      // gravado, nenhuma contagem, nenhuma liquidação.
      await prisma.$executeRaw`
        INSERT INTO "RetentionSweepState" (
          "tenantId", "leaseOwner", "leaseToken",
          "leaseAcquiredAt", "leaseExpiresAt", "createdAt", "updatedAt"
        )
        VALUES (
          ${owner.tenantId}, 'dead-instance', 'dead-token',
          now() - interval '1 hour', now() - interval '55 minutes',
          now(), now()
        )
      `;

      const abandoned = await sweepState(owner.tenantId);
      expect(abandoned?.lastRunAt).toBeNull();
      expect(abandoned?.lastAiRows).toBe(0);
      expect(abandoned?.lastError).toBeNull();

      const { ports, calls } = fakePorts({ scheduling: { rows: 5 } });
      const result = await sweepTenant(prisma, ports, owner.tenantId, {
        ...baseOptions,
        owner: "fresh-instance",
      });

      expect(result.claimed).toBe(true);
      expect(calls).toHaveLength(3);
      const state = await sweepState(owner.tenantId);
      expect(state?.leaseToken).toBeNull();
      expect(state?.lastRunAt).toBeInstanceOf(Date);
      expect(state?.lastSchedulingRows).toBe(5);
    });

    it("store indisponível degrada só ela: as outras seguem e nada é lançado", async () => {
      const owner = await business("sweep-isolation");
      const captured = capturingLogger();
      const { ports, calls } = fakePorts({
        ai: { throws: "ai-orchestrator request failed." },
        scheduling: { rows: 3 },
        notifications: { rows: 2 },
      });

      const result = await sweepTenant(getPrisma(), ports, owner.tenantId, {
        ...baseOptions,
        logger: captured.logger,
      });

      expect(result.failed).toEqual(["ai"]);
      expect(result.rows).toBe(5);
      expect(calls.map((call) => call.source)).toEqual([
        "ai",
        "scheduling",
        "notifications",
      ]);

      const state = await sweepState(owner.tenantId);
      expect(state?.lastError).toBe("ai");
      expect(state?.lastAiRows).toBe(0);
      expect(state?.lastSchedulingRows).toBe(3);
      expect(state?.lastNotificationRows).toBe(2);
      expect(state?.leaseToken).toBeNull();
    });

    it("respeita o teto por store e sinaliza que restou trabalho", async () => {
      const owner = await business("sweep-ceiling");
      const { ports, calls } = fakePorts({
        ai: { rows: 25, hasMore: true },
        scheduling: { rows: 1 },
      });

      const result = await sweepTenant(getPrisma(), ports, owner.tenantId, {
        ...baseOptions,
        maxRowsPerStore: 25,
      });

      expect(calls.every((call) => call.maxRows === 25)).toBe(true);
      expect(result.hasMore).toBe(true);
      const state = await sweepState(owner.tenantId);
      expect(state?.lastHasMore).toBe(true);
    });

    it("o log diz linhas, tabela e negócio — e nada mais", async () => {
      const owner = await business("sweep-log");
      const captured = capturingLogger();
      const { ports } = fakePorts({
        ai: { rows: 3, tables: { Message: 2, AiRun: 1 } },
      });

      await sweepTenant(getPrisma(), ports, owner.tenantId, {
        ...baseOptions,
        logger: captured.logger,
      });

      const entry = captured.info.find((item) => item.payload.source === "ai");
      expect(entry).toBeDefined();
      expect(Object.keys(entry!.payload).sort()).toEqual([
        "rows",
        "source",
        "tables",
        "tenantId",
      ]);
      expect(entry!.payload.tenantId).toBe(owner.tenantId);
      expect(entry!.payload.rows).toBe(3);
      expect(entry!.payload.tables).toEqual({ Message: 2, AiRun: 1 });
      // Fonte sem linha apagada não gera log nenhum.
      expect(
        captured.info.some((item) => item.payload.source === "scheduling"),
      ).toBe(false);
    });

    it("a passada inteira reivindica os negócios livres e pula os ocupados", async () => {
      const busy = await business("sweep-batch-busy");
      const free = await business("sweep-batch-free");
      const prisma = getPrisma();

      await prisma.$executeRaw`
        INSERT INTO "RetentionSweepState" (
          "tenantId", "leaseOwner", "leaseToken",
          "leaseAcquiredAt", "leaseExpiresAt", "createdAt", "updatedAt"
        )
        VALUES (
          ${busy.tenantId}, 'other-instance', 'other-token',
          now(), now() + interval '10 minutes', now(), now()
        )
      `;

      const { ports, calls } = fakePorts({ ai: { rows: 1 } });
      const summary = await runRetentionSweep(prisma, ports, {
        ...baseOptions,
        tenantBatchLimit: 200,
      });

      expect(summary.tenantsClaimed).toBeGreaterThanOrEqual(1);
      const swept = new Set(calls.map((call) => call.tenantId));
      expect(swept.has(free.tenantId)).toBe(true);
      // O negócio com lease vivo nem entrou na fila desta passada.
      expect(swept.has(busy.tenantId)).toBe(false);

      const busyState = await sweepState(busy.tenantId);
      expect(busyState?.leaseToken).toBe("other-token");
      expect(busyState?.lastRunAt).toBeNull();
    });

    it("nenhuma rota pública, leitura reconciliada ou tela dispara purga", async () => {
      const owner = await business("sweep-no-public-trigger");
      const prisma = getPrisma();

      // Notificação fora da janela do histórico: candidata a purga, e a
      // purga é a única coisa autorizada a apagá-la.
      const stale = await prisma.tenantNotification.create({
        data: {
          tenantId: owner.tenantId,
          kind: "IMPORT_COMPLETED" as never,
          level: "INFO" as never,
          shape: "EVENT" as never,
          dedupeKey: `IMPORT_COMPLETED:no-trigger:${owner.tenantId}`,
          occurredAt: new Date(
            Date.now() - (HISTORY_WINDOW_DAYS + 30) * DAY_MS,
          ),
          payload: {},
        },
      });

      for (const url of [
        "/v1/notifications",
        "/v1/notifications/summary",
        "/v1/settings/retention",
      ]) {
        await app.inject({ method: "GET", url, headers: browserRead(owner) });
      }
      const patch = await app.inject({
        method: "PATCH",
        url: "/v1/settings/retention",
        headers: browserMutation(owner),
        payload: { commercialRetentionDays: 30, confirmReduction: true },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().data.appliesFrom).toBe("NEXT_SWEEP");

      // Nada apagado e nenhuma varredura registrada por causa das rotas.
      expect(
        await prisma.tenantNotification.findUnique({ where: { id: stale.id } }),
      ).not.toBeNull();
      expect(await sweepState(owner.tenantId)).toBeNull();
    });

    it("o piso por negócio tira da fila quem acabou de ser varrido por inteiro", async () => {
      const owner = await business("sweep-floor");
      const prisma = getPrisma();

      const first = await runRetentionSweep(prisma, fakePorts().ports, {
        ...baseOptions,
        tenantBatchLimit: 200,
      });
      expect(first.tenantsClaimed).toBeGreaterThanOrEqual(1);
      const settled = await sweepState(owner.tenantId);
      expect(settled?.lastHasMore).toBe(false);

      // Mesma passada, agora com piso de uma hora: o negócio varrido há
      // segundos não volta à fila. Repetir não apagaria nada de novo.
      const { ports, calls } = fakePorts();
      await runRetentionSweep(prisma, ports, {
        ...baseOptions,
        tenantBatchLimit: 200,
        minTenantIntervalSeconds: 3_600,
      });
      expect(calls.map((call) => call.tenantId)).not.toContain(owner.tenantId);
    });

    it("o piso não segura quem parou no teto: sobra é continuação, não repetição", async () => {
      const owner = await business("sweep-floor-hasmore");
      const prisma = getPrisma();

      await runRetentionSweep(prisma, fakePorts({ ai: { rows: 25, hasMore: true } }).ports, {
        ...baseOptions,
        tenantBatchLimit: 200,
      });
      expect((await sweepState(owner.tenantId))?.lastHasMore).toBe(true);

      const { ports, calls } = fakePorts();
      await runRetentionSweep(prisma, ports, {
        ...baseOptions,
        tenantBatchLimit: 200,
        minTenantIntervalSeconds: 3_600,
      });
      expect(calls.map((call) => call.tenantId)).toContain(owner.tenantId);
    });

    it("a última varredura concluída avança na passada inteira e não na degradada", async () => {
      const owner = await business("sweep-completed-at");
      const prisma = getPrisma();

      async function lastSweepCompletedAt(): Promise<string | null> {
        const response = await app.inject({
          method: "GET",
          url: "/v1/settings/retention",
          headers: browserRead(owner),
        });
        return (
          response.json() as { data: { lastSweepCompletedAt: string | null } }
        ).data.lastSweepCompletedAt;
      }

      // Passada degradada primeiro: ela termina, mas não concluiu.
      await sweepTenant(
        prisma,
        fakePorts({ ai: { throws: "ai-orchestrator request failed." } }).ports,
        owner.tenantId,
        baseOptions,
      );
      expect((await sweepState(owner.tenantId))?.lastRunAt).toBeInstanceOf(Date);
      expect(await lastSweepCompletedAt()).toBeNull();

      // Passada inteira: agora sim a leitura tem o que anunciar.
      await sweepTenant(prisma, fakePorts().ports, owner.tenantId, baseOptions);
      const completed = await lastSweepCompletedAt();
      expect(completed).not.toBeNull();

      // E uma degradada depois não faz o instante retroceder nem sumir.
      await sweepTenant(
        prisma,
        fakePorts({ scheduling: { throws: "scheduling request failed." } })
          .ports,
        owner.tenantId,
        baseOptions,
      );
      expect(await lastSweepCompletedAt()).toBe(completed);
    });

    it("o servidor sobe sem o laço e fecha sem ficar preso nele", async () => {
      const other = await buildApp();
      await other.ready();

      const health = await other.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);

      const started = Date.now();
      await other.close();
      expect(Date.now() - started).toBeLessThan(5_000);
    });
  },
);
