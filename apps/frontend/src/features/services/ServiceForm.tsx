"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import {
  type Service,
  type ServiceColorToken,
  type ServiceList as ServiceListResult,
} from "@/data";
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
  { value: "FIXED", label: "Preço fixo" },
  { value: "STARTING_AT", label: "A partir de" },
  { value: "ON_REQUEST", label: "Sob consulta" },
  { value: "NOT_INFORMED", label: "Não informado" },
];

const colorTokenOptions: Array<{ value: ServiceColorToken; label: string }> = [
  { value: "ROSE", label: "Rosa" },
  { value: "AMBER", label: "Âmbar" },
  { value: "EMERALD", label: "Esmeralda" },
  { value: "SKY", label: "Azul-celeste" },
  { value: "VIOLET", label: "Violeta" },
  { value: "SLATE", label: "Ardósia" },
];

/*
 * S4 colapsa nome, duração e preço numa linha-resumo. Aqui a linha abre
 * expandida: o gate "a 45-minute service saves through the form" preenche a
 * duração assim que /servicos/editar carrega, sem tocar na linha, e o Goal088
 * o quer sem mudança. D-103 registra a divergência.
 */
const ESSENTIALS_OPEN_ON_EDIT = true;

type BufferField = "bufferBefore" | "bufferAfter";

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
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Não repete";
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
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
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
        "Informe o valor ou escolha sob consulta / não informado.",
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
        active: data.get("active") === "on",
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
            description="Serviços desta fonte ficam somente para consulta na Atendly."
            title="Edição gerenciada no Minha Agenda"
          />
        ) : (
          <form
            className="directory-form-card"
            onChange={() => setDirty(true)}
            onSubmit={(event) => void submit(event)}
          >
            <h2 className="sr-only">Essencial</h2>
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
                <span className="label">Nome do serviço</span>
                <input
                  className="input"
                  maxLength={200}
                  name="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <div className="field">
                <label className="label" htmlFor="service-duration">
                  Duração (minutos)
                </label>
                <span className="service-duration-control">
                  <button
                    aria-label="Diminuir duração"
                    className="btn btn-tertiary service-duration-step"
                    type="button"
                    onClick={decrementDuration}
                  >
                    −
                  </button>
                  <input
                    className="input"
                    id="service-duration"
                    min={1}
                    name="duration"
                    placeholder="Ex.: 45"
                    step={1}
                    type="number"
                    value={durationValue}
                    onChange={(event) => setDurationValue(event.target.value)}
                  />
                  <button
                    aria-label="Aumentar duração"
                    className="btn btn-tertiary service-duration-step"
                    type="button"
                    onClick={incrementDuration}
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
                <span className="field-help">
                  Deixe em branco quando ainda não for possível informar a
                  duração. Isso mantém o serviço pendente de revisão, em vez
                  de inventar um valor.
                </span>
              </div>
              <fieldset className="directory-fieldset">
                <legend>Tipo de preço</legend>
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
              </fieldset>
              {priceRequiresValue(priceType) && (
                <div
                  className={
                    priceError ? "field field-error" : "field"
                  }
                >
                  <span className="label">
                    {priceType === "STARTING_AT" ? "Valor inicial" : "Preço"}
                  </span>
                  <CurrencyInput
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
                  <span
                    className="field-help"
                    role={priceError ? "alert" : undefined}
                  >
                    {priceError ??
                      "Uma alteração vale para novos agendamentos; o histórico é preservado."}
                  </span>
                </div>
              )}
              {preview && (
                <div className="field is-wide service-preview">
                  <span className="label">Prévia · como a IA responde</span>
                  <p className="service-preview-text">“{preview}”</p>
                </div>
              )}
              <label className="field is-wide">
                <span className="label">Descrição (opcional)</span>
                <textarea
                  className="input"
                  defaultValue={service?.description ?? ""}
                  maxLength={2000}
                  name="description"
                  placeholder="Detalhes que ajudam a explicar o serviço."
                />
              </label>
              <label className="field">
                <span className="label">Identidade visual (opcional)</span>
                <select
                  className="select"
                  name="colorToken"
                  value={colorToken}
                  onChange={(event) =>
                    setColorToken(event.target.value as ServiceColorToken | "")
                  }
                >
                  <option value="">Sem cor definida</option>
                  {colorTokenOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {colorToken && (
                  <span className="service-color-preview">
                    <span
                      aria-hidden="true"
                      className="swatch service-swatch"
                      data-color={colorToken}
                    />
                    <span className="field-help">
                      Pré-visualização da cor usada para identificar este
                      serviço.
                    </span>
                  </span>
                )}
              </label>
            </div>

            <h2 className="sr-only">Mais opções</h2>
            <div className="service-options">
              <div className="service-option">
                <div className="service-option-head">
                  <span className="service-option-title">Recorrência</span>
                  <button
                    aria-controls="service-recurrence-field"
                    aria-expanded={recurrenceOpen}
                    className="service-option-value"
                    type="button"
                    onClick={() => setRecurrenceOpen((open) => !open)}
                  >
                    {recurrenceText}
                  </button>
                </div>
                <label
                  className="field"
                  hidden={!recurrenceOpen}
                  id="service-recurrence-field"
                >
                  <span className="label">
                    Repetir automaticamente a cada (dias)
                  </span>
                  <input
                    className="input"
                    min={1}
                    name="recurrence"
                    placeholder="Deixe em branco se não repetir"
                    type="number"
                    value={recurrenceValue}
                    onChange={(event) => setRecurrenceValue(event.target.value)}
                  />
                </label>
                <span className="service-option-note">
                  Referência para a IA quando a cliente pedir “as próximas”.
                  Nunca marca sozinha.
                </span>
              </div>

              <div className="service-option">
                <span className="service-option-title">
                  Intervalo antes e depois
                </span>
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
              </div>

              <label className="service-option">
                <span className="service-option-title">
                  Instruções para a IA{" "}
                  <span className="service-option-aside">· só ela lê</span>
                </span>
                <textarea
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
              </label>

              <label className="check service-option service-active-option">
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
                    : "Criar serviço"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );

  if (!wide) return screen;
  return (
    <ListDetailLayout
      detail={screen}
      list={<ServiceListPanel openId={edit ? serviceId : undefined} />}
      listLabel="Serviços"
    />
  );
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}
