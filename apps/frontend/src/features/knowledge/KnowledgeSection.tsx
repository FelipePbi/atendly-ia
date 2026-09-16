"use client";

import { useEffect, useState } from "react";

import { BffHttpError, type KnowledgeDocument, type Service } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { Skeleton } from "@/shared/ui/States";

import { KNOWLEDGE_TYPE_LABELS, KnowledgeDocumentForm } from "./KnowledgeDocumentForm";

/**
 * Conhecimento do negócio editável (Goal024/WU-04, Goal012/§Conhecimento):
 * documentos versionados que a IA usa como referência — FAQ, orientação,
 * cuidado, procedimento e política, gerais ou ligados a um serviço do
 * catálogo. `BUSINESS_INFO` (o campo livre "Outras informações importantes")
 * é excluído desta lista de propósito: ele vive em `OtherInfoSection`, sem
 * criar/editar/desativar aqui, porque o contrato reserva esse type ao
 * `PUT /v1/knowledge/other-info`.
 *
 * `GET /v1/knowledge/documents` nunca devolve o conteúdo indexado (só
 * metadado: título, tipo, serviço, versão, checksum), então editar aqui
 * sempre pede o texto de novo — não é possível pré-preencher com o conteúdo
 * salvo antes.
 */
export function KnowledgeSection() {
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null);
  const [deactivating, setDeactivating] = useState<KnowledgeDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getProductServices().knowledge.list({}, controller.signal),
      getProductServices().serviceCatalog.list(controller.signal),
    ])
      .then(([documentList, serviceList]) => {
        setDocuments(documentList.filter((item) => item.type !== "BUSINESS_INFO"));
        setServices(serviceList.items);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(
            requestError(
              caught,
              "Não foi possível carregar o conhecimento do negócio.",
            ),
          );
      });
    return () => controller.abort();
  }, [reload]);

  function serviceName(serviceId: string | null): string {
    if (!serviceId) return "Geral";
    return services.find((service) => service.id === serviceId)?.name ?? "Serviço não encontrado";
  }

  function upsertDocument(document: KnowledgeDocument, previousId?: string) {
    setDocuments((current) => {
      const list = current ?? [];
      const matchId = previousId ?? document.id;
      const index = list.findIndex((item) => item.id === matchId);
      if (index === -1) return [document, ...list];
      const next = [...list];
      next[index] = document;
      return next;
    });
  }

  async function deactivate() {
    if (!deactivating) return;
    setBusy(true);
    setFeedback(null);
    try {
      await getProductServices().knowledge.deactivate(deactivating.id);
      setDocuments((current) =>
        (current ?? []).filter((item) => item.id !== deactivating.id),
      );
      setFeedback(
        "Documento desativado: ele sai do contexto usado pela IA. Nada foi apagado.",
      );
      setDeactivating(null);
    } catch (caught: unknown) {
      setFeedback(
        requestError(caught, "Não foi possível desativar este documento."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <div>
          <h2>Conhecimento do negócio</h2>
          <p>
            Documentos que a IA usa para responder: perguntas frequentes,
            orientações, cuidados, procedimentos e políticas — gerais ou
            ligados a um serviço.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => setCreating(true)}
        >
          <Icon name="plus" />
          Novo documento
        </button>
      </div>

      {feedback && (
        <p className="settings-save-note" role="status">
          {feedback}
        </p>
      )}

      {!documents && !loadError ? (
        <div aria-busy="true" className="settings-stack">
          <Skeleton style={{ width: "100%", height: 56 }} />
          <Skeleton style={{ width: "100%", height: 56 }} />
        </div>
      ) : loadError ? (
        <div className="settings-inline-message" role="alert">
          <p>{loadError}</p>
          <button
            className="btn btn-tertiary"
            type="button"
            onClick={() => {
              setLoadError(null);
              setDocuments(null);
              setReload((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : documents && documents.length === 0 ? (
        <p className="muted small">Nenhum documento cadastrado ainda.</p>
      ) : (
        <div className="knowledge-list">
          {documents?.map((document) => (
            <div className="knowledge-row" key={document.id}>
              <div className="knowledge-row-copy">
                <strong>{document.title}</strong>
                <span>
                  {KNOWLEDGE_TYPE_LABELS[document.type]} ·{" "}
                  {serviceName(document.serviceId)}
                </span>
              </div>
              <div className="knowledge-row-actions">
                <button
                  className="btn btn-tertiary"
                  type="button"
                  onClick={() => setEditing(document)}
                >
                  Editar
                </button>
                <button
                  className="btn btn-tertiary"
                  type="button"
                  onClick={() => setDeactivating(document)}
                >
                  Desativar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <KnowledgeDocumentForm
        mode="create"
        open={creating}
        services={services}
        onClose={() => setCreating(false)}
        onSaved={(document) => {
          upsertDocument(document);
          setCreating(false);
          setFeedback("Documento criado.");
        }}
      />
      <KnowledgeDocumentForm
        document={editing}
        mode="edit"
        open={editing !== null}
        services={services}
        onClose={() => setEditing(null)}
        onSaved={(document) => {
          upsertDocument(document, editing?.id);
          setEditing(null);
          setFeedback(
            "Nova versão publicada. A versão anterior não foi apagada.",
          );
        }}
      />

      <Dialog
        eyebrow="Conhecimento"
        onClose={() => !busy && setDeactivating(null)}
        open={deactivating !== null}
        title="Desativar este documento?"
      >
        <p className="settings-modal-copy">
          O documento sai do contexto que a IA usa para responder. Nada é
          apagado: as versões continuam guardadas.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={() => setDeactivating(null)}
          >
            Manter ativo
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            type="button"
            onClick={() => void deactivate()}
          >
            {busy ? "Salvando..." : "Desativar documento"}
          </button>
        </div>
      </Dialog>
    </section>
  );
}

function requestError(caught: unknown, fallback: string): string {
  if (!(caught instanceof BffHttpError)) return fallback;
  return `${fallback} Referência: ${caught.requestId}`;
}
