"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Conversation, IgnoredContactEntry, SettingsState } from "@/data";
import { BffHttpError } from "@/data";
import { schedulingRefusalCode } from "@/data/http/schedulingRefusal";
import { Icon } from "@/shared/icons/Icon";
import { formatBrazilianPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { dayMonthLabel } from "./dayMonth";
import { SettingsPage } from "./shared/SettingsPage";

const WHATSAPP_HREF = "/configuracoes/whatsapp";
const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const NO_CHANNEL_CODE = "CHANNEL_CONNECTION_NOT_FOUND";
/** Contatos lidos por página da lista. */
const PAGE_SIZE = 100;
/** Conversas mostradas por busca. */
const SEARCH_LIMIT = 20;
/** Espera da busca antes de ler: digitar não pede uma leitura por tecla. */
const SEARCH_DEBOUNCE_MS = 250;
/** Dígitos a partir dos quais o texto da busca pode ser um número a adicionar. */
const PHONE_MIN_DIGITS = 10;

type ListStatus = "loading" | "ready" | "no-channel" | "error";
type Pending = { id: string; kind: "add" | "ignore" | "remove" };
type SearchResults =
  | { query: string; status: "loading" }
  | { items: Conversation[]; query: string; status: "ready" }
  | { query: string; status: "error" };

function firstLetter(value: string | null | undefined): string {
  const letter = value?.match(/\p{L}/u)?.[0];
  return letter ? letter.toUpperCase() : "";
}

function phoneLabel(externalContactId: string): string {
  return formatBrazilianPhone(externalContactId, "plus") ?? externalContactId;
}

/**
 * Legenda de uma linha, pela origem da marcação. A marcação feita na conversa
 * não mostra o telefone (o quadro W3); quando o nome já é o telefone, a
 * legenda não o repete.
 */
function captionFor(
  contact: IgnoredContactEntry,
  nameIsPhone: boolean,
  timeZone: string,
): { phone: boolean; text: string } | null {
  const phone = phoneLabel(contact.externalContactId);
  const date = dayMonthLabel(contact.ignoredAt, timeZone);
  if (contact.origin === "CONVERSATION") {
    return {
      phone: false,
      text: date ? `marcada na conversa · ${date}` : "marcada na conversa",
    };
  }
  const since =
    contact.origin === "ONBOARDING"
      ? "desde o início"
      : date
        ? `desde ${date}`
        : null;
  if (nameIsPhone) return since ? { phone: false, text: since } : null;
  return since
    ? { phone: true, text: `${phone} · ${since}` }
    : { phone: true, text: phone };
}

function Avatar({ letter }: { letter: string }) {
  return (
    <span aria-hidden="true" className="wa-ignored-avatar">
      {letter || <Icon name="user" />}
    </span>
  );
}

/**
 * Configurações › WhatsApp › "A IA nunca responde" (Mais-WhatsApp:W3). Lê os
 * contatos ignorados do canal ativo e deixa tirar um deles da lista; a busca
 * marca uma conversa existente ou um número informado. Nada some nem entra na
 * lista antes da resposta da API.
 */
export function IgnoredContactsScreen({
  settings,
}: {
  settings: SettingsState;
}) {
  const timeZone = settings.business?.timezone ?? DEFAULT_TIMEZONE;
  const [status, setStatus] = useState<ListStatus>("loading");
  const [items, setItems] = useState<IgnoredContactEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [removeError, setRemoveError] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  const query = search.trim();
  const digits = query.replace(/\D/g, "").length;
  const phoneLike = digits >= PHONE_MIN_DIGITS;

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .conversations.listIgnoredContacts(
        { limit: PAGE_SIZE, offset: 0 },
        controller.signal,
      )
      .then((list) => {
        if (controller.signal.aborted) return;
        setItems(list.items);
        setTotal(list.total);
        setMoreError(false);
        setStatus("ready");
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(
          schedulingRefusalCode(failure) === NO_CHANNEL_CODE
            ? "no-channel"
            : "error",
        );
      });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResults({ query, status: "loading" });
      getProductServices()
        .conversations.list(
          { ignored: false, limit: SEARCH_LIMIT, search: query },
          controller.signal,
        )
        .then((list) => {
          if (controller.signal.aborted) return;
          setResults({ items: list, query, status: "ready" });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults({ query, status: "error" });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function retry() {
    setStatus("loading");
    setReloadKey((key) => key + 1);
  }

  async function loadMore() {
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await getProductServices().conversations.listIgnoredContacts(
        { limit: PAGE_SIZE, offset: items.length },
      );
      setItems((current) => {
        const known = new Set(current.map((entry) => entry.contactId));
        return [
          ...current,
          ...page.items.filter((entry) => !known.has(entry.contactId)),
        ];
      });
      setTotal(page.total);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(contact: IgnoredContactEntry, name: string) {
    if (pending) return;
    setPending({ id: contact.contactId, kind: "remove" });
    setRemoveError(false);
    setNotice("");
    try {
      await getProductServices().conversations.ignoreByPhone(
        contact.externalContactId,
        false,
      );
      setItems((current) =>
        current.filter((entry) => entry.contactId !== contact.contactId),
      );
      setTotal((current) => Math.max(0, current - 1));
      setNotice(`${name} saiu da lista.`);
    } catch {
      setRemoveError(true);
    } finally {
      setPending(null);
    }
  }

  /** O contato entrou: o campo esvazia, o bloco some e a lista relê do começo. */
  function entered(name: string) {
    setSearch("");
    setResults(null);
    setNotice(`${name} entrou na lista.`);
    setReloadKey((key) => key + 1);
  }

  async function ignoreConversation(conversation: Conversation, name: string) {
    if (pending) return;
    setPending({ id: conversation.id, kind: "ignore" });
    setMarkError(null);
    setNotice("");
    try {
      await getProductServices().conversations.setIgnored(
        conversation.id,
        true,
        "CONVERSATION",
      );
      entered(name);
    } catch {
      setMarkError("Não foi possível marcar este contato. Tente novamente.");
    } finally {
      setPending(null);
    }
  }

  async function addPhone() {
    if (pending) return;
    setPending({ id: query, kind: "add" });
    setMarkError(null);
    setNotice("");
    try {
      const contact = await getProductServices().conversations.ignoreByPhone(
        query,
        true,
        "SETTINGS",
      );
      entered(phoneLabel(contact.externalContactId));
    } catch (failure: unknown) {
      setMarkError(
        failure instanceof BffHttpError && failure.code === "VALIDATION_ERROR"
          ? "Use o formato +55 11 99999-0000, com DDD."
          : "Não foi possível marcar este número. Tente novamente.",
      );
    } finally {
      setPending(null);
    }
  }

  const matched = results?.query === query ? results : null;
  const showBlock = query !== "" && (matched !== null || phoneLike);

  return (
    <SettingsPage
      backHref={WHATSAPP_HREF}
      backLabel="Voltar para WhatsApp"
      title="A IA nunca responde"
    >
      <div className="wa-ignored">
        <p className="wa-ignored-intro">
          Estes contatos continuam aparecendo nas suas conversas, mas a IA não
          responde nem usa o que eles escrevem.
        </p>
        {status === "no-channel" ? (
          <div className="wa-ignored-state">
            <p>Conecte o WhatsApp para escolher quem a IA nunca responde.</p>
            <Link className="wa-ignored-link" href={WHATSAPP_HREF}>
              Conectar WhatsApp
            </Link>
          </div>
        ) : (
          <>
            <label className="wa-ignored-search">
              <svg
                aria-hidden="true"
                fill="none"
                height="18"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                viewBox="0 0 24 24"
                width="18"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20 20l-4.2-4.2" />
              </svg>
              {/* O quadro quebra o texto em duas linhas no celular; um
                  placeholder de input não quebra, então o texto fica ao lado
                  do campo e some quando há o que ler. */}
              <span className="wa-ignored-search-field">
                {search === "" && (
                  <span aria-hidden="true" className="wa-ignored-search-hint">
                    Buscar nas suas conversas ou digitar um número
                  </span>
                )}
                <input
                  aria-label="Buscar nas suas conversas ou digitar um número"
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setMarkError(null);
                  }}
                />
              </span>
            </label>
            {showBlock && (
              <div className="wa-ignored-card">
                {matched === null || matched.status === "loading" ? (
                  <p className="wa-ignored-hint">Buscando conversas...</p>
                ) : matched.status === "error" ? (
                  <p className="wa-ignored-hint" role="alert">
                    Não foi possível buscar suas conversas agora.
                  </p>
                ) : matched.items.length === 0 ? (
                  <p className="wa-ignored-hint">Nenhuma conversa encontrada.</p>
                ) : (
                  <ul className="wa-ignored-rows">
                    {matched.items.map((conversation) => {
                      const name =
                        conversation.customerName ??
                        phoneLabel(conversation.externalContactId);
                      const nameIsPhone = !conversation.customerName;
                      const busy = pending?.id === conversation.id;
                      return (
                        <li className="wa-ignored-row" key={conversation.id}>
                          <Avatar letter={firstLetter(conversation.customerName)} />
                          <div className="wa-ignored-text">
                            <span className="wa-ignored-name">{name}</span>
                            {!nameIsPhone && (
                              <span className="wa-ignored-caption is-phone">
                                {phoneLabel(conversation.externalContactId)}
                              </span>
                            )}
                          </div>
                          <button
                            aria-label={`Ignorar ${name}`}
                            className="wa-ignored-action is-neutral"
                            disabled={pending !== null}
                            type="button"
                            onClick={() =>
                              void ignoreConversation(conversation, name)
                            }
                          >
                            {busy ? "Ignorando..." : "Ignorar"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {phoneLike && (
                  <div className="wa-ignored-row is-add">
                    <Avatar letter="" />
                    <div className="wa-ignored-text">
                      <span className="wa-ignored-name">Adicionar {query}</span>
                    </div>
                    <button
                      className="wa-ignored-action is-neutral"
                      disabled={pending !== null}
                      type="button"
                      onClick={() => void addPhone()}
                    >
                      {pending?.kind === "add" ? "Adicionando..." : "Adicionar"}
                    </button>
                  </div>
                )}
                {markError && (
                  <p className="wa-ignored-hint is-error" role="alert">
                    {markError}
                  </p>
                )}
              </div>
            )}
            <div
              aria-busy={status === "loading" || undefined}
              className="wa-ignored-area"
            >
              {status === "loading" && (
                <p className="wa-ignored-state">Carregando contatos…</p>
              )}
              {status === "error" && (
                <div className="wa-ignored-state">
                  <p role="alert">Não foi possível carregar a lista agora.</p>
                  <button
                    className="wa-ignored-link"
                    type="button"
                    onClick={retry}
                  >
                    Tentar de novo
                  </button>
                </div>
              )}
              {status === "ready" && items.length === 0 && (
                <p className="wa-ignored-state">Nenhum contato nesta lista.</p>
              )}
              {status === "ready" && items.length > 0 && (
                <>
                  <ul className="wa-ignored-card wa-ignored-rows">
                    {items.map((contact) => {
                      const displayName = contact.displayName?.trim() || null;
                      const name =
                        displayName ?? phoneLabel(contact.externalContactId);
                      const caption = captionFor(
                        contact,
                        displayName === null,
                        timeZone,
                      );
                      return (
                        <li className="wa-ignored-row" key={contact.contactId}>
                          <Avatar letter={firstLetter(displayName)} />
                          <div className="wa-ignored-text">
                            <span className="wa-ignored-name">{name}</span>
                            {caption && (
                              <span
                                className={`wa-ignored-caption${caption.phone ? " is-phone" : ""}`}
                              >
                                {caption.text}
                              </span>
                            )}
                          </div>
                          <button
                            aria-label={`Remover ${name}`}
                            className="wa-ignored-action"
                            disabled={pending !== null}
                            type="button"
                            onClick={() => void remove(contact, name)}
                          >
                            {pending?.kind === "remove" &&
                            pending.id === contact.contactId
                              ? "Removendo..."
                              : "Remover"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {removeError && (
                    <p className="wa-ignored-hint is-error" role="alert">
                      Não foi possível remover agora. Tente novamente.
                    </p>
                  )}
                  {total > items.length && (
                    <button
                      className="wa-ignored-link"
                      disabled={loadingMore}
                      type="button"
                      onClick={() => void loadMore()}
                    >
                      {loadingMore ? "Carregando..." : "Carregar mais"}
                    </button>
                  )}
                  {moreError && (
                    <p className="wa-ignored-hint is-error" role="alert">
                      Não foi possível carregar mais contatos agora.
                    </p>
                  )}
                  <p className="wa-ignored-note">
                    Remover não apaga nada: a IA só volta a poder responder esse
                    contato em uma nova conversa comercial.
                  </p>
                </>
              )}
            </div>
          </>
        )}
        <p className="sr-only" role="status">
          {notice}
        </p>
      </div>
    </SettingsPage>
  );
}
