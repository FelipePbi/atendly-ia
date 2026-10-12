"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import {
  type AgendaInitialView,
  BffHttpError,
  type ReminderSettings,
  type SettingsState,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import {
  availabilityGridSummary,
  changePolicySummary,
  INITIAL_VIEW_OPTIONS,
  initialViewSummary,
  offerRulesSummary,
  remindersSummary,
  visibleDaysSummary,
  WEEK_ORDER,
} from "./agendaSummaries";
import { SaveActions } from "./shared/fields";
import { weekdayLabels } from "./shared/labels";
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

type ViewSheet = "days" | "view";

function AgendaRow({
  detail,
  href,
  onClick,
  title,
}: {
  detail: string | null;
  href?: string;
  onClick?: () => void;
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
  return href ? (
    <Link className="agenda-row" href={href}>
      {content}
    </Link>
  ) : (
    <button className="agenda-row" type="button" onClick={onClick}>
      {content}
    </button>
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

  const [hiddenDays, setHiddenDays] = useState<Set<number>>(new Set());
  const [initialView, setInitialView] = useState<AgendaInitialView | null>(
    null,
  );
  const [viewReading, setViewReading] = useState(true);
  const [viewReadError, setViewReadError] = useState(false);
  const [reminders, setReminders] = useState<ReminderSettings | null>(null);

  const [sheet, setSheet] = useState<ViewSheet | null>(null);
  const [draftHiddenDays, setDraftHiddenDays] = useState<Set<number>>(
    new Set(),
  );
  const [draftInitialView, setDraftInitialView] =
    useState<AgendaInitialView | null>(null);
  const [viewBusy, setViewBusy] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const services = getProductServices();
    services.settings
      .getAgendaViewPreference(controller.signal)
      .then((preference) => {
        setHiddenDays(new Set(preference.hiddenWeekdays));
        setInitialView(preference.initialView);
        setViewReading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setViewReadError(true);
        setViewReading(false);
      });
    services.settings
      .getReminders(controller.signal)
      .then(setReminders)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const viewReady = !viewReading && !viewReadError;

  function openSheet(next: ViewSheet) {
    setDraftHiddenDays(new Set(hiddenDays));
    setDraftInitialView(initialView);
    setSheetMessage(null);
    setSavedMessage(null);
    setSheet(next);
  }

  function closeSheet() {
    if (viewBusy) return;
    setSheet(null);
  }

  function toggleHiddenDay(day: number) {
    setDraftHiddenDays((current) => {
      if (!current.has(day) && current.size >= 6) return current;
      const next = new Set(current);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  async function saveAgendaView() {
    if (!viewReady || !sheet) return;
    setViewBusy(true);
    setSheetMessage(null);
    try {
      const preference =
        await getProductServices().settings.updateAgendaViewPreference({
          hiddenWeekdays:
            sheet === "days"
              ? [...draftHiddenDays].sort((a, b) => a - b)
              : [...hiddenDays].sort((a, b) => a - b),
          initialView: sheet === "view" ? draftInitialView : initialView,
        });
      setHiddenDays(new Set(preference.hiddenWeekdays));
      setInitialView(preference.initialView);
      setSavedMessage("Preferências da Agenda salvas.");
      setSheet(null);
    } catch (error) {
      setSheetMessage(
        hiddenWeekdaysLimitReason(error) ??
          "Não foi possível salvar as preferências da Agenda.",
      );
    } finally {
      setViewBusy(false);
    }
  }

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
        <AgendaGroup title="Como você vê a Agenda">
          <AgendaRow
            detail={viewReady ? visibleDaysSummary(hiddenDays) : null}
            title="Dias visíveis"
            onClick={() => openSheet("days")}
          />
          <AgendaRow
            detail={viewReady ? initialViewSummary(initialView) : null}
            title="Visualização inicial"
            onClick={() => openSheet("view")}
          />
          <p className="agenda-note">
            <Icon name="info" />
            <span>
              Ocultar um dia só muda o que você vê. Para não atender em um dia,
              ajuste em{" "}
              {availabilityRoute ? (
                <Link href="/configuracoes/disponibilidade">
                  Dias e horários
                </Link>
              ) : (
                <strong>Dias e horários</strong>
              )}
              .
            </span>
          </p>
          {savedMessage && (
            <p className="field-help" role="status">
              {savedMessage}
            </p>
          )}
        </AgendaGroup>
      </div>
      <Dialog
        onClose={closeSheet}
        open={sheet !== null}
        title={sheet === "days" ? "Dias visíveis" : "Visualização inicial"}
        variant="sheet"
      >
        {viewReadError && (
          <p className="field-help" role="alert">
            Não foi possível carregar as preferências da Agenda agora. Atualize
            a página e tente de novo.
          </p>
        )}
        {sheet === "days" && (
          <div className="field is-wide">
            <span className="label">Dias visíveis</span>
            <div className="chip-row">
              {WEEK_ORDER.map((day) => {
                const visible = !draftHiddenDays.has(day);
                const isLastVisibleDay = visible && draftHiddenDays.size >= 6;
                return (
                  <button
                    aria-pressed={visible}
                    className={`chip${visible ? " is-active" : ""}`}
                    disabled={isLastVisibleDay}
                    key={day}
                    type="button"
                    onClick={() => toggleHiddenDay(day)}
                  >
                    {weekdayLabels[day]}
                  </button>
                );
              })}
            </div>
            {draftHiddenDays.size >= 6 && (
              <p className="field-help">{HIDDEN_WEEKDAYS_LIMIT_REASON}</p>
            )}
          </div>
        )}
        {sheet === "view" && (
          <div className="field is-wide">
            <span className="label">Visualização inicial</span>
            <div className="chip-row">
              {INITIAL_VIEW_OPTIONS.map((option) => (
                <button
                  aria-pressed={draftInitialView === option.value}
                  className={`chip${draftInitialView === option.value ? " is-active" : ""}`}
                  key={String(option.value)}
                  type="button"
                  onClick={() => setDraftInitialView(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <SaveActions
          busy={viewBusy}
          disabled={!viewReady}
          label="Salvar"
          message={sheetMessage}
          onClick={() => void saveAgendaView()}
        />
      </Dialog>
    </SettingsPage>
  );
}
