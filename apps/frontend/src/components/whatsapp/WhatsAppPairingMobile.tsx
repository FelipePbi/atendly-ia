"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, QrCode, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { QrCodePanel } from "@/components/whatsapp/QrCodePanel";
import {
  PAIRING_POLL_INTERVAL_MS,
  beginOnce,
  copyPairingCode,
  formatBrazilianPairingPhone,
  formatPairingCode,
  initialPairingFlowState,
  normalizeBrazilianPairingPhone,
  pairingFlowReducer,
  requestWhatsAppPairingCode,
  shouldCheckPairingOnVisibility,
} from "@/lib/whatsapp-pairing";
import type { ApiWhatsAppInstance } from "@/types/domain";

type StatusResponse = {
  ok: boolean;
  error?: string;
  whatsappInstance?: ApiWhatsAppInstance | null;
};

const connectionSteps = [
  {
    title: "Abra o WhatsApp",
    description: "Use o celular que possui o número informado.",
  },
  {
    title: "Acesse aparelhos conectados",
    description: "No Android, abra o menu. No iPhone, abra Ajustes.",
  },
  {
    title: "Escolha conectar um aparelho",
    description: "Toque em Conectar aparelho.",
  },
  {
    title: "Use o número de telefone",
    description: "Escolha Conectar com número de telefone.",
  },
  {
    title: "Informe o código",
    description: "Cole ou digite o código exibido pela Atendly.",
  },
];

export function WhatsAppPairingMobile({
  active,
  initialPhone,
  instance,
  qrcode,
  qrExpired,
  qrLoading,
  qrError,
  onInstanceChange,
  onConnected,
  onShowQr,
  onRefreshQr,
}: {
  active: boolean;
  initialPhone: string;
  instance: ApiWhatsAppInstance | null;
  qrcode: string | null;
  qrExpired: boolean;
  qrLoading: boolean;
  qrError: string;
  onInstanceChange: (instance: ApiWhatsAppInstance | null) => void;
  onConnected: () => Promise<void>;
  onShowQr: () => Promise<void>;
  onRefreshQr: () => Promise<void>;
}) {
  const [flow, dispatch] = useReducer(pairingFlowReducer, initialPairingFlowState);
  const [phone, setPhone] = useState(() => formatBrazilianPairingPhone(initialPhone));
  const [phoneError, setPhoneError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const generationIdRef = useRef(0);
  const generationAbortRef = useRef<AbortController | null>(null);
  const statusAbortRef = useRef<AbortController | null>(null);
  const statusInFlightRef = useRef(false);
  const statusFailureCountRef = useRef(0);
  const initialStatusCheckedRef = useRef<string | null>(null);
  const completionStartedRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      generationAbortRef.current?.abort();
      statusAbortRef.current?.abort();
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const finishConnection = useCallback(
    (connectedInstance: ApiWhatsAppInstance | null | undefined) => {
      if (!beginOnce(completionStartedRef)) return;
      statusAbortRef.current?.abort();
      onInstanceChange(connectedInstance ?? instance);
      dispatch({ type: "CONNECTED" });
      completionTimerRef.current = window.setTimeout(() => {
        void onConnected();
      }, 700);
    },
    [instance, onConnected, onInstanceChange]
  );

  const fetchCurrentStatus = useCallback(
    async (purpose: "initial" | "poll") => {
      if (!active || statusInFlightRef.current) return;
      if (purpose === "poll" && flow.expiresAt !== null && Date.now() >= flow.expiresAt) {
        dispatch({ type: "EXPIRED" });
        return;
      }

      statusInFlightRef.current = true;
      statusAbortRef.current?.abort();
      const controller = new AbortController();
      statusAbortRef.current = controller;
      if (purpose === "poll") dispatch({ type: "CHECK" });

      try {
        const response = await fetch("/api/whatsapp/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as StatusResponse | null;

        if (!response.ok || !data?.ok) {
          if (purpose === "initial" && response.status === 404) return;
          throw new Error(data?.error ?? "Não foi possível verificar a conexão.");
        }

        statusFailureCountRef.current = 0;
        onInstanceChange(data.whatsappInstance ?? null);
        if (data.whatsappInstance?.status === "CONNECTED") {
          finishConnection(data.whatsappInstance);
          return;
        }
        if (data.whatsappInstance?.status === "QR_EXPIRED") {
          dispatch({ type: "EXPIRED" });
          return;
        }
        if (purpose === "poll") dispatch({ type: "WAIT" });
      } catch (error) {
        if (controller.signal.aborted) return;
        statusFailureCountRef.current += 1;
        if (purpose === "poll" && statusFailureCountRef.current < 3) {
          dispatch({ type: "WAIT" });
          return;
        }
        dispatch({
          type: "ERROR",
          message: error instanceof Error ? error.message : "Não foi possível verificar a conexão.",
          preserveCode: purpose === "poll",
        });
      } finally {
        if (statusAbortRef.current === controller) statusAbortRef.current = null;
        statusInFlightRef.current = false;
      }
    },
    [active, finishConnection, flow.expiresAt, onInstanceChange]
  );

  useEffect(() => {
    if (!active || !instance || initialStatusCheckedRef.current === instance.id) return;
    initialStatusCheckedRef.current = instance.id;
    queueMicrotask(() => {
      void fetchCurrentStatus("initial");
    });
  }, [active, fetchCurrentStatus, instance]);

  useEffect(() => {
    if (!active || flow.status !== "waitingConnection") return;

    const timeout = window.setTimeout(() => {
      void fetchCurrentStatus("poll");
    }, PAIRING_POLL_INTERVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [active, fetchCurrentStatus, flow.status]);

  useEffect(() => {
    if (!active || !showQr || !instance || instance.status === "CONNECTED") return;

    const interval = window.setInterval(() => {
      void fetchCurrentStatus("initial");
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [active, fetchCurrentStatus, instance, showQr]);

  useEffect(() => {
    if (!active || flow.expiresAt === null || !["codeReady", "waitingConnection", "checkingConnection"].includes(flow.status)) {
      return;
    }

    const remaining = flow.expiresAt - Date.now();
    if (remaining <= 0) {
      queueMicrotask(() => {
        statusAbortRef.current?.abort();
        dispatch({ type: "EXPIRED" });
      });
      return;
    }

    const timeout = window.setTimeout(() => {
      statusAbortRef.current?.abort();
      dispatch({ type: "EXPIRED" });
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [active, flow.expiresAt, flow.status]);

  useEffect(() => {
    if (!active) return;

    const handleVisibility = () => {
      if (shouldCheckPairingOnVisibility(document.visibilityState, flow.status)) {
        void fetchCurrentStatus("poll");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [active, fetchCurrentStatus, flow.status]);

  async function generateCode() {
    if (["validatingPhone", "generatingCode"].includes(flow.status)) return;

    dispatch({ type: "VALIDATE" });
    const normalizedPhone = normalizeBrazilianPairingPhone(phone);
    if (!normalizedPhone) {
      setPhoneError("Informe um telefone brasileiro válido com DDD.");
      dispatch({ type: "RESET" });
      return;
    }

    setPhoneError("");
    setPhone(formatBrazilianPairingPhone(normalizedPhone));
    dispatch({ type: "GENERATE" });
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    const generationId = ++generationIdRef.current;

    try {
      const result = await requestWhatsAppPairingCode(normalizedPhone, { signal: controller.signal });
      if (controller.signal.aborted || generationId !== generationIdRef.current) return;
      onInstanceChange(result.whatsappInstance);
      if (result.connected) {
        finishConnection(result.whatsappInstance);
        return;
      }
      if (!result.pairingCode || result.expiresAt === null) {
        throw new Error("Não foi possível gerar o código de conexão.");
      }

      statusFailureCountRef.current = 0;
      dispatch({ type: "CODE_READY", code: result.pairingCode, expiresAt: result.expiresAt });
      queueMicrotask(() => dispatch({ type: "WAIT" }));
    } catch (error) {
      if (controller.signal.aborted || generationId !== generationIdRef.current) return;
      dispatch({
        type: "ERROR",
        message: error instanceof Error ? error.message : "Não foi possível gerar o código de conexão.",
      });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
    }
  }

  async function handleCopy() {
    if (!(await copyPairingCode(flow.code))) return;
    setCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 2_000);
  }

  async function showQrFallback() {
    setShowQr(true);
    await onShowQr();
  }

  if (showQr) {
    return (
      <div className="onboarding-whatsapp-mobile" aria-label="Conexão por QR Code">
        <div className="pairing-mobile-qr-note">
          <QrCode aria-hidden="true" />
          <div>
            <strong>Use outro dispositivo</strong>
            <p>Abra esta tela em um computador ou tablet e escaneie o QR Code com seu celular.</p>
          </div>
        </div>
        <QrCodePanel
          qrcode={qrcode ?? instance?.qrcode ?? null}
          expired={qrExpired}
          loading={qrLoading}
          onRefresh={() => void onRefreshQr()}
          compact
        />
        {qrError ? <p className="onboarding-error" role="alert">{qrError}</p> : null}
        <Button type="button" variant="secondary" fullWidth onClick={() => setShowQr(false)}>
          Conectar com código
        </Button>
      </div>
    );
  }

  const loading = flow.status === "validatingPhone" || flow.status === "generatingCode";
  const hasCode = Boolean(flow.code);

  return (
    <div className="onboarding-whatsapp-mobile" aria-busy={loading}>
      <div className="pairing-phone-card">
        <div className="pairing-phone-card__heading">
          <span><Smartphone aria-hidden="true" /></span>
          <div>
            <strong>Número do WhatsApp</strong>
            <p>Use o número que atenderá seus clientes.</p>
          </div>
        </div>
        <FormField
          id="whatsapp-pairing-phone"
          label="Telefone com DDD"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-9999"
          value={phone}
          error={phoneError}
          disabled={loading || hasCode}
          onChange={(event) => {
            setPhone(formatBrazilianPairingPhone(event.target.value));
            setPhoneError("");
          }}
        />
      </div>

      {hasCode ? (
        <section className="pairing-code-card" aria-labelledby="pairing-code-title">
          <div className="pairing-code-card__eyebrow">
            <ShieldCheck aria-hidden="true" />
            <span id="pairing-code-title">Código seguro</span>
          </div>
          <p className="pairing-code-card__value" aria-label={`Código de conexão: ${formatPairingCode(flow.code)}`}>
            {formatPairingCode(flow.code)}
          </p>
          <Button
            className="pairing-copy-button"
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => void handleCopy()}
            icon={copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          >
            <span>{copied ? "Código copiado" : "Copiar código"}</span>
          </Button>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? "Código copiado" : ""}
          </span>
        </section>
      ) : null}

      {hasCode ? (
        <section className="pairing-instructions" aria-labelledby="pairing-instructions-title">
          <h2 id="pairing-instructions-title">Conclua no WhatsApp</h2>
          <ol>
            {connectionSteps.map((step, index) => (
              <li key={step.title}>
                <span className="pairing-instructions__number" aria-hidden="true">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {flow.status === "expired" ? (
        <div className="pairing-status pairing-status--warning" role="status" aria-live="polite">
          <AlertTriangle aria-hidden="true" />
          <div><strong>Código expirado</strong><span>Gere outro código para continuar.</span></div>
        </div>
      ) : null}

      {flow.status === "error" ? (
        <div className="pairing-status pairing-status--error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div><strong>Algo deu errado</strong><span>{flow.error}</span></div>
        </div>
      ) : null}

      {["codeReady", "waitingConnection", "checkingConnection"].includes(flow.status) ? (
        <div className="pairing-status pairing-status--waiting" role="status" aria-live="polite">
          {flow.status === "checkingConnection" ? (
            <Loader2 className="ui-spin" aria-hidden="true" />
          ) : (
            <span className="pairing-status__pulse" aria-hidden="true" />
          )}
          <div>
            <strong>{flow.status === "checkingConnection" ? "Verificando conexão..." : "Aguardando conexão..."}</strong>
            <span>Aguardando você concluir no WhatsApp...</span>
          </div>
        </div>
      ) : null}

      {flow.status === "connected" ? (
        <div className="pairing-status pairing-status--success" role="status" aria-live="polite">
          <Check aria-hidden="true" />
          <div><strong>WhatsApp conectado com sucesso</strong><span>Finalizando sua configuração...</span></div>
        </div>
      ) : null}

      {!hasCode && flow.status !== "connected" ? (
        <Button
          type="button"
          fullWidth
          onClick={() => void generateCode()}
          disabled={loading}
          icon={loading ? <Loader2 className="ui-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
        >
          {loading
            ? "Gerando código..."
            : flow.status === "expired" || flow.status === "error"
              ? "Gerar novo código"
              : "Gerar código de conexão"}
        </Button>
      ) : null}

      {flow.status === "error" && hasCode ? (
        <Button
          type="button"
          fullWidth
          onClick={() => {
            statusFailureCountRef.current = 0;
            dispatch({ type: "WAIT" });
          }}
          icon={<RotateCcw aria-hidden="true" />}
        >
          Tentar novamente
        </Button>
      ) : null}

      {!hasCode && flow.status !== "connected" ? (
        <button className="pairing-qr-alternative" type="button" onClick={() => void showQrFallback()}>
          <QrCode aria-hidden="true" /> Usar QR Code em outro dispositivo
        </button>
      ) : null}
    </div>
  );
}
