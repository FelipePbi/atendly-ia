import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import { normalizePhone } from "../../shared/phone/phone.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export interface CreateAtendlyCustomerInput {
  name?: string | null;
  phone: string;
}

export class AtendlyCustomerService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly tenantId: string,
  ) {}

  async list() {
    return this.database.customer.findMany({
      where: { tenantId: this.tenantId },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });
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

  async create(input: CreateAtendlyCustomerInput) {
    const normalizedPhone = normalizePhone(input.phone);
    const name = normalizeName(input.name);
    return this.database.customer.upsert({
      where: {
        tenantId_normalizedPhone: {
          tenantId: this.tenantId,
          normalizedPhone,
        },
      },
      create: {
        tenantId: this.tenantId,
        name,
        phone: input.phone.trim(),
        normalizedPhone,
      },
      update: name ? { name } : {},
    });
  }

  async findByPhone(phone: string) {
    const normalizedPhone = normalizePhone(phone);
    return this.database.customer.findUnique({
      where: {
        tenantId_normalizedPhone: {
          tenantId: this.tenantId,
          normalizedPhone,
        },
      },
    });
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
