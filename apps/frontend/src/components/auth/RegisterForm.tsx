"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { useRegistrationDraft } from "@/components/auth/RegistrationDraftProvider";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { CURRENT_LEGAL_VERSIONS } from "@/config/legal-versions";

export const TERMS_ERROR_MESSAGE = "Você precisa aceitar os Termos de Uso para criar sua conta.";

export function RegisterForm() {
  const router = useRouter();
  const { draft, updateDraft, clearDraft, markLegalNavigationFromRegistration } = useRegistrationDraft();
  const [error, setError] = useState("");
  const [termsError, setTermsError] = useState("");
  const [loading, setLoading] = useState(false);
  const termsRef = useRef<HTMLInputElement>(null);

  function focusTermsError() {
    requestAnimationFrame(() => termsRef.current?.focus());
  }

  function handleLegalLinkClick() {
    markLegalNavigationFromRegistration();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setTermsError("");

    if (!draft.termsAccepted) {
      setTermsError(TERMS_ERROR_MESSAGE);
      focusTermsError();
      return;
    }

    if (draft.password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (draft.password !== draft.confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: draft.email,
        password: draft.password,
        confirmPassword: draft.confirmPassword,
        termsAccepted: draft.termsAccepted,
        ...CURRENT_LEGAL_VERSIONS,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Não foi possível criar sua conta.");
      setLoading(false);
      return;
    }

    clearDraft();
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
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <FormField
          id="register-email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com"
          value={draft.email}
          onChange={(event) => updateDraft({ email: event.target.value })}
          icon={<Mail aria-hidden="true" />}
          required
        />
        <FormField
          id="register-password"
          label="Senha"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={draft.password}
          onChange={(event) => updateDraft({ password: event.target.value })}
          icon={<LockKeyhole aria-hidden="true" />}
          required
        />
        <FormField
          id="register-confirm-password"
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          placeholder="Repita sua senha"
          value={draft.confirmPassword}
          onChange={(event) => updateDraft({ confirmPassword: event.target.value })}
          icon={<LockKeyhole aria-hidden="true" />}
          required
        />

        <div className="auth-form__terms-field" data-invalid={Boolean(termsError)}>
          <span className="auth-form__terms-target">
            <input
              ref={termsRef}
              id="register-terms"
              className="ui-checkbox"
              type="checkbox"
              checked={draft.termsAccepted}
              onChange={(event) => {
                updateDraft({ termsAccepted: event.target.checked });
                if (event.target.checked) setTermsError("");
              }}
              aria-invalid={Boolean(termsError)}
              aria-describedby={termsError ? "register-terms-error" : undefined}
              aria-label="Li e concordo com os Termos de Uso e declaro que li a Política de Privacidade."
              required
            />
          </span>
          <p id="register-terms-label" className="auth-form__terms-copy">
            <label htmlFor="register-terms">Li e concordo com os </label>
            <Link href="/termos-de-uso" onClick={handleLegalLinkClick}>
              Termos de Uso
            </Link>
            <label htmlFor="register-terms"> e declaro que li a </label>
            <Link href="/politica-de-privacidade" onClick={handleLegalLinkClick}>
              Política de Privacidade
            </Link>
            .
          </p>
          {termsError ? (
            <p className="auth-form__terms-error" id="register-terms-error" role="alert" aria-live="assertive">
              {termsError}
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="auth-form__error" role="alert" aria-live="assertive">
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
