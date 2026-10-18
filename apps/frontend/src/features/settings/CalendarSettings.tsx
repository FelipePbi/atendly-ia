"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import {
  BffHttpError,
  type ReminderSettings,
  type SettingsState,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import {
  availabilityGridSummary,
  changePolicySummary,
  offerRulesSummary,
  remindersSummary,
} from "./agendaSummaries";
import { SettingsPage } from "./shared/SettingsPage";

export const HIDDEN_WEEKDAYS_LIMIT_REASON =
  "Pelo menos um dia precisa aparecer na Agenda.";

/**
 * O servidor recusa `hiddenWeekdays` com sete dias pelo mesmo motivo do
 * limite do cliente (Goal073, `agendaHiddenWeekdaysSchema.max(6)`); detecta
 * essa recusa específica para mostrar a mesma frase, não a genérica.
 */
export function hiddenWeekdaysLimitReason(error: unknown): string | null {
  if (!(error instanceof BffHttpError) || error.code !== "VALIDATION_ERROR") {
    return null;
  }
  const details = error.details as
    { fieldErrors?: Record<string, unknown> } | undefined;
  return details?.fieldErrors?.hiddenWeekdays
    ? HIDDEN_WEEKDAYS_LIMIT_REASON
    : null;
}

function AgendaRow({
  detail,
  href,
  title,
}: {
  detail: string | null;
  href: string;
  title: string;
}) {
  const content = (
    <>
      <span className="agenda-row-copy">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </span>
      <Icon className="agenda-row-chevron" name="chevron-right" />
    </>
  );
  return (
    <Link className="agenda-row" href={href}>
      {content}
    </Link>
  );
}

function AgendaGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="agenda-group">
      <h2 className="agenda-group-title">{title}</h2>
      {children}
    </section>
  );
}

export function CalendarSettings({ settings }: { settings: SettingsState }) {
  const availability = settings.availability;
  const availabilityRoute = settings.calendar.source === "AVENLY";
  const [reminders, setReminders] = useState<ReminderSettings | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .settings.getReminders(controller.signal)
      .then(setReminders)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <SettingsPage
      title="Agenda"
      description="Defina como a IA oferece horários e configure lembretes."
    >
      <div className="agenda-list">
        {availabilityRoute && (
          <AgendaGroup title="Quando você atende">
            <AgendaRow
              detail={
                availability
                  ? availabilityGridSummary(availability.rules)
                  : null
              }
              href="/configuracoes/disponibilidade"
              title="Dias e horários"
            />
            {/* Disponibilidade extra por data (D-169): abre horário fora
                do de sempre, não é bloqueio, por isso fica aqui e não no
                "+ Novo" da Agenda. */}
            <AgendaRow
              detail="Atender numa data fora do horário de sempre"
              href="/agenda/excecoes"
              title="Horário extra"
            />
          </AgendaGroup>
        )}
        <AgendaGroup title="Como a IA oferece horários">
          <AgendaRow
            detail={availability ? offerRulesSummary(availability) : null}
            href="/configuracoes/agenda/regras"
            title="Antecedência e intervalos"
          />
          <AgendaRow
            detail={
              availability
                ? changePolicySummary(
                    availability.customerChangeMinNoticeMinutes,
                  )
                : null
            }
            href="/configuracoes/agenda/regras"
            title="Cancelamento e remarcação"
          />
          <AgendaRow
            detail={reminders ? remindersSummary(reminders) : null}
            href="/configuracoes/agenda/lembretes"
            title="Lembretes"
          />
        </AgendaGroup>
      </div>
    </SettingsPage>
  );
}
