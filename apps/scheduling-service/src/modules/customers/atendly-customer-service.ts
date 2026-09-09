import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import { normalizePhone } from "../../shared/phone/phone.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type CustomerRelationActor = "AI" | "PROFESSIONAL" | "CUSTOMER";

export interface CreateAtendlyCustomerInput {
  name?: string | null;
  phone?: string | null;
}

export interface UpdateAtendlyCustomerInput {
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

/**
 * Cliente é uma pessoa identificada por `(tenantId, id)`.
 *
 * O telefone é opcional, não prova identidade e não é exclusivo: ele serve
 * apenas para encontrar **candidatos**. Não existe upsert por telefone, e
 * nenhum caminho aqui renomeia, funde ou deduplica pessoas (D-005) — nome e
 * telefone só mudam por `update`, que é uma operação explícita.
 */
export class AtendlyCustomerService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly tenantId: string,
  ) {}

  async list(filter: { phone?: string | null } = {}) {
    const normalizedPhone = filter.phone
      ? normalizePhone(filter.phone)
      : undefined;
    return this.database.customer.findMany({
      where: {
        tenantId: this.tenantId,
        ...(normalizedPhone ? { normalizedPhone } : {}),
      },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });
  }

  /**
   * Candidatos para um número. Zero, um ou vários — o chamador decide, e a
   * escolha entre eles é sempre explícita.
   */
  async findCandidatesByPhone(phone: string) {
    return this.list({ phone });
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
  async create(input: CreateAtendlyCustomerInput) {
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
  async update(customerId: string, input: UpdateAtendlyCustomerInput) {
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
  const phone = value?.trim();
  if (!phone) return null;
  return { phone, normalizedPhone: normalizePhone(phone) };
}
