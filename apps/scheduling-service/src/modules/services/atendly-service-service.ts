import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { CalendarServiceDefinition } from "../calendar/calendar-provider.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;
type PriceType = "FIXED" | "ON_REQUEST";

export interface CreateAtendlyServiceInput {
  name: string;
  durationMinutes: number;
  priceType: PriceType;
  price?: number | null;
  active?: boolean;
}

export interface UpdateAtendlyServiceInput {
  name?: string;
  durationMinutes?: number;
  priceType?: PriceType;
  price?: number | null;
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

  async listForScheduling(): Promise<CalendarServiceDefinition[]> {
    return (await this.list({ activeOnly: true })).map(toCalendarService);
  }

  async create(input: CreateAtendlyServiceInput) {
    const data = serviceData(input);
    return this.database.service.create({
      data: { tenantId: this.tenantId, ...data },
    });
  }

  async update(serviceId: string, input: UpdateAtendlyServiceInput) {
    const current = await this.requireService(serviceId);
    const priceType = input.priceType ?? current.priceType;
    const price =
      input.priceType === "ON_REQUEST"
        ? null
        : input.price === undefined
          ? current.price === null
            ? null
            : Number(current.price)
          : input.price;
    const data = serviceData({
      name: input.name ?? current.name,
      durationMinutes: input.durationMinutes ?? current.durationMinutes,
      priceType,
      price,
      active: current.active,
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
      return service;
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
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new AppError(
      "INVALID_SERVICE_DURATION",
      "Service duration must be a positive integer.",
      400,
    );
  }
  const price = input.price ?? null;
  if (
    (input.priceType === "FIXED" &&
      (price === null || !Number.isFinite(price) || price < 0)) ||
    (input.priceType === "ON_REQUEST" && price !== null)
  ) {
    throw new AppError(
      "INVALID_SERVICE_PRICE",
      "Fixed services require a non-negative price; on-request services require no price.",
      400,
    );
  }
  return {
    name,
    durationMinutes: input.durationMinutes,
    priceType: input.priceType,
    price,
    active: input.active ?? true,
  };
}

export function toCalendarService(service: {
  id: string;
  name: string;
  durationMinutes: number;
  priceType: PriceType;
  price: Prisma.Decimal | null;
  active: boolean;
}): CalendarServiceDefinition {
  return {
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceType: service.priceType,
    price: service.price === null ? null : Number(service.price),
    active: service.active,
    colorId: null,
  };
}
