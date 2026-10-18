"use client";

import { useState } from "react";

import type { SettingsState } from "@/data";
import { ActivityScreen } from "@/features/activity/ActivityScreen";
import { ReturnSettingsSection } from "@/features/customer-return/ReturnSettingsSection";
import { ReminderSettingsSection } from "@/features/reminders/ReminderSettingsSection";
import { ListDetailLayout } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { BrandLoader } from "@/shared/ui/Brand";

import { AccountDeletionScreen } from "./AccountDeletionScreen";
import { AccountSettings } from "./AccountSettings";
import { AiSettings } from "./AiSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { AvailabilitySettings } from "./AvailabilitySettings";
import { BusinessKnowledgeSettings } from "./BusinessKnowledgeSettings";
import { BusinessSettings } from "./BusinessSettings";
import { CalendarSettings } from "./CalendarSettings";
import { ConversationsSettings } from "./ConversationsSettings";
import { IgnoredContactsScreen } from "./IgnoredContactsScreen";
import { OfferRulesSettings } from "./OfferRulesSettings";
import { SettingsHub, SettingsHubPanel } from "./SettingsHub";
import { useSettingsData } from "./SettingsWorkspace";
import { SettingsMessage, SettingsPage } from "./shared/SettingsPage";
import type { SettingsScenario } from "./types";
import { WhatsAppSettings } from "./WhatsAppSettings";

export function ProductSettingsScreen({
  scenario,
}: {
  scenario: SettingsScenario;
}) {
  // Debaixo de `SettingsWorkspace`, lidas uma vez para todas as seções: trocar
  // de seção não busca de novo nem passa por "Carregando".
  const { error, setSettings, settings } = useSettingsData();
  const [, setWhatsappConnected] = useState(false);

  useShellConfig({
    active: "configuracoes",
    loading: !settings && !error,
    module: "settings",
    pushed: !isHubScenario(scenario),
    title: "Configurações",
  });

  // Carregando: o "A" animado no centro do conteúdo, e só se a leitura
  // passar de ~150 ms (D-168) — carga rápida entra direto (2026-10-16).
  const showLoader = useDeferredLoading(!settings && !error);
  if (!settings && !error) {
    return showLoader ? (
      <BrandLoader inline label="Carregando configurações" />
    ) : null;
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
    scenario === "account-deletion" ||
    scenario === "appearance" ||
    scenario === "activity" ||
    scenario === "customer-return"
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
  if (scenario === "activity") return "/configuracoes/atividade";
  if (scenario === "customer-return") return "/configuracoes/retorno";
  if (scenario === "appearance") return "/configuracoes/aparencia";
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
  if (scenario === "whatsapp-ignored")
    return <IgnoredContactsScreen settings={settings} />;
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
  if (scenario === "customer-return")
    return (
      <SettingsPage title="Retorno de clientes">
        <ReturnSettingsSection tone={settings.ai.tone ?? "BALANCED"} />
      </SettingsPage>
    );
  if (scenario === "account") return <AccountSettings />;
  if (scenario === "appearance") return <AppearanceSettings />;
  if (scenario === "account-deletion")
    return <AccountDeletionScreen settings={settings} />;
  if (scenario === "activity")
    return (
      <ActivityScreen
        timeZone={settings.business?.timezone ?? "America/Sao_Paulo"}
      />
    );
  return <BusinessSettings settings={settings} onSaved={setSettings} />;
}
