"use client";

import { type FormEvent, useEffect, useId, useState } from "react";

import {
  BffHttpError,
  type CustomerMemory as CustomerMemoryEntry,
  type CustomerMemoryKind,
  type CustomerMemoryOrigin,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Spinner } from "@/shared/ui/Spinner";
import { StatePanel } from "@/shared/ui/States";

import { AuthorizationControl } from "./AuthorizationControl";

type CustomerMemoryProps = { customerId: string };

const KIND_LABELS: Record<CustomerMemoryKind, string> = {
  OBSERVATION: "Observação",
  PREFERRED_DAY: "Dia preferido",
  PREFERRED_PERIOD: "Período preferido",
  RECURRING_SERVICE: "Serviço recorrente",
};

const ORIGIN_LABELS: Record<CustomerMemoryOrigin, string> = {
  AI_INFERRED: "percebida pela IA",
  CUSTOMER_STATED: "informada pela cliente",
  PROFESSIONAL: "cadastrada por você",
};

export function CustomerMemory({ customerId }: CustomerMemoryProps) {
  const [entries, setEntries] = useState<CustomerMemoryEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const kindId = useId();
  const valueId = useId();

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .customers.listMemory(customerId, controller.signal)
      .then((result) =>
        setEntries(
          [...result].sort((a, b) => b.observedAt.localeCompare(a.observedAt)),
        ),
      )
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(
            requestError(
              caught,
              "Não foi possível carregar a memória do cliente.",
            ),
          );
      });
    return () => controller.abort();
  }, [customerId, reload]);

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const kind = data.get("kind") as CustomerMemoryKind;
    const value = formText(data, "value");
    if (!value) return;
    setBusyId("new");
    setFormError(null);
    try {
      const created = await getProductServices().customers.createMemory(
        customerId,
        { kind, value },
      );
      setEntries((current) => [created, ...(current ?? [])]);
      setCreating(false);
    } catch (caught: unknown) {
      setFormError(
        requestError(caught, "Não foi possível cadastrar esta memória."),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function togglePermission(entry: CustomerMemoryEntry) {
    setBusyId(entry.id);
    setFormError(null);
    try {
      const updated = await getProductServices().customers.setMemoryPermission(
        customerId,
        entry.id,
        !entry.aiAllowed,
      );
      setEntries((current) =>
        (current ?? []).map((item) => (item.id === entry.id ? updated : item)),
      );
    } catch (caught: unknown) {
      setFormError(
        requestError(
          caught,
          "Não foi possível alterar a permissão desta memória.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeEntry(entry: CustomerMemoryEntry) {
    setBusyId(entry.id);
    setFormError(null);
    try {
      await getProductServices().customers.deleteMemory(customerId, entry.id);
      setEntries((current) =>
        (current ?? []).filter((item) => item.id !== entry.id),
      );
    } catch (caught: unknown) {
      setFormError(
        requestError(caught, "Não foi possível remover esta memória."),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Preferências do cliente" className="directory-section">
      <div className="directory-section-header">
        <div>
          <h2>Preferências</h2>
          <p>
            O que você e a IA percebem sobre esta pessoa. Uma preferência
            cadastrada por você só é usada pela IA depois que você autoriza.
          </p>
        </div>
        {!creating && (
          <button
            className="btn btn-secondary"
            onClick={() => setCreating(true)}
            type="button"
          >
            <Icon name="plus" />
            Cadastrar preferência
          </button>
        )}
      </div>

      {loadError && (
        <StatePanel
          actionLabel="Tentar novamente"
          description={loadError}
          icon="alert"
          onAction={() => {
            setLoadError(null);
            setEntries(null);
            setReload((value) => value + 1);
          }}
          title="Preferências indisponíveis"
          tone="error"
        />
      )}
      {formError && (
        <div className="customer-inline-error" role="alert">
          {formError}
        </div>
      )}

      {creating && (
        <form
          className="customer-record-form"
          onSubmit={(event) => void createEntry(event)}
        >
          <div className="field">
            <label className="label" htmlFor={kindId}>
              Tipo
            </label>
            <select
              className="select"
              defaultValue="OBSERVATION"
              id={kindId}
              name="kind"
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={valueId}>
              Descrição
            </label>
            <textarea
              className="input customer-record-textarea"
              id={valueId}
              maxLength={500}
              name="value"
              placeholder="Ex.: prefere atendimentos no fim da tarde"
              required
            />
          </div>
          <div className="customer-form-footer">
            <button
              className="btn btn-secondary"
              disabled={busyId === "new"}
              onClick={() => setCreating(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              disabled={busyId === "new"}
              type="submit"
            >
              {busyId === "new" ? "Salvando..." : "Salvar memória"}
            </button>
          </div>
        </form>
      )}

      {!entries && !loadError ? (
        <Spinner label="Carregando memória do cliente" />
      ) : entries && entries.length === 0 && !creating ? (
        <p className="muted small">Nenhuma memória registrada.</p>
      ) : entries ? (
        <div className="customer-record-list">
          {entries.map((entry) => (
            <article className="customer-record" key={entry.id}>
              <p className="customer-record-body">{entry.value}</p>
              <p className="customer-record-meta">
                {KIND_LABELS[entry.kind]} · {ORIGIN_LABELS[entry.origin]} ·{" "}
                {formatAge(entry.observedAt)}
              </p>
              <AuthorizationControl
                authorized={entry.aiAllowed}
                busy={busyId === entry.id}
                onToggle={() => void togglePermission(entry)}
              />
              <div className="customer-form-footer">
                <button
                  className="btn btn-tertiary"
                  disabled={busyId === entry.id}
                  onClick={() => void removeEntry(entry)}
                  type="button"
                >
                  <Icon name="x" />
                  Remover
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatAge(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const diffMinutes = Math.round(diffMs / 60_000);
  if (Math.abs(diffMinutes) < 60) return rtf.format(-diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(-diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return rtf.format(-diffDays, "day");
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return rtf.format(-diffMonths, "month");
  return rtf.format(-Math.round(diffMonths / 12), "year");
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    NETWORK_ERROR: "Não foi possível acessar a Atendly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}
