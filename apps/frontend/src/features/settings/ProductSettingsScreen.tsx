"use client";

import { useEffect, useState } from "react";

import type { SettingsState } from "@/data";
import { ListDetailLayout } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { AccountSettings } from "./AccountSettings";
import { AiSettings } from "./AiSettings";
import { AvailabilitySettings } from "./AvailabilitySettings";
import { BusinessSettings } from "./BusinessSettings";
import { CalendarSettings } from "./CalendarSettings";
import { ConversationsSettings } from "./ConversationsSettings";
import { SettingsHub, SettingsHubPanel } from "./SettingsHub";
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
    pushed: !isHubScenario(scenario),
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

/** Sem seção própria, o cenário é o hub (como antes, inclusive o padrão). */
function isHubScenario(scenario: SettingsScenario): boolean {
  return !(
    scenario === "business" ||
    scenario === "ai" ||
    scenario.startsWith("whatsapp") ||
    scenario === "calendar" ||
    scenario === "calendar-external" ||
    scenario === "availability" ||
    scenario === "conversations" ||
    scenario === "account"
  );
}

/** Rota da seção aberta, marcada na lista de Configurações em painel. */
function openHrefFor(scenario: SettingsScenario): string {
  if (scenario === "ai") return "/configuracoes/ia";
  if (scenario.startsWith("whatsapp")) return "/configuracoes/whatsapp";
  if (scenario === "calendar" || scenario === "calendar-external")
    return "/configuracoes/agenda";
  if (scenario === "availability") return "/configuracoes/disponibilidade";
  if (scenario === "conversations") return "/configuracoes/conversas";
  if (scenario === "account") return "/configuracoes/conta";
  return "/configuracoes/negocio";
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
  const wide = useWideLayout();
  const hub = isHubScenario(scenario);
  if (!wide) {
    if (hub) return <SettingsHub settings={settings} />;
    return (
      <SettingsSection
        scenario={scenario}
        settings={settings}
        setSettings={setSettings}
        setWhatsappConnected={setWhatsappConnected}
      />
    );
  }
  // De 1024 px em diante, a lista de Configurações fica à esquerda e a seção
  // aberta à direita; no hub, a seção aberta é o Negócio (M1).
  return (
    <ListDetailLayout
      detail={
        hub ? (
          <BusinessSettings
            headingLevel="h2"
            settings={settings}
            onSaved={setSettings}
          />
        ) : (
          <SettingsSection
            scenario={scenario}
            settings={settings}
            setSettings={setSettings}
            setWhatsappConnected={setWhatsappConnected}
          />
        )
      }
      list={
        <SettingsHubPanel
          heading={hub ? "h1" : "h2"}
          openHref={openHrefFor(scenario)}
          settings={settings}
        />
      }
      listLabel="Configurações"
    />
  );
}

function SettingsSection({
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
  return <BusinessSettings settings={settings} onSaved={setSettings} />;
}
