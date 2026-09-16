"use client";

import { WhatsAppConnectionPanel } from "@/features/whatsapp/WhatsAppConnectionPanel";

import { SettingsPage } from "./shared/SettingsPage";

export function WhatsAppSettings({
  onStatusChange,
}: {
  onStatusChange: (connected: boolean) => void;
}) {
  return (
    <SettingsPage
      title="WhatsApp"
      description="Acompanhe a sessão, conecte, reconecte ou desconecte o número real."
    >
      <WhatsAppConnectionPanel onStatusChange={onStatusChange} />
    </SettingsPage>
  );
}
