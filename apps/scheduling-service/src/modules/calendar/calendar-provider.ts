import type { Prisma } from "../../generated/prisma/client.js";

export type ServicePriceType =
  "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";

export interface CalendarServiceDefinition {
  id: string;
  name: string;
  /** Ausente e pendencia de revisao; nunca zero fabricado. */
  durationMinutes: number | null;
  priceType: ServicePriceType;
  price: number | null;
  active: boolean;
  /** Numero legado do Minha Agenda; sempre nulo para a Agenda Atendly. */
  colorId?: number | null;
  /** Token estavel da identidade visual do servico (Agenda Atendly). */
  colorToken?: string | null;
}

export interface CalendarCustomerSummary {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface CalendarAppointmentServiceItem {
  serviceId: string;
  name: string;
  /** Ausente quando o item nao tem duracao propria conhecida. */
  durationMinutes: number | null;
  priceType: ServicePriceType;
  price: number | null;
}

/**
 * Regra unica do total do acordo (Goal007): soma quando todos os itens sao
 * `FIXED`; `STARTING_AT` quando ha algum "a partir de" e nenhum "sob
 * consulta" ou "nao informado"; sem total (`NONE`) nos demais casos. Usada
 * pelo Scheduling e reimplementada de forma equivalente na IA — os dois lados
 * nao compartilham pacote de contrato para este calculo (D-011).
 */
export type AgreementTotalType = "FIXED" | "STARTING_AT" | "NONE";

export interface AgreementTotal {
  type: AgreementTotalType;
  amount: number | null;
}

export function computeAgreementTotal(
  items: Array<{ priceType: ServicePriceType; price: number | null }>,
): AgreementTotal {
  if (items.length === 0) return { type: "NONE", amount: null };
  const hasUnpriced = items.some(
    (item) =>
      item.priceType === "ON_REQUEST" || item.priceType === "NOT_INFORMED",
  );
  if (hasUnpriced) return { type: "NONE", amount: null };
  const amount = items.reduce((total, item) => total + (item.price ?? 0), 0);
  const allFixed = items.every((item) => item.priceType === "FIXED");
  return { type: allFixed ? "FIXED" : "STARTING_AT", amount };
}

export interface CalendarAppointment {
  id: string;
  source: "AI" | "USER" | "INTEGRATION";
  /**
   * Titulo do atendimento manual excepcional sem servico cadastrado
   * (Goal008); nulo quando o atendimento tem itens de catalogo, que ja
   * descrevem o que sera feito.
   */
  title: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  customerId: string | null;
  customer: CalendarCustomerSummary | null;
  services: CalendarAppointmentServiceItem[];
  totalPrice: number | null;
  totalPriceType: AgreementTotalType;
  comments: string | null;
  status: string;
}

export interface AvailableSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface ListAppointmentsInput {
  /** Pessoa resolvida. Quando presente, o telefone não é consultado. */
  customerId?: string;
  /** Filtro por candidatos: todas as pessoas que compartilham o número. */
  customerPhone?: string;
  startDate: string;
  endDate: string;
}

export interface GetAvailabilityInput {
  serviceIds: string[];
  startDate: string;
  days: number;
  stepMinutes: number;
  maxSlots: number;
}

/**
 * Sobreposicao por decisao humana (Goal008): so existe com `source: USER`,
 * flag explicita e motivo. A IA nunca a aplica, e a origem `AI` e recusada
 * — nao ha caminho em que um encaixe aconteca sem alguem assumi-lo.
 */
export interface OverlapOverrideInput {
  overlapOverride?: boolean;
  overlapOverrideReason?: string;
}

/**
 * Ocupacao temporaria de um horario em confirmacao (Goal008). Vive por um TTL
 * curto e some sozinha: nao ha worker de expiracao, a vigencia e sempre
 * recalculada contra o relogio do banco.
 */
export interface CalendarHold {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  serviceIds: string[];
  customerId: string | null;
  /** Contato ainda nao resolvido para uma pessoa; nunca funde identidade (D-005). */
  contactRef: string | null;
  source: "AI" | "USER";
  /** Instante de expiracao em ISO, sempre vindo do relogio do banco. */
  expiresAt: string;
  status: CalendarHoldStatus;
}

/**
 * Derivado, nunca uma coluna: `ACTIVE` e o que sobra depois de consumido,
 * liberado e vencido — e vencido depende de `now()`, que muda sem ninguem
 * escrever na linha.
 */
export type CalendarHoldStatus = "ACTIVE" | "CONSUMED" | "RELEASED" | "EXPIRED";

export interface CreateCalendarHoldInput {
  source?: "AI" | "USER";
  serviceIds: string[];
  date: string;
  startTime: string;
  stepMinutes: number;
  customerId?: string;
  contactRef?: string;
  idempotencyKey: string;
}

/**
 * Hold apresentado a uma confirmacao ou remarcacao. Quando presente, o motor
 * de disponibilidade deixa de contar **este** hold como ocupacao — e so ele.
 */
export interface HoldConsumptionInput {
  holdId?: string;
}

export interface CreateCalendarAppointmentInput
  extends OverlapOverrideInput, HoldConsumptionInput {
  source?: "AI" | "USER";
  /**
   * Vazio apenas no atendimento manual excepcional sem servico cadastrado
   * (`source: USER`, com `title` e `durationMinutes`); nesse caso o
   * atendimento nasce sem `AppointmentItem` e sem total.
   */
  serviceIds: string[];
  /** Titulo do atendimento manual excepcional; exigido quando nao ha servico. */
  title?: string;
  /** Duracao do atendimento manual excepcional; exigida quando nao ha servico. */
  durationMinutes?: number;
  date: string;
  startTime: string;
  /**
   * Pessoa já resolvida. Quando ausente, o cliente é criado **dentro** da
   * transação de confirmação, depois de o slot ser validado.
   */
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  comments?: string;
  stepMinutes: number;
  idempotencyKey: string;
}

export interface RescheduleCalendarAppointmentInput
  extends OverlapOverrideInput, HoldConsumptionInput {
  source?: "AI" | "USER";
  appointmentId: string;
  date: string;
  startTime: string;
  stepMinutes: number;
  idempotencyKey: string;
}

export interface CancelCalendarAppointmentInput {
  source?: "AI" | "USER";
  appointmentId: string;
  comments?: string;
  idempotencyKey: string;
}

/**
 * Entidade tocada por uma mutacao, guardada junto com o resultado
 * idempotente (Goal008). E ela que permite recuperar como sucesso uma chave
 * cujo efeito ja existe, em vez de reexecutar a mutacao.
 */
export type CalendarEffectEntityType =
  "APPOINTMENT" | "APPOINTMENT_HOLD" | "TIME_BLOCK";

export interface CalendarMutationEffect {
  entityType: CalendarEffectEntityType;
  entityId: string;
}

/**
 * Grava o resultado idempotente **dentro da transacao do efeito** (Goal008).
 *
 * A fonte oficial (Agenda Atendly) chama isto com o client transacional da
 * propria mutacao, de modo que efeito e resultado entram no mesmo commit. A
 * fonte externa nao tem transacao de banco para o efeito remoto e nao chama:
 * ali o resultado continua sendo gravado logo depois, como antes do Goal008.
 */
export type CalendarMutationCommit<TResult> = (
  transaction: Prisma.TransactionClient,
  outcome: { result: TResult; effect: CalendarMutationEffect },
) => Promise<void>;

export interface CalendarProvider {
  listServices(): Promise<CalendarServiceDefinition[]>;
  listAppointments(
    input: ListAppointmentsInput,
  ): Promise<CalendarAppointment[]>;
  getAppointment(appointmentId: string): Promise<CalendarAppointment>;
  getAvailability(input: GetAvailabilityInput): Promise<AvailableSlot[]>;
  createAppointment(
    input: CreateCalendarAppointmentInput,
    commit?: CalendarMutationCommit<CalendarAppointment>,
  ): Promise<CalendarAppointment>;
  rescheduleAppointment(
    input: RescheduleCalendarAppointmentInput,
    commit?: CalendarMutationCommit<CalendarAppointment>,
  ): Promise<CalendarAppointment>;
  cancelAppointment(
    input: CancelCalendarAppointmentInput,
    commit?: CalendarMutationCommit<CalendarAppointment>,
  ): Promise<CalendarAppointment>;
  /**
   * Holds (Goal008). Sao da Agenda Atendly: reservar um horario por minutos
   * depende da politica unica de escrita — mesma transacao, mesmo lock, mesmo
   * relogio — que nao existe do outro lado de uma chamada HTTP. A fonte
   * externa mantem a assinatura e recusa com erro proprio.
   */
  createHold(
    input: CreateCalendarHoldInput,
    commit?: CalendarMutationCommit<CalendarHold>,
  ): Promise<CalendarHold>;
  listHolds(): Promise<CalendarHold[]>;
  getHold(holdId: string): Promise<CalendarHold>;
  releaseHold(holdId: string): Promise<CalendarHold>;
}
