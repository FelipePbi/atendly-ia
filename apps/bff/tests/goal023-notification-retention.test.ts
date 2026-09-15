import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import { HISTORY_WINDOW_DAYS } from "../src/modules/notifications/routes.js";
import { purgeExpiredNotifications } from "../src/modules/notifications/retention.js";
import {
  assertDisposableTarget,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal023/WU-04 — purga da central de notificações e reconciliação da janela
 * do contador, contra PostgreSQL real.
 *
 * O que só o banco e o servidor HTTP inteiro provam: `EVENT` e `CONDITION`
 * resolvida fora da janela são apagados; `CONDITION` aberta nunca é apagada,
 * por mais antiga que seja; depois da purga (e mesmo sem ela) `unreadCount` e
 * a lista aplicam a mesma janela, sem segunda janela nem constante
 * duplicada; `NotificationPreference` e `NotificationSyncState` permanecem
 * intocados; o teto de linhas é respeitado e sinalizado, e uma segunda
 * passada imediata não apaga nada; e o isolamento por tenant.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

const NOW = new Date("2026-09-15T12:00:00.000Z");
const insideWindow = new Date(
  NOW.getTime() - (HISTORY_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1_000,
);
const outsideWindow = new Date(
  NOW.getTime() - (HISTORY_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1_000,
);
const wayOutsideWindow = new Date("2020-01-01T00:00:00.000Z");

async function seedNotification(
  session: SessionHandle,
  overrides: Partial<{
    kind: string;
    level: string;
    shape: string;
    dedupeKey: string;
    subjectId: string | null;
    occurredAt: Date;
    readAt: Date | null;
    resolvedAt: Date | null;
    payload: Record<string, unknown>;
  }> = {},
) {
  return getPrisma().tenantNotification.create({
    data: {
      tenantId: session.tenantId,
      kind: (overrides.kind ?? "IMPORT_COMPLETED") as never,
      level: (overrides.level ?? "INFO") as never,
      shape: (overrides.shape ?? "EVENT") as never,
      dedupeKey:
        overrides.dedupeKey ??
        `IMPORT_COMPLETED:session:${Math.random().toString(36).slice(2)}`,
      subjectId: overrides.subjectId ?? null,
      occurredAt: overrides.occurredAt ?? NOW,
      readAt: overrides.readAt ?? null,
      resolvedAt: overrides.resolvedAt ?? null,
      payload: overrides.payload ?? {},
    },
  });
}

function remainingIds(session: SessionHandle) {
  return getPrisma()
    .tenantNotification.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true },
    })
    .then((rows) => rows.map((row) => row.id));
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

describe.skipIf(!RUN_INTEGRATION)(
  "Goal023/WU-04: purga da central e janela do contador",
  () => {
    it("apaga evento e condição resolvida fora da janela; condição aberta nunca é apagada", async () => {
      const owner = await business("retention-purge-basics");

      const event = await seedNotification(owner, {
        shape: "EVENT",
        occurredAt: outsideWindow,
      });
      const resolvedCondition = await seedNotification(owner, {
        shape: "CONDITION",
        occurredAt: outsideWindow,
        resolvedAt: outsideWindow,
        dedupeKey: `COND:${owner.tenantId}:resolved`,
      });
      const openCondition = await seedNotification(owner, {
        shape: "CONDITION",
        occurredAt: wayOutsideWindow,
        resolvedAt: null,
        dedupeKey: `COND:${owner.tenantId}:open`,
      });
      const recentEvent = await seedNotification(owner, {
        shape: "EVENT",
        occurredAt: insideWindow,
      });

      const result = await purgeExpiredNotifications(getPrisma(), {
        tenantId: owner.tenantId,
        maxRows: 100,
        now: NOW,
      });
      expect(result).toEqual({ purged: 2, hasMore: false });

      const remaining = await remainingIds(owner);
      expect(remaining.sort()).toEqual(
        [openCondition.id, recentEvent.id].sort(),
      );
      expect(remaining).not.toContain(event.id);
      expect(remaining).not.toContain(resolvedCondition.id);
    });

    it("depois da purga, unreadCount e a lista aplicam a mesma janela", async () => {
      const owner = await business("retention-window-alignment");

      await seedNotification(owner, {
        shape: "EVENT",
        level: "CRITICAL",
        occurredAt: outsideWindow,
        readAt: null,
      });
      const inWindow = await seedNotification(owner, {
        shape: "EVENT",
        level: "CRITICAL",
        occurredAt: insideWindow,
        readAt: null,
      });

      await purgeExpiredNotifications(getPrisma(), {
        tenantId: owner.tenantId,
        maxRows: 100,
        now: NOW,
      });

      const list = await app.inject({
        method: "GET",
        url: "/v1/notifications",
        headers: browserRead(owner),
      });
      const listBody = list.json() as {
        data: { items: Array<{ id: string }>; total: number };
      };
      const summary = await app.inject({
        method: "GET",
        url: "/v1/notifications/summary",
        headers: browserRead(owner),
      });
      const summaryBody = summary.json() as {
        data: { unreadCount: number; byLevel: Record<string, number> };
      };

      expect(listBody.data.total).toBe(1);
      expect(listBody.data.items.map((item) => item.id)).toEqual([
        inWindow.id,
      ]);
      expect(summaryBody.data.unreadCount).toBe(1);
      expect(summaryBody.data.byLevel.CRITICAL).toBe(1);
    });

    it("NotificationPreference e NotificationSyncState permanecem intocados", async () => {
      const owner = await business("retention-untouched-siblings");
      const prisma = getPrisma();

      await prisma.notificationPreference.create({
        data: { tenantId: owner.tenantId, aiAppointmentCreated: true },
      });
      await prisma.notificationSyncState.create({
        data: { tenantId: owner.tenantId, seededAt: outsideWindow },
      });
      await seedNotification(owner, {
        shape: "EVENT",
        occurredAt: outsideWindow,
      });

      await purgeExpiredNotifications(prisma, {
        tenantId: owner.tenantId,
        maxRows: 100,
        now: NOW,
      });

      const preference = await prisma.notificationPreference.findUniqueOrThrow(
        { where: { tenantId: owner.tenantId } },
      );
      expect(preference.aiAppointmentCreated).toBe(true);

      const syncState = await prisma.notificationSyncState.findUniqueOrThrow({
        where: { tenantId: owner.tenantId },
      });
      expect(syncState.seededAt.toISOString()).toBe(outsideWindow.toISOString());
    });

    it("respeita o teto de linhas, sinaliza o resto, e a segunda passada imediata não apaga nada", async () => {
      const owner = await business("retention-batch-cap");
      const prisma = getPrisma();
      for (let index = 0; index < 3; index += 1) {
        await seedNotification(owner, {
          shape: "EVENT",
          occurredAt: new Date(outsideWindow.getTime() + index * 1_000),
          dedupeKey: `IMPORT_COMPLETED:session:batch-${index}`,
        });
      }

      const first = await purgeExpiredNotifications(prisma, {
        tenantId: owner.tenantId,
        maxRows: 2,
        now: NOW,
      });
      expect(first).toEqual({ purged: 2, hasMore: true });

      const second = await purgeExpiredNotifications(prisma, {
        tenantId: owner.tenantId,
        maxRows: 2,
        now: NOW,
      });
      expect(second).toEqual({ purged: 1, hasMore: false });

      const third = await purgeExpiredNotifications(prisma, {
        tenantId: owner.tenantId,
        maxRows: 2,
        now: NOW,
      });
      expect(third).toEqual({ purged: 0, hasMore: false });

      expect(await remainingIds(owner)).toEqual([]);
    });

    it("é escopada por tenant: purgar A não apaga nada expirado de B", async () => {
      const a = await business("retention-isolation-a");
      const b = await business("retention-isolation-b");

      await seedNotification(a, { shape: "EVENT", occurredAt: outsideWindow });
      const theirs = await seedNotification(b, {
        shape: "EVENT",
        occurredAt: outsideWindow,
      });

      const result = await purgeExpiredNotifications(getPrisma(), {
        tenantId: a.tenantId,
        maxRows: 100,
        now: NOW,
      });
      expect(result).toEqual({ purged: 1, hasMore: false });

      const untouched = await getPrisma().tenantNotification.findUniqueOrThrow(
        { where: { id: theirs.id } },
      );
      expect(untouched.id).toBe(theirs.id);
    });
  },
);
