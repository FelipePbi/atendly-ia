"use client";

import { type FormEvent, useId, useState } from "react";

import { BffHttpError, type KnowledgeDocument } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { formString, SaveActions } from "../settings/shared/fields";

/**
 * Campo livre "Outras informações importantes" (Goal024/WU-04): único
 * documento `BUSINESS_INFO` do negócio, só acessível por
 * `PUT /v1/knowledge/other-info` — sem criar um segundo, sem desativar.
 *
 * Não há rota que devolva o conteúdo salvo (o schema de `KnowledgeDocument`
 * nunca inclui o texto indexado, só metadado), então este campo é
 * intencionalmente de escrita: a caixa nasce vazia a cada carregamento e a
 * confirmação de "salvo" vem da resposta do próprio `PUT`, não de uma leitura
 * anterior.
 */
export function OtherInfoSection() {
  const contentId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<KnowledgeDocument | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const content = formString(data, "content").trim();
    if (!content) return;
    setBusy(true);
    setMessage(null);
    try {
      const document = await getProductServices().knowledge.saveOtherInfo(content);
      setSaved(document);
      setMessage("Informações salvas.");
    } catch (caught: unknown) {
      setMessage(requestError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <div>
          <h2>Outras informações importantes</h2>
          <p>
            Um campo livre para o que não se encaixa nos documentos acima. A
            IA usa este texto com prioridade menor que um documento
            específico ou uma regra de serviço.
          </p>
          <p className="settings-modal-copy">
            O conteúdo salvo não é reexibido aqui: esta caixa nasce vazia a
            cada vez que você abre a tela. Escreva o texto completo sempre
            que salvar, mesmo que já exista uma versão anterior.
          </p>
        </div>
      </div>
      <form className="settings-stack" onSubmit={(event) => void save(event)}>
        <div className="field is-wide">
          <label className="label" htmlFor={contentId}>
            Conteúdo
          </label>
          <textarea
            className="input"
            id={contentId}
            name="content"
            placeholder="Ex.: horário de intervalo, política de atraso, formas de pagamento aceitas..."
            rows={6}
          />
        </div>
        {saved && (
          <p className="settings-save-note">
            Salvo como versão {saved.version} em{" "}
            {new Date(saved.updatedAt).toLocaleString("pt-BR")}.
          </p>
        )}
        <SaveActions busy={busy} message={message} label="Salvar informações" />
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
