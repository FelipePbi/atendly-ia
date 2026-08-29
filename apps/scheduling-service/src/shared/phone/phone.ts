import { AppError } from "../errors/app-error.js";

export function normalizePhone(value: string): string {
  const normalized = value.replace(/\D/g, "");
  if (normalized.length < 6 || normalized.length > 15) {
    throw new AppError(
      "INVALID_PHONE",
      "Phone must contain between 6 and 15 digits.",
      400,
    );
  }
  return normalized;
}

export function phoneMatches(
  leftValue: string | null | undefined,
  rightValue: string | null | undefined,
): boolean {
  if (!leftValue || !rightValue) return false;
  const left = digitsOnly(leftValue);
  const right = digitsOnly(rightValue);
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
