import type { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

type SelectionBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  title: string;
  description: string;
  selected: boolean;
};

export function RadioCard({ title, description, selected, className, ...props }: SelectionBaseProps) {
  return (
    <button className={clsx("ui-radio-card", className)} type="button" aria-pressed={selected} {...props}>
      <span className="ui-radio-card__indicator" aria-hidden="true">
        {selected ? "✓" : null}
      </span>
      <span>
        <span className="ui-radio-card__title">{title}</span>
        <span className="ui-radio-card__description">{description}</span>
      </span>
    </button>
  );
}

export function ChoiceCard({
  title,
  description,
  selected,
  icon,
  className,
  ...props
}: SelectionBaseProps & { icon: ReactNode }) {
  return (
    <button className={clsx("ui-choice-card", className)} type="button" aria-pressed={selected} {...props}>
      <span className="ui-choice-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="ui-choice-card__title">{title}</span>
        <span className="ui-choice-card__description">{description}</span>
      </span>
      {selected ? (
        <span className="ui-choice-card__check" aria-hidden="true">
          ✓
        </span>
      ) : null}
    </button>
  );
}

export function ChoiceGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="ui-choice-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}
