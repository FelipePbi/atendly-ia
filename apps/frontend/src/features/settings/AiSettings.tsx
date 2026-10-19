"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

import {
  type ActivationTestRun,
  type AiMessageDelivery,
  type AiTone,
  BffHttpError,
  type SettingsState,
} from "@/data";
import {
  type ActivationTestPanel,
  ActivationTestPanelBody,
  activationTestPanelFor,
  activationTestStartAction,
  isValidActivationProof,
  readFinishedActivationTest,
  startActivationTest,
} from "@/features/activation-test/ActivationTestPanels";
import { composeReturnParts } from "@/features/customer-return/returnMessage";
import {
  segmentExamples,
  toneExamples,
} from "@/features/onboarding/segmentExamples";
import { Icon } from "@/shared/icons/Icon";
import {
  messageBubbles,
  resolveMessageDelivery,
} from "@/shared/messages/messageParts";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { useOptionalSystemStatus } from "@/shared/runtime/systemStatus";
import { MessageBubbles } from "@/shared/ui/ChatPhone";
import { Dialog } from "@/shared/ui/Dialog";
import { Skeleton } from "@/shared/ui/States";
import { showToast } from "@/shared/ui/toastBus";

import { AiSandboxSection } from "./AiSandboxSection";
import { SettingsPage } from "./shared/SettingsPage";

/**
 * O que a tela sabe sobre o teste real e o WhatsApp, lido do servidor.
 *
 * Só é lido com a IA desligada: com ela ativa não há teste a oferecer nem
 * retomada a decidir.
 */
type ActivationRead =
  | { phase: "idle" | "loading" | "error" }
  | {
      phase: "loaded";
      run: ActivationTestRun | null;
      whatsappConnected: boolean;
    };

async function readActivation(signal?: AbortSignal): Promise<ActivationRead> {
  try {
    const services = getProductServices();
    const [run, connection] = await Promise.all([
      services.activationTest.get(signal),
      services.whatsapp.get(signal),
    ]);
    return {
      phase: "loaded",
      run,
      whatsappConnected: connection?.status === "CONNECTED",
    };
  } catch {
    return { phase: "error" };
  }
}

/**
 * Configurações › IA (Goal063 §3, U-11): sem interruptor. A tela mostra o
 * estado lido e só a ação que cabe nele — pausar a IA ativa, retomar a
 * pausada que ainda tem teste válido, ou fazer o teste real (o mesmo do
 * onboarding) quando não há teste válido. Quem decide se a IA liga é o BFF:
 * a recusa por falta de teste faz a tela reler o estado, nunca inventá-lo.
 */
export function AiSettings({
  settings,
  onSaved,
}: {
  settings: SettingsState;
  onSaved: (state: SettingsState) => void;
}) {
  // Ligada nas configurações, mas com o WhatsApp desconectado a IA não
  // atende: a tela a mostra pausada, sem "Pausar", com o caminho para
  // reconectar. Ao reconectar ela volta sozinha — a escolha gravada não muda
  // (pedido de 2026-10-16, R11-302).
  const status = useOptionalSystemStatus();
  const whatsappDown = status?.whatsappView === "off";
  const enabledSetting = settings.ai.enabled;
  const pausedByWhatsapp = enabledSetting && whatsappDown;
  const enabled = enabledSetting && !whatsappDown;
  const savedTone: AiTone = settings.ai.tone ?? "BALANCED";
  const [tone, setTone] = useState<AiTone>(savedTone);
  const savedDelivery = resolveMessageDelivery(settings.ai.messageDelivery);
  const [delivery, setDelivery] = useState<AiMessageDelivery>(savedDelivery);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activationMessage, setActivationMessage] = useState<string | null>(
    null,
  );
  const [pauseConfirmationOpen, setPauseConfirmationOpen] = useState(false);
  const [read, setRead] = useState<ActivationRead>({ phase: "idle" });
  // Tela do teste escolhida por uma ação desta página (iniciar, ver
  // resultado). Sem ação, a tela vem da execução lida.
  const [testPanel, setTestPanel] = useState<ActivationTestPanel | null>(null);
  // Exemplos dos estilos no jeito do segmento e com o primeiro serviço ativo
  // do negócio (validação de 2026-10-11); sem leitura, o exemplo do segmento.
  const [serviceName, setServiceName] = useState<string | null>(null);
  useEffect(() => {
    const catalog = getProductServices().serviceCatalog;
    if (!catalog?.list) return;
    const controller = new AbortController();
    catalog
      .list(controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        const first = list.items.find((service) => service.active);
        setServiceName(first?.name ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const examples = toneExamples(
    segmentExamples(settings.business?.category),
    serviceName,
  );

  const loadActivation = useCallback(async () => {
    setRead(await readActivation());
  }, []);

  useEffect(() => {
    if (enabled || pausedByWhatsapp) return;
    const controller = new AbortController();
    void readActivation(controller.signal).then((next) => {
      if (!controller.signal.aborted) setRead(next);
    });
    return () => controller.abort();
  }, [enabled, pausedByWhatsapp]);

  /** Relê tudo do servidor: configurações, teste e WhatsApp. */
  async function reload() {
    setTestPanel(null);
    setRead({ phase: "loading" });
    const state = await getProductServices().settings.get();
    onSaved(state);
    if (!state.ai.enabled) await loadActivation();
  }

  /**
   * O ligado só muda por "Pausar" e "Retomar". Salvar o estilo leva o ligado
   * **lido**, nunca um valor de formulário, e por isso não liga nem desliga
   * a IA.
   */
  async function write(nextEnabled: boolean, nextTone: AiTone) {
    const state = await getProductServices().settings.updateAi({
      enabled: nextEnabled,
      tone: nextTone,
    });
    onSaved(state);
    return state;
  }

  async function refusedForMissingTest(error: unknown): Promise<boolean> {
    if (
      !(error instanceof BffHttpError) ||
      error.code !== "AI_ACTIVATION_TEST_REQUIRED"
    ) {
      return false;
    }
    setActivationMessage(
      "A IA só liga depois de um teste real que terminou bem. Faça o teste para continuar.",
    );
    await reload().catch(() => setRead({ phase: "error" }));
    return true;
  }

  async function chooseTone(next: AiTone) {
    if (next === tone) return;
    setTone(next);
    setBusy(true);
    setMessage(null);
    try {
      await write(enabled, next);
      showToast("Estilo da IA salvo.");
    } catch (error) {
      setTone(savedTone);
      if (!(await refusedForMissingTest(error))) {
        setMessage("Não foi possível salvar o estilo.");
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Como as mensagens saem (D-208). Leva o ligado e o estilo **gravados**:
   * trocar o envio nunca liga, desliga nem muda o estilo da IA.
   */
  async function chooseDelivery(next: AiMessageDelivery) {
    if (next === delivery) return;
    setDelivery(next);
    setBusy(true);
    setDeliveryMessage(null);
    try {
      const state = await getProductServices().settings.updateAi({
        enabled: enabledSetting,
        tone: savedTone,
        messageDelivery: next,
      });
      onSaved(state);
      showToast("Envio das mensagens salvo.");
    } catch (error) {
      setDelivery(savedDelivery);
      if (!(await refusedForMissingTest(error))) {
        setDeliveryMessage("Não foi possível salvar o envio das mensagens.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function pause() {
    setPauseConfirmationOpen(false);
    setBusy(true);
    setActivationMessage(null);
    setRead({ phase: "idle" });
    try {
      await write(false, savedTone);
      setActivationMessage("Atendimento automático pausado.");
    } catch {
      setActivationMessage("Não foi possível pausar o atendimento.");
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    setActivationMessage(null);
    try {
      await write(true, savedTone);
      setActivationMessage("Atendimento automático retomado.");
    } catch (error) {
      if (!(await refusedForMissingTest(error))) {
        setActivationMessage("Não foi possível retomar o atendimento.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function startTest(panel: "intro" | "paused" | "failed") {
    setBusy(true);
    setActivationMessage(null);
    try {
      const refusal = await startActivationTest(
        activationTestStartAction[panel].mode,
      );
      if (refusal) setActivationMessage(refusal);
      else setTestPanel("progress");
    } catch {
      setActivationMessage("Não foi possível iniciar o teste agora.");
    } finally {
      setBusy(false);
    }
  }

  async function seeResult() {
    setBusy(true);
    setActivationMessage(null);
    try {
      const outcome = await readFinishedActivationTest();
      if ("error" in outcome) setActivationMessage(outcome.error);
      else setTestPanel(outcome.panel);
    } catch {
      setActivationMessage("Não foi possível ler o andamento do teste.");
    } finally {
      setBusy(false);
    }
  }

  async function finishTest() {
    setBusy(true);
    setActivationMessage(null);
    try {
      await reload();
    } catch {
      setRead({ phase: "error" });
    } finally {
      setBusy(false);
    }
  }

  const loaded = read.phase === "loaded" ? read : null;
  const hasProof = isValidActivationProof(loaded?.run);
  // Teste que acabou de terminar bem continua na tela de sucesso até a
  // pessoa seguir: é ela que relê o estado da IA.
  const showTest =
    !enabled &&
    !pausedByWhatsapp &&
    loaded !== null &&
    loaded.whatsappConnected &&
    (!hasProof || testPanel === "succeeded");
  const panel: ActivationTestPanel =
    testPanel ??
    (loaded?.run && loaded.run.state !== "SUCCEEDED"
      ? activationTestPanelFor(loaded.run)
      : "intro");

  return (
    <SettingsPage
      title="IA"
      description="Acompanhe o atendimento automático e escolha o jeito de falar."
    >
      <div className="ai-screen">
        <section
          aria-busy={
            !enabled &&
            !pausedByWhatsapp &&
            (read.phase === "idle" || read.phase === "loading")
          }
          aria-labelledby="ai-activation-heading"
          className="ai-state"
        >
          <div className="ai-state-main">
            <span aria-hidden="true" className="hub-row-ia">
              <span
                className={`hub-row-ia-ring${enabled ? " is-breathing" : " is-off"}`}
              />
              <span className={`hub-row-ia-dot${enabled ? "" : " is-off"}`} />
            </span>
            <div className="ai-state-copy">
              <h2 id="ai-activation-heading">
                {pausedByWhatsapp
                  ? "IA pausada"
                  : activationTitle(enabled, read, hasProof)}
              </h2>
              <p>
                {pausedByWhatsapp
                  ? "O WhatsApp está desconectado, então a IA não está atendendo. Quando ele reconectar, ela volta a atender sozinha."
                  : activationCopy(enabled, read, hasProof)}
              </p>
            </div>
            {enabled && (
              <button
                className="ai-state-action"
                disabled={busy}
                type="button"
                onClick={() => setPauseConfirmationOpen(true)}
              >
                Pausar
              </button>
            )}
          </div>
          <div className="ai-state-actions">
            {pausedByWhatsapp ? (
              <Link className="btn btn-primary" href="/configuracoes/whatsapp">
                Reconectar WhatsApp
              </Link>
            ) : enabled ? null : read.phase === "error" ? (
              <button
                className="btn btn-secondary"
                disabled={busy}
                type="button"
                onClick={() => {
                  setRead({ phase: "loading" });
                  void loadActivation();
                }}
              >
                Tentar novamente
              </button>
            ) : loaded && hasProof && testPanel !== "succeeded" ? (
              <button
                className="btn btn-primary"
                disabled={busy}
                type="button"
                onClick={() => void resume()}
              >
                {busy ? "Retomando..." : "Retomar atendimento"}
              </button>
            ) : loaded && !loaded.whatsappConnected ? (
              <Link className="btn btn-primary" href="/configuracoes/whatsapp">
                Conectar WhatsApp
              </Link>
            ) : null}
          </div>
          {activationMessage && (
            <p className="ai-state-message" role="status">
              {activationMessage}
            </p>
          )}
        </section>
        {showTest && (
          <section
            aria-labelledby="teste-real-heading"
            className="settings-panel"
            id="teste-real"
          >
            <div className="settings-panel-header">
              <div>
                <h2 id="teste-real-heading">Teste real</h2>
              </div>
            </div>
            <ActivationTestPanelBody panel={panel} />
            <div className="settings-form-actions">
              {panel === "progress" ? (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  type="button"
                  onClick={() => void seeResult()}
                >
                  {busy ? "Lendo..." : "Ver resultado"}
                </button>
              ) : panel === "succeeded" ? (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  type="button"
                  onClick={() => void finishTest()}
                >
                  {busy ? "Abrindo..." : "Continuar"}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  type="button"
                  onClick={() => void startTest(panel)}
                >
                  {busy
                    ? activationTestStartAction[panel].busy
                    : activationTestStartAction[panel].label}
                </button>
              )}
            </div>
          </section>
        )}
        <div className="ai-tone">
          <span className="ai-tone-label" id="ai-tone-label">
            Jeito de falar
          </span>
          <div
            aria-labelledby="ai-tone-label"
            className="ai-tone-options"
            role="radiogroup"
          >
            {TONE_OPTIONS.map((option) => (
              <ToneOption
                busy={busy}
                checked={tone === option.value}
                example={examples[option.value]}
                key={option.value}
                label={option.label}
                onChoose={() => void chooseTone(option.value)}
              />
            ))}
          </div>
          {message && (
            <p className="ai-state-message" role="status">
              {message}
            </p>
          )}
        </div>
        <DeliverySection
          busy={busy}
          delivery={delivery}
          message={deliveryMessage}
          onChoose={(next) => void chooseDelivery(next)}
          serviceName={serviceName}
          tone={tone}
        />
        <AppointmentNoticeRow />
        <AiSandboxSection />
        <div className="ai-contract">
          <div className="ai-contract-column">
            <h2 className="ai-contract-title is-can">Sozinha, ela</h2>
            <p>
              marca, remarca e cancela dentro dos seus horários · informa preços
              e pagamento · confirma tudo antes de marcar
            </p>
          </div>
          <div className="ai-contract-column">
            <h2 className="ai-contract-title is-never">Nunca</h2>
            <p>
              dá desconto ou encaixe · marca fora dos horários · responde
              contatos ignorados ou conversas pessoais
            </p>
          </div>
        </div>
        <div className="ai-links">
          <Link
            className="ai-link"
            href="/configuracoes/negocio/perguntas-frequentes"
          >
            <span className="ai-link-label">O que ela sabe responder</span>
            <span className="ai-link-value">
              Negócio
              <Icon name="chevron-right" />
            </span>
          </Link>
          <Link className="ai-link" href="/configuracoes/whatsapp">
            <span className="ai-link-label">Quem ela nunca responde</span>
            <span className="ai-link-value">
              WhatsApp
              <Icon name="chevron-right" />
            </span>
          </Link>
        </div>
      </div>
      <Dialog
        eyebrow="Impacto operacional"
        onClose={() => setPauseConfirmationOpen(false)}
        open={pauseConfirmationOpen}
        title="Pausar atendimento automático?"
      >
        <p className="settings-modal-copy">
          A Avenly deixará de responder novas mensagens. Conversas em
          atendimento humano continuam disponíveis.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setPauseConfirmationOpen(false)}
          >
            Manter atendimento ativo
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => void pause()}
          >
            Pausar atendimento
          </button>
        </div>
      </Dialog>
    </SettingsPage>
  );
}

/** O estado lido, em linguagem do negócio. Nunca afirma o que não leu. */
function activationCopy(
  enabled: boolean,
  read: ActivationRead,
  hasProof: boolean,
): string {
  if (enabled) return "Atendendo pelo WhatsApp";
  if (read.phase === "idle" || read.phase === "loading") {
    return "Lendo o estado do atendimento...";
  }
  if (read.phase === "error") {
    return "Não foi possível ler o estado do teste real.";
  }
  if (hasProof) {
    return "O atendimento automático está pausado. Seu teste real continua valendo: você pode retomar quando quiser.";
  }
  if (read.phase === "loaded" && !read.whatsappConnected) {
    return "A IA só liga depois do teste real, e o teste precisa do seu WhatsApp conectado.";
  }
  return "A IA só liga depois do teste real. Quando o teste terminar bem, o atendimento automático começa.";
}

/** Título do cartão de estado: só afirma "ativa", "pausada" ou "desligada" com leitura feita. */
function activationTitle(
  enabled: boolean,
  read: ActivationRead,
  hasProof: boolean,
): string {
  if (enabled) return "IA ativa";
  if (read.phase !== "loaded") return "Atendimento automático";
  return hasProof ? "IA pausada" : "IA desligada";
}

const TONE_OPTIONS: Array<{
  label: string;
  value: "BALANCED" | "CASUAL" | "PROFESSIONAL";
}> = [
  { label: "Profissional", value: "PROFESSIONAL" },
  { label: "Equilibrada", value: "BALANCED" },
  { label: "Descontraída", value: "CASUAL" },
];

function ToneOption({
  busy,
  checked,
  example,
  label,
  name = "ai-tone",
  onChoose,
}: {
  busy: boolean;
  checked: boolean;
  example: string;
  label: string;
  name?: string;
  onChoose: () => void;
}) {
  return (
    <label className={`ai-tone-option${checked ? " is-selected" : ""}`}>
      <input
        checked={checked}
        className="ai-tone-input"
        disabled={busy}
        name={name}
        type="radio"
        onChange={onChoose}
      />
      <span aria-hidden="true" className="ai-tone-mark">
        {checked && <Icon name="check" />}
      </span>
      <span className="ai-tone-copy">
        <span className="ai-tone-name">{label}</span>
        <span className="ai-tone-example">{example}</span>
      </span>
    </label>
  );
}

const DELIVERY_OPTIONS: Array<{
  description: string;
  label: string;
  value: AiMessageDelivery;
}> = [
  {
    label: "Em várias mensagens curtas",
    description:
      "Como uma pessoa digitando: uma ideia por mensagem, com “digitando…” antes de cada uma.",
    value: "PARTS",
  },
  {
    label: "Em uma mensagem só",
    description: "Tudo junto, num bloco.",
    value: "SINGLE",
  },
];

/** Hoje e daqui a `days` dias, local, como `AAAA-MM-DD`. */
function localDate(days = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Exemplo do envio (D-208): a mensagem de retorno de uma cliente, composta
 * pelo mesmo código da prévia do retorno, no estilo escolhido e com o
 * primeiro serviço do negócio. Muda ao vivo com a opção marcada.
 */
export function deliveryExampleBubbles(input: {
  delivery: AiMessageDelivery;
  serviceName: string | null;
  tone: AiTone;
}): string[] {
  const parts = composeReturnParts({
    style: input.tone,
    delivery: input.delivery,
    facts: {
      kind: "RENEWAL",
      followUp: false,
      customerName: "Ana",
      serviceName: input.serviceName,
      today: localDate(),
      expectedDate: localDate(),
      intervalDays: 15,
      daysSinceLastVisit: 15,
      offeredSlots: [
        { date: localDate(1), time: "10:00" },
        { date: localDate(3), time: "15:00" },
      ],
      incentive: null,
      messageTemplate: null,
    },
  });
  return messageBubbles(parts, input.delivery);
}

function DeliverySection({
  busy,
  delivery,
  message,
  onChoose,
  serviceName,
  tone,
}: {
  busy: boolean;
  delivery: AiMessageDelivery;
  message: string | null;
  onChoose: (next: AiMessageDelivery) => void;
  serviceName: string | null;
  tone: AiTone;
}) {
  const labelId = useId();
  const helpId = useId();
  const previewId = useId();
  const bubbles = deliveryExampleBubbles({ delivery, serviceName, tone });
  return (
    <div className="ai-delivery">
      <span className="ai-tone-label" id={labelId}>
        Como a IA envia as mensagens
      </span>
      <div
        aria-describedby={helpId}
        aria-labelledby={labelId}
        className="ai-tone-options"
        role="radiogroup"
      >
        {DELIVERY_OPTIONS.map((option) => (
          <ToneOption
            busy={busy}
            checked={delivery === option.value}
            example={option.description}
            key={option.value}
            label={option.label}
            name="ai-delivery"
            onChoose={() => onChoose(option.value)}
          />
        ))}
      </div>
      <p className="ai-delivery-help" id={helpId}>
        Vale para as respostas da IA, lembretes, confirmações de presença,
        avisos de alteração e mensagens de retorno. O que você digita no app
        sai exatamente como você escreveu.
      </p>
      <section aria-labelledby={previewId} className="ai-delivery-preview">
        <span className="ai-delivery-preview-title" id={previewId}>
          Exemplo de como chega para a cliente
        </span>
        <MessageBubbles
          bubbleClassName="ai-delivery-bubble"
          bubbles={bubbles}
          label={`${bubbles.length} mensagens, nesta ordem`}
        />
      </section>
      {message && (
        <p className="ai-state-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * Aviso de agendamento criado pela IA: a mesma preferência de `/notificacoes`
 * (`aiAppointmentCreated`), lida e gravada pelo mesmo serviço. Esqueleto
 * enquanto carrega e a linha some quando a leitura falha, como lá.
 */
function AppointmentNoticeRow() {
  const descriptionId = useId();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .notifications.getPreferences(controller.signal)
      .then((preferences) => setEnabled(preferences.aiAppointmentCreated))
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    return () => controller.abort();
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const preferences =
        await getProductServices().notifications.updatePreferences({
          aiAppointmentCreated: next,
        });
      setEnabled(preferences.aiAppointmentCreated);
      showToast("Aviso salvo.");
    } catch {
      setMessage("Não foi possível salvar o aviso.");
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null && !error) {
    return (
      <div aria-busy="true" className="ai-notice-skeleton">
        <Skeleton style={{ width: "70%", height: 20 }} />
        <Skeleton style={{ width: "100%", height: 16 }} />
      </div>
    );
  }
  if (error || enabled === null) return null;

  return (
    <div className="ai-notice">
      <label className="ai-notice-row">
        <input
          aria-describedby={descriptionId}
          checked={enabled}
          className="ai-notice-input"
          disabled={busy}
          type="checkbox"
          onChange={(event) => void toggle(event.target.checked)}
        />
        <span className="ai-notice-copy">
          <span className="ai-notice-title">
            Avisar quando a IA marcar um horário
          </span>
          <span className="ai-notice-help" id={descriptionId}>
            Desligado por padrão: você só recebe aviso quando algo precisa de
            você.
          </span>
        </span>
      </label>
      {message && (
        <p className="ai-state-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
