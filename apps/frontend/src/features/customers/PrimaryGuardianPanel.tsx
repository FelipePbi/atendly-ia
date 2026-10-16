"use client";

import { useEffect, useMemo, useState } from "react";

import { BffHttpError, type Customer, type CustomerDetail } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { displayPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Field } from "@/shared/ui/Field";
import { ListItem } from "@/shared/ui/ListItem";
import { Spinner } from "@/shared/ui/Spinner";

type Guardian = CustomerDetail["primaryGuardian"];

type PrimaryGuardianPanelProps = {
  customerId: string;
  /** Dentro de uma janela com o mesmo título: sem o título repetido. */
  embedded?: boolean;
  editable: boolean;
  guardian: Guardian;
  onChange: (next: Guardian) => void;
};

const ACTOR_TYPE_LABELS: Record<"AI" | "PROFESSIONAL" | "CUSTOMER", string> = {
  AI: "IA",
  CUSTOMER: "Cliente",
  PROFESSIONAL: "Profissional",
};

export function PrimaryGuardianPanel({
  customerId,
  embedded = false,
  editable,
  guardian,
  onChange,
}: PrimaryGuardianPanelProps) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Customer[] | null>(null);

  useEffect(() => {
    if (!picking) return;
    const controller = new AbortController();
    getProductServices()
      .customers.list({}, controller.signal)
      .then((result) => setCandidates(result.items))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar os clientes."),
          );
      });
    return () => controller.abort();
  }, [picking]);

  const filtered = useMemo(() => {
    const pool = (candidates ?? []).filter(
      (candidate) => candidate.id !== customerId,
    );
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return pool;
    return pool.filter((candidate) =>
      `${candidate.name ?? ""} ${candidate.phone ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized),
    );
  }, [candidates, customerId, query]);

  function openPicker() {
    setError(null);
    setPicking(true);
  }

  function closePicker() {
    setPicking(false);
    setQuery("");
    setCandidates(null);
    setError(null);
  }

  async function propose(guardianCustomerId: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await getProductServices().customers.setPrimaryGuardian(
        customerId,
        { guardianCustomerId, proposedBy: "PROFESSIONAL" },
      );
      onChange(next);
      closePicker();
    } catch (caught: unknown) {
      setError(
        requestError(caught, "Não foi possível propor este responsável."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const next = await getProductServices().customers.confirmPrimaryGuardian(
        customerId,
        { confirmedBy: "PROFESSIONAL" },
      );
      onChange(next);
    } catch (caught: unknown) {
      setError(
        requestError(caught, "Não foi possível confirmar o responsável."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result =
        await getProductServices().customers.clearPrimaryGuardian(customerId);
      onChange(result && "deleted" in result ? null : result);
    } catch (caught: unknown) {
      setError(requestError(caught, "Não foi possível remover o responsável."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={embedded ? "guardian-panel is-embedded" : "directory-section"}
      aria-label="Responsável principal"
    >
      {embedded ? (
        <p className="small muted">
          Quem agenda e decide em nome deste cliente.
        </p>
      ) : (
        <div className="directory-section-header">
          <div>
            <h2>Responsável principal</h2>
            <p>Quem agenda e decide em nome deste cliente.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="customer-inline-error" role="alert">
          {error}
        </div>
      )}

      {picking ? (
        <div className="guardian-picker">
          <Field
            icon="search"
            label="Buscar cliente"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome ou telefone"
            type="search"
            value={query}
          />
          {!candidates ? (
            <Spinner label="Carregando clientes" />
          ) : filtered.length === 0 ? (
            <p className="muted small">Nenhum cliente encontrado.</p>
          ) : (
            <div
              aria-label="Selecionar responsável"
              className="list"
              role="list"
            >
              {filtered.map((candidate) => (
                <ListItem
                  copy={displayPhone(candidate.phone, "Telefone não informado")}
                  disabled={busy}
                  key={candidate.id}
                  onClick={() => void propose(candidate.id)}
                  title={candidate.name || "Cliente sem nome"}
                  trailing={<Icon name="chevron-right" />}
                />
              ))}
            </div>
          )}
          <div className="customer-form-footer">
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={closePicker}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : !guardian ? (
        <>
          <p className="muted small">Nenhum responsável principal definido.</p>
          {editable && (
            <button
              className="btn btn-secondary"
              onClick={openPicker}
              type="button"
            >
              <Icon name="plus" />
              Propor responsável
            </button>
          )}
        </>
      ) : (
        <>
          <div className="directory-readonly-field">
            <span>{guardian.guardian.name || "Cliente sem nome"}</span>
            <strong>
              {displayPhone(guardian.guardian.phone, "Telefone não informado")}
            </strong>
          </div>
          <div className="directory-detail-signals">
            <span
              className={
                guardian.status === "CONFIRMED"
                  ? "badge badge-success"
                  : "badge"
              }
            >
              {guardian.status === "CONFIRMED" ? "Confirmado" : "Proposto"}
            </span>
          </div>
          <div className="directory-timeline">
            <div className="directory-timeline-item">
              <strong>Proposto</strong>
              <span>
                {provenanceLabel(guardian.proposedBy, guardian.proposedByActor)}{" "}
                em {formatDateTime(guardian.proposedAt)}
              </span>
            </div>
            {guardian.status === "CONFIRMED" && (
              <div className="directory-timeline-item">
                <strong>Confirmado</strong>
                <span>
                  {provenanceLabel(
                    guardian.confirmedBy,
                    guardian.confirmedByActor,
                  )}{" "}
                  em {formatDateTime(guardian.confirmedAt)}
                </span>
              </div>
            )}
          </div>
          {editable && (
            <div className="customer-form-footer">
              {guardian.status === "PROPOSED" && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void confirm()}
                  type="button"
                >
                  <Icon name="check" />
                  Confirmar
                </button>
              )}
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={openPicker}
                type="button"
              >
                Trocar responsável
              </button>
              <button
                className="btn btn-tertiary"
                disabled={busy}
                onClick={() => void remove()}
                type="button"
              >
                <Icon name="x" />
                Remover
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function provenanceLabel(
  actorType: "AI" | "PROFESSIONAL" | "CUSTOMER" | null,
  actor: string | null,
): string {
  if (!actorType) return "Não informado";
  const label = ACTOR_TYPE_LABELS[actorType];
  return actor ? `${label} · ${actor}` : label;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    NETWORK_ERROR: "Não foi possível acessar a Avenly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}
