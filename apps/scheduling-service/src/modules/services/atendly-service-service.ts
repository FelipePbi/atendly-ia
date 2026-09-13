import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { CalendarServiceDefinition } from "../calendar/calendar-provider.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;
export type PriceType = "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";
export type ServiceReviewOrigin = "IMPORT" | "MANUAL";
export type ServiceColorToken =
  | "ROSE"
  | "AMBER"
  | "EMERALD"
  | "SKY"
  | "VIOLET"
  | "SLATE";

const PRICE_TYPES: readonly PriceType[] = [
  "FIXED",
  "STARTING_AT",
  "ON_REQUEST",
  "NOT_INFORMED",
];
const PRICED_TYPES = new Set<PriceType>(["FIXED", "STARTING_AT"]);
const COLOR_TOKENS: readonly ServiceColorToken[] = [
  "ROSE",
  "AMBER",
  "EMERALD",
  "SKY",
  "VIOLET",
  "SLATE",
];

export interface CreateAtendlyServiceInput {
  name: string;
  /** Ausente vira pendencia de revisao; nunca zero fabricado. */
  durationMinutes?: number | null;
  priceType: PriceType;
  price?: number | null;
  active?: boolean;
  description?: string | null;
  colorToken?: ServiceColorToken | null;
  bufferBeforeMinutes?: number | null;
  bufferAfterMinutes?: number | null;
  recurrenceIntervalDays?: number | null;
  /**
   * Origem da revisao quando `durationMinutes` esta ausente. So a importacao
   * (Goal010/migration service) informa `IMPORT`; toda outra chamada nasce
   * `MANUAL`.
   */
  reviewOrigin?: ServiceReviewOrigin;
}

export type UpdateAtendlyServiceInput = Partial<CreateAtendlyServiceInput>;

export interface AtendlyServiceRecord {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number | null;
  priceType: PriceType;
  price: Prisma.Decimal | null;
  active: boolean;
  needsReview: boolean;
  reviewOrigin: ServiceReviewOrigin | null;
  description: string | null;
  colorToken: ServiceColorToken | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  recurrenceIntervalDays: number | null;
}

/**
 * "Operacional": ativo, com duracao valida e fora de revisao. Definido em um
 * unico lugar e usado por `listForScheduling`, `requireActive` e pela
 * capacidade de ativacao da IA lida pelo BFF — nenhum consumer reimplementa
 * este predicado.
 */
export function isOperationalService(service: {
  active: boolean;
  durationMinutes: number | null;
  needsReview: boolean;
}): boolean {
  return (
    service.active && service.durationMinutes !== null && !service.needsReview
  );
}

export class AtendlyServiceService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly tenantId: string,
  ) {}

  async list(input: { activeOnly?: boolean } = {}) {
    return this.database.service.findMany({
      where: {
        tenantId: this.tenantId,
        ...(input.activeOnly ? { active: true } : {}),
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
  }

  /** Apenas o que a IA e a agenda podem oferecer para um novo agendamento. */
  async listOperational() {
    return this.database.service.findMany({
      where: {
        tenantId: this.tenantId,
        active: true,
        needsReview: false,
      },
      orderBy: { name: "asc" },
    });
  }

  async listForScheduling(): Promise<CalendarServiceDefinition[]> {
    return (await this.listOperational()).map(toCalendarService);
  }

  async create(input: CreateAtendlyServiceInput) {
    const data = serviceData(input);
    return this.database.service.create({
      data: { tenantId: this.tenantId, ...data },
    });
  }

  async update(serviceId: string, input: UpdateAtendlyServiceInput) {
    const current = await this.requireService(serviceId);
    const priceType = input.priceType ?? (current.priceType);
    const price = !PRICED_TYPES.has(priceType)
      ? null
      : input.price !== undefined
        ? input.price
        : current.price === null
          ? null
          : Number(current.price);
    const durationMinutes =
      input.durationMinutes !== undefined
        ? input.durationMinutes
        : current.durationMinutes;
    // Duração continua ausente sem o chamador tocar nisso: a origem da
    // revisão é a que já estava gravada, nunca "MANUAL" por padrão só porque
    // esta chamada não é a importação (senão qualquer PATCH não relacionado
    // apagaria a proveniência "IMPORT").
    const reviewOrigin =
      input.reviewOrigin ??
      (durationMinutes === null
        ? ((current.reviewOrigin) ?? "MANUAL")
        : undefined);
    const data = serviceData({
      name: input.name ?? current.name,
      durationMinutes,
      priceType,
      price,
      active: current.active,
      description:
        input.description !== undefined
          ? input.description
          : current.description,
      colorToken:
        input.colorToken !== undefined
          ? input.colorToken
          : (current.colorToken),
      bufferBeforeMinutes:
        input.bufferBeforeMinutes !== undefined
          ? input.bufferBeforeMinutes
          : current.bufferBeforeMinutes,
      bufferAfterMinutes:
        input.bufferAfterMinutes !== undefined
          ? input.bufferAfterMinutes
          : current.bufferAfterMinutes,
      recurrenceIntervalDays:
        input.recurrenceIntervalDays !== undefined
          ? input.recurrenceIntervalDays
          : current.recurrenceIntervalDays,
      reviewOrigin,
    });

    return this.database.service.update({
      where: { tenantId_id: { tenantId: this.tenantId, id: serviceId } },
      data,
    });
  }

  async setActive(serviceId: string, active: boolean) {
    await this.requireService(serviceId);
    return this.database.service.update({
      where: { tenantId_id: { tenantId: this.tenantId, id: serviceId } },
      data: { active },
    });
  }

  async requireActive(serviceIds: string[]) {
    const uniqueIds = [...new Set(serviceIds)];
    if (uniqueIds.length === 0) {
      throw new AppError(
        "SERVICE_REQUIRED",
        "At least one service is required.",
        400,
      );
    }
    const services = await this.database.service.findMany({
      where: { tenantId: this.tenantId, id: { in: uniqueIds } },
    });
    const byId = new Map(services.map((service) => [service.id, service]));
    return uniqueIds.map((id) => {
      const service = byId.get(id);
      if (!service) {
        throw new AppError("SERVICE_NOT_FOUND", "Service was not found.", 404);
      }
      if (!service.active) {
        throw new AppError(
          "SERVICE_INACTIVE",
          "Inactive service cannot be used for a new appointment.",
          409,
        );
      }
      if (service.needsReview || service.durationMinutes === null) {
        throw new AppError(
          "SERVICE_NEEDS_REVIEW",
          "Service pending review cannot be used for a new appointment.",
          409,
        );
      }
      // Operacional garante duracao presente (constraint `Service_review_check`
      // mantem os dois em lockstep); o cast so torna esse fato visivel ao tipo.
      return { ...service, durationMinutes: service.durationMinutes };
    });
  }

  private async requireService(serviceId: string) {
    const service = await this.database.service.findUnique({
      where: { tenantId_id: { tenantId: this.tenantId, id: serviceId } },
    });
    if (!service) {
      throw new AppError("SERVICE_NOT_FOUND", "Service was not found.", 404);
    }
    return service;
  }
}

function serviceData(input: CreateAtendlyServiceInput) {
  const name = input.name.trim();
  if (!name || name.length > 200) {
    throw new AppError(
      "INVALID_SERVICE_NAME",
      "Service name is required and must have at most 200 characters.",
      400,
    );
  }
  if (!PRICE_TYPES.includes(input.priceType)) {
    throw new AppError(
      "INVALID_SERVICE_PRICE_TYPE",
      "Service price type is not recognised.",
      400,
    );
  }

  const durationMinutes = input.durationMinutes ?? null;
  if (
    durationMinutes !== null &&
    (!Number.isInteger(durationMinutes) || durationMinutes <= 0)
  ) {
    throw new AppError(
      "INVALID_SERVICE_DURATION",
      "Service duration must be a positive integer when informed.",
      400,
    );
  }

  const price = input.price ?? null;
  const requiresPrice = PRICED_TYPES.has(input.priceType);
  if (
    (requiresPrice &&
      (price === null || !Number.isFinite(price) || price < 0)) ||
    (!requiresPrice && price !== null)
  ) {
    throw new AppError(
      "INVALID_SERVICE_PRICE",
      "Fixed and starting-at services require a non-negative price; on-request and not-informed services require no price.",
      400,
    );
  }

  const description = normalizeDescription(input.description);
  const colorToken = normalizeColorToken(input.colorToken);
  const bufferBeforeMinutes = normalizeBuffer(
    input.bufferBeforeMinutes,
    "bufferBeforeMinutes",
  );
  const bufferAfterMinutes = normalizeBuffer(
    input.bufferAfterMinutes,
    "bufferAfterMinutes",
  );
  const recurrenceIntervalDays = normalizeRecurrence(
    input.recurrenceIntervalDays,
  );

  const needsReview = durationMinutes === null;
  const reviewOrigin = needsReview ? (input.reviewOrigin ?? "MANUAL") : null;

  return {
    name,
    durationMinutes,
    priceType: input.priceType,
    price,
    active: input.active ?? true,
    needsReview,
    reviewOrigin,
    description,
    colorToken,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    recurrenceIntervalDays,
  };
}

function normalizeDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 1_000) {
    throw new AppError(
      "INVALID_SERVICE_DESCRIPTION",
      "Service description must have at most 1000 characters.",
      400,
    );
  }
  return trimmed;
}

function normalizeColorToken(
  value: ServiceColorToken | null | undefined,
): ServiceColorToken | null {
  if (value === undefined || value === null) return null;
  if (!COLOR_TOKENS.includes(value)) {
    throw new AppError(
      "INVALID_SERVICE_COLOR",
      "Service color token is not recognised.",
      400,
    );
  }
  return value;
}

function normalizeBuffer(
  value: number | null | undefined,
  field: "bufferBeforeMinutes" | "bufferAfterMinutes",
): number {
  if (value === undefined || value === null) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(
      "INVALID_SERVICE_BUFFER",
      `Service ${field} must be a non-negative integer.`,
      400,
    );
  }
  return value;
}

function normalizeRecurrence(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError(
      "INVALID_SERVICE_RECURRENCE",
      "Service recurrence interval must be a positive integer of days when informed.",
      400,
    );
  }
  return value;
}

/**
 * Maior buffer entre os servicos de um conjunto (Goal009): a ocupacao
 * externa do atendimento e do hold usa o maior antes/depois, nunca a soma —
 * buffers intermediarios de multi-servico nao contam.
 */
export function maxServiceBuffer(
  services: Array<{ bufferBeforeMinutes: number; bufferAfterMinutes: number }>,
  key: "bufferBeforeMinutes" | "bufferAfterMinutes",
): number {
  return services.reduce((max, service) => Math.max(max, service[key]), 0);
}

export function toCalendarService(service: {
  id: string;
  name: string;
  durationMinutes: number | null;
  priceType: PriceType;
  price: Prisma.Decimal | null;
  active: boolean;
  colorToken?: ServiceColorToken | null;
  recurrenceIntervalDays?: number | null;
}): CalendarServiceDefinition {
  return {
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceType: service.priceType,
    price: service.price === null ? null : Number(service.price),
    active: service.active,
    colorId: null,
    colorToken: service.colorToken ?? null,
    recurrenceIntervalDays: service.recurrenceIntervalDays ?? null,
  };
}
