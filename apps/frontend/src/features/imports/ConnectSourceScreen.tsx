"use client";

import { type FormEvent, useId, useState } from "react";

import { BffHttpError } from "@/data";
import { schedulingRefusalCode } from "@/data/http/schedulingRefusal";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { newIdempotencyKey } from "./idempotency";
import { ImportOriginScreen } from "./ImportOriginScreen";
import { ImportsPage } from "./ImportsLayout";
import type { ImportState } from "./types";

type FieldName = "email" | "password";

type FieldErrors = Partial<Record<FieldName, string>>;

type FormValues = Record<FieldName, string>;

const EMPTY_FORM: FormValues = {
  email: "",
  password: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.email.trim()) {
    errors.email = "Informe o e-mail do Minha Agenda.";
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Informe um e-mail válido.";
  }
  if (!values.password) {
    errors.password = "Informe a senha do Minha Agenda.";
  }
  return errors;
}

function upstreamCode(error: BffHttpError): string | undefined {
  const details = error.details;
  if (!details || typeof details !== "object") return undefined;
  const value = (details as { upstreamCode?: unknown }).upstreamCode;
  return typeof value === "string" ? value : undefined;
}

/**
 * Nunca repete `error.message` da origem: a causa real fica no BFF/scheduling
 * (`MINHA_AGENDA_*`, repassado em `error.details.upstreamCode` sob
 * `error.code: "UPSTREAM_ERROR"`), e o que chega aqui é sempre linguagem de
 * produto, sem token, endereço, HTTP nem código cru.
 */
function connectErrorMessage(error: unknown): string {
  if (error instanceof BffHttpError) {
    if (schedulingRefusalCode(error) === "IMPORT_ALREADY_COMPLETED") {
      return "Este negócio já concluiu sua única importação do Minha Agenda.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "Confira os dados preenchidos e tente novamente.";
    }
    if (error.code === "UPSTREAM_ERROR") {
      switch (upstreamCode(error)) {
        case "MINHA_AGENDA_AUTH_FAILED":
          return "Não foi possível entrar no Minha Agenda com esses dados. Confira o e-mail e a senha.";
        case "MINHA_AGENDA_PROFESSIONAL_NOT_FOUND":
          return "Não encontramos nenhum profissional cadastrado nessa conta do Minha Agenda.";
        case "MINHA_AGENDA_MULTIPLE_PROFESSIONALS":
          return "Encontramos mais de um profissional cadastrado nessa conta do Minha Agenda. Por enquanto, a Avenly importa a agenda de um profissional só.";
        case "MINHA_AGENDA_TIMEOUT":
        case "MINHA_AGENDA_UNREACHABLE":
        case "MINHA_AGENDA_HTTP_ERROR":
        case "MINHA_AGENDA_INVALID_RESPONSE":
          return "O Minha Agenda não respondeu agora. Nada foi salvo. Tente novamente em alguns minutos.";
        case "MINHA_AGENDA_NOT_CONFIGURED":
        case "MINHA_AGENDA_CLIENT_REJECTED":
        case "INTEGRATION_CONFIGURATION_INVALID":
          return "A importação está indisponível agora por uma falha da Avenly, não por causa dos dados informados. Tente novamente mais tarde.";
        default:
          return "Não foi possível conectar ao Minha Agenda agora. Tente novamente.";
      }
    }
  }
  return "Não foi possível conectar ao Minha Agenda agora. Tente novamente.";
}

export function ConnectSourceScreen({
  onCancel,
  onConnected,
  replace = false,
}: {
  onCancel?: () => void;
  onConnected: (state: ImportState) => void;
  replace?: boolean;
}) {
  const [phase, setPhase] = useState<"credentials" | "origin">("origin");
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const emailId = useId();
  const passwordId = useId();

  function setField(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    setFormError(null);
    const sourceAccountId = values.email.trim();
    try {
      await getProductServices().calendar.connectIntegration({
        email: sourceAccountId,
        password: values.password,
      });
      await getProductServices().migration.startImport(
        {
          replace,
          sourceAccountId,
          sourceAccountLabel: sourceAccountId,
        },
        newIdempotencyKey(),
      );
      const nextState = await getProductServices().migration.getImportState();
      onConnected(nextState);
    } catch (caught: unknown) {
      setFormError(connectErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "origin") {
    return (
      <ImportOriginScreen
        onCancel={onCancel}
        onContinue={() => setPhase("credentials")}
      />
    );
  }

  return (
    <ImportsPage
      description="Usamos seu acesso só para ler seus dados durante a importação. Ele é apagado assim que você concluir a importação."
      eyebrow={false}
      title={
        replace
          ? "Conectar outra conta do Minha Agenda"
          : "Entre no Minha Agenda"
      }
    >
      <form
        className="imports-credentials"
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="imports-credentials-body">
          <div className={`field${fieldErrors.email ? " field-error" : ""}`}>
            <label className="label" htmlFor={emailId}>
              E-mail do Minha Agenda
            </label>
            <input
              autoComplete="username"
              className="input"
              id={emailId}
              type="email"
              value={values.email}
              onChange={(event) => setField("email", event.target.value)}
            />
            {fieldErrors.email && (
              <span className="field-help">{fieldErrors.email}</span>
            )}
          </div>
          <div className={`field${fieldErrors.password ? " field-error" : ""}`}>
            <label className="label" htmlFor={passwordId}>
              Senha
            </label>
            <span className="input-wrap">
              <input
                autoComplete="current-password"
                className="input input-with-action"
                id={passwordId}
                type={passwordVisible ? "text" : "password"}
                value={values.password}
                onChange={(event) => setField("password", event.target.value)}
              />
              <button
                aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={passwordVisible}
                className="field-action"
                type="button"
                onClick={() => setPasswordVisible((current) => !current)}
                onMouseDown={(event) => event.preventDefault()}
              >
                <Icon name="eye" />
              </button>
            </span>
            {fieldErrors.password && (
              <span className="field-help">{fieldErrors.password}</span>
            )}
          </div>
          {formError && (
            <p className="field-help" role="alert">
              {formError}
            </p>
          )}
        </div>
        <div className="imports-credentials-actions">
          {onCancel && (
            <button
              className="btn btn-secondary"
              disabled={submitting}
              type="button"
              onClick={onCancel}
            >
              Cancelar
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Conectando…" : "Analisar meus dados"}
          </button>
        </div>
      </form>
    </ImportsPage>
  );
}
