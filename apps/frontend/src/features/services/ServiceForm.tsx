"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import {
  type Service,
  type ServiceColorToken,
  type ServiceList as ServiceListResult,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { ListDetailLayout } from "@/shared/layout/ListDetail";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { CurrencyInput } from "@/shared/ui/CurrencyInput";

import {
  formatServiceDuration,
  formatServicePreview,
  formatServicePrice,
  formatServiceRecurrence,
} from "./serviceFormatting";
import {
  DirectoryState,
  requestError,
  ServiceListPanel,
} from "./ServiceList";

const priceTypeOptions: Array<{
  value: Service["priceType"];
  label: string;
}> = [
  { value: "FIXED", label: "Fixo" },
  { value: "STARTING_AT", label: "A partir de" },
  { value: "ON_REQUEST", label: "Sob consulta" },
  { value: "NOT_INFORMED", label: "Sem preço" },
];

const colorTokenOptions: Array<{ value: ServiceColorToken; label: string }> = [
  { value: "SKY", label: "Ameixa" },
  { value: "AMBER", label: "Terracota" },
  { value: "EMERALD", label: "Oliva" },
  { value: "SLATE", label: "Ardósia" },
  { value: "ROSE", label: "Rosa-antigo" },
  { value: "VIOLET", label: "Lavanda" },
];

/*
 * S4 colapsa nome, duração e preço numa linha-resumo. Aqui a linha abre
 * expandida: o gate "a 45-minute service saves through the form" preenche a
 * duração assim que /servicos/editar carrega, sem tocar na linha, e o Goal088
 * o quer sem mudança. D-103 registra a divergência.
 */
const ESSENTIALS_OPEN_ON_EDIT = true;

type BufferField = "bufferBefore" | "bufferAfter";
type OptionKey =
  | "color"
  | "description"
  | "recurrence"
  | "buffers"
  | "instruction";

const bufferFields: Array<{ name: BufferField; label: string; short: string }> =
  [
    { label: "Intervalo antes do atendimento", name: "bufferBefore", short: "Antes" },
    { label: "Intervalo depois do atendimento", name: "bufferAfter", short: "Depois" },
  ];

function formatRecurrenceValue(value: string): string {
  const days = value === "" ? null : Number(value);
  const text = formatServiceRecurrence(
    days !== null && Number.isFinite(days) && days > 0 ? days : null,
  );
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Não";
}

function OptionRow({
  aside,
  children,
  id,
  onToggle,
  open,
  swatch,
  title,
  value,
  valueAction,
}: {
  aside?: string;
  children: ReactNode;
  id: OptionKey;
  onToggle: () => void;
  open: boolean;
  swatch?: ReactNode;
  title: string;
  value: string;
  valueAction?: { controls: string; expanded: boolean; onClick: () => void };
}) {
  const editorId = `service-option-${id}`;
  return (
    <div className={open ? "service-option is-open" : "service-option"} data-option={id}>
      <button
        aria-controls={editorId}
        aria-expanded={open}
        className="service-option-row"
        type="button"
        onClick={onToggle}
      >
        <span className="service-option-title">
          {title}
          {open && aside ? (
            <span className="service-option-aside"> {aside}</span>
          ) : null}
        </span>
        <span className="service-option-value">
          {swatch}
          <span className="service-option-value-text">{value}</span>
          <Icon className="service-option-chevron" name="chevron-right" />
        </span>
      </button>
      {open && valueAction ? (
        <button
          aria-controls={valueAction.controls}
          aria-expanded={valueAction.expanded}
          className="service-option-value-action"
          type="button"
          onClick={valueAction.onClick}
        >
          {value}
        </button>
      ) : null}
      <div className="service-option-editor" hidden={!open} id={editorId}>
        {children}
      </div>
    </div>
  );
}

function priceRequiresValue(priceType: Service["priceType"]): boolean {
  return priceType === "FIXED" || priceType === "STARTING_AT";
}

export function ServiceForm({
  edit,
  serviceId,
}: {
  edit: boolean;
  serviceId?: string;
}) {
  const wide = useWideLayout();
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [catalog, setCatalog] = useState<ServiceListResult | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [name, setName] = useState("");
  const [durationValue, setDurationValue] = useState("");
  const [priceType, setPriceType] = useState<Service["priceType"]>("FIXED");
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [colorToken, setColorToken] = useState<ServiceColorToken | "">("");
  const [essentialsOpen, setEssentialsOpen] = useState(
    ESSENTIALS_OPEN_ON_EDIT,
  );
  const [recurrenceValue, setRecurrenceValue] = useState("");
  const [recurrenceFieldOpen, setRecurrenceFieldOpen] = useState(false);
  const [priceTypesOpen, setPriceTypesOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [openOptions, setOpenOptions] = useState<ReadonlySet<OptionKey>>(
    new Set(),
  );
  const [buffers, setBuffers] = useState<Record<BufferField, string>>({
    bufferAfter: "0",
    bufferBefore: "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [aiInstructionValue, setAiInstructionValue] = useState("");
  const [aiInstructionOriginal, setAiInstructionOriginal] = useState("");
  const [aiInstructionReadError, setAiInstructionReadError] = useState(false);
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .serviceCatalog.list(controller.signal)
      .then((next) => {
        setCatalog(next);
        if (!edit) return;
        const found = next.items.find((item) => item.id === serviceId);
        if (!found) {
          setError(
            serviceId
              ? "Serviço não encontrado."
              : "Selecione um serviço na lista para editar.",
          );
          return;
        }
        setService(found);
        setName(found.name);
        setDurationValue(
          found.durationMinutes === null ? "" : String(found.durationMinutes),
        );
        setPriceType(found.priceType);
        setPriceCents(
          found.price === null ? null : Math.round(found.price * 100),
        );
        setColorToken(found.colorToken ?? "");
        setDescription(found.description ?? "");
        setRecurrenceValue(
          found.recurrenceIntervalDays === null
            ? ""
            : String(found.recurrenceIntervalDays),
        );
        setBuffers({
          bufferAfter: String(found.bufferAfterMinutes ?? 0),
          bufferBefore: String(found.bufferBeforeMinutes ?? 0),
        });
        getProductServices()
          .serviceCatalog.getAiInstruction(found.id, controller.signal)
          .then((result) => {
            if (controller.signal.aborted) return;
            setAiInstructionValue(result.content);
            setAiInstructionOriginal(result.content);
          })
          .catch((_caught: unknown) => {
            if (controller.signal.aborted) return;
            setAiInstructionReadError(true);
          });
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar o serviço."),
          );
      });
    return () => controller.abort();
  }, [edit, serviceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPriceError(null);
    if (priceRequiresValue(priceType) && priceCents === null) {
      setPriceError(
        "Informe o valor ou escolha sob consulta / sem preço.",
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const duration = formText(data, "duration");
      const buffersBefore = formText(data, "bufferBefore");
      const buffersAfter = formText(data, "bufferAfter");
      const recurrence = formText(data, "recurrence");
      const description = formText(data, "description");
      const input = {
        active: edit ? data.get("active") === "on" : true,
        bufferAfterMinutes: buffersAfter === "" ? 0 : Number(buffersAfter),
        bufferBeforeMinutes: buffersBefore === "" ? 0 : Number(buffersBefore),
        colorToken: colorToken === "" ? null : colorToken,
        description: description === "" ? null : description,
        durationMinutes: duration === "" ? null : Number(duration),
        name: formText(data, "name"),
        price: priceRequiresValue(priceType) ? (priceCents ?? 0) / 100 : null,
        priceType,
        recurrenceIntervalDays:
          recurrence === "" ? null : Number(recurrence),
      } as const;
      const existingId = (edit && service?.id) || createdServiceId;
      const savedService = existingId
        ? await getProductServices().serviceCatalog.update(existingId, input)
        : await getProductServices().serviceCatalog.create(input);
      if (!existingId) setCreatedServiceId(savedService.id);
      if (
        !aiInstructionReadError &&
        aiInstructionValue !== aiInstructionOriginal
      ) {
        try {
          await getProductServices().serviceCatalog.updateAiInstruction(
            savedService.id,
            aiInstructionValue,
          );
        } catch (caught: unknown) {
          setMessage(
            requestError(
              caught,
              "Serviço salvo, mas não foi possível salvar as instruções para a IA.",
            ),
          );
          return;
        }
      }
      router.replace("/servicos");
    } catch (caught: unknown) {
      setMessage(requestError(caught, "Não foi possível salvar o serviço."));
    } finally {
      setBusy(false);
    }
  }

  function incrementDuration() {
    setDirty(true);
    setDurationValue((current) =>
      current === "" ? "5" : String(Number(current) + 5),
    );
  }

  function decrementDuration() {
    setDirty(true);
    setDurationValue((current) =>
      current === "" ? current : String(Math.max(5, Number(current) - 5)),
    );
  }

  const preview = formatServicePreview({
    durationMinutes: durationValue === "" ? null : Number(durationValue),
    name,
    priceCents,
    priceType,
  });

  const durationMinutes = durationValue === "" ? null : Number(durationValue);
  const summary = [
    name.trim() || "Sem nome",
    formatServiceDuration(durationMinutes),
    priceRequiresValue(priceType) && priceCents === null
      ? "sem preço informado"
      : formatServicePrice({
          price: priceCents === null ? null : priceCents / 100,
          priceType,
        }),
  ].join(" · ");
  const recurrenceText = formatRecurrenceValue(recurrenceValue);
  const bufferBeforeMinutes = Number(buffers.bufferBefore) || 0;
  const bufferAfterMinutes = Number(buffers.bufferAfter) || 0;
  const buffersText =
    bufferBeforeMinutes === 0 && bufferAfterMinutes === 0
      ? "Nenhum"
      : `Antes ${bufferBeforeMinutes} · Depois ${bufferAfterMinutes}`;
  const colorLabel =
    colorTokenOptions.find((option) => option.value === colorToken)?.label ??
    "Sem cor";
  const descriptionText = description.trim() || "Opcional";
  const instructionText = aiInstructionValue.trim() ? "Definidas" : "Nenhuma";

  function toggleOption(key: OptionKey) {
    setOpenOptions((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function stepBuffer(field: BufferField, delta: number) {
    setDirty(true);
    setBuffers((current) => {
      const value = current[field] === "" ? 0 : Number(current[field]);
      return { ...current, [field]: String(Math.max(0, value + delta)) };
    });
  }

  useShellConfig({
    active: "servicos",
    loading: !catalog && !error,
    module: "directory",
    pushed: true,
    title: edit ? "Editar serviço" : "Novo serviço",
  });

  const priceTypeLabel =
    priceTypeOptions.find((option) => option.value === priceType)?.label ??
    "Fixo";
  const priceTypeControl = (
    <div className="directory-segmented">
      {priceTypeOptions.map((option) => (
        <label key={option.value}>
          <input
            checked={priceType === option.value}
            name="price-mode"
            type="radio"
            value={option.value}
            onChange={() => {
              setDirty(true);
              setPriceType(option.value);
              setPriceError(null);
            }}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
  const priceInput = (
    <CurrencyInput
      aria-describedby="service-price-help"
      aria-label={priceType === "STARTING_AT" ? "Valor inicial" : "Preço"}
      className="input"
      defaultValueCents={
        service && service.price !== null
          ? Math.round(service.price * 100)
          : undefined
      }
      key={service?.id ?? "new"}
      onValueChange={(value) => {
        setDirty(true);
        setPriceCents(value);
        setPriceError(null);
      }}
      placeholder="R$ 0,00"
    />
  );
  const priceHelp = (
    <span
      className={priceError ? "field-help" : "sr-only"}
      id="service-price-help"
      role={priceError ? "alert" : undefined}
    >
      {priceError ??
        "Uma alteração vale para novos agendamentos; o histórico é preservado."}
    </span>
  );

  const barTitle = edit ? (service?.name ?? "Editar serviço") : "Novo serviço";
  const screen = (
    <section className="directory-page is-form-page service-form-screen">
      <PushedBar
        backHref="/servicos"
        backIcon="x"
        backLabel="Voltar para serviços"
        subtitle={edit && dirty ? "alterações não salvas" : undefined}
        title={barTitle}
      />
      <div className="service-form-body">
        {error ? (
          <DirectoryState
            actionHref="/servicos"
            actionLabel="Voltar para serviços"
            description={error}
            error
            title="Serviço indisponível"
          />
        ) : !catalog || (edit && !service) ? (
          <div className="directory-loading-shell" aria-busy="true">
            <div className="directory-loading-row">
              <span className="skeleton directory-loading-avatar" />
              <span className="directory-loading-copy">
                <span className="skeleton skeleton-title" />
                <span className="skeleton skeleton-line" />
              </span>
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line" />
            </div>
          </div>
        ) : !catalog.editable ? (
          <DirectoryState
            actionHref="/servicos"
            actionLabel="Voltar para serviços"
            description="Serviços desta fonte ficam somente para consulta na Avenly."
            title="Edição gerenciada no Minha Agenda"
          />
        ) : (
          <form
            className={
              edit
                ? "directory-form-card service-form-edit"
                : "directory-form-card service-form-split"
            }
            onChange={() => setDirty(true)}
            onSubmit={(event) => void submit(event)}
          >
            {edit && (
              <button
                aria-controls="service-essentials"
                aria-expanded={essentialsOpen}
                className="service-summary-row"
                type="button"
                onClick={() => setEssentialsOpen((open) => !open)}
              >
                <span className="service-summary-label">
                  Nome, duração e preço
                </span>
                <span className="service-summary-value">{summary}</span>
              </button>
            )}
            <div
              className="directory-form-grid service-essentials"
              hidden={edit && !essentialsOpen}
              id="service-essentials"
            >
              <label className="field is-wide">
                <span className="service-field-label">Nome</span>
                <input
                  className="input"
                  maxLength={200}
                  name="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <div className="service-duration-price">
              <div className="field service-duration-field">
                <label className="service-field-label" htmlFor="service-duration">
                  Duração
                </label>
                <div className="service-duration-row">
                  <span className="service-duration-control">
                    <button
                      aria-label="Diminuir duração"
                      className="btn btn-tertiary service-duration-step"
                      type="button"
                      onClick={decrementDuration}
                    >
                      −
                    </button>
                    <span className="service-duration-value">
                      <input
                        aria-describedby="service-duration-help"
                        aria-label="Duração (minutos)"
                        className="service-duration-input"
                        id="service-duration"
                        min={1}
                        name="duration"
                        placeholder="Ex.: 45"
                        step={1}
                        type="number"
                        value={durationValue}
                        onChange={(event) =>
                          setDurationValue(event.target.value)
                        }
                      />
                      <span
                        aria-hidden="true"
                        className="service-duration-unit"
                      >
                        min
                      </span>
                    </span>
                    <button
                      aria-label="Aumentar duração"
                      className="btn btn-tertiary service-duration-step"
                      type="button"
                      onClick={incrementDuration}
                    >
                      +
                    </button>
                  </span>
                  {!edit && (
                    <span
                      aria-label="Atalhos de duração"
                      className="service-duration-shortcuts"
                      role="group"
                    >
                      {[30, 60, 90].map((minutes) => (
                        <button
                          aria-pressed={durationValue === String(minutes)}
                          className="btn btn-tertiary service-duration-shortcut"
                          key={minutes}
                          type="button"
                          onClick={() => {
                            setDirty(true);
                            setDurationValue(String(minutes));
                          }}
                        >
                          {minutes}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
                <span className="sr-only" id="service-duration-help">
                  Deixe em branco quando ainda não for possível informar a
                  duração. Isso mantém o serviço pendente de revisão, em vez
                  de inventar um valor.
                </span>
              </div>
              <fieldset className="directory-fieldset service-price-field">
                <legend>Preço</legend>
                {edit ? (
                  <div
                    className={
                      priceError
                        ? "service-price-compact field-error"
                        : "service-price-compact"
                    }
                  >
                    <button
                      aria-controls="service-price-types"
                      aria-expanded={priceTypesOpen}
                      aria-label={`Tipo de preço: ${priceTypeLabel}`}
                      className="service-price-type-toggle"
                      type="button"
                      onClick={() => setPriceTypesOpen((open) => !open)}
                    >
                      {priceTypeLabel}
                      {priceRequiresValue(priceType) ? " ·" : ""}
                    </button>
                    {priceRequiresValue(priceType) && priceInput}
                  </div>
                ) : (
                  <>
                    {priceTypeControl}
                    {priceRequiresValue(priceType) && (
                      <div
                        className={
                          priceError
                            ? "service-price-value field-error"
                            : "service-price-value"
                        }
                      >
                        {priceInput}
                      </div>
                    )}
                  </>
                )}
                {priceRequiresValue(priceType) && priceHelp}
                {!edit && preview && (
                  <span className="service-ai-says">
                    A IA responde: “{preview}”
                  </span>
                )}
              </fieldset>
              </div>
              {edit && (
                <fieldset
                  className="directory-fieldset service-price-types"
                  hidden={!priceTypesOpen}
                  id="service-price-types"
                >
                  <legend className="sr-only">Tipo de preço</legend>
                  {priceTypeControl}
                  {preview && (
                    <span className="service-ai-says">
                      A IA responde: “{preview}”
                    </span>
                  )}
                </fieldset>
              )}
            </div>

            <h2 className={edit ? "sr-only" : "service-options-heading"}>
              Mais opções
            </h2>
            <div className="service-options">
              <OptionRow
                aside="(opcional)"
                id="color"
                open={openOptions.has("color")}
                swatch={
                  <span
                    aria-hidden="true"
                    className={
                      colorToken ? "service-color-dot" : "service-color-dot is-none"
                    }
                    data-color={colorToken || undefined}
                  />
                }
                title="Cor na agenda"
                value={colorLabel}
                onToggle={() => toggleOption("color")}
              >
                <div
                  aria-label="Cor na agenda"
                  className="service-color-choices"
                  role="radiogroup"
                >
                  <label className="service-color-choice">
                    <input
                      checked={colorToken === ""}
                      name="service-color"
                      type="radio"
                      value=""
                      onChange={() => setColorToken("")}
                    />
                    <span aria-hidden="true" className="service-color-circle is-none" />
                    <span className="sr-only">Sem cor</span>
                  </label>
                  {colorTokenOptions.map((option) => (
                    <label className="service-color-choice" key={option.value}>
                      <input
                        checked={colorToken === option.value}
                        name="service-color"
                        type="radio"
                        value={option.value}
                        onChange={() => setColorToken(option.value)}
                      />
                      <span
                        aria-hidden="true"
                        className="service-color-circle"
                        data-color={option.value}
                      >
                        {colorToken === option.value && (
                          <svg
                            aria-hidden="true"
                            fill="none"
                            height="16"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                            width="16"
                          >
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        )}
                      </span>
                      <span className="sr-only">{option.label}</span>
                    </label>
                  ))}
                </div>
                <span className="service-option-help">Seis cores sugeridas.</span>
                <div className="service-agenda-preview">
                  <span className="service-agenda-preview-label">
                    Assim na agenda
                  </span>
                  <div className="service-agenda-preview-row">
                    <span className="service-agenda-preview-time">15:30</span>
                    <span
                      aria-hidden="true"
                      className="service-agenda-preview-bar"
                      data-color={colorToken || undefined}
                    />
                    <span className="service-agenda-preview-body">
                      <span className="service-agenda-preview-name">
                        Cliente
                      </span>
                      <span className="service-agenda-preview-line">
                        {summary}
                      </span>
                    </span>
                  </div>
                </div>
              </OptionRow>

              <OptionRow
                id="description"
                open={openOptions.has("description")}
                title="Descrição"
                value={descriptionText}
                onToggle={() => toggleOption("description")}
              >
                <textarea
                  aria-label="Descrição (opcional)"
                  className="input"
                  maxLength={2000}
                  name="description"
                  placeholder="Detalhes que ajudam a explicar o serviço."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </OptionRow>

              <OptionRow
                id="recurrence"
                open={openOptions.has("recurrence")}
                title="Recorrência"
                value={recurrenceText}
                valueAction={{
                  controls: "service-recurrence-field",
                  expanded: recurrenceFieldOpen,
                  onClick: () => setRecurrenceFieldOpen((value) => !value),
                }}
                onToggle={() => toggleOption("recurrence")}
              >
                <input
                  aria-label="Repetir automaticamente a cada (dias)"
                  className="input"
                  hidden={!recurrenceFieldOpen}
                  id="service-recurrence-field"
                  min={1}
                  name="recurrence"
                  placeholder="Deixe em branco se não repetir"
                  type="number"
                  value={recurrenceValue}
                  onChange={(event) => setRecurrenceValue(event.target.value)}
                />
                <span className="service-option-note">
                  Referência para a IA quando a cliente pedir “as próximas”.
                  Nunca marca sozinha.
                </span>
              </OptionRow>

              <OptionRow
                id="buffers"
                open={openOptions.has("buffers")}
                title="Intervalo antes e depois"
                value={buffersText}
                onToggle={() => toggleOption("buffers")}
              >
                <div className="service-buffers">
                  {bufferFields.map((field) => (
                    <div className="service-buffer" key={field.name}>
                      <span aria-hidden="true" className="service-buffer-label">
                        {field.short}
                      </span>
                      <span className="service-buffer-stepper">
                        <button
                          aria-label={`Diminuir ${field.label.toLowerCase()}`}
                          className="service-buffer-step"
                          type="button"
                          onClick={() => stepBuffer(field.name, -5)}
                        >
                          −
                        </button>
                        <input
                          aria-label={`${field.label} (minutos)`}
                          className="service-buffer-input"
                          min={0}
                          name={field.name}
                          step={5}
                          type="number"
                          value={buffers[field.name]}
                          onChange={(event) =>
                            setBuffers((current) => ({
                              ...current,
                              [field.name]: event.target.value,
                            }))
                          }
                        />
                        <button
                          aria-label={`Aumentar ${field.label.toLowerCase()}`}
                          className="service-buffer-step is-increase"
                          type="button"
                          onClick={() => stepBuffer(field.name, 5)}
                        >
                          +
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
                <span className="service-option-note">
                  Minutos que ficam ocupados na agenda para preparar ou limpar.
                  Entre serviços do mesmo atendimento, não se somam.
                </span>
              </OptionRow>

              <OptionRow
                aside="· só ela lê"
                id="instruction"
                open={openOptions.has("instruction")}
                title="Instruções para a IA"
                value={instructionText}
                onToggle={() => toggleOption("instruction")}
              >
                <textarea
                  aria-label="Instruções para a IA"
                  className="input service-instruction-input"
                  disabled={aiInstructionReadError}
                  maxLength={2000}
                  name="aiInstruction"
                  placeholder="Não faço coloração em cabelo com henna. Se a cliente mencionar henna, peça para falar comigo antes de marcar."
                  value={aiInstructionValue}
                  onChange={(event) => setAiInstructionValue(event.target.value)}
                />
                <span
                  className="service-option-help"
                  role={aiInstructionReadError ? "alert" : undefined}
                >
                  {aiInstructionReadError
                    ? "Não foi possível carregar as instruções para a IA agora. Você ainda pode salvar o serviço."
                    : "Nunca é enviado ao cliente. A IA usa para decidir o que responder ou quando chamar você."}
                </span>
              </OptionRow>

              {edit && (
                <label className="check service-active-option">
                  <input
                    defaultChecked={service?.active ?? true}
                    name="active"
                    type="checkbox"
                  />
                  <span className="check-box" />
                  <span className="service-active-copy">
                    <span className="service-option-title">Serviço ativo</span>
                    <span className="service-option-note">
                      A IA oferece e você vê nas opções de agendamento
                    </span>
                  </span>
                </label>
              )}
            </div>

            {message && (
              <div className="directory-inline-error" role="alert">
                {message}
              </div>
            )}
            <div className="directory-form-footer service-form-cta">
              <button className="btn btn-primary" disabled={busy} type="submit">
                {busy
                  ? "Salvando..."
                  : edit
                    ? "Salvar alterações"
                    : "Salvar serviço"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );

  return (
    <ListDetailLayout
      detail={screen}
      list={<ServiceListPanel openId={edit ? serviceId : undefined} />}
      listLabel="Serviços"
      split={wide}
    />
  );
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}
