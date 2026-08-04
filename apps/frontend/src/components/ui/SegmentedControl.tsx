import type { ReactNode } from "react";
import { clsx } from "clsx";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={clsx("ui-segmented", className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          className="ui-segmented__item"
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
