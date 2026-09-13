import { env } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import type { AppointmentDraft } from "../assistant/assistant.service.js";
import {
  type CustomerMemoryKind,
  type CustomerMemoryOrigin,
  type CustomerMemoryPromptItem,
  type CustomerMemoryRecord,
  isCustomerMemoryKind,
  normalizeMemoryValue,
  toCustomerMemoryPromptItem,
} from "./customer-memory.js";
import {
  type CustomerMemoryCandidate,
  inferCustomerMemoryCandidates,
  type TurnAppointmentEvidence,
} from "./memory-inference.js";

/**
 * Tipos de valor unico: duas respostas diferentes se contradizem, entao a nova
 * **substitui** a anterior (`supersededById`), sem apagar. Servico recorrente e
 * observacao sao multivalorados de proposito — quem faz dois servicos
 * recorrentes nao esta se contradizendo.
 */
const SINGLE_VALUED_KINDS: readonly CustomerMemoryKind[] = [
  "PREFERRED_PERIOD",
  "PREFERRED_DAY",
];

/**
 * Permissao padrao por origem.
 *
 * O cadastro da profissional nasce **negado**, como as notas do cliente: ela
 * escreve para si e decide, linha a linha, o que a IA pode usar. O que a
 * propria IA observou na conversa com a pessoa — inferencia e afirmacao da
 * cliente — nasce permitido, senao a inferencia nao teria efeito nenhum; a
 * profissional revoga ou remove a qualquer momento, e a relevancia cai sozinha
 * com a idade (`CUSTOMER_MEMORY_STALE_DAYS`).
 */
export function defaultAiAllowed(origin: CustomerMemoryOrigin): boolean {
  return origin !== "PROFESSIONAL";
}

export interface ListCustomerMemoryInput {
  tenantId: string;
  customerId: string;
  /** Inclui removidas e substituidas; a listagem da profissional nao as pede. */
  includeInactive?: boolean;
}

export interface CreateCustomerMemoryInput {
  tenantId: string;
  customerId: string;
  kind: string;
  value: string;
  origin: CustomerMemoryOrigin;
  /** Sem valor explicito, vale `defaultAiAllowed(origin)`. */
  aiAllowed?: boolean;
  confidence?: number | null;
  sourceConversationId?: string | null;
  sourceMessageIds?: string[];
  observedAt?: Date;
  now?: Date;
}

export interface UpdateCustomerMemoryPermissionInput {
  tenantId: string;
  customerId: string;
  memoryId: string;
  aiAllowed: boolean;
}

export interface RemoveCustomerMemoryInput {
  tenantId: string;
  customerId: string;
  memoryId: string;
  removedBy?: string | null;
  now?: Date;
}

export interface LoadCustomerMemoryForPromptInput {
  tenantId: string;
  /** Contato da conversa. Sem contato nao ha pessoa vinculada, e nada e carregado. */
  contactId?: string | null;
  now?: Date;
}

export interface RecordTurnInferenceInput {
  tenantId: string;
  conversationId: string;
  /**
   * Atendimento do turno: o rascunho ja mesclado ao estado da conversa, que e
   * o que o turno de fato marcou quando a evidencia confirma.
   */
  appointment?: Partial<AppointmentDraft>;
  /** O que as tools do turno confirmaram, nao o que o modelo disse ter feito. */
  evidence: TurnAppointmentEvidence;
  sourceMessageIds: string[];
  now?: Date;
}

/**
 * Por que um turno **nao** gerou memoria. Motivo nomeado em vez de silencio:
 * a recusa e a regra do produto, e ela precisa ser observavel no log e no teste.
 */
export type MemoryInferenceSkipReason =
  | "no_contact"
  | "contact_ignored"
  | "customer_not_linked"
  | "personal_session"
  | "human_handled"
  /** Nenhum atendimento confirmado neste turno: rascunho nao vira preferencia. */
  | "no_confirmed_appointment"
  | "no_candidate";

export interface MemoryInferenceOutcome {
  applied: number;
  skipped?: MemoryInferenceSkipReason;
}

/** Porta consumida pelo grafo para carregar memoria permitida no prompt. */
export interface CustomerMemoryPromptPort {
  loadForPrompt(
    input: LoadCustomerMemoryForPromptInput,
  ): Promise<CustomerMemoryPromptItem[]>;
}

/** Porta consumida pelo turno da IA para inferir memoria da decisao. */
export interface CustomerMemoryInferencePort {
  recordTurnInference(
    input: RecordTurnInferenceInput,
  ): Promise<MemoryInferenceOutcome>;
}

export interface CustomerMemoryPolicy {
  staleDays: number;
  promptLimit: number;
}

export function customerMemoryPolicyFromEnv(): CustomerMemoryPolicy {
  return {
    staleDays: env.CUSTOMER_MEMORY_STALE_DAYS,
    promptLimit: env.CUSTOMER_MEMORY_PROMPT_LIMIT,
  };
}

/**
 * Memoria do cliente: ciclo de vida, permissao, substituicao e carga no prompt.
 *
 * Tres invariantes atravessam todos os metodos:
 *
 * 1. nada e apagado — remocao marca `removedAt`/`removedBy` e substituicao
 *    marca `supersededById` na linha antiga;
 * 2. so memoria **permitida** (`aiAllowed`) atravessa para o prompt, e o filtro
 *    acontece na consulta, nao no chamador;
 * 3. inferencia so nasce de turno processado pela IA, para contato vinculado a
 *    uma pessoa, nao ignorado, em sessao nao pessoal e nao atendida por humano.
 *
 * A tabela nao depende da extensao `vector`: a memoria do cliente e texto com
 * proveniencia, nao embedding.
 */
export class CustomerMemoryService
  implements CustomerMemoryPromptPort, CustomerMemoryInferencePort
{
  constructor(
    private readonly prisma: PrismaClient,
    private readonly policy: CustomerMemoryPolicy = customerMemoryPolicyFromEnv(),
  ) {}

  async list(input: ListCustomerMemoryInput): Promise<CustomerMemoryRecord[]> {
    const rows = await this.prisma.customerMemory.findMany({
      where: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        ...(input.includeInactive
          ? {}
          : { removedAt: null, supersededById: null }),
      },
      orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toRecord);
  }

  /**
   * Cria uma linha nova. Em tipo de valor unico, a linha ativa anterior do
   * mesmo tipo e marcada como substituida na mesma transacao — continua no
   * banco, fora do prompt e fora da listagem ativa.
   */
  async create(
    input: CreateCustomerMemoryInput,
  ): Promise<CustomerMemoryRecord> {
    const kind = requireKind(input.kind);
    const value = requireValue(input.value);
    const now = input.now ?? new Date();
    const aiAllowed = input.aiAllowed ?? defaultAiAllowed(input.origin);

    const created = await this.prisma.$transaction(async (tx) => {
      const superseded = SINGLE_VALUED_KINDS.includes(kind)
        ? await tx.customerMemory.findFirst({
            where: {
              tenantId: input.tenantId,
              customerId: input.customerId,
              kind,
              removedAt: null,
              supersededById: null,
            },
            orderBy: { observedAt: "desc" },
          })
        : null;

      const row = await tx.customerMemory.create({
        data: {
          tenantId: input.tenantId,
          customerId: input.customerId,
          kind,
          value,
          origin: input.origin,
          aiAllowed,
          // `confidence` so existe para inferencia: afirmacao humana nao tem
          // grau de certeza, tem responsavel.
          confidence:
            input.origin === "AI_INFERRED" ? (input.confidence ?? null) : null,
          sourceConversationId: input.sourceConversationId ?? null,
          sourceMessageIds: input.sourceMessageIds ?? [],
          observedAt: input.observedAt ?? now,
        },
      });

      if (superseded) {
        await tx.customerMemory.update({
          where: { id: superseded.id },
          data: { supersededById: row.id },
        });
      }
      return row;
    });

    return toRecord(created);
  }

  async setPermission(
    input: UpdateCustomerMemoryPermissionInput,
  ): Promise<CustomerMemoryRecord> {
    await this.requireMemory(input);
    const updated = await this.prisma.customerMemory.update({
      where: { id: input.memoryId },
      data: { aiAllowed: input.aiAllowed },
    });
    return toRecord(updated);
  }

  /**
   * Remocao pela profissional, inclusive de memoria inferida. Marca quem
   * removeu e quando; a linha permanece no banco e nunca mais entra no prompt
   * nem na listagem ativa.
   */
  async remove(
    input: RemoveCustomerMemoryInput,
  ): Promise<CustomerMemoryRecord> {
    const existing = await this.requireMemory(input);
    if (existing.removedAt) return toRecord(existing);
    const removed = await this.prisma.customerMemory.update({
      where: { id: input.memoryId },
      data: {
        removedAt: input.now ?? new Date(),
        removedBy: input.removedBy ?? null,
      },
    });
    return toRecord(removed);
  }

  /**
   * Memoria permitida da pessoa vinculada ao contato, com origem e idade.
   *
   * Devolve vazio — nunca lanca — quando nao ha contato, o contato esta
   * ignorado ou nao existe pessoa vinculada: o prompt simplesmente nao ganha a
   * secao, que e exatamente a regra do produto.
   */
  async loadForPrompt(
    input: LoadCustomerMemoryForPromptInput,
  ): Promise<CustomerMemoryPromptItem[]> {
    if (!input.contactId) return [];
    const contact = await this.prisma.contact.findUnique({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.contactId } },
      select: { ignored: true, customerId: true },
    });
    if (!contact || contact.ignored || !contact.customerId) return [];

    const now = input.now ?? new Date();
    const rows = await this.prisma.customerMemory.findMany({
      where: {
        tenantId: input.tenantId,
        customerId: contact.customerId,
        aiAllowed: true,
        removedAt: null,
        supersededById: null,
      },
      orderBy: [{ lastReinforcedAt: "desc" }, { observedAt: "desc" }],
      take: this.policy.promptLimit,
    });

    return rows.map((row) =>
      toCustomerMemoryPromptItem(toRecord(row), now, this.policy.staleDays),
    );
  }

  /**
   * Memoria permitida por pessoa, sem passar pelo contato. Usada pelo resumo,
   * que fala de uma pessoa e nao de uma conversa.
   */
  async loadAllowedForCustomer(input: {
    tenantId: string;
    customerId: string;
    now?: Date;
  }): Promise<CustomerMemoryPromptItem[]> {
    const now = input.now ?? new Date();
    const rows = await this.prisma.customerMemory.findMany({
      where: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        aiAllowed: true,
        removedAt: null,
        supersededById: null,
      },
      orderBy: [{ lastReinforcedAt: "desc" }, { observedAt: "desc" }],
      take: this.policy.promptLimit,
    });
    return rows.map((row) =>
      toCustomerMemoryPromptItem(toRecord(row), now, this.policy.staleDays),
    );
  }

  /**
   * Inferencia a partir do que um turno da IA **confirmou**.
   *
   * A porta de entrada e a regra inteira: contato existente e vinculado a uma
   * pessoa, nao ignorado, sessao nao pessoal e nao atendida por humano, e
   * atendimento efetivamente confirmado neste turno. Sem isso, nada e gravado
   * e o motivo volta nomeado.
   */
  async recordTurnInference(
    input: RecordTurnInferenceInput,
  ): Promise<MemoryInferenceOutcome> {
    const now = input.now ?? new Date();
    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId: input.tenantId, id: input.conversationId },
      select: { contactId: true },
    });
    if (!conversation?.contactId) return { applied: 0, skipped: "no_contact" };

    const contact = await this.prisma.contact.findUnique({
      where: {
        tenantId_id: { tenantId: input.tenantId, id: conversation.contactId },
      },
      select: { ignored: true, customerId: true, categoryOverride: true },
    });
    if (!contact) return { applied: 0, skipped: "no_contact" };
    if (contact.ignored) return { applied: 0, skipped: "contact_ignored" };
    if (contact.categoryOverride === "PERSONAL") {
      return { applied: 0, skipped: "personal_session" };
    }
    if (!contact.customerId) {
      return { applied: 0, skipped: "customer_not_linked" };
    }

    const session = await this.prisma.conversationSession.findFirst({
      where: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
      select: { category: true, humanHandling: true },
    });
    if (session?.category === "PERSONAL") {
      return { applied: 0, skipped: "personal_session" };
    }
    if (session?.humanHandling) {
      return { applied: 0, skipped: "human_handled" };
    }

    if (
      !input.evidence.appointmentConfirmed &&
      !input.evidence.recurringSeriesConfirmed
    ) {
      return { applied: 0, skipped: "no_confirmed_appointment" };
    }

    const candidates = inferCustomerMemoryCandidates({
      appointment: input.appointment,
      evidence: input.evidence,
    });
    if (candidates.length === 0) return { applied: 0, skipped: "no_candidate" };

    let applied = 0;
    for (const candidate of candidates) {
      const changed = await this.applyInferredCandidate({
        tenantId: input.tenantId,
        customerId: contact.customerId,
        conversationId: input.conversationId,
        sourceMessageIds: input.sourceMessageIds,
        candidate,
        now,
      });
      if (changed) applied += 1;
    }
    return applied > 0 ? { applied } : { applied: 0, skipped: "no_candidate" };
  }

  /**
   * Reforco, substituicao ou nada.
   *
   * Candidato marcado como `reinforceOnly` so reforca: se o valor ainda nao
   * estava registrado, nada nasce — um atendimento avulso nao prova
   * recorrencia.
   *
   * Mesmo valor ja registrado e **reforco**: so `lastReinforcedAt` muda, e a
   * memoria deixa de envelhecer. Valor diferente em tipo de valor unico e
   * **contradicao**: nasce linha nova e a anterior recebe `supersededById`,
   * herdando a permissao que a profissional ja tinha decidido para aquele tipo.
   * Cadastro da profissional no mesmo tipo nao e substituido por inferencia —
   * o que a pessoa responsavel escreveu vence o que a IA deduziu.
   */
  private async applyInferredCandidate(input: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    sourceMessageIds: string[];
    candidate: CustomerMemoryCandidate;
    now: Date;
  }): Promise<boolean> {
    const { candidate } = input;
    const normalized = normalizeMemoryValue(candidate.value);

    return this.prisma.$transaction(async (tx) => {
      const active = await tx.customerMemory.findMany({
        where: {
          tenantId: input.tenantId,
          customerId: input.customerId,
          kind: candidate.kind,
          removedAt: null,
          supersededById: null,
        },
        orderBy: { observedAt: "desc" },
      });

      const same = active.find(
        (row) => normalizeMemoryValue(row.value) === normalized,
      );
      if (same) {
        await tx.customerMemory.update({
          where: { id: same.id },
          data: { lastReinforcedAt: input.now },
        });
        return true;
      }

      if (active.some((row) => row.origin === "PROFESSIONAL")) return false;

      // Candidato de reforco nao cria memoria: sem valor igual ja registrado,
      // ele nao tem o que reforcar e o turno nao provou repeticao nenhuma.
      if (candidate.reinforceOnly) return false;

      // Multivalorado nao substitui nada: o valor novo apenas se soma.
      const superseded = SINGLE_VALUED_KINDS.includes(candidate.kind)
        ? (active[0] ?? null)
        : null;

      const created = await tx.customerMemory.create({
        data: {
          tenantId: input.tenantId,
          customerId: input.customerId,
          kind: candidate.kind,
          value: candidate.value.trim(),
          origin: "AI_INFERRED",
          aiAllowed: superseded
            ? superseded.aiAllowed
            : defaultAiAllowed("AI_INFERRED"),
          confidence: candidate.confidence,
          sourceConversationId: input.conversationId,
          sourceMessageIds: input.sourceMessageIds,
          observedAt: input.now,
        },
      });

      if (superseded) {
        await tx.customerMemory.update({
          where: { id: superseded.id },
          data: { supersededById: created.id },
        });
      }
      return true;
    });
  }

  private async requireMemory(input: {
    tenantId: string;
    customerId: string;
    memoryId: string;
  }) {
    const memory = await this.prisma.customerMemory.findFirst({
      where: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        id: input.memoryId,
      },
    });
    if (!memory) {
      throw new AppError("Customer memory was not found.", {
        statusCode: 404,
        code: "CUSTOMER_MEMORY_NOT_FOUND",
      });
    }
    return memory;
  }
}

function requireKind(value: string): CustomerMemoryKind {
  const kind = value.trim().toUpperCase();
  if (!isCustomerMemoryKind(kind)) {
    throw new AppError("Customer memory kind is not supported.", {
      statusCode: 400,
      code: "CUSTOMER_MEMORY_KIND_INVALID",
      details: { kind: value },
    });
  }
  return kind;
}

function requireValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("Customer memory value is required.", {
      statusCode: 400,
      code: "CUSTOMER_MEMORY_VALUE_REQUIRED",
    });
  }
  return trimmed;
}

function toRecord(row: {
  id: string;
  tenantId: string;
  customerId: string;
  kind: string;
  value: string;
  origin: CustomerMemoryOrigin;
  aiAllowed: boolean;
  confidence: number | null;
  sourceConversationId: string | null;
  sourceMessageIds: string[];
  observedAt: Date;
  lastReinforcedAt: Date | null;
  supersededById: string | null;
  removedAt: Date | null;
  removedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CustomerMemoryRecord {
  return { ...row };
}
