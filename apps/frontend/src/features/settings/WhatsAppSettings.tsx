"use client";

import type { SettingsState } from "@/data";
import { WhatsAppConnectionPanel } from "@/features/whatsapp/WhatsAppConnectionPanel";

import { SettingsPage } from "./shared/SettingsPage";
import { WhatsAppConnectedSettings } from "./WhatsAppConnectedSettings";

export function WhatsAppSettings({
  onStatusChange,
  settings,
}: {
  onStatusChange: (connected: boolean) => void;
  settings: SettingsState;
}) {
  return (
    <SettingsPage
      title="WhatsApp"
      description="Acompanhe a sessão, conecte, reconecte ou desconecte o número real."
    >
      <WhatsAppConnectionPanel
        onStatusChange={onStatusChange}
        renderConnected={(context) => (
          <WhatsAppConnectedSettings context={context} settings={settings} />
        )}
      />
    </SettingsPage>
  );
}
