"use client";

import { type FormEvent, useEffect, useId, useState } from "react";

import { BffHttpError, type KnowledgeDocument } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { showToast } from "@/shared/ui/toastBus";

import { formString, SaveActions } from "../settings/shared/fields";

/**
 * Campo livre "Outras informações importantes" (Goal024/WU-04, leitura no
 * Goal067): único documento `BUSINESS_INFO` do negócio, escrito por
 * `PUT /v1/knowledge/other-info` — sem criar um segundo, sem desativar — e
 * lido por `GET /v1/knowledge/other-info` para abrir com o texto salvo.
 */
export function OtherInfoSection() {
  const contentId = useId();
  const [content, setContent] = useState("");
  const [reading, setReading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<KnowledgeDocument | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .knowledge.getOtherInfo(controller.signal)
      .then((result) => {
        setContent(result.content);
        setReading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setReadError(true);
        setReading(false);
      });
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reading || readError) return;
    const data = new FormData(event.currentTarget);
    const value = formString(data, "content").trim();
    if (!value) return;
    setBusy(true);
    setMessage(null);
    try {
      const document =
        await getProductServices().knowledge.saveOtherInfo(value);
      setSaved(document);
      setContent(value);
      setMessage("Informações salvas.");
      showToast("Informações salvas.");
    } catch (caught: unknown) {
      setMessage(requestError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel" id="outras-informacoes">
      <div className="settings-panel-header">
        <div>
          <h2>Outras informações importantes</h2>
          <p>
            Um campo livre para o que não se encaixa nos documentos acima. A IA
            usa este texto com prioridade menor que um documento específico ou
            uma regra de serviço.
          </p>
        </div>
      </div>
      {readError && (
        <p className="field-help" role="alert">
          Não foi possível carregar o texto salvo agora. Atualize a página e
          tente de novo.
        </p>
      )}
      <form className="settings-stack" onSubmit={(event) => void save(event)}>
        <div className="field is-wide">
          <label className="label" htmlFor={contentId}>
            Conteúdo
          </label>
          <textarea
            aria-readonly={reading || readError}
            className="input"
            id={contentId}
            name="content"
            placeholder="Ex.: horário de intervalo, política de atraso, formas de pagamento aceitas..."
            readOnly={reading || readError}
            rows={6}
            value={content}
            onChange={(event) => {
              if (reading || readError) return;
              setContent(event.target.value);
            }}
          />
        </div>
        {saved && (
          <p className="settings-save-note">
            Salvo como versão {saved.version} em{" "}
            {new Date(saved.updatedAt).toLocaleString("pt-BR")}.
          </p>
        )}
        <SaveActions
          busy={busy}
          disabled={reading || readError}
          message={message}
          label="Salvar informações"
        />
      </form>
    </section>
  );
}

function requestError(caught: unknown): string {
  if (caught instanceof BffHttpError) {
    if (
      caught.status === 502 &&
      upstreamCode(caught) === "KNOWLEDGE_INDEX_UNAVAILABLE"
    ) {
      return "Não foi possível indexar o conteúdo agora. Nada foi salvo.";
    }
    return `Não foi possível salvar. Referência: ${caught.requestId}`;
  }
  return "Não foi possível salvar as informações.";
}

function upstreamCode(error: BffHttpError): string | undefined {
  const details = error.details;
  if (!details || typeof details !== "object") return undefined;
  const value = (details as { upstreamCode?: unknown }).upstreamCode;
  return typeof value === "string" ? value : undefined;
}
