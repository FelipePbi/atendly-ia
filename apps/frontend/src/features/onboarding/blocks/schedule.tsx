import { useEffect, useId, useRef, useState } from "react";

import type { Service } from "@/data";
import {
  DayPills,
  daysHead,
  DaysSummary,
  HoursCopyButton,
  HoursDayRow,
  TimeRangeFields,
  weekdayLabels,
  weekOrder,
} from "@/features/availability/WeeklyHours";
import { ImportIllustration } from "@/features/imports/ImportIllustration";
import type { WhatsAppConsentPhase } from "@/features/whatsapp/WhatsAppConnectionPanel";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { CurrencyInput } from "@/shared/ui/CurrencyInput";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import {
  applyInlineValidation,
  type HoursDayView,
  type OnboardingStepContext,
  Summary,
} from "./shared";

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
    typeof price === "number"
      ? price
      : Number(String(price ?? "").replace(",", "."));
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
    typeof price === "number"
      ? price
      : Number(String(price ?? "").replace(",", "."));
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
function priceToCents(price: string): number | undefined {
  if (price.trim() === "") return undefined;
  const value = Number(price.replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : undefined;
}

function centsToPrice(cents: number | null): string {
  return cents === null ? "" : String(cents / 100);
}

/** Descrição da etapa "horarios": o mesmo resumo dos dias da etapa anterior. */
export function hoursStepDescription(days: number[]): string {
  const head = daysHead(days);
  const tail = "Pausas e bloqueios você configura depois.";
  if (head === "") return tail;
  return `Vale para ${head.charAt(0).toLowerCase()}${head.slice(1)}. ${tail}`;
}

const DAYS_REQUIRED_MESSAGE = "Escolha pelo menos um dia de atendimento.";

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

function summarizeHours(draft: OnboardingDraft): string {
  const selectedDays = weekOrder.filter((day) => draft.days.includes(day));
  const perDay = selectedDays.map((day) => dayHourOf(draft, day));
  const first = perDay[0];
  const uniform =
    first !== undefined &&
    perDay.every(
      (hours) =>
        hours.startTime === first.startTime && hours.endTime === first.endTime,
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
      // Decisão de 2026-10-12: o onboarding não pergunta a cor. O adicional
      // é criado por `PATCH /v1/onboarding` (sem `id`), que não exige cor —
      // o servidor sorteia uma da paleta —, e a lista é relida em seguida.
      const services = getProductServices();
      await services.onboarding.update({
        service: {
          active: true,
          durationMinutes: duration,
          name,
          price: priceRequiresValue(priceType)
            ? Number(price.replace(",", "."))
            : null,
          priceType,
        },
      });
      const refreshed = await services.serviceCatalog.list();
      setItems(refreshed.items);
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
                {item.duration > 0
                  ? `${item.duration} min`
                  : "Duração pendente"}{" "}
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

/** Muda um campo (início ou fim) de um dia. Igual ao intervalo-base não é
 * personalização daquele campo: ele volta a acompanhar o intervalo-base, mesmo
 * que o outro campo do mesmo dia continue personalizado. */
function updateDayHour(
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
  day: number,
  field: "startTime" | "endTime",
  value: string,
) {
  setDraft((current) => {
    const dayHours = { ...current.dayHours };
    const override = { ...dayHours[day] };
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

/** Quadro 2.7: sete linhas de segunda a domingo. O dia marcado é um botão
 * que abre, dentro do cartão, os campos só daquele dia (um por vez); o dia
 * sem atendimento diz "Não atende" e não é controle — os dias se escolhem em
 * "dias-de-atendimento". Só o dia diferente do intervalo-base ganha o tom. */
function DayHoursView({
  draft,
  setDraft,
}: {
  draft: OnboardingDraft;
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void;
}) {
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [lastAdjusted, setLastAdjusted] = useState<number | null>(null);
  const fieldsId = useId();
  const markedDays = weekOrder.filter((day) => draft.days.includes(day));
  const differs = (day: number) => {
    const hours = dayHourOf(draft, day);
    return (
      hours.startTime !== draft.startTime || hours.endTime !== draft.endTime
    );
  };
  const differingDays = markedDays.filter(differs);
  const copyDay =
    lastAdjusted !== null && differingDays.includes(lastAdjusted)
      ? lastAdjusted
      : differingDays[differingDays.length - 1];

  function adjust(day: number, field: "startTime" | "endTime", value: string) {
    setLastAdjusted(day);
    updateDayHour(setDraft, day, field, value);
  }

  function copyToOtherDays() {
    if (copyDay === undefined) return;
    const hours = dayHourOf(draft, copyDay);
    // O que se grava é o que está na tela: o intervalo do dia copiado vira o
    // intervalo-base e nenhum dia fica personalizado.
    setDraft((current) => ({
      ...current,
      dayHours: {},
      endTime: hours.endTime,
      startTime: hours.startTime,
    }));
    setLastAdjusted(null);
  }

  return (
    <>
      <div className="hours-day-card">
        {weekOrder.map((day) => {
          const name = weekdayLabels[day] ?? "";
          const hours = dayHourOf(draft, day);
          // Um dia com "fim antes do início" não fecha: o campo inválido
          // precisa continuar na tela para o envio da etapa o conferir.
          const invalid =
            hours.startTime !== "" &&
            hours.endTime !== "" &&
            hours.endTime <= hours.startTime;
          return (
            <HoursDayRow
              day={day}
              different={differs(day)}
              expanded={openDay === day || invalid}
              fieldsId={`${fieldsId}-${day}`}
              intervals={[hours]}
              key={day}
              off={!draft.days.includes(day)}
              onToggle={() => setOpenDay(openDay === day ? null : day)}
            >
              <TimeRangeFields
                endLabel={`${name} · Fim`}
                endTime={hours.endTime}
                startLabel={`${name} · Início`}
                startTime={hours.startTime}
                onChangeEnd={(value) => adjust(day, "endTime", value)}
                onChangeStart={(value) => adjust(day, "startTime", value)}
              />
            </HoursDayRow>
          );
        })}
      </div>
      {copyDay !== undefined && (
        <HoursCopyButton day={copyDay} onClick={copyToOtherDays} />
      )}
    </>
  );
}

function HoursStepBody({
  dayView,
  draft,
  setDraft,
}: {
  dayView?: HoursDayView;
  draft: OnboardingDraft;
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void;
}) {
  const open = dayView?.open ?? false;
  const customId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLButtonElement>(null);
  const previousOpen = useRef(open);

  // Só a troca de tela move o foco (não a abertura pela leitura): ao abrir, o
  // título "Horários por dia"; ao voltar, o cartão que abriu a tela.
  useEffect(() => {
    if (previousOpen.current === open) return;
    previousOpen.current = open;
    if (open) {
      const heading = rootRef.current
        ?.closest("form")
        ?.querySelector<HTMLElement>("h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus();
    } else {
      customRef.current?.focus();
    }
  }, [open]);

  return (
    <div
      className={`onboarding-form${open ? " hours-day-view" : ""}`}
      ref={rootRef}
    >
      {open ? (
        <DayHoursView draft={draft} setDraft={setDraft} />
      ) : (
        <>
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
            aria-labelledby={`${customId}-title`}
            className="hours-custom"
            ref={customRef}
            type="button"
            onClick={() => dayView?.onOpenChange(true)}
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
        </>
      )}
    </div>
  );
}

export function scheduleStepBody(
  scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
  _onWhatsappStatusChange?: (connected: boolean) => void,
  _onDemoDone?: (done: boolean) => void,
  _whatsappConsentPhase?: WhatsAppConsentPhase,
  _onIgnoredCountChange?: (count: number) => void,
  hoursDayView?: HoursDayView,
) {
  if (scenario === "quando-importar") return <ImportIllustration />;
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
        <DayPills
          days={draft.days}
          validationMessage={
            draft.days.length === 0 ? DAYS_REQUIRED_MESSAGE : ""
          }
          onToggle={(day, selected) =>
            setDraft((value) => ({
              ...value,
              days: selected
                ? [...value.days, day].sort()
                : value.days.filter((item) => item !== day),
            }))
          }
        />
        <DaysSummary days={draft.days} />
      </div>
    );
  if (scenario === "horarios")
    return (
      <HoursStepBody dayView={hoursDayView} draft={draft} setDraft={setDraft} />
    );
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
