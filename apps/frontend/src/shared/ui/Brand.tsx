import Link from "next/link";

export function Brand({
  href = "/inicio",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link className="brand" href={href} aria-label="Atendly — Início">
      <span className="brand-mark" aria-hidden="true" />
      {!compact && <span>Atendly</span>}
    </Link>
  );
}
