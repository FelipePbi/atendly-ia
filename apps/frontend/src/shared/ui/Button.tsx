import clsx from "clsx";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
type CommonProps = {
  children: ReactNode;
  className?: string;
  loading?: boolean;
  variant?: ButtonVariant;
};
type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };
type LinkButtonProps = CommonProps & { href: string; ariaLabel?: string };

export function Button(props: ButtonProps | LinkButtonProps) {
  const className = clsx(
    "btn",
    `btn-${props.variant ?? "primary"}`,
    props.className,
    { "btn-loading": props.loading },
  );
  if (typeof (props as LinkButtonProps).href === "string") {
    const linkProps = props as LinkButtonProps;
    return (
      <Link
        className={className}
        href={linkProps.href}
        aria-label={linkProps.ariaLabel}
      >
        {linkProps.children}
      </Link>
    );
  }
  const {
    children,
    loading,
    variant: _variant,
    ...buttonProps
  } = props as ButtonProps;
  void _variant;
  return (
    <button
      {...buttonProps}
      className={className}
      aria-busy={loading || undefined}
      disabled={buttonProps.disabled || loading}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
