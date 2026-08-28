"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Brand } from "@/shared/ui/Brand";
import { Icon } from "@/shared/icons/Icon";
import { mockServices } from "@/mocks";

export type AuthScenario =
  | "login"
  | "signup"
  | "signup-errors"
  | "forgot-password"
  | "request-sent"
  | "new-password"
  | "link-expired";

const story: Record<
  AuthScenario,
  { eyebrow: string; title: string; copy: string }
> = {
  login: {
    eyebrow: "Atendimento que vira agenda",
    title: "Seu negócio em movimento, sem perder conversas.",
    copy: "Centralize atendimento e agendamentos com uma rotina simples, clara e confiável.",
  },
  signup: {
    eyebrow: "Comece pelo essencial",
    title: "Menos tempo respondendo. Mais tempo atendendo.",
    copy: "Crie sua conta agora. A configuração do negócio acontece depois, passo a passo.",
  },
  "signup-errors": {
    eyebrow: "Cadastro simples",
    title: "Corrija o necessário e siga em frente.",
    copy: "Mensagens próximas aos campos ajudam você a resolver cada pendência.",
  },
  "forgot-password": {
    eyebrow: "Recupere seu acesso",
    title: "Volte à sua rotina com segurança.",
    copy: "Enviaremos instruções para o e-mail usado na sua conta.",
  },
  "request-sent": {
    eyebrow: "Acesso protegido",
    title: "Um passo seguro para voltar.",
    copy: "O link temporário evita alterações não autorizadas na sua conta.",
  },
  "new-password": {
    eyebrow: "Nova senha",
    title: "Proteja seu acesso e continue.",
    copy: "Escolha uma senha diferente da anterior.",
  },
  "link-expired": {
    eyebrow: "Proteção da conta",
    title: "Links temporários mantêm seu acesso seguro.",
    copy: "Solicite outro link para continuar a recuperação.",
  },
};

function AuthLayout({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: AuthScenario;
}) {
  const current = story[scenario];
  return (
    <main className="auth-layout">
      <aside className="auth-brand-panel" aria-label="Atendly">
        <Brand href="/login" />
        <div className="auth-story">
          <p className="eyebrow">{current.eyebrow}</p>
          <h2>{current.title}</h2>
          <p>{current.copy}</p>
        </div>
        <div className="auth-flow" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        {(scenario === "login" || scenario === "signup") && (
          <p className="auth-trust">
            <Icon name="shield" />
            {scenario === "signup"
              ? "Seus dados protegidos desde o primeiro acesso"
              : "Acesso protegido à sua operação"}
          </p>
        )}
      </aside>
      <section className="auth-main">{children}</section>
    </main>
  );
}

function PasswordField({
  id,
  label,
  error,
  help,
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className={`field${error ? " field-error" : ""}`}>
      <span className="label">{label}</span>
      <span className="input-wrap">
        <input
          id={id}
          className="input input-with-action"
          type={visible ? "text" : "password"}
          autoComplete={
            id === "login-password" ? "current-password" : "new-password"
          }
          minLength={8}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error || help ? `${id}-help` : undefined}
          defaultValue={error ? "12345" : undefined}
        />
        <button
          className="field-action"
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          <Icon name="eye" />
        </button>
      </span>
      {(error || help) && (
        <span className="field-help" id={`${id}-help`}>
          {error ?? help}
        </span>
      )}
    </label>
  );
}

export function AuthScreen({ scenario }: { scenario: AuthScenario }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    destination: string,
  ) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setLoading(true);
    await mockServices.auth.submit(scenario);
    router.push(destination);
  }

  if (scenario === "request-sent" || scenario === "link-expired") {
    const expired = scenario === "link-expired";
    return (
      <AuthLayout scenario={scenario}>
        <div className="auth-card auth-state">
          <span className={`state-icon${expired ? " is-error" : ""}`}>
            <Icon name={expired ? "alert" : "check"} />
          </span>
          <h1>{expired ? "Este link expirou" : "Confira seu e-mail"}</h1>
          <p>
            {expired
              ? "Por segurança, links de recuperação deixam de funcionar depois de um período. Solicite um novo para criar sua senha."
              : "Se houver uma conta associada ao endereço informado, você receberá um link para criar uma nova senha."}
          </p>
          <Link
            className="btn btn-primary"
            href={expired ? "/recuperar-senha" : "/login"}
          >
            {expired ? "Solicitar novo link" : "Voltar para entrar"}
          </Link>
          <p className="auth-footer">
            {expired ? (
              <Link className="auth-link" href="/login">
                Voltar para entrar
              </Link>
            ) : (
              <>
                Não recebeu? Verifique spam ou{" "}
                <Link className="auth-link" href="/recuperar-senha">
                  tente novamente
                </Link>
                .
              </>
            )}
          </p>
        </div>
      </AuthLayout>
    );
  }

  const signup = scenario === "signup" || scenario === "signup-errors";
  const errors = scenario === "signup-errors";
  const forgot = scenario === "forgot-password";
  const newPassword = scenario === "new-password";
  const title = errors
    ? "Revise seus dados"
    : signup
      ? "Crie sua conta"
      : forgot
        ? "Esqueceu sua senha?"
        : newPassword
          ? "Crie uma nova senha"
          : "Boas-vindas de volta";
  const subtitle = errors
    ? "Encontramos duas informações que precisam de ajuste."
    : signup
      ? "Use seus dados de acesso. Informações do negócio vêm na próxima etapa."
      : forgot
        ? "Digite seu e-mail para receber um link de recuperação."
        : newPassword
          ? "Use pelo menos 8 caracteres."
          : "Entre para acompanhar conversas e agendamentos.";
  const destination = signup
    ? "/onboarding/dados-do-negocio"
    : forgot
      ? "/solicitacao-enviada"
      : newPassword
        ? "/login"
        : "/inicio";
  const submitLabel = errors
    ? "Revisar e criar conta"
    : signup
      ? "Criar conta"
      : forgot
        ? "Enviar link de recuperação"
        : newPassword
          ? "Salvar nova senha"
          : "Entrar";

  return (
    <AuthLayout scenario={scenario}>
      <div className="auth-card">
        {(signup || forgot) && (
          <Link className="auth-back" href="/login">
            ← Voltar para entrar
          </Link>
        )}
        <header className="auth-heading">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>
        {errors && (
          <div className="auth-inline-alert" role="alert">
            <Icon name="alert" />
            <div>
              <strong>Não foi possível criar sua conta</strong>Corrija os campos
              indicados abaixo.
            </div>
          </div>
        )}
        <form
          className="auth-form"
          style={errors ? { marginTop: 18 } : undefined}
          onSubmit={(event) => submit(event, destination)}
          noValidate
        >
          {!newPassword && (
            <label className={`field${errors ? " field-error" : ""}`}>
              <span className="label">E-mail</span>
              <input
                className="input"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@seunegocio.com.br"
                required
                aria-invalid={errors || undefined}
                aria-describedby={errors ? "email-error" : undefined}
                defaultValue={errors ? "felipe@" : undefined}
              />
              {errors && (
                <span id="email-error" className="field-help">
                  Digite um e-mail completo, como nome@empresa.com.br.
                </span>
              )}
            </label>
          )}
          {!forgot && (
            <PasswordField
              id={
                newPassword
                  ? "new-password"
                  : signup
                    ? "signup-password"
                    : "login-password"
              }
              label={
                newPassword ? "Nova senha" : signup ? "Crie uma senha" : "Senha"
              }
              error={
                errors
                  ? "Sua senha precisa ter pelo menos 8 caracteres."
                  : undefined
              }
              help={
                scenario === "signup"
                  ? "Use pelo menos 8 caracteres."
                  : undefined
              }
            />
          )}
          {newPassword && (
            <PasswordField id="confirm-password" label="Repita a nova senha" />
          )}
          {scenario === "login" && (
            <div className="auth-row">
              <label className="check">
                <input type="checkbox" name="remember" />
                <span className="check-box" aria-hidden="true" />
                <span className="small">Manter acesso neste dispositivo</span>
              </label>
              <Link className="auth-link" href="/recuperar-senha">
                Esqueci minha senha
              </Link>
            </div>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            aria-busy={loading}
          >
            {loading && <span className="spinner" />}
            <span>{loading ? `${submitLabel}...` : submitLabel}</span>
          </button>
        </form>
        {signup && !errors && (
          <p className="auth-legal">
            Ao criar sua conta, você concorda com os{" "}
            <Link href="/termos-de-uso">Termos de Uso</Link> e a{" "}
            <Link href="/politica-de-privacidade">Política de Privacidade</Link>
            .
          </p>
        )}
        {!forgot && !newPassword && !errors && (
          <p className="auth-footer">
            {signup ? (
              <>
                Já tem conta?{" "}
                <Link className="auth-link" href="/login">
                  Entrar
                </Link>
              </>
            ) : (
              <>
                Ainda não tem conta?{" "}
                <Link className="auth-link" href="/cadastro">
                  Criar conta
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
