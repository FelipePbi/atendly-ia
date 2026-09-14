import { useState } from "react";

import type { BusinessModality } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import type { OnboardingStepContext } from "./shared";

/** Segmentos frequentes do vault (docs/product-vault/02-Fluxos/01-Onboarding.md);
 * "Outro" sempre fica disponível para texto livre. */
export const FREQUENT_BUSINESS_SEGMENTS = [
  "Cabelo",
  "Barbearia",
  "Unhas",
  "Sobrancelhas e cílios",
  "Estética",
  "Massagem e terapias",
  "Personal trainer",
];

export const BUSINESS_MODALITY_OPTIONS: Array<{
  copy: string;
  title: string;
  value: BusinessModality;
}> = [
  {
    copy: "Salão, estúdio, consultório ou sala",
    title: "Local próprio",
    value: "ON_SITE",
  },
  {
    copy: "Atendimento no endereço do cliente",
    title: "Domicílio",
    value: "AT_HOME",
  },
  {
    copy: "Videochamada ou atendimento à distância",
    title: "Online",
    value: "ONLINE",
  },
];

export function businessStepBody(
  _scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
) {
  return <BusinessStepBody draft={draft} setDraft={setDraft} />;
}

function BusinessStepBody({
  draft,
  setDraft,
}: {
  draft: OnboardingDraft;
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void;
}) {
  const [customSegment, setCustomSegment] = useState(
    () =>
      draft.businessCategory !== "" &&
      !FREQUENT_BUSINESS_SEGMENTS.includes(draft.businessCategory),
  );
  const requiresAddress = draft.businessModalities.includes("ON_SITE");
  return (
    <div className="onboarding-form">
      <label className="field">
        <span className="label">Nome do negócio</span>
        <input
          className="input"
          required
          minLength={2}
          value={draft.businessName}
          onChange={(event) =>
            setDraft((value) => ({
              ...value,
              businessName: event.target.value,
            }))
          }
        />
      </label>
      <div className="field">
        <span className="label">Qual é o seu segmento?</span>
        <div className="chip-row">
          {FREQUENT_BUSINESS_SEGMENTS.map((segment) => (
            <button
              className={`chip${!customSegment && draft.businessCategory === segment ? " is-active" : ""}`}
              key={segment}
              type="button"
              onClick={() => {
                setCustomSegment(false);
                setDraft((value) => ({ ...value, businessCategory: segment }));
              }}
            >
              {segment}
            </button>
          ))}
          <button
            className={`chip${customSegment ? " is-active" : ""}`}
            type="button"
            onClick={() => {
              setCustomSegment(true);
              setDraft((value) => ({ ...value, businessCategory: "" }));
            }}
          >
            Outro
          </button>
        </div>
        {customSegment && (
          <input
            className="input"
            required
            placeholder="Qual é o seu segmento?"
            value={draft.businessCategory}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                businessCategory: event.target.value,
              }))
            }
          />
        )}
      </div>
      <div className="field">
        <span className="label">Modalidade de atendimento</span>
        <div className="choice-grid">
          {BUSINESS_MODALITY_OPTIONS.map((option) => {
            const selected = draft.businessModalities.includes(option.value);
            return (
              <label
                className={`choice-card${selected ? " is-selected" : ""}`}
                key={option.value}
              >
                <input
                  checked={selected}
                  className="sr-only"
                  type="checkbox"
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      businessModalities: event.target.checked
                        ? [...value.businessModalities, option.value]
                        : value.businessModalities.filter(
                            (item) => item !== option.value,
                          ),
                    }))
                  }
                />
                <h3>{option.title}</h3>
                <p>{option.copy}</p>
              </label>
            );
          })}
        </div>
      </div>
      {requiresAddress && (
        <label className="field">
          <span className="label">Endereço do seu espaço</span>
          <input
            className="input"
            required
            maxLength={300}
            value={draft.businessAddress}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                businessAddress: event.target.value,
              }))
            }
          />
        </label>
      )}
    </div>
  );
}

export async function persistBusinessStep(
  _scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  if (ctx.draft.businessModalities.length === 0) {
    ctx.setError("Escolha ao menos uma modalidade de atendimento.");
    return;
  }
  const onSite = ctx.draft.businessModalities.includes("ON_SITE");
  if (onSite && !ctx.draft.businessAddress.trim()) {
    ctx.setError("Informe o endereço do seu espaço.");
    return;
  }
  await getProductServices().onboarding.update({
    business: {
      ...(onSite ? { address: ctx.draft.businessAddress.trim() } : {}),
      category: ctx.draft.businessCategory,
      modalities: ctx.draft.businessModalities,
      name: ctx.draft.businessName,
      timezone: ctx.draft.timezone,
    },
  });
  await ctx.refresh();
  ctx.go("fonte-da-agenda");
}
