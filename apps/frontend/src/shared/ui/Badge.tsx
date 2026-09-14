import clsx from "clsx";

import { Icon, type IconName } from "@/shared/icons/Icon";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "ai";

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  className?: string;
};

const toneClassName: Record<BadgeTone, string> = {
  neutral: "badge",
  success: "badge badge-success",
  warning: "badge badge-attention",
  danger: "badge badge-danger",
  ai: "badge badge-ai",
};

export function Badge({ label, tone = "neutral", icon, className }: BadgeProps) {
  return (
    <span className={clsx(toneClassName[tone], className)}>
      {icon ? (
        <Icon name={icon} />
      ) : (
        <span className="badge-dot" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}
