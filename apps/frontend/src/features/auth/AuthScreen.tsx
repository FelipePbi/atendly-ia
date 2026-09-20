"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useReducer, useState } from "react";

import { CURRENT_LEGAL_VERSIONS } from "@/config/legal-versions";
import { BffHttpError } from "@/data";
import {
  initialRecoveryState,
  recoveryReducer,
} from "@/features/auth/recoveryMachine";
import { Icon } from "@/shared/icons/Icon";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { Brand } from "@/shared/ui/Brand";

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
    copy: "Um passo a passo simples para criar uma nova senha.",
  },
  "request-sent": {
    eyebrow: "Acesso protegido",
    title: "Prontinho para continuar.",
    copy: "Sua nova senha já está pronta para uso.",
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
          name={id}
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
  const { refreshSession } = useProductRuntime();
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (scenario === "signup-errors") {
      initial.email = "Digite um e-mail completo, como nome@empresa.com.br.";
      initial["signup-password"] =
        "Sua senha precisa ter pelo menos 8 caracteres.";
    }
    return initial;
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const auth = getProductServices().auth;
      if (scenario === "signup") {
        const password = formString(data, "signup-password");
        const confirmPassword = formString(data, "confirm-password");
        await auth.register({
          email: formString(data, "email"),
          password,
          confirmPassword,
          termsAccepted: true,
          ...CURRENT_LEGAL_VERSIONS,
        });
        await refreshSession();
        router.push("/onboarding");
      } else if (scenario === "login") {
        await auth.login({
          email: formString(data, "email"),
          password: formString(data, "login-password"),
        });
        const session = await refreshSession();
        router.push(session?.onboardingCompleted ? "/inicio" : "/onboarding");
      } else if (scenario === "new-password") {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) {
          router.push("/link-expirado");
          return;
        }
        await auth.resetPassword({
          token,
          newPassword: formString(data, "new-password"),
          confirmPassword: formString(data, "confirm-password"),
        });
        router.push("/login");
      }
    } catch (error: unknown) {
      if (
        scenario === "new-password" &&
        error instanceof BffHttpError &&
        error.code === "VALIDATION_ERROR"
      ) {
        // Token de reset inválido ou expirado: a tela dedicada já explica o
        // motivo e oferece o próximo passo, então não há campo para apontar.
        router.push("/link-expirado");
        return;
      }
      const mapped = mapAuthError(error, scenario);
      setFieldErrors(mapped.fieldErrors);
      setSubmitError(mapped.formError ?? null);
    } finally {
      setLoading(false);
    }
  }

  if (scenario === "forgot-password") return <RecoveryFlow />;

  if (scenario === "request-sent" || scenario === "link-expired") {
    const expired = scenario === "link-expired";
    return (
      <AuthLayout scenario={scenario}>
        <div className="auth-card auth-state">
          <span className={`state-icon${expired ? " is-error" : ""}`}>
            <Icon name={expired ? "alert" : "check"} />
          </span>
          <h1>{expired ? "Este link expirou" : "Senha redefinida"}</h1>
          <p>
            {expired
              ? "Por segurança, links de recuperação deixam de funcionar depois de um período. Solicite um novo para criar sua senha."
              : "Você já pode entrar na Atendly com sua nova senha."}
          </p>
          <Link
            className="btn btn-primary"
            href={expired ? "/recuperar-senha" : "/login"}
          >
            {expired ? "Solicitar novo link" : "Ir para entrar"}
          </Link>
          {expired && (
            <p className="auth-footer">
              <Link className="auth-link auth-link--standalone" href="/login">
                Voltar para entrar
              </Link>
            </p>
          )}
        </div>
      </AuthLayout>
    );
  }

  const signup = scenario === "signup" || scenario === "signup-errors";
  const errors = scenario === "signup-errors";
  const newPassword = scenario === "new-password";
  const passwordFieldId = newPassword
    ? "new-password"
    : signup
      ? "signup-password"
      : "login-password";
  const title = errors
    ? "Revise seus dados"
    : signup
      ? "Crie sua conta"
      : newPassword
        ? "Crie uma nova senha"
        : "Boas-vindas de volta";
  const subtitle = errors
    ? "Encontramos duas informações que precisam de ajuste."
    : signup
      ? "Use seus dados de acesso. Informações do negócio vêm na próxima etapa."
      : newPassword
        ? "Use pelo menos 8 caracteres."
        : "Entre para acompanhar conversas e agendamentos.";
  const submitLabel = errors
    ? "Revisar e criar conta"
    : signup
      ? "Criar conta"
      : newPassword
        ? "Salvar nova senha"
        : "Entrar";

  return (
    <AuthLayout scenario={scenario}>
      <div className="auth-card">
        {signup && (
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
        {submitError && (
          <div className="auth-inline-alert" role="alert">
            <Icon name="alert" />
            <div>
              <strong>Não foi possível continuar</strong>
              {submitError}
            </div>
          </div>
        )}
        <form
          className="auth-form"
          style={errors ? { marginTop: 18 } : undefined}
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          {!newPassword && (
            <label
              className={`field${fieldErrors.email ? " field-error" : ""}`}
            >
              <span className="label">E-mail</span>
              <input
                className="input"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@seunegocio.com.br"
                required
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                defaultValue={errors ? "felipe@" : undefined}
              />
              {fieldErrors.email && (
                <span id="email-error" className="field-help">
                  {fieldErrors.email}
                </span>
              )}
            </label>
          )}
          <PasswordField
            id={passwordFieldId}
            label={
              newPassword ? "Nova senha" : signup ? "Crie uma senha" : "Senha"
            }
            error={fieldErrors[passwordFieldId]}
            help={
              scenario === "signup" ? "Use pelo menos 8 caracteres." : undefined
            }
          />
          {(newPassword || signup) && (
            <PasswordField
              id="confirm-password"
              label="Repita a nova senha"
              error={fieldErrors["confirm-password"]}
            />
          )}
          {signup && (
            <label className="check">
              <input name="terms" type="checkbox" required />
              <span className="check-box" aria-hidden="true" />
              <span className="small">
                Li e aceito os <Link href="/termos-de-uso">Termos de Uso</Link>{" "}
                e a{" "}
                <Link href="/politica-de-privacidade">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>
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
        {!newPassword && !errors && (
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

/**
 * Recuperação de senha visual (G-34): e-mail → código → nova senha → sucesso,
 * sem tocar em `/v1/auth/forgot-password`. A máquina de estados fica em
 * `recoveryMachine.ts`, pura e testada isoladamente; este componente só lê o
 * passo atual e decide o que desenhar.
 */
function RecoveryFlow() {
  const router = useRouter();
  const [state, dispatch] = useReducer(recoveryReducer, initialRecoveryState);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    const email = formString(new FormData(event.currentTarget), "email");
    setFieldError(null);
    dispatch({ type: "SUBMIT_EMAIL", email });
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = formString(new FormData(event.currentTarget), "code");
    if (!/^\d{6}$/.test(code)) {
      setFieldError("Digite os 6 dígitos do código.");
      return;
    }
    setFieldError(null);
    dispatch({ type: "SUBMIT_CODE" });
  }

  function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    const data = new FormData(event.currentTarget);
    const password = formString(data, "new-password");
    const confirmPassword = formString(data, "confirm-password");
    if (password !== confirmPassword) {
      setFieldError("As senhas precisam ser iguais.");
      return;
    }
    setFieldError(null);
    dispatch({ type: "SUBMIT_NEW_PASSWORD" });
    router.push("/solicitacao-enviada");
  }

  const backButtonStyle = { background: "none", border: 0, padding: 0 };

  if (state.step === "done") {
    // O passo seguinte já disparou a navegação para /solicitacao-enviada;
    // nada para desenhar aqui além de evitar um flash da tela de e-mail.
    return null;
  }

  if (state.step === "code") {
    return (
      <AuthLayout scenario="forgot-password">
        <div className="auth-card">
          <button
            className="auth-back"
            onClick={() => dispatch({ type: "BACK" })}
            style={backButtonStyle}
            type="button"
          >
            ← Alterar e-mail
          </button>
          <header className="auth-heading">
            <h1>Digite o código</h1>
            <p>Informe o código de verificação de 6 dígitos para continuar.</p>
          </header>
          <form className="auth-form" onSubmit={submitCode} noValidate>
            <label className={`field${fieldError ? " field-error" : ""}`}>
              <span className="label">Código</span>
              <input
                aria-describedby={fieldError ? "code-error" : undefined}
                aria-invalid={fieldError ? true : undefined}
                autoComplete="one-time-code"
                className="input"
                inputMode="numeric"
                maxLength={6}
                name="code"
                placeholder="000000"
                required
              />
              {fieldError && (
                <span className="field-help" id="code-error">
                  {fieldError}
                </span>
              )}
            </label>
            <button className="btn btn-primary" type="submit">
              Continuar
            </button>
          </form>
        </div>
      </AuthLayout>
    );
  }

  if (state.step === "new-password") {
    return (
      <AuthLayout scenario="forgot-password">
        <div className="auth-card">
          <button
            className="auth-back"
            onClick={() => dispatch({ type: "BACK" })}
            style={backButtonStyle}
            type="button"
          >
            ← Voltar ao código
          </button>
          <header className="auth-heading">
            <h1>Crie uma nova senha</h1>
            <p>Use pelo menos 8 caracteres.</p>
          </header>
          <form className="auth-form" onSubmit={submitNewPassword} noValidate>
            <PasswordField id="new-password" label="Nova senha" />
            <PasswordField
              error={fieldError ?? undefined}
              id="confirm-password"
              label="Repita a nova senha"
            />
            <button className="btn btn-primary" type="submit">
              Salvar nova senha
            </button>
          </form>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout scenario="forgot-password">
      <div className="auth-card">
        <Link className="auth-back" href="/login">
          ← Voltar para entrar
        </Link>
        <header className="auth-heading">
          <h1>Esqueceu sua senha?</h1>
          <p>Informe o e-mail da sua conta para continuar.</p>
        </header>
        <form className="auth-form" onSubmit={submitEmail} noValidate>
          <label className="field">
            <span className="label">E-mail</span>
            <input
              autoComplete="email"
              className="input"
              name="email"
              placeholder="voce@seunegocio.com.br"
              required
              type="email"
            />
          </label>
          <button className="btn btn-primary" type="submit">
            Continuar
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}

const validationFieldIdByScenario: Partial<
  Record<AuthScenario, Record<string, string>>
> = {
  login: { email: "email", password: "login-password" },
  signup: {
    confirmPassword: "confirm-password",
    email: "email",
    password: "signup-password",
  },
};

function mapAuthError(
  error: unknown,
  scenario: AuthScenario,
): { fieldErrors: Record<string, string>; formError?: string } {
  if (error instanceof BffHttpError) {
    if (error.code === "VALIDATION_ERROR") {
      const mapping = validationFieldIdByScenario[scenario];
      const details = error.details as
        { fieldErrors?: Record<string, string[]> } | undefined;
      const zodFieldErrors = mapping ? details?.fieldErrors : undefined;
      if (zodFieldErrors) {
        const fieldErrors: Record<string, string> = {};
        for (const key of Object.keys(zodFieldErrors)) {
          const fieldId = mapping?.[key];
          if (fieldId) fieldErrors[fieldId] = friendlyValidationMessage(key);
        }
        if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
      }
    }
    if (scenario === "login" && error.status === 401) {
      return {
        fieldErrors: { "login-password": "E-mail ou senha incorretos." },
      };
    }
    if (scenario === "signup" && error.code === "CONFLICT") {
      return {
        fieldErrors: { email: "Já existe uma conta com este e-mail." },
      };
    }
  }
  return {
    fieldErrors: {},
    formError: "Não foi possível falar com a Atendly. Tente novamente.",
  };
}

function friendlyValidationMessage(field: string): string {
  if (field === "email") return "Digite um e-mail válido.";
  if (field === "password") {
    return "A senha precisa ter pelo menos 8 caracteres.";
  }
  if (field === "confirmPassword") return "As senhas precisam ser iguais.";
  return "Revise esta informação.";
}

function formString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
