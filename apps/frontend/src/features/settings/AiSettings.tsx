"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

import {
  type ActivationTestRun,
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
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { Skeleton } from "@/shared/ui/States";

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
  const enabled = settings.ai.enabled;
  const savedTone: AiTone = settings.ai.tone ?? "BALANCED";
  const [tone, setTone] = useState<AiTone>(savedTone);
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

  const loadActivation = useCallback(async () => {
    setRead(await readActivation());
  }, []);

  useEffect(() => {
    if (enabled) return;
    const controller = new AbortController();
    void readActivation(controller.signal).then((next) => {
      if (!controller.signal.aborted) setRead(next);
    });
    return () => controller.abort();
  }, [enabled]);

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
    } catch (error) {
      setTone(savedTone);
      if (!(await refusedForMissingTest(error))) {
        setMessage("Não foi possível salvar o estilo.");
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
            !enabled && (read.phase === "idle" || read.phase === "loading")
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
                {activationTitle(enabled, read, hasProof)}
              </h2>
              <p>{activationCopy(enabled, read, hasProof)}</p>
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
            {enabled ? null : read.phase === "error" ? (
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
                example={option.example}
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
        <AppointmentNoticeRow />
        <div className="ai-contract">
          <div className="ai-contract-column">
            <h2 className="ai-contract-title is-can">Sozinha, ela</h2>
            <p>
              marca, remarca e cancela dentro dos seus horários · informa
              preços e pagamento · confirma tudo antes de marcar
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
          A Atendly deixará de responder novas mensagens. Conversas em
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

const TONE_OPTIONS: Array<{ example: string; label: string; value: AiTone }> = [
  {
    example: "“Olá! Gostaria de agendar um horário?”",
    label: "Profissional",
    value: "PROFESSIONAL",
  },
  {
    example: "“Oi! Quer marcar um horário? 😊”",
    label: "Equilibrada",
    value: "BALANCED",
  },
  {
    example: "“Oiii! Bora marcar? 😄”",
    label: "Descontraída",
    value: "CASUAL",
  },
];

function ToneOption({
  busy,
  checked,
  example,
  label,
  onChoose,
}: {
  busy: boolean;
  checked: boolean;
  example: string;
  label: string;
  onChoose: () => void;
}) {
  return (
    <label className={`ai-tone-option${checked ? " is-selected" : ""}`}>
      <input
        checked={checked}
        className="ai-tone-input"
        disabled={busy}
        name="ai-tone"
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
      const preferences = await getProductServices().notifications.updatePreferences(
        { aiAppointmentCreated: next },
      );
      setEnabled(preferences.aiAppointmentCreated);
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
