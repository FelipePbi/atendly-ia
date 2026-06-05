"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas nao conferem.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, confirmPassword }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Nao foi possivel criar sua conta.");
      setLoading(false);
      return;
    }

    router.replace("/onboarding");
  }

  return (
    <AuthCard
      title="Criar conta"
      subtitle="Crie sua conta para configurar o negocio e conectar o WhatsApp."
      footer={
        <>
          Ja tem conta?{" "}
          <Link className="font-semibold text-brand-strong" href="/login">
            Entrar
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-foreground">Email</span>
          <input
            className="mt-2 h-12 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground">Senha</span>
          <input
            className="mt-2 h-12 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground">Confirmar senha</span>
          <input
            className="mt-2 h-12 w-full rounded-md border border-border bg-white px-3 text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}
        <button
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-base font-bold text-white transition hover:bg-brand-strong disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          <UserPlus className="h-5 w-5" aria-hidden="true" />
          {loading ? "Criando..." : "Criar conta"}
        </button>
      </form>
    </AuthCard>
  );
}
