import { AppError } from "../../shared/errors/app-error.js";

/** Um intervalo da grade semanal, no formato `HH:mm` do contrato. */
export interface AvailabilityGridRule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/**
 * Regra única de sobreposição da grade semanal (Goal062 §2): a tela de
 * configuração (`PATCH /internal/availability-settings`) e a importação
 * validam a grade pela mesma função. Início depois do fim é
 * `INVALID_AVAILABILITY_RANGE`; dois intervalos do mesmo dia que se cruzam
 * são `AVAILABILITY_OVERLAP`. Os códigos e status HTTP são os que a rota de
 * configuração sempre devolveu.
 */
export function assertNonOverlappingRules(
  rules: AvailabilityGridRule[],
): void {
  for (const rule of rules) {
    if (rule.startTime >= rule.endTime) {
      throw new AppError(
        "INVALID_AVAILABILITY_RANGE",
        "Availability start must precede end.",
        400,
      );
    }
    const overlap = rules.some(
      (candidate) =>
        candidate !== rule &&
        candidate.dayOfWeek === rule.dayOfWeek &&
        candidate.startTime < rule.endTime &&
        candidate.endTime > rule.startTime,
    );
    if (overlap) {
      throw new AppError(
        "AVAILABILITY_OVERLAP",
        "Availability periods cannot overlap.",
        409,
      );
    }
  }
}

/** A mesma regra, como pergunta: a grade passa na validação da tela? */
export function isValidAvailabilityGrid(rules: AvailabilityGridRule[]): boolean {
  try {
    assertNonOverlappingRules(rules);
    return true;
  } catch (error) {
    if (error instanceof AppError) return false;
    throw error;
  }
}

/** Ordem de leitura da grade: por dia da semana, depois por início. */
export function sortAvailabilityGrid<TRule extends AvailabilityGridRule>(
  rules: TRule[],
): TRule[] {
  return [...rules].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
  );
}
