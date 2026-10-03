"use client";

import Link from "next/link";
import { type FormEvent, type Ref, useEffect, useRef, useState } from "react";

import type { BusinessModality, SettingsState } from "@/data";
import {
  BUSINESS_MODALITY_OPTIONS,
  FREQUENT_BUSINESS_SEGMENTS,
} from "@/features/onboarding/blocks/business";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

export function BusinessSettings({
  headingLevel = "h1",
  settings,
  onSaved,
}: {
  headingLevel?: "h1" | "h2";
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  const { refreshSession } = useProductRuntime();
  const [name, setName] = useState(settings.business?.name ?? "");
  const [category, setCategory] = useState(settings.business?.category ?? "");
  const [customSegment, setCustomSegment] = useState(
    () =>
      !!settings.business?.category &&
      !FREQUENT_BUSINESS_SEGMENTS.includes(settings.business.category),
  );
  const [modalities, setModalities] = useState<BusinessModality[]>(
    settings.business?.modalities ?? [],
  );
  const [address, setAddress] = useState(settings.business?.address ?? "");
  const [timezone, setTimezone] = useState(
    settings.business?.timezone ?? "America/Sao_Paulo",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const knowledge = useKnowledgeSummary();
  // N1 não tem formulário permanente: a linha com `›` abre o editor na própria
  // tela empurrada, e "Cancelar" volta às linhas sem salvar nada.
  const [editing, setEditing] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef(false);
  useEffect(() => {
    if (editing) {
      nameInputRef.current?.focus();
      return;
    }
    if (!returnFocusRef.current) return;
    returnFocusRef.current = false;
    summaryRef.current
      ?.querySelector<HTMLButtonElement>("button.business-row")
      ?.focus();
  }, [editing]);
  function cancelEditing() {
    setName(settings.business?.name ?? "");
    setCategory(settings.business?.category ?? "");
    setCustomSegment(
      !!settings.business?.category &&
        !FREQUENT_BUSINESS_SEGMENTS.includes(settings.business.category),
    );
    setModalities(settings.business?.modalities ?? []);
    setAddress(settings.business?.address ?? "");
    setTimezone(settings.business?.timezone ?? "America/Sao_Paulo");
    setMessage(null);
    returnFocusRef.current = true;
    setEditing(false);
  }
  const [timezoneConfirmationOpen, setTimezoneConfirmationOpen] =
    useState(false);
  const requiresAddress = modalities.includes("ON_SITE");
  const pendingProjection =
    settings.business?.contextProjectionStatus === "PENDING";
  async function save(event: FormEvent) {
    event.preventDefault();
    if (modalities.length === 0) {
      setMessage("Escolha ao menos uma modalidade de atendimento.");
      return;
    }
    if (requiresAddress && !address.trim()) {
      setMessage("Informe o endereço do seu espaço.");
      return;
    }
    if (timezone !== settings.business?.timezone) {
      setTimezoneConfirmationOpen(true);
      return;
    }
    await persist();
  }
  async function persist() {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(
        await getProductServices().settings.updateBusiness({
          ...(requiresAddress ? { address: address.trim() } : {}),
          category,
          modalities,
          name,
          timezone,
        }),
      );
      await refreshSession();
      setTimezoneConfirmationOpen(false);
      setMessage("Dados do negócio salvos.");
    } catch {
      setMessage("Não foi possível salvar os dados.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-page business-screen">
      <PushedBar
        backHref="/configuracoes"
        backLabel="Voltar para configurações"
        headingLevel={headingLevel}
        hideBackWide
        title="Negócio"
      />
      {!editing && (
        <BusinessSummary
          knowledge={knowledge}
          ref={summaryRef}
          settings={settings}
          onEdit={() => setEditing(true)}
        />
      )}
      {editing && (
        <form
          aria-label="Editar dados do negócio"
          className="business-form"
          id="business-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="settings-form-grid">
            <label className="field">
              <span className="label">Nome do negócio</span>
              <input
                className="input"
                minLength={2}
                ref={nameInputRef}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="field is-wide">
              <span className="label">Qual é o seu segmento?</span>
              <div className="chip-row">
                {FREQUENT_BUSINESS_SEGMENTS.map((segment) => (
                  <button
                    className={`chip${!customSegment && category === segment ? " is-active" : ""}`}
                    key={segment}
                    type="button"
                    onClick={() => {
                      setCustomSegment(false);
                      setCategory(segment);
                    }}
                  >
                    {segment}
                  </button>
                ))}
                <button
                  className={`chip${customSegment ? " is-active" : ""}`}
                  type="button"
                  onClick={() => {
                    setCustomSegment(true);
                    setCategory("");
                  }}
                >
                  Outro
                </button>
              </div>
              {customSegment && (
                <input
                  className="input"
                  required
                  placeholder="Qual é o seu segmento?"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                />
              )}
            </div>
            <label className="field">
              <span className="label">Idioma</span>
              <span className="input-wrap">
                <select className="select" disabled value="pt-BR">
                  <option value="pt-BR">Português (Brasil)</option>
                </select>
                <span className="select-icon">
                  <Icon name="chevron-down" />
                </span>
              </span>
            </label>
            <label className="field">
              <span className="label">Moeda</span>
              <span className="input-wrap">
                <select className="select" disabled value="BRL">
                  <option value="BRL">Real brasileiro (BRL)</option>
                </select>
                <span className="select-icon">
                  <Icon name="chevron-down" />
                </span>
              </span>
            </label>
            <label className="field is-wide">
              <span className="label">Fuso horário</span>
              <span className="input-wrap">
                <select
                  className="select"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  <option value="America/Sao_Paulo">Brasília (GMT−3)</option>
                  <option value="America/Manaus">Manaus (GMT−4)</option>
                  <option value="America/Rio_Branco">Rio Branco (GMT−5)</option>
                </select>
                <span className="select-icon">
                  <Icon name="chevron-down" />
                </span>
              </span>
              <span className="field-help">
                A mudança exige revisão porque altera horários futuros.
              </span>
            </label>
            <div className="field is-wide">
              <span className="label">Modalidade de atendimento</span>
              <div className="choice-grid">
                {BUSINESS_MODALITY_OPTIONS.map((option) => {
                  const selected = modalities.includes(option.value);
                  return (
                    <label
                      className={`choice-card${selected ? " is-selected" : ""}`}
                      key={option.value}
                    >
                      <input
                        checked={selected}
                        className="sr-only"
                        type="checkbox"
                        onChange={(event) =>
                          setModalities((current) =>
                            event.target.checked
                              ? [...current, option.value]
                              : current.filter((item) => item !== option.value),
                          )
                        }
                      />
                      <h3>{option.title}</h3>
                      <p>{option.copy}</p>
                    </label>
                  );
                })}
              </div>
            </div>
            {requiresAddress && (
              <label className="field is-wide">
                <span className="label">Endereço do seu espaço</span>
                <input
                  className="input"
                  maxLength={300}
                  required
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </label>
            )}
          </div>
          {pendingProjection && (
            <div className="onboarding-note is-important">
              <Icon name="info" />
              <span>
                Os dados do negócio foram salvos. A IA ainda está atualizando o
                contexto com essa mudança.
              </span>
            </div>
          )}
          <div className="settings-form-actions">
            <span className="settings-save-note" role="status">
              {message}
            </span>
            <button
              className="btn btn-secondary"
              disabled={busy}
              type="button"
              onClick={cancelEditing}
            >
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      )}
      <Dialog
        eyebrow="Revisão necessária"
        onClose={() => setTimezoneConfirmationOpen(false)}
        open={timezoneConfirmationOpen}
        title="Alterar fuso horário?"
      >
        <p className="settings-modal-copy">
          Horários futuros passarão a usar o novo fuso. Revise disponibilidade,
          bloqueios e próximos atendimentos depois da mudança.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={() => setTimezoneConfirmationOpen(false)}
          >
            Manter fuso atual
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            type="button"
            onClick={() => void persist()}
          >
            {busy ? "Salvando..." : "Alterar fuso"}
          </button>
        </div>
      </Dialog>
    </section>
  );
}

type SummaryRow = {
  /** A linha abre o editor dos dados do negócio; sem isso ela é só leitura. */
  editable?: boolean;
  /** A linha leva a outra rota. */
  href?: string;
  label: string;
  /** `undefined`: ainda sem leitura, a linha fica sem segunda linha. */
  value?: string | null;
};

const NOT_INFORMED = "Não informado";
const OTHER_INFO_PREVIEW_LENGTH = 120;

/** `undefined` enquanto a leitura carrega ou falha; `null` quando lida e vazia. */
type KnowledgeSummary = {
  faq: string | null | undefined;
  otherInfo: string | null | undefined;
};

function useKnowledgeSummary(): KnowledgeSummary {
  const [summary, setSummary] = useState<KnowledgeSummary>({
    faq: undefined,
    otherInfo: undefined,
  });
  useEffect(() => {
    const controller = new AbortController();
    const services = getProductServices();
    services.knowledge
      .list({}, controller.signal)
      .then((documents) => {
        const count = documents.filter(
          (item) => item.type !== "BUSINESS_INFO" && item.status !== "INACTIVE",
        ).length;
        setSummary((current) => ({
          ...current,
          faq: count === 0 ? null : count === 1 ? "1 item" : `${count} itens`,
        }));
      })
      .catch(() => undefined);
    services.knowledge
      .getOtherInfo(controller.signal)
      .then(({ content }) => {
        const text = content.trim().replace(/\s+/g, " ");
        setSummary((current) => ({
          ...current,
          otherInfo: text ? text.slice(0, OTHER_INFO_PREVIEW_LENGTH) : null,
        }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return summary;
}

function BusinessSummary({
  knowledge,
  onEdit,
  ref,
  settings,
}: {
  knowledge: KnowledgeSummary;
  onEdit: () => void;
  ref: Ref<HTMLDivElement>;
  settings: SettingsState;
}) {
  const business = settings.business;
  const modalities = (business?.modalities ?? [])
    .map(
      (value) =>
        BUSINESS_MODALITY_OPTIONS.find((option) => option.value === value)
          ?.title,
    )
    .filter((title): title is string => Boolean(title));
  const groups: Array<{ rows: SummaryRow[]; title: string }> = [
    {
      title: "Identidade",
      rows: [
        { editable: true, label: "Nome", value: business?.name ?? null },
        {
          editable: true,
          label: "Segmento",
          value: business?.category ?? null,
        },
        {
          editable: true,
          label: "Onde você atende",
          value: modalities.length > 0 ? modalities.join(", ") : null,
        },
      ],
    },
    {
      title: "Endereço e chegada",
      rows: [
        { editable: true, label: "Endereço", value: business?.address ?? null },
        { label: "Como chegar", value: null },
        { label: "Estacionamento", value: null },
        { label: "Acessibilidade", value: null },
      ],
    },
    {
      title: "Pagamento",
      rows: [{ label: "Formas e parcelamento", value: null }],
    },
    { title: "Presença", rows: [{ label: "Instagram", value: null }] },
    {
      title: "O que a IA sabe responder",
      rows: [
        {
          href: "/configuracoes/negocio/perguntas-frequentes",
          label: "Perguntas frequentes",
          value: knowledge.faq,
        },
        {
          href: "/configuracoes/negocio/perguntas-frequentes#outras-informacoes",
          label: "Outras informações",
          value: knowledge.otherInfo,
        },
      ],
    },
  ];
  return (
    <div className="business-summary" ref={ref}>
      {groups.map((group) => (
        <section className="business-group" key={group.title}>
          <h2 className="business-group-title">{group.title}</h2>
          {group.rows.map((row) => {
            const content = (
              <>
                <span className="business-row-label">{row.label}</span>
                <span
                  className={
                    row.value === null
                      ? "business-row-value is-empty"
                      : "business-row-value"
                  }
                >
                  {row.value !== undefined && (
                    <span className="business-row-text">
                      {row.value ?? NOT_INFORMED}
                    </span>
                  )}
                  {(row.editable || row.href) && (
                    <Icon name="chevron-right" />
                  )}
                </span>
              </>
            );
            if (row.href) {
              return (
                <Link className="business-row" href={row.href} key={row.label}>
                  {content}
                </Link>
              );
            }
            return row.editable ? (
              <button
                className="business-row"
                key={row.label}
                type="button"
                onClick={onEdit}
              >
                {content}
              </button>
            ) : (
              <div className="business-row" key={row.label}>
                {content}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
