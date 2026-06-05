"use client";

import { CalendarDays, Mail } from "lucide-react";
import { useDashboard } from "@/components/layout/DashboardContext";
import { PasswordChangeForm } from "@/components/settings/PasswordChangeForm";
import { formatDate } from "@/lib/format";

export function AccountSettings() {
  const { user } = useDashboard();

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(340px,1fr)]">
      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-brand" aria-hidden="true" />
          <h1 className="text-xl font-black text-foreground">Conta</h1>
        </div>

        <div className="mt-5 space-y-4 text-sm">
          <div>
            <p className="text-muted">Email do usuario</p>
            <p className="mt-1 break-all text-base font-bold text-foreground">{user.email}</p>
          </div>

          <div>
            <p className="text-muted">Criada em</p>
            <p className="mt-1 inline-flex items-center gap-2 text-base font-bold text-foreground">
              <CalendarDays className="h-4 w-4 text-brand" aria-hidden="true" />
              {formatDate(user.createdAt) || "Nao informado"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <PasswordChangeForm />
      </section>
    </div>
  );
}
