import type { SVGProps } from "react";

export type IconName =
  | "alert"
  | "ban"
  | "bell"
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
  | "import"
  | "inbox"
  | "info"
  | "link"
  | "lock"
  | "mail"
  | "logout"
  | "monitor"
  | "more"
  | "pin"
  | "plus"
  | "refresh"
  | "search"
  | "settings"
  | "shield"
  | "spark"
  | "user"
  | "users"
  | "x"
  | "chat"
  | "nav-calendar"
  | "nav-chat"
  | "nav-home"
  | "nav-list"
  | "nav-more"
  | "nav-sliders"
  | "nav-user";

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
