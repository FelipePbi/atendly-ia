import Image from "next/image";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="mb-8">
          <Image
            className="mb-6 h-12 w-auto"
            src="/brand/atendly-logo-horizontal.png"
            alt="Atendly"
            width={190}
            height={81}
            priority
          />
          <h1 className="text-2xl font-bold tracking-normal text-foreground">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>
        </div>
        {children}
        <div className="mt-6 border-t border-border pt-5 text-center text-sm text-muted">{footer}</div>
      </section>
    </main>
  );
}
