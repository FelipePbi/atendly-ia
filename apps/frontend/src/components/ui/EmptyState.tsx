import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-muted text-brand">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}
