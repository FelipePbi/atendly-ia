import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { instantToLocalDateTime } from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  normalizePhone,
  normalizePhoneDetailed,
  phoneEquivalenceCandidates,
} from "../../shared/phone/phone.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type CustomerRelationActor = "AI" | "PROFESSIONAL" | "CUSTOMER";

export interface CreateAvenlyCustomerInput {
  name?: string | null;
  phone?: string | null;
}

export interface UpdateAvenlyCustomerInput {
  name?: string | null;
  phone?: string | null;
}

export interface SetPrimaryGuardianInput {
  guardianCustomerId: string;
  /** Quem originou a relação. A IA só pode propor. */
  proposedBy: CustomerRelationActor;
  proposedByActor?: string | null;
  /** Confirmação explícita do cliente ou da profissional, quando já houve. */
  confirmedBy?: CustomerRelationActor | null;
  confirmedByActor?: string | null;
}

export interface CustomerNoteInput {
  body: string;
  aiAuthorized?: boolean;
  actor?: string | null;
}

export interface CustomerTagInput {
  label: string;
  aiAuthorized?: boolean;
  actor?: string | null;
}

/** Recorte de um agendamento no fuso do calendário do negócio (Goal075). */
export interface AppointmentSummary {
  date: string;
  startTime: string;
  status: string;
}

/** Números do histórico inteiro do cliente, no fuso do negócio (Goal075). */
export interface AppointmentStats {
  completed: number;
  noShows: number;
  cancelled: number;
  averageIntervalDays: number | null;
  firstAppointmentDate: string | null;
}

/** Dependente confirmado de um responsável que usa o telefone (Goal142). */
export interface CustomerDependent {
  id: string;
  name: string | null;
  phone: string | null;
  guardian: { id: string; name: string | null };
}

/** Ativo o suficiente para contar como próximo atendimento (Goal075). */
const NEXT_APPOINTMENT_STATUSES = ["CONFIRMED", "SCHEDULED"] as const;

interface AppointmentRow {
  customerId: string;
  startAt: Date;
  status: string;
}

/**
 * Cliente é uma pessoa identificada por `(tenantId, id)`.
 *
 * O telefone é opcional, não prova identidade e não é exclusivo: ele serve
 * apenas para encontrar **candidatos**. Não existe upsert por telefone, e
 * nenhum caminho aqui renomeia, funde ou deduplica pessoas (D-005) — nome e
 * telefone só mudam por `update`, que é uma operação explícita.
 */
export class AvenlyCustomerService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly tenantId: string,
  ) {}

  /**
   * `options.timezone` liga o próximo e o último atendimento (Goal075),
   * calculados num único par de consultas para todo o negócio — nunca uma
   * por cliente. Omitido, a lista sai como antes: quem não precisa dos
   * campos novos não paga a consulta extra.
   */
  async list(
    filter: { phone?: string | null } = {},
    options: { timezone?: string; now?: Date } = {},
  ) {
    const phoneCandidates = filter.phone
      ? phoneEquivalenceCandidates(normalizePhone(filter.phone))
      : undefined;
    const customers = await this.database.customer.findMany({
      where: {
        tenantId: this.tenantId,
        ...(phoneCandidates ? { normalizedPhone: { in: phoneCandidates } } : {}),
      },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });
    if (!options.timezone || customers.length === 0) return customers;
    const timezone = options.timezone;
    const now = options.now ?? new Date();
    const customerIds = customers.map((customer) => customer.id);
    const [nextRows, lastRows] = await Promise.all([
      this.nextAppointmentsByCustomer(customerIds, now),
      this.lastAppointmentsByCustomer(customerIds, now),
    ]);
    const nextById = new Map(nextRows.map((row) => [row.customerId, row]));
    const lastById = new Map(lastRows.map((row) => [row.customerId, row]));
    return customers.map((customer) => ({
      ...customer,
      nextAppointment: appointmentSummary(nextById.get(customer.id), timezone),
      lastAppointment: appointmentSummary(lastById.get(customer.id), timezone),
    }));
  }

  /**
   * Candidatos para um número. Zero, um ou vários — o chamador decide, e a
   * escolha entre eles é sempre explícita.
   */
  async findCandidatesByPhone(
    phone: string,
    options: { timezone?: string; now?: Date } = {},
  ) {
    return this.list({ phone }, options);
  }

  /**
   * Dependentes confirmados dos candidatos de um número (Goal142): quem tem
   * um `PRIMARY_GUARDIAN` `CONFIRMED` apontando para uma pessoa que usa esse
   * telefone. Relação `PROPOSED` nunca entra, e a leitura é sempre por
   * pedido — relação removida some na hora. Uma pessoa sai uma vez só, mesmo
   * quando ela própria também é candidata do número.
   */
  async findDependentsByPhone(phone: string): Promise<CustomerDependent[]> {
    const guardians = await this.findCandidatesByPhone(phone);
    if (guardians.length === 0) return [];
    const relations = await this.database.customerRelation.findMany({
      where: {
        tenantId: this.tenantId,
        type: "PRIMARY_GUARDIAN",
        status: "CONFIRMED",
        relatedCustomerId: { in: guardians.map((guardian) => guardian.id) },
      },
      include: { customer: true, relatedCustomer: true },
    });
    const byId = new Map<string, CustomerDependent>();
    for (const relation of relations) {
      if (byId.has(relation.customer.id)) continue;
      byId.set(relation.customer.id, {
        id: relation.customer.id,
        name: relation.customer.name,
        phone: relation.customer.phone,
        guardian: {
          id: relation.relatedCustomer.id,
          name: relation.relatedCustomer.name,
        },
      });
    }
    return [...byId.values()].sort(
      (left, right) =>
        (left.name ?? "").localeCompare(right.name ?? "") ||
        left.id.localeCompare(right.id),
    );
  }

  /**
   * Próximo e último atendimento de um cliente só, pelas mesmas consultas
   * da lista, para o detalhe do perfil (Goal075).
   */
  async appointmentHighlights(
    customerId: string,
    options: { timezone: string; now?: Date },
  ): Promise<{
    nextAppointment: AppointmentSummary | null;
    lastAppointment: AppointmentSummary | null;
  }> {
    const now = options.now ?? new Date();
    const [nextRows, lastRows] = await Promise.all([
      this.nextAppointmentsByCustomer([customerId], now),
      this.lastAppointmentsByCustomer([customerId], now),
    ]);
    return {
      nextAppointment: appointmentSummary(nextRows[0], options.timezone),
      lastAppointment: appointmentSummary(lastRows[0], options.timezone),
    };
  }

  /**
   * Um único agendamento ativo por cliente, o de início mais cedo a partir
   * de `now` — nunca uma consulta por cliente (Goal075).
   */
  private async nextAppointmentsByCustomer(
    customerIds: string[],
    now: Date,
  ): Promise<AppointmentRow[]> {
    if (customerIds.length === 0) return [];
    return this.database.$queryRaw<AppointmentRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("customerId") "customerId", "startAt", "status"
        FROM "Appointment"
       WHERE "tenantId" = ${this.tenantId}
         AND "customerId" IN (${Prisma.join(customerIds)})
         AND "status" IN (${Prisma.join(NEXT_APPOINTMENT_STATUSES)})
         AND "startAt" > ${now}
       ORDER BY "customerId", "startAt" ASC
    `);
  }

  /**
   * Um único agendamento não cancelado por cliente, o de início mais recente
   * antes de `now` — nunca uma consulta por cliente (Goal075).
   */
  private async lastAppointmentsByCustomer(
    customerIds: string[],
    now: Date,
  ): Promise<AppointmentRow[]> {
    if (customerIds.length === 0) return [];
    return this.database.$queryRaw<AppointmentRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("customerId") "customerId", "startAt", "status"
        FROM "Appointment"
       WHERE "tenantId" = ${this.tenantId}
         AND "customerId" IN (${Prisma.join(customerIds)})
         AND "status" != 'CANCELLED'
         AND "startAt" <= ${now}
       ORDER BY "customerId", "startAt" DESC
    `);
  }

  /**
   * Números do histórico inteiro de um cliente (Goal075): contagens por
   * estado, média de intervalo entre atendimentos concluídos consecutivos e
   * a data do primeiro atendimento, todas no fuso do calendário do negócio.
   */
  async appointmentStats(
    customerId: string,
    timezone: string,
  ): Promise<AppointmentStats> {
    const rows = await this.database.appointment.findMany({
      where: { tenantId: this.tenantId, customerId },
      select: { startAt: true, status: true },
      orderBy: { startAt: "asc" },
    });
    let completed = 0;
    let noShows = 0;
    let cancelled = 0;
    const completedStarts: Date[] = [];
    for (const row of rows) {
      if (row.status === "COMPLETED") {
        completed += 1;
        completedStarts.push(row.startAt);
      } else if (row.status === "NO_SHOW") {
        noShows += 1;
      } else if (row.status === "CANCELLED") {
        cancelled += 1;
      }
    }
    let averageIntervalDays: number | null = null;
    if (completedStarts.length >= 2) {
      let totalDays = 0;
      for (let index = 1; index < completedStarts.length; index += 1) {
        totalDays +=
          (completedStarts[index].getTime() -
            completedStarts[index - 1].getTime()) /
          86_400_000;
      }
      averageIntervalDays = totalDays / (completedStarts.length - 1);
    }
    const first = rows[0];
    return {
      completed,
      noShows,
      cancelled,
      averageIntervalDays,
      firstAppointmentDate: first
        ? instantToLocalDateTime(first.startAt, timezone).date
        : null,
    };
  }

  async get(customerId: string) {
    const customer = await this.database.customer.findUnique({
      where: { tenantId_id: { tenantId: this.tenantId, id: customerId } },
    });
    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
    }
    return customer;
  }

  /** Criação explícita. Nome e telefone são opcionais, mas não os dois. */
  async create(input: CreateAvenlyCustomerInput) {
    const name = normalizeName(input.name);
    const phone = normalizeOptionalPhone(input.phone);
    if (!name && !phone) {
      throw new AppError(
        "CUSTOMER_IDENTIFICATION_REQUIRED",
        "A customer needs at least a name or a phone number.",
        400,
      );
    }
    // Nenhuma consulta por telefone antes de criar: um número já conhecido não
    // é motivo para reaproveitar — muito menos renomear — a pessoa existente.
    // Quem quiser reaproveitar alguém passa o `customerId` do candidato.
    return this.database.customer.create({
      data: {
        tenantId: this.tenantId,
        name,
        phone: phone?.phone ?? null,
        normalizedPhone: phone?.normalizedPhone ?? null,
      },
    });
  }

  /**
   * Atualização explícita de nome e telefone. Campo ausente não muda; `null`
   * limpa. Nenhuma outra operação pode renomear uma pessoa.
   */
  async update(customerId: string, input: UpdateAvenlyCustomerInput) {
    const current = await this.get(customerId);
    const data: Prisma.CustomerUpdateInput = {};
    if (input.name !== undefined) data.name = normalizeName(input.name);
    if (input.phone !== undefined) {
      const phone = normalizeOptionalPhone(input.phone);
      data.phone = phone?.phone ?? null;
      data.normalizedPhone = phone?.normalizedPhone ?? null;
    }
    if (Object.keys(data).length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "At least one customer field is required.",
        400,
      );
    }
    const nextName =
      data.name === undefined ? current.name : (data.name as string | null);
    const nextPhone =
      data.normalizedPhone === undefined
        ? current.normalizedPhone
        : (data.normalizedPhone as string | null);
    if (!nextName && !nextPhone) {
      throw new AppError(
        "CUSTOMER_IDENTIFICATION_REQUIRED",
        "A customer needs at least a name or a phone number.",
        400,
      );
    }
    return this.database.customer.update({
      where: { tenantId_id: { tenantId: this.tenantId, id: customerId } },
      data,
    });
  }

  // --- Responsável principal -----------------------------------------------

  async primaryGuardian(customerId: string) {
    return this.database.customerRelation.findUnique({
      where: {
        tenantId_customerId_type: {
          tenantId: this.tenantId,
          customerId,
          type: "PRIMARY_GUARDIAN",
        },
      },
      include: { relatedCustomer: true },
    });
  }

  /**
   * Define ou atualiza o responsável principal.
   *
   * A relação nasce `PROPOSED` e só vira `CONFIRMED` quando chega uma
   * confirmação explícita — do cliente ou da profissional. Uma proposta da IA
   * nunca se confirma sozinha.
   */
  async setPrimaryGuardian(customerId: string, input: SetPrimaryGuardianInput) {
    if (customerId === input.guardianCustomerId) {
      throw new AppError(
        "CUSTOMER_RELATION_SELF",
        "A customer cannot be their own guardian.",
        400,
      );
    }
    await this.get(customerId);
    await this.get(input.guardianCustomerId);
    if (input.proposedBy === "AI" && input.confirmedBy) {
      throw new AppError(
        "CUSTOMER_RELATION_CONFIRMATION_REQUIRED",
        "The assistant can only propose a relation; confirmation must come from the customer or the professional.",
        400,
      );
    }
    const now = new Date();
    const confirmation = input.confirmedBy
      ? {
          status: "CONFIRMED" as const,
          confirmedBy: input.confirmedBy,
          confirmedByActor: input.confirmedByActor ?? null,
          confirmedAt: now,
        }
      : {
          status: "PROPOSED" as const,
          confirmedBy: null,
          confirmedByActor: null,
          confirmedAt: null,
        };
    return this.database.customerRelation.upsert({
      where: {
        tenantId_customerId_type: {
          tenantId: this.tenantId,
          customerId,
          type: "PRIMARY_GUARDIAN",
        },
      },
      create: {
        tenantId: this.tenantId,
        customerId,
        relatedCustomerId: input.guardianCustomerId,
        type: "PRIMARY_GUARDIAN",
        proposedBy: input.proposedBy,
        proposedByActor: input.proposedByActor ?? null,
        proposedAt: now,
        ...confirmation,
      },
      update: {
        relatedCustomerId: input.guardianCustomerId,
        proposedBy: input.proposedBy,
        proposedByActor: input.proposedByActor ?? null,
        proposedAt: now,
        ...confirmation,
      },
      include: { relatedCustomer: true },
    });
  }

  /** Confirmação explícita de uma relação já proposta. */
  async confirmPrimaryGuardian(
    customerId: string,
    input: {
      confirmedBy: Exclude<CustomerRelationActor, "AI">;
      actor?: string | null;
    },
  ) {
    const relation = await this.primaryGuardian(customerId);
    if (!relation) {
      throw new AppError(
        "CUSTOMER_RELATION_NOT_FOUND",
        "There is no primary guardian relation to confirm.",
        404,
      );
    }
    return this.database.customerRelation.update({
      where: { tenantId_id: { tenantId: this.tenantId, id: relation.id } },
      data: {
        status: "CONFIRMED",
        confirmedBy: input.confirmedBy,
        confirmedByActor: input.actor ?? null,
        confirmedAt: new Date(),
      },
      include: { relatedCustomer: true },
    });
  }

  async clearPrimaryGuardian(customerId: string) {
    const deleted = await this.database.customerRelation.deleteMany({
      where: { tenantId: this.tenantId, customerId, type: "PRIMARY_GUARDIAN" },
    });
    return { deleted: deleted.count > 0 };
  }

  // --- Observações e tags ---------------------------------------------------

  async listNotes(
    customerId: string,
    options: { aiAuthorizedOnly?: boolean } = {},
  ) {
    return this.database.customerNote.findMany({
      where: {
        tenantId: this.tenantId,
        customerId,
        ...(options.aiAuthorizedOnly ? { aiAuthorized: true } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async addNote(customerId: string, input: CustomerNoteInput) {
    await this.get(customerId);
    const body = input.body.trim();
    if (!body) {
      throw new AppError("VALIDATION_ERROR", "Note body must not be empty.", 400);
    }
    const authorized = input.aiAuthorized === true;
    return this.database.customerNote.create({
      data: {
        tenantId: this.tenantId,
        customerId,
        body,
        aiAuthorized: authorized,
        authorizedAt: authorized ? new Date() : null,
        authorizedBy: authorized ? (input.actor ?? null) : null,
        createdBy: input.actor ?? null,
      },
    });
  }

  async setNoteAuthorization(
    customerId: string,
    noteId: string,
    input: { aiAuthorized: boolean; actor?: string | null },
  ) {
    const updated = await this.database.customerNote.updateMany({
      where: { tenantId: this.tenantId, customerId, id: noteId },
      data: {
        aiAuthorized: input.aiAuthorized,
        authorizedAt: input.aiAuthorized ? new Date() : null,
        authorizedBy: input.aiAuthorized ? (input.actor ?? null) : null,
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        "CUSTOMER_NOTE_NOT_FOUND",
        "Customer note was not found.",
        404,
      );
    }
    return this.database.customerNote.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: this.tenantId, id: noteId } },
    });
  }

  async deleteNote(customerId: string, noteId: string) {
    const deleted = await this.database.customerNote.deleteMany({
      where: { tenantId: this.tenantId, customerId, id: noteId },
    });
    if (deleted.count === 0) {
      throw new AppError(
        "CUSTOMER_NOTE_NOT_FOUND",
        "Customer note was not found.",
        404,
      );
    }
    return { deleted: true as const };
  }

  async listTags(
    customerId: string,
    options: { aiAuthorizedOnly?: boolean } = {},
  ) {
    return this.database.customerTag.findMany({
      where: {
        tenantId: this.tenantId,
        customerId,
        ...(options.aiAuthorizedOnly ? { aiAuthorized: true } : {}),
      },
      orderBy: { label: "asc" },
    });
  }

  /**
   * Idempotente por rotulo: repetir uma tag existente nao reescreve
   * `aiAuthorized`. Autorizacao so muda por `setTagAuthorization`, uma
   * decisao explicita — nao um efeito colateral de recriar a mesma tag.
   */
  async addTag(customerId: string, input: CustomerTagInput) {
    await this.get(customerId);
    const label = input.label.trim();
    if (!label) {
      throw new AppError("VALIDATION_ERROR", "Tag must not be empty.", 400);
    }
    const authorized = input.aiAuthorized === true;
    return this.database.customerTag.upsert({
      where: {
        tenantId_customerId_label: {
          tenantId: this.tenantId,
          customerId,
          label,
        },
      },
      create: {
        tenantId: this.tenantId,
        customerId,
        label,
        aiAuthorized: authorized,
        authorizedAt: authorized ? new Date() : null,
        authorizedBy: authorized ? (input.actor ?? null) : null,
        createdBy: input.actor ?? null,
      },
      update: {},
    });
  }

  async setTagAuthorization(
    customerId: string,
    tagId: string,
    input: { aiAuthorized: boolean; actor?: string | null },
  ) {
    const updated = await this.database.customerTag.updateMany({
      where: { tenantId: this.tenantId, customerId, id: tagId },
      data: {
        aiAuthorized: input.aiAuthorized,
        authorizedAt: input.aiAuthorized ? new Date() : null,
        authorizedBy: input.aiAuthorized ? (input.actor ?? null) : null,
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        "CUSTOMER_TAG_NOT_FOUND",
        "Customer tag was not found.",
        404,
      );
    }
    return this.database.customerTag.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: this.tenantId, id: tagId } },
    });
  }

  async deleteTag(customerId: string, tagId: string) {
    const deleted = await this.database.customerTag.deleteMany({
      where: { tenantId: this.tenantId, customerId, id: tagId },
    });
    if (deleted.count === 0) {
      throw new AppError(
        "CUSTOMER_TAG_NOT_FOUND",
        "Customer tag was not found.",
        404,
      );
    }
    return { deleted: true as const };
  }

  /**
   * O que a IA pode ver de uma pessoa.
   *
   * A filtragem é feita aqui, na consulta, e não em instrução de prompt: nota
   * ou tag sem autorização explícita não sai do banco por este caminho.
   */
  async aiAuthorizedContext(customerId: string) {
    const customer = await this.get(customerId);
    const [notes, tags, guardian] = await Promise.all([
      this.listNotes(customerId, { aiAuthorizedOnly: true }),
      this.listTags(customerId, { aiAuthorizedOnly: true }),
      this.primaryGuardian(customerId),
    ]);
    return {
      customer,
      notes,
      tags,
      // Relação proposta ainda não é verdade do cadastro; a IA só recebe a
      // que já foi confirmada.
      primaryGuardian: guardian?.status === "CONFIRMED" ? guardian : null,
    };
  }
}

function appointmentSummary(
  row: AppointmentRow | undefined,
  timezone: string,
): AppointmentSummary | null {
  if (!row) return null;
  const local = instantToLocalDateTime(row.startAt, timezone);
  return { date: local.date, startTime: local.time, status: row.status };
}

function normalizeName(value: string | null | undefined): string | null {
  const name = value?.trim() || null;
  if (name && name.length > 200) {
    throw new AppError(
      "INVALID_CUSTOMER_NAME",
      "Customer name must have at most 200 characters.",
      400,
    );
  }
  return name;
}

function normalizeOptionalPhone(
  value: string | null | undefined,
): { phone: string; normalizedPhone: string } | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const { normalizedPhone, recognized } = normalizePhoneDetailed(trimmed);
  return {
    phone: recognized ? `+${normalizedPhone}` : trimmed,
    normalizedPhone,
  };
}
