"use client";

import { KnowledgeSection } from "@/features/knowledge/KnowledgeSection";
import { OtherInfoSection } from "@/features/knowledge/OtherInfoSection";

import { SettingsPage } from "./shared/SettingsPage";

export function BusinessKnowledgeSettings() {
  return (
    <SettingsPage
      backHref="/configuracoes/negocio"
      backLabel="Voltar para Negócio"
      title="Perguntas frequentes"
      description="O que a IA sabe responder sobre o seu negócio."
    >
      <div className="settings-stack">
        <KnowledgeSection />
        <OtherInfoSection />
      </div>
    </SettingsPage>
  );
}
