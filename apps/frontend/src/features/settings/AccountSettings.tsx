"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { getProductServices, useProductRuntime } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import { formString, Password, SaveActions } from "./shared/fields";
import { SettingsPage } from "./shared/SettingsPage";

export function AccountSettings() {
  const router = useRouter();
  const { session, setUnauthenticated } = useProductRuntime();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage(null);
    try {
      await getProductServices().auth.changePassword({
        currentPassword: formString(data, "currentPassword"),
        newPassword: formString(data, "newPassword"),
        confirmPassword: formString(data, "confirmPassword"),
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
  return (
    <SettingsPage title="Conta" description="Gerencie credenciais e acesso.">
      <div className="settings-stack">
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
        <section className="settings-panel settings-danger-zone">
          <div className="settings-panel-header">
            <div>
              <h2>Excluir conta</h2>
              <p>
                A exclusão de conta faz parte de uma etapa futura do produto e
                ainda não está disponível.
              </p>
            </div>
          </div>
          <button className="btn btn-danger" disabled type="button">
            Exclusão indisponível
          </button>
        </section>
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
    </SettingsPage>
  );
}
