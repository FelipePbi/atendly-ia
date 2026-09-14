"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import {
  type Service,
  type ServiceColorToken,
  type ServiceList as ServiceListResult,
} from "@/data";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { CurrencyInput } from "@/shared/ui/CurrencyInput";

import {
  DirectoryHeader,
  DirectorySourceStrip,
  DirectoryState,
  requestError,
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
  const router = useRouter();
  const [catalog, setCatalog] = useState<ServiceListResult | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [priceType, setPriceType] = useState<Service["priceType"]>("FIXED");
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [colorToken, setColorToken] = useState<ServiceColorToken | "">("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
        setPriceType(found.priceType);
        setPriceCents(
          found.price === null ? null : Math.round(found.price * 100),
        );
        setColorToken(found.colorToken ?? "");
        if (
          found.description ||
          found.colorToken ||
          found.bufferBeforeMinutes ||
          found.bufferAfterMinutes ||
          found.recurrenceIntervalDays ||
          !found.active
        ) {
          setAdvancedOpen(true);
        }
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
      if (edit && service)
        await getProductServices().serviceCatalog.update(service.id, input);
      else await getProductServices().serviceCatalog.create(input);
      router.replace("/servicos");
    } catch (caught: unknown) {
      setMessage(requestError(caught, "Não foi possível salvar o serviço."));
    } finally {
      setBusy(false);
    }
  }

  const external = catalog?.source === "EXTERNAL";
  useShellConfig({
    active: "servicos",
    loading: !catalog && !error,
    module: "directory",
    source: external ? "external" : "atendly",
    title: edit ? "Editar serviço" : "Novo serviço",
  });
  return (
    <>
      <section className="directory-page is-form-page">
        <DirectoryHeader
          title={edit ? "Editar serviço" : "Novo serviço"}
          description="Defina o que a IA pode oferecer ao criar novos agendamentos."
          back="/servicos"
        />
        <DirectorySourceStrip
          external={external}
          editable={Boolean(catalog?.editable)}
        />
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
            onSubmit={(event) => void submit(event)}
          >
            <h2>Essencial</h2>
            <div className="directory-form-grid">
              <label className="field is-wide">
                <span className="label">Nome do serviço</span>
                <input
                  className="input"
                  defaultValue={service?.name}
                  maxLength={200}
                  name="name"
                  required
                />
              </label>
              <label className="field">
                <span className="label">Duração (minutos)</span>
                <input
                  className="input"
                  defaultValue={service?.durationMinutes ?? ""}
                  min={1}
                  name="duration"
                  placeholder="Ex.: 45"
                  step={5}
                  type="number"
                />
                <span className="field-help">
                  Deixe em branco quando ainda não for possível informar a
                  duração. Isso mantém o serviço pendente de revisão, em vez
                  de inventar um valor.
                </span>
              </label>
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
                      service?.price === null
                        ? undefined
                        : Math.round((service?.price ?? 0) * 100)
                    }
                    key={service?.id ?? "new"}
                    onValueChange={(value) => {
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
            </div>

            <details
              className="service-form-advanced"
              open={advancedOpen}
              onToggle={(event) =>
                setAdvancedOpen(event.currentTarget.open)
              }
            >
              <summary>Descrição, cor, buffers, recorrência e status</summary>
              <div className="directory-form-grid">
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
                      setColorToken(
                        event.target.value as ServiceColorToken | "",
                      )
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
                <label className="field">
                  <span className="label">
                    Intervalo antes do atendimento (minutos)
                  </span>
                  <input
                    className="input"
                    defaultValue={service?.bufferBeforeMinutes ?? 0}
                    min={0}
                    name="bufferBefore"
                    step={5}
                    type="number"
                  />
                </label>
                <label className="field">
                  <span className="label">
                    Intervalo depois do atendimento (minutos)
                  </span>
                  <input
                    className="input"
                    defaultValue={service?.bufferAfterMinutes ?? 0}
                    min={0}
                    name="bufferAfter"
                    step={5}
                    type="number"
                  />
                </label>
                <label className="field">
                  <span className="label">
                    Repetir automaticamente a cada (dias)
                  </span>
                  <input
                    className="input"
                    defaultValue={service?.recurrenceIntervalDays ?? ""}
                    min={1}
                    name="recurrence"
                    placeholder="Deixe em branco se não repetir"
                    type="number"
                  />
                  <span className="field-help">
                    Usado quando este serviço costuma se repetir em um
                    intervalo fixo de dias.
                  </span>
                </label>
                <label className="check directory-active-control is-wide">
                  <input
                    defaultChecked={service?.active ?? true}
                    name="active"
                    type="checkbox"
                  />
                  <span className="check-box" />
                  <span className="directory-active-copy">
                    <strong>Serviço ativo</strong>
                    <span className="field-help">
                      Serviços inativos não são oferecidos pela IA para novos
                      agendamentos.
                    </span>
                  </span>
                </label>
              </div>
            </details>

            <div className="directory-form-note">
              Antes de alterar duração ou desativar um serviço, revise
              eventuais impactos nos agendamentos futuros.
            </div>
            {message && (
              <div className="directory-inline-error" role="alert">
                {message}
              </div>
            )}
            <div className="directory-form-footer">
              <Link className="btn btn-secondary" href="/servicos">
                Cancelar
              </Link>
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
      </section>
    </>
  );
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}
