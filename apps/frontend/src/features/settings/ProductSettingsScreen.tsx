"use client";

import { useEffect, useState } from "react";

import type { SettingsState } from "@/data";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { AccountSettings } from "./AccountSettings";
import { AiSettings } from "./AiSettings";
import { AvailabilitySettings } from "./AvailabilitySettings";
import { BusinessSettings } from "./BusinessSettings";
import { CalendarSettings } from "./CalendarSettings";
import { ConversationsSettings } from "./ConversationsSettings";
import { SettingsHub } from "./SettingsHub";
import { SettingsMessage } from "./shared/SettingsPage";
import type { SettingsScenario } from "./types";
import { WhatsAppSettings } from "./WhatsAppSettings";

export function ProductSettingsScreen({
  scenario,
}: {
  scenario: SettingsScenario;
}) {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [, setWhatsappConnected] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .settings.get(controller.signal)
      .then(setSettings)
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    getProductServices()
      .whatsapp.get(controller.signal)
      .then((connection) =>
        setWhatsappConnected(connection?.status === "CONNECTED"),
      )
      .catch(() => setWhatsappConnected(false));
    return () => controller.abort();
  }, []);

  useShellConfig({
    active: "configuracoes",
    loading: !settings && !error,
    module: "settings",
    title: "Configurações",
  });

  if (!settings && !error) {
    return (
      <SettingsMessage
        title="Carregando configurações"
        copy="Buscando o estado atual do seu negócio."
      />
    );
  }
  if (error || !settings) {
    return (
      <SettingsMessage
        title="Configurações indisponíveis"
        copy="Nada foi alterado. Tente carregar a página novamente."
        error
      />
    );
  }
  return (
    <SettingsContent
      scenario={scenario}
      settings={settings}
      setSettings={setSettings}
      setWhatsappConnected={setWhatsappConnected}
    />
  );
}

function SettingsContent({
  scenario,
  settings,
  setSettings,
  setWhatsappConnected,
}: {
  scenario: SettingsScenario;
  settings: SettingsState;
  setSettings: (state: SettingsState) => void;
  setWhatsappConnected: (connected: boolean) => void;
}) {
  if (scenario === "business")
    return <BusinessSettings settings={settings} onSaved={setSettings} />;
  if (scenario === "ai")
    return <AiSettings settings={settings} onSaved={setSettings} />;
  if (scenario.startsWith("whatsapp"))
    return <WhatsAppSettings onStatusChange={setWhatsappConnected} />;
  if (scenario === "calendar" || scenario === "calendar-external")
    return <CalendarSettings settings={settings} onSaved={setSettings} />;
  if (scenario === "availability")
    return <AvailabilitySettings settings={settings} onSaved={setSettings} />;
  if (scenario === "conversations") return <ConversationsSettings />;
  if (scenario === "account") return <AccountSettings />;
  return <SettingsHub settings={settings} />;
}
