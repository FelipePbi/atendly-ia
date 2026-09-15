"use client";

import { type FormEvent, useState } from "react";

import { BffHttpError } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { newIdempotencyKey } from "./idempotency";
import { ImportsPage } from "./ImportsLayout";
import type { ImportState } from "./types";

type FieldName =
  | "username"
  | "password"
  | "basicAuth"
  | "baseUrl"
  | "employeeId"
  | "paymentMethod";

type FieldErrors = Partial<Record<FieldName, string>>;

type FormValues = Record<FieldName, string>;

const EMPTY_FORM: FormValues = {
  username: "",
  password: "",
  basicAuth: "",
  baseUrl: "",
  employeeId: "",
  paymentMethod: "",
};

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.username.trim()) {
    errors.username = "Informe o usuário ou e-mail do Minha Agenda.";
  }
  if (!values.password) {
    errors.password = "Informe a senha do Minha Agenda.";
  }
  if (!values.basicAuth.trim()) {
    errors.basicAuth = "Informe a chave de acesso do Minha Agenda.";
  }
  if (!values.baseUrl.trim()) {
    errors.baseUrl = "Informe o endereço da sua conta no Minha Agenda.";
  } else {
    try {
      new URL(values.baseUrl.trim());
    } catch {
      errors.baseUrl = "Informe um endereço válido, começando com https://.";
    }
  }
  const employeeId = Number(values.employeeId);
  if (
    !values.employeeId.trim() ||
    !Number.isInteger(employeeId) ||
    employeeId <= 0
  ) {
    errors.employeeId =
      "Informe o código do profissional no Minha Agenda (um número inteiro maior que zero).";
  }
  if (!values.paymentMethod.trim()) {
    errors.paymentMethod = "Informe a forma de pagamento padrão.";
  }
  return errors;
}

/**
 * Nunca repete `error.message` da origem: a causa real fica no BFF/scheduling
 * (`MINHA_AGENDA_*`), e o que chega aqui é sempre linguagem de produto.
 */
function connectErrorMessage(error: unknown): string {
  if (error instanceof BffHttpError) {
    switch (error.code) {
      case "MINHA_AGENDA_AUTH_FAILED":
        return "Não foi possível entrar no Minha Agenda com esses dados. Confira o usuário, a senha e a chave de acesso.";
      case "MINHA_AGENDA_TIMEOUT":
      case "MINHA_AGENDA_HTTP_ERROR":
      case "MINHA_AGENDA_INVALID_RESPONSE":
        return "O Minha Agenda não respondeu como esperado agora. Tente novamente em alguns minutos.";
      case "IMPORT_ALREADY_COMPLETED":
        return "Este negócio já concluiu sua única importação do Minha Agenda.";
      case "VALIDATION_ERROR":
        return "Confira os dados preenchidos e tente novamente.";
      default:
        return "Não foi possível conectar ao Minha Agenda agora. Tente novamente.";
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
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const sourceAccountId = values.username.trim();
    try {
      await getProductServices().calendar.connectIntegration({
        credentials: {
          basicAuth: values.basicAuth.trim(),
          password: values.password,
          username: sourceAccountId,
        },
        configuration: {
          baseUrl: values.baseUrl.trim(),
          employeeId: Number(values.employeeId),
          paymentMethod: values.paymentMethod.trim(),
        },
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

  return (
    <ImportsPage
      description="Copie seus dados do Minha Agenda uma única vez. Nada muda na Atendly até você confirmar."
      title={replace ? "Conectar outra conta do Minha Agenda" : "Importar do Minha Agenda"}
    >
      <div className="imports-panel">
        <div className="imports-panel-header">
          <h2>Isto é uma migração, não uma conexão</h2>
        </div>
        <ul className="imports-facts">
          <li>
            <Icon name="check" />
            <span>Seus dados são copiados uma única vez.</span>
          </li>
          <li>
            <Icon name="check" />
            <span>
              O Minha Agenda não fica conectado depois. Alterações feitas lá
              não chegam mais à Atendly.
            </span>
          </li>
          <li>
            <Icon name="check" />
            <span>A Atendly passa a ser sua agenda oficial.</span>
          </li>
        </ul>
      </div>

      <form className="imports-panel" onSubmit={(event) => void handleSubmit(event)}>
        <div className="imports-panel-header">
          <h2>Entre no Minha Agenda</h2>
          <p>
            Usamos seu acesso só para ler seus dados durante a importação. Ele
            não fica guardado.
          </p>
        </div>
        <div className="settings-form-grid">
          <label className={`field${fieldErrors.username ? " field-error" : ""}`}>
            <span className="label">Usuário ou e-mail do Minha Agenda</span>
            <input
              autoComplete="username"
              className="input"
              type="text"
              value={values.username}
              onChange={(event) => setField("username", event.target.value)}
            />
            {fieldErrors.username && (
              <span className="field-help">{fieldErrors.username}</span>
            )}
          </label>
          <label className={`field${fieldErrors.password ? " field-error" : ""}`}>
            <span className="label">Senha</span>
            <input
              autoComplete="current-password"
              className="input"
              type="password"
              value={values.password}
              onChange={(event) => setField("password", event.target.value)}
            />
            {fieldErrors.password && (
              <span className="field-help">{fieldErrors.password}</span>
            )}
          </label>
          <label className={`field${fieldErrors.basicAuth ? " field-error" : ""}`}>
            <span className="label">Chave de acesso (token de integração)</span>
            <input
              autoComplete="off"
              className="input"
              type="password"
              value={values.basicAuth}
              onChange={(event) => setField("basicAuth", event.target.value)}
            />
            <span className="field-help">
              Encontrada nas configurações de integrações do Minha Agenda.
            </span>
            {fieldErrors.basicAuth && (
              <span className="field-help">{fieldErrors.basicAuth}</span>
            )}
          </label>
          <label className={`field is-wide${fieldErrors.baseUrl ? " field-error" : ""}`}>
            <span className="label">Endereço da sua conta no Minha Agenda</span>
            <input
              autoComplete="off"
              className="input"
              placeholder="https://sua-empresa.minhaagenda.com.br"
              type="text"
              value={values.baseUrl}
              onChange={(event) => setField("baseUrl", event.target.value)}
            />
            {fieldErrors.baseUrl && (
              <span className="field-help">{fieldErrors.baseUrl}</span>
            )}
          </label>
          <label className={`field${fieldErrors.employeeId ? " field-error" : ""}`}>
            <span className="label">Código do profissional</span>
            <input
              autoComplete="off"
              className="input"
              inputMode="numeric"
              type="number"
              value={values.employeeId}
              onChange={(event) => setField("employeeId", event.target.value)}
            />
            {fieldErrors.employeeId && (
              <span className="field-help">{fieldErrors.employeeId}</span>
            )}
          </label>
          <label className={`field${fieldErrors.paymentMethod ? " field-error" : ""}`}>
            <span className="label">Forma de pagamento padrão</span>
            <input
              autoComplete="off"
              className="input"
              placeholder="Dinheiro, cartão..."
              type="text"
              value={values.paymentMethod}
              onChange={(event) => setField("paymentMethod", event.target.value)}
            />
            <span className="field-help">
              Usada nos atendimentos importados que não informam pagamento.
            </span>
            {fieldErrors.paymentMethod && (
              <span className="field-help">{fieldErrors.paymentMethod}</span>
            )}
          </label>
        </div>
        {formError && (
          <p className="field-help" role="alert">
            {formError}
          </p>
        )}
        <div className="imports-actions is-split">
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
          <button className="btn btn-primary" disabled={submitting} type="submit">
            {submitting ? "Conectando..." : "Conectar Minha Agenda"}
          </button>
        </div>
      </form>
    </ImportsPage>
  );
}
