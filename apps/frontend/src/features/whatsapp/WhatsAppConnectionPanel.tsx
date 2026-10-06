"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  BffHttpError,
  type WhatsAppConnectInput,
  type WhatsAppConnection,
} from "@/data";
import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import { Icon } from "@/shared/icons/Icon";
import { formatBrazilianPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Skeleton } from "@/shared/ui/States";

// Intervalo de releitura do QR (Goal071/WU-02): menor que o giro observado da
// Evolution (~20s), para nunca mostrar um QR já trocado do lado dela.
const QR_POLL_INTERVAL_MS = 15_000;
// Um giro do QR no fork (a cada 20s depois do primeiro): nenhum QR fica na
// tela com mais idade que isso, e `qrcode: null` ou falha de leitura que
// persistem além de um giro levam ao estado expirado (Goal071 §4).
const QR_ROTATION_MS = 20_000;
// Janela declarada de renovação: depois dela a tela para de reler e pede um
// QR novo, mesmo que a Evolution ainda aceitasse o antigo.
const QR_WINDOW_MS = 5 * 60 * 1000;
const PAIRING_CODE_POLL_INTERVAL_MS = 3_000;
const PHONE_FORMAT_ERROR =
  "Digite o número com DDD, só com números. Exemplo: 11999990000.";

type Mode = "PAIRING_CODE" | "QR";

type LinkingState = {
  expiresAt: string | null;
  mode: Mode;
  pairingCode: string | null;
  qrcode: string | null;
};

/** Fase do onboarding: o consentimento vem numa tela própria, antes da
 * conexão. Ausente (Configurações), o painel mostra tudo numa tela só. */
export type WhatsAppConsentPhase = {
  phase: "connect" | "consent";
  // Checkbox marcado e pergunta sobre número pessoal respondida.
  onConsentReadyChange: (ready: boolean) => void;
  // Vinculação expirada, falha ou desfeita: o consentimento vale de novo.
  onConsentRequired: () => void;
  // O número conectado do onboarding tem o link "Conectei o número errado" no
  // rodapé da etapa, fora do painel: quem desenha o estado conectado registra
  // aqui como abrir a folha de desconexão (e `null` ao sair de cena).
  onWrongNumberChange?: (open: (() => void) | null) => void;
};

/** Ponto de extensão do estado conectado (Configurações e o onboarding, que o
 * usa também em fase): o painel segue dono da leitura, da vinculação e do
 * diálogo de desconexão, e quem estende só desenha o que fica no lugar do
 * cartão. */
export type WhatsAppConnectedContext = {
  busy: boolean;
  connection: WhatsAppConnection;
  // Desconecta como o diálogo de hoje; resolve `true` quando desconectou.
  disconnect: () => Promise<boolean>;
  error: string | null;
  openDisconnectDialog: () => void;
};

export function WhatsAppConnectionPanel({
  consentPhase,
  onConnected,
  onStatusChange,
  renderConnected,
}: {
  consentPhase?: WhatsAppConsentPhase;
  onConnected?: () => void;
  onStatusChange?: (connected: boolean) => void;
  renderConnected?: (context: WhatsAppConnectedContext) => ReactNode;
}) {
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  // Sem a primeira leitura de status, o painel não sabe se o número já está
  // conectado: não mostra consentimento nem CTA até ela chegar (Goal071 §3).
  const [statusRead, setStatusRead] = useState<"error" | "loaded" | "loading">(
    "loading",
  );
  const [consentChecked, setConsentChecked] = useState(false);
  const [personalAnswer, setPersonalAnswer] = useState<"NO" | "YES" | null>(
    null,
  );
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 760px)").matches
      ? "PAIRING_CODE"
      : "QR",
  );
  const [phone, setPhone] = useState("");
  const [linking, setLinking] = useState<LinkingState | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(
    null,
  );
  const [disconnectConfirmationOpen, setDisconnectConfirmationOpen] =
    useState(false);
  const openDisconnectDialog = useCallback(
    () => setDisconnectConfirmationOpen(true),
    [],
  );

  const onConnectedRef = useRef(onConnected);
  const onStatusChangeRef = useRef(onStatusChange);
  const consentPhaseRef = useRef(consentPhase);
  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    consentPhaseRef.current = consentPhase;
  }, [consentPhase]);

  const consentReady = consentChecked && personalAnswer !== null;
  useEffect(() => {
    consentPhaseRef.current?.onConsentReadyChange(consentReady);
  }, [consentReady]);

  // Em fase, a vinculação que expira volta ao consentimento, desmarcado.
  useEffect(() => {
    if (!expired || !consentPhaseRef.current) return;
    setConsentChecked(false);
    setPersonalAnswer(null);
    consentPhaseRef.current.onConsentRequired();
  }, [expired]);

  const refresh = useCallback(async () => {
    const next = await getProductServices().whatsapp.get();
    setConnection(next);
    setStatusRead("loaded");
    onStatusChangeRef.current?.(next?.status === "CONNECTED");
    if (next?.status === "CONNECTED") {
      setLinking(null);
      setExpired(false);
      setError(null);
      onConnectedRef.current?.();
    }
    return next;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() => setStatusRead("error"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // Renovação do QR (Goal071/WU-02): `setTimeout` encadeado (nunca
  // `setInterval`), para não haver duas leituras concorrentes. Pausa com a
  // aba oculta e retoma ao voltar a ficar visível; termina na janela
  // declarada acima, sem depender do relógio do servidor.
  useEffect(() => {
    if (!linking || linking.mode !== "QR") return undefined;
    const startedAt = Date.now();
    // Momento em que o QR na tela foi lido. Sem QR novo por mais de um giro
    // (`qrcode: null` ou falha persistentes), a tela nunca segura o antigo.
    let freshAt = startedAt;
    let staleTimer: number | undefined;
    // Uma leitura em voo sobrevive ao cleanup deste efeito: descartado, o
    // resultado dela nunca toca a vinculação seguinte (nem expira, nem rearma
    // o relógio, nem troca o QR).
    let disposed = false;

    function expire() {
      setExpired(true);
      setLinking(null);
    }

    function stale() {
      return Date.now() - freshAt >= QR_ROTATION_MS;
    }

    function armStaleTimer() {
      if (staleTimer !== undefined) window.clearTimeout(staleTimer);
      staleTimer = window.setTimeout(() => {
        staleTimer = undefined;
        if (document.visibilityState === "hidden") {
          // Aba oculta: tira o QR velho da tela, e a leitura ao voltar a
          // ficar visível decide entre QR novo e expirado.
          setLinking((current) =>
            current && current.mode === "QR"
              ? { ...current, qrcode: null }
              : current,
          );
          return;
        }
        poller.cancel();
        expire();
      }, QR_ROTATION_MS);
    }

    const poller = schedulePoll(async () => {
      if (Date.now() - startedAt >= QR_WINDOW_MS) {
        expire();
        return false;
      }
      try {
        const result = await getProductServices().whatsapp.qr();
        if (disposed) return false;
        if (result.connection.status === "CONNECTED") {
          setConnection(result.connection);
          setLinking(null);
          setExpired(false);
          onStatusChangeRef.current?.(true);
          onConnectedRef.current?.();
          return false;
        }
        if (result.qrcode) {
          freshAt = Date.now();
          armStaleTimer();
          setLinking((current) =>
            current && current.mode === "QR"
              ? { ...current, qrcode: result.qrcode }
              : current,
          );
          return true;
        }
        // Sem QR agora: o último lido continua valendo só até completar um
        // giro de idade.
        if (stale()) {
          expire();
          return false;
        }
        return true;
      } catch (thrown) {
        if (disposed) return false;
        if (
          (thrown instanceof BffHttpError &&
            thrown.code === "WHATSAPP_QR_NOT_IN_PROGRESS") ||
          stale()
        ) {
          expire();
          return false;
        }
        // Falha transitória dentro de um giro: tenta de novo.
        return true;
      }
    }, QR_POLL_INTERVAL_MS);
    armStaleTimer();

    return () => {
      disposed = true;
      poller.cancel();
      if (staleTimer !== undefined) window.clearTimeout(staleTimer);
    };
    // Depende só de `linking?.mode`, de propósito: reagir ao objeto inteiro
    // reiniciaria o relógio a cada QR novo que o próprio efeito grava.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linking?.mode]);

  // Detecção de conexão no modo código: sem QR para reler, só confere se o
  // número já conectou, até o código expirar.
  useEffect(() => {
    if (!linking || linking.mode !== "PAIRING_CODE") return undefined;
    const expiresAtMs = linking.expiresAt ? Date.parse(linking.expiresAt) : null;

    const poller = schedulePoll(async () => {
      if (expiresAtMs !== null && Date.now() >= expiresAtMs) {
        setExpired(true);
        setLinking(null);
        return false;
      }
      try {
        const next = await refresh();
        return next?.status !== "CONNECTED";
      } catch {
        return true;
      }
    }, PAIRING_CODE_POLL_INTERVAL_MS);

    return () => poller.cancel();
    // Mesma razão do efeito de QR acima: depende dos campos primitivos que
    // decidem a janela, não do objeto `linking` inteiro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linking?.mode, linking?.expiresAt, refresh]);

  async function startLink() {
    if (!consentChecked || !personalAnswer) return;
    if (mode === "PAIRING_CODE" && phone.replace(/\D/g, "").length < 10) {
      setPhoneError(PHONE_FORMAT_ERROR);
      return;
    }
    setBusy(true);
    setError(null);
    setPhoneError(null);
    setExpired(false);
    setCopyStatus(null);
    const input: WhatsAppConnectInput =
      mode === "QR"
        ? { consentAccepted: true, mode: "QR" }
        : { consentAccepted: true, mode: "PAIRING_CODE", phone };
    try {
      const reconnecting = Boolean(connection);
      const result = reconnecting
        ? await getProductServices().whatsapp.reconnect(input)
        : await getProductServices().whatsapp.connect(input);
      setConnection(result.connection);
      setLinking({
        expiresAt: result.expiresAt,
        mode,
        pairingCode: result.pairingCode,
        qrcode: result.qrcode,
      });
    } catch (thrown) {
      if (
        mode === "PAIRING_CODE" &&
        thrown instanceof BffHttpError &&
        thrown.code === "VALIDATION_ERROR"
      ) {
        setPhoneError(PHONE_FORMAT_ERROR);
      } else {
        setError("Não foi possível iniciar a conexão. Tente novamente.");
        if (consentPhaseRef.current) {
          setConsentChecked(false);
          setPersonalAnswer(null);
          consentPhaseRef.current.onConsentRequired();
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await getProductServices().whatsapp.disconnect();
      setConnection(null);
      setLinking(null);
      setExpired(false);
      // A cada vinculação exige consentimento de novo: nada aqui sobrevive à
      // desconexão.
      setConsentChecked(false);
      setPersonalAnswer(null);
      setPhone("");
      setPhoneError(null);
      setDisconnectConfirmationOpen(false);
      onStatusChangeRef.current?.(false);
      consentPhaseRef.current?.onConsentRequired();
      return true;
    } catch {
      setError("Não foi possível desconectar o número.");
      // Com o estado conectado estendido, o alerta mora na tela e não atrás
      // do diálogo.
      if (renderConnected) setDisconnectConfirmationOpen(false);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!linking?.pairingCode) return;
    setCopyStatus(null);
    try {
      if (!navigator.clipboard) throw new Error("clipboard indisponível");
      await navigator.clipboard.writeText(linking.pairingCode);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function retryStatus() {
    setStatusRead("loading");
    void refresh().catch(() => setStatusRead("error"));
  }

  if (statusRead !== "loaded") {
    return (
      <div className="settings-stack">
        {statusRead === "loading" ? (
          <section aria-busy="true" className="settings-panel">
            <Skeleton style={{ width: "40%", height: 20 }} />
            <Skeleton style={{ width: "100%", height: 56 }} />
          </section>
        ) : (
          <section className="settings-panel settings-connect-panel">
            <p className="field-help" role="alert">
              Não foi possível verificar a conexão.
            </p>
            <div className="settings-form-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={retryStatus}
              >
                Tentar novamente
              </button>
            </div>
          </section>
        )}
      </div>
    );
  }

  const connected = connection?.status === "CONNECTED";
  const phased = consentPhase !== undefined;
  const displayPhone = connection?.phoneNumber
    ? formatBrazilianPhone(connection.phoneNumber, "plus")
    : null;

  if (consentPhase?.phase === "consent" && !connected) {
    return (
      <div className="whatsapp-consent-phase">
        {expired && (
          <p className="field-help" role="alert">
            {mode === "QR" ? "O QR Code expirou." : "O código expirou."}
          </p>
        )}
        <label className="check whatsapp-consent-card">
          <input
            aria-labelledby="whatsapp-consent-text"
            checked={consentChecked}
            required
            type="checkbox"
            onChange={(event) => setConsentChecked(event.target.checked)}
          />
          <span aria-hidden="true" className="check-box" />
          <span className="whatsapp-consent-copy">
            <span id="whatsapp-consent-text">
              Entendo que as conversas deste número poderão ser processadas e
              armazenadas para oferecer os recursos da Avenly.
            </span>{" "}
            <Link
              className="whatsapp-consent-link"
              href="/politica-de-privacidade"
              rel="noopener noreferrer"
              target="_blank"
            >
              Saiba mais
            </Link>
          </span>
        </label>

        <div className="field">
          <span className="label">
            Você usa esse número também para conversas pessoais?
          </span>
          <div className="settings-segmented">
            <label>
              <input
                checked={personalAnswer === "YES"}
                name="whatsapp-personal-number"
                type="radio"
                onChange={() => setPersonalAnswer("YES")}
              />
              <span>Sim, também</span>
            </label>
            <label>
              <input
                checked={personalAnswer === "NO"}
                name="whatsapp-personal-number"
                type="radio"
                onChange={() => setPersonalAnswer("NO")}
              />
              <span>Não, só trabalho</span>
            </label>
          </div>
        </div>

        {personalAnswer === "YES" && (
          <div className="settings-control-block">
            <strong>Tudo bem — você continua no controle:</strong>
            <div className="settings-control-item">
              <ControlIcon>
                <path d="M4 7h16M4 12h16M4 17h10" />
              </ControlIcon>
              <span>
                Suas conversas ficam separadas em <strong>Comercial</strong>,{" "}
                <strong>Não classificadas</strong> e <strong>Pessoal</strong>.
              </span>
            </div>
            <div className="settings-control-item">
              <ControlIcon>
                <circle cx="12" cy="12" r="8" />
                <path d="M6.5 6.5l11 11" />
              </ControlIcon>
              <span>
                Você marca contatos que a IA <strong>nunca</strong> deve
                responder.
              </span>
            </div>
            <div className="settings-control-item">
              <ControlIcon>
                <path d="M9 6v12M15 6v12" />
              </ControlIcon>
              <span>
                Em conversas pessoais a IA fica <strong>desativada</strong>. E
                quando você responde, ela sai de cena.
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="field-help" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const disconnectDialog = disconnectConfirmationOpen ? (
    <DisconnectSheet
      busy={busy}
      error={renderConnected ? null : error}
      onCancel={() => setDisconnectConfirmationOpen(false)}
      onConfirm={() => void disconnect()}
      phone={displayPhone}
    />
  ) : null;

  if (renderConnected && connection?.status === "CONNECTED") {
    return (
      <>
        <ConnectedSlot
          context={{
            busy,
            connection,
            disconnect,
            error,
            openDisconnectDialog,
          }}
          render={renderConnected}
        />
        {disconnectDialog}
      </>
    );
  }

  const badge = connected
    ? "Conectado"
    : expired && !phased
      ? mode === "QR"
        ? "QR Code expirado"
        : "Código expirado"
      : linking
        ? "Aguardando conexão"
        : busy
          ? "Conectando"
          : "Desconectado";

  return (
    <div className="settings-stack">
      <section className="settings-status-hero">
        <span
          className={`settings-source-icon${connected ? "" : " is-warning"}`}
        >
          <Icon name={connected ? "chat" : "refresh"} />
        </span>
        <div className="settings-status-copy">
          <span className={`badge${connected ? " badge-success" : ""}`}>
            {badge}
          </span>
          <h2>{connected ? "WhatsApp conectado" : "Conecte seu WhatsApp"}</h2>
          <p>
            {connected
              ? "O atendimento automático pode operar neste número."
              : "A conexão só fica ativa depois da confirmação no WhatsApp."}
          </p>
          {displayPhone && <p className="small">{displayPhone}</p>}
        </div>
      </section>

      {connected && (
        <button
          className="btn btn-danger"
          disabled={busy}
          type="button"
          onClick={() => setDisconnectConfirmationOpen(true)}
        >
          Desconectar número
        </button>
      )}

      {!connected && !phased && expired && (
        <section className="settings-panel settings-connect-panel">
          <p className="field-help" role="alert">
            {mode === "QR" ? "O QR Code expirou." : "O código expirou."}
          </p>
          <div className="settings-form-actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              type="button"
              onClick={() => void startLink()}
            >
              {busy
                ? "Aguarde..."
                : mode === "QR"
                  ? "Gerar novo QR Code"
                  : "Gerar novo código"}
            </button>
          </div>
        </section>
      )}

      {!connected && !expired && linking?.mode === "QR" && (
        <section className="settings-panel settings-connect-panel">
          <div className="settings-qr-stack">
            {linking.qrcode ? (
              <Image
                alt="QR Code para vincular o WhatsApp"
                height={220}
                src={normalizeQrCode(linking.qrcode)}
                unoptimized
                width={220}
              />
            ) : (
              <p className="field-help">Gerando o QR Code...</p>
            )}
            <ol className="settings-steps">
              <li>Abra o WhatsApp no seu celular.</li>
              <li>
                Toque em <strong>⋮</strong> ou <strong>Configurações</strong> ›{" "}
                <strong>Dispositivos conectados</strong>.
              </li>
              <li>
                Toque em <strong>Conectar dispositivo</strong>.
              </li>
              <li>Aponte a câmera para este QR code.</li>
            </ol>
            <div className="settings-waiting-row">
              <span aria-hidden="true" className="settings-waiting-dot" />
              <span>Aguardando conexão… detectamos sozinhos quando conectar.</span>
            </div>
          </div>
          {error && (
            <p className="field-help" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {!connected && !expired && linking?.mode === "PAIRING_CODE" && (
        <section className="settings-panel settings-connect-panel">
          <div className="settings-code">
            <span className="small">Seu código</span>
            <strong className="mono">{linking.pairingCode}</strong>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void copyCode()}
            >
              Copiar código
            </button>
            {copyStatus === "copied" && (
              <p className="field-help" role="status">
                Código copiado
              </p>
            )}
            {copyStatus === "failed" && (
              <p className="field-help" role="alert">
                Não foi possível copiar. Copie o código acima à mão.
              </p>
            )}
          </div>
          <ol className="settings-steps">
            <li>Copie o código acima.</li>
            <li>
              Abra o <strong>WhatsApp</strong> neste celular.
            </li>
            <li>
              Toque em <strong>⋮</strong> ou <strong>Configurações</strong> ›{" "}
              <strong>Dispositivos conectados</strong>.
            </li>
            <li>
              <strong>Conectar dispositivo</strong> ›{" "}
              <strong>Conectar com número de telefone</strong>.
            </li>
            <li>Digite o código e volte para a Avenly.</li>
          </ol>
          <div className="settings-waiting-row">
            <span aria-hidden="true" className="settings-waiting-dot" />
            <span>Aguardando conexão… detectamos sozinhos quando conectar.</span>
          </div>
          <div className="settings-form-actions">
            <a
              className="btn btn-secondary"
              href="whatsapp://send"
              rel="noopener noreferrer"
              target="_blank"
            >
              Abrir WhatsApp
            </a>
          </div>
          {error && (
            <p className="field-help" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {!connected && (phased || !expired) && !linking && (
        <section className="settings-panel settings-connect-panel">
          {!phased && (
            <>
          <div className="settings-consent-note">
            <label className="check">
              <input
                checked={consentChecked}
                required
                type="checkbox"
                onChange={(event) => setConsentChecked(event.target.checked)}
              />
              <span aria-hidden="true" className="check-box" />
              <span>
                Entendo que as conversas deste número poderão ser processadas
                e armazenadas para oferecer os recursos da Avenly.
              </span>
            </label>
            <Link
              className="settings-consent-link"
              href="/politica-de-privacidade"
              rel="noopener noreferrer"
              target="_blank"
            >
              Saiba mais
            </Link>
          </div>

          <div className="field">
            <span className="label">
              Você usa esse número também para conversas pessoais?
            </span>
            <div className="settings-segmented">
              <label>
                <input
                  checked={personalAnswer === "YES"}
                  name="whatsapp-personal-number"
                  type="radio"
                  onChange={() => setPersonalAnswer("YES")}
                />
                <span>Sim, também</span>
              </label>
              <label>
                <input
                  checked={personalAnswer === "NO"}
                  name="whatsapp-personal-number"
                  type="radio"
                  onChange={() => setPersonalAnswer("NO")}
                />
                <span>Não, só trabalho</span>
              </label>
            </div>
          </div>

          {personalAnswer === "YES" && (
            <div className="settings-control-block">
              <strong>Tudo bem — você continua no controle:</strong>
              <div className="settings-control-item">
                <Icon name="inbox" />
                <span>
                  Suas conversas ficam separadas em <strong>Comercial</strong>,{" "}
                  <strong>Não classificadas</strong> e{" "}
                  <strong>Pessoal</strong>.
                </span>
              </div>
              <div className="settings-control-item">
                <Icon name="x" />
                <span>
                  Você marca contatos que a IA <strong>nunca</strong> deve
                  responder.
                </span>
              </div>
              <div className="settings-control-item">
                <Icon name="info" />
                <span>
                  Em conversas pessoais a IA fica <strong>desativada</strong>.
                  Quando você responde, ela sai de cena.
                </span>
              </div>
            </div>
          )}
            </>
          )}

          <div className="field">
            <span className="label">Como prefere conectar?</span>
            <div className="settings-segmented">
              <label>
                <input
                  checked={mode === "QR"}
                  name="whatsapp-connection-mode"
                  type="radio"
                  onChange={() => setMode("QR")}
                />
                <span>QR Code</span>
              </label>
              <label>
                <input
                  checked={mode === "PAIRING_CODE"}
                  name="whatsapp-connection-mode"
                  type="radio"
                  onChange={() => setMode("PAIRING_CODE")}
                />
                <span>Código</span>
              </label>
            </div>
          </div>

          {mode === "PAIRING_CODE" && (
            <label className="field">
              <span className="label">Seu número de WhatsApp com DDD</span>
              <input
                aria-describedby={
                  phoneError ? "whatsapp-phone-error" : undefined
                }
                aria-invalid={phoneError ? true : undefined}
                className="input"
                inputMode="tel"
                placeholder="11999990000"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneError(null);
                }}
              />
            </label>
          )}
          {mode === "PAIRING_CODE" && phoneError && (
            <p className="field-help" id="whatsapp-phone-error" role="alert">
              {phoneError}
            </p>
          )}

          {error && (
            <p className="field-help" role="alert">
              {error}
            </p>
          )}

          <div className="settings-form-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !consentChecked || !personalAnswer}
              type="button"
              onClick={() => void startLink()}
            >
              {busy
                ? "Aguarde..."
                : connection
                  ? "Reconectar WhatsApp"
                  : "Conectar WhatsApp"}
            </button>
          </div>
        </section>
      )}

      {disconnectDialog}
    </div>
  );
}

function DisconnectSheet({
  busy,
  error,
  onCancel,
  onConfirm,
  phone,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  phone: string | null;
}) {
  const titleId = useId();
  return (
    <ChatSheetShell
      className="is-settings-confirm"
      initialFocusSelector=".settings-sheet-cancel"
      onClose={onCancel}
      title="Desconectar o WhatsApp?"
      titleId={titleId}
    >
      <div className="settings-sheet-copy">
        <h2 className="settings-sheet-title" id={titleId}>
          Desconectar o WhatsApp?
        </h2>
        <p className="settings-sheet-text">
          {phone ? `O número ${phone}` : "Seu número"} deixa de estar ligado à
          Avenly.
        </p>
      </div>
      <div className="settings-sheet-points">
        <div className="settings-sheet-point">
          <span aria-hidden="true" className="settings-sheet-ring" />
          <span>
            <strong>Sua IA para de atender</strong> na hora. Ninguém recebe
            resposta automática.
          </span>
        </div>
        <div className="settings-sheet-point">
          <SheetCheck />
          <span>
            <strong>Clientes, agenda e histórico</strong> de conversas continuam
            na Avenly.
          </span>
        </div>
        <div className="settings-sheet-point">
          <SheetCheck />
          <span>Para voltar, basta conectar de novo e refazer o teste.</span>
        </div>
      </div>
      {error && (
        <p className="chat-sheet-error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-sheet-actions">
        <button
          className="settings-sheet-confirm is-danger"
          disabled={busy}
          type="button"
          onClick={onConfirm}
        >
          {busy ? "Desconectando..." : "Desconectar"}
        </button>
        <button
          className="settings-sheet-cancel"
          disabled={busy}
          type="button"
          onClick={onCancel}
        >
          Manter conectado
        </button>
      </div>
    </ChatSheetShell>
  );
}

function SheetCheck() {
  return (
    <span aria-hidden="true" className="settings-sheet-check">
      <svg
        fill="none"
        height="12"
        stroke="#2E7D4F"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        viewBox="0 0 24 24"
        width="12"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function ConnectedSlot({
  context,
  render,
}: {
  context: WhatsAppConnectedContext;
  render: (context: WhatsAppConnectedContext) => ReactNode;
}) {
  return <>{render(context)}</>;
}

function ControlIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="whatsapp-control-icon"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
    >
      {children}
    </svg>
  );
}

function normalizeQrCode(value: string): string {
  return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
}

/**
 * `setTimeout` encadeado (nunca `setInterval`): a próxima leitura só é
 * agendada depois que a anterior termina, então nunca há duas em voo. Pausa
 * sozinho com a aba oculta e retoma exatamente ao voltar a ficar visível,
 * sem acumular leituras perdidas.
 */
function schedulePoll(
  fn: () => Promise<boolean>,
  intervalMs: number,
): { cancel: () => void } {
  let cancelled = false;
  let inFlight = false;
  let timeoutId: number | undefined;

  function tick() {
    timeoutId = undefined;
    if (cancelled || inFlight) return;
    if (document.visibilityState === "hidden") return;
    inFlight = true;
    void fn()
      .catch(() => true)
      .then((shouldContinue) => {
        inFlight = false;
        if (!cancelled && shouldContinue) {
          timeoutId = window.setTimeout(tick, intervalMs);
        }
      });
  }

  function handleVisibility() {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    timeoutId = undefined;
    // Com uma leitura em voo, é ela que agenda a próxima ao terminar: voltar
    // a ficar visível não abre uma segunda cadeia.
    if (document.visibilityState === "visible" && !inFlight) tick();
  }

  timeoutId = window.setTimeout(tick, intervalMs);
  document.addEventListener("visibilitychange", handleVisibility);

  return {
    cancel: () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibility);
    },
  };
}
