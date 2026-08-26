"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { postAuthPath } from "@/lib/post-auth";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setError(data?.error ?? "Credenciais inválidas. Verifique email e senha.");
      setLoading(false);
      return;
    }

    const me = await fetch("/api/auth/me", { cache: "no-store" }).then((res) => res.json());
    router.replace(postAuthPath(me));
  }

  return (
    <AuthCard
      mode="login"
      kicker="Bem-vindo de volta"
      title="Entre na sua conta"
      subtitle="Acompanhe conversas e mantenha seu atendimento sempre em movimento."
      mobileTitle="Entrar"
      mobileSubtitle="Acesse suas conversas e configurações."
      storyTitle="Atenda melhor. Converta mais."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link className="auth-card__link" href="/cadastro">
            Criar conta
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <FormField
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          icon={<Mail aria-hidden="true" />}
          required
        />
        <FormField
          id="login-password"
          label="Senha"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          icon={<LockKeyhole aria-hidden="true" />}
          required
        />
        <div className="auth-form__meta">
          <label className="auth-form__remember">
            <input
              className="ui-checkbox"
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Lembrar de mim
          </label>
          <Link className="auth-card__link type-caption" href="/login">
            Esqueci minha senha
          </Link>
        </div>
        {error ? (
          <p className="auth-form__error" role="alert">
            {error}
          </p>
        ) : null}
        <Button fullWidth type="submit" disabled={loading} icon={<ArrowRight size={20} aria-hidden="true" />}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </AuthCard>
  );
}
