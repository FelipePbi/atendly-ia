"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type FormEvent } from "react";

import { BffHttpError, type CalendarState, type CustomerDetail } from "@/data";
import {
  recalledServiceCatalog,
  rememberCalendar,
  rememberCustomer,
  rememberServiceCatalog,
} from "@/features/agenda/agendaMemory";
import { CustomerReturnMessages } from "@/features/customer-return/CustomerReturnMessages";
import { Icon } from "@/shared/icons/Icon";
import { ListDetailLayout } from "@/shared/layout/ListDetail";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { runViewTransition } from "@/shared/motion/viewTransition";
import { formatBrazilianPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { ContactPhoto, customerPhotoUrl } from "@/shared/ui/ContactPhoto";
import { Dialog } from "@/shared/ui/Dialog";
import { Field } from "@/shared/ui/Field";
import { StatePanel } from "@/shared/ui/States";
import { showToast } from "@/shared/ui/toastBus";

import { CustomerAgenda, prefetchCustomerAgenda } from "./CustomerAgenda";
import { CustomerListPanel } from "./CustomerList";
import { CustomerMemory } from "./CustomerMemory";
import { CustomerNotes } from "./CustomerNotes";
import { CustomerHistory, CustomerNextAppointment } from "./CustomerSummary";
import { CustomerTags } from "./CustomerTags";
import { firstName, GuardianCard } from "./GuardianCard";
import { initials } from "./initials";
import { PrimaryGuardianPanel } from "./PrimaryGuardianPanel";

type CustomerProfileProps = {
  customerId?: string;
  /** `?aba=` lido no servidor: na navegacao pelo app, window.location ainda
   * tem a URL anterior no primeiro render (validacao de 2026-10-12). */
  initialTab?: string;
  /** `?voltar=`: tela de origem, por exemplo a conversa. */
  returnTo?: string;
};

type ProfileTab = "atendimentos" | "notas" | "resumo";

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "resumo", label: "Resumo" },
  { id: "atendimentos", label: "Atendimentos" },
  { id: "notas", label: "Notas" },
];

export function CustomerProfile({
  customerId,
  initialTab,
  returnTo,
}: CustomerProfileProps) {
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
  const [tab, setTab] = useState<ProfileTab>(
    () => profileTab(initialTab) ?? initialTabFromLocation(),
  );
  const back = backTarget(returnTo);
  // A conversa vem marcada com o dono para quem foi pedida: o resultado de
  // outro dono nunca é lido como o do dono atual.
  const [conversation, setConversation] = useState<{
    ownerId: string;
    id: string | null;
  } | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  // A primeira cliente entra com uma animação curta (pedido de 2026-10-15).
  // A troca de uma cliente por outra é um crossfade da View Transition
  // `customer-swap` (pedido de 2026-10-16): a anterior sai enquanto a nova
  // entra, sem passar pelo painel vazio. Trocar de aba não repete a entrada.
  const [enterId, setEnterId] = useState<string | null>(null);
  const [guardianOpen, setGuardianOpen] = useState(false);
  // Desativar cliente (2026-10-18): pede confirmação; reativar não.
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [activeBusy, setActiveBusy] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);
  const shownIdRef = useRef<string | null>(null);
  const notesPanelRef = useRef<HTMLDivElement | null>(null);
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
        warmNewAppointment(nextCustomer, nextCalendar);
        const swapping =
          shownIdRef.current !== null && shownIdRef.current !== nextCustomer.id;
        shownIdRef.current = nextCustomer.id;
        const show = () => {
          setEnterId(swapping ? null : nextCustomer.id);
          setCustomer(nextCustomer);
          setCalendar(nextCalendar);
        };
        if (swapping)
          void runViewTransition(show, {
            fadeOnReducedMotion: true,
            types: ["customer-swap"],
          });
        else show();
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar o cliente."),
          );
      });
    return () => controller.abort();
  }, [customerId, reload]);

  // O cartão do responsável (CL8) só existe com a relação confirmada: proposta
  // ou ausente, o perfil fica como era. Sem telefone próprio, a linha sob o
  // nome diz isso em vez de "Telefone não informado".
  const confirmedGuardian =
    customer?.primaryGuardian?.status === "CONFIRMED"
      ? customer.primaryGuardian
      : null;
  const dependent = Boolean(confirmedGuardian && !customer?.phone?.trim());

  // O dono da conversa do perfil (Goal147): o responsável confirmado quando o
  // cliente não tem telefone próprio, senão o próprio cliente. Só existe depois
  // de o perfil carregar, porque depende de `primaryGuardian`.
  const conversationOwnerId = customer
    ? dependent && confirmedGuardian
      ? confirmedGuardian.guardian.id
      : customer.id
    : null;

  // A conversa mais recente do dono (Goal075): sem conversa ou em erro, a
  // ação "Conversa" simplesmente não aparece — não é uma falha bloqueante.
  // Trocar o dono aborta o pedido anterior e esconde a ação até o novo
  // responder.
  useEffect(() => {
    if (!conversationOwnerId) return;
    const ownerId = conversationOwnerId;
    const controller = new AbortController();
    getProductServices()
      .conversations.list({ customerId: ownerId, limit: 1 }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setConversation({ ownerId, id: result[0]?.id ?? null });
      })
      .catch(() => {
        if (!controller.signal.aborted) setConversation({ ownerId, id: null });
      });
    return () => controller.abort();
  }, [conversationOwnerId]);

  const conversationId =
    conversation && conversation.ownerId === conversationOwnerId
      ? conversation.id
      : null;
  const conversationLabel =
    dependent && confirmedGuardian
      ? `Conversa com ${firstName(confirmedGuardian.guardian.name) ?? "o responsável"}`
      : "Conversa";

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
      showToast("Cliente salvo.");
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

  // Criar observação e tag segue por item, com os mesmos pedidos; "Salvar"
  // envia os rascunhos abertos. Sem rascunho, o que já mudou está salvo.
  function saveNotesTab() {
    const drafts =
      notesPanelRef.current?.querySelectorAll<HTMLFormElement>("form") ?? [];
    if (drafts.length === 0) {
      setSavedNotice(true);
      return;
    }
    setSavedNotice(false);
    drafts.forEach((form) => form.requestSubmit());
  }

  // A aba Atendimentos entra pronta: a leitura começa assim que o perfil
  // abre, não quando a aba é tocada (2026-10-18).
  const profileId = customer?.id;
  const profileTimezone = calendar?.timezone ?? "America/Sao_Paulo";
  useEffect(() => {
    if (profileId) prefetchCustomerAgenda(profileId, profileTimezone);
  }, [profileId, profileTimezone]);

  function selectTab(next: ProfileTab) {
    // Troca de aba com fade (2026-10-18): o conteúdo anterior sai e o novo
    // entra, com o topo do perfil parado.
    void runViewTransition(
      () => {
        setTab(next);
        setEnterId(null);
        setSavedNotice(false);
      },
      { fadeOnReducedMotion: true, types: ["customer-tab"] },
    );
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("aba", next);
    window.history.replaceState(null, "", url);
  }

  // O responsável principal saiu do Resumo para o menu (pedido de
  // 2026-10-16, como no quadro CL5): abre numa janela própria. Confirmado,
  // ele continua à vista no cartão do topo (CL8).
  const menuItems =
    customer && !editing
      ? [
          ...(editable
            ? [{ label: "Editar dados", onSelect: () => setEditing(true) }]
            : []),
          {
            label: "Responsável principal",
            onSelect: () => setGuardianOpen(true),
          },
          ...(editable
            ? [
                customer.active === false
                  ? {
                      label: "Reativar cliente",
                      onSelect: () => void setActive(true),
                    }
                  : {
                      label: "Desativar cliente",
                      onSelect: () => {
                        setActiveError(null);
                        setDeactivateOpen(true);
                      },
                    },
              ]
            : []),
        ]
      : undefined;

  async function setActive(active: boolean) {
    if (!customer) return;
    setActiveBusy(true);
    setActiveError(null);
    try {
      const updated = await getProductServices().customers.update(customer.id, {
        active,
      });
      setCustomer((current) =>
        current ? { ...current, ...updated } : current,
      );
      setDeactivateOpen(false);
      showToast(active ? "Cliente reativado." : "Cliente desativado.");
    } catch (caught: unknown) {
      const message = requestError(
        caught,
        active
          ? "Não foi possível reativar o cliente."
          : "Não foi possível desativar o cliente.",
      );
      if (active) showToast(message, "danger");
      else setActiveError(message);
    } finally {
      setActiveBusy(false);
    }
  }

  const refreshing = Boolean(
    customer && customerId && customer.id !== customerId && !error,
  );

  const profile = (
    <section
      className={clsx(
        "directory-page customer-profile",
        customer && tab !== "resumo" && "is-fill",
        // Durante a troca a entrada sai, para o conteúdo anterior poder
        // esmaecer se a cliente nova demorar.
        refreshing
          ? "is-refreshing"
          : customer && enterId === customer.id && "is-entering",
      )}
      aria-busy={refreshing || undefined}
    >
      <PushedBar
        backHref={back.href}
        backLabel={back.label}
        menuItems={menuItems}
        menuLabel="Mais ações do cliente"
      />

      {!customer && !error ? (
        // Ao lado da lista o painel fica vazio até a cliente chegar, sem
        // esqueleto (pedido de 2026-10-15); a tela empurrada mantém o seu.
        wide ? null : (
          <ProfileLoading />
        )
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
        <Fragment key={customer.id}>
          {/* O cabeçalho é o mesmo nas três abas (pedido de 2026-10-16): trocar
              de aba só troca o conteúdo abaixo, sem o topo mudar de tamanho. */}
          <section className="directory-detail-hero">
            <div
              className={clsx(
                "directory-detail-identity",
                dependent && "is-dependent",
              )}
            >
              <span className="avatar" aria-hidden="true">
                {initials(customer.name)}
                <ContactPhoto src={customerPhotoUrl(customer.id)} />
              </span>
              <div>
                <h1>
                  {customer.name || "Cliente sem nome"}
                  {customer.active === false && (
                    <span className="badge customer-inactive-badge">
                      Inativo
                    </span>
                  )}
                </h1>
                <p className="directory-detail-phone">
                  {[
                    customer.phone
                      ? (formatBrazilianPhone(customer.phone, "plus") ??
                        customer.phone)
                      : dependent
                        ? "Sem telefone próprio"
                        : "Telefone não informado",
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
            {confirmedGuardian && (
              <GuardianCard
                customer={customer}
                guardian={confirmedGuardian}
                timezone={calendar?.timezone ?? "America/Sao_Paulo"}
              />
            )}
            <div
              className={clsx(
                "directory-detail-actions",
                dependent && "is-dependent",
              )}
            >
              {/* Acesso rápido ao chat (2026-10-16): sempre ao lado de
                  "Agendar". Sem conversa ainda, o botão fica desabilitado em
                  vez de sumir, e o cabeçalho não muda de forma. */}
              {conversationId ? (
                <Link
                  className="btn btn-secondary"
                  href={`/conversas/${encodeURIComponent(conversationId)}`}
                >
                  <Icon name="nav-chat" />
                  {conversationLabel}
                </Link>
              ) : (
                <button
                  className="btn btn-secondary"
                  disabled
                  title={
                    conversation === null
                      ? "Procurando a conversa"
                      : "Ainda não há conversa no WhatsApp com esta pessoa"
                  }
                  type="button"
                >
                  <Icon name="nav-chat" />
                  {conversationLabel}
                </button>
              )}
              {canSchedule && (
                <Link
                  className="btn btn-secondary"
                  href={`/agenda/novo?customerId=${encodeURIComponent(customer.id)}`}
                >
                  <Icon name="nav-calendar" />
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
              className="resume-panel"
              id={`${tabsId}-panel-resumo`}
              role="tabpanel"
              tabIndex={0}
            >
              {customer.primaryGuardian?.status === "PROPOSED" && (
                <p className="resume-guardian-pending" role="status">
                  Responsável proposto:{" "}
                  <strong>
                    {customer.primaryGuardian.guardian.name ?? "sem nome"}
                  </strong>
                  .{" "}
                  <button
                    className="resume-link"
                    onClick={() => setGuardianOpen(true)}
                    type="button"
                  >
                    Revisar
                  </button>
                </p>
              )}
              <div className="resume-body">
                <div className="resume-main">
                  <CustomerHistory stats={customer.appointmentStats} />
                  <CustomerReturnMessages customerId={customer.id} />
                </div>
                <div className="resume-side">
                  <CustomerNextAppointment
                    appointment={customer.nextAppointment}
                  />
                  <CustomerMemory customerId={customer.id} />
                </div>
              </div>
            </div>
          )}
          <Dialog
            onClose={() => !activeBusy && setDeactivateOpen(false)}
            open={deactivateOpen}
            title="Desativar cliente?"
          >
            <div className="customer-deactivate">
              <p>
                {customer.name || "Este cliente"} sai da lista principal de
                Clientes e fica em Inativos. Agenda, conversas e histórico
                continuam como estão, e você pode reativar quando quiser.
              </p>
              {activeError && (
                <p className="field-help" role="alert">
                  {activeError}
                </p>
              )}
              <div className="customer-deactivate-actions">
                <button
                  className="btn btn-secondary"
                  disabled={activeBusy}
                  onClick={() => setDeactivateOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  disabled={activeBusy}
                  onClick={() => void setActive(false)}
                  type="button"
                >
                  {activeBusy ? "Desativando..." : "Desativar"}
                </button>
              </div>
            </div>
          </Dialog>
          <Dialog
            onClose={() => setGuardianOpen(false)}
            open={guardianOpen}
            title="Responsável principal"
          >
            <PrimaryGuardianPanel
              customerId={customer.id}
              editable={editable}
              embedded
              guardian={customer.primaryGuardian}
              onChange={applyGuardian}
            />
          </Dialog>

          {tab === "atendimentos" && (
            <div
              aria-labelledby={`${tabsId}-tab-atendimentos`}
              className="customer-appts-panel"
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
              className="customer-notes-panel"
              id={`${tabsId}-panel-notas`}
              ref={notesPanelRef}
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
              <div className="customer-save-bar">
                <button
                  className="btn btn-primary"
                  onClick={saveNotesTab}
                  type="button"
                >
                  Salvar
                </button>
                {savedNotice && (
                  <p className="customer-save-notice" role="status">
                    Tudo salvo. Autorizações e remoções valem na hora.
                  </p>
                )}
              </div>
            </div>
          )}
        </Fragment>
      )}
    </section>
  );

  return (
    <ListDetailLayout
      detail={profile}
      list={<CustomerListPanel openId={customerId} />}
      listLabel="Clientes"
      split={wide}
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
function profileTab(value: string | undefined): ProfileTab | null {
  return value === "atendimentos" || value === "notas" || value === "resumo"
    ? value
    : null;
}

/**
 * Volta para a tela de origem quando ela veio no link (so caminho interno,
 * nunca outro site); sem origem, volta para a lista de clientes.
 */
export function backTarget(returnTo: string | undefined): {
  href: string;
  label: string;
} {
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return {
      href: returnTo,
      label: returnTo.startsWith("/conversas/")
        ? "Voltar para a conversa"
        : "Voltar",
    };
  }
  return { href: "/clientes", label: "Voltar para clientes" };
}

function initialTabFromLocation(): ProfileTab {
  if (typeof window === "undefined") return "resumo";
  const requested = new URLSearchParams(window.location.search).get("aba");
  return requested === "atendimentos" || requested === "notas"
    ? requested
    : "resumo";
}

/**
 * O "Agendar" do perfil abre o novo agendamento pronto (2026-10-16): a
 * cliente e o calendário que o perfil já leu ficam na memória da Agenda, e o
 * catálogo de serviços é pré-lido uma vez. Sem isso a tela abria vazia e
 * passava por esqueleto até ler tudo.
 */
function warmNewAppointment(
  customer: CustomerDetail,
  calendar: CalendarState,
): void {
  // Só pré-leitura: falhar aqui nunca pode derrubar o perfil.
  try {
    if (!calendar.capabilities.createAppointments) return;
    rememberCalendar(calendar);
    rememberCustomer(customer);
    if (recalledServiceCatalog()) return;
    void getProductServices()
      .serviceCatalog.list()
      .then(rememberServiceCatalog)
      .catch(() => undefined);
  } catch {
    /* sem pré-leitura, o novo agendamento lê tudo ao abrir */
  }
}

function sinceMonth(customer: CustomerDetail): string | null {
  const firstAppointment = customer.appointmentStats?.firstAppointmentDate;
  const source = firstAppointment ?? customer.createdAt ?? null;
  if (!source) return null;
  const isDateOnly = source.length === 10;
  const date = new Date(isDateOnly ? `${source}T12:00:00Z` : source);
  const parts = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: isDateOnly ? "UTC" : undefined,
    year: "numeric",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${month.replace(".", "")} ${year}`.trim();
}

function sinceLabel(customer: CustomerDetail): string | null {
  const month = sinceMonth(customer);
  return month ? `cliente desde ${month}` : null;
}

function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    NETWORK_ERROR: "Não foi possível acessar a Avenly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}
