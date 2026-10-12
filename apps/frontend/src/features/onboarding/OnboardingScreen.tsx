"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { activationTestStartAction } from "@/features/activation-test/ActivationTestPanels";
import { Icon } from "@/shared/icons/Icon";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";

import { blockForScenario, onboardingFlow } from "./blocks";
import { skipActivationTestStep } from "./blocks/activation-test";
import { effectiveTone, toneLabel } from "./blocks/ai";
import {
  onboardingError,
  stepBodyByBlock,
  stepPersistByBlock,
} from "./blocks/registry";
import {
  hoursStepDescription,
  skipImportAndGoToScratch,
} from "./blocks/schedule";
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
import { RuntimeMessage, useOnboardingRuntime } from "./OnboardingRuntime";
import { type OnboardingBack, OnboardingShell } from "./OnboardingShell";
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
    retry,
    setDraft,
  } = useOnboardingRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Só lido em whatsapp-conectar: enquanto falso, "Continuar" não compete com
  // o CTA primário do próprio painel de conexão (Goal071/WU-03).
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  // Só lido em whatsapp-conectar: o consentimento vem numa fase própria antes
  // da conexão e volta a cada vinculação expirada, falha ou desfeita.
  const [whatsappPhase, setWhatsappPhase] = useState<"connect" | "consent">(
    "consent",
  );
  const [consentReady, setConsentReady] = useState(false);
  // O link "Conectei o número errado" do rodapé abre a folha de desconexão que
  // mora no painel: o corpo conectado registra aqui como abri-la.
  const [openWrongNumber, setOpenWrongNumber] = useState<(() => void) | null>(
    null,
  );
  const registerWrongNumber = useCallback((open: (() => void) | null) => {
    setOpenWrongNumber(() => open);
  }, []);
  // Só lido em contatos-ignorados: quantas pessoas a escolha já soma, para o
  // "Continuar · N pessoas" do rodapé.
  const [ignoredCount, setIgnoredCount] = useState(0);
  // Só lido em horarios: `null` até a leitura chegar; então abre a tela
  // "Horários por dia" (quadro 2.7) quando algum dia marcado difere do
  // intervalo-base, e o horário-base (quadro 2.6) quando não.
  const [hoursDayViewOpen, setHoursDayViewOpen] = useState<boolean | null>(
    null,
  );
  const [phaseScenario, setPhaseScenario] = useState(scenario);
  // A tela é a mesma entre etapas: ao trocar de etapa, a fase recomeça.
  if (phaseScenario !== scenario) {
    setPhaseScenario(scenario);
    setWhatsappPhase("consent");
    setConsentReady(false);
    setHoursDayViewOpen(null);
  }
  if (
    scenario === "horarios" &&
    hoursDayViewOpen === null &&
    !loading &&
    !loadError
  ) {
    setHoursDayViewOpen(draft.days.some((day) => draft.dayHours[day]));
  }
  const inHoursDayView = scenario === "horarios" && hoursDayViewOpen === true;
  // Só lido em demonstracao-da-ia: "Continuar" aparece quando o último item da
  // conversa entra (ou de imediato, sem serviço e horário para simular).
  const [demoDone, setDemoDone] = useState(false);
  const [eyebrow, staticTitle, staticDescription] =
    onboardingScenarios[scenario];
  const inConsentPhase =
    scenario === "whatsapp-conectar" &&
    !whatsappConnected &&
    whatsappPhase === "consent";
  // Número conectado (quadro 4.4): título e texto próprios da pergunta de
  // confirmação; a vinculação em curso mantém os de scenarios.ts.
  const inConnectedPhase =
    scenario === "whatsapp-conectar" && whatsappConnected;
  const title = inConsentPhase
    ? "Antes de conectar"
    : inConnectedPhase
      ? "WhatsApp conectado"
      : inHoursDayView
        ? "Horários por dia"
        : staticTitle;
  const description = inConsentPhase
    ? ""
    : inConnectedPhase
      ? "É este o número que seus clientes usam para falar com você?"
      : inHoursDayView
        ? "Toque em um horário para ajustar só aquele dia."
        : scenario === "horarios"
          ? hoursStepDescription(draft.days)
          : staticDescription;
  // "importacao" só existe para quem escolheu importar: aberta por URL direta
  // sem a fonte gravada, volta para "sistema-atual" sem tocar na importação.
  const importWithoutSource =
    scenario === "importacao" &&
    !loading &&
    !loadError &&
    draft.calendarSource === null;

  useEffect(() => {
    if (importWithoutSource) router.replace("/onboarding/sistema-atual");
    // O objeto do router pode mudar a cada render; a decisão depende só disto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importWithoutSource]);

  if (loading || importWithoutSource)
    return <RuntimeMessage message="Carregando sua configuração..." />;
  if (loadError) {
    return <RuntimeMessage message={loadError} onRetry={retry} />;
  }

  const blockId = blockForScenario(scenario);
  const isWelcomeStep = scenario === "boas-vindas";
  const isSistemaAtual = scenario === "sistema-atual";
  const isQuandoImportar = scenario === "quando-importar";
  const isServicoNome = scenario === "servico-nome";
  const isAiDemo = scenario === "demonstracao-da-ia";
  const isToneStep = scenario === "tom-da-ia";
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

  const showsBack = !(
    isActivationTestProgress ||
    isActivationTestPaused ||
    isActivationTestFailed ||
    isActivationTestSucceeded ||
    isWhatsappConclusion
  );
  // Conectado, o espaço do chevron fica vazio, como no quadro 4.4. Na tela
  // "Horários por dia" o chevron volta ao horário-base, na mesma etapa, e
  // devolve os dias ao intervalo-base (o que se grava é o que está na tela).
  const back: OnboardingBack | undefined = isWelcomeStep
    ? { disabled: true }
    : inHoursDayView
      ? {
          onClick: () => {
            setDraft((current) => ({ ...current, dayHours: {} }));
            setHoursDayViewOpen(false);
          },
        }
      : showsBack && previous && !inConnectedPhase
        ? { href: `/onboarding/${previous}` }
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
    if (inConsentPhase) {
      if (consentReady) setWhatsappPhase("connect");
      return;
    }
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
    <>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Abrindo..." : "Começar"}
      </button>
      <p className="onboarding-actions-note">
        Seu progresso fica salvo a cada etapa.
      </p>
    </>
  ) : isAiDemo &&
    !demoDone ? null : isSistemaAtual ? // Os dois cards do corpo já são a ação (QA O-19, O-22): não há
  // "Continuar" aqui; a volta é o chevron do topo.
  null : isQuandoImportar ? (
    // Principal primeiro, como no protótipo (quadro 2.2), no DOM e na tela.
    <>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Salvando..." : "Importar agora"}
      </button>
      <button
        className="btn btn-secondary"
        disabled={busy}
        type="button"
        onClick={() => void chooseWithoutImportNow()}
      >
        {busy ? "Salvando..." : "Fazer depois"}
      </button>
      <p className="onboarding-actions-note">
        Se fizer depois, a importação fica em Mais › Importação.
      </p>
    </>
  ) : isActivationTestSucceeded ? (
    // Sucesso: só o CTA do vault. Não há "voltar" para um teste que terminou.
    // O texto de scenarios.ts não aparece: a moldura de conclusão o troca pelo
    // texto honesto do status (4.9).
    <button className="btn btn-primary" disabled={busy} type="submit">
      {busy ? "Abrindo..." : "Ir para o início"}
    </button>
  ) : isActivationTestProgress ? (
    // Quadro 4.7: em andamento não há nada a submeter. A execução é do
    // servidor, sair desta tela não a cancela, e a tela vai sozinha para a do
    // estado quando ela termina — por isso não há "Continuar". "Continuar
    // depois" fica discreto abaixo da nota, como o "Fazer isso depois" da 4.6.
    <>
      <a
        className="btn btn-secondary"
        href="whatsapp://send"
        rel="noopener noreferrer"
        target="_blank"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
          width="18"
        >
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.2c-.4.3-.8 0-.8-.5z" />
        </svg>
        Abrir WhatsApp
      </a>
      <p className="onboarding-actions-note">
        Pode sair do app: o teste continua e a tela se atualiza sozinha.
      </p>
      <button
        className="btn onboarding-actions-skip"
        disabled={busy}
        type="button"
        onClick={() => void skipActivationTest()}
      >
        {busy ? "Salvando..." : "Continuar depois"}
      </button>
    </>
  ) : isActivationTestPaused ? (
    <button className="btn btn-primary" disabled={busy} type="submit">
      {busy
        ? activationTestStartAction.paused.busy
        : activationTestStartAction.paused.label}
    </button>
  ) : isActivationTestFailed ? (
    // Quadro 4.8: principal primeiro, no DOM e na tela. "Fazer isso depois"
    // fica no lugar do "Revisar horários" do quadro.
    <>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy
          ? activationTestStartAction.failed.busy
          : activationTestStartAction.failed.label}
      </button>
      <button
        className="btn btn-secondary"
        disabled={busy}
        type="button"
        onClick={() => void skipActivationTest()}
      >
        {busy ? "Salvando..." : "Fazer isso depois"}
      </button>
    </>
  ) : isActivationTestIntro ? (
    // Quadro 4.6: um único CTA primário em largura total. "Fazer isso depois"
    // continua existindo (conclui sem testar), discreto no lugar da nota.
    <>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy
          ? activationTestStartAction.intro.busy
          : activationTestStartAction.intro.label}
      </button>
      <button
        className="btn onboarding-actions-skip"
        disabled={busy}
        type="button"
        onClick={() => void skipActivationTest()}
      >
        {busy ? "Salvando..." : "Fazer isso depois"}
      </button>
    </>
  ) : isWhatsappConclusion ? (
    // Principal primeiro, como no quadro 4.10, no DOM e na tela.
    <>
      <button
        className="btn btn-primary"
        disabled={busy}
        type="button"
        onClick={() => void finishWithoutWhatsapp()}
      >
        {busy ? "Abrindo..." : "Ir para o início"}
      </button>
      <Link className="btn btn-secondary" href="/onboarding/whatsapp">
        Conectar agora
      </Link>
    </>
  ) : inConsentPhase ? (
    <button className="btn btn-primary" disabled={!consentReady} type="submit">
      Continuar
    </button>
  ) : inConnectedPhase ? (
    // Quadro 4.4: "Sim, continuar" em largura total e, embaixo, o link de
    // número errado. A folha de desconexão é a de hoje e pede confirmação.
    <>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Salvando..." : "Sim, continuar"}
      </button>
      <button
        className="whatsapp-wrong-number"
        disabled={busy}
        type="button"
        onClick={() => openWrongNumber?.()}
      >
        Conectei o número errado
      </button>
    </>
  ) : isWhatsappConnect ? (
    <>
      <button
        className={`btn ${whatsappConnected ? "btn-primary" : "btn-secondary"}`}
        disabled={busy}
        type="submit"
      >
        {busy ? "Salvando..." : "Continuar"}
      </button>
      {/* O aviso fica ao lado do "Continuar", no rodapé, e não no fim do
          conteúdo: no celular a etapa cabe sem rolagem (validação de
          2026-10-11). */}
      {error && (
        <div className="onboarding-actions-alert" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}
    </>
  ) : isWhatsappIntro ? (
    // Principal primeiro, como no protótipo (tela 4.1), no DOM e na tela: no
    // celular os botões ficam empilhados em largura total nesta ordem (QA O-41).
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
    </>
  ) : isIgnoredContactsStep ? (
    // Quadro 4.5: "Continuar" soma a escolha e vem primeiro, no DOM e na tela;
    // "Pular por agora" é o link de baixo.
    <>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy
          ? "Salvando..."
          : ignoredCount === 0
            ? "Continuar"
            : `Continuar · ${ignoredCount} ${ignoredCount === 1 ? "pessoa" : "pessoas"}`}
      </button>
      <button
        className="onboarding-link-action"
        disabled={busy}
        type="button"
        onClick={() => void skipIgnoredContacts()}
      >
        {busy ? "Salvando..." : "Pular por agora"}
      </button>
    </>
  ) : (
    <>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy
          ? "Salvando..."
          : isToneStep
            ? `Continuar com ${toneLabel(effectiveTone(draft))}`
            : isServicoNome
              ? "Salvar serviço"
              : inHoursDayView
                ? "Salvar horários"
                : "Continuar"}
      </button>
    </>
  );

  return (
    <OnboardingShell
      actions={actions}
      actionsStacked={
        isWhatsappIntro ||
        isActivationTestIntro ||
        isActivationTestProgress ||
        isActivationTestFailed ||
        isWhatsappConclusion ||
        isIgnoredContactsStep ||
        inConnectedPhase
      }
      back={back}
      body={
        isSistemaAtual ? (
          <div className="choice-grid">
            <ActionCard
              accent
              copy="Trazemos seus serviços, clientes e agendamentos para a Avenly."
              disabled={busy}
              icon={<Icon name="import" />}
              title="Sim, quero importar"
              onClick={() => go("quando-importar")}
            />
            <ActionCard
              copy="Você cadastra seus serviços e horários em poucos passos."
              disabled={busy}
              icon={<Icon name="plus" />}
              title="Não, começar do zero"
              onClick={() => void chooseWithoutImportNow()}
            />
          </div>
        ) : (
          stepBodyByBlock[blockId](
            scenario,
            draft,
            setDraft,
            setWhatsappConnected,
            setDemoDone,
            {
              onConsentReadyChange: setConsentReady,
              onConsentRequired: () => {
                setConsentReady(false);
                setWhatsappPhase("consent");
              },
              onWrongNumberChange: registerWrongNumber,
              phase: whatsappPhase,
            },
            setIgnoredCount,
            {
              onOpenChange: setHoursDayViewOpen,
              open: inHoursDayView,
            },
          )
        )
      }
      completion={isActivationTestSucceeded || isWhatsappConclusion}
      connected={inConnectedPhase}
      description={description}
      error={isWhatsappConnect && !inConnectedPhase ? null : error}
      eyebrow={eyebrow}
      onExit={() => void logout()}
      onSubmit={(event) => void submit(event)}
      scenario={scenario}
      title={title}
    />
  );
}
