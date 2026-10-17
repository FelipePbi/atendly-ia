"use client";

import type { AppearanceAccent, AppearanceMode } from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { ACCENT_OPTIONS, MODE_OPTIONS } from "@/shared/theme/appearance";
import { useAppearance } from "@/shared/theme/AppearanceProvider";

import { SettingsPage } from "./shared/SettingsPage";

const MODE_ICONS: Record<AppearanceMode, IconName> = {
  DARK: "moon",
  LIGHT: "sun",
  SYSTEM: "monitor",
};

/**
 * Configurações → Aparência (D-181). Cor de destaque e modo são escolhas
 * independentes: qualquer cor combina com claro, escuro ou automático.
 *
 * Escolher aplica na hora (a própria tela é a prévia) e grava na conta; não
 * há "Salvar". Cada cor mostra uma miniatura pintada pela mesma cascata da
 * interface, no modo em uso.
 */
export function AppearanceSettings() {
  const { appearance, failed, saving, setAppearance } = useAppearance();

  const chooseAccent = (accent: AppearanceAccent) =>
    void setAppearance({ ...appearance, accent });
  const chooseMode = (mode: AppearanceMode) =>
    void setAppearance({ ...appearance, mode });

  return (
    <SettingsPage
      title="Aparência"
      description="Cor e modo da sua conta, em todos os aparelhos."
    >
      <div className="appearance" aria-busy={saving || undefined}>
        <p className="appearance-intro">
          Vale para você em qualquer aparelho em que entrar. Suas clientes não
          veem nada disso.
        </p>

        <fieldset className="appearance-group">
          <legend className="appearance-legend">Cor</legend>
          <div className="appearance-accents">
            {ACCENT_OPTIONS.map((option) => {
              const checked = appearance.accent === option.id;
              return (
                <label
                  className={`appearance-accent${checked ? " is-selected" : ""}`}
                  key={option.id}
                >
                  <input
                    checked={checked}
                    className="appearance-input"
                    name="appearance-accent"
                    onChange={() => chooseAccent(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  <AccentPreview accent={option.id} />
                  <span className="appearance-accent-name">
                    <span>{option.label}</span>
                    {option.id === "VERDE" && (
                      <span className="appearance-default">Padrão</span>
                    )}
                  </span>
                  <span aria-hidden="true" className="appearance-check">
                    {checked && <Icon name="check" />}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="appearance-group">
          <legend className="appearance-legend">Modo</legend>
          <div className="appearance-modes">
            {MODE_OPTIONS.map((option) => {
              const checked = appearance.mode === option.id;
              return (
                <label
                  className={`appearance-mode${checked ? " is-selected" : ""}`}
                  key={option.id}
                >
                  <input
                    checked={checked}
                    className="appearance-input"
                    name="appearance-mode"
                    onChange={() => chooseMode(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  <Icon
                    className="appearance-mode-icon"
                    name={MODE_ICONS[option.id]}
                  />
                  <span className="appearance-mode-copy">
                    <span className="appearance-mode-name">{option.label}</span>
                    <span className="appearance-mode-note">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {failed && (
          <p className="appearance-error" role="alert">
            Não deu para salvar na sua conta. A aparência voltou para a
            anterior; tente de novo.
          </p>
        )}
      </div>
    </SettingsPage>
  );
}

/**
 * Miniatura da interface na cor `accent`: cabeçalho, um cartão com destaque
 * e um botão. As cores vêm de `[data-accent]` em themes.css, então são as
 * mesmas da tela de verdade.
 */
function AccentPreview({ accent }: { accent: AppearanceAccent }) {
  return (
    <span
      aria-hidden="true"
      className="appearance-preview"
      data-accent={accent.toLowerCase()}
    >
      <span className="appearance-preview-bar" />
      <span className="appearance-preview-card">
        <span className="appearance-preview-line is-strong" />
        <span className="appearance-preview-line" />
        <span className="appearance-preview-chip" />
      </span>
      <span className="appearance-preview-button" />
    </span>
  );
}
