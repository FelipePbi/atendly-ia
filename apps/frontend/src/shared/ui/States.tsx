import type { ComponentPropsWithoutRef } from "react";
import { Icon, type IconName } from "@/shared/icons/Icon";
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
    <div className={tone === "error" ? "error-state" : "empty-state"}>
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

export function Skeleton({
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span className={`skeleton ${className}`} aria-hidden="true" {...props}>
      {children}
    </span>
  );
}
