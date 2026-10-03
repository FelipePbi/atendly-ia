"use client";

import { useEffect, useState } from "react";

import type { Conversation } from "@/data";
import { BffHttpError } from "@/data";
import { Icon } from "@/shared/icons/Icon";
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
