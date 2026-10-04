import { useEffect, useId, useRef, useState } from "react";

import type { Service } from "@/data";
import { ImportIllustration } from "@/features/imports/ImportIllustration";
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

type ListedService = {
  duration: number;
  key: string;
  name: string;
  price: string | number | null;
  priceType: PriceType;
};

/** Preço da linha de "Seus serviços": curto, e "sem preço informado" como
 * texto discreto (não é erro). */
function ListedPrice({
  price,
  priceType,
}: {
  price: string | number | null;
  priceType: PriceType;
}) {
  if (priceType === "NOT_INFORMED")
    return <span className="service-list-quiet">sem preço informado</span>;
  if (priceType === "ON_REQUEST") return <>sob consulta</>;
  const value =
    typeof price === "number" ? price : Number(String(price ?? "").replace(",", "."));
  if (!Number.isFinite(value)) return <>{formatPrice(priceType, price)}</>;
  const amount = value.toLocaleString("pt-BR", {
    currency: "BRL",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    style: "currency",
  });
  return <>{priceType === "STARTING_AT" ? `a partir de ${amount}` : amount}</>;
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

function daysHead(days: number[]): string {
  const selected = weekOrder.filter((day) => days.includes(day));
  const count = selected.length;
  const first = selected[0];
  if (first === undefined) return "";
  const names = selected.map((day) => (weekdayLabels[day] ?? "").toLowerCase());
  const positions = selected.map((day) => weekOrder.indexOf(day));
  const consecutive = positions.every(
    (position, index) => index === 0 || position === (positions[index - 1] ?? 0) + 1,
  );
  if (count === 1) return `Só ${names[0]}`;
  if (consecutive && count >= 3)
    return `${weekdayLabels[first]} a ${names[count - 1]}`;
  const list = `${names.slice(0, -1).join(", ")} e ${names[count - 1]}`;
  return list.charAt(0).toUpperCase() + list.slice(1);
}

function daysCountText(days: number[]): string {
  const count = weekOrder.filter((day) => days.includes(day)).length;
  return `${count} ${count === 1 ? "dia" : "dias"} por semana`;
}

/** Descrição da etapa "horarios": o mesmo resumo dos dias da etapa anterior. */
export function hoursStepDescription(days: number[]): string {
  const head = daysHead(days);
  const tail = "Pausas e bloqueios você configura depois.";
  if (head === "") return tail;
  return `Vale para ${head.charAt(0).toLowerCase()}${head.slice(1)}. ${tail}`;
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
 * `applyInlineValidation`. `hero` é o horário-base (quadro 2.6): dois
 * cartões com a hora em Literata e a régua de 0 a 24 h. */
function TimeRangeFields({
  endLabel,
  endTime,
  hero = false,
  onChangeEnd,
  onChangeStart,
  startLabel,
  startTime,
}: {
  endLabel: string;
  endTime: string;
  hero?: boolean;
  onChangeEnd: (value: string) => void;
  onChangeStart: (value: string) => void;
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
  const inputClass = hero ? "time-card-input" : "input time-input";
  const startInput = (
    <input
      className={inputClass}
      data-server-field="availability.startTime"
      id={startId}
      required
      type="time"
      value={startTime}
      onChange={(event) => onChangeStart(event.target.value)}
    />
  );
  const endInput = (
    <input
      className={inputClass}
      data-server-field="availability.endTime"
      id={endId}
      ref={endRef}
      required
      type="time"
      value={endTime}
      onChange={(event) => onChangeEnd(event.target.value)}
    />
  );
  // Cada campo num `div.field`: a mensagem de erro entra logo depois do
  // campo (ou do cartão), dentro da mesma célula da grade.
  return (
    <div className="time-range">
      <div className={hero ? "time-cards" : "choice-grid"}>
        <div className="field">
          {hero ? (
            <label className="time-card" htmlFor={startId}>
              <span className="time-card-label">{startLabel}</span>
              {startInput}
            </label>
          ) : (
            <>
              <label className="label" htmlFor={startId}>
                {startLabel}
              </label>
              {startInput}
            </>
          )}
        </div>
        <div className="field">
          {hero ? (
            <label className="time-card" htmlFor={endId}>
              <span className="time-card-label">{endLabel}</span>
              {endInput}
            </label>
          ) : (
            <>
              <label className="label" htmlFor={endId}>
                {endLabel}
              </label>
              {endInput}
            </>
          )}
        </div>
      </div>
      {hero && startTime !== "" && endTime !== "" && (
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
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>24h</span>
          </span>
        </span>
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
  const priceLabelId = useId();
  return (
    <div className="onboarding-form">
      <label className="field">
        <span className="label">Nome</span>
        <input
          aria-label="Nome do serviço"
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
          Duração
        </label>
        <div className="service-duration-row" data-error-anchor="">
          <span className="service-duration-control">
            <button
              aria-label="Diminuir duração"
              className="btn btn-tertiary service-duration-step"
              type="button"
              onClick={() => onChangeDuration(Math.max(5, duration - 5))}
            >
              −
            </button>
            <span className="service-duration-value">
              <input
                aria-label="Duração em minutos"
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
                onChange={(event) =>
                  onChangeDuration(Number(event.target.value))
                }
              />
              <span aria-hidden="true" className="service-duration-unit">
                min
              </span>
            </span>
            <button
              aria-label="Aumentar duração"
              className="btn btn-tertiary service-duration-step"
              type="button"
              onClick={() => onChangeDuration(Math.min(1440, duration + 5))}
            >
              +
            </button>
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
      </div>
      <div className="field">
        <span className="label" id={priceLabelId}>
          Preço <span className="label-optional">(opcional)</span>
        </span>
        <div
          aria-labelledby={priceLabelId}
          className="chip-row price-chip-row"
          role="group"
        >
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
        {priceRequiresValue(priceType) && (
          <div className="price-value-field" data-error-anchor="">
            <span aria-hidden="true" className="price-value-adornment">
              R$
            </span>
            <label className="price-value-input">
              <span className="sr-only">
                {priceType === "STARTING_AT"
                  ? "Valor inicial em reais"
                  : "Preço em reais"}
              </span>
              <CurrencyInput
                className="input"
                data-error-message="Informe o valor do serviço."
                data-server-field="service.price"
                defaultValueCents={priceToCents(price)}
                hideSymbol
                key={priceType}
                placeholder="0,00"
                required
                onValueChange={(cents) => onChangePrice(centsToPrice(cents))}
              />
            </label>
          </div>
        )}
      </div>
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

  const listed: ListedService[] = [
    ...(draft.serviceName.trim() === ""
      ? []
      : [
          {
            duration: draft.serviceDuration,
            key: draft.serviceId ?? "draft-service",
            name: draft.serviceName,
            price: draft.servicePrice,
            priceType: draft.servicePriceType,
          },
        ]),
    ...(items ?? [])
      .filter((item) => item.active && item.id !== draft.serviceId)
      .map((item) => ({
        duration: item.durationMinutes ?? 0,
        key: item.id,
        name: item.name,
        price: item.price,
        priceType: item.priceType,
      })),
  ];

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
      {listed.length > 0 && (
        <ul className="service-list">
          {listed.map((item) => (
            <li className="service-list-row" key={item.key}>
              <span className="service-list-name">{item.name}</span>
              <span className="service-list-meta">
                {item.duration > 0 ? `${item.duration} min` : "Duração pendente"}{" "}
                · <ListedPrice priceType={item.priceType} price={item.price} />
              </span>
            </li>
          ))}
        </ul>
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
          className="service-add-button"
          type="button"
          onClick={() => setFormOpen(true)}
        >
          <Icon name="plus" />
          Adicionar outro serviço
        </button>
      )}
      <p className="service-list-note">
        Recorrência, descrição e instruções para a IA ficam para depois, em
        Serviços.
      </p>
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
  const customId = useId();

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
        endLabel="Termina"
        endTime={draft.endTime}
        hero
        startLabel="Começa"
        startTime={draft.startTime}
        onChangeEnd={(value) =>
          setDraft((current) => ({ ...current, endTime: value }))
        }
        onChangeStart={(value) =>
          setDraft((current) => ({ ...current, startTime: value }))
        }
      />
      <button
        aria-describedby={`${customId}-hint`}
        aria-expanded={customized}
        aria-labelledby={`${customId}-title`}
        className="hours-custom"
        type="button"
        onClick={toggleCustomized}
      >
        <span className="hours-custom-text">
          <span className="hours-custom-title" id={`${customId}-title`}>
            Personalizar dias diferentes
          </span>
          <span className="hours-custom-hint" id={`${customId}-hint`}>
            Ex.: sábado até mais cedo
          </span>
        </span>
        <Icon name="chevron-right" />
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
    return <ImportIllustration />;
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
            <svg
              aria-hidden="true"
              className="icon"
              viewBox="0 0 24 24"
            >
              <rect height="14.5" rx="2.5" width="16" x="4" y="5.5" />
              <path d="M4 10h16M8 3.5v4M16 3.5v4" />
            </svg>
            <span>
              <strong>{daysHead(draft.days)}</strong> · {daysCountText(draft.days)}
            </span>
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
        calendar: { source: "AVENLY", timezone: ctx.draft.timezone },
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
      ctx.go("agenda-avenly-pronta");
      return;
    }
    case "agenda-avenly-pronta":
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
    calendar: { source: "AVENLY", timezone: ctx.draft.timezone },
  });
  await ctx.refresh();
  ctx.go("servico-nome");
}
