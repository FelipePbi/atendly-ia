import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { EvolutionClient } from "../src/clients/evolution/index.js";
import { env } from "../src/config/env.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  ACCOUNT_PURGE_ACTOR,
  ACCOUNT_PURGE_STORE_ORDER,
  type AccountPurgeLogger,
  type AccountPurgePorts,
  type AccountPurgePrisma,
  defaultAccountPurgePorts,
  type LocalAccountPurgeResult,
  purgeAccount,
  purgeLocalAccount,
  type RemoteTenantPurgeResult,
  runAccountPurge,
} from "../src/modules/account/purge.js";
import { AccountPurgeWorker } from "../src/modules/account/worker.js";
import { sealedInstanceCredentialData } from "../src/modules/whatsapp/instance-link.js";
import {
  assertDisposableTarget,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal025/WU-07 — a purga efetiva no vencimento.
 *
 * O que só o PostgreSQL real prova: o lease exclui de verdade duas instâncias
 * na mesma conta; o fencing impede que quem perdeu o lease sobrescreva o
 * resultado de quem assumiu; a ordem entre as lojas é a declarada e o `User`
 * cai por último; uma passada que morre no meio deixa estado retomável e a
 * seguinte conclui sozinha; purgar de novo não é erro; o teto por passada
 * segura o trabalho e o sinaliza; e a linha de exclusão sobrevive a tudo sem
 * carregar dado pessoal.
 *
 * O laço **não sobe aqui**: `ACCOUNT_PURGE_ENABLED` é falso por default e os
 * testes chamam `purgeAccount`/`runAccountPurge` diretamente. Só o
 * desligamento do laço é exercitado, e sem nunca iniciá-lo.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

const DAY_MS = 24 * 60 * 60 * 1_000;

const baseOptions = {
  owner: "test-owner",
  leaseTtlSeconds: 300,
  accountBatchLimit: 5,
  maxRowsPerStore: 250,
};

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

/** Pedido de exclusão já vencido: é o único estado que a purga atende. */
async function scheduleDeletion(
  session: SessionHandle,
  options: { dueInDays?: number } = {},
) {
  const requestedAt = new Date(Date.now() - 8 * DAY_MS);
  const dueAt = new Date(Date.now() + (options.dueInDays ?? -1) * DAY_MS);
  return getPrisma().accountDeletion.upsert({
    where: { tenantId: session.tenantId },
    create: {
      tenantId: session.tenantId,
      requestedByUserId: session.userId,
      status: "SCHEDULED",
      requestedAt,
      dueAt,
    },
    update: {
      requestedByUserId: session.userId,
      status: "SCHEDULED",
      requestedAt,
      dueAt,
      cancelledAt: null,
      purgedAt: null,
    },
  });
}

function deletionRow(tenantId: string) {
  return getPrisma().accountDeletion.findUnique({ where: { tenantId } });
}

/**
 * Tira a conta da fila sem purgá-la, para que o caso seguinte que usa
 * `runAccountPurge` veja só a conta dele. Cancelar é o caminho do produto e
 * não inventa estado nenhum.
 */
async function parkDeletion(tenantId: string) {
  await getPrisma().accountDeletion.update({
    where: { tenantId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

type PortName = "ai" | "scheduling" | "whatsapp" | "bff";

interface PortCall {
  store: PortName;
  tenantId?: string;
  maxRows?: number;
  requestedByUserId?: string;
}

type RemoteBehaviour =
  { totalDeleted?: number; hasMore?: boolean } | { throws: string };

/**
 * Portas de mentira, uma por loja. Cada `behaviour` decide o que aquela loja
 * faz nesta passada: confirmar, declarar resto ou explodir. `calls` é como o
 * teste observa a chamada que **não** aconteceu.
 */
function fakePorts(
  behaviour: {
    ai?: RemoteBehaviour;
    scheduling?: RemoteBehaviour;
    whatsapp?: () => Promise<void>;
    bff?: (input: {
      tenantId: string;
      requestedByUserId: string;
    }) => Promise<LocalAccountPurgeResult>;
  } = {},
): { ports: AccountPurgePorts; calls: PortCall[] } {
  const calls: PortCall[] = [];

  const remote = async (
    store: "ai" | "scheduling",
    input: { tenantId: string; maxRows: number },
  ): Promise<RemoteTenantPurgeResult> => {
    calls.push({ store, tenantId: input.tenantId, maxRows: input.maxRows });
    const declared = behaviour[store];
    if (declared && "throws" in declared) throw new Error(declared.throws);
    const totalDeleted = declared?.totalDeleted ?? 0;
    return {
      deleted: { Fake: totalDeleted },
      totalDeleted,
      hasMore: declared?.hasMore ?? false,
    };
  };

  return {
    calls,
    ports: {
      ai: (input) => remote("ai", input),
      scheduling: (input) => remote("scheduling", input),
      whatsapp: async (input) => {
        calls.push({ store: "whatsapp", tenantId: input.tenant.tenantId });
        await behaviour.whatsapp?.();
        return "ABSENT";
      },
      bff: async (input) => {
        calls.push({
          store: "bff",
          tenantId: input.tenantId,
          requestedByUserId: input.requestedByUserId,
        });
        if (behaviour.bff) return behaviour.bff(input);
        return { tenantDeleted: 1, usersDeleted: 1 };
      },
    },
  };
}

/**
 * Prisma que anota a ordem dos dois apagamentos locais. É como "o `User` foi
 * apagado por último" deixa de ser afirmação e vira evidência.
 */
function recordingPrisma(order: string[]): AccountPurgePrisma {
  const prisma = getPrisma();
  return {
    $queryRaw: prisma.$queryRaw.bind(prisma),
    tenantMember: prisma.tenantMember,
    tenant: {
      deleteMany: (args: unknown) => {
        order.push("tenant.deleteMany");
        return (
          prisma.tenant.deleteMany as (input: unknown) => Promise<unknown>
        )(args);
      },
    },
    user: {
      deleteMany: (args: unknown) => {
        order.push("user.deleteMany");
        return (prisma.user.deleteMany as (input: unknown) => Promise<unknown>)(
          args,
        );
      },
    },
  } as unknown as AccountPurgePrisma;
}

function capturingLogger(): {
  logger: AccountPurgeLogger;
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

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  // A linha de exclusão não some com o negócio — é o ponto do Goal —, então a
  // fixture a remove explicitamente.
  await getPrisma().accountDeletion.deleteMany({
    where: { tenantId: { in: created.map((session) => session.tenantId) } },
  });
  await cleanupBusinesses(created);
  await app?.close();
});

describe("Goal025/WU-07: defaults declarados do laço", () => {
  it("nasce desligado, por variável própria, com tetos conservadores", () => {
    expect(env.ACCOUNT_PURGE_ENABLED).toBe(false);
    expect(env.ACCOUNT_PURGE_INTERVAL_SECONDS).toBe(900);
    expect(env.ACCOUNT_PURGE_LEASE_TTL_SECONDS).toBe(300);
    expect(env.ACCOUNT_PURGE_BATCH).toBe(5);
    expect(env.ACCOUNT_PURGE_MAX_ROWS_PER_STORE).toBe(2_000);
    // Variável própria, não a da varredura de retenção: ligar a expiração de
    // conteúdo não pode ligar o apagamento de contas inteiras por consequência.
    expect(env.RETENTION_SWEEP_ENABLED).toBe(false);
  });

  it("a ordem entre as lojas é declarada, não emergente", () => {
    expect(ACCOUNT_PURGE_STORE_ORDER).toEqual(["ai", "scheduling", "bff"]);
  });

  it("o worker parado nunca chamou porta nenhuma e para sem esperar tick", async () => {
    const { ports, calls } = fakePorts();
    // Sem banco de propósito: um worker que nunca foi iniciado não pode ter
    // tocado no Prisma, e o teste falharia se ele tocasse.
    const worker = new AccountPurgeWorker(
      null as unknown as AccountPurgePrisma,
      ports,
      { ...baseOptions, pollIntervalMs: 60_000 },
    );

    const started = Date.now();
    await worker.stop();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(calls).toHaveLength(0);
  });

  it("uma passada que não alcança o banco vira log, nunca exceção", async () => {
    const { logger, error } = capturingLogger();
    const { ports, calls } = fakePorts();
    const worker = new AccountPurgeWorker(
      null as unknown as AccountPurgePrisma,
      ports,
      { ...baseOptions, pollIntervalMs: 60_000 },
      logger,
    );

    const summary = await worker.runOnce();

    expect(summary).toEqual({
      accountsClaimed: 0,
      accountsSkipped: 0,
      accountsPurged: 0,
      failed: 0,
      hasMore: false,
    });
    expect(calls).toHaveLength(0);
    expect(error).toHaveLength(1);
    await worker.stop();
  });

  it("nenhum teste deste arquivo sobe o laço", () => {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    // Montado em partes para que a própria asserção não seja a ocorrência que
    // ela procura.
    const boot = `.${["start", "()"].join("")}`;
    expect(source.includes(boot)).toBe(false);
  });

  it("o ator das chamadas internas não finge ser pessoa", () => {
    expect(ACCOUNT_PURGE_ACTOR).toBe("bff-account-purge");
  });
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal025/WU-07: purga no vencimento, com lease e ordem entre lojas",
  () => {
    it("purga IA, Scheduling e BFF, com o User por último, e só então marca PURGED", async () => {
      const owner = await business("purge-order");
      await scheduleDeletion(owner);
      const localOrder: string[] = [];
      const { ports, calls } = fakePorts({
        ai: { totalDeleted: 12 },
        scheduling: { totalDeleted: 7 },
        bff: (input) => purgeLocalAccount(recordingPrisma(localOrder), input),
      });

      const result = await purgeAccount(
        getPrisma(),
        ports,
        owner.tenantId,
        baseOptions,
      );

      expect(result.claimed).toBe(true);
      expect(result.purged).toBe(true);
      expect(result.failed).toEqual([]);
      expect(result.confirmed).toEqual(["ai", "scheduling", "bff"]);
      // A Evolution é conferida entre as remotas e o apagamento local, porque
      // a credencial da instância vive na linha que o DELETE do Tenant leva.
      expect(calls.map((call) => call.store)).toEqual([
        "ai",
        "scheduling",
        "whatsapp",
        "bff",
      ]);
      expect(localOrder).toEqual(["tenant.deleteMany", "user.deleteMany"]);
      expect(result.rows.ai).toBe(12);
      expect(result.rows.scheduling).toBe(7);
      expect(result.usersDeleted).toBe(1);

      expect(
        await getPrisma().tenant.findUnique({ where: { id: owner.tenantId } }),
      ).toBeNull();
      expect(
        await getPrisma().user.findUnique({ where: { id: owner.userId } }),
      ).toBeNull();
      // A sessão do dono cai junto com ele, por cascata: entrar de novo deixa
      // de ser possível porque a identidade não existe mais.
      expect(
        await getPrisma().userSession.count({
          where: { userId: owner.userId },
        }),
      ).toBe(0);

      const row = await deletionRow(owner.tenantId);
      expect(row?.status).toBe("PURGED");
      expect(row?.purgedAt).toBeInstanceOf(Date);
      expect(row?.leaseToken).toBeNull();
      expect(row?.leaseOwner).toBeNull();
      expect(row?.leaseExpiresAt).toBeNull();
    });

    it("a conta não é marcada PURGED enquanto uma loja não confirma", async () => {
      const owner = await business("purge-store-down");
      await scheduleDeletion(owner);
      const { ports, calls } = fakePorts({
        scheduling: { throws: "scheduling is down" },
      });

      const result = await purgeAccount(
        getPrisma(),
        ports,
        owner.tenantId,
        baseOptions,
      );

      expect(result.claimed).toBe(true);
      expect(result.purged).toBe(false);
      expect(result.failed).toEqual(["scheduling"]);
      // O BFF nem foi tocado: apagar o dono agora deixaria o resto do
      // Scheduling inalcançável.
      expect(calls.map((call) => call.store)).toEqual(["ai", "scheduling"]);

      const row = await deletionRow(owner.tenantId);
      expect(row?.status).toBe("SCHEDULED");
      expect(row?.purgedAt).toBeNull();
      // Lease devolvido mesmo na falha: a passada seguinte reencontra a conta.
      expect(row?.leaseToken).toBeNull();
      expect(
        await getPrisma().tenant.findUnique({ where: { id: owner.tenantId } }),
      ).not.toBeNull();
      expect(
        await getPrisma().user.findUnique({ where: { id: owner.userId } }),
      ).not.toBeNull();

      await parkDeletion(owner.tenantId);
    });

    it("passada que morre entre o Tenant e o User deixa estado retomável, e a seguinte conclui", async () => {
      const owner = await business("purge-resume");
      await scheduleDeletion(owner);

      const crashing = fakePorts({
        bff: async (input) => {
          // Exatamente o meio do apagamento local: o negócio já foi, o dono
          // ainda não — e é aqui que o processo morre.
          await getPrisma().tenant.deleteMany({
            where: { id: input.tenantId },
          });
          throw new Error("process died between the tenant and the owner");
        },
      });
      const first = await purgeAccount(
        getPrisma(),
        crashing.ports,
        owner.tenantId,
        baseOptions,
      );

      expect(first.purged).toBe(false);
      expect(first.failed).toEqual(["bff"]);
      expect(
        await getPrisma().tenant.findUnique({ where: { id: owner.tenantId } }),
      ).toBeNull();
      // O dono sobreviveu, e com ele a membership já cascateada embora: a
      // retomada não tem mais como descobri-lo pelo negócio.
      expect(
        await getPrisma().user.findUnique({ where: { id: owner.userId } }),
      ).not.toBeNull();
      expect(
        await getPrisma().tenantMember.count({
          where: { userId: owner.userId },
        }),
      ).toBe(0);
      const midway = await deletionRow(owner.tenantId);
      expect(midway?.status).toBe("SCHEDULED");
      expect(midway?.leaseToken).toBeNull();

      // Nenhuma intervenção manual entre as duas passadas.
      const resumed = fakePorts({
        bff: (input) => purgeLocalAccount(getPrisma(), input),
      });
      const second = await purgeAccount(
        getPrisma(),
        resumed.ports,
        owner.tenantId,
        baseOptions,
      );

      expect(second.purged).toBe(true);
      // `requestedByUserId`, que sobrevive na linha de exclusão, é o que torna
      // a retomada possível depois que as memberships sumiram.
      expect(second.usersDeleted).toBe(1);
      expect(
        await getPrisma().user.findUnique({ where: { id: owner.userId } }),
      ).toBeNull();
      expect((await deletionRow(owner.tenantId))?.status).toBe("PURGED");
    });

    it("purgar duas vezes não é erro e não produz efeito colateral", async () => {
      const owner = await business("purge-twice");
      await scheduleDeletion(owner);
      const first = fakePorts({
        bff: (input) => purgeLocalAccount(getPrisma(), input),
      });
      await purgeAccount(getPrisma(), first.ports, owner.tenantId, baseOptions);
      const afterFirst = await deletionRow(owner.tenantId);
      expect(afterFirst?.status).toBe("PURGED");

      const second = fakePorts({
        bff: (input) => purgeLocalAccount(getPrisma(), input),
      });
      const repeated = await purgeAccount(
        getPrisma(),
        second.ports,
        owner.tenantId,
        baseOptions,
      );

      // Não lançou, não reivindicou e não tocou em loja nenhuma: a conta já
      // purgada não satisfaz o WHERE do claim.
      expect(repeated.claimed).toBe(false);
      expect(repeated.purged).toBe(false);
      expect(second.calls).toHaveLength(0);
      const afterSecond = await deletionRow(owner.tenantId);
      expect(afterSecond?.purgedAt?.toISOString()).toBe(
        afterFirst?.purgedAt?.toISOString(),
      );
      expect(afterSecond?.updatedAt.toISOString()).toBe(
        afterFirst?.updatedAt.toISOString(),
      );
    });

    it("o teto por passada segura o trabalho, sinaliza o resto e não apaga o dono", async () => {
      const owner = await business("purge-capped");
      await scheduleDeletion(owner);
      const { ports, calls } = fakePorts({
        ai: { totalDeleted: 250, hasMore: true },
      });

      const summary = await runAccountPurge(getPrisma(), ports, {
        ...baseOptions,
        accountBatchLimit: 50,
      });

      expect(summary.accountsClaimed).toBeGreaterThanOrEqual(1);
      expect(summary.accountsPurged).toBe(0);
      expect(summary.hasMore).toBe(true);
      // O teto que a passada anuncia é o configurado, não um inventado pela
      // loja do outro lado.
      expect(calls[0]?.maxRows).toBe(baseOptions.maxRowsPerStore);
      expect(calls.map((call) => call.store)).toEqual(["ai", "scheduling"]);

      const row = await deletionRow(owner.tenantId);
      expect(row?.status).toBe("SCHEDULED");
      expect(
        await getPrisma().user.findUnique({ where: { id: owner.userId } }),
      ).not.toBeNull();

      await parkDeletion(owner.tenantId);
    });

    it("duas instâncias não purgam a mesma conta ao mesmo tempo", async () => {
      const owner = await business("purge-lease");
      await scheduleDeletion(owner);
      const entered = deferred();
      const gate = deferred();

      const holder = fakePorts({
        whatsapp: async () => {
          entered.resolve();
          await gate.promise;
        },
        bff: (input) => purgeLocalAccount(getPrisma(), input),
      });
      const first = purgeAccount(getPrisma(), holder.ports, owner.tenantId, {
        ...baseOptions,
        owner: "instance-a",
      });
      await entered.promise;

      const rival = fakePorts();
      const second = await purgeAccount(
        getPrisma(),
        rival.ports,
        owner.tenantId,
        { ...baseOptions, owner: "instance-b" },
      );

      expect(second.claimed).toBe(false);
      expect(rival.calls).toHaveLength(0);

      gate.resolve();
      const result = await first;
      expect(result.purged).toBe(true);
    });

    it("quem perdeu o lease não sobrescreve o resultado de quem assumiu", async () => {
      const owner = await business("purge-fencing");
      await scheduleDeletion(owner);
      const entered = deferred();
      const gate = deferred();

      const stalled = fakePorts({
        whatsapp: async () => {
          entered.resolve();
          await gate.promise;
        },
        bff: (input) => purgeLocalAccount(getPrisma(), input),
      });
      const { logger, error } = capturingLogger();
      const first = purgeAccount(getPrisma(), stalled.ports, owner.tenantId, {
        ...baseOptions,
        owner: "instance-a",
        logger,
      });
      await entered.promise;

      // O lease de A vence enquanto ele ainda trabalha. É o único jeito
      // honesto de produzir a corrida: o relógio é o do banco.
      await getPrisma().$executeRaw`
        UPDATE "AccountDeletion"
        SET "leaseExpiresAt" = now() - make_interval(secs => 1)
        WHERE "tenantId" = ${owner.tenantId}
      `;

      const winner = fakePorts({
        bff: (input) => purgeLocalAccount(getPrisma(), input),
      });
      const second = await purgeAccount(
        getPrisma(),
        winner.ports,
        owner.tenantId,
        { ...baseOptions, owner: "instance-b" },
      );
      expect(second.claimed).toBe(true);
      expect(second.purged).toBe(true);
      const afterWinner = await deletionRow(owner.tenantId);

      gate.resolve();
      const result = await first;

      // A terminou o trabalho, mas a liquidação não encontrou linha: o
      // `leaseToken` já não é o dele.
      expect(result.purged).toBe(false);
      expect(
        error.some((entry) =>
          entry.message.includes("lost its lease before settling"),
        ),
      ).toBe(true);
      const afterLoser = await deletionRow(owner.tenantId);
      expect(afterLoser?.purgedAt?.toISOString()).toBe(
        afterWinner?.purgedAt?.toISOString(),
      );
      expect(afterLoser?.updatedAt.toISOString()).toBe(
        afterWinner?.updatedAt.toISOString(),
      );
    });

    it("confere a Evolution e remove a instância pelo caminho que já existe", async () => {
      const owner = await business("purge-evolution");
      const name = `purge_evolution_${Date.now()}`;
      const instance = await getPrisma().whatsAppInstance.create({
        data: {
          userId: owner.userId,
          tenantId: owner.tenantId,
          evolutionInstanceId: `${name}-id`,
          evolutionInstanceName: name,
          status: "CONNECTED",
          ...sealedInstanceCredentialData("wa_synthetic_purge_credential", {
            tenantId: owner.tenantId,
            evolutionInstanceName: name,
          }),
        },
      });
      await scheduleDeletion(owner);

      const evolutionCalls: string[] = [];
      const evolution = {
        logoutInstance: async () => {
          evolutionCalls.push("logout");
          return null;
        },
        deleteInstance: async (instanceId: string) => {
          evolutionCalls.push(`delete:${instanceId}`);
          return null;
        },
      } as unknown as Pick<
        EvolutionClient,
        "logoutInstance" | "deleteInstance"
      >;
      const noRows = async (): Promise<RemoteTenantPurgeResult> => ({
        deleted: {},
        totalDeleted: 0,
        hasMore: false,
      });
      const ports = defaultAccountPurgePorts(getPrisma(), {
        ai: { purgeTenant: noRows },
        scheduling: { purgeTenant: noRows },
        evolution,
      });

      const result = await purgeAccount(
        getPrisma(),
        ports,
        owner.tenantId,
        baseOptions,
      );

      expect(result.whatsapp).toBe("DISCONNECTED");
      expect(evolutionCalls).toEqual(["logout", `delete:${name}-id`]);
      expect(
        await getPrisma().whatsAppInstance.findUnique({
          where: { id: instance.id },
        }),
      ).toBeNull();
      expect(result.purged).toBe(true);
    });

    it("a linha de exclusão sobrevive à purga e não carrega dado pessoal", async () => {
      const owner = await business("purge-proof");
      const tenant = await getPrisma().tenant.findUniqueOrThrow({
        where: { id: owner.tenantId },
      });
      await scheduleDeletion(owner);
      const { ports } = fakePorts({
        bff: (input) => purgeLocalAccount(getPrisma(), input),
      });

      await purgeAccount(getPrisma(), ports, owner.tenantId, baseOptions);

      const row = await deletionRow(owner.tenantId);
      expect(row).not.toBeNull();
      expect(row?.status).toBe("PURGED");

      // O conjunto de colunas é fechado: não existe campo livre onde nome,
      // e-mail, telefone ou conteúdo pudessem ter sido gravados.
      expect(Object.keys(row ?? {}).sort()).toEqual([
        "cancelledAt",
        "createdAt",
        "dueAt",
        "leaseAcquiredAt",
        "leaseExpiresAt",
        "leaseOwner",
        "leaseToken",
        "purgedAt",
        "requestedAt",
        "requestedByUserId",
        "status",
        "tenantId",
        "updatedAt",
      ]);
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain(owner.email);
      expect(serialized).not.toContain(tenant.name);
      // O que sobra são os dois identificadores opacos e os instantes.
      expect(row?.tenantId).toBe(owner.tenantId);
      expect(row?.requestedByUserId).toBe(owner.userId);
    });
  },
);
