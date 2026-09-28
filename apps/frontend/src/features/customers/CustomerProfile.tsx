"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { type FormEvent } from "react";

import { BffHttpError, type CalendarState, type CustomerDetail } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { displayPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Field } from "@/shared/ui/Field";
import { StatePanel } from "@/shared/ui/States";

import { CustomerAgenda } from "./CustomerAgenda";
import { CustomerMemory } from "./CustomerMemory";
import { CustomerNotes } from "./CustomerNotes";
import { CustomerSummary } from "./CustomerSummary";
import { CustomerTags } from "./CustomerTags";
import { PrimaryGuardianPanel } from "./PrimaryGuardianPanel";

type CustomerProfileProps = { customerId?: string };

export function CustomerProfile({ customerId }: CustomerProfileProps) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [error, setError] = useState<string | null>(() =>
    customerId
      ? null
      : "Selecione um cliente na lista para consultar os detalhes.",
  );
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    const services = getProductServices();
    Promise.all([
      services.customers.get(customerId, controller.signal),
      services.calendar.getCalendar(controller.signal),
    ])
      .then(([nextCustomer, nextCalendar]) => {
        setCustomer(nextCustomer);
        setCalendar(nextCalendar);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar o cliente."),
          );
      });
    return () => controller.abort();
  }, [customerId, reload]);

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    const data = new FormData(event.currentTarget);
    const name = formText(data, "name");
    const phone = formText(data, "phone");
    setBusy(true);
    setFormError(null);
    try {
      const updated = await getProductServices().customers.update(customer.id, {
        name: name || null,
        phone: phone || null,
      });
      setCustomer((current) =>
        current ? { ...current, ...updated } : current,
      );
      setEditing(false);
    } catch (caught: unknown) {
      setFormError(
        requestError(caught, "Não foi possível salvar as alterações."),
      );
    } finally {
      setBusy(false);
    }
  }

  const applyGuardian = useCallback(
    (guardian: CustomerDetail["primaryGuardian"]) => {
      setCustomer((current) =>
        current ? { ...current, primaryGuardian: guardian } : current,
      );
    },
    [],
  );

  const applyNotes = useCallback((notes: CustomerDetail["notes"]) => {
    setCustomer((current) => (current ? { ...current, notes } : current));
  }, []);

  const applyTags = useCallback((tags: CustomerDetail["tags"]) => {
    setCustomer((current) => (current ? { ...current, tags } : current));
  }, []);

  const editable = Boolean(calendar?.capabilities.manageCustomers);
  useShellConfig({
    active: "clientes",
    loading: !customer && !error,
    module: "directory",
    title: "Detalhes do cliente",
  });

  return (
    <section className="directory-page">
      <header className="directory-page-header">
        <Link className="btn btn-tertiary" href="/clientes">
          <Icon name="chevron-left" />
          Voltar para clientes
        </Link>
      </header>

      {!customer && !error ? (
        <ProfileLoading />
      ) : error || !customer ? (
        <StatePanel
          actionLabel={customerId ? "Tentar novamente" : undefined}
          description={error ?? "Cliente não encontrado."}
          icon="alert"
          onAction={
            customerId
              ? () => {
                  setError(null);
                  setReload((value) => value + 1);
                }
              : undefined
          }
          title="Cliente indisponível"
          tone="error"
        />
      ) : (
        <>
          <SourceStrip />
          <section className="directory-detail-hero">
            <div className="directory-detail-identity">
              <span className="avatar" aria-hidden="true">
                {initials(customer.name)}
              </span>
              <div>
                <h1>{customer.name || "Cliente sem nome"}</h1>
                <p className="directory-detail-phone">
                  {displayPhone(customer.phone, "Telefone não informado")}
                </p>
                <div className="directory-detail-signals">
                  <span className="badge">Agenda Atendly</span>
                </div>
              </div>
            </div>
            {editable && !editing && (
              <div className="directory-detail-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditing(true)}
                  type="button"
                >
                  Editar dados
                </button>
              </div>
            )}
          </section>

          {editing && (
            <form
              className="customer-form-card"
              onSubmit={(event) => void saveIdentity(event)}
            >
              <div className="customer-form-grid">
                <Field
                  autoComplete="name"
                  defaultValue={customer.name ?? ""}
                  help="Use o nome que ajuda você a reconhecer este cliente."
                  label="Nome"
                  maxLength={200}
                  name="name"
                />
                <Field
                  autoComplete="tel"
                  defaultValue={customer.phone ?? ""}
                  help="O telefone identifica o cliente apenas neste negócio. Pode ficar em branco."
                  inputMode="tel"
                  label="Telefone"
                  maxLength={32}
                  minLength={6}
                  name="phone"
                  placeholder="(00) 00000-0000"
                  type="tel"
                />
              </div>
              {formError && (
                <div className="customer-inline-error" role="alert">
                  {formError}
                </div>
              )}
              <div className="customer-form-footer">
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setFormError(null);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </form>
          )}

          <div className="directory-detail-grid">
            <div>
              <CustomerAgenda
                customerId={customer.id}
                timezone={calendar?.timezone ?? "America/Sao_Paulo"}
              />
              <CustomerNotes
                customerId={customer.id}
                notes={customer.notes}
                onChange={applyNotes}
              />
              <CustomerMemory customerId={customer.id} />
              <CustomerTags
                customerId={customer.id}
                onChange={applyTags}
                tags={customer.tags}
              />
              <CustomerSummary customerId={customer.id} />
            </div>
            <aside>
              <PrimaryGuardianPanel
                customerId={customer.id}
                editable={editable}
                guardian={customer.primaryGuardian}
                onChange={applyGuardian}
              />
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function SourceStrip() {
  return (
    <section className="directory-source-strip">
      <div className="directory-source-copy">
        <span className="directory-source-icon">
          <Icon name="users" />
        </span>
        <div>
          <strong>Gerenciado pela Agenda Atendly</strong>
          <span>Cadastros pertencem somente a este negócio.</span>
        </div>
      </div>
      <span className="badge badge-success">Controle completo</span>
    </section>
  );
}

function ProfileLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando dados"
      className="directory-loading-shell"
    >
      {[0, 1, 2].map((item) => (
        <div className="directory-loading-row" key={item}>
          <span className="skeleton directory-loading-avatar" />
          <span className="directory-loading-copy">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-line" />
          </span>
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line" />
        </div>
      ))}
    </div>
  );
}

function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    NETWORK_ERROR: "Não foi possível acessar a Atendly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}

function initials(name: string | null): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR"))
    .join("");
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}
