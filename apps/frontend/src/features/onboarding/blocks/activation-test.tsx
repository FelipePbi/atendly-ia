import { useEffect, useRef, useState } from "react";

import type {
  ActivationTestMilestoneName,
  ActivationTestRun,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import type { OnboardingScenario } from "../scenarios";
import type { OnboardingStepContext } from "./shared";

/**
 * Os seis marcos do vault, na ordem do vault, com a copy do vault
 * (`docs/product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md`
 * §"Tela durante teste"). Lista fechada: marco que não está aqui não existe,
 * e nenhum item é derivado de tempo decorrido.
 */
const MILESTONE_LABELS: Record<ActivationTestMilestoneName, string> = {
  MESSAGE_SENT: "Mensagem enviada",
  SERVICE_IDENTIFIED: "Serviço identificado",
  PRICE_INFORMED: "Preço informado",
  AVAILABILITY_CHECKED: "Agenda consultada",
  SLOT_SELECTED: "Horário selecionado",
  APPOINTMENT_CONFIRMED: "Agendamento confirmado",
};

/**
 * Intervalo da leitura de progresso, própria desta tela.
 *
 * Ela é separada do poller de `GET /v1/status` de propósito: são duas
 * perguntas diferentes, com ritmos diferentes, e a árvore continua com **um**
 * poller de status. Esta leitura para sozinha em estado terminal — não fica
 * consultando para sempre.
 */
const PROGRESS_POLL_MS = 3_000;

/** Tela para a qual cada estado da execução leva. Um estado, uma tela. */
export function activationTestScenarioFor(
  run: ActivationTestRun,
): OnboardingScenario {
  if (run.state === "SUCCEEDED") return "teste-real-sucesso";
  if (run.state === "PAUSED_BY_HUMAN") return "teste-real-interferencia";
  if (run.state === "FAILED") return "teste-real-falha";
  // `DISCARDED` é a pausada que a pessoa mandou reiniciar: ela volta ao começo.
  if (run.state === "DISCARDED") return "teste-real";
  return "teste-real-progresso";
}

/**
 * Leitura da execução corrente, com parada em estado terminal.
 *
 * Três coisas que esta função **não** faz, e cada uma delas é um jeito de a
 * tela mentir: não guarda progresso local entre leituras, não avança marco por
 * tempo decorrido e não continua consultando depois que a execução termina.
 */
function useActivationTestRun(poll: boolean) {
  const [run, setRun] = useState<ActivationTestRun | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function read() {
      try {
        const next = await getProductServices().activationTest.get(
          controller.signal,
        );
        if (!active) return;
        setRun(next);
        setError(null);
        // Terminou: a leitura para aqui. Não há retomada silenciosa.
        if (!poll || next?.terminal !== false) return;
        timer.current = setTimeout(() => void read(), PROGRESS_POLL_MS);
      } catch {
        if (!active) return;
        setError("Não foi possível ler o andamento do teste.");
      }
    }

    void read();
    return () => {
      active = false;
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  return { error, run };
}

function LoadingNote() {
  return (
    <p className="field-help" aria-live="polite">
      Lendo o andamento do teste...
    </p>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="onboarding-note is-important" role="alert">
      <Icon name="alert" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Antes do teste: a explicação do vault e o que o teste vai fazer.
 *
 * Não lê execução nenhuma — não há o que ler antes de começar —, e por isso
 * também não afirma nada sobre envio, agendamento ou ativação.
 */
function ActivationTestIntro() {
  return (
    <ul className="onboarding-points">
      <li>
        <Icon name="check" />
        <span>
          A conversa começa com um aviso separado: “Esta é uma conversa de teste
          da Atendly.”
        </span>
      </li>
      <li>
        <Icon name="check" />
        <span>
          Um cliente simulado pergunta o preço de um serviço e pede um horário.
        </span>
      </li>
      <li>
        <Icon name="check" />
        <span>
          A IA responde sozinha, consulta sua agenda e marca um atendimento de
          teste de verdade.
        </span>
      </li>
      <li>
        <Icon name="check" />
        <span>
          No fim, o agendamento e o cliente de teste são removidos, e sua IA é
          ativada.
        </span>
      </li>
    </ul>
  );
}

/**
 * Progresso: os seis marcos, um a um, lidos do servidor.
 *
 * Cada item só aparece concluído quando o marco veio `reached: true` da
 * leitura — e o servidor só devolve isso quando há fato gravado atrás dele.
 * Não existe aqui nenhum caminho que marque um item por tempo, por animação ou
 * porque "a essa altura já deve ter acontecido".
 */
function ActivationTestProgress() {
  const { error, run } = useActivationTestRun(true);

  if (error) return <ErrorNote message={error} />;
  if (run === undefined) return <LoadingNote />;
  if (run === null) {
    return (
      <ErrorNote message="Nenhum teste em andamento. Volte e inicie o teste." />
    );
  }

  return (
    <div className="onboarding-form">
      <ul className="onboarding-points" aria-live="polite">
        {run.milestones.map((milestone) => (
          <li key={milestone.milestone}>
            <Icon name={milestone.reached ? "check" : "clock"} />
            <span>
              {MILESTONE_LABELS[milestone.milestone]}
              {milestone.reached ? "" : " — aguardando"}
            </span>
          </li>
        ))}
      </ul>
      <p className="field-help">
        O teste continua no servidor: você pode fechar esta tela ou trocar de
        aplicativo sem interromper nada.
      </p>
    </div>
  );
}

/** Interferência humana: a explicação do vault, sem culpar ninguém. */
function ActivationTestPaused() {
  const { error, run } = useActivationTestRun(false);

  if (error) return <ErrorNote message={error} />;
  if (run === undefined) return <LoadingNote />;

  return (
    <div className="onboarding-form">
      <div className="onboarding-note">
        <Icon name="info" />
        <span>
          Você respondeu manualmente à conversa de teste, então o teste parou.
          Nesta conversa você só precisa observar: quem responde é a IA.
        </span>
      </div>
      {run?.state === "PAUSED_BY_HUMAN" && (
        <p className="field-help">
          Ao reiniciar, a Atendly começa uma conversa de teste nova.
        </p>
      )}
    </div>
  );
}

/**
 * Falha: o passo que quebrou, **nomeado pelo servidor**.
 *
 * A tela não traduz enum por conta própria e não inventa etapa: `failedStepLabel`
 * já vem em linguagem do negócio. Sem ele, a tela diz que não sabe — que é
 * melhor do que adivinhar.
 */
function ActivationTestFailed() {
  const { error, run } = useActivationTestRun(false);

  if (error) return <ErrorNote message={error} />;
  if (run === undefined) return <LoadingNote />;

  return (
    <div className="onboarding-form">
      <div className="onboarding-note is-important" role="alert">
        <Icon name="alert" />
        <span>
          {run?.failedStepLabel
            ? `O teste parou em: ${run.failedStepLabel}.`
            : "O teste parou antes de terminar."}
        </span>
      </div>
      <p className="field-help">
        Sua IA continua desligada. Nenhum teste que não termina bem ativa o
        atendimento automático.
      </p>
      {run && run.attempts > 1 && (
        <p className="field-help">
          A Atendly tentou {run.attempts} de {run.maxAttempts} vezes antes de
          parar.
        </p>
      )}
      <CleanupNote run={run} />
    </div>
  );
}

/** Sucesso: "Tudo pronto!", mais o que a limpeza deixou, se deixou. */
function ActivationTestSucceeded() {
  const { error, run } = useActivationTestRun(false);

  if (error) return <ErrorNote message={error} />;
  if (run === undefined) return <LoadingNote />;

  return (
    <div className="onboarding-form">
      <ul className="onboarding-points">
        <li>
          <Icon name="check" />
          <span>Sua IA conversou com o cliente de teste e marcou o horário.</span>
        </li>
        <li>
          <Icon name="check" />
          <span>Sua IA está ativa e pronta para atender seus clientes.</span>
        </li>
      </ul>
      <CleanupNote run={run} />
    </div>
  );
}

/**
 * O que a limpeza deixou (§6 do Goal: "a tela diz o que ficou").
 *
 * Três estados distintos, nunca confundidos: `CLEAN` é o único em que a tela
 * pode afirmar que os dados de teste saíram; `RESIDUAL` nomeia o que ficou,
 * item a item, com a explicação que veio pronta do servidor; `PENDING` é
 * "ainda não limpou", e nele a tela não afirma nada — não é "limpou e deu
 * certo".
 */
function CleanupNote({ run }: { run: ActivationTestRun | null }) {
  if (!run || run.cleanupState === "PENDING") return null;
  if (run.cleanupState === "CLEAN") {
    return (
      <div className="onboarding-note">
        <Icon name="check" />
        <span>
          O agendamento e o cliente de teste foram removidos do seu negócio.
        </span>
      </div>
    );
  }
  return (
    <div className="onboarding-note is-important">
      <Icon name="info" />
      <div>
        <span>Nem tudo o que o teste criou pôde ser removido:</span>
        <ul className="onboarding-points">
          {run.cleanupResidue.map((item) => (
            <li key={`${item.target}-${item.id}`}>
              <Icon name="alert" />
              <span>
                {item.label}: {item.explanation}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function activationTestStepBody(scenario: OnboardingScenario) {
  if (scenario === "teste-real-progresso") return <ActivationTestProgress />;
  if (scenario === "teste-real-interferencia") return <ActivationTestPaused />;
  if (scenario === "teste-real-falha") return <ActivationTestFailed />;
  if (scenario === "teste-real-sucesso") return <ActivationTestSucceeded />;
  return <ActivationTestIntro />;
}

/**
 * Número do WhatsApp do negócio, lido da conexão real.
 *
 * O teste precisa dele para saber para onde a Atendly conversa. Sem conexão
 * conectada não há teste: a recusa é dita aqui, antes de qualquer chamada, e
 * não vira progresso simulado.
 */
async function connectedPhone(): Promise<string | null> {
  const connection = await getProductServices().whatsapp.get();
  if (connection?.status !== "CONNECTED") return null;
  return connection.phoneNumber ?? null;
}

/**
 * Avançar em cada tela do teste.
 *
 * `teste-real` inicia a execução; as outras leem o estado corrente e vão para
 * a tela dele. Nenhuma delas decide o estado por conta própria.
 */
export async function persistActivationTestStep(
  scenario: OnboardingScenario,
  ctx: OnboardingStepContext,
): Promise<void> {
  const services = getProductServices();

  if (scenario === "teste-real") {
    const phone = await connectedPhone();
    if (!phone) {
      ctx.setError(
        "Conecte seu WhatsApp antes de testar: o teste conversa com o número do seu negócio.",
      );
      return;
    }
    await services.activationTest.start(phone);
    ctx.go("teste-real-progresso");
    return;
  }

  if (scenario === "teste-real-interferencia") {
    const phone = await connectedPhone();
    if (!phone) {
      ctx.setError(
        "Conecte seu WhatsApp antes de testar: o teste conversa com o número do seu negócio.",
      );
      return;
    }
    await services.activationTest.restart(phone);
    ctx.go("teste-real-progresso");
    return;
  }

  if (scenario === "teste-real-falha") {
    const phone = await connectedPhone();
    if (!phone) {
      ctx.setError(
        "Conecte seu WhatsApp antes de testar: o teste conversa com o número do seu negócio.",
      );
      return;
    }
    await services.activationTest.start(phone);
    ctx.go("teste-real-progresso");
    return;
  }

  if (scenario === "teste-real-sucesso") {
    await ctx.refreshSession();
    ctx.router.replace("/inicio");
    return;
  }

  // `teste-real-progresso`: avançar é ler o estado real e ir para a tela dele.
  const run = await services.activationTest.get();
  if (!run) {
    ctx.setError("Nenhum teste em andamento. Inicie o teste para continuar.");
    return;
  }
  if (!run.terminal) {
    ctx.setError("O teste ainda está em andamento. Aguarde o fim.");
    return;
  }
  ctx.go(activationTestScenarioFor(run));
}

/**
 * Pular o teste: o vault permite concluir o onboarding sem WhatsApp, e por
 * consequência sem teste. A IA **não** é ativada — quem ativa é o teste que
 * termina bem, e nenhuma tela afirma o contrário.
 */
export async function skipActivationTestStep(
  ctx: OnboardingStepContext,
): Promise<void> {
  await getProductServices().onboarding.complete();
  await ctx.refreshSession();
  ctx.router.replace("/inicio");
}
