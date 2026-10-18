"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

import { PASSWORD_POLICY_RULES } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import {
  accountDeletionDaysRemaining,
  useSystemStatus,
} from "@/shared/runtime/systemStatus";
import { Dialog } from "@/shared/ui/Dialog";
import { showToast } from "@/shared/ui/toastBus";

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
  const [sheet, setSheet] = useState<"name" | "password" | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);

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
      setNameMessage(null);
      setSavedMessage("Nome salvo.");
      showToast("Nome salvo.");
      setSheet(null);
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
      setMessage(null);
      setSavedMessage("Senha alterada.");
      setSheet(null);
    } catch {
      setMessage("Não foi possível alterar a senha. Revise os dados.");
    } finally {
      setBusy(false);
    }
  }
  function openSheet(next: "name" | "password") {
    setNameMessage(null);
    setMessage(null);
    setSavedMessage(null);
    setSheet(next);
  }

  function closeSheet() {
    if (nameBusy || busy) return;
    setSheet(null);
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
      <div className="account-screen">
        <AccountGroup title="Seus dados">
          <button
            className="business-row"
            type="button"
            onClick={() => openSheet("name")}
          >
            <span className="business-row-label">Nome</span>
            <span
              className={`business-row-value${session?.user.name ? "" : " is-empty"}`}
            >
              {session?.user.name ?? "Adicionar"}
              <Icon name="chevron-right" />
            </span>
          </button>
          <div className="business-row">
            <span className="business-row-label">E-mail</span>
            <span className="business-row-value">{session?.user.email}</span>
          </div>
          <button
            className="business-row"
            type="button"
            onClick={() => openSheet("password")}
          >
            <span className="business-row-label">Senha</span>
            <span className="business-row-value">
              <Icon name="chevron-right" />
            </span>
          </button>
        </AccountGroup>
        {savedMessage && (
          <p className="field-help" role="status">
            {savedMessage}
          </p>
        )}
        <AccountGroup title="Segurança">
          <div className="business-row">
            <span className="business-row-label" id="account-logout-all-label">
              Sair de todos os dispositivos
            </span>
            <button
              aria-describedby="account-logout-all-label"
              className="account-action"
              type="button"
              onClick={() => setConfirmingLogoutAll(true)}
            >
              Sair
            </button>
          </div>
        </AccountGroup>
        <AccountGroup title="Sobre">
          <Link className="business-row" href="/termos-de-uso">
            <span className="business-row-label">Termos de Uso</span>
            <span className="business-row-value">
              <Icon name="chevron-right" />
            </span>
          </Link>
          <Link className="business-row" href="/politica-de-privacidade">
            <span className="business-row-label">Política de Privacidade</span>
            <span className="business-row-value">
              <Icon name="chevron-right" />
            </span>
          </Link>
        </AccountGroup>
        <div className="account-danger">
          <AccountDeletionSection
            accountDeletion={accountDeletion}
            onCancelOpen={() => setCancellingDeletion(true)}
            statusPhase={statusPhase}
          />
        </div>
      </div>
      <Dialog
        onClose={closeSheet}
        open={sheet === "name"}
        title="Nome"
        variant="sheet"
      >
        <form
          className="settings-form-grid"
          onSubmit={(event) => void saveName(event)}
        >
          <p className="settings-modal-copy">
            {session?.user.name
              ? "Como a Avenly chama você."
              : "Adicione seu nome para a Avenly usar no cumprimento."}
          </p>
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
          <SaveActions
            busy={nameBusy}
            message={nameMessage}
            label="Salvar nome"
          />
        </form>
      </Dialog>
      <Dialog
        onClose={closeSheet}
        open={sheet === "password"}
        title="Senha"
        variant="sheet"
      >
        <form
          className="settings-form-grid"
          onSubmit={(event) => void changePassword(event)}
        >
          <Password name="currentPassword" label="Senha atual" />
          <Password name="newPassword" label="Nova senha" />
          <Password name="confirmPassword" label="Repita a nova senha" />
          <SaveActions busy={busy} message={message} label="Alterar senha" />
        </form>
      </Dialog>
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

function AccountGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="business-group">
      <h2 className="business-group-title">{title}</h2>
      {children}
    </section>
  );
}

type AccountDeletionSummary = { status: string; dueAt: string | null } | null;

/**
 * A área de atenção de Excluir conta, com quatro leituras do mesmo
 * `GET /v1/status`: carregando, indisponível, sem pedido (ou cancelado, que
 * admite pedir de novo) e agendado. Nunca assume "sem pedido" enquanto a
 * primeira leitura não chegou — isso esconderia uma exclusão já agendada.
 */
function AccountDeletionSection({
  accountDeletion,
  onCancelOpen,
  statusPhase,
}: {
  accountDeletion: AccountDeletionSummary;
  onCancelOpen: () => void;
  statusPhase: "error" | "loading" | "loaded";
}) {
  if (!accountDeletion && statusPhase === "loading") {
    return (
      <section aria-hidden="true" className="account-danger-card">
        <div className="account-danger-copy">
          <h2>Excluir conta</h2>
          <p>Carregando o estado da exclusão...</p>
        </div>
      </section>
    );
  }

  if (!accountDeletion) {
    return (
      <section className="account-danger-card">
        <div className="account-danger-copy">
          <h2>Excluir conta</h2>
          <p role="alert">
            Não foi possível carregar o estado da exclusão agora. Atualize a
            página e tente de novo.
          </p>
        </div>
      </section>
    );
  }

  if (accountDeletion.status === "SCHEDULED" && accountDeletion.dueAt) {
    const days = accountDeletionDaysRemaining(accountDeletion.dueAt);
    return (
      <section className="account-danger-card is-stacked">
        <div className="account-danger-copy">
          <h2>Exclusão da conta agendada</h2>
          <p role="status">{daysRemainingCopy(days)}</p>
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
      <section className="account-danger-card">
        <div className="account-danger-copy">
          <h2>Conta excluída</h2>
          <p>Os dados desta conta já foram apagados.</p>
        </div>
      </section>
    );
  }

  return (
    <Link
      className="account-danger-card is-action"
      href="/configuracoes/conta/excluir"
    >
      <span className="account-danger-copy">
        <span className="account-danger-title">Excluir conta</span>
        <span className="account-danger-detail">
          Você tem 7 dias para desistir
        </span>
      </span>
      <Icon name="chevron-right" />
    </Link>
  );
}
