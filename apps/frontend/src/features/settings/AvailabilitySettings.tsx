"use client";

import { useId, useMemo, useState } from "react";

import type { SettingsState } from "@/data";
import {
  DayPills,
  daysHead,
  DaysSummary,
  HoursBar,
  HoursCopyButton,
  HoursDayRow,
  type HoursInterval,
  TimeRangeFields,
  timeToMinutes,
  weekdayLabels,
  weekOrder,
} from "@/features/availability/WeeklyHours";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { showToast } from "@/shared/ui/toastBus";

import { SaveActions } from "./shared/fields";
import { SettingsPage } from "./shared/SettingsPage";

type AvailabilityRule = NonNullable<
  SettingsState["availability"]
>["rules"][number];

type Pattern = HoursInterval[];

/** O horário da semana como o onboarding o mostra (D-187): os dias marcados,
 * o horário de sempre (`base`) e os dias com horário próprio (`own`). Um dia
 * marcado sem entrada em `own` segue o horário de sempre. */
type Week = {
  base: Pattern;
  days: number[];
  own: Partial<Record<number, Pattern>>;
};

const MAX_RULES = 28;
const DEFAULT_PATTERN: Pattern = [{ endTime: "18:00", startTime: "09:00" }];
const OVERLAP_MESSAGE = "Os intervalos não podem se sobrepor.";
const END_BEFORE_START_MESSAGE =
  "O horário final deve ser depois do horário inicial.";

function samePattern(a: Pattern, b: Pattern): boolean {
  return (
    a.length === b.length &&
    a.every(
      (interval, index) =>
        interval.startTime === b[index]?.startTime &&
        interval.endTime === b[index]?.endTime,
    )
  );
}

/** Lê a grade gravada: o horário de sempre é o padrão mais comum entre os
 * dias marcados (no empate, o do primeiro dia da semana); os outros dias
 * ganham horário próprio. */
function weekFromRules(rules: AvailabilityRule[]): Week {
  const byDay = new Map<number, Pattern>();
  for (const rule of rules) {
    if (!rule.active) continue;
    byDay.set(rule.dayOfWeek, [
      ...(byDay.get(rule.dayOfWeek) ?? []),
      { endTime: rule.endTime, startTime: rule.startTime },
    ]);
  }
  for (const [day, pattern] of byDay)
    byDay.set(
      day,
      [...pattern].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    );
  const days = weekOrder.filter((day) => byDay.has(day));
  let base: Pattern = DEFAULT_PATTERN;
  let bestCount = 0;
  for (const day of days) {
    const pattern = byDay.get(day) ?? [];
    const count = days.filter((other) =>
      samePattern(byDay.get(other) ?? [], pattern),
    ).length;
    if (count > bestCount) {
      base = pattern;
      bestCount = count;
    }
  }
  const own: Week["own"] = {};
  for (const day of days) {
    const pattern = byDay.get(day) ?? [];
    if (!samePattern(pattern, base)) own[day] = pattern;
  }
  return { base, days, own };
}

function patternOf(week: Week, day: number): Pattern {
  return week.own[day] ?? week.base;
}

function hasOwn(week: Week, day: number): boolean {
  return week.own[day] !== undefined;
}

/** `null` quando o padrão está válido; senão, a mensagem a mostrar. */
function patternError(pattern: Pattern): string | null {
  const sorted = [...pattern].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  for (const interval of sorted) {
    if (interval.startTime >= interval.endTime) return END_BEFORE_START_MESSAGE;
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if ((sorted[index]?.startTime ?? "") < (sorted[index - 1]?.endTime ?? ""))
      return OVERLAP_MESSAGE;
  }
  return null;
}

function toClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** O intervalo novo começa uma hora depois do fim do último e dura uma hora;
 * sem espaço no dia, volta ao horário padrão. */
function nextInterval(pattern: Pattern): HoursInterval {
  const lastEnd = timeToMinutes(pattern[pattern.length - 1]?.endTime ?? "");
  if (lastEnd !== null && lastEnd + 120 <= 23 * 60 + 59) {
    return { endTime: toClock(lastEnd + 120), startTime: toClock(lastEnd + 60) };
  }
  return { ...DEFAULT_PATTERN[0] };
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "Vale para segunda a sexta. Sábado tem horário próprio." */
function baseDescription(week: Week): string {
  if (week.days.length === 0)
    return "Marque os dias de atendimento para usar este horário.";
  const following = week.days.filter((day) => !hasOwn(week, day));
  const owning = week.days.filter((day) => hasOwn(week, day));
  const ownText =
    owning.length === 0
      ? ""
      : owning.length === 1
        ? ` ${weekdayLabels[owning[0]]} tem horário próprio.`
        : ` ${daysHead(owning)} têm horário próprio.`;
  if (following.length === 0)
    return "Todos os dias marcados têm horário próprio.";
  const head =
    following.length === 1
      ? (weekdayLabels[following[0]] ?? "").toLowerCase()
      : lowerFirst(daysHead(following));
  return `Vale para ${head}.${ownText}`;
}

/** Os intervalos de um padrão em campos, com "Remover" a partir do segundo e
 * "Adicionar intervalo" no fim. `hero` usa os cartões grandes do horário de
 * sempre (quadro 2.6); sem ele, os campos da linha do dia (quadro 2.7). */
function PatternFields({
  addDisabled,
  dayName,
  error,
  hero = false,
  pattern,
  onChange,
}: {
  addDisabled: boolean;
  dayName?: string;
  error: string | null;
  hero?: boolean;
  pattern: Pattern;
  onChange: (pattern: Pattern) => void;
}) {
  const many = pattern.length > 1;
  const labels = (index: number) => {
    if (hero) {
      const suffix = many ? ` (${index + 1}º)` : "";
      return { end: `Termina${suffix}`, start: `Começa${suffix}` };
    }
    const suffix = many ? ` do intervalo ${index + 1}` : "";
    return {
      end: `${dayName} · Fim${suffix}`,
      start: `${dayName} · Início${suffix}`,
    };
  };
  const owner = hero ? "do horário de sempre" : `de ${dayName}`;
  const change = (index: number, field: keyof HoursInterval, value: string) =>
    onChange(
      pattern.map((interval, item) =>
        item === index ? { ...interval, [field]: value } : interval,
      ),
    );
  return (
    <div className="availability-pattern">
      {pattern.map((interval, index) => {
        const label = labels(index);
        return (
          <div className="availability-interval" key={index}>
            <TimeRangeFields
              endLabel={label.end}
              endTime={interval.endTime}
              hero={hero}
              invalid={error !== null}
              showBar={false}
              startLabel={label.start}
              startTime={interval.startTime}
              onChangeEnd={(value) => change(index, "endTime", value)}
              onChangeStart={(value) => change(index, "startTime", value)}
            />
            {many && (
              <button
                aria-label={`Remover intervalo ${index + 1} ${owner}`}
                className="availability-remove"
                type="button"
                onClick={() =>
                  onChange(pattern.filter((_, item) => item !== index))
                }
              >
                <Icon name="x" />
                Remover
              </button>
            )}
          </div>
        );
      })}
      {error && (
        <p className="availability-error" role="alert">
          {error}
        </p>
      )}
      {hero && <HoursBar intervals={pattern} />}
      <button
        className="hours-copy availability-add"
        disabled={addDisabled}
        type="button"
        onClick={() => onChange([...pattern, nextInterval(pattern)])}
      >
        <Icon name="plus" />
        Adicionar intervalo
      </button>
    </div>
  );
}

export function AvailabilitySettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const initialRules = useMemo(
    () => settings.availability?.rules ?? [],
    [settings.availability],
  );
  // Regras inativas do último estado lido não têm UI própria aqui, mas
  // precisam voltar intactas no PATCH — a rota substitui a lista inteira
  // (deleteMany + createMany), então esquecê-las apagaria a desativação.
  const inactiveRules = useMemo(
    () => initialRules.filter((rule) => !rule.active),
    [initialRules],
  );
  const [week, setWeek] = useState<Week>(() => weekFromRules(initialRules));
  const [perDayOpen, setPerDayOpen] = useState(
    () => Object.keys(week.own).length > 0,
  );
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [lastAdjusted, setLastAdjusted] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const titleId = useId();
  const fieldsId = useId();
  const perDayId = useId();

  const countFor = (next: Week) =>
    next.days.reduce((sum, day) => sum + patternOf(next, day).length, 0) +
    inactiveRules.length;
  const totalRules = countFor(week);
  const following = week.days.filter((day) => !hasOwn(week, day)).length;
  const baseError = patternError(week.base);
  const ownErrors = useMemo(() => {
    const byDay: Record<number, string | null> = {};
    for (const day of weekOrder)
      byDay[day] = hasOwn(week, day) ? patternError(patternOf(week, day)) : null;
    return byDay;
  }, [week]);

  const differingDays = week.days.filter((day) => hasOwn(week, day));
  const copyDay =
    lastAdjusted !== null && differingDays.includes(lastAdjusted)
      ? lastAdjusted
      : differingDays[differingDays.length - 1];

  /** Aplica a mudança se ela couber nas 28 regras; senão, avisa. */
  function commit(next: Week, limitMessage: string): boolean {
    if (countFor(next) > MAX_RULES && countFor(next) > totalRules) {
      setMessage(limitMessage);
      return false;
    }
    setWeek(next);
    return true;
  }

  function toggleDay(day: number, selected: boolean) {
    const days = selected
      ? weekOrder.filter((item) => item === day || week.days.includes(item))
      : week.days.filter((item) => item !== day);
    commit(
      { ...week, days },
      `Você já tem ${MAX_RULES} intervalos na Disponibilidade. Remova um intervalo para ligar este dia.`,
    );
  }

  function changeBase(base: Pattern) {
    // Um dia cujo horário próprio ficou igual ao de sempre volta a segui-lo.
    const own: Week["own"] = {};
    for (const [day, pattern] of Object.entries(week.own))
      if (pattern && !samePattern(pattern, base)) own[Number(day)] = pattern;
    commit(
      { ...week, base, own },
      `Você já tem ${MAX_RULES} intervalos na Disponibilidade. Remova um intervalo antes de adicionar outro.`,
    );
  }

  function changeDay(day: number, pattern: Pattern) {
    setLastAdjusted(day);
    const own = { ...week.own };
    if (samePattern(pattern, week.base)) delete own[day];
    else own[day] = pattern;
    commit(
      { ...week, own },
      `Você já tem ${MAX_RULES} intervalos na Disponibilidade. Remova um intervalo antes de adicionar outro.`,
    );
  }

  function copyToOtherDays() {
    if (copyDay === undefined) return;
    // Como no onboarding: o horário do dia copiado vira o de sempre e nenhum
    // dia fica com horário próprio.
    const copied = commit(
      { ...week, base: patternOf(week, copyDay), own: {} },
      `Copiar este horário passaria de ${MAX_RULES} intervalos na Disponibilidade.`,
    );
    if (copied) setLastAdjusted(null);
  }

  async function save() {
    const invalidDay = week.days.find((day) =>
      patternError(patternOf(week, day)),
    );
    if (invalidDay !== undefined) {
      setMessage(
        `${weekdayLabels[invalidDay]}: ${patternError(patternOf(week, invalidDay))}`,
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const activeRules = week.days.flatMap((day) =>
        patternOf(week, day).map((interval) => ({
          active: true,
          dayOfWeek: day,
          startTime: interval.startTime,
          endTime: interval.endTime,
        })),
      );
      const preservedInactiveRules = inactiveRules.map((rule) => ({
        active: false,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
      }));
      const availability =
        await getProductServices().settings.updateAvailability({
          timezone: settings.business?.timezone ?? "America/Sao_Paulo",
          rules: [...activeRules, ...preservedInactiveRules],
        });
      onSaved({ ...settings, availability });
      setMessage("Disponibilidade salva.");
      showToast("Disponibilidade salva.");
    } catch {
      setMessage("Não foi possível salvar a disponibilidade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPage
      title="Disponibilidade"
      description="Defina os dias e os intervalos de atendimento da Agenda."
    >
      <div className="availability-screen">
        <section
          aria-labelledby={`${titleId}-days`}
          className="availability-section"
        >
          <h2 className="availability-title" id={`${titleId}-days`}>
            Em quais dias você atende?
          </h2>
          <DayPills days={week.days} onToggle={toggleDay} />
          <DaysSummary days={week.days} />
        </section>

        <section
          aria-labelledby={`${titleId}-hours`}
          className="availability-section"
        >
          <div className="availability-heading">
            <h2 className="availability-title" id={`${titleId}-hours`}>
              Qual é seu horário de atendimento?
            </h2>
            <p className="availability-lead">{baseDescription(week)}</p>
          </div>
          <PatternFields
            addDisabled={totalRules + following > MAX_RULES}
            error={baseError}
            hero
            pattern={week.base}
            onChange={changeBase}
          />
          <button
            aria-controls={perDayOpen ? perDayId : undefined}
            aria-describedby={`${titleId}-custom-hint`}
            aria-expanded={perDayOpen}
            aria-labelledby={`${titleId}-custom-title`}
            className="hours-custom"
            type="button"
            onClick={() => setPerDayOpen((open) => !open)}
          >
            <span className="hours-custom-text">
              <span
                className="hours-custom-title"
                id={`${titleId}-custom-title`}
              >
                Personalizar dias diferentes
              </span>
              <span
                className="hours-custom-hint"
                id={`${titleId}-custom-hint`}
              >
                Ex.: sábado até mais cedo
              </span>
            </span>
            <Icon name="chevron-right" />
          </button>
        </section>

        {perDayOpen && (
          <section
            aria-labelledby={`${titleId}-per-day`}
            className="availability-section"
            id={perDayId}
          >
            <div className="availability-heading">
              <h2 className="availability-title" id={`${titleId}-per-day`}>
                Horários por dia
              </h2>
              <p className="availability-lead">
                Toque em um horário para ajustar só aquele dia.
              </p>
            </div>
            <div className="hours-day-card">
              {weekOrder.map((day) => {
                const pattern = patternOf(week, day);
                const error = ownErrors[day] ?? null;
                return (
                  <HoursDayRow
                    day={day}
                    different={hasOwn(week, day)}
                    expanded={openDay === day || error !== null}
                    fieldsId={`${fieldsId}-${day}`}
                    intervals={pattern}
                    key={day}
                    off={!week.days.includes(day)}
                    onToggle={() => setOpenDay(openDay === day ? null : day)}
                  >
                    <PatternFields
                      addDisabled={totalRules >= MAX_RULES}
                      dayName={weekdayLabels[day]}
                      error={error}
                      pattern={pattern}
                      onChange={(next) => changeDay(day, next)}
                    />
                  </HoursDayRow>
                );
              })}
            </div>
            {copyDay !== undefined && (
              <HoursCopyButton day={copyDay} onClick={copyToOtherDays} />
            )}
          </section>
        )}

        <SaveActions
          busy={busy}
          message={message}
          onClick={() => void save()}
        />
      </div>
    </SettingsPage>
  );
}
