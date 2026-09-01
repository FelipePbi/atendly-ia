import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  addDays,
  addMinutes,
  localDateTimeToInstant,
  minutesFromTime,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError, toErrorMessage } from "../../shared/errors/app-error.js";
import { normalizePhone } from "../../shared/phone/phone.js";
import { AtendlyCustomerService } from "../customers/atendly-customer-service.js";
import { parseMinhaAgendaConnection } from "../integrations/minha-agenda/config.js";
import { MinhaAgendaCalendarProvider } from "../integrations/minha-agenda/provider.js";
import { AtendlyServiceService } from "../services/atendly-service-service.js";

type CalendarSource = "ATENDLY" | "MINHA_AGENDA";
type MigrationStatus =
  "PENDING" | "ANALYZING" | "RUNNING" | "PARTIAL" | "COMPLETED" | "FAILED";
type EntityType = "SERVICE" | "CUSTOMER" | "APPOINTMENT" | "AVAILABILITY";

interface MigrationContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

interface EntityCount {
  total: number;
  importable: number;
}

interface MigrationConflictInput {
  entityType: EntityType;
  externalId: string | null;
  code: string;
  message: string;
}

interface MigrationDiagnosis {
  source: CalendarSource;
  target: CalendarSource;
  supported: boolean;
  conflicts: MigrationConflictInput[];
  entities: {
    services: EntityCount;
    customers: EntityCount;
    appointments: EntityCount;
    availability: EntityCount;
  };
  warnings: string[];
  limitations: string[];
}

type ExternalSnapshot = Awaited<
  ReturnType<MinhaAgendaCalendarProvider["getMigrationSnapshot"]>
>;

interface Analysis {
  diagnosis: MigrationDiagnosis;
  snapshot: ExternalSnapshot | null;
  timezone: string;
}

const activeStatuses: MigrationStatus[] = ["PENDING", "ANALYZING", "RUNNING"];

export class CalendarMigrationService {
  private readonly scheduled = new Set<string>();

  constructor(private readonly prisma: PrismaClient) {}

  async diagnose(
    context: MigrationContext,
    target: CalendarSource,
  ): Promise<MigrationDiagnosis> {
    return (await this.analyze(context, target)).diagnosis;
  }

  async start(context: MigrationContext, target: CalendarSource) {
    const active = await this.prisma.migrationJob.findFirst({
      where: { tenantId: context.tenantId, status: { in: activeStatuses } },
      orderBy: { createdAt: "desc" },
    });
    if (active) {
      throw new AppError(
        "MIGRATION_ALREADY_RUNNING",
        "A calendar migration is already running for this tenant.",
        409,
        { migrationId: active.id },
      );
    }

    const { diagnosis } = await this.analyze(context, target);
    if (!diagnosis.supported) {
      throw new AppError(
        "MIGRATION_NOT_SUPPORTED",
        "Automatic migration is not supported for this target.",
        409,
        { limitations: diagnosis.limitations },
      );
    }

    const job = await this.prisma.migrationJob.create({
      data: {
        tenantId: context.tenantId,
        requestedBy: context.userId,
        source: diagnosis.source,
        target: diagnosis.target,
        status: "PENDING",
        progress: 0,
        currentStep: "QUEUED",
        summary: json({ diagnosis: diagnosis.entities }),
        warnings: json(diagnosis.warnings),
        limitations: json(diagnosis.limitations),
        conflicts: {
          create: diagnosis.conflicts.map((conflict) => ({
            entityType: conflict.entityType,
            status: "OPEN",
            details: json(conflict),
          })),
        },
      },
      include: { conflicts: true },
    });
    this.schedule(job.id, context);
    return migrationDto(job);
  }

  async get(tenantId: string, id: string) {
    const job = await this.prisma.migrationJob.findUnique({
      where: { tenantId_id: { tenantId, id } },
      include: { conflicts: true },
    });
    if (!job) {
      throw new AppError(
        "MIGRATION_NOT_FOUND",
        "Calendar migration was not found.",
        404,
      );
    }
    return migrationDto(job);
  }

  async resumeIncomplete(): Promise<void> {
    await this.prisma.migrationJob.updateMany({
      where: {
        status: { in: ["ANALYZING", "RUNNING"] },
      },
      data: { status: "PENDING", currentStep: "RECOVERING", progress: 0 },
    });
    const jobs = await this.prisma.migrationJob.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    for (const job of jobs) {
      this.schedule(job.id, {
        tenantId: job.tenantId,
        userId: job.requestedBy,
        requestId: `migration-recovery-${job.id}`,
      });
    }
  }

  private schedule(id: string, context: MigrationContext): void {
    if (this.scheduled.has(id)) return;
    this.scheduled.add(id);
    queueMicrotask(() => {
      void this.run(id, context).finally(() => this.scheduled.delete(id));
    });
  }

  private async run(id: string, context: MigrationContext): Promise<void> {
    const claimed = await this.prisma.migrationJob.updateMany({
      where: { tenantId: context.tenantId, id, status: "PENDING" },
      data: {
        status: "ANALYZING",
        progress: 10,
        currentStep: "ANALYZING_SOURCE",
        startedAt: new Date(),
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) return;

    try {
      const job = await this.prisma.migrationJob.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
      });
      const analysis = await this.analyze(context, job.target);
      await this.replaceConflicts(id, context.tenantId, analysis.diagnosis);

      if (!analysis.diagnosis.supported) {
        throw new AppError(
          "MIGRATION_NOT_SUPPORTED",
          "Automatic migration is not supported for this target.",
          409,
        );
      }
      if (analysis.diagnosis.conflicts.length > 0) {
        await this.prisma.migrationJob.update({
          where: { tenantId_id: { tenantId: context.tenantId, id } },
          data: {
            status: "PARTIAL",
            progress: 100,
            currentStep: "REQUIRES_CORRECTION",
            finishedAt: new Date(),
            summary: json({ diagnosis: analysis.diagnosis.entities }),
            warnings: json(analysis.diagnosis.warnings),
            limitations: json(analysis.diagnosis.limitations),
          },
        });
        return;
      }
      if (!analysis.snapshot) {
        throw new AppError(
          "MIGRATION_SNAPSHOT_UNAVAILABLE",
          "Migration source data is unavailable.",
          500,
        );
      }

      await this.prisma.migrationJob.update({
        where: { tenantId_id: { tenantId: context.tenantId, id } },
        data: {
          status: "RUNNING",
          progress: 35,
          currentStep: "IMPORTING_DATA",
          warnings: json(analysis.diagnosis.warnings),
          limitations: json(analysis.diagnosis.limitations),
        },
      });
      await this.importToAtendly(
        id,
        context,
        analysis.timezone,
        analysis.snapshot,
        analysis.diagnosis,
      );
    } catch (error: unknown) {
      const code = error instanceof AppError ? error.code : "MIGRATION_FAILED";
      await this.prisma.migrationJob.updateMany({
        where: {
          tenantId: context.tenantId,
          id,
          status: { in: activeStatuses },
        },
        data: {
          status: "FAILED",
          progress: 100,
          currentStep: "FAILED",
          errorCode: code,
          errorMessage: toErrorMessage(error),
          finishedAt: new Date(),
        },
      });
    }
  }

  private async analyze(
    context: MigrationContext,
    target: CalendarSource,
  ): Promise<Analysis> {
    const calendar = await this.prisma.calendarSettings.findUnique({
      where: { tenantId: context.tenantId },
    });
    if (!calendar) {
      throw new AppError(
        "CALENDAR_SETTINGS_NOT_FOUND",
        "Calendar settings were not found for this tenant.",
        404,
      );
    }
    if (calendar.source === target) {
      throw new AppError(
        "MIGRATION_SOURCE_EQUALS_TARGET",
        "Migration target must differ from the current source.",
        409,
      );
    }

    if (calendar.source === "ATENDLY") {
      const [services, customers, appointments, availability] =
        await Promise.all([
          this.prisma.service.count({ where: { tenantId: context.tenantId } }),
          this.prisma.customer.count({ where: { tenantId: context.tenantId } }),
          this.prisma.appointment.count({
            where: {
              tenantId: context.tenantId,
              startAt: { gte: new Date() },
              status: { not: "CANCELLED" },
            },
          }),
          this.prisma.availabilityRule.count({
            where: { tenantId: context.tenantId, active: true },
          }),
        ]);
      return {
        timezone: calendar.timezone,
        snapshot: null,
        diagnosis: {
          source: calendar.source,
          target,
          supported: false,
          conflicts: [],
          entities: {
            services: count(services, 0),
            customers: count(customers, 0),
            appointments: count(appointments, 0),
            availability: count(availability, 0),
          },
          warnings: [],
          limitations: [
            "A integração atual não confirma transferência automática de dados da Agenda Atendly para o Minha Agenda.",
          ],
        },
      };
    }

    const connection = await this.prisma.integrationConnection.findUnique({
      where: {
        tenantId_provider: {
          tenantId: context.tenantId,
          provider: "MINHA_AGENDA",
        },
      },
    });
    if (!connection) {
      throw new AppError(
        "INTEGRATION_CONNECTION_NOT_FOUND",
        "Minha Agenda connection was not found for this tenant.",
        404,
      );
    }
    const provider = new MinhaAgendaCalendarProvider(
      parseMinhaAgendaConnection(connection),
    );
    const startDate = todayInTimeZone(calendar.timezone);
    const [snapshot, targetCounts] = await Promise.all([
      provider.getMigrationSnapshot({
        startDate,
        endDate: addDays(startDate, 3_650),
      }),
      this.targetCounts(context.tenantId),
    ]);
    const conflicts = diagnoseSnapshot(
      snapshot,
      targetCounts,
      calendar.timezone,
    );
    const customers = new Set(
      snapshot.appointments
        .map((appointment) => appointment.customer?.id)
        .filter((id): id is string => Boolean(id)),
    );
    return {
      timezone: calendar.timezone,
      snapshot,
      diagnosis: {
        source: calendar.source,
        target,
        supported: true,
        conflicts,
        entities: {
          services: count(
            snapshot.services.length,
            importable(snapshot.services.length, conflicts, "SERVICE"),
          ),
          customers: count(
            customers.size,
            importable(customers.size, conflicts, "CUSTOMER"),
          ),
          appointments: count(
            snapshot.appointments.length,
            importable(snapshot.appointments.length, conflicts, "APPOINTMENT"),
          ),
          availability: count(
            snapshot.availability.length,
            importable(snapshot.availability.length, conflicts, "AVAILABILITY"),
          ),
        },
        warnings: [
          "A conexão com o Minha Agenda permanece preservada após o corte.",
        ],
        limitations: [
          "O diagnóstico considera agendamentos dos próximos 10 anos.",
          "Clientes sem agendamento futuro não são expostos pela integração atual e não podem ser importados automaticamente.",
        ],
      },
    };
  }

  private async targetCounts(tenantId: string) {
    const [services, customers, appointments, availability] = await Promise.all(
      [
        this.prisma.service.count({ where: { tenantId } }),
        this.prisma.customer.count({ where: { tenantId } }),
        this.prisma.appointment.count({ where: { tenantId } }),
        this.prisma.availabilityRule.count({ where: { tenantId } }),
      ],
    );
    return { services, customers, appointments, availability };
  }

  private async importToAtendly(
    migrationId: string,
    context: MigrationContext,
    timezone: string,
    snapshot: ExternalSnapshot,
    diagnosis: MigrationDiagnosis,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.calendarSettings.findUnique({
          where: { tenantId: context.tenantId },
        });
        if (!current || current.source !== "MINHA_AGENDA") {
          throw new AppError(
            "MIGRATION_SOURCE_CHANGED",
            "Official calendar source changed during migration.",
            409,
          );
        }
        const counts = await Promise.all([
          transaction.service.count({ where: { tenantId: context.tenantId } }),
          transaction.customer.count({ where: { tenantId: context.tenantId } }),
          transaction.appointment.count({
            where: { tenantId: context.tenantId },
          }),
          transaction.availabilityRule.count({
            where: { tenantId: context.tenantId },
          }),
        ]);
        if (counts.some((value) => value > 0)) {
          throw new AppError(
            "MIGRATION_TARGET_CHANGED",
            "Target calendar data changed after diagnosis.",
            409,
          );
        }

        const serviceIds = new Map<string, string>();
        const serviceService = new AtendlyServiceService(
          transaction,
          context.tenantId,
        );
        for (const service of snapshot.services) {
          const created = await serviceService.create({
            name: service.name,
            durationMinutes: service.durationMinutes,
            priceType: service.priceType,
            price: service.price,
            active: service.active,
          });
          serviceIds.set(service.id, created.id);
          await transaction.externalEntityMap.create({
            data: {
              tenantId: context.tenantId,
              provider: "MINHA_AGENDA",
              entityType: "SERVICE",
              internalId: created.id,
              externalId: service.id,
            },
          });
        }

        const customerIds = new Map<string, string>();
        const customerService = new AtendlyCustomerService(
          transaction,
          context.tenantId,
        );
        for (const appointment of snapshot.appointments) {
          const customer = appointment.customer;
          if (!customer || !customer.phone || customerIds.has(customer.id))
            continue;
          const created = await customerService.create({
            name: customer.name,
            phone: customer.phone,
          });
          customerIds.set(customer.id, created.id);
          await transaction.externalEntityMap.create({
            data: {
              tenantId: context.tenantId,
              provider: "MINHA_AGENDA",
              entityType: "CUSTOMER",
              internalId: created.id,
              externalId: customer.id,
            },
          });
        }

        for (const appointment of snapshot.appointments) {
          const customerId = appointment.customer
            ? customerIds.get(appointment.customer.id)
            : undefined;
          if (!customerId) {
            throw new AppError(
              "MIGRATION_CUSTOMER_MAPPING_MISSING",
              "Appointment customer mapping is missing.",
              409,
            );
          }
          const startAt = localDateTimeToInstant(
            appointment.date,
            appointment.startTime,
            timezone,
          );
          const endAt = addMinutes(startAt, appointment.durationMinutes);
          const created = await transaction.appointment.create({
            data: {
              source: "INTEGRATION",
              startAt,
              endAt,
              status: appointment.status,
              createdBy: context.userId,
              comments: appointment.comments,
              customer: {
                connect: {
                  tenantId_id: {
                    tenantId: context.tenantId,
                    id: customerId,
                  },
                },
              },
              items: {
                create: appointment.services.map((service) => {
                  const serviceId = serviceIds.get(service.serviceId);
                  if (!serviceId) {
                    throw new AppError(
                      "MIGRATION_SERVICE_MAPPING_MISSING",
                      "Appointment service mapping is missing.",
                      409,
                    );
                  }
                  return {
                    serviceNameSnapshot: service.name,
                    durationMinutesSnapshot: service.durationMinutes,
                    priceTypeSnapshot: service.priceType,
                    priceSnapshot: service.price,
                    service: {
                      connect: {
                        tenantId_id: {
                          tenantId: context.tenantId,
                          id: serviceId,
                        },
                      },
                    },
                  };
                }),
              },
            },
          });
          await transaction.externalEntityMap.create({
            data: {
              tenantId: context.tenantId,
              provider: "MINHA_AGENDA",
              entityType: "APPOINTMENT",
              internalId: created.id,
              externalId: appointment.id,
            },
          });
        }

        await transaction.availabilityRule.createMany({
          data: snapshot.availability.map((rule) => ({
            tenantId: context.tenantId,
            dayOfWeek: rule.dayOfWeek,
            startTime: databaseTime(rule.startTime),
            endTime: databaseTime(rule.endTime),
            active: true,
          })),
        });
        await transaction.calendarSettings.update({
          where: { tenantId: context.tenantId },
          data: { source: "ATENDLY" },
        });
        const imported = {
          services: snapshot.services.length,
          customers: customerIds.size,
          appointments: snapshot.appointments.length,
          availability: snapshot.availability.length,
        };
        await transaction.migrationJob.update({
          where: {
            tenantId_id: { tenantId: context.tenantId, id: migrationId },
          },
          data: {
            status: "COMPLETED",
            progress: 100,
            currentStep: "SOURCE_SWITCHED",
            finishedAt: new Date(),
            summary: json({ diagnosis: diagnosis.entities, imported }),
          },
        });
        return imported;
      },
      { isolationLevel: "Serializable" },
    );
  }

  private async replaceConflicts(
    id: string,
    tenantId: string,
    diagnosis: MigrationDiagnosis,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.migrationConflict.deleteMany({
        where: { tenantId, migrationJobId: id },
      });
      if (diagnosis.conflicts.length > 0) {
        await transaction.migrationConflict.createMany({
          data: diagnosis.conflicts.map((conflict) => ({
            tenantId,
            migrationJobId: id,
            entityType: conflict.entityType,
            status: "OPEN",
            details: json(conflict),
          })),
        });
      }
    });
  }
}

function diagnoseSnapshot(
  snapshot: ExternalSnapshot,
  targetCounts: {
    services: number;
    customers: number;
    appointments: number;
    availability: number;
  },
  timezone: string,
): MigrationConflictInput[] {
  const conflicts: MigrationConflictInput[] = [];
  for (const [entityType, total] of [
    ["SERVICE", targetCounts.services],
    ["CUSTOMER", targetCounts.customers],
    ["APPOINTMENT", targetCounts.appointments],
    ["AVAILABILITY", targetCounts.availability],
  ] as const) {
    if (total > 0) {
      conflicts.push({
        entityType,
        externalId: null,
        code: "TARGET_NOT_EMPTY",
        message:
          "O destino já possui dados e exige revisão antes da importação.",
      });
    }
  }
  for (const service of snapshot.services) {
    if (
      !service.name.trim() ||
      service.durationMinutes <= 0 ||
      (service.priceType === "FIXED" && service.price === null)
    ) {
      conflicts.push({
        entityType: "SERVICE",
        externalId: service.id,
        code: "INVALID_SERVICE",
        message: "O serviço possui campos obrigatórios ausentes ou inválidos.",
      });
    }
  }
  const serviceIds = new Set(snapshot.services.map((service) => service.id));
  const customersByPhone = new Map<string, string>();
  for (const appointment of snapshot.appointments) {
    if (!appointment.customer?.phone) {
      conflicts.push({
        entityType: "CUSTOMER",
        externalId: appointment.customer?.id ?? null,
        code: "CUSTOMER_PHONE_MISSING",
        message:
          "Um cliente de agendamento futuro não possui telefone importável.",
      });
    } else {
      try {
        const phone = normalizePhone(appointment.customer.phone);
        const existingCustomerId = customersByPhone.get(phone);
        if (
          existingCustomerId &&
          existingCustomerId !== appointment.customer.id
        ) {
          conflicts.push({
            entityType: "CUSTOMER",
            externalId: appointment.customer.id,
            code: "CUSTOMER_PHONE_DUPLICATED",
            message:
              "Clientes diferentes compartilham o mesmo telefone na fonte atual.",
          });
        } else {
          customersByPhone.set(phone, appointment.customer.id);
        }
      } catch {
        conflicts.push({
          entityType: "CUSTOMER",
          externalId: appointment.customer.id,
          code: "CUSTOMER_PHONE_INVALID",
          message: "Um cliente possui telefone inválido para importação.",
        });
      }
    }
    if (
      appointment.services.length === 0 ||
      appointment.services.some((service) => !serviceIds.has(service.serviceId))
    ) {
      conflicts.push({
        entityType: "APPOINTMENT",
        externalId: appointment.id,
        code: "APPOINTMENT_SERVICE_MISSING",
        message:
          "O agendamento não possui todos os serviços necessários para a importação.",
      });
    }
  }
  for (const availability of snapshot.availability) {
    try {
      if (
        minutesFromTime(availability.startTime) >=
        minutesFromTime(availability.endTime)
      ) {
        throw new Error("Invalid availability interval");
      }
    } catch {
      conflicts.push({
        entityType: "AVAILABILITY",
        externalId: String(availability.dayOfWeek),
        code: "INVALID_AVAILABILITY",
        message: "Um período de disponibilidade possui horário inválido.",
      });
    }
  }
  const ordered = snapshot.appointments
    .flatMap((appointment) => {
      if (appointment.durationMinutes <= 0) {
        conflicts.push({
          entityType: "APPOINTMENT",
          externalId: appointment.id,
          code: "INVALID_APPOINTMENT_DURATION",
          message: "Um agendamento possui duração inválida.",
        });
        return [];
      }
      let start: Date;
      try {
        start = localDateTimeToInstant(
          appointment.date,
          appointment.startTime,
          timezone,
        );
      } catch {
        conflicts.push({
          entityType: "APPOINTMENT",
          externalId: appointment.id,
          code: "INVALID_APPOINTMENT_DATETIME",
          message: "Um agendamento possui data ou horário inválido.",
        });
        return [];
      }
      return [
        {
          appointment,
          start,
          end: addMinutes(start, appointment.durationMinutes),
        },
      ];
    })
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous && current && previous.end > current.start) {
      conflicts.push({
        entityType: "APPOINTMENT",
        externalId: current.appointment.id,
        code: "APPOINTMENT_OVERLAP",
        message: "Existem agendamentos futuros sobrepostos na fonte atual.",
      });
    }
  }
  if (snapshot.services.length === 0) {
    conflicts.push({
      entityType: "SERVICE",
      externalId: null,
      code: "SERVICE_REQUIRED",
      message:
        "Ao menos um serviço válido é necessário para ativar a Agenda Atendly.",
    });
  }
  if (snapshot.availability.length === 0) {
    conflicts.push({
      entityType: "AVAILABILITY",
      externalId: null,
      code: "AVAILABILITY_REQUIRED",
      message:
        "Ao menos um período de disponibilidade é necessário para o corte.",
    });
  }
  return deduplicateConflicts(conflicts);
}

function migrationDto(job: {
  id: string;
  source: CalendarSource;
  target: CalendarSource;
  status: string;
  progress: number;
  currentStep: string | null;
  summary: unknown;
  warnings: unknown;
  limitations: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  conflicts: Array<{
    id: string;
    entityType: EntityType;
    status: string;
    details: unknown;
  }>;
}) {
  return {
    migrationId: job.id,
    source: job.source,
    target: job.target,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    summary: job.summary,
    warnings: stringArray(job.warnings),
    limitations: stringArray(job.limitations),
    error:
      job.errorCode && job.errorMessage
        ? { code: job.errorCode, message: job.errorMessage }
        : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    conflicts: job.conflicts.map((conflict) => ({
      id: conflict.id,
      entityType: conflict.entityType,
      status: conflict.status,
      details: conflict.details,
    })),
  };
}

function count(total: number, importableCount: number): EntityCount {
  return { total, importable: Math.max(0, importableCount) };
}

function importable(
  total: number,
  conflicts: MigrationConflictInput[],
  entityType: EntityType,
): number {
  const blocked = new Set(
    conflicts
      .filter(
        (conflict) => conflict.entityType === entityType && conflict.externalId,
      )
      .map((conflict) => conflict.externalId),
  ).size;
  return conflicts.some(
    (conflict) =>
      conflict.entityType === entityType && conflict.externalId === null,
  )
    ? 0
    : total - blocked;
}

function deduplicateConflicts(
  conflicts: MigrationConflictInput[],
): MigrationConflictInput[] {
  return Array.from(
    new Map(
      conflicts.map((conflict) => [
        `${conflict.entityType}:${conflict.externalId}:${conflict.code}`,
        conflict,
      ]),
    ).values(),
  );
}

function todayInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function databaseTime(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
