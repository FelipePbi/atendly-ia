import { AppError } from "../../shared/errors/app-error.js";

/**
 * Duração de um serviço ajustada para um atendimento (D-207): um serviço que
 * leva 40 min por padrão pode levar 60 num caso especial. Só vale para o
 * atendimento em que foi pedida — o catálogo não muda.
 */
export interface ServiceDurationOverride {
  serviceId: string;
  durationMinutes: number;
}

/** Mesmo teto do atendimento manual sem serviço (um dia). */
export const SERVICE_DURATION_MAX_MINUTES = 1_440;

/**
 * Serviço operacional com a duração que vale para **este** atendimento e o
 * padrão do catálogo ao lado. Sem ajuste, as duas são iguais.
 */
export type ServiceWithDuration<T> = T & {
  durationMinutes: number;
  defaultDurationMinutes: number;
};

/**
 * Aplica os ajustes de duração aos serviços já validados do catálogo.
 *
 * Só a profissional (`source: USER`) ajusta: a IA marca sempre com o padrão
 * do catálogo, e um ajuste vindo dela é recusado em vez de ignorado, para que
 * nenhuma duração diferente nasça de um campo esquecido no caminho (mesmo
 * padrão do encaixe e do atendimento manual). Ajuste igual ao padrão é aceito
 * e não muda nada.
 */
export function applyServiceDurations<
  T extends { id: string; durationMinutes: number },
>(
  services: T[],
  overrides: ServiceDurationOverride[] | undefined,
  source: "AI" | "USER",
): Array<ServiceWithDuration<T>> {
  const byService = serviceDurationMap(services, overrides, source);
  return services.map((service) => ({
    ...service,
    defaultDurationMinutes: service.durationMinutes,
    durationMinutes: byService.get(service.id) ?? service.durationMinutes,
  }));
}

/**
 * Ajustes validados por serviço. Vazio quando não há ajuste; cada serviço do
 * ajuste precisa estar entre os do atendimento, uma vez só.
 */
export function serviceDurationMap(
  services: Array<{ id: string }>,
  overrides: ServiceDurationOverride[] | undefined,
  source: "AI" | "USER",
): Map<string, number> {
  const byService = new Map<string, number>();
  if (!overrides || overrides.length === 0) return byService;
  if (source !== "USER") {
    throw new AppError(
      "SERVICE_DURATION_OVERRIDE_NOT_ALLOWED",
      "Only a human (source USER) can change a service duration for an appointment.",
      403,
    );
  }
  const known = new Set(services.map((service) => service.id));
  for (const override of overrides) {
    if (!known.has(override.serviceId)) {
      throw new AppError(
        "SERVICE_DURATION_SERVICE_MISMATCH",
        "A duration was given for a service that is not part of the appointment.",
        400,
        { serviceId: override.serviceId },
      );
    }
    if (byService.has(override.serviceId)) {
      throw new AppError(
        "SERVICE_DURATION_DUPLICATED",
        "A service duration was given more than once.",
        400,
        { serviceId: override.serviceId },
      );
    }
    assertServiceDuration(override.durationMinutes);
    byService.set(override.serviceId, override.durationMinutes);
  }
  return byService;
}

export function assertServiceDuration(value: number): void {
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    value > SERVICE_DURATION_MAX_MINUTES
  ) {
    throw new AppError(
      "INVALID_SERVICE_DURATION",
      `Service duration must be an integer between 1 and ${SERVICE_DURATION_MAX_MINUTES} minutes.`,
      400,
    );
  }
}

/**
 * O que o hold guarda da proposta (`proposedServiceDurations`): só os
 * serviços com duração diferente do padrão, ou nulo quando nenhum difere.
 */
export function adjustedServiceDurations(
  services: Array<ServiceWithDuration<{ id: string }>>,
): ServiceDurationOverride[] | null {
  const adjusted = services
    .filter((service) => service.durationMinutes !== service.defaultDurationMinutes)
    .map((service) => ({
      serviceId: service.id,
      durationMinutes: service.durationMinutes,
    }));
  return adjusted.length > 0 ? adjusted : null;
}

/** Lê `proposedServiceDurations` do hold, descartando o que não tem a forma. */
export function toServiceDurations(value: unknown): ServiceDurationOverride[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ServiceDurationOverride =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as ServiceDurationOverride).serviceId === "string" &&
      Number.isInteger((item as ServiceDurationOverride).durationMinutes),
  );
}

export function totalDuration(
  services: Array<{ durationMinutes: number }>,
): number {
  return services.reduce((total, service) => total + service.durationMinutes, 0);
}
