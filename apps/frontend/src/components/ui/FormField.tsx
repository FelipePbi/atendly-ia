import type { InputHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

export function FormField({
  label,
  error,
  icon,
  className,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  error?: string;
  icon?: ReactNode;
  className?: string;
}) {
  const errorId = error && id ? `${id}-error` : undefined;

  return (
    <label className={clsx("ui-field-label", className)} htmlFor={id}>
      <span>{label}</span>
      <span className="ui-field-shell">
        {icon ? <span className="ui-field-icon">{icon}</span> : null}
        <input
          id={id}
          className={clsx("ui-field", icon && "ui-field--with-icon")}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          {...props}
        />
      </span>
      {error ? (
        <span className="ui-helper-error" id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
