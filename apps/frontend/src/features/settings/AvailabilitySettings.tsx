"use client";

import { useMemo, useState } from "react";

import type { SettingsState } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { TimeField } from "@/shared/ui/pickers/PickerFields";

import { SaveActions } from "./shared/fields";
import { weekdayLabels } from "./shared/labels";
import { SettingsPage } from "./shared/SettingsPage";

type AvailabilityRule = NonNullable<
  SettingsState["availability"]
>["rules"][number];

type Interval = { startTime: string; endTime: string };
type DayIntervals = Record<number, Interval[]>;

const MAX_RULES = 28;

// A semana começa na segunda na tela (mesma ordem do onboarding); o valor
// gravado de `dayOfWeek` continua 0=domingo…6=sábado.
const weekOrder = [1, 2, 3, 4, 5, 6, 0];

function buildDayIntervals(rules: AvailabilityRule[]): DayIntervals {
  const byDay: DayIntervals = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };
  for (const rule of rules) {
    if (!rule.active) continue;
    byDay[rule.dayOfWeek] = [
      ...byDay[rule.dayOfWeek],
      { startTime: rule.startTime, endTime: rule.endTime },
    ].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return byDay;
}

/** `null` quando o dia está válido; senão, a mensagem a mostrar naquele dia. */
function dayError(intervals: Interval[]): string | null {
  const sorted = [...intervals].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  for (const interval of sorted) {
    if (interval.startTime >= interval.endTime) {
      return "O horário final deve ser depois do horário inicial.";
    }
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startTime < sorted[index - 1].endTime) {
      return "Os intervalos não podem se sobrepor.";
    }
  }
  return null;
}

function DayRow({
  day,
  intervals,
  error,
  atLimit,
  onAddInterval,
  onRemoveInterval,
  onToggleDay,
  onChangeInterval,
}: {
  day: number;
  intervals: Interval[];
  error: string | null;
  atLimit: boolean;
  onAddInterval: () => void;
  onRemoveInterval: (index: number) => void;
  onToggleDay: (active: boolean) => void;
  onChangeInterval: (
    index: number,
    field: "startTime" | "endTime",
    value: string,
  ) => void;
}) {
  const active = intervals.length > 0;
  return (
    <div className={`availability-row${active ? "" : " is-off"}`}>
      <div className="availability-day">
        <label className="check">
          <input
            aria-label={weekdayLabels[day]}
            checked={active}
            type="checkbox"
            onChange={(event) => onToggleDay(event.target.checked)}
          />
          <span aria-hidden="true" className="check-box" />
        </label>
        <span>{weekdayLabels[day]}</span>
      </div>
      <div className="availability-periods">
        {active ? (
          intervals.map((interval, index) => (
            <span className="availability-period" key={index}>
              <TimeField
                aria-label={`${weekdayLabels[day]} · início do intervalo ${index + 1}`}
                value={interval.startTime}
                onValueChange={(value) =>
                  onChangeInterval(index, "startTime", value)
                }
              />
              <span aria-hidden="true">–</span>
              <TimeField
                aria-label={`${weekdayLabels[day]} · fim do intervalo ${index + 1}`}
                value={interval.endTime}
                onValueChange={(value) =>
                  onChangeInterval(index, "endTime", value)
                }
              />
              {intervals.length > 1 && (
                <button
                  aria-label={`Remover intervalo ${index + 1} de ${weekdayLabels[day]}`}
                  className="availability-period-remove"
                  type="button"
                  onClick={() => onRemoveInterval(index)}
                >
                  <Icon name="x" />
                </button>
              )}
            </span>
          ))
        ) : (
          <span className="availability-period">Sem atendimento</span>
        )}
        {error && (
          <span className="availability-period-error" role="alert">
            {error}
          </span>
        )}
      </div>
      {active && (
        <button
          className="btn btn-secondary"
          disabled={atLimit}
          type="button"
          onClick={onAddInterval}
        >
          Adicionar intervalo
        </button>
      )}
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
  const [dayIntervals, setDayIntervals] = useState<DayIntervals>(() =>
    buildDayIntervals(initialRules),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const totalRules = useMemo(
    () =>
      Object.values(dayIntervals).reduce((sum, list) => sum + list.length, 0) +
      inactiveRules.length,
    [dayIntervals, inactiveRules],
  );
  const errors = useMemo(() => {
    const byDay: Record<number, string | null> = {};
    for (const day of weekOrder) byDay[day] = dayError(dayIntervals[day]);
    return byDay;
  }, [dayIntervals]);

  function setDay(day: number, intervals: Interval[]) {
    setDayIntervals((current) => ({ ...current, [day]: intervals }));
  }

  function toggleDay(day: number, active: boolean) {
    if (active && totalRules >= MAX_RULES) {
      setMessage(
        `Você já tem ${MAX_RULES} intervalos na Disponibilidade. Remova um intervalo para ligar este dia.`,
      );
      return;
    }
    setDay(day, active ? [{ startTime: "09:00", endTime: "18:00" }] : []);
  }

  function addInterval(day: number) {
    if (totalRules >= MAX_RULES) return;
    setDay(day, [
      ...dayIntervals[day],
      { startTime: "09:00", endTime: "18:00" },
    ]);
  }

  function removeInterval(day: number, index: number) {
    setDay(
      day,
      dayIntervals[day].filter((_, item) => item !== index),
    );
  }

  function changeInterval(
    day: number,
    index: number,
    field: "startTime" | "endTime",
    value: string,
  ) {
    setDay(
      day,
      dayIntervals[day].map((interval, item) =>
        item === index ? { ...interval, [field]: value } : interval,
      ),
    );
  }

  async function save() {
    const invalidDay = weekOrder.find((day) => errors[day]);
    if (invalidDay !== undefined) {
      setMessage(`${weekdayLabels[invalidDay]}: ${errors[invalidDay]}`);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const activeRules = weekOrder.flatMap((day) =>
        dayIntervals[day].map((interval) => ({
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
      <section className="settings-panel">
        <div className="availability-list">
          {weekOrder.map((day) => (
            <DayRow
              atLimit={totalRules >= MAX_RULES}
              day={day}
              error={errors[day]}
              intervals={dayIntervals[day]}
              key={day}
              onAddInterval={() => addInterval(day)}
              onChangeInterval={(index, field, value) =>
                changeInterval(day, index, field, value)
              }
              onRemoveInterval={(index) => removeInterval(day, index)}
              onToggleDay={(active) => toggleDay(day, active)}
            />
          ))}
        </div>
        <SaveActions
          busy={busy}
          message={message}
          onClick={() => void save()}
        />
      </section>
    </SettingsPage>
  );
}
