import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  defaultAccountPurgePorts,
  purgeAccount,
  type RemoteTenantPurgeResult,
} from "../src/modules/account/purge.js";
import {
  ALLOWED_ORIGIN,
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  login,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal025/WU-09 — o ciclo de vida da conta inteiro, contra PostgreSQL
 * descartável, no mesmo estilo das demais `*.integration.test.ts`.
 *
 * As unidades anteriores já provam cada mecanismo isoladamente: WU-03 as
 * rotas públicas, WU-07 o lease e a ordem entre lojas na purga. O que esta
 * suíte prova e as outras não é a ligação entre as pontas: uma exclusão pedida
 * pela rota HTTP, vencida pelo relógio gravado (não pelo relógio do processo),
 * purgada pelo mesmo caminho de produção, e o efeito final na única coisa que
 * importa para o dono — login e sessão deixam de funcionar depois.
 *
 * O prazo é envelhecido escrevendo direto na coluna `dueAt` (o relógio
 * injetável do modelo do WU-01), nunca esperando sete dias nem trocando o
 * relógio do processo — é o mesmo artifício que a suíte de purga do WU-07 usa.
 *
 * As lojas remotas (IA, Scheduling) não têm servidor real neste ambiente;
 * `defaultAccountPurgePorts` recebe substitutos só para essas duas portas. O
 * apagamento local (`bff`) e a checagem de WhatsApp correm pelo caminho de
 * produção sem substituto nenhum, porque é ali que a purga de fato acontece.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

const DAY_MS = 24 * 60 * 60 * 1_000;

const purgeOptions = {
  owner: "wu09-lifecycle",
  leaseTtlSeconds: 300,
  accountBatchLimit: 5,
  maxRowsPerStore: 250,
};

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

/** Vence o prazo sem esperar: reescreve o relógio gravado, não o do processo. */
async function expireDueDate(tenantId: string): Promise<void> {
  await getPrisma().accountDeletion.update({
    where: { tenantId },
    data: { dueAt: new Date(Date.now() - DAY_MS) },
  });
}

function deletionRow(tenantId: string) {
  return getPrisma().accountDeletion.findUnique({ where: { tenantId } });
}

/** Loja remota de mentira que conta suas próprias chamadas. */
function remoteStore(calls: { count: number }, behaviour: { throws: string } | undefined) {
  return {
    purgeTenant: async (): Promise<RemoteTenantPurgeResult> => {
      calls.count += 1;
      if (behaviour) throw new Error(behaviour.throws);
      return { deleted: {}, totalDeleted: 0, hasMore: false };
    },
  };
}

describe.skipIf(!RUN_INTEGRATION)(
  "Goal025/WU-09: o ciclo de vida da conta contra PostgreSQL descartável",
  () => {
    beforeAll(async () => {
      app = await buildApp();
      await assertDisposableTarget();
    });

    afterAll(async () => {
      if (!app) return;
      await getPrisma().accountDeletion.deleteMany({
        where: { tenantId: { in: created.map((session) => session.tenantId) } },
      });
      await cleanupBusinesses(created);
      await app.close();
    });

    it("pede a exclusão e cancela dentro do prazo: a conta continua acessível", async () => {
      const owner = await business("lifecycle-cancel");

      const start = await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: { password: owner.password },
      });
      expect(start.statusCode).toBe(200);
      expect(start.json().data.status).toBe("SCHEDULED");

      const cancel = await app.inject({
        method: "DELETE",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
      });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json().data.status).toBe("CANCELLED");

      const row = await deletionRow(owner.tenantId);
      expect(row?.status).toBe("CANCELLED");

      // Cancelar não derruba sessão nem senha: login continua funcionando.
      const loginAfterCancel = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { email: owner.email, password: owner.password },
      });
      expect(loginAfterCancel.statusCode).toBe(200);
    });

    it(
      "pede a exclusão, vence o prazo, uma loja falha e não purga, a passada " +
        "seguinte com todas as lojas confirma e purga, e depois disso o login " +
        "do e-mail e a sessão anterior deixam de autenticar",
      async () => {
        const owner = await business("lifecycle-full");
        // Uma segunda sessão do mesmo dono, aberta antes da purga, para provar
        // que "nenhuma sessão anterior autentica" cobre mais que a que pediu.
        const secondDevice = await login(app, owner);

        const start = await app.inject({
          method: "POST",
          url: "/v1/account/deletion",
          headers: browserMutation(owner),
          payload: { password: owner.password },
        });
        expect(start.statusCode).toBe(200);
        expect(start.json().data.status).toBe("SCHEDULED");

        await expireDueDate(owner.tenantId);

        // Passada 1: o Scheduling está fora do ar. A conta continua SCHEDULED
        // e o BFF nem é tocado.
        const schedulingCalls = { count: 0 };
        const failingPorts = defaultAccountPurgePorts(getPrisma(), {
          ai: remoteStore({ count: 0 }, undefined),
          scheduling: remoteStore(schedulingCalls, {
            throws: "scheduling is down",
          }),
        });
        const firstPass = await purgeAccount(
          getPrisma(),
          failingPorts,
          owner.tenantId,
          purgeOptions,
        );
        expect(firstPass.purged).toBe(false);
        expect(firstPass.failed).toEqual(["scheduling"]);
        expect(schedulingCalls.count).toBe(1);
        expect((await deletionRow(owner.tenantId))?.status).toBe("SCHEDULED");

        // A conta ainda existe e as duas sessões abertas antes ainda
        // autenticam: uma passada que falhou no meio não pode ter efeito.
        for (const stillAlive of [owner, secondDevice]) {
          const stillAuthenticated = await app.inject({
            method: "GET",
            url: "/v1/auth/session",
            headers: browserRead(stillAlive),
          });
          expect(stillAuthenticated.statusCode).toBe(200);
        }

        // Passada 2: nenhuma intervenção manual entre as duas passadas, e
        // desta vez todas as lojas confirmam.
        const workingPorts = defaultAccountPurgePorts(getPrisma(), {
          ai: remoteStore({ count: 0 }, undefined),
          scheduling: remoteStore({ count: 0 }, undefined),
        });
        const secondPass = await purgeAccount(
          getPrisma(),
          workingPorts,
          owner.tenantId,
          purgeOptions,
        );
        expect(secondPass.purged).toBe(true);
        expect(secondPass.failed).toEqual([]);
        expect((await deletionRow(owner.tenantId))?.status).toBe("PURGED");

        // O login com o e-mail purgado não autentica.
        const loginAfterPurge = await app.inject({
          method: "POST",
          url: "/v1/auth/login",
          headers: { origin: ALLOWED_ORIGIN },
          payload: { email: owner.email, password: owner.password },
        });
        expect(loginAfterPurge.statusCode).toBe(401);

        // Nenhuma sessão anterior autentica, nem por cookie nem por Bearer, e
        // isso vale para as duas sessões abertas antes da purga.
        for (const stale of [owner, secondDevice]) {
          const byCookie = await app.inject({
            method: "GET",
            url: "/v1/auth/session",
            headers: browserRead(stale),
          });
          expect(byCookie.statusCode).toBe(401);

          const byBearer = await app.inject({
            method: "GET",
            url: "/v1/auth/session",
            headers: { authorization: `Bearer ${stale.bearer}` },
          });
          expect(byBearer.statusCode).toBe(401);
        }
      },
    );

    it("purgar uma conta já purgada não é erro e não produz efeito colateral", async () => {
      const owner = await business("lifecycle-purge-twice");
      await app.inject({
        method: "POST",
        url: "/v1/account/deletion",
        headers: browserMutation(owner),
        payload: { password: owner.password },
      });
      await expireDueDate(owner.tenantId);

      const firstCalls = { ai: { count: 0 }, scheduling: { count: 0 } };
      const first = await purgeAccount(
        getPrisma(),
        defaultAccountPurgePorts(getPrisma(), {
          ai: remoteStore(firstCalls.ai, undefined),
          scheduling: remoteStore(firstCalls.scheduling, undefined),
        }),
        owner.tenantId,
        purgeOptions,
      );
      expect(first.purged).toBe(true);
      const afterFirst = await deletionRow(owner.tenantId);
      expect(afterFirst?.status).toBe("PURGED");

      const secondCalls = { ai: { count: 0 }, scheduling: { count: 0 } };
      const second = await purgeAccount(
        getPrisma(),
        defaultAccountPurgePorts(getPrisma(), {
          ai: remoteStore(secondCalls.ai, undefined),
          scheduling: remoteStore(secondCalls.scheduling, undefined),
        }),
        owner.tenantId,
        purgeOptions,
      );

      // A conta já purgada não satisfaz o WHERE do claim: nenhuma loja é
      // tocada na segunda passada.
      expect(second.claimed).toBe(false);
      expect(second.purged).toBe(false);
      expect(secondCalls.ai.count).toBe(0);
      expect(secondCalls.scheduling.count).toBe(0);

      const afterSecond = await deletionRow(owner.tenantId);
      expect(afterSecond?.purgedAt?.toISOString()).toBe(
        afterFirst?.purgedAt?.toISOString(),
      );
      expect(afterSecond?.updatedAt.toISOString()).toBe(
        afterFirst?.updatedAt.toISOString(),
      );

      // O login continua recusado da mesma forma: a segunda passada não
      // desfez nem repetiu o apagamento do dono.
      const loginAfterSecondPurge = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: { origin: ALLOWED_ORIGIN },
        payload: { email: owner.email, password: owner.password },
      });
      expect(loginAfterSecondPurge.statusCode).toBe(401);
    });
  },
);
