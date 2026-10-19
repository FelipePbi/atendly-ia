"use client";

import { useCallback, useId, useState } from "react";

import {
  type AiMessageDelivery,
  type AiTone,
  RETURN_INCENTIVE_MAX_LENGTH,
  RETURN_MESSAGE_MAX_LENGTH,
  type ReturnKind,
  type ReturnMessageIssue,
  returnMessageIssue,
  type ReturnSettings,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { showToast } from "@/shared/ui/toastBus";

import { defaultReturnTemplate } from "./returnMessage";

export function returnMessageIssueCopy(issue: ReturnMessageIssue): string {
  switch (issue.id) {
    case "TOO_LONG":
      return `O texto pode ter até ${RETURN_MESSAGE_MAX_LENGTH} caracteres.`;
    case "UNKNOWN_FIELD":
      return `{${issue.field}} não é um campo conhecido. Use {nome}, {servico}, {quando}, {horarios} ou {incentivo}.`;
    case "WRITTEN_DATE":
      return "Escreva {quando} no lugar da data: cada cliente recebe a dela.";
    case "WRITTEN_TIME":
      return "Escreva {horarios} no lugar do horário: os horários saem da sua agenda no envio.";
  }
}

/**
 * Texto-base da rotina (D-206), editado na própria tela do retorno e gravado
 * na configuração do negócio: vale para as próximas rodadas daquela rotina.
 * No Resgate, o incentivo fica junto, porque é o que a mensagem promete.
 */
export function ReturnMessageEditor({
  delivery = "PARTS",
  kind,
  onClose,
  onSaved,
  open,
  settings,
  tone,
}: {
  /** Como a IA envia (D-208): em partes, cada linha vira uma mensagem. */
  delivery?: AiMessageDelivery;
  kind: ReturnKind;
  onClose: () => void;
  onSaved: (settings: ReturnSettings) => void;
  open: boolean;
  settings: ReturnSettings;
  tone: AiTone;
}) {
  const fieldId = useId();
  const helpId = useId();
  const issueId = useId();
  const incentiveId = useId();
  const saved =
    kind === "RENEWAL" ? settings.renewalMessage : settings.winbackMessage;
  const fallback = defaultReturnTemplate(kind, tone, delivery);
  const [text, setText] = useState(saved ?? fallback);
  const [incentive, setIncentive] = useState(settings.winbackIncentive ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const trimmed = text.trim();
  const issue =
    trimmed && trimmed !== fallback ? returnMessageIssue(trimmed) : null;

  async function save() {
    if (issue) return;
    setBusy(true);
    setError(null);
    // Texto igual ao padrão ou vazio é o padrão: continua acompanhando o
    // estilo da IA se ele mudar depois.
    const message =
      trimmed.length === 0 || trimmed === fallback ? null : trimmed;
    try {
      const next = await getProductServices().customerReturn.updateSettings({
        ...(kind === "RENEWAL"
          ? { renewalMessage: message }
          : {
              winbackMessage: message,
              winbackIncentive: incentive.trim() || null,
            }),
      });
      showToast(
        kind === "RENEWAL" ? "Mensagem salva." : "Mensagem e incentivo salvos.",
      );
      onSaved(next);
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      onClose={close}
      open={open}
      title={
        kind === "RENEWAL" ? "Mensagem da Renovação" : "Mensagem do Resgate"
      }
    >
      <div className="return-editor">
        {kind === "WINBACK" && (
          <div className="return-editor-field">
            <label className="rules-label" htmlFor={incentiveId}>
              Incentivo para quem volta
            </label>
            <input
              className="input"
              id={incentiveId}
              maxLength={RETURN_INCENTIVE_MAX_LENGTH}
              onChange={(event) => setIncentive(event.target.value)}
              placeholder="Ex.: 10% de desconto em qualquer serviço até o fim do mês"
              value={incentive}
            />
            <small className="return-editor-help">
              Opcional. A IA usa exatamente este texto e nunca oferece outro
              benefício. Sem texto, a mensagem é só de reaproximação.
            </small>
          </div>
        )}
        <div className="return-editor-field">
          <label className="rules-label" htmlFor={fieldId}>
            Texto-base
          </label>
          <textarea
            aria-describedby={issue ? `${helpId} ${issueId}` : helpId}
            aria-invalid={issue ? true : undefined}
            className="input return-editor-input"
            id={fieldId}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            value={text}
          />
          <small className="return-editor-help" id={helpId}>
            É o jeito de falar. Use {"{nome}"}, {"{servico}"}, {"{quando}"}
            {kind === "RENEWAL" ? `, ${"{horarios}"}` : ""} e {"{incentivo}"}{" "}
            onde quiser que os dados de cada cliente apareçam.
            {kind === "RENEWAL"
              ? " Os horários livres entram sempre, mesmo que o texto não os cite."
              : " O incentivo entra sempre, mesmo que o texto não o cite."}
            {delivery === "PARTS" && (
              <>
                {" "}
                <span className="reminders-example-hint">
                  Cada linha vira uma mensagem.
                </span>
              </>
            )}
          </small>
          {issue && (
            <small className="return-editor-issue" id={issueId} role="alert">
              {returnMessageIssueCopy(issue)}
            </small>
          )}
        </div>
        {error && (
          <p className="field-help" role="alert">
            {error}
          </p>
        )}
        <div className="return-editor-actions">
          {saved !== null && (
            <button
              className="btn btn-tertiary"
              disabled={busy}
              onClick={() => setText(fallback)}
              type="button"
            >
              Restaurar padrão
            </button>
          )}
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || Boolean(issue)}
            onClick={() => void save()}
            type="button"
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
