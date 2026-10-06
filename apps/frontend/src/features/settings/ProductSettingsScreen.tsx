"use client";

import { useEffect, useState } from "react";

import type { SettingsState } from "@/data";
import { ReminderSettingsSection } from "@/features/reminders/ReminderSettingsSection";
import { ListDetailLayout } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { AccountDeletionScreen } from "./AccountDeletionScreen";
import { AccountSettings } from "./AccountSettings";
import { AiSettings } from "./AiSettings";
import { AvailabilitySettings } from "./AvailabilitySettings";
import { BusinessKnowledgeSettings } from "./BusinessKnowledgeSettings";
import { BusinessSettings } from "./BusinessSettings";
import { CalendarSettings } from "./CalendarSettings";
import { ConversationsSettings } from "./ConversationsSettings";
import { OfferRulesSettings } from "./OfferRulesSettings";
import { SettingsHub, SettingsHubPanel } from "./SettingsHub";
import { SettingsMessage, SettingsPage } from "./shared/SettingsPage";
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
    scenario === "business-faq" ||
    scenario === "ai" ||
    scenario.startsWith("whatsapp") ||
    scenario === "calendar" ||
    scenario === "calendar-external" ||
    scenario === "calendar-reminders" ||
    scenario === "calendar-rules" ||
    scenario === "availability" ||
    scenario === "conversations" ||
    scenario === "account" ||
    scenario === "account-deletion"
  );
}

/** Rota da seção aberta, marcada na lista de Configurações em painel. */
function openHrefFor(scenario: SettingsScenario): string {
  if (scenario === "ai") return "/configuracoes/ia";
  if (scenario.startsWith("whatsapp")) return "/configuracoes/whatsapp";
  if (
    scenario === "calendar" ||
    scenario === "calendar-external" ||
    scenario === "calendar-reminders" ||
    scenario === "calendar-rules" ||
    scenario === "availability"
  )
    return "/configuracoes/agenda";
  if (scenario === "conversations") return "/configuracoes/conversas";
  if (scenario === "account" || scenario === "account-deletion")
    return "/configuracoes/conta";
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
  if (!wide && hub) return <SettingsHub settings={settings} />;
  // De 1024 px em diante, a lista de Configurações fica à esquerda e a seção
  // aberta à direita; no hub, a seção aberta é o Negócio (M1). Abaixo disso, a
  // seção segue na mesma posição da árvore, só sem a lista.
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
      split={wide}
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
  if (scenario === "business-faq") return <BusinessKnowledgeSettings />;
  if (scenario === "ai")
    return <AiSettings settings={settings} onSaved={setSettings} />;
  if (scenario.startsWith("whatsapp"))
    return (
      <WhatsAppSettings
        onStatusChange={setWhatsappConnected}
        settings={settings}
      />
    );
  if (scenario === "calendar" || scenario === "calendar-external")
    return <CalendarSettings settings={settings} />;
  if (scenario === "calendar-rules")
    return <OfferRulesSettings settings={settings} onSaved={setSettings} />;
  if (scenario === "calendar-reminders")
    return (
      <SettingsPage
        backHref="/configuracoes/agenda"
        backLabel="Voltar para Agenda"
        title="Lembretes"
      >
        <ReminderSettingsSection settings={settings} />
      </SettingsPage>
    );
  if (scenario === "availability")
    return <AvailabilitySettings settings={settings} onSaved={setSettings} />;
  if (scenario === "conversations") return <ConversationsSettings />;
  if (scenario === "account") return <AccountSettings />;
  if (scenario === "account-deletion")
    return <AccountDeletionScreen settings={settings} />;
  return <BusinessSettings settings={settings} onSaved={setSettings} />;
}
