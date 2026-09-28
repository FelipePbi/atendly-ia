import { useEffect, useId, useRef, useState } from "react";

import type { Service } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

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
  startLabel,
  startTime,
}: {
  endLabel: string;
  endTime: string;
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
  // Cada campo num `div.field` com <label for>: a mensagem de erro entra
  // logo depois do campo, dentro da mesma célula da grade.
  return (
    <div className="choice-grid">
      <div className="field">
        <label className="label" htmlFor={startId}>
          {startLabel}
        </label>
        <input
          className="input"
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
          className="input"
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
      <label className="field">
        <span className="label">Duração em minutos</span>
        <input
          className="input"
          data-error-message="Informe a duração em minutos."
          data-server-field="service.durationMinutes"
          min={5}
          max={1440}
          required
          type="number"
          value={duration}
          onChange={(event) => onChangeDuration(Number(event.target.value))}
        />
      </label>
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
          <input
            className="input"
            data-error-message="Informe o valor do serviço."
            data-server-field="service.price"
            min="0"
            required
            step="0.01"
            type="number"
            value={price}
            onChange={(event) => onChangePrice(event.target.value)}
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
      <div
        aria-label="Dias de atendimento"
        className="choice-grid"
        data-group-error={draft.days.length === 0 ? DAYS_REQUIRED_MESSAGE : ""}
        data-validation-group=""
        role="group"
      >
        {weekOrder.map((day) => (
          <label
            className={`choice-card${draft.days.includes(day) ? " is-selected" : ""}`}
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
            <h3>{weekdayLabels[day]}</h3>
          </label>
        ))}
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
