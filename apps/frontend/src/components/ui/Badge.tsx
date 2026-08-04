import type { ReactNode } from "react";
import { clsx } from "clsx";

type BadgeTone = "brand" | "violet" | "status";

export function Badge({
  tone = "brand",
  dot = false,
  children,
  className,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={clsx("ui-badge", `ui-badge--${tone}`, className)}>
      {dot ? <span className="ui-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
