"use client";

import { type FormEvent, useState } from "react";

import {
  BffHttpError,
  type KnowledgeDocument,
  type KnowledgeDocumentType,
  type Service,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import { formString } from "../settings/shared/fields";

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeDocumentType, string> = {
  FAQ: "Pergunta frequente",
  GUIDANCE: "Orientação",
  CARE: "Cuidado",
  PROCEDURE: "Procedimento",
  BUSINESS_INFO: "Outras informações importantes",
  TEXT_POLICY: "Política",
};

/**
 * `BUSINESS_INFO` e reservado ao campo livre (`PUT /v1/knowledge/other-info`);
 * o contrato recusa esse type em POST/PUT de documento com 409
 * (`KNOWLEDGE_BUSINESS_INFO_RESERVED`), entao nunca aparece aqui.
 */
export const CREATABLE_KNOWLEDGE_TYPES: KnowledgeDocumentType[] = [
  "FAQ",
  "GUIDANCE",
  "CARE",
  "PROCEDURE",
  "TEXT_POLICY",
];

export function KnowledgeDocumentForm({
  document,
  mode,
  onClose,
  onSaved,
  open,
  services,
}: {
  document?: KnowledgeDocument | null;
  mode: "create" | "edit";
  onClose: () => void;
  onSaved: (document: KnowledgeDocument) => void;
  open: boolean;
  services: Service[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = formString(data, "title").trim();
    const content = formString(data, "content").trim();
    const serviceId = formString(data, "serviceId");
    if (!title || !content) return;
    setBusy(true);
    setError(null);
    try {
      const saved =
        mode === "create"
          ? await getProductServices().knowledge.create({
              type: formString(data, "type") as KnowledgeDocumentType,
              serviceId: serviceId || undefined,
              title,
              chunks: [{ content }],
            })
          : await getProductServices().knowledge.edit(document!.id, {
              title,
              serviceId: serviceId || null,
              chunks: [{ content }],
            });
      onSaved(saved);
    } catch (caught: unknown) {
      setError(requestError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      eyebrow="Conhecimento do negócio"
      onClose={() => !busy && onClose()}
      open={open}
      title={
        mode === "create"
          ? "Novo documento"
          : `Editar "${document?.title ?? ""}"`
      }
    >
      <form
        className="settings-form-grid"
        onSubmit={(event) => void submit(event)}
      >
        {mode === "create" ? (
          <label className="field">
            <span className="label">Tipo</span>
            <select
              className="select"
              defaultValue={CREATABLE_KNOWLEDGE_TYPES[0]}
              name="type"
            >
              {CREATABLE_KNOWLEDGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {KNOWLEDGE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="field">
            <span className="label">Tipo</span>
            <p className="settings-modal-copy">
              {document ? KNOWLEDGE_TYPE_LABELS[document.type] : ""}
            </p>
          </div>
        )}
        <label className="field">
          <span className="label">Serviço ligado</span>
          <select
            className="select"
            defaultValue={document?.serviceId ?? ""}
            name="serviceId"
          >
            <option value="">Geral (todos os serviços)</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field is-wide">
          <span className="label">Título</span>
          <input
            className="input"
            defaultValue={document?.title ?? ""}
            name="title"
            required
            type="text"
          />
        </label>
        <label className="field is-wide">
          <span className="label">Conteúdo</span>
          <textarea
            className="input"
            name="content"
            placeholder="Escreva o texto que a IA deve usar como referência."
            required
            rows={6}
          />
        </label>
        {mode === "edit" && (
          <p className="settings-modal-copy is-wide">
            Publicar aqui cria uma versão nova deste documento; a versão
            vigente não é apagada. O conteúdo salvo não é reexibido: escreva
            o texto completo da nova versão, não só o que mudou.
          </p>
        )}
        {error && (
          <p className="field-help is-wide" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions is-wide">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy
              ? "Salvando..."
              : mode === "create"
                ? "Criar documento"
                : "Publicar nova versão"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function requestError(caught: unknown): string {
  if (caught instanceof BffHttpError) {
    if (caught.status === 502 && upstreamCode(caught) === "KNOWLEDGE_INDEX_UNAVAILABLE") {
      return "Não foi possível indexar o conteúdo agora. Nada foi salvo.";
    }
    return `Não foi possível salvar este documento. Referência: ${caught.requestId}`;
  }
  return "Não foi possível salvar este documento.";
}

function upstreamCode(error: BffHttpError): string | undefined {
  const details = error.details;
  if (!details || typeof details !== "object") return undefined;
  const value = (details as { upstreamCode?: unknown }).upstreamCode;
  return typeof value === "string" ? value : undefined;
}
