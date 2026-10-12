import type { ComponentPropsWithoutRef } from "react";

import { Icon, type IconName } from "@/shared/icons/Icon";
import { useSkeletonSettled } from "@/shared/motion/SkeletonSettle";

import { Button } from "./Button";

type StateProps = {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  icon?: IconName;
  title: string;
  tone?: "empty" | "error";
  onAction?: () => void;
};

export function StatePanel({
  actionHref,
  actionLabel,
  description,
  icon = "info",
  title,
  tone = "empty",
  onAction,
}: StateProps) {
  return (
    <div
      className={tone === "error" ? "error-state" : "empty-state"}
      role={tone === "error" ? "alert" : undefined}
    >
      <div className="state-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && actionHref && (
        <Button href={actionHref}>{actionLabel}</Button>
      )}
      {actionLabel && !actionHref && (
        <Button type="button" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Dentro de `<SkeletonSettle>` (D-168), reserva o lugar desde o primeiro
 * quadro e só vira esqueleto (classe `skeleton`, com o brilho) se a carga
 * passar de ~150 ms; fora dele, é esqueleto desde o início.
 */
export function Skeleton({
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  const settled = useSkeletonSettled();
  return (
    <span
      className={`${settled ? "skeleton " : ""}${className}`}
      aria-hidden="true"
      {...props}
    >
      {children}
    </span>
  );
}
