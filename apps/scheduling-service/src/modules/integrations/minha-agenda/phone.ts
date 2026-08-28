export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function phoneMatches(
  leftValue: string | null | undefined,
  rightValue: string | null | undefined,
): boolean {
  if (!leftValue || !rightValue) return false;
  const left = normalizePhone(leftValue);
  const right = normalizePhone(rightValue);
  return left === right || left.endsWith(right) || right.endsWith(left);
}
