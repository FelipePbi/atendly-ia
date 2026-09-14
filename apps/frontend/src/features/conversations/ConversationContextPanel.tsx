"use client";

import clsx from "clsx";
import Link from "next/link";

import type { Conversation, SessionCategory } from "@/data";

import { conversationLabel, formatPhone, initials } from "./format";

const categoryValues = [
  "COMMERCIAL",
  "UNCLASSIFIED",
  "PERSONAL",
] as const satisfies readonly SessionCategory[];

const categoryLabel: Record<SessionCategory, string> = {
  COMMERCIAL: "Comercial",
  PERSONAL: "Pessoal",
  UNCLASSIFIED: "Não classificada",
};

/**
 * O contexto do contato ao lado da conversa (painel no desktop, folha no
 * mobile). Nada é criado nem editado aqui: memória, nota e tag são de
 * Clientes. Categoria e "ignorar na IA" são as exceções deliberadas — as duas
 * decisões do contato que valem sobre o que a plataforma inferiu (vault), e é
 * aqui que a profissional as declara.
 */
export function ConversationContextPanel({
  categoryBusy,
  categoryError,
  conversation,
  ignoredBusy,
  ignoredError,
  onResolve,
  onSetCategory,
  onToggleIgnored,
}: {
  categoryBusy: boolean;
  categoryError: string | null;
  conversation: Conversation;
  ignoredBusy: boolean;
  ignoredError: string | null;
  onResolve: () => void;
  onSetCategory: (category: SessionCategory | null) => void;
  onToggleIgnored: () => void;
}) {
  const person = conversationLabel(conversation);
  const category = conversation.category ?? "UNCLASSIFIED";
  const categorySource = conversation.categorySource ?? "AUTOMATIC";
  const suggestedCategory = conversation.suggestedCategory ?? null;
  return (
    <>
      <div className="context-profile">
        <span className="avatar">{initials(person)}</span>
        <div>
          <strong>{person}</strong>
          <span>{formatPhone(conversation.externalContactId)}</span>
        </div>
      </div>
      <section className="context-section">
        <div className="context-section-head">
          <h3>Cliente</h3>
        </div>
        {conversation.customerId ? (
          <>
            <p>Abra o cadastro para consultar dados e histórico de agendamentos.</p>
            <Link
              className="btn btn-secondary"
              href={`/clientes/detalhes?id=${conversation.customerId}`}
            >
              Abrir cliente
            </Link>
          </>
        ) : (
          <p>Este contato ainda não é um cliente cadastrado.</p>
        )}
      </section>
      <section className="context-section context-category">
        <div className="context-section-head">
          <h3>Categoria</h3>
          <span
            className={clsx(
              "badge",
              categorySource === "MANUAL" ? "badge-success" : "badge-ai",
            )}
          >
            {categorySource === "MANUAL"
              ? "Definida manualmente"
              : "Classificação automática"}
          </span>
        </div>
        {suggestedCategory && suggestedCategory !== category && (
          <p className="context-category-hint">
            A IA sugere {categoryLabel[suggestedCategory]}. A escolha final é
            sua.
          </p>
        )}
        {categoryError && (
          <p className="context-category-error" role="alert">
            {categoryError}
          </p>
        )}
        <div
          aria-label="Categoria da conversa"
          className="context-category-options"
          role="group"
        >
          {categoryValues.map((value) => (
            <button
              aria-pressed={category === value}
              className={clsx("chip", category === value && "is-active")}
              disabled={categoryBusy}
              key={value}
              onClick={() => onSetCategory(value)}
              type="button"
            >
              {categoryLabel[value]}
            </button>
          ))}
        </div>
        <button
          className="btn btn-tertiary"
          disabled={categoryBusy || categorySource !== "MANUAL"}
          onClick={() => onSetCategory(null)}
          type="button"
        >
          Usar classificação automática
        </button>
      </section>
      <section className="context-section context-ignore">
        <div className="context-section-head">
          <h3>Ignorar na IA</h3>
          <span
            className={clsx(
              "badge",
              conversation.ignored ? "badge-attention" : "badge-success",
            )}
          >
            {conversation.ignored ? "Contato ignorado" : "A IA usa esta conversa"}
          </span>
        </div>
        {/*
         * Ignorar é regra do contato, avaliada antes de qualquer leitura de
         * conteúdo — e é reversível. A copy diz o que a marca faz (o conteúdo
         * deixa de virar contexto) e o que ela não faz (apagar, bloquear ou
         * esconder as mensagens), aqui e na confirmação.
         */}
        <p>
          {conversation.ignored
            ? "A IA não usa esta conversa: o conteúdo não vira contexto e o histórico anterior deixa de ser contexto. As mensagens continuam aqui e você segue atendendo normalmente."
            : "A IA usa esta conversa como contexto. Ao ignorar, o conteúdo deixa de alimentá-la — as mensagens continuam aqui."}
        </p>
        {ignoredError && (
          <p className="context-category-error" role="alert">
            {ignoredError}
          </p>
        )}
        <button
          className="btn btn-secondary"
          disabled={ignoredBusy}
          onClick={onToggleIgnored}
          type="button"
        >
          {conversation.ignored
            ? "Voltar a usar na IA"
            : "Ignorar contato na IA"}
        </button>
      </section>
      <section className="context-section context-actions">
        <Link className="btn btn-secondary" href="/agenda/novo">
          Criar agendamento
        </Link>
        <Link className="btn btn-tertiary" href="/clientes">
          Abrir clientes
        </Link>
        <button
          className="btn btn-tertiary"
          disabled={conversation.status === "CLOSED"}
          onClick={onResolve}
          type="button"
        >
          Marcar como resolvida
        </button>
      </section>
    </>
  );
}
