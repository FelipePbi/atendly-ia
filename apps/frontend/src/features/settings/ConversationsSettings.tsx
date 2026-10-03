"use client";

import { RetentionSection } from "@/features/settings/RetentionSection";

import { SettingsPage } from "./shared/SettingsPage";

/**
 * Configurações → Conversas (Goal023/§8, G-29; R1 no Goal104).
 *
 * Página própria, no mesmo padrão das seções vigentes: a retenção é decisão
 * sobre **conteúdo de conversa**, não sobre credencial de acesso, e escondê-la
 * dentro de Conta faria a única superfície que apaga mensagem do cliente morar
 * atrás de um card que se descreve como "Senha e acesso".
 */
export function ConversationsSettings() {
  return (
    <SettingsPage
      title="Conversas"
      description="Por quanto tempo o conteúdo das mensagens fica guardado."
    >
      <RetentionSection />
    </SettingsPage>
  );
}
