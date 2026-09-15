import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import {
  type OnboardingDraft,
  onboardingPriceType,
} from "../OnboardingRuntime";
import type { OnboardingScenario } from "../scenarios";
import {
  Choice,
  ExternalUnavailable,
  type OnboardingStepContext,
  Summary,
} from "./shared";

const weekdayLabels = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function scheduleStepBody(
  scenario: OnboardingScenario,
  draft: OnboardingDraft,
  setDraft: (updater: (value: OnboardingDraft) => OnboardingDraft) => void,
) {
  if (scenario.startsWith("minha-agenda-")) return <ExternalUnavailable />;
  if (scenario === "fonte-da-agenda")
    return (
      <div className="choice-grid">
        <Choice
          selected={draft.calendarSource === "ATENDLY"}
          title="Agenda Atendly"
          copy="Gerencie serviços, disponibilidade e agendamentos na Atendly."
          onClick={() =>
            setDraft((value) => ({ ...value, calendarSource: "ATENDLY" }))
          }
        />
        <Choice
          selected={draft.calendarSource === "EXTERNAL"}
          title="Minha Agenda"
          copy="Use a integração externa como fonte oficial."
          onClick={() =>
            setDraft((value) => ({ ...value, calendarSource: "EXTERNAL" }))
          }
        />
      </div>
    );
  if (scenario === "agenda-atendly-confirmar")
    return (
      <Summary
        rows={[
          ["Fonte oficial", "Agenda Atendly"],
          ["Fuso horário", draft.timezone],
        ]}
      />
    );
  if (scenario === "agenda-atendly-metodo")
    return (
      <>
        <Choice
          selected
          title="Começar do zero"
          copy="Cadastre seu primeiro serviço e disponibilidade agora."
          onClick={() => undefined}
        />
        <div className="onboarding-note">
          <Icon name="info" />
          <span>A importação única será habilitada no fluxo de migração.</span>
        </div>
      </>
    );
  if (scenario === "servico-nome")
    return (
      <label className="field">
        <span className="label">Nome do serviço</span>
        <input
          className="input"
          required
          value={draft.serviceName}
          onChange={(event) =>
            setDraft((value) => ({ ...value, serviceName: event.target.value }))
          }
        />
      </label>
    );
  if (scenario === "servico-duracao")
    return (
      <label className="field">
        <span className="label">Duração em minutos</span>
        <input
          className="input"
          min={5}
          max={1440}
          required
          type="number"
          value={draft.serviceDuration}
          onChange={(event) =>
            setDraft((value) => ({
              ...value,
              serviceDuration: Number(event.target.value),
            }))
          }
        />
      </label>
    );
  if (scenario === "servico-preco")
    return (
      <div className="onboarding-form">
        <label className="check">
          <input
            checked={draft.servicePriceType === "ON_REQUEST"}
            type="checkbox"
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                servicePriceType: event.target.checked ? "ON_REQUEST" : "FIXED",
              }))
            }
          />
          <span className="check-box" aria-hidden="true" />
          <span>Sob consulta</span>
        </label>
        {draft.servicePriceType === "FIXED" && (
          <label className="field">
            <span className="label">Preço em reais</span>
            <input
              className="input"
              min="0"
              required
              step="0.01"
              type="number"
              value={draft.servicePrice}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  servicePrice: event.target.value,
                }))
              }
            />
          </label>
        )}
      </div>
    );
  if (scenario === "dias-de-atendimento")
    return (
      <div className="choice-grid">
        {weekdayLabels.map((label, day) => (
          <label
            className={`choice-card${draft.days.includes(day) ? " is-selected" : ""}`}
            key={label}
          >
            <input
              className="sr-only"
              checked={draft.days.includes(day)}
              type="checkbox"
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  days: event.target.checked
                    ? [...value.days, day].sort()
                    : value.days.filter((item) => item !== day),
                }))
              }
            />
            <h3>{label}</h3>
          </label>
        ))}
      </div>
    );
  if (scenario === "horarios")
    return (
      <div className="choice-grid">
        <label className="field">
          <span className="label">Início</span>
          <input
            className="input"
            required
            type="time"
            value={draft.startTime}
            onChange={(event) =>
              setDraft((value) => ({ ...value, startTime: event.target.value }))
            }
          />
        </label>
        <label className="field">
          <span className="label">Fim</span>
          <input
            className="input"
            required
            type="time"
            value={draft.endTime}
            onChange={(event) =>
              setDraft((value) => ({ ...value, endTime: event.target.value }))
            }
          />
        </label>
      </div>
    );
  return (
    <Summary
      rows={[
        ["Serviço", draft.serviceName],
        ["Duração", `${draft.serviceDuration} minutos`],
        ["Fonte oficial", "Agenda Atendly"],
      ]}
    />
  );
}

export async function persistScheduleStep(
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  const onboarding = getProductServices().onboarding;
  switch (scenario) {
    case "fonte-da-agenda":
      if (ctx.draft.calendarSource === "EXTERNAL") {
        ctx.go("minha-agenda-conectar");
        return;
      }
      if (ctx.draft.calendarSource !== "ATENDLY") {
        ctx.setError("Escolha uma fonte oficial para continuar.");
        return;
      }
      await onboarding.update({
        calendar: { source: "ATENDLY", timezone: ctx.draft.timezone },
      });
      await ctx.refresh();
      ctx.go("agenda-atendly-confirmar");
      return;
    case "agenda-atendly-confirmar":
      ctx.go("agenda-atendly-metodo");
      return;
    case "agenda-atendly-metodo":
      ctx.go("servico-nome");
      return;
    case "servico-nome":
      ctx.go("servico-duracao");
      return;
    case "servico-duracao":
      ctx.go("servico-preco");
      return;
    case "servico-preco": {
      const fixedPrice = Number(ctx.draft.servicePrice.replace(",", "."));
      // O onboarding só grava os dois tipos originais; um tipo novo
      // herdado de um serviço existente (ex.: importado) é normalizado
      // pelo par mais próximo — nunca preço zero (ver OnboardingRuntime).
      const priceType = onboardingPriceType(ctx.draft.servicePriceType);
      await onboarding.update({
        service: {
          active: true,
          durationMinutes: ctx.draft.serviceDuration,
          id: ctx.draft.serviceId,
          name: ctx.draft.serviceName,
          price: priceType === "ON_REQUEST" ? null : fixedPrice,
          priceType,
        },
      });
      await ctx.refresh();
      ctx.go("dias-de-atendimento");
      return;
    }
    case "dias-de-atendimento":
      if (ctx.draft.days.length === 0) {
        ctx.setError("Escolha pelo menos um dia de atendimento.");
        return;
      }
      ctx.go("horarios");
      return;
    case "horarios":
      if (ctx.draft.startTime >= ctx.draft.endTime) {
        ctx.setError("O horário final deve ser posterior ao horário inicial.");
        return;
      }
      await onboarding.update({
        availability: {
          timezone: ctx.draft.timezone,
          rules: ctx.draft.days.map((dayOfWeek) => ({
            active: true,
            dayOfWeek,
            endTime: ctx.draft.endTime,
            startTime: ctx.draft.startTime,
          })),
        },
      });
      await ctx.refresh();
      ctx.go("agenda-atendly-pronta");
      return;
    case "agenda-atendly-pronta":
      ctx.go("demonstracao-da-ia");
      return;
    default:
      ctx.go("fonte-da-agenda");
  }
}
