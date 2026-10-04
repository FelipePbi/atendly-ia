import { useEffect, useRef, useState } from "react";

import {
  type ActivationTestMilestoneName,
  type ActivationTestRun,
  type AiStateValue,
  BffHttpError,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import {
  aiStatusView,
  type StatusFetchPhase,
  type StatusView,
} from "@/shared/runtime/systemStatus";

/**
 * Módulo compartilhado do teste real (Goal019 §9), usado pelo onboarding e
 * por Configurações › IA (Goal063 §3). Marcos, telas (introdução, progresso,
 * pausa por interferência, falha e sucesso), textos, ações e leituras do
 * servidor moram só aqui: nenhum dos dois consumidores copia enum, copy ou
 * regra de estado por conta própria. Cada consumidor só decide o que vem em
 * volta — etapa do onboarding ou seção de Configurações.
 */

/** As cinco telas do teste. Um estado da execução, uma tela. */
export type ActivationTestPanel =
  | "intro"
  | "progress"
  | "paused"
  | "failed"
  | "succeeded";

/** Tela para a qual cada estado da execução leva. */
export function activationTestPanelFor(
  run: ActivationTestRun,
): ActivationTestPanel {
  if (run.state === "SUCCEEDED") return "succeeded";
  if (run.state === "PAUSED_BY_HUMAN") return "paused";
  if (run.state === "FAILED") return "failed";
  // `DISCARDED` é a pausada que a pessoa mandou reiniciar: ela volta ao começo.
  if (run.state === "DISCARDED") return "intro";
  return "progress";
}

/**
 * A execução ainda prova o teste para o WhatsApp de hoje?
 *
 * É a leitura, na tela, da mesma regra que o BFF aplica para ligar a IA e
 * para o quarto item do checklist (`activationTestCompleted`): `SUCCEEDED` e
 * não superada por troca de canal. A tela só a usa para escolher o que
 * oferecer; quem decide é o BFF, que recusa ligar sem prova.
 */
export function isValidActivationProof(
  run: ActivationTestRun | null | undefined,
): boolean {
  return run?.state === "SUCCEEDED" && !run.supersededByChannelChange;
}

/**
 * Os seis marcos do vault, na ordem do vault, com a copy do vault
 * (`docs/product-vault/02-Fluxos/02-Ativacao-e-Teste-do-WhatsApp.md`
 * §"Tela durante teste"). Lista fechada: marco que não está aqui não existe,
 * e nenhum item é derivado de tempo decorrido.
 */
export const MILESTONE_LABELS: Record<ActivationTestMilestoneName, string> = {
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
 * perguntas diferentes, com ritmos diferentes. Esta leitura para sozinha em
 * estado terminal — não fica consultando para sempre.
 */
const PROGRESS_POLL_MS = 3_000;

export function LoadingNote() {
  return (
    <p className="field-help" aria-live="polite">
      Lendo o andamento do teste...
    </p>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="onboarding-note is-important" role="alert">
      <Icon name="alert" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Leitura da execução corrente, com parada em estado terminal.
 *
 * Três coisas que esta função **não** faz, e cada uma delas é um jeito de a
 * tela mentir: não guarda progresso local entre leituras, não avança marco
 * por tempo decorrido e não continua consultando depois que a execução
 * termina.
 */
export function useActivationTestRun(poll: boolean) {
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

/**
 * Confirmação real de ativação da IA, lida de `GET /v1/status` — a mesma
 * rota do poller do shell, aqui pedida uma vez. Nunca assume "ativa" antes
 * da resposta: falha ou resposta pendente ficam nos estados honestos que
 * `aiStatusView` já define para o resto do produto.
 */
export function useAiActiveStatus(): { view: StatusView } {
  const [phase, setPhase] = useState<StatusFetchPhase>("loading");
  const [state, setState] = useState<AiStateValue | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load() {
      try {
        const result = await getProductServices().status.get(
          controller.signal,
        );
        if (!active) return;
        setState(result.ai.state);
        setPhase("loaded");
      } catch {
        if (active) setPhase("error");
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return { view: aiStatusView(phase, state) };
}

/** Copy honesta por estado: nunca afirma "ativa" fora do caso confirmado. */
export function aiActiveCopy(view: StatusView): {
  icon: "alert" | "check" | "clock";
  text: string;
} {
  if (view === "active") {
    return {
      icon: "check",
      text: "Sua IA está ativa e pronta para atender seus clientes.",
    };
  }
  if (view === "pending") {
    return {
      icon: "clock",
      text: "Sua IA está sendo ativada. Isso pode levar alguns instantes.",
    };
  }
  if (view === "loading") {
    return { icon: "clock", text: "Confirmando se sua IA já está ativa..." };
  }
  if (view === "off") {
    return { icon: "alert", text: "Sua IA ainda não foi ativada." };
  }
  return {
    icon: "alert",
    text: "Não foi possível confirmar se sua IA já está ativa.",
  };
}

/**
 * Os seis marcos, um a um, lidos do servidor.
 *
 * Cada item só aparece concluído quando o marco veio `reached: true` da
 * leitura — e o servidor só devolve isso quando há fato gravado atrás dele.
 */
export function ActivationTestMilestoneList({ run }: { run: ActivationTestRun }) {
  return (
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
  );
}

/**
 * O que a limpeza deixou (Goal019 §6: "a tela diz o que ficou").
 *
 * Três estados distintos, nunca confundidos: `CLEAN` é o único em que a
 * tela pode afirmar que os dados de teste saíram; `RESIDUAL` nomeia o que
 * ficou, item a item, com a explicação que veio pronta do servidor;
 * `PENDING` é "ainda não limpou", e nele a tela não afirma nada.
 */
export function ActivationTestCleanupNote({
  run,
}: {
  run: ActivationTestRun | null;
}) {
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

/**
 * Número do WhatsApp do negócio, lido da conexão real.
 *
 * O teste precisa dele para saber para onde a Avenly conversa. Sem conexão
 * conectada não há teste: a recusa é dita antes de qualquer chamada, e não
 * vira progresso simulado.
 */
export async function connectedPhone(): Promise<string | null> {
  const connection = await getProductServices().whatsapp.get();
  if (connection?.status !== "CONNECTED") return null;
  return connection.phoneNumber ?? null;
}

/**
 * A ação que (re)começa o teste em cada tela que a oferece, com o mesmo nome
 * e o mesmo efeito em todo consumidor: pausada por interferência recomeça
 * (`restart`, a pausada é descartada), as outras iniciam uma execução nova.
 */
export const activationTestStartAction = {
  intro: { busy: "Iniciando...", label: "Iniciar teste", mode: "start" },
  paused: { busy: "Reiniciando...", label: "Reiniciar teste", mode: "restart" },
  failed: { busy: "Iniciando...", label: "Tentar novamente", mode: "start" },
} as const satisfies Partial<
  Record<
    ActivationTestPanel,
    { busy: string; label: string; mode: "start" | "restart" }
  >
>;

const CONNECT_WHATSAPP_FIRST =
  "Conecte seu WhatsApp antes de testar: o teste conversa com o número do seu negócio.";

/**
 * Recusas nomeadas do contrato (`PUBLIC_API_V1.md`, recusas do teste real),
 * uma frase para cada. O onboarding e Configurações › IA mostram exatamente
 * estas frases, porque só passam por `startActivationTest`. Nenhuma convida a
 * tentar de novo quando tentar de novo não resolve.
 */
const ACTIVATION_TEST_REFUSALS: Record<string, string> = {
  PLATFORM_NUMBER_NOT_CONFIGURED:
    "O teste real não está disponível neste ambiente. Sua IA só pode ser ativada depois dele.",
  ACTIVATION_TEST_AI_ALREADY_ACTIVE:
    "Sua IA já está ativa, então não há teste a fazer. Para testar de novo, desligue a IA antes.",
  ACTIVATION_TEST_WHATSAPP_NOT_CONNECTED:
    "Seu WhatsApp não está conectado. Conecte o número do seu negócio antes de testar.",
  ACTIVATION_TEST_TENANT_PHONE_UNKNOWN:
    "Não reconhecemos o número de WhatsApp do seu negócio. Confira a conexão do WhatsApp e teste de novo.",
  ACTIVATION_TEST_NO_ELIGIBLE_SERVICE:
    "O teste precisa de ao menos um serviço ativo que aceite agendamento. Cadastre ou ative um serviço antes de testar.",
  ACTIVATION_TEST_NO_AVAILABILITY:
    "Sua agenda não tem nenhum horário livre para o serviço do teste. Ajuste seus dias e horários de atendimento antes de testar.",
  ACTIVATION_TEST_ALREADY_RUNNING:
    "Já existe um teste em andamento para o seu negócio. Aguarde o fim dele ou, se estiver pausado, reinicie o teste.",
};

/** A recusa nomeada que este erro carrega, ou `null` para qualquer outro erro. */
function activationTestRefusal(error: unknown): string | null {
  if (!(error instanceof BffHttpError)) return null;
  const details = error.details;
  const upstream =
    details && typeof details === "object"
      ? (details as { upstreamCode?: unknown }).upstreamCode
      : undefined;
  const code = typeof upstream === "string" ? upstream : error.code;
  return Object.hasOwn(ACTIVATION_TEST_REFUSALS, code)
    ? ACTIVATION_TEST_REFUSALS[code]
    : null;
}

/**
 * Inicia o teste (`start`) ou recomeça depois de interferência humana
 * (`restart`). Devolve a recusa, ou `null` quando o servidor aceitou a
 * execução — que segue sozinha a partir daí. A recusa vem dita antes de
 * qualquer chamada (WhatsApp desconectado) ou traduzida de uma das sete
 * recusas nomeadas do contrato. Qualquer outro erro sobe para quem chamou.
 */
export async function startActivationTest(
  mode: "start" | "restart",
): Promise<string | null> {
  const phone = await connectedPhone();
  if (!phone) return CONNECT_WHATSAPP_FIRST;
  const service = getProductServices().activationTest;
  try {
    if (mode === "restart") await service.restart(phone);
    else await service.start(phone);
  } catch (error) {
    const refusal = activationTestRefusal(error);
    if (refusal) return refusal;
    throw error;
  }
  return null;
}

/**
 * Depois do progresso: ler o estado real e ir para a tela dele. Nenhuma tela
 * decide o resultado por conta própria, e nenhuma avança antes do fim.
 */
export async function readFinishedActivationTest(): Promise<
  { panel: ActivationTestPanel } | { error: string }
> {
  const run = await getProductServices().activationTest.get();
  if (!run) {
    return { error: "Nenhum teste em andamento. Inicie o teste para continuar." };
  }
  if (!run.terminal) {
    return { error: "O teste ainda está em andamento. Aguarde o fim." };
  }
  return { panel: activationTestPanelFor(run) };
}

/**
 * Antes do teste: a explicação do vault e o que o teste vai fazer.
 *
 * Não lê execução nenhuma — não há o que ler antes de começar —, e por isso
 * também não afirma nada sobre envio, agendamento ou ativação.
 */
export function ActivationTestIntro() {
  return (
    <ul className="onboarding-points">
      <li>
        <Icon name="check" />
        <span>
          A conversa começa com um aviso separado: “Esta é uma conversa de teste
          da Avenly.”
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
 * Introdução do onboarding (quadro 4.6): a prévia da conversa e três itens.
 *
 * O aviso é o texto que o orquestrador envia (`ACTIVATION_TEST_NOTICE`). A
 * pergunta não nomeia serviço: o sistema só o escolhe quando a execução
 * começa, e a tela não pode afirmar o que ainda não sabe.
 */
export function ActivationTestOnboardingIntro() {
  return (
    <div className="activation-test-intro">
      <div className="activation-test-preview">
        <div className="activation-test-preview-head">
          <span>Avenly · Teste</span>
          <span>agora</span>
        </div>
        <p className="activation-test-bubble">
          Esta é uma conversa de teste da Avenly. Você só precisa observar: a
          IA vai conversar sozinha com um cliente simulado e marcar um
          atendimento de teste, que é removido no final.
        </p>
        <p className="activation-test-bubble">Oi! Quanto custa o atendimento?</p>
      </div>
      <ul className="activation-test-checks">
        <li>
          <Icon name="check" />
          <span>A conversa chega identificada como teste</span>
        </li>
        <li>
          <Icon name="check" />
          <span>
            A IA informa preço, consulta a agenda e confirma um horário de
            verdade
          </span>
        </li>
        <li>
          <Icon name="check" />
          <span>
            No fim, o agendamento e o cliente de teste são apagados, e sua IA é
            ativada
          </span>
        </li>
      </ul>
    </div>
  );
}

/**
 * Progresso: os seis marcos, um a um, lidos do servidor.
 */
export function ActivationTestProgress() {
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
      <ActivationTestMilestoneList run={run} />
      <p className="field-help">
        O teste continua no servidor: você pode fechar esta tela ou trocar de
        aplicativo sem interromper nada.
      </p>
    </div>
  );
}

/** Interferência humana: a explicação do vault, sem culpar ninguém. */
export function ActivationTestPaused() {
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
          Ao reiniciar, a Avenly começa uma conversa de teste nova.
        </p>
      )}
    </div>
  );
}

/**
 * Falha: o passo que quebrou, **nomeado pelo servidor**.
 *
 * A tela não traduz enum por conta própria e não inventa etapa:
 * `failedStepLabel` já vem em linguagem do negócio. Sem ele, a tela diz que
 * não sabe — que é melhor do que adivinhar.
 */
export function ActivationTestFailed() {
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
          A Avenly tentou {run.attempts} de {run.maxAttempts} vezes antes de
          parar.
        </p>
      )}
      <ActivationTestCleanupNote run={run} />
    </div>
  );
}

/**
 * Sucesso: o que o teste fez, mais o que a limpeza deixou, se deixou.
 *
 * "Sua IA está ativa" só aparece quando `GET /v1/status` confirma o estado
 * `ACTIVE` — o sucesso do teste não é, por si só, prova de ativação.
 */
export function ActivationTestSucceeded() {
  const { error, run } = useActivationTestRun(false);
  const { view } = useAiActiveStatus();

  if (error) return <ErrorNote message={error} />;
  if (run === undefined) return <LoadingNote />;

  const { icon, text } = aiActiveCopy(view);

  return (
    <div className="onboarding-form">
      <ul className="onboarding-points">
        <li>
          <Icon name="check" />
          <span>Sua IA conversou com o cliente de teste e marcou o horário.</span>
        </li>
        <li>
          <Icon name={icon} />
          <span>{text}</span>
        </li>
      </ul>
      <ActivationTestCleanupNote run={run} />
    </div>
  );
}

/** Corpo de cada tela do teste, o mesmo para todo consumidor. */
export function ActivationTestPanelBody({
  panel,
  onboarding = false,
}: {
  panel: ActivationTestPanel;
  onboarding?: boolean;
}) {
  if (panel === "progress") return <ActivationTestProgress />;
  if (panel === "paused") return <ActivationTestPaused />;
  if (panel === "failed") return <ActivationTestFailed />;
  if (panel === "succeeded") return <ActivationTestSucceeded />;
  return onboarding ? <ActivationTestOnboardingIntro /> : <ActivationTestIntro />;
}
