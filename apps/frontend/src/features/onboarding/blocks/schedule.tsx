import { useEffect, useId, useRef, useState } from "react";

import type { Service } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { CurrencyInput } from "@/shared/ui/CurrencyInput";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import {
  applyInlineValidation,
  type OnboardingStepContext,
  Summary,
} from "./shared";

const weekdayLabels = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const weekdayShortLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// A semana começa na segunda (vault §"Dias e horários"); os valores de
// `dayOfWeek` gravados continuam 0=domingo…6=sábado (Goal065/WU-03), só a
// ordem de exibição muda.
const weekOrder = [1, 2, 3, 4, 5, 6, 0];

type PriceType = OnboardingDraft["servicePriceType"];

const priceTypeOptions: Array<{ value: PriceType; label: string }> = [
  { value: "FIXED", label: "Fixo" },
  { value: "STARTING_AT", label: "A partir de" },
  { value: "ON_REQUEST", label: "Sob consulta" },
  { value: "NOT_INFORMED", label: "Sem preço" },
];

function priceRequiresValue(priceType: PriceType): boolean {
  return priceType === "FIXED" || priceType === "STARTING_AT";
}

function formatPrice(
  priceType: PriceType,
  price: string | number | null,
): string {
  if (!priceRequiresValue(priceType)) {
    return priceType === "ON_REQUEST" ? "Sob consulta" : "Sem preço informado";
  }
  const value =
    typeof price === "number" ? price : Number(String(price ?? "").replace(",", "."));
  return Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "";
}

const DURATION_STEP_MESSAGE = "A duração vai de 5 em 5 minutos.";
const DURATION_SHORTCUTS = [30, 60, 90];
const MINUTES_PER_DAY = 1440;

function priceToCents(price: string): number | undefined {
  if (price.trim() === "") return undefined;
  const value = Number(price.replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : undefined;
}

function centsToPrice(cents: number | null): string {
  return cents === null ? "" : String(cents / 100);
}

function timeToMinutes(time: string): number | null {
  const [hours, minutes] = time.split(":").map(Number);
  if (hours === undefined || minutes === undefined) return null;
  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours * 60 + minutes
    : null;
}

function summarizeDays(days: number[]): string {
  const selected = weekOrder.filter((day) => days.includes(day));
  const count = selected.length;
  const first = selected[0];
  if (first === undefined) return "";
  const names = selected.map((day) => (weekdayLabels[day] ?? "").toLowerCase());
  const positions = selected.map((day) => weekOrder.indexOf(day));
  const consecutive = positions.every(
    (position, index) => index === 0 || position === (positions[index - 1] ?? 0) + 1,
  );
  let head: string;
  if (count === 1) head = `Só ${names[0]}`;
  else if (consecutive && count >= 3)
    head = `${weekdayLabels[first]} a ${names[count - 1]}`;
  else {
    const list = `${names.slice(0, -1).join(", ")} e ${names[count - 1]}`;
    head = list.charAt(0).toUpperCase() + list.slice(1);
  }
  return `${head} · ${count} ${count === 1 ? "dia" : "dias"} por semana`;
}

const DAYS_REQUIRED_MESSAGE = "Escolha pelo menos um dia de atendimento.";
const END_BEFORE_START_MESSAGE =
  "O horário final deve ser depois do horário inicial.";

/** O intervalo de um dia: cada campo (início, fim) usa o valor personalizado
 * daquele dia quando existe, e o intervalo-base quando não. Os dois campos
 * são decididos de forma independente, então personalizar só o início não
 * congela o fim — ele continua acompanhando o intervalo-base até ganhar sua
 * própria personalização (Goal066, observação 5 do review065). */
function dayHourOf(
  draft: OnboardingDraft,
  day: number,
): { startTime: string; endTime: string } {
  const override = draft.dayHours[day];
  return {
    endTime: override?.endTime ?? draft.endTime,
    startTime: override?.startTime ?? draft.startTime,
  };
}

/** Início e fim de um intervalo, com o erro de "fim antes do início" no
 * campo final (QA O-33), via `setCustomValidity` lido por
 * `applyInlineValidation`. */
function TimeRangeFields({
  endLabel,
  endTime,
  onChangeEnd,
  onChangeStart,
  showRange = false,
  startLabel,
  startTime,
}: {
  endLabel: string;
  endTime: string;
  onChangeEnd: (value: string) => void;
  onChangeStart: (value: string) => void;
  showRange?: boolean;
  startLabel: string;
  startTime: string;
}) {
  const startId = useId();
  const endId = useId();
  const endRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    endRef.current?.setCustomValidity(
      startTime !== "" && endTime !== "" && endTime <= startTime
        ? END_BEFORE_START_MESSAGE
        : "",
    );
  }, [endTime, startTime]);
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  // Cada campo num `div.field` com <label for>: a mensagem de erro entra
  // logo depois do campo, dentro da mesma célula da grade.
  return (
    <div className="time-range">
      <div className="choice-grid">
      <div className="field">
        <label className="label" htmlFor={startId}>
          {startLabel}
        </label>
        <input
          className="input time-input"
          data-server-field="availability.startTime"
          id={startId}
          required
          type="time"
          value={startTime}
          onChange={(event) => onChangeStart(event.target.value)}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={endId}>
          {endLabel}
        </label>
        <input
          className="input time-input"
          data-server-field="availability.endTime"
          id={endId}
          ref={endRef}
          required
          type="time"
          value={endTime}
          onChange={(event) => onChangeEnd(event.target.value)}
        />
      </div>
      </div>
      {showRange && startTime !== "" && endTime !== "" && (
        <div className="hours-range">
          <p className="hours-range-text">
            Das {startTime} às {endTime}
          </p>
          <span aria-hidden="true" className="hours-bar">
            <span className="hours-bar-track">
              {startMinutes !== null &&
                endMinutes !== null &&
                endMinutes > startMinutes && (
                  <span
                    className="hours-bar-fill"
                    style={{
                      left: `${(startMinutes / MINUTES_PER_DAY) * 100}%`,
                      width: `${((endMinutes - startMinutes) / MINUTES_PER_DAY) * 100}%`,
                    }}
                  />
                )}
            </span>
            <span className="hours-bar-scale">
              <span>0 h</span>
              <span>24 h</span>
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function summarizeHours(draft: OnboardingDraft): string {
  const selectedDays = weekOrder.filter((day) => draft.days.includes(day));
  const perDay = selectedDays.map((day) => dayHourOf(draft, day));
  const first = perDay[0];
  const uniform =
    first !== undefined &&
    perDay.every(
      (hours) => hours.startTime === first.startTime && hours.endTime === first.endTime,
    );
  if (uniform && first) return `${first.startTime} às ${first.endTime}`;
  return selectedDays
    .map((day) => {
      const hours = dayHourOf(draft, day);
      return `${weekdayLabels[day]} ${hours.startTime}–${hours.endTime}`;
    })
    .join(", ");
}

function ServiceFields({
  duration,
  name,
  price,
  priceType,
  onChangeDuration,
  onChangeName,
  onChangePrice,
  onChangePriceType,
}: {
  duration: number;
  name: string;
  price: string;
  priceType: PriceType;
  onChangeDuration: (value: number) => void;
  onChangeName: (value: string) => void;
  onChangePrice: (value: string) => void;
  onChangePriceType: (value: PriceType) => void;
}) {
  const durationId = useId();
  const durationRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    durationRef.current?.setCustomValidity(
      Number.isFinite(duration) && duration % 5 !== 0
        ? DURATION_STEP_MESSAGE
        : "",
    );
  }, [duration]);
  return (
    <div className="onboarding-form">
      <label className="field">
        <span className="label">Nome do serviço</span>
        <input
          className="input"
          data-error-message="Informe o nome do serviço."
          data-server-field="service.name"
          required
          value={name}
          onChange={(event) => onChangeName(event.target.value)}
        />
      </label>
      <div className="field">
        <label className="label" htmlFor={durationId}>
          Duração em minutos
        </label>
        <span className="service-duration-control">
          <button
            aria-label="Diminuir duração"
            className="btn btn-tertiary service-duration-step"
            type="button"
            onClick={() => onChangeDuration(Math.max(5, duration - 5))}
          >
            −
          </button>
          <input
            className="input"
            data-error-message="Informe a duração em minutos."
            data-server-field="service.durationMinutes"
            id={durationId}
            max={1440}
            min={5}
            ref={durationRef}
            required
            step={5}
            type="number"
            value={duration}
            onChange={(event) => onChangeDuration(Number(event.target.value))}
          />
          <button
            aria-label="Aumentar duração"
            className="btn btn-tertiary service-duration-step"
            type="button"
            onClick={() => onChangeDuration(Math.min(1440, duration + 5))}
          >
            +
          </button>
          <span aria-hidden="true" className="service-duration-unit">
            min
          </span>
        </span>
        <span
          aria-label="Atalhos de duração"
          className="service-duration-shortcuts"
          role="group"
        >
          {DURATION_SHORTCUTS.map((minutes) => (
            <button
              aria-pressed={duration === minutes}
              className="btn btn-tertiary service-duration-shortcut"
              key={minutes}
              type="button"
              onClick={() => onChangeDuration(minutes)}
            >
              {minutes}
            </button>
          ))}
        </span>
      </div>
      <div className="field">
        <span className="label">Preço</span>
        <div className="chip-row price-chip-row">
          {priceTypeOptions.map((option) => {
            const pressed = priceType === option.value;
            return (
              <button
                aria-pressed={pressed}
                className={`chip${pressed ? " is-active" : ""}`}
                key={option.value}
                type="button"
                onClick={() => onChangePriceType(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      {priceRequiresValue(priceType) && (
        <label className="field">
          <span className="label">
            {priceType === "STARTING_AT" ? "Valor inicial em reais" : "Preço em reais"}
          </span>
          <CurrencyInput
            className="input"
            data-error-message="Informe o valor do serviço."
            data-server-field="service.price"
            defaultValueCents={priceToCents(price)}
            key={priceType}
            placeholder="R$ 0,00"
            required
            onValueChange={(cents) => onChangePrice(centsToPrice(cents))}
          />
        </label>
      )}
    </div>
  );
}

function AdditionalServicesStepBody({ draft }: { draft: OnboardingDraft }) {
  const [items, setItems] = useState<Service[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(60);
  const [priceType, setPriceType] = useState<PriceType>("FIXED");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  // O formulário de adicional valida só ao "Adicionar": o "Continuar" da
  // etapa não o confere (`data-validation-scope`) e segue sem adicional.
  const formScopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getProductServices()
      .serviceCatalog.list()
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar seus serviços.");
      });
    return () => {
      active = false;
    };
  }, []);

  const additional = (items ?? []).filter(
    (item) => item.active && item.id !== draft.serviceId,
  );

  async function addService() {
    setError(null);
    if (formScopeRef.current && !applyInlineValidation(formScopeRef.current)) {
      return;
    }
    setBusy(true);
    try {
      const created = await getProductServices().serviceCatalog.create({
        active: true,
        durationMinutes: duration,
        name,
        price: priceRequiresValue(priceType)
          ? Number(price.replace(",", "."))
          : null,
        priceType,
      });
      setItems((current) => (current ? [...current, created] : [created]));
      setName("");
      setDuration(60);
      setPriceType("FIXED");
      setPrice("");
      setFormOpen(false);
    } catch {
      setError("Não foi possível adicionar este serviço.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-form">
      {additional.length > 0 && (
        <div className="service-summary">
          {additional.map((item) => (
            <div className="summary-row" key={item.id}>
              <span>{item.name}</span>
              <strong>
                {item.durationMinutes
                  ? `${item.durationMinutes} min`
                  : "Duração pendente"}{" "}
                · {formatPrice(item.priceType, item.price)}
              </strong>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="onboarding-note is-important" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}
      {formOpen ? (
        <div data-validation-scope="" ref={formScopeRef}>
          <ServiceFields
            duration={duration}
            name={name}
            price={price}
            priceType={priceType}
            onChangeDuration={setDuration}
            onChangeName={setName}
            onChangePrice={setPrice}
            onChangePriceType={setPriceType}
          />
          <div className="onboarding-actions is-single">
            <button
              className="btn btn-secondary"
              disabled={busy}
              type="button"
              onClick={() => setFormOpen(false)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              type="button"
              onClick={() => void addService()}
            >
              {busy ? "Adicionando..." : "Adicionar"}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => setFormOpen(true)}
        >
          Adicionar outro serviço
        </button>
      )}
    </div>
  );
}

function HoursStepBody({
  draft,
  setDraft,
}: {
  draft: OnboardingDraft;
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void;
}) {
  const hasCustomHours = draft.days.some((day) => draft.dayHours[day]);
  const [customized, setCustomized] = useState(hasCustomHours);

  function setDayHour(day: number, field: "startTime" | "endTime", value: string) {
    setDraft((current) => {
      const dayHours = { ...current.dayHours };
      const override = { ...dayHours[day] };
      // Igual ao intervalo-base não é personalização daquele campo: ele
      // volta a acompanhar o intervalo-base, mesmo que o outro campo do
      // mesmo dia continue personalizado.
      if (value === current[field]) {
        delete override[field];
      } else {
        override[field] = value;
      }
      if (Object.keys(override).length === 0) delete dayHours[day];
      else dayHours[day] = override;
      return { ...current, dayHours };
    });
  }

  function toggleCustomized() {
    // Fechar a personalização volta todos os dias ao intervalo-base: o que
    // se grava é o que está na tela.
    if (customized) setDraft((current) => ({ ...current, dayHours: {} }));
    setCustomized(!customized);
  }

  return (
    <div className="onboarding-form">
      <TimeRangeFields
        endLabel="Fim"
        endTime={draft.endTime}
        showRange
        startLabel="Início"
        startTime={draft.startTime}
        onChangeEnd={(value) =>
          setDraft((current) => ({ ...current, endTime: value }))
        }
        onChangeStart={(value) =>
          setDraft((current) => ({ ...current, startTime: value }))
        }
      />
      <button
        aria-expanded={customized}
        className="btn btn-secondary"
        type="button"
        onClick={toggleCustomized}
      >
        Personalizar dias diferentes
      </button>
      {customized && (
        <div className="onboarding-form">
          {weekOrder
            .filter((day) => draft.days.includes(day))
            .map((day) => {
              const hours = dayHourOf(draft, day);
              return (
                <TimeRangeFields
                  endLabel={`${weekdayLabels[day]} · Fim`}
                  endTime={hours.endTime}
                  key={day}
                  startLabel={`${weekdayLabels[day]} · Início`}
                  startTime={hours.startTime}
                  onChangeEnd={(value) => setDayHour(day, "endTime", value)}
                  onChangeStart={(value) => setDayHour(day, "startTime", value)}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}

export function scheduleStepBody(
  scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
) {
  if (scenario === "quando-importar")
    return (
      <div className="onboarding-note">
        <Icon name="info" />
        <span>Se fizer depois, a importação fica em Mais › Importação.</span>
      </div>
    );
  if (scenario === "servico-nome")
    return (
      <ServiceFields
        duration={draft.serviceDuration}
        name={draft.serviceName}
        price={draft.servicePrice}
        priceType={draft.servicePriceType}
        onChangeDuration={(value) =>
          setDraft((current) => ({ ...current, serviceDuration: value }))
        }
        onChangeName={(value) =>
          setDraft((current) => ({ ...current, serviceName: value }))
        }
        onChangePrice={(value) =>
          setDraft((current) => ({ ...current, servicePrice: value }))
        }
        onChangePriceType={(value) =>
          setDraft((current) => ({ ...current, servicePriceType: value }))
        }
      />
    );
  if (scenario === "servicos-adicionais")
    return <AdditionalServicesStepBody draft={draft} />;
  if (scenario === "dias-de-atendimento")
    return (
      <div className="onboarding-form">
        <div
          aria-label="Dias de atendimento"
          className="day-pill-row"
          data-group-error={draft.days.length === 0 ? DAYS_REQUIRED_MESSAGE : ""}
          data-validation-group=""
          role="group"
        >
          {weekOrder.map((day) => (
            <label
              className={`day-pill${draft.days.includes(day) ? " is-selected" : ""}`}
              key={day}
            >
              <input
                className="sr-only"
                checked={draft.days.includes(day)}
                type="checkbox"
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    days: event.target.checked
                      ? [...value.days, day].sort()
                      : value.days.filter((item) => item !== day),
                  }))
                }
              />
              <span aria-hidden="true">{weekdayShortLabels[day]}</span>
              <span className="sr-only">{weekdayLabels[day]}</span>
            </label>
          ))}
        </div>
        {draft.days.length > 0 && (
          <p aria-live="polite" className="days-summary">
            {summarizeDays(draft.days)}
          </p>
        )}
      </div>
    );
  if (scenario === "horarios")
    return <HoursStepBody draft={draft} setDraft={setDraft} />;
  return (
    <Summary
      rows={[
        ["Serviço", draft.serviceName],
        ["Duração", `${draft.serviceDuration} minutos`],
        ["Preço", formatPrice(draft.servicePriceType, draft.servicePrice)],
        [
          "Dias",
          weekOrder
            .filter((day) => draft.days.includes(day))
            .map((day) => weekdayLabels[day])
            .join(", "),
        ],
        ["Horário", summarizeHours(draft)],
      ]}
    />
  );
}

export async function persistScheduleStep(
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  const onboarding = getProductServices().onboarding;
  switch (scenario) {
    // Evidência 5 (`CALENDAR_SETTINGS_NOT_FOUND`): a importação só executa
    // com `calendarSettings` gravado, então "Importar agora" grava
    // `calendar.source` antes de seguir para a importação.
    case "quando-importar":
      await onboarding.update({
        calendar: { source: "ATENDLY", timezone: ctx.draft.timezone },
      });
      await ctx.refresh();
      ctx.go("importacao");
      return;
    case "servico-nome": {
      const requiresPrice = priceRequiresValue(ctx.draft.servicePriceType);
      const price = requiresPrice
        ? Number(ctx.draft.servicePrice.replace(",", "."))
        : null;
      // Os quatro tipos gravam e releem sem conversão: um serviço lido como
      // STARTING_AT continua STARTING_AT ao gravar (Goal065/WU-03).
      await onboarding.update({
        service: {
          active: true,
          durationMinutes: ctx.draft.serviceDuration,
          id: ctx.draft.serviceId,
          name: ctx.draft.serviceName,
          price,
          priceType: ctx.draft.servicePriceType,
        },
      });
      await ctx.refresh();
      ctx.go("servicos-adicionais");
      return;
    }
    case "servicos-adicionais":
      ctx.go("dias-de-atendimento");
      return;
    // "Nenhum dia" e "fim antes do início" são decididos no campo, por
    // `applyInlineValidation`, antes de chegar aqui.
    case "dias-de-atendimento":
      ctx.go("horarios");
      return;
    case "horarios": {
      await onboarding.update({
        availability: {
          timezone: ctx.draft.timezone,
          // Uma regra por dia com o intervalo daquele dia, personalizado ou
          // não (Goal065/WU-03) — nunca só o intervalo compartilhado.
          rules: ctx.draft.days.map((dayOfWeek) => {
            const hours = dayHourOf(ctx.draft, dayOfWeek);
            return {
              active: true,
              dayOfWeek,
              endTime: hours.endTime,
              startTime: hours.startTime,
            };
          }),
        },
      });
      await ctx.refresh();
      ctx.go("agenda-atendly-pronta");
      return;
    }
    case "agenda-atendly-pronta":
      ctx.go("demonstracao-da-ia");
      return;
    default:
      ctx.go("sistema-atual");
  }
}

/** "Não, começar do zero" (`sistema-atual`) e "Fazer depois"
 * (`quando-importar`) gravam a mesma coisa e seguem para o primeiro
 * serviço: a evidência 5 do Goal066 exige `calendarSettings` gravado antes
 * de qualquer execução de importação, então toda saída sem importar agora
 * também grava `calendar.source`, e quem sair antes de responder volta
 * para `sistema-atual` (calendar.source continua nulo). */
export async function skipImportAndGoToScratch(
  ctx: OnboardingStepContext,
): Promise<void> {
  await getProductServices().onboarding.update({
    calendar: { source: "ATENDLY", timezone: ctx.draft.timezone },
  });
  await ctx.refresh();
  ctx.go("servico-nome");
}
