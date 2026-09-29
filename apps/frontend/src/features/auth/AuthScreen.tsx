"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

import { CURRENT_LEGAL_VERSIONS } from "@/config/legal-versions";
import { BffHttpError, PASSWORD_POLICY_RULES } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { Brand } from "@/shared/ui/Brand";

export type AuthScenario =
  | "login"
  | "signup"
  | "forgot-password"
  | "request-sent"
  | "new-password"
  | "link-expired";

const PASSWORD_RULE_LABELS: Record<string, string> = {
  MIN_LENGTH: "Pelo menos 8 caracteres",
  HAS_LETTER_AND_DIGIT: "Letras e números",
};

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="entry-shell">
      <aside className="entry-panel" aria-label="Atendly">
        <Brand href="/login" signature="entry" />
        <div className="entry-copy">
          <h2 className="entry-tagline">
            Seu atendimento começa com uma boa conversa.
          </h2>
          <p className="entry-support">
            A Atendly aprende o jeito do seu negócio, responde clientes no
            WhatsApp e marca direto na sua agenda.
          </p>
        </div>
        <div className="entry-mock" aria-hidden="true">
          <div className="entry-mock-header">
            <span className="entry-mock-avatar">SC</span>
            <div className="entry-mock-meta">
              <span className="entry-mock-name">Studio Camila Reis</span>
              <span className="entry-mock-status">
                <span className="entry-mock-dot" />
                IA atendendo
              </span>
            </div>
          </div>
          <div className="entry-mock-bubble entry-mock-bubble--client">
            Oi! Vocês têm horário amanhã à tarde?
          </div>
          <div className="entry-mock-bubble entry-mock-bubble--ai">
            Temos sim. Corte feminino às 15:00 ou 16:30 — qual prefere?
          </div>
          <div className="entry-mock-bubble entry-mock-bubble--client">
            15:00, por favor
          </div>
          <div className="entry-mock-bubble entry-mock-bubble--ai">
            Marcado: sexta, 19/09 às 15:00. Te lembro na véspera.
          </div>
        </div>
      </aside>
      <section className="entry-main">{children}</section>
    </main>
  );
}

function PasswordField({
  id,
  label,
  error,
  help,
  showRules,
  autoComplete,
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  showRules?: boolean;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const errorId = `${id}-error`;
  const rulesId = `${id}-rules`;
  const describedBy = [error ? errorId : null, showRules ? rulesId : null]
    .filter(Boolean)
    .join(" ");
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
            autoComplete ??
            (id === "login-password" ? "current-password" : "new-password")
          }
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        <button
          className="field-action"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          <Icon name="eye" />
        </button>
      </span>
      {error && (
        <span className="field-help" id={errorId} role="alert">
          {error}
        </span>
      )}
      {!error && help && <span className="field-help">{help}</span>}
      {showRules && (
        <ul className="password-rules" id={rulesId}>
          {PASSWORD_POLICY_RULES.map((rule) => {
            const met = rule.test(value);
            return (
              <li
                key={rule.id}
                className={`password-rule${met ? " is-met" : ""}`}
              >
                <span className="password-rule-mark" aria-hidden="true">
                  {met && <Icon name="check" />}
                </span>
                {PASSWORD_RULE_LABELS[rule.id]}
                <span className="password-rule-status">
                  {met ? "Atendida" : "Pendente"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </label>
  );
}

const fieldOrderByScenario: Partial<Record<AuthScenario, string[]>> = {
  login: ["email", "login-password"],
  signup: ["name", "email", "signup-password", "terms"],
  "forgot-password": ["email"],
  "new-password": ["new-password"],
};

function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Digite seu e-mail.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Digite um e-mail válido.";
  }
  return undefined;
}

function validatePasswordPolicy(value: string): string | undefined {
  if (!value) return "Digite uma senha.";
  const allRulesMet = PASSWORD_POLICY_RULES.every((rule) => rule.test(value));
  if (!allRulesMet) return "A senha precisa atender às regras abaixo.";
  return undefined;
}

function validateForm(
  scenario: AuthScenario,
  data: FormData,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (scenario === "signup") {
    if (!formString(data, "name").trim()) errors.name = "Digite seu nome.";
    const emailError = validateEmail(formString(data, "email"));
    if (emailError) errors.email = emailError;
    const passwordError = validatePasswordPolicy(
      formString(data, "signup-password"),
    );
    if (passwordError) errors["signup-password"] = passwordError;
    if (!data.get("terms")) {
      errors.terms = "Você precisa aceitar os Termos de Uso e a Política de Privacidade.";
    }
  } else if (scenario === "login") {
    const emailError = validateEmail(formString(data, "email"));
    if (emailError) errors.email = emailError;
    if (!formString(data, "login-password")) {
      errors["login-password"] = "Digite sua senha.";
    }
  } else if (scenario === "forgot-password") {
    const emailError = validateEmail(formString(data, "email"));
    if (emailError) errors.email = emailError;
  } else if (scenario === "new-password") {
    const passwordError = validatePasswordPolicy(
      formString(data, "new-password"),
    );
    if (passwordError) errors["new-password"] = passwordError;
  }
  return errors;
}

function focusFirstError(
  form: HTMLFormElement,
  errors: Record<string, string>,
  order: string[],
): void {
  const firstId = order.find((id) => errors[id]);
  if (!firstId) return;
  const field = form.elements.namedItem(firstId);
  if (field instanceof HTMLElement) field.focus();
}

export function AuthScreen({ scenario }: { scenario: AuthScenario }) {
  const router = useRouter();
  const { refreshSession } = useProductRuntime();
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [resetSucceeded, setResetSucceeded] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const validationErrors = validateForm(scenario, data);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setSubmitError(null);
      focusFirstError(form, validationErrors, fieldOrderByScenario[scenario] ?? []);
      return;
    }

    setLoading(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const auth = getProductServices().auth;
      if (scenario === "signup") {
        await auth.register({
          email: formString(data, "email"),
          name: formString(data, "name").trim(),
          password: formString(data, "signup-password"),
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
      } else if (scenario === "forgot-password") {
        await auth.forgotPassword(formString(data, "email"));
        router.push("/solicitacao-enviada");
      } else if (scenario === "new-password") {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) {
          router.push("/link-expirado");
          return;
        }
        await auth.resetPassword({
          token,
          newPassword: formString(data, "new-password"),
        });
        setResetSucceeded(true);
      }
    } catch (error: unknown) {
      if (
        scenario === "new-password" &&
        error instanceof BffHttpError &&
        error.code === "PASSWORD_RESET_TOKEN_INVALID"
      ) {
        // Código próprio do BFF para link morto: a tela dedicada já explica o
        // motivo e oferece o próximo passo, então não há campo para apontar.
        router.push("/link-expirado");
        return;
      }
      if (scenario === "forgot-password" && error instanceof BffHttpError) {
        if (error.status === 503) {
          setSubmitError(
            "A recuperação de senha está indisponível no momento. Tente novamente em instantes.",
          );
          return;
        }
        if (error.status === 429) {
          setSubmitError(
            "Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo.",
          );
          return;
        }
      }
      const mapped = mapAuthError(error, scenario);
      setFieldErrors(mapped.fieldErrors);
      setSubmitError(mapped.formError ?? null);
      focusFirstError(form, mapped.fieldErrors, fieldOrderByScenario[scenario] ?? []);
    } finally {
      setLoading(false);
    }
  }

  if (scenario === "request-sent" || scenario === "link-expired") {
    const expired = scenario === "link-expired";
    return (
      <AuthLayout>
        <div className="auth-card auth-state">
          <span className={`state-icon${expired ? " is-error" : ""}`}>
            <Icon name={expired ? "alert" : "check"} />
          </span>
          <h1>
            {expired ? "Este link expirou" : "Enviamos um link de recuperação"}
          </h1>
          <p>
            {expired
              ? "Por segurança, links de recuperação deixam de funcionar depois de um período. Solicite um novo para criar sua senha."
              : "Se existir uma conta com este e-mail, você vai receber um link para criar uma nova senha, válido por tempo limitado. Verifique também a caixa de spam."}
          </p>
          <Link
            className="btn btn-primary"
            href={expired ? "/recuperar-senha" : "/login"}
          >
            {expired ? "Solicitar novo link" : "Voltar para entrar"}
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

  const newPassword = scenario === "new-password";

  if (newPassword && resetSucceeded) {
    return (
      <AuthLayout>
        <div className="auth-card auth-state">
          <span className="state-icon">
            <Icon name="check" />
          </span>
          <h1>Senha redefinida</h1>
          <p>Você já pode entrar na Atendly com sua nova senha.</p>
          <Link className="btn btn-primary" href="/login">
            Ir para entrar
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const signup = scenario === "signup";
  const forgotPassword = scenario === "forgot-password";
  const passwordFieldId = newPassword
    ? "new-password"
    : signup
      ? "signup-password"
      : "login-password";
  const title = signup
    ? "Crie sua conta"
    : newPassword
      ? "Crie uma nova senha"
      : forgotPassword
        ? "Esqueceu sua senha?"
        : "Entrar";
  const subtitle = signup
    ? "Configure o negócio e conecte seu WhatsApp em poucos minutos."
    : newPassword
      ? "Diferente da senha anterior, com pelo menos 8 caracteres, letras e números."
      : forgotPassword
        ? "Informe o e-mail da sua conta para continuar."
        : "Boas-vindas de volta. Sua agenda continua de onde parou.";
  const submitLabel = signup
    ? "Criar conta"
    : newPassword
      ? "Salvar nova senha"
      : forgotPassword
        ? "Enviar link"
        : "Entrar";

  return (
    <AuthLayout>
      <div className="auth-card">
        {(signup || forgotPassword) && (
          <Link className="auth-back" href="/login">
            ← Voltar para entrar
          </Link>
        )}
        <header className="auth-heading">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>
        {submitError && (
          <div className="auth-inline-alert" role="alert">
            <Icon name="alert" />
            <div>
              <strong>Não foi possível continuar</strong>
              {submitError}
            </div>
          </div>
        )}
        <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
          {signup && (
            <label className={`field${fieldErrors.name ? " field-error" : ""}`}>
              <span className="label">Nome</span>
              <input
                id="name"
                className="input"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Seu nome"
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
              />
              {fieldErrors.name && (
                <span id="name-error" className="field-help" role="alert">
                  {fieldErrors.name}
                </span>
              )}
            </label>
          )}
          {!newPassword && (
            <label
              className={`field${fieldErrors.email ? " field-error" : ""}`}
            >
              <span className="label">E-mail</span>
              <input
                id="email"
                className="input"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@seunegocio.com.br"
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email && (
                <span id="email-error" className="field-help" role="alert">
                  {fieldErrors.email}
                </span>
              )}
            </label>
          )}
          {!forgotPassword && (
            <PasswordField
              id={passwordFieldId}
              label={
                newPassword ? "Nova senha" : signup ? "Crie uma senha" : "Senha"
              }
              error={fieldErrors[passwordFieldId]}
              showRules={newPassword || signup}
            />
          )}
          {signup && (
            <div className={`field${fieldErrors.terms ? " field-error" : ""}`}>
              <label className="check">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  aria-invalid={fieldErrors.terms ? true : undefined}
                  aria-describedby={fieldErrors.terms ? "terms-error" : undefined}
                />
                <span className="check-box" aria-hidden="true" />
                <span className="small">
                  Li e concordo com os{" "}
                  <Link href="/termos-de-uso">Termos de Uso</Link> e declaro
                  que li a{" "}
                  <Link href="/politica-de-privacidade">
                    Política de Privacidade
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.terms && (
                <span id="terms-error" className="field-help" role="alert">
                  {fieldErrors.terms}
                </span>
              )}
            </div>
          )}
          {scenario === "login" && (
            <div className="auth-row">
              <Link className="auth-link auth-link--standalone" href="/recuperar-senha">
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
            {signup && !loading && <Icon name="chevron-right" />}
          </button>
        </form>
        {!newPassword && !forgotPassword && (
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

const validationFieldIdByScenario: Partial<
  Record<AuthScenario, Record<string, string>>
> = {
  login: { email: "email", password: "login-password" },
  signup: {
    email: "email",
    name: "name",
    password: "signup-password",
  },
  "forgot-password": { email: "email" },
  "new-password": { newPassword: "new-password" },
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
  if (field === "name") return "Digite seu nome.";
  if (field === "password") {
    return "A senha precisa ter pelo menos 8 caracteres, com letras e números.";
  }
  if (field === "newPassword") {
    return "Escolha uma senha diferente da atual, que atenda às regras acima.";
  }
  return "Revise esta informação.";
}

function formString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
