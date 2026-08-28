import type { SVGProps } from "react";

export type IconName =
  | "alert"
  | "briefcase"
  | "calendar"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "dots"
  | "external"
  | "eye"
  | "help"
  | "home"
  | "inbox"
  | "info"
  | "link"
  | "lock"
  | "logout"
  | "more"
  | "plus"
  | "refresh"
  | "search"
  | "settings"
  | "shield"
  | "spark"
  | "user"
  | "users"
  | "x"
  | "chat";

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; label?: string };

export function Icon({ name, label, className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={className ? `icon ${className}` : "icon"}
      role={label ? "img" : undefined}
      {...props}
    >
      <use href={`/icons/atendly-icons.svg#i-${name}`} />
    </svg>
  );
}
