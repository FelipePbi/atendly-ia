export type SchedulingPriceType =
  | "FIXED"
  | "STARTING_AT"
  | "ON_REQUEST"
  | "NOT_INFORMED";

export interface SchedulingServiceDefinition {
  id: string;
  name: string;
  /** Ausente e pendencia de revisao; `/internal/services` ja so devolve
   * servico operacional, entao aqui e sempre um numero. */
  duration: number;
  priceType: SchedulingPriceType;
  price: number | null;
  colorId: number | null;
  /**
   * Intervalo de referencia para recorrencia (Goal007), em dias. Nulo quando
   * o servico nao tem cadencia cadastrada — nesse caso a IA pode **oferecer**
   * a serie recorrente (Goal009), mas nunca inventa um intervalo por conta
   * propria.
   */
  recurrenceIntervalDays: number | null;
}

export interface SchedulingCustomerSummary {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface SchedulingAppointmentServiceItem {
  serviceId: string;
  name: string;
  /** Ausente quando o item nao tem duracao propria conhecida (Goal007). */
  duration: number | null;
  priceType: SchedulingPriceType;
  price: number | null;
}

export type SchedulingAgreementTotalType = "FIXED" | "STARTING_AT" | "NONE";

/**
 * Estados do produto (Goal008). O client continua tipando `status` como
 * `string` de propósito: uma resposta antiga com `SCHEDULED` — replay de
 * idempotência gravado antes da normalização — precisa continuar decodável.
 * Esta lista é o que a IA sabe **interpretar**, não o que ela aceita
 * receber.
 */
export const SCHEDULING_APPOINTMENT_STATES = [
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type SchedulingAppointmentState =
  (typeof SCHEDULING_APPOINTMENT_STATES)[number];

export interface SchedulingAppointment {
  id: string;
  /**
   * Título do atendimento manual excepcional sem serviço cadastrado
   * (Goal008). A IA **lê** este campo — um atendimento assim pode existir na
   * agenda — mas nunca cria um: não há caminho de tool que o produza.
   */
  title: string | null;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  customerId: string | null;
  customer: SchedulingCustomerSummary | null;
  services: SchedulingAppointmentServiceItem[];
  price: number | null;
  totalPriceType: SchedulingAgreementTotalType;
  comments: string | null;
  status: string;
  serviceId: string | null;
  serviceIds: string[];
  serviceName: string | null;
  customerName: string | null;
}

/**
 * Candidato a pessoa atendida.
 *
 * O telefone do contato pode devolver zero, um ou varios candidatos: ele nao
 * prova identidade. A escolha entre eles e sempre explicita.
 */
export interface SchedulingCustomerCandidate {
  id: string;
  name: string | null;
  phone: string | null;
}

/**
 * Dependente confirmado de uma pessoa que usa o numero (Goal142).
 *
 * So entra quem tem `PRIMARY_GUARDIAN` `CONFIRMED` apontando para um
 * candidato do telefone. Nao prova identidade: e mais um candidato, e a
 * escolha continua explicita na conversa.
 */
export interface SchedulingCustomerDependent {
  id: string;
  name: string | null;
  phone: string | null;
  guardian: { id: string; name: string | null };
}

/**
 * Leitura dos horarios do numero (Goal142). `includeDependents` (padrao
 * `false`) inclui os horarios dos dependentes confirmados dos candidatos.
 */
export interface FindAppointmentsForPhoneOptions {
  includeDependents?: boolean;
}

/** Recorte do cliente que a IA esta autorizada a usar. */
export interface SchedulingAuthorizedCustomerContext {
  id: string;
  name: string | null;
  phone: string | null;
  notes: string[];
  tags: string[];
  primaryGuardian: { id: string; name: string | null } | null;
}

export interface ScheduleAppointmentInput {
  serviceId: string;
  serviceIds?: string[];
  date: string;
  startTime: string;
  /** Pessoa ja resolvida. Quando ausente, o cadastro nasce na confirmacao. */
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  comments?: string;
  /**
   * Hold criado ao propor o horário (Goal008). Ausente só quando a proposta
   * é anterior ao hold (rascunho legado) — nesse caso o Scheduling revalida
   * a disponibilidade normalmente.
   *
   * Não existe `overlapOverride` aqui, e isso é a regra, não um esquecimento:
   * a IA nunca força sobreposição. O campo não estar no contrato é o que
   * torna impossível enviá-lo por acidente.
   */
  holdId?: string | null;
}

export interface RescheduleAppointmentInput {
  appointmentId: string;
  date: string;
  startTime: string;
  /**
   * Hold do NOVO horário. O horário original continua ocupado pelo próprio
   * atendimento até a remarcação acontecer — nada o solta antes.
   */
  holdId?: string | null;
}

/**
 * Ocupação temporária de um horário enquanto a cliente decide (Goal008).
 *
 * Vive um TTL curto decidido pelo relógio do banco. A IA cria um ao propor
 * e o apresenta na confirmação; se ele venceu, a confirmação não acontece —
 * a IA consulta de novo e oferece alternativa.
 */
export interface SchedulingHold {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  serviceIds: string[];
  /** Instante de expiração em ISO, sempre vindo do relógio do banco. */
  expiresAt: string;
  status: "ACTIVE" | "CONSUMED" | "RELEASED" | "EXPIRED";
}

export interface CreateSchedulingHoldInput {
  serviceIds: string[];
  date: string;
  startTime: string;
  customerId?: string | null;
  /** Contato ainda não resolvido para uma pessoa; nunca funde identidade. */
  contactRef?: string | null;
}

/**
 * Erro próprio do Scheduling para hold que não serve mais. A IA reage a ele
 * consultando a disponibilidade de novo — nunca confirmando assim mesmo.
 */
export const APPOINTMENT_HOLD_EXPIRED = "APPOINTMENT_HOLD_EXPIRED";

/**
 * Fronteira entre falha de negócio e falha de infraestrutura do Scheduling
 * (Goal011). `SchedulingClient` classifica pelo **status HTTP e pelo código**
 * devolvido, nunca pelo texto:
 *
 * - Resposta 4xx com corpo de erro decodificável é sempre falha de negócio
 *   (`DomainError`): o código chega ao modelo como veio do Scheduling
 *   (ex.: `SLOT_UNAVAILABLE`, `APPOINTMENT_HOLD_EXPIRED`, `CUSTOMER_NOT_FOUND`).
 * - Autenticação interna ausente, contexto de chamada não confiável, timeout,
 *   resposta 5xx e resposta com formato inesperado são sempre
 *   `InfrastructureError`: o detalhe real vai só para o log (requestId,
 *   aiRunId), nunca para o modelo nem para a mensagem enviada.
 */
export const SCHEDULING_INFRASTRUCTURE_ERROR_CODES = [
  "SCHEDULING_CONTEXT_REQUIRED",
  "SCHEDULING_AUTH_NOT_CONFIGURED",
  "SCHEDULING_TIMEOUT",
  "SCHEDULING_UNAVAILABLE",
  "SCHEDULING_UPSTREAM_UNAVAILABLE",
  "SCHEDULING_INVALID_RESPONSE",
] as const;

export type SchedulingInfrastructureErrorCode =
  (typeof SCHEDULING_INFRASTRUCTURE_ERROR_CODES)[number];

export interface SchedulingRequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

/**
 * Recorrência de atendimento (Goal009): série finita a partir de um
 * serviço, com um hold por ocorrência. A IA nunca decide antecedência,
 * granularidade nem override — a pré-visualização e a confirmação passam
 * pela mesma grade e pelos mesmos buffers que uma proposta avulsa.
 */
export interface PreviewAppointmentSeriesInput {
  serviceIds: string[];
  occurrenceCount: number;
  /** Ausente usa o intervalo padrão do serviço (`recurrenceIntervalDays`). */
  intervalDays?: number;
  firstDate: string;
  firstStartTime: string;
  customerId?: string | null;
  contactRef?: string | null;
}

export interface SchedulingSeriesOccurrencePreview {
  index: number;
  requestedDate: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  adjusted: boolean;
  holdId: string | null;
  unavailable: boolean;
}

export interface ConfirmAppointmentSeriesInput {
  /** Holds da pré-visualização, na mesma ordem. */
  holdIds: string[];
  serviceIds: string[];
  intervalDays: number;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  comments?: string;
}

// --- Intencao de envio (Goal021) -------------------------------------------
// O dono da agenda decide QUANDO e COM QUE FATOS; a IA decide SE o contato
// esta apto e COMO o texto soa. Nada abaixo carrega texto de mensagem: o que
// viaja sao fatos, e e por isso que a IA nunca precisa formatar instante.

export type NotificationIntentKind = "REMINDER" | "CHANGE_NOTICE";
export type NotificationIntentSlot = "FIRST" | "SECOND" | "CHANGE_NOTICE";

/**
 * Vocabulario **fechado** do motivo, identico ao enum do dono. A entrega
 * escolhe dentro dele e nunca manda texto livre no lugar do motivo.
 */
export const NOTIFICATION_INTENT_REASONS = [
  "LEAD_ALREADY_PASSED",
  "APPOINTMENT_VERSION_SUPERSEDED",
  "APPOINTMENT_NOT_CONFIRMED",
  "APPOINTMENT_CANCELLED",
  "APPOINTMENT_ALREADY_STARTED",
  "REMINDER_CONFIGURATION_CHANGED",
  "CUSTOMER_WITHOUT_PHONE",
  "CONTACT_IGNORED",
  "AI_NOT_ENABLED",
  "CHANNEL_NOT_CONNECTED",
  "TRANSPORT_FAILED",
  "TRANSPORT_UNKNOWN",
  "ATTEMPTS_EXHAUSTED",
] as const;

export type NotificationIntentReason =
  (typeof NOTIFICATION_INTENT_REASONS)[number];

/** Desfechos que a entrega pode declarar. Cancelar e decisao do dono. */
export type NotificationSettlementOutcome = "SENT" | "FAILED" | "DISMISSED";

/**
 * Fatos prontos compostos pelo dono. **Sem endereco** e sem texto de
 * mensagem, de proposito: o que nao chega aqui nao pode ser repetido numa
 * mensagem automatica.
 */
export interface NotificationFacts {
  kind: NotificationIntentKind;
  appointmentStatus: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  /** Nomes dos servicos pelo snapshot do acordo, nunca pelo catalogo de hoje. */
  services: string[];
  /** Titulo do atendimento manual sem servico cadastrado. */
  title: string | null;
  timezone: string;
  /** Data local **ja formatada** no fuso do negocio (`AAAA-MM-DD`). */
  date: string;
  /** Hora local **ja formatada** no fuso do negocio (`HH:MM`). */
  time: string;
  /** O instante junto, para quem precisar comparar sem reformatar. */
  startAt: string;
  price: number | null;
  confirmationRequested: boolean;
}

export interface ClaimedNotificationIntent {
  id: string;
  tenantId: string;
  appointmentId: string;
  kind: NotificationIntentKind;
  slot: NotificationIntentSlot;
  appointmentVersion: number;
  dueAt: string;
  attemptCount: number;
  /** Prova de posse do lease; exigida na liquidacao. */
  leaseToken: string;
  leaseExpiresAt: string;
  /** `correlationId` deterministico da saida, derivado da identidade. */
  correlationId: string;
  facts: NotificationFacts;
}

export interface NotificationClaimResult {
  owner: string;
  claimed: ClaimedNotificationIntent[];
  /** Liquidadas pela revalidacao do dono, em vez de entregues. */
  settled: Array<{
    id: string;
    tenantId: string;
    appointmentId: string;
    state: string;
    reason: NotificationIntentReason | null;
  }>;
  released: number;
  exhausted: number;
  skipped: number;
}

export interface NotificationIntentSettlement {
  id: string;
  tenantId: string;
  appointmentId: string;
  state: string;
  reason: NotificationIntentReason | null;
  detail: string | null;
  attemptCount: number;
  sentAt: string | null;
  settledAt: string | null;
  correlationId: string | null;
}

export interface SettleNotificationIntentInput {
  tenantId: string;
  intentId: string;
  leaseToken: string;
  outcome: NotificationSettlementOutcome;
  reason?: NotificationIntentReason | null;
  detail?: string | null;
  correlationId?: string | null;
}

export interface ClaimNotificationIntentsInput {
  owner?: string;
  limit?: number;
  perTenantLimit?: number;
  leaseTtlSeconds?: number;
}

// --- Confirmacao de presenca pela resposta ao lembrete (Goal021) -----------
// O lembrete pergunta; a resposta do cliente chega como turno normal de
// conversa. Presenca confirmada e dado operacional separado: nao confirma,
// nao conclui e nao cancela nada.

/**
 * Recorte de `GET /internal/reminder-settings` que a IA precisa ler.
 *
 * So `confirmationEnabled` decide se a resposta ao lembrete pode virar
 * presenca registrada. `configured` distingue "o negocio escolheu" de "o
 * default do produto vale" — sem linha gravada, o negocio nunca habilitou
 * confirmacao, e a IA nao a trata.
 */
export interface ReminderConfirmationSettings {
  configured: boolean;
  confirmationEnabled: boolean;
}

/**
 * Resposta de `POST /internal/appointments/:id/presence`.
 *
 * Carrega `status`, `completedAt` e `noShowAt` **de proposito**: sao os
 * campos que confirmar presenca nao pode mexer, e devolve-los e o que
 * permite provar que nao mexeu.
 */
export interface AppointmentPresenceConfirmation {
  appointmentId: string;
  status: string;
  presenceConfirmedAt: string | null;
  completedAt: string | null;
  noShowAt: string | null;
}

/**
 * Negocio que nao habilitou confirmacao pelo lembrete: a resposta do cliente
 * segue sendo conversa, nunca registro. Codigo, nao prompt.
 */
export const PRESENCE_CONFIRMATION_NOT_ENABLED =
  "PRESENCE_CONFIRMATION_NOT_ENABLED";

// --- Politica de antecedencia do cliente (Goal073) --------------------------
// So restringe o chamador IA (a profissional nunca e limitada por isto). A
// IA le a configuracao vigente e recusa cancelar/remarcar fora do prazo
// antes de gravar pendencia ou criar hold; o Scheduling confere de novo no
// commit, para o caso de a configuracao mudar entre o prepare e o confirm.

/** Recorte de `GET /internal/availability-settings` que esta regra le. */
export interface CustomerChangePolicy {
  /** Zero (o default) nao restringe nada. */
  minNoticeMinutes: number;
}

/**
 * Mesmo codigo que `AvenlyCalendarProvider.assertCustomerChangePolicy`
 * emite no Scheduling: o cliente (via IA) tentou alterar o proprio
 * atendimento com menos antecedencia do que o negocio permite.
 */
export const CUSTOMER_CHANGE_OUTSIDE_POLICY = "CUSTOMER_CHANGE_OUTSIDE_POLICY";
