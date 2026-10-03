"use client";

import { type FormEvent, useState } from "react";

import { BffHttpError, type CustomerTag } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Field } from "@/shared/ui/Field";

import { AuthorizationControl } from "./AuthorizationControl";

type CustomerTagsProps = {
  customerId: string;
  tags: CustomerTag[];
  onChange: (next: CustomerTag[]) => void;
};

export function CustomerTags({
  customerId,
  tags,
  onChange,
}: CustomerTagsProps) {
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = formText(data, "label");
    if (!label) return;
    setBusyId("new");
    setError(null);
    try {
      const created = await getProductServices().customers.createTag(
        customerId,
        { label },
      );
      onChange([...tags, created]);
      setCreating(false);
    } catch (caught: unknown) {
      setError(requestError(caught, "Não foi possível criar a tag."));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAuthorization(tag: CustomerTag) {
    setBusyId(tag.id);
    setError(null);
    try {
      const updated = await getProductServices().customers.setTagAuthorization(
        customerId,
        tag.id,
        !tag.aiAuthorized,
      );
      onChange(tags.map((item) => (item.id === tag.id ? updated : item)));
    } catch (caught: unknown) {
      setError(
        requestError(
          caught,
          "Não foi possível alterar a autorização desta tag.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeTag(tag: CustomerTag) {
    setBusyId(tag.id);
    setError(null);
    try {
      await getProductServices().customers.deleteTag(customerId, tag.id);
      onChange(tags.filter((item) => item.id !== tag.id));
    } catch (caught: unknown) {
      setError(requestError(caught, "Não foi possível remover esta tag."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Tags" className="customer-tags">
      <h2 className="customer-field-label">Tags</h2>

      {error && (
        <div className="customer-inline-error" role="alert">
          {error}
        </div>
      )}

      <div className="customer-tag-card">
        {tags.map((tag) => (
          <div className="customer-tag-row" key={tag.id}>
            <span className="customer-tag-label">{tag.label}</span>
            <AuthorizationControl
              authorized={tag.aiAuthorized}
              busy={busyId === tag.id}
              onToggle={() => void toggleAuthorization(tag)}
              subject={tag.label}
              variant="tag"
            />
            <button
              aria-label={`Remover tag ${tag.label}`}
              className="customer-tag-remove"
              disabled={busyId === tag.id}
              onClick={() => void removeTag(tag)}
              type="button"
            >
              <Icon name="x" />
            </button>
          </div>
        ))}

        {creating ? (
          <form
            className="customer-tag-form"
            onSubmit={(event) => void createTag(event)}
          >
            <Field
              label="Tag"
              maxLength={60}
              name="label"
              placeholder="Ex.: prefere horário da manhã"
              required
            />
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
                {busyId === "new" ? "Criando..." : "Criar tag"}
              </button>
            </div>
          </form>
        ) : (
          <button
            aria-label="Adicionar tag"
            className="customer-tag-add"
            onClick={() => setCreating(true)}
            type="button"
          >
            <Icon name="plus" />
            <span>Adicionar tag</span>
            <span aria-hidden="true" className="customer-tag-add-hint">
              ex.: Noiva, Gestante, Fiel
            </span>
          </button>
        )}
      </div>

      {tags.length === 0 && !creating && (
        <p className="muted small">Nenhuma tag cadastrada.</p>
      )}
    </section>
  );
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
