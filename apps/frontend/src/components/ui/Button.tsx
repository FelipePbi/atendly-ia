import type { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

type ButtonVariant = "primary" | "secondary";

export function Button({
  variant = "primary",
  fullWidth = false,
  icon,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      className={clsx(
        "ui-button",
        variant === "primary" ? "ui-button--primary" : "ui-button--secondary",
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
