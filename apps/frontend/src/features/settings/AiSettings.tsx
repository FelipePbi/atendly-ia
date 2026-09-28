"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
import { KnowledgeSection } from "@/features/knowledge/KnowledgeSection";
import { OtherInfoSection } from "@/features/knowledge/OtherInfoSection";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import { SaveActions, ToneChoice } from "./shared/fields";
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

  async function saveTone() {
    setBusy(true);
    setMessage(null);
    try {
      await write(enabled, tone);
      setMessage("Estilo da IA salvo.");
    } catch (error) {
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
      title="Atendente virtual"
      description="Acompanhe o atendimento automático e escolha um dos três estilos disponíveis."
    >
      <div className="settings-stack">
        <section
          aria-busy={
            !enabled && (read.phase === "idle" || read.phase === "loading")
          }
          aria-labelledby="ai-activation-heading"
          className="settings-panel"
        >
          <div className="settings-panel-header">
            <div>
              <h2 id="ai-activation-heading">Atendimento automático</h2>
              <p>{activationCopy(enabled, read, hasProof)}</p>
            </div>
          </div>
          <div className="settings-status-actions">
            {enabled ? (
              <button
                className="btn btn-secondary"
                disabled={busy}
                type="button"
                onClick={() => setPauseConfirmationOpen(true)}
              >
                Pausar atendimento
              </button>
            ) : read.phase === "error" ? (
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
            <p className="settings-inline-message" role="status">
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
        <section aria-labelledby="ai-tone-heading" className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2 id="ai-tone-heading">Estilo da IA</h2>
              <p>Como a IA conversa com seus clientes.</p>
            </div>
          </div>
          <div className="settings-choice-grid">
            <ToneChoice
              checked={tone === "PROFESSIONAL"}
              label="Profissional"
              onChange={() => setTone("PROFESSIONAL")}
            />
            <ToneChoice
              checked={tone === "BALANCED"}
              label="Equilibrada"
              onChange={() => setTone("BALANCED")}
            />
            <ToneChoice
              checked={tone === "CASUAL"}
              label="Descontraída"
              onChange={() => setTone("CASUAL")}
            />
          </div>
          <SaveActions
            busy={busy}
            message={message}
            onClick={() => void saveTone()}
          />
        </section>
        <KnowledgeSection />
        <OtherInfoSection />
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
  if (enabled) return "A IA está ligada e atende seus clientes.";
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
