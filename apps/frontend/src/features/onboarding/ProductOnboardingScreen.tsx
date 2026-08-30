"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { BffHttpError } from "@/data";
import { WhatsAppConnectionPanel } from "@/features/whatsapp/WhatsAppConnectionPanel";
import { Icon } from "@/shared/icons/Icon";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { Brand } from "@/shared/ui/Brand";

import { useOnboardingRuntime } from "./OnboardingRuntime";
import { type OnboardingScenario, onboardingScenarios } from "./scenarios";

const flow: OnboardingScenario[] = [
  "dados-do-negocio",
  "fonte-da-agenda",
  "agenda-atendly-confirmar",
  "agenda-atendly-metodo",
  "servico-nome",
  "servico-duracao",
  "servico-preco",
  "dias-de-atendimento",
  "horarios",
  "agenda-atendly-pronta",
  "tom-da-ia",
  "whatsapp",
  "validacao",
];

const weekdayLabels = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function ProductOnboardingScreen({
  scenario,
}: {
  scenario: OnboardingScenario;
}) {
  const router = useRouter();
  const { refreshSession, setUnauthenticated } = useProductRuntime();
  const {
    draft,
    error: loadError,
    loading,
    refresh,
    setDraft,
  } = useOnboardingRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eyebrow, title, description] = onboardingScenarios[scenario];
  const position = Math.max(0, flow.indexOf(scenario));
  const progress = Math.round(((position + 1) / flow.length) * 100);

  if (loading)
    return <ProductMessage message="Carregando sua configuração..." />;
  if (loadError) return <ProductMessage message={loadError} />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await persistStep(scenario);
    } catch (caught: unknown) {
      setError(onboardingError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function persistStep(step: OnboardingScenario) {
    const onboarding = getProductServices().onboarding;
    switch (step) {
      case "dados-do-negocio":
        await onboarding.update({
          business: {
            category: draft.businessCategory,
            name: draft.businessName,
            timezone: draft.timezone,
          },
        });
        await refresh();
        go("fonte-da-agenda");
        return;
      case "fonte-da-agenda":
        if (draft.calendarSource === "EXTERNAL") {
          go("minha-agenda-conectar");
          return;
        }
        if (draft.calendarSource !== "ATENDLY") {
          setError("Escolha uma fonte oficial para continuar.");
          return;
        }
        await onboarding.update({
          calendar: { source: "ATENDLY", timezone: draft.timezone },
        });
        await refresh();
        go("agenda-atendly-confirmar");
        return;
      case "agenda-atendly-confirmar":
        go("agenda-atendly-metodo");
        return;
      case "agenda-atendly-metodo":
        go("servico-nome");
        return;
      case "servico-nome":
        go("servico-duracao");
        return;
      case "servico-duracao":
        go("servico-preco");
        return;
      case "servico-preco": {
        const fixedPrice = Number(draft.servicePrice.replace(",", "."));
        await onboarding.update({
          service: {
            active: true,
            durationMinutes: draft.serviceDuration,
            id: draft.serviceId,
            name: draft.serviceName,
            price: draft.servicePriceType === "ON_REQUEST" ? null : fixedPrice,
            priceType: draft.servicePriceType,
          },
        });
        await refresh();
        go("dias-de-atendimento");
        return;
      }
      case "dias-de-atendimento":
        if (draft.days.length === 0) {
          setError("Escolha pelo menos um dia de atendimento.");
          return;
        }
        go("horarios");
        return;
      case "horarios":
        if (draft.startTime >= draft.endTime) {
          setError("O horário final deve ser posterior ao horário inicial.");
          return;
        }
        await onboarding.update({
          availability: {
            timezone: draft.timezone,
            rules: draft.days.map((dayOfWeek) => ({
              active: true,
              dayOfWeek,
              endTime: draft.endTime,
              startTime: draft.startTime,
            })),
          },
        });
        await refresh();
        go("agenda-atendly-pronta");
        return;
      case "agenda-atendly-pronta":
        go("tom-da-ia");
        return;
      case "tom-da-ia":
        if (!draft.tone) {
          setError("Escolha um dos dois tons disponíveis.");
          return;
        }
        await onboarding.update({ ai: { tone: draft.tone } });
        await refresh();
        go("whatsapp");
        return;
      case "whatsapp": {
        const connection = await getProductServices().whatsapp.get();
        if (connection?.status !== "CONNECTED") {
          setError("Conclua a vinculação no WhatsApp antes de continuar.");
          return;
        }
        await refresh();
        go("validacao");
        return;
      }
      case "validacao":
        await onboarding.complete();
        await refreshSession();
        router.replace("/inicio");
        return;
      default:
        go("fonte-da-agenda");
    }
  }

  async function logout() {
    await getProductServices()
      .auth.logout()
      .catch(() => undefined);
    setUnauthenticated();
    router.replace("/login");
  }

  function go(step: OnboardingScenario) {
    router.push(`/onboarding/${step}`);
  }

  const previous = position > 0 ? flow[position - 1] : undefined;
  const external = scenario.startsWith("minha-agenda-");
  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <Brand href="/onboarding" />
        <div className="step-progress" aria-label={`Progresso: ${progress}%`}>
          <div className="step-progress-row">
            <span>Configuração inicial</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <button
          className="onboarding-exit"
          type="button"
          onClick={() => void logout()}
        >
          Sair
        </button>
      </header>
      <form
        className="onboarding-main"
        onSubmit={(event) => void submit(event)}
      >
        <div className="onboarding-content">
          <header className="onboarding-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          <div className="onboarding-step-body">
            {external ? (
              <ExternalUnavailable />
            ) : (
              <StepBody draft={draft} scenario={scenario} setDraft={setDraft} />
            )}
          </div>
          {error && (
            <div className="onboarding-note is-important" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          )}
          <div className="onboarding-actions">
            {external ? (
              <Link
                className="btn btn-secondary"
                href="/onboarding/fonte-da-agenda"
              >
                Escolher Agenda Atendly
              </Link>
            ) : (
              <>
                {previous && (
                  <Link
                    className="btn btn-secondary"
                    href={`/onboarding/${previous}`}
                  >
                    Voltar
                  </Link>
                )}
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy
                    ? "Salvando..."
                    : scenario === "validacao"
                      ? "Concluir configuração"
                      : "Continuar"}
                </button>
              </>
            )}
          </div>
        </div>
      </form>
    </main>
  );
}

function StepBody({
  draft,
  scenario,
  setDraft,
}: {
  draft: ReturnType<typeof useOnboardingRuntime>["draft"];
  scenario: OnboardingScenario;
  setDraft: ReturnType<typeof useOnboardingRuntime>["setDraft"];
}) {
  if (scenario === "dados-do-negocio")
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
        <label className="field">
          <span className="label">Categoria</span>
          <input
            className="input"
            required
            value={draft.businessCategory}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                businessCategory: event.target.value,
              }))
            }
          />
        </label>
      </div>
    );
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
  if (scenario === "agenda-atendly-pronta")
    return (
      <Summary
        rows={[
          ["Serviço", draft.serviceName],
          ["Duração", `${draft.serviceDuration} minutos`],
          ["Fonte oficial", "Agenda Atendly"],
        ]}
      />
    );
  if (scenario === "tom-da-ia")
    return (
      <div className="choice-grid">
        <Choice
          selected={draft.tone === "PROFESSIONAL_OBJECTIVE"}
          title="Profissional e objetiva"
          copy="Direta, clara e cordial."
          onClick={() =>
            setDraft((value) => ({ ...value, tone: "PROFESSIONAL_OBJECTIVE" }))
          }
        />
        <Choice
          selected={draft.tone === "LIGHT_CLOSE"}
          title="Leve e próxima"
          copy="Natural, acolhedora e simples."
          onClick={() =>
            setDraft((value) => ({ ...value, tone: "LIGHT_CLOSE" }))
          }
        />
      </div>
    );
  if (scenario === "whatsapp") return <WhatsAppConnectionPanel />;
  if (scenario === "validacao")
    return (
      <Summary
        rows={[
          ["Negócio", "Configurado"],
          ["Agenda", "Agenda Atendly"],
          ["WhatsApp", "Conectado"],
          ["Atendente virtual", "Configurado"],
        ]}
      />
    );
  return null;
}

function Choice({
  copy,
  onClick,
  selected,
  title,
}: {
  copy: string;
  onClick: () => void;
  selected: boolean;
  title: string;
}) {
  return (
    <button
      className={`choice-card${selected ? " is-selected" : ""}`}
      type="button"
      onClick={onClick}
    >
      <span className="choice-check">
        <Icon name="check" />
      </span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </button>
  );
}

function Summary({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="service-summary">
      {rows.map(([label, value]) => (
        <div className="summary-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ExternalUnavailable() {
  return (
    <div className="onboarding-note is-important">
      <Icon name="info" />
      <span>
        A autenticação da Minha Agenda ainda depende da definição do provedor.
        Nenhuma conexão será simulada ou marcada como concluída.
      </span>
    </div>
  );
}

function ProductMessage({ message }: { message: string }) {
  return (
    <main className="onboarding-shell">
      <section className="onboarding-main">
        <div className="analysis-panel" aria-live="polite">
          <span className="spinner" />
          <p>{message}</p>
        </div>
      </section>
    </main>
  );
}

function onboardingError(error: unknown): string {
  if (error instanceof BffHttpError && error.status === 409) {
    return "Ainda há itens obrigatórios pendentes. Revise agenda, serviço, disponibilidade e WhatsApp.";
  }
  return "Não foi possível salvar esta etapa. Tente novamente.";
}
