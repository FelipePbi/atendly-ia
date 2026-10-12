import { useEffect, useId, useState } from "react";

import type { BusinessModality } from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import {
  AddressFields,
  addressPartsFromDraft,
} from "@/shared/ui/AddressFields";

import type { OnboardingDraft } from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import { segmentExamples, welcomeAskFor } from "../segmentExamples";
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
  icon: IconName;
  title: string;
  value: BusinessModality;
}> = [
  {
    copy: "Salão, estúdio, consultório ou sala",
    icon: "pin",
    title: "Local próprio",
    value: "ON_SITE",
  },
  {
    copy: "Você vai até o cliente",
    icon: "home",
    title: "A domicílio",
    value: "AT_HOME",
  },
  {
    copy: "Videochamada ou atendimento à distância",
    icon: "monitor",
    title: "Online",
    value: "ONLINE",
  },
];

const SEGMENT_REQUIRED_MESSAGE = "Escolha o segmento do seu negócio.";
const MODALITY_REQUIRED_MESSAGE =
  "Escolha ao menos uma modalidade de atendimento.";

export function businessStepBody(
  scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
) {
  if (scenario === "boas-vindas") return <WelcomeStepBody draft={draft} />;
  if (scenario === "segmento-e-nome") {
    return <SegmentAndNameStepBody draft={draft} setDraft={setDraft} />;
  }
  if (scenario === "modalidade") {
    return <ModalityStepBody draft={draft} setDraft={setDraft} />;
  }
  return <AddressStepBody draft={draft} setDraft={setDraft} />;
}

// Instantes (ms) em que cada parte da cena entra; a última fecha em 3,2 s.
const WELCOME_STAGE_AT_MS = [1200, 2200, 3200];
const WELCOME_LAST_STAGE = WELCOME_STAGE_AT_MS.length;

function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Boas-vindas não grava nada (vault `01-Onboarding.md` §1): composição de
 * três elementos — mensagem da cliente, resposta da IA e agenda com 14:00,
 * 15:30 e 17:00 —, sem carrossel. As partes entram nessa ordem, com a linha
 * de 15:30 por último, em até 3,5 s e sem repetir. Com
 * `prefers-reduced-motion: reduce` a cena abre no estado final. "Começar"
 * não espera a animação. */
function WelcomeStepBody({ draft }: { draft: OnboardingDraft }) {
  // Cena no jeito do segmento e com o serviço real, quando já existem
  // (retomada); na primeira visita, o exemplo genérico.
  const examples = segmentExamples(draft.businessCategory);
  const service = draft.serviceName.trim() || examples.sampleService;
  const [stage, setStage] = useState(() =>
    prefersReducedMotion() ? WELCOME_LAST_STAGE : 0,
  );
  useEffect(() => {
    if (stage >= WELCOME_LAST_STAGE) return;
    const timers = WELCOME_STAGE_AT_MS.map((at, index) =>
      window.setTimeout(
        () => setStage((current) => Math.max(current, index + 1)),
        at,
      ),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // A sequência roda uma vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <figure
      aria-label="Exemplo: um cliente pede horário, a IA responde e o horário entra na agenda"
      className="onboarding-welcome-scene"
      role="img"
    >
      <div className="onboarding-welcome-client">
        {welcomeAskFor(examples, draft.serviceName)}
      </div>
      {stage >= 1 && (
        <div className="onboarding-welcome-reply">
          <div className="onboarding-welcome-reply-bubble">
            Tenho sexta às 15h30. Posso confirmar?
          </div>
          <span className="onboarding-welcome-reply-tag">sua IA</span>
        </div>
      )}
      {stage >= 2 && (
        <div className="onboarding-welcome-agenda">
          <div className="onboarding-welcome-slot is-free">
            <span>14:00</span>
          </div>
          <div className="onboarding-welcome-slot">
            <span>{stage >= 3 ? "15:30" : null}</span>
            {stage >= 3 && (
              <div className="onboarding-welcome-booking">
                <span>{`${examples.clientName} · ${service}`}</span>
                <span aria-hidden="true" className="onboarding-welcome-check">
                  <Icon name="check" />
                </span>
              </div>
            )}
          </div>
          <div className="onboarding-welcome-slot is-free">
            <span>17:00</span>
          </div>
        </div>
      )}
    </figure>
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
            const pressed =
              !customSegment && draft.businessCategory === segment;
            return (
              <button
                aria-pressed={pressed}
                className={`chip${pressed ? " is-active" : ""}`}
                key={segment}
                type="button"
                onClick={() => {
                  setCustomSegment(false);
                  setDraft((value) => ({
                    ...value,
                    businessCategory: segment,
                  }));
                }}
              >
                {pressed && <Icon name="check" />}
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
            {customSegment && <Icon name="check" />}
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
      <span className="label sr-only" id={labelId}>
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
              className={`choice-card choice-card-modality${selected ? " is-selected" : ""}`}
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
              <span className="choice-icon">
                <Icon name={option.icon} />
              </span>
              <span className="choice-text">
                <span className="choice-title">{option.title}</span>
                <span className="choice-copy">{option.copy}</span>
              </span>
              <span className="choice-indicator">
                {selected && <Icon name="check" />}
              </span>
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
    <AddressFields
      value={draft.businessAddress}
      onChange={(updater) =>
        setDraft((value) => ({
          ...value,
          businessAddress: updater(value.businessAddress),
        }))
      }
    />
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
    // O BFF recusa ON_SITE sem endereço: com Local próprio nada é gravado
    // aqui, e `endereco` grava endereço e modalidades juntos. Sem `refresh`,
    // o rascunho não é sobrescrito pelo valor ainda não gravado.
    if (ctx.draft.businessModalities.includes("ON_SITE")) {
      ctx.go("endereco");
      return;
    }
    await onboarding.update({
      business: {
        category: ctx.draft.businessCategory,
        modalities: ctx.draft.businessModalities,
        name: ctx.draft.businessName,
        timezone: ctx.draft.timezone,
      },
    });
    await ctx.refresh();
    ctx.go("sistema-atual");
    return;
  }
  // "endereco": sem Local próprio no rascunho (página aberta direto ou
  // recarregada) não há endereço a gravar; a escolha volta para `modalidade`.
  if (!ctx.draft.businessModalities.includes("ON_SITE")) {
    ctx.go("modalidade");
    return;
  }
  await onboarding.update({
    business: {
      addressParts: addressPartsFromDraft(ctx.draft.businessAddress),
      category: ctx.draft.businessCategory,
      modalities: ctx.draft.businessModalities,
      name: ctx.draft.businessName,
      timezone: ctx.draft.timezone,
    },
  });
  await ctx.refresh();
  ctx.go("sistema-atual");
}
