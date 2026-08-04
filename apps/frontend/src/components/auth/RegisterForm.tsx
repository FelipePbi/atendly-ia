"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(true);
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
      setError("As senhas não conferem.");
      return;
    }

    if (!acceptedTerms) {
      setError("Aceite os Termos de Uso e a Política de Privacidade para continuar.");
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
      setError(data.error ?? "Não foi possível criar sua conta.");
      setLoading(false);
      return;
    }

    router.replace("/onboarding");
  }

  return (
    <AuthCard
      mode="register"
      kicker="Comece agora"
      title="Crie sua conta"
      subtitle="Configure seu negócio e conecte o WhatsApp em poucos minutos."
      mobileTitle="Criar conta"
      mobileSubtitle="Configure o negócio e conecte seu WhatsApp."
      storyTitle="Seu atendimento começa com uma boa conversa."
      footer={
        <>
          Já possui uma conta?{" "}
          <Link className="auth-card__link" href="/login">
            Entrar
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <FormField
          id="register-email"
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
          id="register-password"
          label="Senha"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          icon={<LockKeyhole aria-hidden="true" />}
          required
        />
        <FormField
          id="register-confirm-password"
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          placeholder="Repita sua senha"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          icon={<LockKeyhole aria-hidden="true" />}
          required
        />
        <label className="auth-form__terms">
          <input
            className="ui-checkbox"
            type="checkbox"
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
          />
          <span>Concordo com os Termos de Uso e a Política de Privacidade.</span>
        </label>
        {error ? (
          <p className="auth-form__error" role="alert">
            {error}
          </p>
        ) : null}
        <Button fullWidth type="submit" disabled={loading} icon={<ArrowRight size={20} aria-hidden="true" />}>
          {loading ? "Criando..." : "Criar conta"}
        </Button>
      </form>
    </AuthCard>
  );
}
