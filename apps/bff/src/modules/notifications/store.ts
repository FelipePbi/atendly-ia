import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { NotificationKind } from "../../generated/prisma/enums.js";
import {
  type NotificationDraft,
  notificationLevel,
  notificationShape,
} from "./species.js";

/**
 * O recorte do Prisma que a central escreve. Nada aqui decide produto: este
 * arquivo só grava o que {@link ./plan.ts} decidiu.
 */
export type NotificationPrisma = Pick<
  PrismaClient,
  "tenantNotification" | "notificationPreference" | "notificationSyncState"
>;

/** O que uma passada de materialização fez. */
export interface MaterializeResult {
  /** Linhas que nasceram nesta passada. */
  created: number;
  /** Condições já resolvidas que a fonte voltou a reportar. */
  reopened: number;
}

/**
 * Materializa os rascunhos. **A idempotência é do banco**, não deste código:
 * `createMany` com `skipDuplicates` vira `ON CONFLICT DO NOTHING` sobre
 * `(tenantId, dedupeKey)`, então reconciliar a mesma fonte dez vezes produz
 * uma linha ainda que dez requisições cheguem juntas — coisa que "consultar
 * antes de inserir" não garante.
 *
 * Consequência deliberada para a linha que **ainda está aberta**: ela não é
 * tocada. Materializar de novo não zera `readAt` e não move `occurredAt`. O
 * estado do leitor é do leitor enquanto o fato é o mesmo.
 *
 * O que `createMany` sozinho não resolve, e {@link reopenResolvedConditions}
 * resolve: a condição **já resolvida** que a fonte voltou a reportar. A chave
 * de dedupe de uma condição é a identidade da condição (o tenant, a conversa),
 * não a da ocorrência — então o segundo episódio colide com a linha do
 * primeiro e o `ON CONFLICT DO NOTHING` o engoliria em silêncio. O WhatsApp
 * que cai de novo, o cliente que volta a esperar: a central precisa reportar,
 * e reportar como novidade.
 */
export async function materialize(
  prisma: NotificationPrisma,
  tenantId: string,
  drafts: NotificationDraft[],
): Promise<MaterializeResult> {
  if (drafts.length === 0) return { created: 0, reopened: 0 };
  const result = await prisma.tenantNotification.createMany({
    data: drafts.map((draft) => ({
      tenantId,
      kind: draft.kind,
      level: notificationLevel(draft.kind),
      shape: notificationShape(draft.kind),
      dedupeKey: draft.dedupeKey,
      subjectId: draft.subjectId,
      occurredAt: draft.occurredAt,
      payload: draft.payload as Prisma.InputJsonObject,
    })),
    skipDuplicates: true,
  });
  const reopened = await reopenResolvedConditions(prisma, tenantId, drafts);
  return { created: result.count, reopened };
}

/**
 * Condição resolvida que a fonte voltou a reportar: a mesma linha volta a
 * ficar aberta, com o instante do episódio novo e **não lida de novo**.
 *
 * Reabrir é deliberadamente diferente de rematerializar: só entra aqui a linha
 * que tem `resolvedAt` preenchido, isto é, a que a própria central já tinha
 * dado por encerrada. Uma condição ainda aberta continua intocada, então o
 * `readAt` de quem já viu o episódio corrente sobrevive.
 *
 * Zerar `readAt` é o ponto: a condição que reabre é fato novo, e ficaria
 * invisível na caixa de entrada se herdasse a leitura do episódio anterior.
 * `occurredAt` passa a ser o instante do episódio novo pelo mesmo motivo — o
 * histórico da central é ordenado por ele.
 *
 * `resolvedAt: { not: null }` no filtro é o que torna isto seguro sob
 * concorrência: duas requisições reabrindo ao mesmo tempo, a segunda não
 * encontra linha resolvida e não faz nada. `EVENT` nunca chega aqui — evento
 * não resolve, logo não reabre.
 */
async function reopenResolvedConditions(
  prisma: NotificationPrisma,
  tenantId: string,
  drafts: NotificationDraft[],
): Promise<number> {
  const conditions = drafts.filter(
    (draft) => notificationShape(draft.kind) === "CONDITION",
  );
  if (conditions.length === 0) return 0;

  // Uma consulta para saber se há algo a reabrir; no caso comum (nada
  // resolvido) a passada termina aqui, sem UPDATE nenhum.
  const resolved = await prisma.tenantNotification.findMany({
    where: {
      tenantId,
      shape: "CONDITION",
      dedupeKey: { in: conditions.map((draft) => draft.dedupeKey) },
      resolvedAt: { not: null },
    },
    select: { dedupeKey: true },
  });
  if (resolved.length === 0) return 0;

  const reopening = new Set(resolved.map((row) => row.dedupeKey));
  let count = 0;
  for (const draft of conditions) {
    if (!reopening.has(draft.dedupeKey)) continue;
    const result = await prisma.tenantNotification.updateMany({
      where: {
        tenantId,
        dedupeKey: draft.dedupeKey,
        resolvedAt: { not: null },
      },
      data: {
        resolvedAt: null,
        readAt: null,
        occurredAt: draft.occurredAt,
        payload: draft.payload as Prisma.InputJsonObject,
      },
    });
    count += result.count;
  }
  return count;
}

/**
 * A fonte deixou de reportar a condição: a linha aberta recebe `resolvedAt` e
 * **permanece** no histórico. Nada é deletado neste Goal.
 *
 * O filtro `resolvedAt: null` é o que torna isto idempotente e honesto ao mesmo
 * tempo: resolver duas vezes não move o instante da primeira resolução.
 */
export async function resolveTenantConditions(
  prisma: NotificationPrisma,
  tenantId: string,
  kinds: NotificationKind[],
  now: Date,
): Promise<number> {
  if (kinds.length === 0) return 0;
  const result = await prisma.tenantNotification.updateMany({
    where: {
      tenantId,
      kind: { in: kinds },
      shape: "CONDITION",
      resolvedAt: null,
    },
    data: { resolvedAt: now },
  });
  return result.count;
}

/**
 * Resolve as condições abertas de uma espécie cujo alvo a fonte **não** reporta
 * mais — o cliente que era atendido, a conversa que foi resolvida.
 *
 * Lista vazia resolve todas as abertas da espécie: "a fonte não reporta mais
 * nada" é resposta, não ausência de resposta. A distinção entre isso e "a fonte
 * não respondeu" é de quem chama: fonte indisponível nem chega aqui.
 */
export async function resolveConditionsExcept(
  prisma: NotificationPrisma,
  tenantId: string,
  kind: NotificationKind,
  keepSubjectIds: string[],
  now: Date,
): Promise<number> {
  const result = await prisma.tenantNotification.updateMany({
    where: {
      tenantId,
      kind,
      shape: "CONDITION",
      resolvedAt: null,
      ...(keepSubjectIds.length > 0
        ? { subjectId: { notIn: keepSubjectIds } }
        : {}),
    },
    data: { resolvedAt: now },
  });
  return result.count;
}

export interface NotificationSyncStateRecord {
  seededAt: Date;
  lastReconciledAt: Date | null;
  reminderFailedCursor: string | null;
  aiAppointmentEventCursor: string | null;
}

/**
 * Throttle e cursores do negócio, criados na **primeira** reconciliação dele.
 *
 * É aqui que `seededAt` nasce, e é por isso que ligar a central não despeja
 * meses de histórico: o que é anterior a este instante avança o cursor sem
 * virar notificação.
 */
export async function loadSyncState(
  prisma: NotificationPrisma,
  tenantId: string,
  now: Date,
): Promise<NotificationSyncStateRecord> {
  const state = await prisma.notificationSyncState.upsert({
    where: { tenantId },
    create: { tenantId, seededAt: now },
    update: {},
  });
  return {
    seededAt: state.seededAt,
    lastReconciledAt: state.lastReconciledAt,
    reminderFailedCursor: state.reminderFailedCursor,
    aiAppointmentEventCursor: state.aiAppointmentEventCursor,
  };
}

export async function saveSyncState(
  prisma: NotificationPrisma,
  tenantId: string,
  data: {
    lastReconciledAt: Date;
    reminderFailedCursor: string | null;
    aiAppointmentEventCursor: string | null;
  },
): Promise<void> {
  await prisma.notificationSyncState.update({ where: { tenantId }, data });
}

/**
 * Preferência do negócio. Ausência de linha **é** o default desligado: nenhum
 * negócio recebe `AI_APPOINTMENT_CREATED` sem ter pedido.
 */
export async function loadPreferences(
  prisma: NotificationPrisma,
  tenantId: string,
): Promise<{ aiAppointmentCreated: boolean }> {
  const preference = await prisma.notificationPreference.findUnique({
    where: { tenantId },
  });
  return { aiAppointmentCreated: preference?.aiAppointmentCreated ?? false };
}
