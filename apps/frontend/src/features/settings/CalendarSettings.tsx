"use client";

import type { SettingsState } from "@/data";
import { ReminderSettingsSection } from "@/features/reminders/ReminderSettingsSection";
import { Icon } from "@/shared/icons/Icon";

import { sourceLabel } from "./shared/labels";
import { SettingsPage } from "./shared/SettingsPage";

export function CalendarSettings({ settings }: { settings: SettingsState }) {
  return (
    <SettingsPage
      title="Agenda"
      description="Consulte a fonte oficial usada para disponibilidade e agendamentos."
    >
      <section className="settings-panel">
        <div className="settings-source-card">
          <span className="settings-source-icon">
            <Icon name="calendar" />
          </span>
          <div className="settings-source-copy">
            <strong>{sourceLabel(settings.calendar.source)}</strong>
            <span>
              {settings.calendar.source
                ? "Fonte oficial configurada"
                : "Fonte ainda não selecionada"}
            </span>
          </div>
        </div>
        <div className="onboarding-note">
          <Icon name="info" />
          <span>
            A troca de origem exige migração assistida e não é um toggle nesta
            tela.
          </span>
        </div>
      </section>
      <ReminderSettingsSection />
    </SettingsPage>
  );
}
