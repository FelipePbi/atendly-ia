"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (newPassword !== confirmPassword) {
      setError("As senhas nao conferem.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("A nova senha precisa ser diferente da senha atual.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Nao foi possivel trocar a senha.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("Senha atualizada com sucesso.");
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-brand" aria-hidden="true" />
        <h2 className="text-base font-black text-foreground">Trocar senha</h2>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-foreground">Senha atual</span>
        <input
          className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-foreground">Nova senha</span>
        <input
          className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-foreground">Confirmar nova senha</span>
        <input
          className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </label>
      {error ? <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {message ? <p className="rounded-md bg-brand/10 px-3 py-2 text-sm text-brand-strong">{message}</p> : null}
      <button
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-bold text-white transition hover:bg-foreground/90 disabled:opacity-60"
        type="submit"
        disabled={loading}
      >
        {loading ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
