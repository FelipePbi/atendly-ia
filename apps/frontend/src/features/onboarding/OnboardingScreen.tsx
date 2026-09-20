"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";

import {
  blockForScenario,
  onboardingBlockLabels,
  onboardingFlow,
  progressPercent,
} from "./blocks";
import { skipActivationTestStep } from "./blocks/activation-test";
import {
  onboardingError,
  stepBodyByBlock,
  stepPersistByBlock,
} from "./blocks/registry";
import { skipIgnoredContactsStep, skipWhatsappStep } from "./blocks/whatsapp";
import { useOnboardingRuntime } from "./OnboardingRuntime";
import { OnboardingShell } from "./OnboardingShell";
import { type OnboardingScenario, onboardingScenarios } from "./scenarios";

/** Despachante: escolhe o bloco pelo cenário e delega corpo/persistência a
 * `features/onboarding/blocks/*`. Nenhum bloco conhece os outros. */
export function OnboardingScreen({
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

  if (loading)
    return <OnboardingMessage message="Carregando sua configuração..." />;
  if (loadError) return <OnboardingMessage message={loadError} />;

  const blockId = blockForScenario(scenario);
  const blockLabel = onboardingBlockLabels[blockId];
  const isWhatsappIntro = scenario === "whatsapp";
  const isWhatsappConclusion = scenario === "whatsapp-concluido";
  const isIgnoredContactsStep = scenario === "contatos-ignorados";
  const isActivationTestIntro = scenario === "teste-real";
  const isActivationTestProgress = scenario === "teste-real-progresso";
  const isActivationTestPaused = scenario === "teste-real-interferencia";
  const isActivationTestFailed = scenario === "teste-real-falha";
  const isActivationTestSucceeded = scenario === "teste-real-sucesso";
  const index = onboardingFlow.indexOf(scenario);
  const previous = index > 0 ? onboardingFlow[index - 1] : undefined;

  function go(step: OnboardingScenario) {
    router.push(`/onboarding/${step}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await stepPersistByBlock[blockId](scenario, {
        draft,
        go,
        refresh,
        refreshSession,
        router,
        setError,
      });
    } catch (caught: unknown) {
      setError(onboardingError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    setError(null);
    try {
      await skipWhatsappStep({
        draft,
        go,
        refresh,
        refreshSession,
        router,
        setError,
      });
    } catch (caught: unknown) {
      setError(onboardingError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function skipActivationTest() {
    setBusy(true);
    setError(null);
    try {
      await skipActivationTestStep({
        draft,
        go,
        refresh,
        refreshSession,
        router,
        setError,
      });
    } catch (caught: unknown) {
      setError(onboardingError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function skipIgnoredContacts() {
    setBusy(true);
    setError(null);
    try {
      await skipIgnoredContactsStep({
        draft,
        go,
        refresh,
        refreshSession,
        router,
        setError,
      });
    } catch (caught: unknown) {
      setError(onboardingError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await getProductServices()
      .auth.logout()
      .catch(() => undefined);
    setUnauthenticated();
    router.replace("/login");
  }

  const actions = isActivationTestSucceeded ? (
    // Sucesso: só o CTA do vault. Não há "voltar" para um teste que terminou.
    <button className="btn btn-primary" disabled={busy} type="submit">
      {busy ? "Abrindo..." : "Ir para o início"}
    </button>
  ) : isActivationTestProgress ? (
    // Em andamento não há nada a submeter: a execução é do servidor, e sair
    // desta tela não a cancela. "Continuar" existe para quando ela termina.
    <>
      <button
        className="btn btn-secondary"
        disabled={busy}
        type="button"
        onClick={() => void skipActivationTest()}
      >
        {busy ? "Salvando..." : "Continuar depois"}
      </button>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Lendo..." : "Continuar"}
      </button>
    </>
  ) : isActivationTestPaused ? (
    <button className="btn btn-primary" disabled={busy} type="submit">
      {busy ? "Reiniciando..." : "Reiniciar teste"}
    </button>
  ) : isActivationTestFailed ? (
    <>
      <button
        className="btn btn-secondary"
        disabled={busy}
        type="button"
        onClick={() => void skipActivationTest()}
      >
        {busy ? "Salvando..." : "Fazer isso depois"}
      </button>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Iniciando..." : "Tentar novamente"}
      </button>
    </>
  ) : isActivationTestIntro ? (
    <>
      {previous && (
        <Link className="btn btn-secondary" href={`/onboarding/${previous}`}>
          Voltar
        </Link>
      )}
      <button
        className="btn btn-secondary"
        disabled={busy}
        type="button"
        onClick={() => void skipActivationTest()}
      >
        {busy ? "Salvando..." : "Fazer isso depois"}
      </button>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Iniciando..." : "Iniciar teste"}
      </button>
    </>
  ) : isWhatsappConclusion ? (
    <>
      <Link className="btn btn-secondary" href="/configuracoes/whatsapp">
        Conectar agora
      </Link>
      <Link className="btn btn-primary" href="/inicio">
        Ir para o início
      </Link>
    </>
  ) : isWhatsappIntro ? (
    <>
      {previous && (
        <Link className="btn btn-secondary" href={`/onboarding/${previous}`}>
          Voltar
        </Link>
      )}
      <button
        className="btn btn-secondary"
        disabled={busy}
        type="button"
        onClick={() => void skip()}
      >
        {busy ? "Salvando..." : "Fazer isso depois"}
      </button>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Salvando..." : "Conectar meu WhatsApp"}
      </button>
    </>
  ) : isIgnoredContactsStep ? (
    <>
      {previous && (
        <Link className="btn btn-secondary" href={`/onboarding/${previous}`}>
          Voltar
        </Link>
      )}
      <button
        className="btn btn-secondary"
        disabled={busy}
        type="button"
        onClick={() => void skipIgnoredContacts()}
      >
        {busy ? "Salvando..." : "Pular esta etapa"}
      </button>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Salvando..." : "Ir para o teste"}
      </button>
    </>
  ) : (
    <>
      {previous && (
        <Link className="btn btn-secondary" href={`/onboarding/${previous}`}>
          Voltar
        </Link>
      )}
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Salvando..." : "Continuar"}
      </button>
    </>
  );

  return (
    <OnboardingShell
      actions={actions}
      blockLabel={blockLabel}
      body={stepBodyByBlock[blockId](scenario, draft, setDraft)}
      description={description}
      error={error}
      eyebrow={eyebrow}
      onExit={() => void logout()}
      onSubmit={(event) => void submit(event)}
      progressPercent={progressPercent(scenario)}
      title={title}
    />
  );
}

function OnboardingMessage({ message }: { message: string }) {
  return (
    <main className="onboarding-shell">
      <section className="onboarding-main">
        <div className="analysis-panel" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>{message}</p>
        </div>
      </section>
    </main>
  );
}
