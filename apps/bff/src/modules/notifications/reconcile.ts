import type { FastifyRequest } from "fastify";

import type { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import type { SchedulingClient } from "../../clients/scheduling/index.js";
import { env } from "../../config/env.js";
import { toErrorMessage } from "../../lib/errors.js";
import {
  type OnboardingState,
  onboardingState,
} from "../../lib/onboarding-state.js";
import { getPrisma } from "../../lib/prisma.js";
import { currentTenantContext } from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";
import {
  aiAppointmentCursor,
  planAiAppointmentCreated,
  planAwaitingHuman,
  planImportCompleted,
  planReminderFailed,
  planSetupIncomplete,
  planStatusConditions,
  type StatusAi,
  type StatusWhatsApp,
} from "./plan.js";
import {
  loadPreferences,
  loadSyncState,
  materialize,
  type NotificationPrisma,
  resolveConditionsExcept,
  resolveTenantConditions,
  saveSyncState,
} from "./store.js";

/**
 * O motor da central (Goal022 §2).
 *
 * Quatro propriedades, nenhuma opcional:
 *
 * 1. **Sem worker.** Não há cron, fila, broker nem laço: a reconciliação roda
 *    dentro de requisição que já existe — as condições de canal dentro de `GET
 *    /v1/status`, as demais espécies dentro das rotas de notificação.
 * 2. **Limitada.** Uma passada por requisição, sob throttle por negócio
 *    persistido em `NotificationSyncState`; dentro da janela, a rota responde
 *    do estado já gravado.
 * 3. **Idempotente, sem emudecer.** A chave `(tenantId, dedupeKey)` do banco é
 *    quem garante a idempotência, e rematerializar não reescreve `readAt` nem
 *    `occurredAt` enquanto o fato é o mesmo. A exceção é a condição **já
 *    resolvida** que a fonte volta a reportar: ela reabre (`resolvedAt` de
 *    volta a nulo, não lida, `occurredAt` do episódio novo), porque a chave de
 *    dedupe é a identidade da condição e não a da ocorrência — sem isso a
 *    central calaria a partir da segunda queda do canal.
 * 4. **Nunca lança.** Fonte indisponível deixa o `kind` dela **intocado** — nem
 *    materializa, nem resolve — e é reportada como degradada. Uma fonte
 *    quebrada não derruba a central inteira nem vira `500`.
 *
 * A direção das chamadas internas continua uma só: quem lê é o BFF. Nem
 * Scheduling nem IA ganham cliente de saída ou rota de push para cá.
 */

/** Fonte da central, na granularidade em que a degradação é reportada. */
export type NotificationSource =
  | "AWAITING_HUMAN"
  | "REMINDER_FAILED"
  | "IMPORT_COMPLETED"
  | "AI_APPOINTMENT_CREATED"
  | "SETUP_INCOMPLETE";

export interface NotificationReconciliation {
  /** `false` quando a janela de throttle ainda não venceu e nada foi lido. */
  reconciled: boolean;
  /** Fontes que não responderam; o `kind` de cada uma ficou como estava. */
  degraded: NotificationSource[];
}

export interface NotificationReconcileDeps {
  ai: Pick<AiOrchestratorClient, "listConversationsAwaitingHuman">;
  scheduling: Pick<
    SchedulingClient,
    | "listFailedNotificationIntents"
    | "listAiCreatedAppointmentEvents"
    | "importState"
    | "calendar"
    | "listServices"
    | "availabilitySettings"
  >;
  /** Injetável para prova sem banco; em produção é sempre `getPrisma()`. */
  prisma?: NotificationPrisma;
  /**
   * Injetável pelo mesmo motivo; em produção é sempre `onboardingState`, e é
   * esse reuso — e não uma segunda definição de configuração essencial — que
   * decide `SETUP_INCOMPLETE`.
   */
  readOnboardingState?: (
    request: FastifyRequest,
    scheduling: NotificationReconcileDeps["scheduling"],
  ) => Promise<OnboardingState>;
}

export interface NotificationReconcileOptions {
  now?: Date;
  /** Ignora a janela de throttle. Usado por mutação que precisa do estado já. */
  force?: boolean;
}

const PAGE_LIMIT = 50;

/**
 * Reconcilia as espécies que dependem dos donos. Roda nas rotas de notificação,
 * sob throttle, e nunca lança.
 */
export async function reconcileNotificationCenter(
  request: FastifyRequest,
  deps: NotificationReconcileDeps,
  options: NotificationReconcileOptions = {},
): Promise<NotificationReconciliation> {
  const now = options.now ?? new Date();
  const prisma = deps.prisma ?? getPrisma();
  const tenant = currentTenantContext(request);

  try {
    const state = await loadSyncState(prisma, tenant.tenantId, now);
    if (!options.force && withinThrottle(state.lastReconciledAt, now)) {
      return { reconciled: false, degraded: [] };
    }

    const preferences = await loadPreferences(prisma, tenant.tenantId);
    const cursors = {
      reminderFailed: state.reminderFailedCursor,
      aiAppointmentEvent: state.aiAppointmentEventCursor,
    };
    const degraded: NotificationSource[] = [];

    await Promise.all([
      /**
       * Clientes esperando humano. A resolução acontece na mesma passada da
       * leitura, e só nela: sem resposta da IA, nenhuma condição é fechada —
       * uma conversa que ainda espera não pode sumir porque a IA caiu.
       */
      isolate(request, degraded, "AWAITING_HUMAN", async () => {
        const entries = await deps.ai.listConversationsAwaitingHuman(
          internalContext(request),
          { limit: PAGE_LIMIT },
        );
        const plan = planAwaitingHuman(entries);
        await materialize(prisma, tenant.tenantId, plan.open);
        await resolveConditionsExcept(
          prisma,
          tenant.tenantId,
          "CUSTOMER_WAITING_HUMAN",
          plan.keepSubjectIds,
          now,
        );
      }),
      isolate(request, degraded, "REMINDER_FAILED", async () => {
        const page = await deps.scheduling.listFailedNotificationIntents(
          internalContext(request),
          { cursor: cursors.reminderFailed, limit: PAGE_LIMIT },
        );
        await materialize(
          prisma,
          tenant.tenantId,
          planReminderFailed(page.items, { seededAt: state.seededAt }),
        );
        // O cursor opaco do dono só avança quando a página veio cheia; a cauda
        // parcial é relida na próxima passada, e a chave de dedupe faz dela um
        // no-op.
        cursors.reminderFailed = page.nextCursor ?? cursors.reminderFailed;
      }),
      isolate(request, degraded, "AI_APPOINTMENT_CREATED", async () => {
        const page = await deps.scheduling.listAiCreatedAppointmentEvents(
          internalContext(request),
          { afterSequence: cursors.aiAppointmentEvent, limit: PAGE_LIMIT },
        );
        await materialize(
          prisma,
          tenant.tenantId,
          planAiAppointmentCreated(page.items, {
            seededAt: state.seededAt,
            preferenceEnabled: preferences.aiAppointmentCreated,
          }),
        );
        // O cursor avança com o que foi lido, mesmo com a preferência
        // desligada: ligar depois não pode fazer chover o passado.
        cursors.aiAppointmentEvent = aiAppointmentCursor(
          page.items,
          cursors.aiAppointmentEvent,
        );
      }),
      isolate(request, degraded, "IMPORT_COMPLETED", async () => {
        // Sem rota nova: a importação já tem leitura própria (D-036).
        const importState = await deps.scheduling.importState(
          internalContext(request),
        );
        await materialize(
          prisma,
          tenant.tenantId,
          planImportCompleted(importState.history, {
            seededAt: state.seededAt,
          }),
        );
      }),
      isolate(request, degraded, "SETUP_INCOMPLETE", async () => {
        const readState = deps.readOnboardingState ?? onboardingState;
        const plan = planSetupIncomplete(
          await readState(request, deps.scheduling),
          now,
        );
        await materialize(prisma, tenant.tenantId, plan.open);
        await resolveTenantConditions(
          prisma,
          tenant.tenantId,
          plan.resolve,
          now,
        );
      }),
    ]);

    // O cursor de uma fonte que falhou não foi tocado: ela recomeça de onde
    // parou, sem pular o que não chegou a ler.
    await saveSyncState(prisma, tenant.tenantId, {
      lastReconciledAt: now,
      reminderFailedCursor: cursors.reminderFailed,
      aiAppointmentEventCursor: cursors.aiAppointmentEvent,
    });

    return { reconciled: true, degraded };
  } catch (error) {
    // Leitura não vira `500` por causa de um efeito que ela tentou de favor.
    request.log.warn(
      { err: toErrorMessage(error), tenantId: tenant.tenantId },
      "Notification reconciliation failed; the centre answers from what is stored.",
    );
    return { reconciled: false, degraded: [] };
  }
}

/**
 * Condições de canal, a partir do que `GET /v1/status` **já** computou.
 *
 * Zero chamada remota a mais: a rota acabou de verificar Evolution e IA nesta
 * própria requisição, e o que chega aqui são os valores dela. Não muda o corpo
 * da resposta de status e nunca lança — status é leitura honesta, e continua
 * sendo mesmo quando a central falha.
 */
export async function reconcileStatusConditions(
  request: FastifyRequest,
  input: {
    whatsapp: StatusWhatsApp;
    ai: StatusAi;
    now?: Date;
    prisma?: NotificationPrisma;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const prisma = input.prisma ?? getPrisma();
  const tenant = currentTenantContext(request);
  try {
    const plan = planStatusConditions({
      whatsapp: input.whatsapp,
      ai: input.ai,
      now,
    });
    await materialize(prisma, tenant.tenantId, plan.open);
    await resolveTenantConditions(prisma, tenant.tenantId, plan.resolve, now);
  } catch (error) {
    request.log.warn(
      { err: toErrorMessage(error), tenantId: tenant.tenantId },
      "Notification condition reconciliation failed; status is unaffected.",
    );
  }
}

/**
 * Uma fonte falhando não contamina as outras: o `kind` dela fica intocado e a
 * degradação é reportada, exatamente como `/v1/status` já faz com Evolution e
 * IA.
 */
async function isolate(
  request: FastifyRequest,
  degraded: NotificationSource[],
  source: NotificationSource,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    degraded.push(source);
    request.log.warn(
      { err: toErrorMessage(error), source },
      "Notification source unavailable; its kind was left untouched.",
    );
  }
}

function withinThrottle(lastReconciledAt: Date | null, now: Date): boolean {
  if (!lastReconciledAt) return false;
  const windowMs = env.NOTIFICATIONS_RECONCILE_MIN_INTERVAL_SECONDS * 1_000;
  return now.getTime() - lastReconciledAt.getTime() < windowMs;
}
