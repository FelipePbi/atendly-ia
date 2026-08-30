"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import type { WhatsAppConnectInput, WhatsAppConnection } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

type LinkPayload = {
  expiresAt: string | null;
  pairingCode: string | null;
  qrcode: string | null;
};

export function WhatsAppConnectionPanel({
  onConnected,
  onStatusChange,
}: {
  onConnected?: () => void;
  onStatusChange?: (connected: boolean) => void;
}) {
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [payload, setPayload] = useState<LinkPayload | null>(null);
  const [mode, setMode] = useState<"PAIRING_CODE" | "QR">(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 760px)").matches
      ? "PAIRING_CODE"
      : "QR",
  );
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [disconnectConfirmationOpen, setDisconnectConfirmationOpen] =
    useState(false);

  const refresh = useCallback(async () => {
    const next = await getProductServices().whatsapp.get();
    setConnection(next);
    setError(null);
    onStatusChange?.(next?.status === "CONNECTED");
    if (next?.status === "CONNECTED") {
      setPayload(null);
      setExpired(false);
      onConnected?.();
      setReconnecting(false);
    }
    return next;
  }, [onConnected, onStatusChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() =>
        setError("Não foi possível verificar a conexão."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!payload) return;
    const timer = window.setInterval(() => {
      void refresh().catch(() =>
        setError("Não foi possível verificar a conexão."),
      );
      if (payload.expiresAt && Date.now() >= Date.parse(payload.expiresAt)) {
        setExpired(true);
        setPayload(null);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [payload, refresh]);

  async function connect(reconnect = false) {
    if (mode === "PAIRING_CODE" && phone.trim().length < 10) {
      setError("Informe o número com DDD para gerar o código.");
      return;
    }
    setBusy(true);
    setReconnecting(reconnect);
    setError(null);
    setExpired(false);
    const input: WhatsAppConnectInput =
      mode === "QR" ? { mode: "QR" } : { mode: "PAIRING_CODE", phone };
    try {
      const result = reconnect
        ? await getProductServices().whatsapp.reconnect(input)
        : await getProductServices().whatsapp.connect(input);
      setConnection(result.connection);
      setPayload({
        expiresAt: result.expiresAt,
        pairingCode: result.pairingCode,
        qrcode: result.qrcode,
      });
    } catch {
      setReconnecting(false);
      setError("Não foi possível iniciar a vinculação. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await getProductServices().whatsapp.disconnect();
      setConnection(null);
      setPayload(null);
      setDisconnectConfirmationOpen(false);
      onStatusChange?.(false);
    } catch {
      setError("Não foi possível desconectar o número.");
    } finally {
      setBusy(false);
    }
  }

  const connected = connection?.status === "CONNECTED";
  return (
    <div className="settings-stack">
      <section className="settings-status-hero">
        <span
          className={`settings-source-icon${connected ? "" : " is-warning"}`}
        >
          <Icon name={connected ? "chat" : "refresh"} />
        </span>
        <div className="settings-status-copy">
          <span className={`badge${connected ? " badge-success" : ""}`}>
            {connected
              ? "Conectado"
              : expired
                ? "Sessão expirada"
                : error
                  ? "Erro de conexão"
                  : reconnecting
                    ? "Reconectando"
                    : payload
                      ? "Conectando"
                      : "Desconectado"}
          </span>
          <h2>{connected ? "WhatsApp conectado" : "Conecte seu WhatsApp"}</h2>
          <p>
            {connected
              ? "O atendimento automático pode operar neste número."
              : "A conexão só fica ativa depois da confirmação no WhatsApp."}
          </p>
          {connection?.phoneNumber && (
            <p className="small">{connection.phoneNumber}</p>
          )}
        </div>
      </section>

      {!connected && (
        <section className="settings-panel settings-connect-panel">
          <div className="settings-choice-grid">
            <label className="settings-tone-choice">
              <input
                checked={mode === "QR"}
                name="connection-mode"
                type="radio"
                onChange={() => setMode("QR")}
              />
              <span className="settings-tone-card">
                <strong>QR Code</strong>
                <span>Ideal no computador</span>
              </span>
            </label>
            <label className="settings-tone-choice">
              <input
                checked={mode === "PAIRING_CODE"}
                name="connection-mode"
                type="radio"
                onChange={() => setMode("PAIRING_CODE")}
              />
              <span className="settings-tone-card">
                <strong>Código</strong>
                <span>Ideal no celular</span>
              </span>
            </label>
          </div>
          {mode === "PAIRING_CODE" && !payload?.pairingCode && (
            <label className="field">
              <span className="label">Número com DDD</span>
              <input
                className="input"
                inputMode="tel"
                placeholder="11999990000"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
          )}
          {payload?.qrcode && (
            <div className="settings-connect-layout">
              <Image
                alt="QR Code para vincular o WhatsApp"
                height={180}
                src={normalizeQrCode(payload.qrcode)}
                unoptimized
                width={180}
              />
              <p>WhatsApp → Aparelhos conectados → Conectar aparelho.</p>
            </div>
          )}
          {payload?.pairingCode && (
            <div
              className="linking-code mono"
              aria-label="Código de vinculação"
            >
              {payload.pairingCode}
            </div>
          )}
          {expired && (
            <p className="field-help" role="alert">
              O código expirou. Gere outro para continuar.
            </p>
          )}
          {error && (
            <p className="field-help" role="alert">
              {error}
            </p>
          )}
          <div className="settings-form-actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              type="button"
              onClick={() => void connect(Boolean(connection))}
            >
              {busy
                ? "Aguarde..."
                : payload
                  ? "Gerar novo código"
                  : "Conectar WhatsApp"}
            </button>
          </div>
        </section>
      )}
      {connected && (
        <button
          className="btn btn-danger"
          disabled={busy}
          type="button"
          onClick={() => setDisconnectConfirmationOpen(true)}
        >
          Desconectar número
        </button>
      )}
      <Dialog
        eyebrow="Interrupção do serviço"
        onClose={() => setDisconnectConfirmationOpen(false)}
        open={disconnectConfirmationOpen}
        title="Desconectar WhatsApp?"
      >
        <p className="settings-modal-copy">
          A Atendly deixará de responder automaticamente assim que a desconexão
          for concluída.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={() => setDisconnectConfirmationOpen(false)}
          >
            Manter conectado
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            type="button"
            onClick={() => void disconnect()}
          >
            {busy ? "Desconectando..." : "Desconectar WhatsApp"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function normalizeQrCode(value: string): string {
  return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
}
