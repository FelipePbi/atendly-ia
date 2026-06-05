"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { useDashboard } from "@/components/layout/DashboardContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { QrCodePanel } from "@/components/whatsapp/QrCodePanel";
import { WhatsAppConnectionCard } from "@/components/whatsapp/WhatsAppConnectionCard";
import { isWhatsAppConnected } from "@/lib/status-labels";
import type { ApiWhatsAppInstance } from "@/types/domain";

type WhatsAppResponse = {
  ok: boolean;
  whatsappInstance?: ApiWhatsAppInstance | null;
  qrcode?: string | null;
  pending?: boolean;
  error?: string;
  details?: {
    whatsappInstance?: ApiWhatsAppInstance | null;
  };
};

export function WhatsAppSettings() {
  const { whatsappInstance: dashboardInstance, refreshDashboard, refreshWhatsappStatus } = useDashboard();
  const [instance, setInstance] = useState<ApiWhatsAppInstance | null>(dashboardInstance);
  const [qrcode, setQrcode] = useState<string | null>(dashboardInstance?.qrcode ?? null);
  const [loading, setLoading] = useState(Boolean(dashboardInstance && !isWhatsAppConnected(dashboardInstance.status)));
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [qrPending, setQrPending] = useState(false);
  const [error, setError] = useState("");

  const connected = isWhatsAppConnected(instance?.status);
  const expired = instance?.status === "QR_EXPIRED";
  const dashboardInstanceId = dashboardInstance?.id ?? null;
  const dashboardInstanceStatus = dashboardInstance?.status ?? null;
  const dashboardInstanceQrCode = dashboardInstance?.qrcode ?? null;

  const recoverWhatsAppInstance = useCallback(async () => {
    setError("Criando uma nova conexao com WhatsApp...");

    const createResponse = await fetch("/api/whatsapp/instance", { method: "POST" });
    const createData = (await createResponse.json().catch(() => null)) as WhatsAppResponse | null;
    if (!createResponse.ok || !createData?.whatsappInstance) {
      setQrPending(false);
      setError(createData?.error ?? "Nao foi possivel criar a conexao.");
      return false;
    }

    setInstance(createData.whatsappInstance);
    await fetch("/api/whatsapp/connect", { method: "POST" });
    await refreshWhatsappStatus();
    setError("");
    return true;
  }, [refreshWhatsappStatus]);

  const loadQrAndStatus = useCallback(async () => {
    try {
      const statusResponse = await fetch("/api/whatsapp/status", { cache: "no-store" });
      const statusData = (await statusResponse.json().catch(() => null)) as WhatsAppResponse | null;

      if (statusResponse.status === 401) {
        setError("Sessao invalida. Entre novamente.");
        return;
      }

      if (statusResponse.ok) {
        setInstance(statusData?.whatsappInstance ?? null);
        if (statusData?.whatsappInstance?.status === "CONNECTED") {
          setQrcode(null);
          setQrPending(false);
          await refreshWhatsappStatus();
          return;
        }
      } else {
        setInstance(statusData?.whatsappInstance ?? statusData?.details?.whatsappInstance ?? null);
        setQrPending(false);
        if (isMissingEvolutionInstance(statusData?.error)) {
          await recoverWhatsAppInstance();
          return;
        }
        setError(statusData?.error ?? "Nao foi possivel verificar a conexao.");
        return;
      }

      const qrResponse = await fetch("/api/whatsapp/qr", { cache: "no-store" });
      const qrData = (await qrResponse.json().catch(() => null)) as WhatsAppResponse | null;
      if (qrResponse.ok) {
        setQrcode(qrData?.qrcode || null);
        setInstance(qrData?.whatsappInstance ?? statusData?.whatsappInstance ?? null);
        setQrPending(Boolean(qrData?.pending) && !qrData?.qrcode);
        await refreshWhatsappStatus();
      } else {
        setQrPending(false);
        if (isMissingEvolutionInstance(qrData?.error)) {
          await recoverWhatsAppInstance();
          return;
        }
        setError(qrData?.error ?? "Nao foi possivel gerar o QR Code.");
      }
    } catch {
      setQrPending(false);
      setError("Nao foi possivel verificar o QR Code agora.");
    }
  }, [recoverWhatsAppInstance, refreshWhatsappStatus]);

  useEffect(() => {
    queueMicrotask(() => {
      setInstance(dashboardInstance);
      setQrcode(dashboardInstanceStatus === "CONNECTED" ? null : dashboardInstanceQrCode);
    });
  }, [dashboardInstance, dashboardInstanceQrCode, dashboardInstanceStatus]);

  useEffect(() => {
    if (!dashboardInstanceId || dashboardInstanceStatus === "CONNECTED") {
      queueMicrotask(() => {
        setLoading(false);
      });
      return;
    }

    queueMicrotask(() => {
      setLoading(true);
      void loadQrAndStatus().finally(() => setLoading(false));
    });
  }, [dashboardInstanceId, dashboardInstanceStatus, loadQrAndStatus]);

  useEffect(() => {
    if (!instance || connected) return;
    const interval = window.setInterval(() => {
      void loadQrAndStatus();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [connected, instance, loadQrAndStatus]);

  async function startConnection() {
    setConnecting(true);
    setError("");

    let currentInstance = instance;
    if (!currentInstance) {
      const createResponse = await fetch("/api/whatsapp/instance", { method: "POST" });
      const createData = (await createResponse.json().catch(() => null)) as WhatsAppResponse | null;
      if (!createResponse.ok || !createData?.whatsappInstance) {
        setError(createData?.error ?? "Nao foi possivel criar a conexao.");
        setConnecting(false);
        return;
      }

      currentInstance = createData.whatsappInstance;
      setInstance(currentInstance);
    }

    const connectResponse = await fetch("/api/whatsapp/connect", { method: "POST" });
    const connectData = (await connectResponse.json().catch(() => null)) as WhatsAppResponse | null;
    if (!connectResponse.ok) {
      setError(connectData?.error ?? "Nao foi possivel iniciar a conexao.");
      setInstance(connectData?.whatsappInstance ?? connectData?.details?.whatsappInstance ?? currentInstance);
      setConnecting(false);
      return;
    }

    setInstance(connectData?.whatsappInstance ?? currentInstance);
    await loadQrAndStatus();
    await refreshWhatsappStatus();
    setConnecting(false);
  }

  async function refreshQr() {
    if (connected) return;

    setRefreshing(true);
    setError("");

    const createResponse = await fetch("/api/whatsapp/instance", { method: "POST" });
    const createData = (await createResponse.json().catch(() => null)) as WhatsAppResponse | null;
    if (createResponse.ok && createData?.whatsappInstance) {
      setInstance(createData.whatsappInstance);
    } else {
      setError(createData?.error ?? "Nao foi possivel preparar a conexao.");
      setRefreshing(false);
      return;
    }

    await fetch("/api/whatsapp/connect", { method: "POST" });
    await loadQrAndStatus();
    await refreshWhatsappStatus();
    setRefreshing(false);
  }

  async function disconnectWhatsapp() {
    const confirmed = window.confirm(
      "Desconectar este WhatsApp? Voce podera reconectar depois. As conversas deste numero serao mantidas."
    );
    if (!confirmed) return;

    setDisconnecting(true);
    setError("");

    try {
      const response = await fetch("/api/whatsapp/logout", { method: "POST" });
      const data = (await response.json().catch(() => null)) as WhatsAppResponse | null;

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "Nao foi possivel desconectar o WhatsApp.");
        return;
      }

      const nextInstance = data.whatsappInstance ?? null;
      setInstance(nextInstance);
      setQrcode(null);
      setQrPending(false);
      await refreshWhatsappStatus();
    } catch {
      setError("Nao foi possivel desconectar o WhatsApp agora.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function removeWhatsappIntegration() {
    const confirmed = window.confirm(
      "Remover a integracao com WhatsApp? Esta acao apaga permanentemente conversas e mensagens deste numero. Para usar a plataforma novamente, sera necessario vincular um WhatsApp."
    );
    if (!confirmed) return;

    setRemoving(true);
    setError("");

    try {
      const response = await fetch("/api/whatsapp/instance", { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as WhatsAppResponse | null;

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "Nao foi possivel remover a integracao.");
        return;
      }

      setInstance(null);
      setQrcode(null);
      setQrPending(false);
      await refreshDashboard();
    } catch {
      setError("Nao foi possivel remover a integracao agora.");
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Carregando conexao com WhatsApp..." />;
  }

  return (
    <div
      className={
        connected
          ? "mx-auto grid w-full max-w-3xl gap-4 px-4 py-5 sm:px-6 sm:py-6"
          : "mx-auto grid w-full max-w-5xl gap-4 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(320px,1fr)]"
      }
    >
      <WhatsAppConnectionCard
        status={instance?.status ?? null}
        phoneNumber={instance?.phoneNumber}
        connected={connected}
        connecting={connecting}
        disconnecting={disconnecting}
        removing={removing}
        onConnect={startConnection}
        onDisconnect={disconnectWhatsapp}
        onRemove={removeWhatsappIntegration}
      />

      {!connected && (instance || connecting) ? (
        <QrCodePanel
          qrcode={qrcode ?? instance?.qrcode ?? null}
          expired={expired}
          loading={refreshing || connecting || qrPending}
          onRefresh={refreshQr}
        />
      ) : !connected ? (
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="text-base font-black text-foreground">QR Code</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            Clique em conectar agora para gerar o QR Code e parear o WhatsApp do celular.
          </p>
        </section>
      ) : null}

      {error ? (
        <p
          className={`rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger ${
            connected ? "" : "lg:col-span-2"
          }`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function isMissingEvolutionInstance(error: string | undefined): boolean {
  return Boolean(error?.includes("instancia da Evolution nao foi encontrada"));
}
