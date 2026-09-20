"use client";

import { type FormEvent, useId, useState } from "react";

import { BffHttpError, type CustomerNote } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { AuthorizationControl } from "./AuthorizationControl";

type CustomerNotesProps = {
  customerId: string;
  notes: CustomerNote[];
  onChange: (next: CustomerNote[]) => void;
};

export function CustomerNotes({
  customerId,
  notes,
  onChange,
}: CustomerNotesProps) {
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyId = useId();

  async function createNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = formText(data, "body");
    if (!body) return;
    setBusyId("new");
    setError(null);
    try {
      const created = await getProductServices().customers.createNote(
        customerId,
        { body },
      );
      onChange([created, ...notes]);
      setCreating(false);
    } catch (caught: unknown) {
      setError(
        requestError(caught, "Não foi possível registrar a observação."),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAuthorization(note: CustomerNote) {
    setBusyId(note.id);
    setError(null);
    try {
      const updated = await getProductServices().customers.setNoteAuthorization(
        customerId,
        note.id,
        !note.aiAuthorized,
      );
      onChange(notes.map((item) => (item.id === note.id ? updated : item)));
    } catch (caught: unknown) {
      setError(
        requestError(
          caught,
          "Não foi possível alterar a autorização desta observação.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeNote(note: CustomerNote) {
    setBusyId(note.id);
    setError(null);
    try {
      await getProductServices().customers.deleteNote(customerId, note.id);
      onChange(notes.filter((item) => item.id !== note.id));
    } catch (caught: unknown) {
      setError(
        requestError(caught, "Não foi possível remover esta observação."),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Observações" className="directory-section">
      <div className="directory-section-header">
        <div>
          <h2>Observações</h2>
          <p>
            Registros internos. Por padrão a IA não pode usá-los; autorize um
            por um quando fizer sentido.
          </p>
        </div>
        {!creating && (
          <button
            className="btn btn-secondary"
            onClick={() => setCreating(true)}
            type="button"
          >
            <Icon name="plus" />
            Nova observação
          </button>
        )}
      </div>

      {error && (
        <div className="customer-inline-error" role="alert">
          {error}
        </div>
      )}

      {creating && (
        <form
          className="customer-record-form"
          onSubmit={(event) => void createNote(event)}
        >
          <div className="field">
            <label className="label" htmlFor={bodyId}>
              Observação
            </label>
            <textarea
              className="input customer-record-textarea"
              id={bodyId}
              maxLength={2000}
              name="body"
              placeholder="Evite registrar informações pessoais que não sejam necessárias para o atendimento."
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
              {busyId === "new" ? "Salvando..." : "Salvar observação"}
            </button>
          </div>
        </form>
      )}

      {notes.length === 0 && !creating ? (
        <p className="muted small">Nenhuma observação registrada.</p>
      ) : (
        <div className="customer-record-list">
          {notes.map((note) => (
            <article className="customer-record" key={note.id}>
              <p className="customer-record-body">{note.body}</p>
              <p className="customer-record-meta">
                Registrada em {formatDateTime(note.createdAt)}
              </p>
              <AuthorizationControl
                authorized={note.aiAuthorized}
                busy={busyId === note.id}
                onToggle={() => void toggleAuthorization(note)}
              />
              <div className="customer-form-footer">
                <button
                  className="btn btn-tertiary"
                  disabled={busyId === note.id}
                  onClick={() => void removeNote(note)}
                  type="button"
                >
                  <Icon name="x" />
                  Remover
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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
