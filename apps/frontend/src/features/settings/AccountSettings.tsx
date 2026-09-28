"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { BffHttpError, PASSWORD_POLICY_RULES } from "@/data";
import { getProductServices, useProductRuntime } from "@/shared/runtime/ProductRuntime";
import {
  accountDeletionDaysRemaining,
  useSystemStatus,
} from "@/shared/runtime/systemStatus";
import { Dialog } from "@/shared/ui/Dialog";

import { formString, Password, SaveActions } from "./shared/fields";
import { SettingsPage } from "./shared/SettingsPage";

/**
 * A contagem de dias é a de `systemStatus`, a mesma que o aviso persistente do
 * shell usa: o prazo mostrado aqui e o mostrado lá não podem divergir.
 */
// Mesmo texto de regra do cadastro (AuthScreen), mesma regra do pacote
// (U-10/Goal064 §7): a forma da tela não muda, só a recusa no cliente.
const PASSWORD_RULE_LABELS: Record<string, string> = {
  MIN_LENGTH: "pelo menos 8 caracteres",
  HAS_LETTER_AND_DIGIT: "letras e números",
};

function passwordPolicyError(value: string): string | null {
  const failed = PASSWORD_POLICY_RULES.filter((rule) => !rule.test(value));
  if (failed.length === 0) return null;
  const labels = failed.map((rule) => PASSWORD_RULE_LABELS[rule.id]);
  return `A nova senha precisa ter ${labels.join(" e ")}.`;
}

function daysRemainingCopy(days: number): string {
  if (days <= 0) {
    return "O prazo para cancelar termina hoje. Depois disso os dados são apagados e não é possível recuperar a conta.";
  }
  if (days === 1) {
    return "Falta 1 dia para os dados serem apagados definitivamente.";
  }
  return `Faltam ${days} dias para os dados serem apagados definitivamente.`;
}

export function AccountSettings() {
  const router = useRouter();
  const { refreshSession, session, setUnauthenticated } = useProductRuntime();
  const {
    accountDeletion,
    phase: statusPhase,
    refresh: refreshStatus,
  } = useSystemStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);

  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [requestingDeletionBusy, setRequestingDeletionBusy] = useState(false);
  const [requestingDeletionError, setRequestingDeletionError] = useState<
    string | null
  >(null);

  const [cancellingDeletion, setCancellingDeletion] = useState(false);
  const [cancellingDeletionBusy, setCancellingDeletionBusy] = useState(false);
  const [cancellingDeletionError, setCancellingDeletionError] = useState<
    string | null
  >(null);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formString(new FormData(event.currentTarget), "name").trim();
    if (!name) return;
    setNameBusy(true);
    setNameMessage(null);
    try {
      await getProductServices().account.updateProfile(name);
      await refreshSession();
      setNameMessage("Nome salvo.");
    } catch {
      setNameMessage("Não foi possível salvar o nome.");
    } finally {
      setNameBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = formString(data, "newPassword");
    const confirmPassword = formString(data, "confirmPassword");
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setMessage(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await getProductServices().auth.changePassword({
        currentPassword: formString(data, "currentPassword"),
        newPassword,
        confirmPassword,
      });
      form.reset();
      setMessage("Senha alterada.");
    } catch {
      setMessage("Não foi possível alterar a senha. Revise os dados.");
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
  async function logoutAllDevices() {
    setLoggingOutAll(true);
    setLogoutAllError(null);
    try {
      await getProductServices().auth.logoutAllDevices();
    } catch {
      setLoggingOutAll(false);
      setLogoutAllError(
        "Não foi possível encerrar o acesso nos outros aparelhos agora. Tente novamente.",
      );
      return;
    }
    setLoggingOutAll(false);
    setConfirmingLogoutAll(false);
    setUnauthenticated();
    router.replace("/login");
  }

  async function requestAccountDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = formString(new FormData(event.currentTarget), "password");
    setRequestingDeletionBusy(true);
    setRequestingDeletionError(null);
    try {
      await getProductServices().account.requestDeletion(password);
    } catch (error: unknown) {
      setRequestingDeletionBusy(false);
      setRequestingDeletionError(
        error instanceof BffHttpError && error.status === 401
          ? "Senha atual incorreta."
          : "Não foi possível pedir a exclusão agora. Tente novamente.",
      );
      return;
    }
    setRequestingDeletionBusy(false);
    setRequestingDeletion(false);
    // O pedido já foi aceito pelo servidor; reler `GET /v1/status` é o único
    // jeito de a tela mostrar o vencimento real sem inventar um estado local.
    refreshStatus();
  }

  async function cancelAccountDeletionRequest() {
    setCancellingDeletionBusy(true);
    setCancellingDeletionError(null);
    try {
      await getProductServices().account.cancelDeletion();
    } catch {
      setCancellingDeletionBusy(false);
      setCancellingDeletionError(
        "Não foi possível cancelar agora. Tente novamente.",
      );
      return;
    }
    setCancellingDeletionBusy(false);
    setCancellingDeletion(false);
    refreshStatus();
  }

  return (
    <SettingsPage title="Conta" description="Gerencie credenciais e acesso.">
      <div className="settings-stack">
        <section className="settings-panel">
          <div className="settings-panel-header">
            <div>
              <h2>Nome</h2>
              <p>
                {session?.user.name
                  ? "Como a Atendly chama você."
                  : "Adicione seu nome para a Atendly usar no cumprimento."}
              </p>
            </div>
          </div>
          <form
            className="settings-form-grid"
            onSubmit={(event) => void saveName(event)}
          >
            <label className="field">
              <span className="label">Nome</span>
              <input
                className="input"
                defaultValue={session?.user.name ?? ""}
                maxLength={120}
                name="name"
                required
                type="text"
              />
            </label>
            <SaveActions busy={nameBusy} message={nameMessage} label="Salvar nome" />
          </form>
        </section>
        <section className="settings-panel">
          <div className="settings-data-list">
            <div className="settings-data-row">
              <span>E-mail</span>
              <strong>{session?.user.email}</strong>
            </div>
          </div>
        </section>
        <form
          className="settings-panel"
          onSubmit={(event) => void changePassword(event)}
        >
          <div className="settings-form-grid">
            <Password name="currentPassword" label="Senha atual" />
            <Password name="newPassword" label="Nova senha" />
            <Password name="confirmPassword" label="Repita a nova senha" />
          </div>
          <SaveActions busy={busy} message={message} label="Alterar senha" />
        </form>
        <section className="settings-panel">
          <div className="settings-status-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void logout()}
            >
              Sair da conta
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setConfirmingLogoutAll(true)}
            >
              Sair de todos os dispositivos
            </button>
          </div>
        </section>
        <AccountDeletionSection
          accountDeletion={accountDeletion}
          onCancelOpen={() => setCancellingDeletion(true)}
          onRequestOpen={() => setRequestingDeletion(true)}
          statusPhase={statusPhase}
        />
      </div>
      <Dialog
        eyebrow="Sair de todos os dispositivos"
        onClose={() => {
          setConfirmingLogoutAll(false);
          setLogoutAllError(null);
        }}
        open={confirmingLogoutAll}
        title="Encerrar o acesso em todos os aparelhos?"
      >
        <p className="settings-modal-copy">
          Isso derruba o acesso em todos os aparelhos conectados, inclusive
          este. Você precisará entrar de novo para continuar usando a conta.
        </p>
        {logoutAllError && (
          <p className="field-help" role="alert">
            {logoutAllError}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={loggingOutAll}
            type="button"
            onClick={() => {
              setConfirmingLogoutAll(false);
              setLogoutAllError(null);
            }}
          >
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            disabled={loggingOutAll}
            type="button"
            onClick={() => void logoutAllDevices()}
          >
            {loggingOutAll ? "Saindo..." : "Sair de todos os dispositivos"}
          </button>
        </div>
      </Dialog>
      <Dialog
        eyebrow="Excluir conta"
        onClose={() => {
          setRequestingDeletion(false);
          setRequestingDeletionError(null);
        }}
        open={requestingDeletion}
        title="Excluir sua conta?"
      >
        <ul className="settings-modal-list">
          <li>As automações são desligadas agora.</li>
          <li>O WhatsApp é desconectado agora.</li>
          <li>Você tem sete dias para cancelar a exclusão.</li>
          <li>
            Depois desse prazo, os dados são apagados e não é possível
            recuperar.
          </li>
        </ul>
        <form onSubmit={(event) => void requestAccountDeletion(event)}>
          <Password name="password" label="Senha atual" />
          {requestingDeletionError && (
            <p className="field-help" role="alert">
              {requestingDeletionError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              disabled={requestingDeletionBusy}
              type="button"
              onClick={() => {
                setRequestingDeletion(false);
                setRequestingDeletionError(null);
              }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-danger"
              disabled={requestingDeletionBusy}
              type="submit"
            >
              {requestingDeletionBusy ? "Pedindo exclusão..." : "Pedir exclusão"}
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        eyebrow="Cancelar exclusão"
        onClose={() => {
          setCancellingDeletion(false);
          setCancellingDeletionError(null);
        }}
        open={cancellingDeletion}
        title="Cancelar a exclusão da conta?"
      >
        <p className="settings-modal-copy">
          O WhatsApp e a IA não voltam a funcionar sozinhos. Para voltar a
          operar, reconecte o WhatsApp e refaça o teste real de ativação.
        </p>
        {cancellingDeletionError && (
          <p className="field-help" role="alert">
            {cancellingDeletionError}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={cancellingDeletionBusy}
            type="button"
            onClick={() => {
              setCancellingDeletion(false);
              setCancellingDeletionError(null);
            }}
          >
            Voltar
          </button>
          <button
            className="btn btn-primary"
            disabled={cancellingDeletionBusy}
            type="button"
            onClick={() => void cancelAccountDeletionRequest()}
          >
            {cancellingDeletionBusy ? "Cancelando..." : "Cancelar exclusão"}
          </button>
        </div>
      </Dialog>
    </SettingsPage>
  );
}

type AccountDeletionSummary = { status: string; dueAt: string | null } | null;

/**
 * A zona de risco de Excluir conta, com quatro leituras do mesmo
 * `GET /v1/status`: carregando, indisponível, sem pedido (ou cancelado, que
 * admite pedir de novo) e agendado. Nunca assume "sem pedido" enquanto a
 * primeira leitura não chegou — isso esconderia uma exclusão já agendada.
 */
function AccountDeletionSection({
  accountDeletion,
  onCancelOpen,
  onRequestOpen,
  statusPhase,
}: {
  accountDeletion: AccountDeletionSummary;
  onCancelOpen: () => void;
  onRequestOpen: () => void;
  statusPhase: "error" | "loaded" | "loading";
}) {
  if (!accountDeletion && statusPhase === "loading") {
    return (
      <section
        aria-hidden="true"
        className="settings-panel settings-danger-zone"
      >
        <div className="settings-panel-header">
          <div>
            <h2>Excluir conta</h2>
            <p>Carregando o estado da exclusão...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!accountDeletion) {
    return (
      <section className="settings-panel settings-danger-zone">
        <div className="settings-panel-header">
          <div>
            <h2>Excluir conta</h2>
            <p role="alert">
              Não foi possível carregar o estado da exclusão agora. Atualize a
              página e tente de novo.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (accountDeletion.status === "SCHEDULED" && accountDeletion.dueAt) {
    const days = accountDeletionDaysRemaining(accountDeletion.dueAt);
    return (
      <section className="settings-panel settings-danger-zone">
        <div className="settings-panel-header">
          <div>
            <h2>Exclusão da conta agendada</h2>
            <p role="status">{daysRemainingCopy(days)}</p>
          </div>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onCancelOpen}
        >
          Cancelar exclusão
        </button>
      </section>
    );
  }

  if (accountDeletion.status === "PURGED") {
    return (
      <section className="settings-panel settings-danger-zone">
        <div className="settings-panel-header">
          <div>
            <h2>Conta excluída</h2>
            <p>Os dados desta conta já foram apagados.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-panel settings-danger-zone">
      <div className="settings-panel-header">
        <div>
          <h2>Excluir conta</h2>
          <p>
            Encerre o uso da Atendly. Automações e WhatsApp são desligados na
            hora, e você tem sete dias para cancelar antes de os dados serem
            apagados sem volta.
          </p>
        </div>
      </div>
      <button className="btn btn-danger" type="button" onClick={onRequestOpen}>
        Excluir conta
      </button>
    </section>
  );
}
