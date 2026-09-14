import clsx from "clsx";
import { type InputHTMLAttributes, useId } from "react";

import { Icon, type IconName } from "@/shared/icons/Icon";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  help?: string;
  error?: string;
  icon?: IconName;
};

export function Field({
  label,
  help,
  error,
  icon,
  className,
  ...inputProps
}: FieldProps) {
  const inputId = useId();
  const helpId = useId();
  const describedBy = error || help ? helpId : undefined;

  return (
    <div className={clsx("field", error && "field-error", className)}>
      <label className="label" htmlFor={inputId}>
        {label}
      </label>
      <div className="input-wrap">
        {icon && (
          <span className="field-icon" aria-hidden="true">
            <Icon name={icon} />
          </span>
        )}
        <input
          {...inputProps}
          id={inputId}
          className={clsx("input", icon && "input-with-icon")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      </div>
      {(error || help) && (
        <p className="field-help" id={helpId} role={error ? "alert" : undefined}>
          {error ?? help}
        </p>
      )}
    </div>
  );
}
