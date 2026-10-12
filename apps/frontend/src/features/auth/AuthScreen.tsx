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

const INVALID_CREDENTIALS_MESSAGE =
  "E-mail ou senha não conferem. Confira e tente de novo ou recupere a senha.";

function RuleCheck() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg
      className="auth-glyph"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg
      className="auth-glyph"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function AuthLayout({
  children,
  compact,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <main className={`entry-shell${compact ? " entry-shell--compact" : ""}`}>
      <aside className="entry-panel" aria-label="Avenly">
        <Brand href="/login" signature="entry" />
        <div className="entry-copy">
          <span className="entry-badge">Atendimento com IA no WhatsApp</span>
          <h2 className="entry-tagline">
            Seu atendimento começa com uma boa conversa.
          </h2>
          <p className="entry-support">
            A Avenly aprende o jeito do seu negócio, responde clientes no
            WhatsApp e marca direto na sua agenda.
          </p>
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
              Temos sim. Corte feminino às 15:00 ou 16:30, qual prefere?
            </div>
            <div className="entry-mock-bubble entry-mock-bubble--client">
              15:00, por favor
            </div>
            <div className="entry-mock-bubble entry-mock-bubble--ai">
              Marcado: sexta, 19/09 às 15:00. Te lembro na véspera.
            </div>
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
  credentialsError,
  help,
  showRules,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  error?: string;
  credentialsError?: boolean;
  help?: string;
  showRules?: boolean;
  hint?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const errorId = `${id}-error`;
  const rulesId = `${id}-rules`;
  const describedBy = [error ? errorId : null, showRules ? rulesId : null]
    .filter(Boolean)
    .join(" ");
  const rules = [
    ...PASSWORD_POLICY_RULES.map((rule) => ({
      id: rule.id,
      label: PASSWORD_RULE_LABELS[rule.id],
      met: rule.test(value),
      status: rule.test(value) ? "Atendida" : "Pendente",
    })),
    {
      id: "DIFFERENT_FROM_CURRENT",
      label: "Diferente da senha anterior",
      met: false,
      status: "Conferida ao salvar",
    },
  ];
  return (
    <>
      <label
        className={`field${error ? " field-error" : ""}${credentialsError ? " field-error--credentials" : ""}`}
      >
        <span className="label">{label}</span>
        <span className="input-wrap">
          <Icon name="lock" className="field-icon" />
          <input
            id={id}
            name={id}
            className="input input-with-icon input-with-action"
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
        {hint && <span className="auth-hint">{hint}</span>}
      </label>
      {showRules && (
        <ul className="password-rules" id={rulesId}>
          {rules.map((rule) => (
            <li
              key={rule.id}
              className={`password-rule${rule.met ? " is-met" : ""}`}
            >
              <span className="password-rule-mark" aria-hidden="true">
                {rule.met && <RuleCheck />}
              </span>
              {rule.label}
              <span className="sr-only">: {rule.status}</span>
            </li>
          ))}
        </ul>
      )}
    </>
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
      errors.terms =
        "Você precisa aceitar os Termos de Uso e a Política de Privacidade.";
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
      focusFirstError(
        form,
        validationErrors,
        fieldOrderByScenario[scenario] ?? [],
      );
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
      focusFirstError(
        form,
        mapped.fieldErrors,
        fieldOrderByScenario[scenario] ?? [],
      );
    } finally {
      setLoading(false);
    }
  }

  if (scenario === "request-sent") {
    return (
      <AuthLayout>
        <div className="auth-card">
          <header className="auth-heading">
            <h1>Confira seu e-mail</h1>
            <p>
              Se existir uma conta com este e-mail, você vai receber um link
              para criar uma nova senha, válido por tempo limitado. Verifique
              também a caixa de spam.
            </p>
          </header>
          <Link className="btn btn-primary auth-cta" href="/login">
            Voltar para entrar
          </Link>
          <Link className="auth-alt" href="/recuperar-senha">
            <ChevronLeft />
            Usar outro e-mail
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (scenario === "link-expired") {
    return (
      <AuthLayout>
        <div className="auth-card auth-state">
          <span className="state-icon is-error">
            <Icon name="alert" />
          </span>
          <h1>Este link expirou</h1>
          <p>
            Por segurança, links de recuperação deixam de funcionar depois de um
            período. Solicite um novo para criar sua senha.
          </p>
          <Link className="btn btn-primary" href="/recuperar-senha">
            Solicitar novo link
          </Link>
          <p className="auth-footer">
            <Link className="auth-link auth-link--standalone" href="/login">
              Voltar para entrar
            </Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  const newPassword = scenario === "new-password";

  if (newPassword && resetSucceeded) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <div className="auth-success">
            <span className="auth-success-mark">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <header className="auth-heading">
              <h1>Senha redefinida</h1>
              <p>
                Pronto. Você já pode entrar com a nova senha. A IA segue
                atendendo normalmente.
              </p>
            </header>
          </div>
          <Link className="btn btn-primary auth-cta" href="/login">
            Entrar
            <ArrowRight />
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const signup = scenario === "signup";
  const credentialsError =
    scenario === "login" &&
    fieldErrors["login-password"] === INVALID_CREDENTIALS_MESSAGE;
  const forgotPassword = scenario === "forgot-password";
  const passwordFieldId = newPassword
    ? "new-password"
    : signup
      ? "signup-password"
      : "login-password";
  const title = signup
    ? "Criar conta"
    : newPassword
      ? "Crie uma nova senha"
      : forgotPassword
        ? "Recuperar senha"
        : "Entrar";
  const subtitle = signup
    ? "Configure o negócio e conecte seu WhatsApp em poucos minutos."
    : newPassword
      ? "Ela substitui a anterior em todos os dispositivos conectados."
      : forgotPassword
        ? "Digite o e-mail da conta. Enviamos um link para você criar uma nova senha."
        : "Boas-vindas de volta. Sua agenda continua de onde parou.";
  const submitLabel = signup
    ? "Criar conta"
    : newPassword
      ? "Salvar nova senha"
      : forgotPassword
        ? "Enviar link"
        : "Entrar";

  return (
    <AuthLayout compact={signup}>
      <div className="auth-card">
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
        <form
          className="auth-form"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          {signup && (
            <label className={`field${fieldErrors.name ? " field-error" : ""}`}>
              <span className="label">Nome</span>
              <span className="input-wrap">
                <Icon name="user" className="field-icon" />
                <input
                  id="name"
                  className="input input-with-icon"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Seu nome"
                  aria-invalid={fieldErrors.name ? true : undefined}
                  aria-describedby={fieldErrors.name ? "name-error" : undefined}
                />
              </span>
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
              <span className="input-wrap">
                <Icon name="mail" className="field-icon" />
                <input
                  id="email"
                  className="input input-with-icon"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@seunegocio.com.br"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={
                    fieldErrors.email ? "email-error" : undefined
                  }
                />
              </span>
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
              credentialsError={credentialsError}
              showRules={newPassword}
              hint={
                signup
                  ? "Mínimo de 8 caracteres, com letras e números."
                  : undefined
              }
            />
          )}
          {signup && (
            <div className={`field${fieldErrors.terms ? " field-error" : ""}`}>
              <label className="check auth-check">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  aria-invalid={fieldErrors.terms ? true : undefined}
                  aria-describedby={
                    fieldErrors.terms ? "terms-error" : undefined
                  }
                />
                <span className="check-box" aria-hidden="true" />
                <span className="auth-check-text">
                  Li e concordo com os{" "}
                  <Link href="/termos-de-uso">Termos de Uso</Link> e declaro que
                  li a{" "}
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
              <Link
                className={`auth-link auth-link--standalone${credentialsError ? " auth-link--emphasis" : ""}`}
                href="/recuperar-senha"
              >
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
            {signup && !loading && <ArrowRight />}
          </button>
        </form>
        {forgotPassword && (
          <Link className="auth-alt" href="/login">
            <ChevronLeft />
            Voltar para entrar
          </Link>
        )}
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
        fieldErrors: { "login-password": INVALID_CREDENTIALS_MESSAGE },
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
    formError: "Não foi possível falar com a Avenly. Tente novamente.",
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
