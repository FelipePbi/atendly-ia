"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { IgnoredContactEntry, SettingsState } from "@/data";
import type { WhatsAppConnectedContext } from "@/features/whatsapp/WhatsAppConnectionPanel";
import { Icon } from "@/shared/icons/Icon";
import { formatBrazilianPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import { dayMonthLabel } from "./dayMonth";

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const IGNORED_ROUTE = "/configuracoes/whatsapp/contatos-ignorados";
/** Nomes que a segunda linha da linha de contatos ignorados mostra. */
const IGNORED_PREVIEW_LIMIT = 2;

function ignoredPreview(
  items: IgnoredContactEntry[],
  total: number,
): string | null {
  if (items.length === 0) return null;
  const names = items
    .map(
      (item) =>
        item.displayName ??
        formatBrazilianPhone(item.externalContactId, "plus") ??
        item.externalContactId,
    )
    .join(", ");
  return total > items.length
    ? `${names} e mais ${total - items.length}`
    : names;
}

function RowSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="wa-row-icon"
      fill="none"
      height="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width="22"
    >
      {children}
    </svg>
  );
}

/**
 * Configurações › WhatsApp com o número conectado (Mais-WhatsApp:W1). Só mostra
 * o que o app leu: nome e telefone vêm do negócio e da conexão, o cartão da IA
 * vem de `settings.ai.enabled` e some quando ele é nulo. Desconectar e trocar
 * de número reusam o mesmo `whatsapp.disconnect` do painel.
 */
export function WhatsAppConnectedSettings({
  context,
  settings,
}: {
  context: WhatsAppConnectedContext;
  settings: SettingsState;
}) {
  const [sheet, setSheet] = useState<"swap" | null>(null);
  const [ignoredPreviewText, setIgnoredPreviewText] = useState<string | null>(
    null,
  );
  const { busy, connection, disconnect, error, openDisconnectDialog } = context;
  const businessName = settings.business?.name ?? null;
  const phone = connection.phoneNumber
    ? formatBrazilianPhone(connection.phoneNumber, "plus")
    : null;
  const since = dayMonthLabel(
    connection.connectedAt,
    settings.business?.timezone ?? "America/Sao_Paulo",
  );
  const aiEnabled: boolean | null = settings.ai.enabled;

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .conversations.listIgnoredContacts(
        { limit: IGNORED_PREVIEW_LIMIT },
        controller.signal,
      )
      .then((list) => {
        if (controller.signal.aborted) return;
        setIgnoredPreviewText(ignoredPreview(list.items, list.total));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function swapNumber() {
    const ok = await disconnect();
    if (!ok) setSheet(null);
  }

  return (
    <div className="wa-screen">
      <div className="wa-identity">
        <div className="wa-avatar-wrap">
          <span aria-hidden="true" className="wa-avatar">
            {businessName ? initials(businessName) : <Icon name="chat" />}
          </span>
          <span aria-hidden="true" className="wa-avatar-badge">
            <svg
              fill="none"
              height="12"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
              width="12"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>
        <div className="wa-identity-copy">
          {businessName && <strong>{businessName}</strong>}
          {phone && <span className="wa-identity-phone">{phone}</span>}
          <span className="wa-identity-pill">
            <span aria-hidden="true" className="wa-identity-pill-dot" />
            {since ? `Conectado desde ${since}` : "Conectado"}
          </span>
        </div>
      </div>
      {aiEnabled !== null && (
        <div className="wa-ai">
          <span aria-hidden="true" className="hub-row-ia">
            <span
              className={`hub-row-ia-ring${aiEnabled ? " is-breathing" : " is-off"}`}
            />
            <span className={`hub-row-ia-dot${aiEnabled ? "" : " is-off"}`} />
          </span>
          <span className="wa-ai-title">
            {aiEnabled
              ? "IA ativa neste número"
              : "A IA não está atendendo neste número"}
          </span>
          {!aiEnabled && (
            <Link className="wa-ai-link" href="/configuracoes/ia">
              Ver em IA
            </Link>
          )}
        </div>
      )}
      <div className="wa-rows">
        <Link className="wa-row" href={IGNORED_ROUTE}>
          <RowSvg>
            <circle cx="12" cy="12" r="8" />
            <path d="M6.5 6.5l11 11" />
          </RowSvg>
          <span className="wa-row-copy">
            <span className="wa-row-title">
              Contatos que a IA nunca responde
            </span>
            {ignoredPreviewText && (
              <span className="wa-row-detail">{ignoredPreviewText}</span>
            )}
          </span>
          <Icon name="chevron-right" />
        </Link>
        <button
          className="wa-row"
          type="button"
          onClick={() => setSheet("swap")}
        >
          <RowSvg>
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
          </RowSvg>
          <span className="wa-row-copy">
            <span className="wa-row-title">Trocar número</span>
            <span className="wa-row-detail">
              Clientes, agenda e conversas continuam
            </span>
          </span>
          <Icon name="chevron-right" />
        </button>
      </div>
      <p className="wa-note">
        Você pode continuar usando este WhatsApp normalmente. Quando você
        responde, a IA sai de cena naquela conversa.
      </p>
      {error && (
        <p className="field-help" role="alert">
          {error}
        </p>
      )}
      <div className="account-danger">
        <button
          className="account-danger-card is-action"
          disabled={busy}
          type="button"
          onClick={openDisconnectDialog}
        >
          <span className="account-danger-copy">
            <span className="account-danger-title">Desconectar WhatsApp</span>
            <span className="account-danger-detail">
              Sua IA deixa de atender até conectar de novo
            </span>
          </span>
          <Icon name="chevron-right" />
        </button>
      </div>
      <Dialog
        onClose={() => setSheet(null)}
        open={sheet === "swap"}
        title="Trocar número?"
      >
        <p className="settings-modal-copy">
          Clientes, agenda e conversas continuam. O número atual é desconectado,
          e a IA para de atender até você conectar o novo.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={() => setSheet(null)}
          >
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            type="button"
            onClick={() => void swapNumber()}
          >
            {busy ? "Desconectando..." : "Desconectar e trocar"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
