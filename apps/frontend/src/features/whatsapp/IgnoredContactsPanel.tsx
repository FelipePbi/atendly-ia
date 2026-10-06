"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { Conversation } from "@/data";
import { BffHttpError } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { formatBrazilianPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

/**
 * Contatos ignorados, etapa opcional entre conectar e testar (vault
 * `02-Ativacao-e-Teste-do-WhatsApp.md` §"Contatos ignorados"). Marcar uma
 * conversa existente reusa `PUT /v1/conversations/:id/ignore`, o mesmo
 * caminho que a IA já respeita; marcar por telefone usa a rota nova que cria
 * o contato quando ele ainda não existe. Cada confirmação em tela só aparece
 * depois da resposta da API — nada é afirmado como ignorado sem a marcação
 * gravada.
 */
export function IgnoredContactsPanel() {
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [listError, setListError] = useState<string | null>(null);
  const [markedConversationIds, setMarkedConversationIds] = useState<
    Set<string>
  >(new Set());
  const [pendingConversationId, setPendingConversationId] = useState<
    string | null
  >(null);
  const [phone, setPhone] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [markedPhones, setMarkedPhones] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    getProductServices()
      .conversations.list({ ignored: false, limit: 20 })
      .then((list) => {
        if (active) setConversations(list);
      })
      .catch(() => {
        if (active) setListError("Não foi possível carregar suas conversas.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function markConversation(id: string) {
    setPendingConversationId(id);
    setListError(null);
    try {
      await getProductServices().conversations.setIgnored(id, true);
      setMarkedConversationIds((current) => new Set(current).add(id));
    } catch {
      setListError("Não foi possível marcar este contato. Tente novamente.");
    } finally {
      setPendingConversationId(null);
    }
  }

  async function addPhone() {
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneError("Informe um número de telefone.");
      return;
    }
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const contact = await getProductServices().conversations.ignoreByPhone(
        trimmed,
        true,
      );
      setMarkedPhones((current) => [...current, contact.externalContactId]);
      setPhone("");
    } catch (error) {
      if (error instanceof BffHttpError && error.code === "VALIDATION_ERROR") {
        setPhoneError("Use o formato +55 11 99999-0000, com DDD.");
      } else {
        setPhoneError("Não foi possível marcar este número. Tente novamente.");
      }
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <div className="onboarding-form">
      <div className="field">
        <span className="label">Conversas já existentes</span>
        {conversations === null && !listError && (
          <p className="field-help">Carregando conversas...</p>
        )}
        {listError && (
          <div className="onboarding-note is-important" role="alert">
            <Icon name="alert" />
            <span>{listError}</span>
          </div>
        )}
        {conversations !== null && conversations.length === 0 && (
          <p className="field-help">
            Nenhuma conversa disponível ainda para escolher.
          </p>
        )}
        {conversations !== null && conversations.length > 0 && (
          <ul className="onboarding-points">
            {conversations.map((conversation) => {
              const marked = markedConversationIds.has(conversation.id);
              return (
                <li key={conversation.id}>
                  <Icon name={marked ? "check" : "user"} />
                  <span>
                    {conversation.customerName ?? conversation.externalContactId}
                  </span>
                  <button
                    className="btn btn-secondary"
                    disabled={marked || pendingConversationId === conversation.id}
                    type="button"
                    onClick={() => void markConversation(conversation.id)}
                  >
                    {marked
                      ? "Ignorado"
                      : pendingConversationId === conversation.id
                        ? "Marcando..."
                        : "Ignorar"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="field">
        <span className="label">Informar um número manualmente</span>
        <div className="choice-grid">
          <input
            className="input"
            placeholder="+55 11 99999-0000"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void addPhone();
            }}
          />
          <button
            className="btn btn-secondary"
            disabled={phoneBusy}
            type="button"
            onClick={() => void addPhone()}
          >
            {phoneBusy ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
        {phoneError && (
          <div className="onboarding-note is-important" role="alert">
            <Icon name="alert" />
            <span>{phoneError}</span>
          </div>
        )}
        {markedPhones.length > 0 && (
          <ul className="onboarding-points">
            {markedPhones.map((externalContactId) => (
              <li key={externalContactId}>
                <Icon name="check" />
                <span>{externalContactId} ignorado</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Espera da busca antes de ler de novo: digitar não pede uma leitura por tecla. */
const SEARCH_DEBOUNCE_MS = 250;

type KnownConversation = { externalContactId: string; ignored: boolean };

function contactLabel(conversation: Conversation): string {
  return (
    conversation.customerName ??
    formatBrazilianPhone(conversation.externalContactId, "plus") ??
    conversation.externalContactId
  );
}

/** Até duas iniciais do nome (as duas primeiras palavras que começam com
 * letra); sem nome, quem desenha cai no ícone de pessoa. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");
}

function CheckMark({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * Corpo próprio do onboarding para os contatos ignorados (quadro 4.5): busca,
 * as conversas lidas sem o filtro `ignored` e a linha "Adicionar por telefone".
 * Cada linha é uma caixa de marcar que reflete o `ignored` lido; tocar grava na
 * hora com `PUT /v1/conversations/:id/ignore` e a caixa só muda depois da
 * resposta. A folha de Configurações segue com `IgnoredContactsPanel`.
 * `onCountChange` leva ao rodapé quantas pessoas estão marcadas, sem contar
 * duas vezes o mesmo contato.
 */
export function OnboardingIgnoredContacts({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [listError, setListError] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  // Tudo o que já foi lido, por conversa: uma busca nova troca as linhas
  // visíveis, mas quem foi marcado antes continua contando no rodapé.
  const [known, setKnown] = useState<Record<string, KnownConversation>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [markedPhones, setMarkedPhones] = useState<string[]>([]);
  const phoneInput = useRef<HTMLInputElement>(null);
  const idPrefix = useId();

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === query) return;
    const timer = setTimeout(() => setQuery(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, query]);

  useEffect(() => {
    let active = true;
    getProductServices()
      .conversations.list(query ? { limit: 20, search: query } : { limit: 20 })
      .then((list) => {
        if (!active) return;
        setListError(null);
        setConversations(list);
        setKnown((current) => {
          const next = { ...current };
          for (const conversation of list) {
            next[conversation.id] = {
              externalContactId: conversation.externalContactId,
              ignored: conversation.ignored === true,
            };
          }
          return next;
        });
      })
      .catch(() => {
        if (active) setListError("Não foi possível carregar suas conversas.");
      });
    return () => {
      active = false;
    };
  }, [query]);

  useEffect(() => {
    if (phoneOpen) phoneInput.current?.focus();
  }, [phoneOpen]);

  const visibleContacts = new Set(
    (conversations ?? []).map((conversation) => conversation.externalContactId),
  );
  const phoneRows = markedPhones.filter((id) => !visibleContacts.has(id));
  const ignoredContacts = new Set<string>(markedPhones);
  for (const entry of Object.values(known)) {
    if (entry.ignored) ignoredContacts.add(entry.externalContactId);
  }
  const count = ignoredContacts.size;

  useEffect(() => {
    onCountChange?.(count);
  }, [count, onCountChange]);

  async function toggleConversation(conversation: Conversation) {
    if (pendingId) return;
    const next = known[conversation.id]?.ignored !== true;
    setPendingId(conversation.id);
    setMarkError(null);
    try {
      await getProductServices().conversations.setIgnored(conversation.id, next);
      setKnown((current) => ({
        ...current,
        [conversation.id]: {
          externalContactId: conversation.externalContactId,
          ignored: next,
        },
      }));
      // A regra é do contato: desmarcar a conversa também tira o número que
      // tinha sido adicionado por telefone, senão o rodapé segue contando.
      if (!next) {
        setMarkedPhones((current) =>
          current.filter((id) => id !== conversation.externalContactId),
        );
      }
    } catch {
      setMarkError("Não foi possível marcar este contato. Tente novamente.");
    } finally {
      setPendingId(null);
    }
  }

  async function addPhone() {
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneError("Informe um número de telefone.");
      return;
    }
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const contact = await getProductServices().conversations.ignoreByPhone(
        trimmed,
        true,
      );
      setMarkedPhones((current) =>
        current.includes(contact.externalContactId)
          ? current
          : [...current, contact.externalContactId],
      );
      // Uma conversa conhecida do mesmo contato passa a aparecer marcada.
      setKnown((current) => {
        const next = { ...current };
        for (const [id, entry] of Object.entries(current)) {
          if (entry.externalContactId === contact.externalContactId) {
            next[id] = { ...entry, ignored: true };
          }
        }
        return next;
      });
      setPhone("");
    } catch (error) {
      if (error instanceof BffHttpError && error.code === "VALIDATION_ERROR") {
        setPhoneError("Use o formato +55 11 99999-0000, com DDD.");
      } else {
        setPhoneError("Não foi possível marcar este número. Tente novamente.");
      }
    } finally {
      setPhoneBusy(false);
    }
  }

  const rows = conversations ?? [];
  return (
    <div className="ignored-onboarding">
      <label className="ignored-search">
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
        <input
          aria-label="Buscar nas suas conversas"
          placeholder="Buscar nas suas conversas"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            // Dentro do formulário da etapa, Enter seguiria para o teste.
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </label>
      {listError && (
        <div className="onboarding-note is-important" role="alert">
          <Icon name="alert" />
          <span>{listError}</span>
        </div>
      )}
      {markError && (
        <div className="onboarding-note is-important" role="alert">
          <Icon name="alert" />
          <span>{markError}</span>
        </div>
      )}
      <div className="ignored-card">
        {conversations === null && !listError && (
          <p className="ignored-status">Carregando conversas...</p>
        )}
        {conversations !== null && rows.length === 0 && phoneRows.length === 0 && (
          <p className="ignored-status">
            {query
              ? "Nenhuma conversa encontrada."
              : "Nenhuma conversa disponível ainda para escolher."}
          </p>
        )}
        {(rows.length > 0 || phoneRows.length > 0) && (
          <ul className="ignored-list">
            {rows.map((conversation) => {
              const name = contactLabel(conversation);
              const initials = conversation.customerName
                ? initialsOf(conversation.customerName)
                : "";
              const preview = conversation.lastMessage?.body ?? "";
              const checked = known[conversation.id]?.ignored === true;
              const nameId = `${idPrefix}-${conversation.id}-name`;
              const previewId = `${idPrefix}-${conversation.id}-preview`;
              return (
                <li key={conversation.id}>
                  <button
                    aria-busy={pendingId === conversation.id || undefined}
                    aria-checked={checked}
                    aria-describedby={preview ? previewId : undefined}
                    aria-labelledby={nameId}
                    className="ignored-row"
                    role="checkbox"
                    type="button"
                    onClick={() => void toggleConversation(conversation)}
                  >
                    <span
                      aria-hidden="true"
                      className={`ignored-avatar${conversation.customerId ? " is-linked" : ""}`}
                    >
                      {initials || <Icon name="user" />}
                    </span>
                    <span className="ignored-text">
                      <span className="ignored-name" id={nameId}>
                        {name}
                      </span>
                      {preview && (
                        <span className="ignored-preview" id={previewId}>
                          {preview}
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`ignored-box${checked ? " is-checked" : ""}`}
                    >
                      {checked && <CheckMark size={14} />}
                    </span>
                  </button>
                </li>
              );
            })}
            {phoneRows.map((externalContactId) => {
              const nameId = `${idPrefix}-phone-${externalContactId}`;
              return (
                <li key={`phone-${externalContactId}`}>
                  <span
                    aria-checked="true"
                    aria-disabled="true"
                    aria-labelledby={nameId}
                    className="ignored-row"
                    role="checkbox"
                  >
                    <span aria-hidden="true" className="ignored-avatar">
                      <Icon name="user" />
                    </span>
                    <span className="ignored-text">
                      <span className="ignored-name" id={nameId}>
                        {formatBrazilianPhone(externalContactId, "plus") ??
                          externalContactId}
                      </span>
                    </span>
                    <span aria-hidden="true" className="ignored-box is-checked">
                      <CheckMark size={14} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <button
          aria-expanded={phoneOpen}
          className="ignored-add"
          type="button"
          onClick={() => setPhoneOpen((open) => !open)}
        >
          <span aria-hidden="true" className="ignored-add-mark">
            <svg
              fill="none"
              height="18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="18"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span>Adicionar por telefone</span>
        </button>
        {phoneOpen && (
          <div className="ignored-phone">
            <div className="choice-grid">
              <input
                ref={phoneInput}
                aria-label="Número de telefone"
                className="input"
                placeholder="+55 11 99999-0000"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void addPhone();
                }}
              />
              <button
                className="btn btn-secondary"
                disabled={phoneBusy}
                type="button"
                onClick={() => void addPhone()}
              >
                {phoneBusy ? "Adicionando..." : "Adicionar"}
              </button>
            </div>
            {phoneError && (
              <div className="onboarding-note is-important" role="alert">
                <Icon name="alert" />
                <span>{phoneError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
