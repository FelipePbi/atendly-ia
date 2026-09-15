import type { NotificationKind } from "../../generated/prisma/enums.js";
import {
  onboardingIssues,
  type OnboardingState,
} from "../../lib/onboarding-state.js";
import {
  aiAppointmentDedupeKey,
  conversationDedupeKey,
  importSessionDedupeKey,
  type NotificationDraft,
  reminderIntentDedupeKey,
  tenantConditionDedupeKey,
} from "./species.js";

/**
 * As decisões de produto da central, **puras**: entram as leituras das fontes,
 * sai o que materializar e o que resolver. Nenhuma delas toca banco, cliente
 * HTTP ou relógio implícito — o instante entra como argumento.
 *
 * Elas estão separadas da execução de propósito. As regras que este Goal não
 * pode errar (`UNKNOWN` não abre condição, `OFF` não é indisponibilidade,
 * preferência desligada não materializa, nada de retroativo) são exatamente as
 * que ficam aqui, verificáveis sem banco e sem serviço no ar.
 */

export type StatusWhatsApp = "CONNECTED" | "DISCONNECTED" | "UNKNOWN";
export type StatusAi = "ACTIVE" | "OFF" | "PENDING" | "UNKNOWN";

/** O que a reconciliação de uma espécie de condição decidiu. */
export interface ConditionPlan {
  /** Condições que a fonte reporta **agora**. */
  open: NotificationDraft[];
  /** Espécies de tenant cuja condição aberta deve receber `resolvedAt`. */
  resolve: NotificationKind[];
}

/**
 * Condições de WhatsApp e IA, a partir dos valores que `GET /v1/status`
 * **já** computou nesta requisição. Zero chamada remota a mais.
 *
 * Duas assimetrias deliberadas, ambas do vault:
 *
 * - **WhatsApp `UNKNOWN` não abre e não resolve.** Desconhecido não é
 *   desconectado, e também não é prova de que voltou: a dependência apenas não
 *   respondeu. Abrir seria alarme falso; resolver seria apagar uma condição
 *   real porque paramos de enxergá-la.
 * - **IA `OFF` não abre.** Desligada é escolha da profissional, não
 *   indisponibilidade. `UNKNOWN` (a IA não respondeu) e `PENDING` (a
 *   convergência que a própria rota acabou de tentar não deu certo) são os
 *   casos de indisponibilidade. `OFF` **resolve** condição aberta: a IA deixou
 *   de ser esperada no ar, então não há mais indisponibilidade a reportar.
 */
export function planStatusConditions(input: {
  whatsapp: StatusWhatsApp;
  ai: StatusAi;
  now: Date;
}): ConditionPlan {
  const open: NotificationDraft[] = [];
  const resolve: NotificationKind[] = [];

  if (input.whatsapp === "DISCONNECTED") {
    open.push({
      kind: "WHATSAPP_DISCONNECTED",
      dedupeKey: tenantConditionDedupeKey("WHATSAPP_DISCONNECTED"),
      subjectId: null,
      occurredAt: input.now,
      payload: {},
    });
  } else if (input.whatsapp === "CONNECTED") {
    resolve.push("WHATSAPP_DISCONNECTED");
  }

  if (input.ai === "UNKNOWN" || input.ai === "PENDING") {
    open.push({
      kind: "AI_UNAVAILABLE",
      dedupeKey: tenantConditionDedupeKey("AI_UNAVAILABLE"),
      subjectId: null,
      occurredAt: input.now,
      payload: { state: input.ai },
    });
  } else {
    resolve.push("AI_UNAVAILABLE");
  }

  return { open, resolve };
}

export interface AwaitingHumanEntry {
  conversationId: string;
  /** Nome quando a conversa tem um; `null` quando nao. Nunca telefone. */
  contactName: string | null;
  reason: string;
  openedAt: string;
}

/**
 * Clientes esperando atendimento humano.
 *
 * A leitura da IA já entrega **uma entrada por conversa** e já exclui o
 * takeover do dono; aqui a chave de dedupe é a conversa, e não a linha de
 * handoff, para que a mesma conversa nunca vire duas notificações.
 *
 * `keepSubjectIds` é o que a fonte ainda reporta: toda condição aberta desta
 * espécie fora dessa lista deixou de ser reportada e será resolvida.
 */
export function planAwaitingHuman(entries: AwaitingHumanEntry[]): {
  open: NotificationDraft[];
  keepSubjectIds: string[];
} {
  const open = entries.map((entry) => ({
    kind: "CUSTOMER_WAITING_HUMAN" as const,
    dedupeKey: conversationDedupeKey(entry.conversationId),
    subjectId: entry.conversationId,
    occurredAt: new Date(entry.openedAt),
    // Só o nome entra no `payload`, e só quando existe: a chave ausente é o
    // que a copy genérica da espécie espera ("Um cliente está esperando"). Não
    // há queda para telefone formatado aqui nem na fonte — telefone não é
    // gravado (critério 5), e `subjectId` já leva para a conversa, onde a
    // identificação completa está.
    payload: {
      ...(entry.contactName ? { contactName: entry.contactName } : {}),
      reason: entry.reason,
    },
  }));
  return {
    open,
    keepSubjectIds: entries.map((entry) => entry.conversationId),
  };
}

export interface FailedIntentEntry {
  id: string;
  appointmentId: string;
  kind: string;
  slot: string;
  reason: string | null;
  dueAt: string;
  settledAt: string | null;
}

/**
 * Falhas de lembrete. A leitura do dono devolve **só** `FAILED`: `DISMISSED` e
 * `CANCELLED` são decisões legítimas do domínio e não chegam nesta lista —
 * notificá-las transformaria funcionamento correto em alarme.
 *
 * `detail` não entra no `payload`: ele é diagnóstico livre e nunca vai para a
 * tela como está. O motivo exibido vem do vocabulário fechado de `reason`.
 */
export function planReminderFailed(
  entries: FailedIntentEntry[],
  options: { seededAt: Date },
): NotificationDraft[] {
  return entries
    .map((entry) => ({
      kind: "REMINDER_FAILED" as const,
      dedupeKey: reminderIntentDedupeKey(entry.id),
      subjectId: entry.appointmentId,
      occurredAt: new Date(entry.settledAt ?? entry.dueAt),
      payload: {
        appointmentId: entry.appointmentId,
        kind: entry.kind,
        slot: entry.slot,
        reason: entry.reason,
      },
    }))
    .filter((draft) => isAfterSeed(draft.occurredAt, options.seededAt));
}

export interface ImportHistoryEntry {
  sessionId: string;
  completedAt: string;
  counts: { imported: number };
}

/**
 * Importação concluída. Sem rota nova: o fato vem da leitura de estado da
 * importação que já existe (`GET /v1/calendar/imports`, D-036).
 */
export function planImportCompleted(
  history: ImportHistoryEntry | null,
  options: { seededAt: Date },
): NotificationDraft[] {
  if (!history) return [];
  const occurredAt = new Date(history.completedAt);
  if (!isAfterSeed(occurredAt, options.seededAt)) return [];
  return [
    {
      kind: "IMPORT_COMPLETED",
      dedupeKey: importSessionDedupeKey(history.sessionId),
      subjectId: history.sessionId,
      occurredAt,
      payload: {
        sessionId: history.sessionId,
        importedCount: history.counts.imported,
      },
    },
  ];
}

export interface AiCreatedEventEntry {
  appointmentId: string;
  after: unknown;
  occurredAt: string;
  sequence: string;
}

/**
 * Agendamento criado pela IA — a única espécie sujeita a preferência, com
 * **default desligado** (vault: "default silencioso").
 *
 * Com a preferência desligada nada é materializado, e mesmo assim o cursor
 * avança: quem avança é {@link aiAppointmentCursor}, que não olha a
 * preferência. Ligar a preferência não pode fazer chover notificação
 * retroativa de tudo que passou enquanto ela estava desligada.
 */
export function planAiAppointmentCreated(
  entries: AiCreatedEventEntry[],
  options: { seededAt: Date; preferenceEnabled: boolean },
): NotificationDraft[] {
  if (!options.preferenceEnabled) return [];
  return entries
    .map((entry) => ({
      kind: "AI_APPOINTMENT_CREATED" as const,
      dedupeKey: aiAppointmentDedupeKey(entry.sequence),
      subjectId: entry.appointmentId,
      occurredAt: new Date(entry.occurredAt),
      payload: {
        appointmentId: entry.appointmentId,
        ...appointmentSlot(entry.after),
      },
    }))
    .filter((draft) => isAfterSeed(draft.occurredAt, options.seededAt));
}

/**
 * Cursor do feed de eventos: avança com o que foi **lido**, materializado ou
 * não. `sequence` é único e monotônico no dono, então o último lido é o
 * cursor — `nextCursor` só vem quando a página encheu.
 */
export function aiAppointmentCursor(
  entries: AiCreatedEventEntry[],
  current: string | null,
): string | null {
  return entries.at(-1)?.sequence ?? current;
}

/**
 * Configuração essencial faltando, **reusando `onboardingState`** em vez de
 * reescrever o que é essencial numa segunda regra que poderia divergir.
 *
 * Só vale para negócio que já concluiu o onboarding: quem está em onboarding
 * não tem configuração faltando — está configurando.
 */
export function planSetupIncomplete(
  state: OnboardingState,
  now: Date,
): ConditionPlan {
  const issues = state.completed ? onboardingIssues(state) : [];
  if (issues.length === 0) return { open: [], resolve: ["SETUP_INCOMPLETE"] };
  return {
    open: [
      {
        kind: "SETUP_INCOMPLETE",
        dedupeKey: tenantConditionDedupeKey("SETUP_INCOMPLETE"),
        subjectId: null,
        occurredAt: now,
        // Vocabulário fechado de pendências, o mesmo que a conclusão do
        // onboarding recusa. Nada de texto livre.
        payload: { issues },
      },
    ],
    resolve: [],
  };
}

/**
 * Nenhum negócio ganha notificação retroativa de evento antigo: o corte é o
 * instante da primeira reconciliação do tenant. Evento anterior a ele avança o
 * cursor sem criar linha. Condição não passa por aqui — é estado corrente, e
 * nasce refletindo o agora.
 */
function isAfterSeed(occurredAt: Date, seededAt: Date): boolean {
  return occurredAt.getTime() >= seededAt.getTime();
}

/**
 * O recorte do evento do dono que a copy usa. `after` do `AppointmentEvent`
 * traz data, horário e status — nada de cliente, telefone ou valor —, e o que
 * não for reconhecível simplesmente não entra no `payload`.
 */
function appointmentSlot(after: unknown): Record<string, unknown> {
  if (typeof after !== "object" || after === null) return {};
  const source = after as Record<string, unknown>;
  const slot: Record<string, unknown> = {};
  if (typeof source.date === "string") slot.date = source.date;
  if (typeof source.startTime === "string") slot.startTime = source.startTime;
  return slot;
}
