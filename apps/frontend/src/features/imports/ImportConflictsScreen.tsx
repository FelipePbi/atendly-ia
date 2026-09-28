"use client";

import { useEffect, useState } from "react";

import { BffHttpError } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Badge } from "@/shared/ui/Badge";
import { StatePanel } from "@/shared/ui/States";

import { newIdempotencyKey } from "./idempotency";
import { ImportsPage } from "./ImportsLayout";
import {
  CATEGORY_LABELS,
  conflictReasonLabel,
  DECISION_LABELS,
  decisionRequiresTarget,
  decisionsForCategory,
  groupAvailabilityByDay,
  type ItemDecisionKind,
} from "./labels";
import type {
  ImportAvailabilityGridRule,
  ImportCategory,
  ImportItem,
  ImportPreviewCategory,
} from "./types";

const PAGE_SIZE = 20;

/**
 * O que esta tela precisa saber de uma categoria: qual é e quantos itens dela
 * esperam decisão. O preview entrega uma `ImportPreviewCategory` inteira e o
 * progresso da execução (Goal020/WU-08) entrega só as contagens — nenhum dos
 * dois precisa fabricar os campos que o outro tem.
 */
export type ConflictCategorySummary = Pick<
  ImportPreviewCategory,
  "category" | "needsReviewCount"
>;

/**
 * Conflitos resolvidos por item (Goal020/WU-07): entra a partir do preview,
 * nunca bloqueia o resto da importação — o botão de importar continua
 * disponível em paralelo (regra do vault: poucos conflitos não podem
 * bloquear milhares de registros válidos).
 */
export function ImportConflictsScreen({
  categories,
  onBack,
  sessionId,
}: {
  categories: ConflictCategorySummary[];
  onBack: () => void;
  sessionId: string;
}) {
  const [activeCategory, setActiveCategory] = useState<ImportCategory | null>(
    null,
  );

  if (activeCategory) {
    return (
      <ConflictCategoryScreen
        category={activeCategory}
        key={activeCategory}
        onBack={() => setActiveCategory(null)}
        sessionId={sessionId}
      />
    );
  }

  return (
    <ImportsPage
      description="Nada muda até você confirmar cada decisão. O restante da importação não espera por eles."
      title="Itens que precisam da sua decisão"
    >
      <div className="imports-panel">
        <ul className="imports-rows">
          {categories.map((category) => (
            <li key={category.category}>
              <button
                className="imports-conflict-row"
                type="button"
                onClick={() => setActiveCategory(category.category)}
              >
                <strong>{CATEGORY_LABELS[category.category]}</strong>
                <Badge label={`${category.needsReviewCount}`} tone="warning" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="imports-actions">
        <button className="btn btn-secondary" type="button" onClick={onBack}>
          Voltar
        </button>
      </div>
    </ImportsPage>
  );
}

function ConflictCategoryScreen({
  category,
  onBack,
  sessionId,
}: {
  category: ImportCategory;
  onBack: () => void;
  sessionId: string;
}) {
  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resolvedElsewhere, setResolvedElsewhere] = useState<Set<string>>(
    new Set(),
  );
  const [decidingId, setDecidingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .migration.listImportItems(
        sessionId,
        category,
        { status: "NEEDS_REVIEW", limit: PAGE_SIZE, offset: 0 },
        controller.signal,
      )
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setListError(true);
      });
    return () => controller.abort();
    // `key={category}` no chamador remonta o componente a cada categoria: o
    // efeito roda uma vez por instância, nunca precisa resetar estado aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    if (!items) return;
    setLoadingMore(true);
    try {
      const page = await getProductServices().migration.listImportItems(
        sessionId,
        category,
        { status: "NEEDS_REVIEW", limit: PAGE_SIZE, offset: items.length },
      );
      setItems((current) => [...(current ?? []), ...page.items]);
      setTotal(page.total);
    } catch {
      setListError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleDecided(itemId: string) {
    setItems((current) => current?.filter((item) => item.id !== itemId) ?? current);
    setTotal((current) => Math.max(0, current - 1));
    setDecidingId(null);
  }

  function handleAlreadyDecided(itemId: string) {
    setResolvedElsewhere((current) => new Set(current).add(itemId));
    setDecidingId(null);
  }

  return (
    <ImportsPage
      description="Cada decisão vale só para este item. O restante da importação segue normalmente."
      title={CATEGORY_LABELS[category]}
    >
      <div className="imports-panel">
        {items === null && !listError && (
          <p aria-busy="true" className="imports-note">
            Carregando itens…
          </p>
        )}
        {listError && (
          <StatePanel
            description="Não foi possível carregar os itens desta categoria agora."
            icon="alert"
            title="Itens indisponíveis"
            tone="error"
          />
        )}
        {items && items.length === 0 && !listError && (
          <p className="imports-note">
            Não há mais itens para revisar nesta categoria.
          </p>
        )}
        {items && items.length > 0 && (
          <ul className="imports-conflict-items">
            {items.map((item) => (
              <ConflictItemRow
                category={category}
                expanded={decidingId === item.id}
                item={item}
                key={item.id}
                onAlreadyDecided={() => handleAlreadyDecided(item.id)}
                onCollapse={() => setDecidingId(null)}
                onDecided={() => handleDecided(item.id)}
                onExpand={() => setDecidingId(item.id)}
                resolvedElsewhere={resolvedElsewhere.has(item.id)}
                sessionId={sessionId}
              />
            ))}
          </ul>
        )}
        {items && items.length < total && (
          <button
            className="btn btn-tertiary"
            disabled={loadingMore}
            type="button"
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        )}
      </div>
      <div className="imports-actions is-split">
        <button className="btn btn-secondary" type="button" onClick={onBack}>
          Voltar
        </button>
      </div>
    </ImportsPage>
  );
}

function ConflictItemRow({
  category,
  expanded,
  item,
  onAlreadyDecided,
  onCollapse,
  onDecided,
  onExpand,
  resolvedElsewhere,
  sessionId,
}: {
  category: ImportCategory;
  expanded: boolean;
  item: ImportItem;
  onAlreadyDecided: () => void;
  onCollapse: () => void;
  onDecided: () => void;
  onExpand: () => void;
  resolvedElsewhere: boolean;
  sessionId: string;
}) {
  const decisions = decisionsForCategory(category);
  const [decision, setDecision] = useState<ItemDecisionKind | null>(null);
  const [targetInternalId, setTargetInternalId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  if (resolvedElsewhere) {
    return (
      <li className="imports-conflict-item">
        <div>
          <strong>{item.label ?? item.externalId}</strong>
          <p className="imports-note">
            Este item já foi decidido antes de você confirmar.
          </p>
        </div>
        <Badge label="Já decidido" tone="neutral" />
      </li>
    );
  }

  async function submitDecision(
    decisionValue: ItemDecisionKind,
    targetInternalIdValue?: string,
  ) {
    setSubmitting(true);
    setDecisionError(null);
    try {
      await getProductServices().migration.decideImportItem(
        sessionId,
        item.id,
        { decision: decisionValue, targetInternalId: targetInternalIdValue },
        newIdempotencyKey(),
      );
      onDecided();
    } catch (caught: unknown) {
      if (
        caught instanceof BffHttpError &&
        caught.code === "IMPORT_ITEM_ALREADY_DECIDED"
      ) {
        onAlreadyDecided();
        return;
      }
      setDecisionError("Não foi possível registrar essa decisão agora. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (!decision) return;
    const needsTarget = decisionRequiresTarget(decision);
    if (needsTarget && !targetInternalId.trim()) {
      setDecisionError("Informe o identificador do cadastro existente.");
      return;
    }
    await submitDecision(
      decision,
      needsTarget ? targetInternalId.trim() : undefined,
    );
  }

  if (!expanded) {
    return (
      <li className="imports-conflict-item">
        <div>
          <strong>{item.label ?? item.externalId}</strong>
          <p className="imports-note">{conflictReasonLabel(item.reasonCode)}</p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            setDecision(null);
            setTargetInternalId("");
            setDecisionError(null);
            onExpand();
          }}
        >
          Resolver
        </button>
      </li>
    );
  }

  if (category === "AVAILABILITY") {
    return (
      <li className="imports-conflict-item is-expanded">
        <div>
          <strong>{item.label ?? item.externalId}</strong>
          <p className="imports-note">{conflictReasonLabel(item.reasonCode)}</p>
        </div>
        <div className="imports-availability-comparison">
          <AvailabilityGridPreview
            rules={item.currentAvailability}
            title="Horários atuais"
          />
          <AvailabilityGridPreview
            rules={item.proposedAvailability}
            title="Horários do Minha Agenda"
          />
        </div>
        {decisionError && (
          <p className="field-help" role="alert">
            {decisionError}
          </p>
        )}
        <div className="imports-actions is-split">
          <button
            className="btn btn-secondary"
            disabled={submitting}
            type="button"
            onClick={onCollapse}
          >
            Cancelar
          </button>
          <button
            className="btn btn-secondary"
            disabled={submitting}
            type="button"
            onClick={() => void submitDecision("EXCLUDE")}
          >
            Manter meus horários
          </button>
          <button
            className="btn btn-primary"
            disabled={submitting}
            type="button"
            onClick={() => void submitDecision("INCLUDE")}
          >
            Usar os horários da Minha Agenda
          </button>
        </div>
      </li>
    );
  }

  const groupName = `decision-${item.id}`;

  return (
    <li className="imports-conflict-item is-expanded">
      <div>
        <strong>{item.label ?? item.externalId}</strong>
        <p className="imports-note">{conflictReasonLabel(item.reasonCode)}</p>
      </div>
      <fieldset className="imports-decision-options">
        <legend>O que fazer com este item?</legend>
        {decisions.map((option) => (
          <label className="imports-decision-option" key={option}>
            <input
              checked={decision === option}
              name={groupName}
              type="radio"
              value={option}
              onChange={() => setDecision(option)}
            />
            {DECISION_LABELS[option]}
          </label>
        ))}
      </fieldset>
      {decision && decisionRequiresTarget(decision) && (
        <div className="field">
          <label className="label" htmlFor={`${groupName}-target`}>
            Identificador do cadastro existente
          </label>
          <div className="input-wrap">
            <input
              className="input"
              id={`${groupName}-target`}
              type="text"
              value={targetInternalId}
              onChange={(event) => setTargetInternalId(event.target.value)}
            />
          </div>
        </div>
      )}
      {decisionError && (
        <p className="field-help" role="alert">
          {decisionError}
        </p>
      )}
      <div className="imports-actions is-split">
        <button
          className="btn btn-secondary"
          disabled={submitting}
          type="button"
          onClick={onCollapse}
        >
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          disabled={submitting || !decision}
          type="button"
          onClick={() => void submit()}
        >
          {submitting ? "Confirmando..." : "Confirmar decisão"}
        </button>
      </div>
    </li>
  );
}

/**
 * Uma grade da comparação de disponibilidade (Goal062 §2): a atual do
 * negócio ou a proposta pela origem, por dia da semana. Sem grade — origem
 * ilegível ou sobreposta — mostra que não há o que comparar, nunca uma
 * grade vazia sem explicação.
 */
function AvailabilityGridPreview({
  rules,
  title,
}: {
  rules: ImportAvailabilityGridRule[] | null | undefined;
  title: string;
}) {
  const days = groupAvailabilityByDay(rules);
  return (
    <div className="imports-availability-grid">
      <strong>{title}</strong>
      {days.length === 0 ? (
        <p className="imports-note">Nenhum horário para comparar.</p>
      ) : (
        <ul>
          {days.map((day) => (
            <li key={day.dayOfWeek}>
              <span>{day.label}</span>
              <span>{day.intervals.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
