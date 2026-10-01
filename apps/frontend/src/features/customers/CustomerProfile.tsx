"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { type FormEvent } from "react";

import { BffHttpError, type CalendarState, type CustomerDetail } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { ListDetailLayout } from "@/shared/layout/ListDetail";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { displayPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Field } from "@/shared/ui/Field";
import { StatePanel } from "@/shared/ui/States";

import { CustomerAgenda } from "./CustomerAgenda";
import { CustomerListPanel } from "./CustomerList";
import { CustomerMemory } from "./CustomerMemory";
import { CustomerNotes } from "./CustomerNotes";
import { CustomerNextAppointment, CustomerSummary } from "./CustomerSummary";
import { CustomerTags } from "./CustomerTags";
import { PrimaryGuardianPanel } from "./PrimaryGuardianPanel";

type CustomerProfileProps = { customerId?: string };

type ProfileTab = "atendimentos" | "notas" | "resumo";

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "resumo", label: "Resumo" },
  { id: "atendimentos", label: "Atendimentos" },
  { id: "notas", label: "Notas" },
];

export function CustomerProfile({ customerId }: CustomerProfileProps) {
  const wide = useWideLayout();
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
  const [tab, setTab] = useState<ProfileTab>(() => initialTabFromLocation());
  const [conversationId, setConversationId] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabsId = useId();

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

  // A conversa mais recente da pessoa (Goal075): sem conversa ou em erro, a
  // ação "Conversa" simplesmente não aparece — não é uma falha bloqueante.
  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    getProductServices()
      .conversations.list({ customerId, limit: 1 }, controller.signal)
      .then((result) => setConversationId(result[0]?.id ?? null))
      .catch(() => {
        if (!controller.signal.aborted) setConversationId(null);
      });
    return () => controller.abort();
  }, [customerId]);

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
  const canSchedule = Boolean(calendar?.capabilities.createAppointments);
  useShellConfig({
    active: "clientes",
    loading: !customer && !error,
    module: "directory",
    pushed: true,
    title: "Detalhes do cliente",
  });

  function selectTab(next: ProfileTab) {
    setTab(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("aba", next);
    window.history.replaceState(null, "", url);
  }

  const menuItems =
    customer && editable && !editing
      ? [{ label: "Editar dados", onSelect: () => setEditing(true) }]
      : undefined;

  const profile = (
    <section className="directory-page customer-profile">
      <PushedBar
        backHref="/clientes"
        backLabel="Voltar para clientes"
        menuItems={menuItems}
        menuLabel="Mais ações do cliente"
      />

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
          <section className="directory-detail-hero">
            <div className="directory-detail-identity">
              <span className="avatar" aria-hidden="true">
                {initials(customer.name)}
              </span>
              <div>
                <h1>{customer.name || "Cliente sem nome"}</h1>
                <p className="directory-detail-phone">
                  {[
                    displayPhone(customer.phone, "Telefone não informado"),
                    sinceLabel(customer),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {customer.tags.length > 0 && (
                  <ul
                    aria-label="Tags do cliente"
                    className="customer-header-tags"
                  >
                    {customer.tags.map((tag) => (
                      <li className="badge" key={tag.id}>
                        {tag.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="directory-detail-actions">
              {conversationId && (
                <Link
                  className="btn btn-secondary"
                  href={`/conversas/${encodeURIComponent(conversationId)}`}
                >
                  <Icon name="chat" />
                  Conversa
                </Link>
              )}
              {canSchedule && (
                <Link
                  className="btn btn-secondary"
                  href={`/agenda/novo?customerId=${encodeURIComponent(customer.id)}`}
                >
                  <Icon name="calendar" />
                  Agendar
                </Link>
              )}
            </div>
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

          <div
            aria-label="Seções do perfil"
            className="directory-tabs tab-list"
            role="tablist"
          >
            {TABS.map((item, index) => (
              <button
                aria-controls={`${tabsId}-panel-${item.id}`}
                aria-selected={tab === item.id}
                className={clsx("tab", tab === item.id && "is-active")}
                id={`${tabsId}-tab-${item.id}`}
                key={item.id}
                onClick={() => selectTab(item.id)}
                onKeyDown={(event) => {
                  const step =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!step) return;
                  event.preventDefault();
                  const next = (index + step + TABS.length) % TABS.length;
                  selectTab(TABS[next].id);
                  tabRefs.current[next]?.focus();
                }}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                role="tab"
                tabIndex={tab === item.id ? 0 : -1}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "resumo" && (
            <div
              aria-labelledby={`${tabsId}-tab-resumo`}
              id={`${tabsId}-panel-resumo`}
              role="tabpanel"
              tabIndex={0}
            >
              <div className="resume-body">
                <CustomerSummary
                  customerId={customer.id}
                  stats={customer.appointmentStats}
                />
                <div className="resume-side">
                  <CustomerNextAppointment appointment={customer.nextAppointment} />
                  <CustomerMemory customerId={customer.id} />
                </div>
              </div>
              <PrimaryGuardianPanel
                customerId={customer.id}
                editable={editable}
                guardian={customer.primaryGuardian}
                onChange={applyGuardian}
              />
            </div>
          )}

          {tab === "atendimentos" && (
            <div
              aria-labelledby={`${tabsId}-tab-atendimentos`}
              id={`${tabsId}-panel-atendimentos`}
              role="tabpanel"
              tabIndex={0}
            >
              <CustomerAgenda
                customerId={customer.id}
                timezone={calendar?.timezone ?? "America/Sao_Paulo"}
              />
            </div>
          )}

          {tab === "notas" && (
            <div
              aria-labelledby={`${tabsId}-tab-notas`}
              id={`${tabsId}-panel-notas`}
              role="tabpanel"
              tabIndex={0}
            >
              <CustomerNotes
                customerId={customer.id}
                notes={customer.notes}
                onChange={applyNotes}
              />
              <CustomerTags
                customerId={customer.id}
                onChange={applyTags}
                tags={customer.tags}
              />
            </div>
          )}
        </>
      )}
    </section>
  );

  if (!wide) return profile;
  return (
    <ListDetailLayout
      detail={profile}
      list={<CustomerListPanel openId={customerId} />}
      listLabel="Clientes"
    />
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

/**
 * A aba pedida por `?aba=` no link direto (Goal075 §4). Só decide a seleção
 * inicial; trocar de aba depois é sempre ação da própria tela.
 */
function initialTabFromLocation(): ProfileTab {
  if (typeof window === "undefined") return "resumo";
  const requested = new URLSearchParams(window.location.search).get("aba");
  return requested === "atendimentos" || requested === "notas"
    ? requested
    : "resumo";
}

function sinceLabel(customer: CustomerDetail): string | null {
  const firstAppointment = customer.appointmentStats?.firstAppointmentDate;
  const source = firstAppointment ?? customer.createdAt ?? null;
  if (!source) return null;
  const isDateOnly = source.length === 10;
  const date = new Date(isDateOnly ? `${source}T12:00:00Z` : source);
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: isDateOnly ? "UTC" : undefined,
    year: "numeric",
  })
    .format(date)
    .replace(".", "");
  return `cliente desde ${formatted}`;
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
