import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { OnboardingState } from "../src/lib/onboarding-state.js";
import {
  type NotificationReconcileDeps,
  reconcileNotificationCenter,
  reconcileStatusConditions,
} from "../src/modules/notifications/reconcile.js";
import type { NotificationPrisma } from "../src/modules/notifications/store.js";
import { NotificationPrismaDouble } from "./helpers/notification-prisma-double.js";

/**
 * Goal022/WU-03 — o motor: throttle, isolamento de fonte, cursores e as duas
 * propriedades que sustentam tudo — materializar de novo não reescreve o
 * estado do leitor **enquanto o fato é o mesmo**, e condição resolvida que
 * volta a ser reportada reabre em vez de sumir.
 *
 * O dublê aplica a chave única `(tenantId, dedupeKey)` como o PostgreSQL
 * aplicaria; a mesma idempotência é reprovada contra banco real na suíte de
 * integração deste Goal.
 */

const TENANT = "tenant-a";
const NOW = new Date("2026-09-15T13:00:00.000Z");

function fakeRequest(tenantId = TENANT): FastifyRequest {
  return {
    id: "req-1",
    tenantContext: { userId: "user-1", tenantId, role: "OWNER" },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  } as unknown as FastifyRequest;
}

function completeOnboarding(): OnboardingState {
  return {
    business: {
      name: "Studio Marina",
      category: "Beleza",
      timezone: "America/Sao_Paulo",
      modalities: ["ONLINE"],
      address: null,
      contextVersion: 1,
      contextProjectedVersion: 1,
      contextProjectionStatus: "PROJECTED",
    },
    calendar: {
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
      integration: null,
    },
    ai: { tone: "BALANCED" },
    service: { id: "servico-1", active: true },
    availability: {
      rules: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true },
      ],
    },
    whatsapp: null,
    completed: true,
    completedAt: "2026-09-10T12:00:00.000Z",
  } as unknown as OnboardingState;
}

interface SourceOverrides {
  awaitingHuman?: NotificationReconcileDeps["ai"]["listConversationsAwaitingHuman"];
  failedIntents?: NotificationReconcileDeps["scheduling"]["listFailedNotificationIntents"];
  aiEvents?: NotificationReconcileDeps["scheduling"]["listAiCreatedAppointmentEvents"];
  importState?: NotificationReconcileDeps["scheduling"]["importState"];
  onboarding?: OnboardingState;
}

function deps(
  double: NotificationPrismaDouble,
  overrides: SourceOverrides = {},
): NotificationReconcileDeps {
  return {
    prisma: double.client,
    readOnboardingState: async () =>
      overrides.onboarding ?? completeOnboarding(),
    ai: {
      listConversationsAwaitingHuman:
        overrides.awaitingHuman ?? (async () => []),
    } as NotificationReconcileDeps["ai"],
    scheduling: {
      listFailedNotificationIntents:
        overrides.failedIntents ??
        (async () => ({ items: [], nextCursor: null })),
      listAiCreatedAppointmentEvents:
        overrides.aiEvents ?? (async () => ({ items: [], nextCursor: null })),
      importState: overrides.importState ?? (async () => ({ history: null })),
    } as unknown as NotificationReconcileDeps["scheduling"],
  };
}

const waitingCustomer = {
  conversationId: "conversa-1",
  contactName: "Marina",
  reason: "EXPLICIT_REQUEST",
  openedAt: "2026-09-15T12:30:00.000Z",
};

describe("materialização idempotente", () => {
  it("reconciliar a mesma fonte duas vezes não cria segunda linha", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();
    const source = deps(double, {
      awaitingHuman: async () => [waitingCustomer],
    });

    await reconcileNotificationCenter(request, source, { now: NOW });
    await reconcileNotificationCenter(request, source, {
      now: new Date(NOW.getTime() + 3_600_000),
      force: true,
    });

    expect(double.of(TENANT, "CUSTOMER_WAITING_HUMAN")).toHaveLength(1);
  });

  it("rematerializar não zera readAt nem move occurredAt", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();
    const source = deps(double, {
      awaitingHuman: async () => [waitingCustomer],
    });

    await reconcileNotificationCenter(request, source, { now: NOW });
    const row = double.of(TENANT, "CUSTOMER_WAITING_HUMAN")[0]!;
    const readAt = new Date("2026-09-15T13:05:00.000Z");
    row.readAt = readAt;

    await reconcileNotificationCenter(request, source, {
      now: new Date(NOW.getTime() + 3_600_000),
      force: true,
    });

    const after = double.of(TENANT, "CUSTOMER_WAITING_HUMAN")[0]!;
    expect(after.readAt).toEqual(readAt);
    expect(after.occurredAt.toISOString()).toBe("2026-09-15T12:30:00.000Z");
  });
});

describe("resolução de condição", () => {
  it("a fonte para de reportar e a linha aberta recebe resolvedAt, sem ser deletada", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();

    await reconcileNotificationCenter(
      request,
      deps(double, { awaitingHuman: async () => [waitingCustomer] }),
      { now: NOW },
    );
    expect(double.open(TENANT, "CUSTOMER_WAITING_HUMAN")).toHaveLength(1);

    const later = new Date(NOW.getTime() + 3_600_000);
    await reconcileNotificationCenter(
      request,
      deps(double, { awaitingHuman: async () => [] }),
      { now: later, force: true },
    );

    const rows = double.of(TENANT, "CUSTOMER_WAITING_HUMAN");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resolvedAt).toEqual(later);
  });

  it("resolver de novo não move o instante da primeira resolução", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();
    await reconcileNotificationCenter(
      request,
      deps(double, { awaitingHuman: async () => [waitingCustomer] }),
      { now: NOW },
    );
    const first = new Date(NOW.getTime() + 60_000);
    await reconcileNotificationCenter(
      request,
      deps(double, { awaitingHuman: async () => [] }),
      { now: first, force: true },
    );
    await reconcileNotificationCenter(
      request,
      deps(double, { awaitingHuman: async () => [] }),
      { now: new Date(NOW.getTime() + 120_000), force: true },
    );

    expect(double.of(TENANT, "CUSTOMER_WAITING_HUMAN")[0]?.resolvedAt).toEqual(
      first,
    );
  });
});

describe("condição que volta a acontecer", () => {
  it("cliente volta a esperar e a condição reabre, não lida e com o novo instante", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();

    await reconcileNotificationCenter(
      request,
      deps(double, { awaitingHuman: async () => [waitingCustomer] }),
      { now: NOW },
    );
    // A profissional viu e atendeu: lida, e depois resolvida pela fonte.
    double.of(TENANT, "CUSTOMER_WAITING_HUMAN")[0]!.readAt = new Date(
      NOW.getTime() + 60_000,
    );
    await reconcileNotificationCenter(
      request,
      deps(double, { awaitingHuman: async () => [] }),
      { now: new Date(NOW.getTime() + 120_000), force: true },
    );
    expect(double.open(TENANT, "CUSTOMER_WAITING_HUMAN")).toHaveLength(0);

    // Mesma conversa espera de novo: `dedupeKey` é a identidade da condição,
    // não a da ocorrência, então sem reabertura a central emudeceria a partir
    // do segundo episódio.
    const again = "2026-09-15T15:00:00.000Z";
    await reconcileNotificationCenter(
      request,
      deps(double, {
        awaitingHuman: async () => [{ ...waitingCustomer, openedAt: again }],
      }),
      { now: new Date(NOW.getTime() + 180_000), force: true },
    );

    const rows = double.of(TENANT, "CUSTOMER_WAITING_HUMAN");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resolvedAt).toBeNull();
    expect(rows[0]?.readAt).toBeNull();
    expect(rows[0]?.occurredAt.toISOString()).toBe(again);
  });

  it("o canal cai de novo depois de voltar e a condição reabre", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();
    const status = (whatsapp: "DISCONNECTED" | "CONNECTED", now: Date) =>
      reconcileStatusConditions(request, {
        whatsapp,
        ai: "OFF",
        now,
        prisma: double.client,
      });

    await status("DISCONNECTED", NOW);
    double.of(TENANT, "WHATSAPP_DISCONNECTED")[0]!.readAt = NOW;
    await status("CONNECTED", new Date(NOW.getTime() + 60_000));
    expect(double.open(TENANT, "WHATSAPP_DISCONNECTED")).toHaveLength(0);

    const fell = new Date(NOW.getTime() + 120_000);
    await status("DISCONNECTED", fell);

    const rows = double.of(TENANT, "WHATSAPP_DISCONNECTED");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resolvedAt).toBeNull();
    expect(rows[0]?.readAt).toBeNull();
    expect(rows[0]?.occurredAt).toEqual(fell);
  });

  it("condição ainda aberta não é reaberta: readAt de quem já viu sobrevive", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();
    const source = deps(double, {
      awaitingHuman: async () => [waitingCustomer],
    });

    await reconcileNotificationCenter(request, source, { now: NOW });
    const readAt = new Date(NOW.getTime() + 60_000);
    double.of(TENANT, "CUSTOMER_WAITING_HUMAN")[0]!.readAt = readAt;

    await reconcileNotificationCenter(request, source, {
      now: new Date(NOW.getTime() + 120_000),
      force: true,
    });

    expect(double.of(TENANT, "CUSTOMER_WAITING_HUMAN")[0]?.readAt).toEqual(
      readAt,
    );
  });
});

describe("fonte indisponível", () => {
  it("não lança, deixa o kind intocado e reporta a degradação", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();

    await reconcileNotificationCenter(
      request,
      deps(double, { awaitingHuman: async () => [waitingCustomer] }),
      { now: NOW },
    );

    const result = await reconcileNotificationCenter(
      request,
      deps(double, {
        awaitingHuman: async () => {
          throw new Error("ai-orchestrator unreachable");
        },
        importState: async () =>
          ({
            history: {
              sessionId: "sessao-3",
              completedAt: "2026-09-15T14:00:00.000Z",
              counts: { imported: 4 },
            },
          }) as Awaited<
            ReturnType<NotificationReconcileDeps["scheduling"]["importState"]>
          >,
      }),
      { now: new Date(NOW.getTime() + 3_600_000), force: true },
    );

    expect(result.reconciled).toBe(true);
    expect(result.degraded).toEqual(["AWAITING_HUMAN"]);
    // A condição continua aberta: a IA não respondeu, e "não sei" nunca vira
    // "não há mais ninguém esperando".
    expect(double.open(TENANT, "CUSTOMER_WAITING_HUMAN")).toHaveLength(1);
    // As outras fontes seguiram normalmente na mesma passada.
    expect(double.of(TENANT, "IMPORT_COMPLETED")).toHaveLength(1);
  });
});

describe("throttle por negócio", () => {
  it("dentro da janela, nenhuma fonte é lida", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();
    const awaitingHuman = vi.fn(async () => [waitingCustomer]);
    const source = deps(double, { awaitingHuman });

    await reconcileNotificationCenter(request, source, { now: NOW });
    expect(awaitingHuman).toHaveBeenCalledTimes(1);

    const result = await reconcileNotificationCenter(request, source, {
      now: new Date(NOW.getTime() + 1_000),
    });
    expect(result).toEqual({ reconciled: false, degraded: [] });
    expect(awaitingHuman).toHaveBeenCalledTimes(1);
  });
});

describe("cursores e preferência", () => {
  const event = {
    appointmentId: "compromisso-9",
    after: { date: "2026-09-20", startTime: "10:00" },
    occurredAt: "2026-09-15T13:10:00.000Z",
    sequence: "412",
  };

  it("preferência desligada não materializa e mesmo assim avança o cursor", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();

    await reconcileNotificationCenter(
      request,
      deps(double, {
        aiEvents: async () =>
          ({ items: [event], nextCursor: null }) as Awaited<
            ReturnType<
              NotificationReconcileDeps["scheduling"]["listAiCreatedAppointmentEvents"]
            >
          >,
      }),
      { now: NOW },
    );

    expect(double.of(TENANT, "AI_APPOINTMENT_CREATED")).toEqual([]);
    expect(double.syncStates.get(TENANT)?.aiAppointmentEventCursor).toBe("412");
  });

  it("o cursor nasce na primeira reconciliação: nada retroativo é materializado", async () => {
    const double = new NotificationPrismaDouble();
    double.preferences.set(TENANT, { aiAppointmentCreated: true });
    const request = fakeRequest();
    const antigo = { ...event, occurredAt: "2026-08-01T10:00:00.000Z" };

    await reconcileNotificationCenter(
      request,
      deps(double, {
        aiEvents: async () =>
          ({ items: [antigo], nextCursor: null }) as Awaited<
            ReturnType<
              NotificationReconcileDeps["scheduling"]["listAiCreatedAppointmentEvents"]
            >
          >,
      }),
      { now: NOW },
    );

    expect(double.of(TENANT, "AI_APPOINTMENT_CREATED")).toEqual([]);
    expect(double.syncStates.get(TENANT)?.seededAt).toEqual(NOW);
    expect(double.syncStates.get(TENANT)?.aiAppointmentEventCursor).toBe("412");
  });

  it("com a preferência ligada, evento posterior ao corte vira notificação", async () => {
    const double = new NotificationPrismaDouble();
    double.preferences.set(TENANT, { aiAppointmentCreated: true });
    const request = fakeRequest();

    await reconcileNotificationCenter(
      request,
      deps(double, {
        aiEvents: async () =>
          ({ items: [event], nextCursor: null }) as Awaited<
            ReturnType<
              NotificationReconcileDeps["scheduling"]["listAiCreatedAppointmentEvents"]
            >
          >,
      }),
      { now: NOW },
    );

    const rows = double.of(TENANT, "AI_APPOINTMENT_CREATED");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.level).toBe("INFO");
    expect(rows[0]?.shape).toBe("EVENT");
  });
});

describe("condições dentro de /v1/status", () => {
  it("abre em DISCONNECTED, resolve em CONNECTED e ignora UNKNOWN", async () => {
    const double = new NotificationPrismaDouble();
    const request = fakeRequest();

    await reconcileStatusConditions(request, {
      whatsapp: "DISCONNECTED",
      ai: "OFF",
      now: NOW,
      prisma: double.client,
    });
    expect(double.open(TENANT, "WHATSAPP_DISCONNECTED")).toHaveLength(1);
    expect(double.of(TENANT, "AI_UNAVAILABLE")).toEqual([]);

    // UNKNOWN não resolve a condição aberta: a dependência apenas não respondeu.
    await reconcileStatusConditions(request, {
      whatsapp: "UNKNOWN",
      ai: "OFF",
      now: new Date(NOW.getTime() + 60_000),
      prisma: double.client,
    });
    expect(double.open(TENANT, "WHATSAPP_DISCONNECTED")).toHaveLength(1);

    const back = new Date(NOW.getTime() + 120_000);
    await reconcileStatusConditions(request, {
      whatsapp: "CONNECTED",
      ai: "OFF",
      now: back,
      prisma: double.client,
    });
    expect(double.open(TENANT, "WHATSAPP_DISCONNECTED")).toHaveLength(0);
    expect(double.of(TENANT, "WHATSAPP_DISCONNECTED")[0]?.resolvedAt).toEqual(
      back,
    );
  });

  it("nunca lança, mesmo com o banco fora", async () => {
    const request = fakeRequest();
    const broken = {
      tenantNotification: {
        createMany: async () => {
          throw new Error("database is down");
        },
        updateMany: async () => {
          throw new Error("database is down");
        },
      },
    } as unknown as NotificationPrisma;

    await expect(
      reconcileStatusConditions(request, {
        whatsapp: "DISCONNECTED",
        ai: "UNKNOWN",
        now: NOW,
        prisma: broken,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("isolamento de negócio", () => {
  it("a condição de um negócio não é vista nem resolvida pelo outro", async () => {
    const double = new NotificationPrismaDouble();

    await reconcileNotificationCenter(
      fakeRequest("tenant-a"),
      deps(double, { awaitingHuman: async () => [waitingCustomer] }),
      { now: NOW },
    );
    await reconcileNotificationCenter(
      fakeRequest("tenant-b"),
      deps(double, { awaitingHuman: async () => [] }),
      { now: NOW },
    );

    expect(double.open("tenant-a", "CUSTOMER_WAITING_HUMAN")).toHaveLength(1);
    expect(double.of("tenant-b", "CUSTOMER_WAITING_HUMAN")).toEqual([]);
  });
});
