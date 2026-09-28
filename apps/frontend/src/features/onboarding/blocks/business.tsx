import { useId, useState } from "react";

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
    copy: "Você vai até o cliente",
    title: "A domicílio",
    value: "AT_HOME",
  },
  {
    copy: "Videochamada ou atendimento à distância",
    title: "Online",
    value: "ONLINE",
  },
];

const SEGMENT_REQUIRED_MESSAGE = "Escolha o segmento do seu negócio.";
const MODALITY_REQUIRED_MESSAGE = "Escolha ao menos uma modalidade de atendimento.";
const ADDRESS_REQUIRED_MESSAGE = "Informe o endereço do seu espaço.";

export function businessStepBody(
  scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
) {
  if (scenario === "boas-vindas") return <WelcomeStepBody />;
  if (scenario === "segmento-e-nome") {
    return <SegmentAndNameStepBody draft={draft} setDraft={setDraft} />;
  }
  if (scenario === "modalidade") {
    return <ModalityStepBody draft={draft} setDraft={setDraft} />;
  }
  return <AddressStepBody draft={draft} setDraft={setDraft} />;
}

/** Boas-vindas não grava nada (vault `01-Onboarding.md` §1): composição
 * estática de três elementos — mensagem do cliente, resposta da IA e o
 * horário na agenda —, sem carrossel e sem movimento. A versão animada do
 * protótipo é do Goal072. */
function WelcomeStepBody() {
  return (
    <div className="onboarding-welcome">
      <figure
        aria-label="Exemplo: um cliente pede horário, a IA responde e o horário entra na agenda"
        className="onboarding-welcome-scene"
        role="img"
      >
        <div className="message-group">
          <span className="message-sender">Cliente</span>
          <div className="message-bubble">Oi! Tem horário na sexta?</div>
        </div>
        <div className="message-group is-outgoing is-ai">
          <span className="message-sender">Sua IA</span>
          <div className="message-bubble">
            Tenho sexta às 15h30. Posso confirmar?
          </div>
        </div>
        <div className="onboarding-welcome-slot">
          <strong>15:30</strong>
          <span>Ana Paula · Corte</span>
        </div>
      </figure>
      <p className="field-help">Seu progresso fica salvo a cada etapa.</p>
    </div>
  );
}

function SegmentAndNameStepBody({
  draft,
  setDraft,
}: {
  draft: OnboardingDraft;
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void;
}) {
  const segmentLabelId = useId();
  const nameHelpId = useId();
  const nameInputId = useId();
  const [customSegment, setCustomSegment] = useState(
    () =>
      draft.businessCategory !== "" &&
      !FREQUENT_BUSINESS_SEGMENTS.includes(draft.businessCategory),
  );
  // Sem chip escolhido, o erro fica no grupo; com "Outro", o campo curto
  // obrigatório decide.
  const segmentMissing = !customSegment && draft.businessCategory === "";
  return (
    <div className="onboarding-form">
      <div className="field">
        <span className="label" id={segmentLabelId}>
          Qual é o seu segmento?
        </span>
        <div
          aria-labelledby={segmentLabelId}
          className="chip-row segment-chip-row"
          data-group-error={segmentMissing ? SEGMENT_REQUIRED_MESSAGE : ""}
          data-validation-group=""
          role="group"
        >
          {FREQUENT_BUSINESS_SEGMENTS.map((segment) => {
            const pressed = !customSegment && draft.businessCategory === segment;
            return (
              <button
                aria-pressed={pressed}
                className={`chip${pressed ? " is-active" : ""}`}
                key={segment}
                type="button"
                onClick={() => {
                  setCustomSegment(false);
                  setDraft((value) => ({ ...value, businessCategory: segment }));
                }}
              >
                {segment}
              </button>
            );
          })}
          <button
            aria-pressed={customSegment}
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
            aria-label="Qual é o seu segmento?"
            className="input"
            data-error-message="Digite seu segmento."
            data-server-field="business.category"
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
        <label className="label" htmlFor={nameInputId}>
          Como seus clientes conhecem você?
        </label>
        <input
          aria-describedby={nameHelpId}
          className="input"
          id={nameInputId}
          data-error-message="Digite como seus clientes conhecem você."
          data-server-field="business.name"
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
        <span className="field-help" id={nameHelpId}>
          Pode ser seu nome ou o nome do seu negócio.
        </span>
      </div>
    </div>
  );
}

function ModalityStepBody({
  draft,
  setDraft,
}: {
  draft: OnboardingDraft;
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void;
}) {
  const labelId = useId();
  // "Ao menos uma modalidade" é erro do grupo, não de um checkbox: o
  // contêiner declara a mensagem e `applyInlineValidation` a liga a ele.
  return (
    <div className="field">
      <span className="label" id={labelId}>
        Modalidade de atendimento
      </span>
      <div
        aria-labelledby={labelId}
        className="choice-grid"
        data-group-error={
          draft.businessModalities.length === 0 ? MODALITY_REQUIRED_MESSAGE : ""
        }
        data-validation-group=""
        role="group"
      >
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
  );
}

function AddressStepBody({
  draft,
  setDraft,
}: {
  draft: OnboardingDraft;
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void;
}) {
  return (
    <label className="field">
      <span className="label">Endereço do seu espaço</span>
      <input
        className="input"
        data-error-message={ADDRESS_REQUIRED_MESSAGE}
        data-server-field="business.address"
        maxLength={300}
        // `required` sozinho não barra um valor só de espaços; o padrão
        // exige ao menos um caractere que não seja espaço.
        pattern=".*\S.*"
        required
        value={draft.businessAddress}
        onChange={(event) =>
          setDraft((value) => ({
            ...value,
            businessAddress: event.target.value,
          }))
        }
      />
    </label>
  );
}

export async function persistBusinessStep(
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  const onboarding = getProductServices().onboarding;
  if (scenario === "boas-vindas") {
    ctx.go("segmento-e-nome");
    return;
  }
  if (scenario === "segmento-e-nome") {
    // O BFF exige name+category+timezone em toda gravação do negócio
    // (Goal065/WU-02): regrava os três a partir do rascunho a cada etapa.
    await onboarding.update({
      business: {
        category: ctx.draft.businessCategory,
        name: ctx.draft.businessName,
        timezone: ctx.draft.timezone,
      },
    });
    await ctx.refresh();
    ctx.go("modalidade");
    return;
  }
  if (scenario === "modalidade") {
    await onboarding.update({
      business: {
        category: ctx.draft.businessCategory,
        modalities: ctx.draft.businessModalities,
        name: ctx.draft.businessName,
        timezone: ctx.draft.timezone,
      },
    });
    await ctx.refresh();
    ctx.go(
      ctx.draft.businessModalities.includes("ON_SITE")
        ? "endereco"
        : "sistema-atual",
    );
    return;
  }
  // "endereco"
  await onboarding.update({
    business: {
      address: ctx.draft.businessAddress.trim(),
      category: ctx.draft.businessCategory,
      modalities: ctx.draft.businessModalities,
      name: ctx.draft.businessName,
      timezone: ctx.draft.timezone,
    },
  });
  await ctx.refresh();
  ctx.go("sistema-atual");
}
