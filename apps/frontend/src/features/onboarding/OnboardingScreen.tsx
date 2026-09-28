"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { activationTestStartAction } from "@/features/activation-test/ActivationTestPanels";
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
import { skipImportAndGoToScratch } from "./blocks/schedule";
import {
  ActionCard,
  applyInlineValidation,
  applyServerFieldErrors,
} from "./blocks/shared";
import {
  completeWithoutWhatsapp,
  skipIgnoredContactsStep,
  skipWhatsappStep,
} from "./blocks/whatsapp";
import { OnboardingImportStep } from "./OnboardingImportStep";
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
  // Só lido em whatsapp-conectar: enquanto falso, "Continuar" não compete com
  // o CTA primário do próprio painel de conexão (Goal071/WU-03).
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [eyebrow, title, description] = onboardingScenarios[scenario];

  if (loading)
    return <OnboardingMessage message="Carregando sua configuração..." />;
  if (loadError) return <OnboardingMessage message={loadError} />;

  const blockId = blockForScenario(scenario);
  const blockLabel = onboardingBlockLabels[blockId];
  const isWelcomeStep = scenario === "boas-vindas";
  const isSistemaAtual = scenario === "sistema-atual";
  const isQuandoImportar = scenario === "quando-importar";
  const isWhatsappIntro = scenario === "whatsapp";
  const isWhatsappConnect = scenario === "whatsapp-conectar";
  const isWhatsappConclusion = scenario === "whatsapp-concluido";
  const isIgnoredContactsStep = scenario === "contatos-ignorados";
  const isActivationTestIntro = scenario === "teste-real";
  const isActivationTestProgress = scenario === "teste-real-progresso";
  const isActivationTestPaused = scenario === "teste-real-interferencia";
  const isActivationTestFailed = scenario === "teste-real-falha";
  const isActivationTestSucceeded = scenario === "teste-real-sucesso";
  const index = onboardingFlow.indexOf(scenario);
  // "endereco" é condicional (só existe para Local próprio) e por isso fica
  // fora de onboardingFlow; e o passo anterior de "sistema-atual" depende da
  // mesma escolha. "quando-importar" também é condicional (só existe para
  // quem respondeu "Sim, quero importar"), e volta sempre para
  // "sistema-atual". Os três precisam de Voltar calculado pelo rascunho ou
  // pelo cenário, não pela posição fixa no array.
  const previous: OnboardingScenario | undefined =
    scenario === "endereco"
      ? "modalidade"
      : scenario === "sistema-atual"
        ? draft.businessModalities.includes("ON_SITE")
          ? "endereco"
          : "modalidade"
        : scenario === "quando-importar"
          ? "sistema-atual"
          : index > 0
            ? onboardingFlow[index - 1]
            : undefined;

  function go(step: OnboardingScenario) {
    router.push(`/onboarding/${step}`);
  }

  async function chooseWithoutImportNow() {
    setBusy(true);
    setError(null);
    try {
      await skipImportAndGoToScratch({
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!applyInlineValidation(form)) return;
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
      // Recusa de validação do servidor cai no campo da etapa; só o que não
      // corresponde a campo nenhum vai para o aviso geral.
      if (!applyServerFieldErrors(form, caught)) {
        setError(onboardingError(caught));
      }
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

  async function finishWithoutWhatsapp() {
    setBusy(true);
    setError(null);
    try {
      await completeWithoutWhatsapp({
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

  // A importação tem as próprias telas, formulários e títulos (Goal066): a
  // etapa usa só a barra superior do onboarding, sem o formulário da etapa.
  if (scenario === "importacao") {
    return <OnboardingImportStep go={go} onExit={() => void logout()} />;
  }

  const actions = isWelcomeStep ? (
    // Boas-vindas não grava nada: só avança para o primeiro campo real
    // (docs/product-vault/02-Fluxos/01-Onboarding.md §1).
    <button className="btn btn-primary" disabled={busy} type="submit">
      {busy ? "Abrindo..." : "Começar"}
    </button>
  ) : isSistemaAtual ? (
    // Os dois cards do corpo já são a ação (QA O-19, O-22): não há
    // "Continuar" aqui, só a volta.
    <>
      {previous && (
        <Link className="btn btn-secondary" href={`/onboarding/${previous}`}>
          Voltar
        </Link>
      )}
    </>
  ) : isQuandoImportar ? (
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
        onClick={() => void chooseWithoutImportNow()}
      >
        {busy ? "Salvando..." : "Fazer depois"}
      </button>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Salvando..." : "Importar agora"}
      </button>
    </>
  ) : isActivationTestSucceeded ? (
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
      {busy
        ? activationTestStartAction.paused.busy
        : activationTestStartAction.paused.label}
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
        {busy
          ? activationTestStartAction.failed.busy
          : activationTestStartAction.failed.label}
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
        {busy
          ? activationTestStartAction.intro.busy
          : activationTestStartAction.intro.label}
      </button>
    </>
  ) : isWhatsappConclusion ? (
    <>
      <Link className="btn btn-secondary" href="/onboarding/whatsapp">
        Conectar agora
      </Link>
      <button
        className="btn btn-primary"
        disabled={busy}
        type="button"
        onClick={() => void finishWithoutWhatsapp()}
      >
        {busy ? "Abrindo..." : "Ir para o início"}
      </button>
    </>
  ) : isWhatsappConnect ? (
    <>
      {previous && (
        <Link className="btn btn-secondary" href={`/onboarding/${previous}`}>
          Voltar
        </Link>
      )}
      <button
        className={`btn ${whatsappConnected ? "btn-primary" : "btn-secondary"}`}
        disabled={busy}
        type="submit"
      >
        {busy ? "Salvando..." : "Continuar"}
      </button>
    </>
  ) : isWhatsappIntro ? (
    // Principal primeiro, como no protótipo (tela 4.1): no celular os botões
    // ficam empilhados em largura total nesta ordem; a partir do tablet, a
    // linha é invertida para manter "Voltar" à esquerda (QA O-41).
    <>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Salvando..." : "Conectar meu WhatsApp"}
      </button>
      <button
        className="btn btn-secondary"
        disabled={busy}
        type="button"
        onClick={() => void skip()}
      >
        {busy ? "Salvando..." : "Fazer isso depois"}
      </button>
      {previous && (
        <Link className="btn btn-secondary" href={`/onboarding/${previous}`}>
          Voltar
        </Link>
      )}
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
      actionsStacked={isWhatsappIntro}
      blockLabel={blockLabel}
      body={
        isSistemaAtual ? (
          <div className="choice-grid">
            <ActionCard
              copy="Traga clientes, serviços e agendamentos do Minha Agenda."
              disabled={busy}
              title="Sim, quero importar"
              onClick={() => go("quando-importar")}
            />
            <ActionCard
              copy="Cadastre tudo direto na Atendly, sem importar nada."
              disabled={busy}
              title="Não, começar do zero"
              onClick={() => void chooseWithoutImportNow()}
            />
          </div>
        ) : (
          stepBodyByBlock[blockId](scenario, draft, setDraft, setWhatsappConnected)
        )
      }
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
