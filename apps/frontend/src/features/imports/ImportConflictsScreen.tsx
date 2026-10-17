"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { schedulingRefusalCode } from "@/data/http/schedulingRefusal";
import {
  formatServiceDuration,
  formatServicePrice,
} from "@/features/services/serviceFormatting";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Badge } from "@/shared/ui/Badge";
import { StatePanel } from "@/shared/ui/States";

import { newIdempotencyKey } from "./idempotency";
import { ImportsPage } from "./ImportsLayout";
import {
  CATEGORY_ORDER,
  conflictReasonLabel,
  conflictResultLabel,
  CONFLICTS_FOOTER_NOTE,
  conflictsDescription,
  conflictShortReason,
  conflictsTitle,
  customerQuestionLabel,
  groupAvailabilityByDay,
  type ImportItemCandidate,
  type ImportProposedService,
  type ImportServiceCandidate,
  isServiceCandidate,
  type ItemDecisionKind,
  SUGGESTED_RECORD_GONE,
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

/** O que o cartão registra de uma decisão tomada, para a linha de resultado. */
type DecisionRecord =
  | {
      kind: "decided";
      decision: ItemDecisionKind;
      targetInternalId?: string;
      targetName?: string;
    }
  | { kind: "already" };

/** O que já foi lido de uma categoria (2.I6: uma leitura por categoria). */
interface CategoryRead {
  items: ImportItem[];
  /** `total` da última leitura: itens em revisão que a rota tinha então. */
  total: number;
  /** Decisões tomadas depois da última leitura; elas já saíram da fila. */
  decidedSince: number;
}

type CategoryReads = Partial<Record<ImportCategory, CategoryRead>>;

/**
 * Conflitos resolvidos por item (Goal020/WU-07, 2.I6 no Goal137): uma lista de
 * cartões, um aberto por vez, que decide sobre o cadastro que a análise
 * sugeriu — nunca sobre um identificador digitado. Entra a partir do preview
 * ou da tela parada e nunca bloqueia o resto da importação (regra do vault:
 * poucos conflitos não podem bloquear milhares de registros válidos).
 */
export function ImportConflictsScreen({
  categories,
  initialCategory,
  onBack,
  readyCount,
  sessionId,
}: {
  categories: ConflictCategorySummary[];
  /**
   * Mostra só os itens de uma categoria (a ação de um item do 2.I8). Continuar
   * sai da tela, como voltar fazia.
   */
  initialCategory?: ImportCategory;
  onBack: () => void;
  /** Registros que já estão prontos: a segunda frase da descrição. */
  readyCount?: number;
  sessionId: string;
}) {
  // A lista e o título são os da abertura: o número do título não muda
  // enquanto a tela está aberta, e o cartão decidido continua contado.
  const [shown] = useState(() =>
    CATEGORY_ORDER.flatMap((category) => {
      if (initialCategory && category !== initialCategory) return [];
      const entry = categories.find(
        (candidate) => candidate.category === category,
      );
      return entry ? [entry] : [];
    }),
  );
  const [reviewCount] = useState(() =>
    shown.reduce((total, entry) => total + entry.needsReviewCount, 0),
  );
  const readable = shown.filter((entry) => entry.needsReviewCount > 0);

  const [reads, setReads] = useState<CategoryReads | null>(() =>
    readable.length === 0 ? {} : null,
  );
  const [readFailed, setReadFailed] = useState(false);
  const [allFailed, setAllFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [records, setRecords] = useState<Record<string, DecisionRecord>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    if (readable.length === 0) return () => controller.abort();
    void Promise.allSettled(
      readable.map((entry) =>
        Promise.resolve(
          getProductServices().migration.listImportItems(
            sessionId,
            entry.category,
            { status: "NEEDS_REVIEW", limit: PAGE_SIZE, offset: 0 },
            controller.signal,
          ),
        ).then((page) => {
          if (!page || !Array.isArray(page.items))
            throw new Error("invalid page");
          return page;
        }),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const next: CategoryReads = {};
      let failures = 0;
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next[readable[index].category] = {
            decidedSince: 0,
            items: result.value.items,
            total: result.value.total,
          };
        } else {
          failures += 1;
        }
      });
      setReads(next);
      setReadFailed(failures > 0);
      setAllFailed(failures === results.length);
    });
    return () => controller.abort();
    // `shown` e `readable` vêm da abertura da tela: o efeito roda uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = reads === null;
  const orderedItems = shown.flatMap(
    (entry) => reads?.[entry.category]?.items ?? [],
  );
  const firstUndecided = orderedItems.find((item) => !records[item.id]);
  const openId =
    picked &&
    !records[picked] &&
    orderedItems.some((item) => item.id === picked)
      ? picked
      : (firstUndecided?.id ?? null);

  const undecidedLoaded = (category: ImportCategory) =>
    (reads?.[category]?.items ?? []).filter((item) => !records[item.id]).length;
  const hasMore = (category: ImportCategory) => {
    const read = reads?.[category];
    return !!read && undecidedLoaded(category) < read.total - read.decidedSince;
  };
  const moreCategory = shown.find((entry) => hasMore(entry.category))?.category;

  async function loadMore(category: ImportCategory) {
    setLoadingMore(true);
    try {
      // Uma decisão tira o item da fila: o deslocamento conta só o que ainda
      // está nela, nunca o cartão decidido que fica na lista.
      const page = await getProductServices().migration.listImportItems(
        sessionId,
        category,
        {
          status: "NEEDS_REVIEW",
          limit: PAGE_SIZE,
          offset: undecidedLoaded(category),
        },
        controllerRef.current?.signal,
      );
      if (controllerRef.current?.signal.aborted) return;
      setReads((current) => {
        const read = current?.[category];
        if (!current || !read) return current;
        const known = new Set(read.items.map((item) => item.id));
        return {
          ...current,
          [category]: {
            decidedSince: 0,
            items: [
              ...read.items,
              ...page.items.filter((item) => !known.has(item.id)),
            ],
            total: page.total,
          },
        };
      });
    } catch {
      if (controllerRef.current?.signal.aborted) return;
      setReadFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function settle(item: ImportItem, record: DecisionRecord) {
    const nextRecords = { ...records, [item.id]: record };
    setRecords(nextRecords);
    // Decidido agora ou já decidido por outro caminho: o item saiu da fila.
    if (record.kind === "decided" || record.kind === "already") {
      setReads((current) => {
        const read = current?.[item.category];
        if (!current || !read) return current;
        return {
          ...current,
          [item.category]: { ...read, decidedSince: read.decidedSince + 1 },
        };
      });
    }
    // O próximo cartão sem decisão, na ordem, abre sozinho; no fim da lista,
    // o primeiro que sobrou.
    const index = orderedItems.findIndex(
      (candidate) => candidate.id === item.id,
    );
    const following =
      orderedItems
        .slice(index + 1)
        .find((candidate) => !nextRecords[candidate.id]) ??
      orderedItems.find((candidate) => !nextRecords[candidate.id]);
    setPicked(following?.id ?? null);
  }

  return (
    <ImportsPage
      description={conflictsDescription(readyCount)}
      eyebrow={false}
      title={conflictsTitle(reviewCount)}
    >
      <div className="imports-conflicts">
        <div className="imports-conflicts-body">
          {readFailed && !allFailed && (
            <p className="field-help" role="alert">
              Não foi possível carregar todos os itens agora.
            </p>
          )}
          {loading && (
            <p aria-busy="true" className="imports-note">
              Carregando itens…
            </p>
          )}
          {allFailed && (
            <StatePanel
              description="Não foi possível carregar os itens desta categoria agora."
              icon="alert"
              title="Itens indisponíveis"
              tone="error"
            />
          )}
          {!loading && !allFailed && orderedItems.length === 0 && (
            <p className="imports-note">Não há itens para revisar agora.</p>
          )}
          {orderedItems.length > 0 && (
            <ul className="imports-conflicts-list">
              {orderedItems.map((item) => (
                <ConflictCard
                  item={item}
                  key={item.id}
                  open={openId === item.id}
                  onAlreadyDecided={() => settle(item, { kind: "already" })}
                  onDecided={(record) => settle(item, record)}
                  onOpen={() => setPicked(item.id)}
                  record={records[item.id]}
                  sessionId={sessionId}
                />
              ))}
            </ul>
          )}
          {moreCategory && (
            <button
              className="imports-text-action imports-conflicts-more"
              disabled={loadingMore}
              type="button"
              onClick={() => void loadMore(moreCategory)}
            >
              {loadingMore ? "Carregando..." : "Carregar mais"}
            </button>
          )}
        </div>
        <div className="imports-conflicts-footer">
          <button className="btn btn-primary" type="button" onClick={onBack}>
            Continuar
          </button>
          <span>{CONFLICTS_FOOTER_NOTE}</span>
        </div>
      </div>
    </ImportsPage>
  );
}

const DECISION_ERROR =
  "Não foi possível registrar essa decisão agora. Tente novamente.";

function CheckMark() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      style={{ stroke: "var(--at-color-success)" }}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      style={{ stroke: "var(--at-color-ink-muted)" }}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function itemTitle(item: ImportItem): string {
  const label = item.label ?? item.externalId;
  if (item.category === "CUSTOMER" && item.candidates?.length === 1) {
    return `${label} · ${item.candidates[0].name}`;
  }
  return label;
}

function serviceValues(
  values: Pick<
    ImportServiceCandidate,
    "durationMinutes" | "price" | "priceType"
  >,
): string {
  return `${formatServiceDuration(values.durationMinutes)} · ${formatServicePrice(values)}`;
}

function proposedValues(
  proposed: ImportProposedService | null | undefined,
): string {
  return proposed ? serviceValues(proposed) : "Valores não informados";
}

function ConflictCard({
  item,
  onAlreadyDecided,
  onDecided,
  onOpen,
  open,
  record,
  sessionId,
}: {
  item: ImportItem;
  onAlreadyDecided: () => void;
  onDecided: (record: DecisionRecord) => void;
  onOpen: () => void;
  open: boolean;
  record: DecisionRecord | undefined;
  sessionId: string;
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const title = itemTitle(item);
  const shortReason = conflictShortReason(item);
  const candidates = item.candidates ?? [];
  const serviceCandidates = candidates.filter(isServiceCandidate);

  if (record?.kind === "already") {
    return (
      <li>
        <div className="imports-conflict-card">
          <div className="imports-conflict-head">
            <span className="imports-conflict-name">{title}</span>
            <Badge label="Já decidido" tone="neutral" />
          </div>
          <p className="imports-conflict-question">
            Este item já foi decidido antes de você confirmar.
          </p>
        </div>
      </li>
    );
  }

  if (record?.kind === "decided") {
    return (
      <li>
        <div className="imports-conflict-card is-decided">
          <div className="imports-conflict-head">
            <span className="imports-conflict-name">{title}</span>
            <span className="imports-conflict-reason">{shortReason}</span>
          </div>
          {item.category === "SERVICE" && serviceCandidates.length > 0 && (
            <div
              className={
                serviceCandidates.length > 1
                  ? "imports-conflict-pieces is-stacked"
                  : "imports-conflict-pieces"
              }
            >
              {serviceCandidates.map((candidate) => (
                <ServicePiece
                  key={candidate.internalId}
                  label={serviceCandidates.length > 1 ? undefined : "Avenly"}
                  name={pieceName(candidate, item, serviceCandidates.length)}
                  selected={
                    record.decision === "KEEP_EXISTING" &&
                    record.targetInternalId === candidate.internalId
                  }
                  value={serviceValues(candidate)}
                />
              ))}
              <ServicePiece
                label="Minha Agenda"
                selected={record.decision === "CREATE_NEW"}
                source
                value={proposedValues(item.proposedService)}
              />
            </div>
          )}
          <span className="imports-conflict-result" role="status">
            <CheckMark />
            {conflictResultLabel(
              item.category,
              record.decision,
              record.targetName,
            )}
          </span>
        </div>
      </li>
    );
  }

  if (!open) {
    return (
      <li>
        <button
          aria-expanded="false"
          className="imports-conflict-closed"
          type="button"
          onClick={onOpen}
        >
          <span className="imports-conflict-closed-text">
            <span className="imports-conflict-name">{title}</span>{" "}
            <span className="imports-conflict-reason is-closed">
              {shortReason}
            </span>
          </span>
          <ChevronDown />
        </button>
      </li>
    );
  }

  async function submit(
    key: string,
    decision: ItemDecisionKind,
    target?: ImportItemCandidate,
  ) {
    if (submittingKey !== null) return;
    setSubmittingKey(key);
    setDecisionError(null);
    try {
      await getProductServices().migration.decideImportItem(
        sessionId,
        item.id,
        target
          ? { decision, targetInternalId: target.internalId }
          : { decision },
        newIdempotencyKey(),
      );
      onDecided({
        decision,
        kind: "decided",
        targetInternalId: target?.internalId,
        targetName: target?.name,
      });
    } catch (caught: unknown) {
      if (schedulingRefusalCode(caught) === "IMPORT_ITEM_ALREADY_DECIDED") {
        onAlreadyDecided();
        return;
      }
      setDecisionError(DECISION_ERROR);
    } finally {
      setSubmittingKey(null);
    }
  }

  const busy = submittingKey !== null;
  const groupName = `conflict-${item.id}`;

  const decisionButton = (
    id: string,
    decision: ItemDecisionKind,
    label: string,
    options: { disabled?: boolean; target?: ImportItemCandidate } = {},
  ) => (
    <button
      className="imports-conflict-button"
      disabled={busy || options.disabled}
      key={id}
      type="button"
      onClick={() => void submit(id, decision, options.target)}
    >
      {submittingKey === id ? "Enviando..." : label}
    </button>
  );
  const excludeAction = () => (
    <button
      className="imports-conflict-text-action"
      disabled={busy}
      type="button"
      onClick={() => void submit("exclude-text", "EXCLUDE")}
    >
      {submittingKey === "exclude-text"
        ? "Enviando..."
        : "Não importar este item"}
    </button>
  );
  const choiceRow = (candidate: ImportItemCandidate, value?: string) => (
    <label
      className={
        chosenId === candidate.internalId
          ? "imports-conflict-piece is-choice is-selected"
          : "imports-conflict-piece is-choice"
      }
      key={candidate.internalId}
    >
      <input
        checked={chosenId === candidate.internalId}
        className="imports-conflict-radio"
        disabled={busy}
        name={groupName}
        type="radio"
        value={candidate.internalId}
        onChange={() => setChosenId(candidate.internalId)}
      />
      <span className="imports-conflict-piece-name">{candidate.name}</span>
      {value && <span className="imports-conflict-piece-value">{value}</span>}
    </label>
  );

  let body: ReactNode;
  if (item.category === "SERVICE" && serviceCandidates.length > 0) {
    const single = serviceCandidates.length === 1;
    const chosen = serviceCandidates.find(
      (candidate) => candidate.internalId === chosenId,
    );
    body = (
      <>
        {single ? (
          <div className="imports-conflict-pieces">
            <ServicePiece
              label="Avenly"
              name={pieceName(serviceCandidates[0], item, 1)}
              value={serviceValues(serviceCandidates[0])}
            />
            <ServicePiece
              label="Minha Agenda"
              source
              value={proposedValues(item.proposedService)}
            />
          </div>
        ) : (
          <>
            <p className="imports-conflict-question" id={`${groupName}-legend`}>
              Qual serviço da Avenly é este?
            </p>
            <div
              aria-labelledby={`${groupName}-legend`}
              className="imports-conflict-pieces is-stacked"
              role="radiogroup"
            >
              {serviceCandidates.map((candidate) =>
                choiceRow(candidate, serviceValues(candidate)),
              )}
            </div>
            <div className="imports-conflict-pieces is-stacked">
              <ServicePiece
                label="Minha Agenda"
                source
                value={proposedValues(item.proposedService)}
              />
            </div>
          </>
        )}
        <div className="imports-conflict-actions">
          {single
            ? decisionButton("keep", "KEEP_EXISTING", "Manter o da Avenly", {
                target: serviceCandidates[0],
              })
            : decisionButton("keep", "KEEP_EXISTING", "Manter o escolhido", {
                disabled: !chosen,
                target: chosen,
              })}
          {decisionButton("new", "CREATE_NEW", "Criar outro serviço")}
        </div>
        {excludeAction()}
      </>
    );
  } else if (item.category === "CUSTOMER" && candidates.length > 0) {
    const single = candidates.length === 1;
    const chosen = single
      ? candidates[0]
      : candidates.find((candidate) => candidate.internalId === chosenId);
    body = (
      <>
        <p className="imports-conflict-question">
          {customerQuestionLabel(item.reasonCode)}
        </p>
        {!single && (
          <>
            <p className="imports-conflict-question" id={`${groupName}-legend`}>
              Qual cliente da Avenly é esta pessoa?
            </p>
            <div
              aria-labelledby={`${groupName}-legend`}
              className="imports-conflict-pieces is-stacked"
              role="radiogroup"
            >
              {candidates.map((candidate) => choiceRow(candidate))}
            </div>
          </>
        )}
        <div className="imports-conflict-actions">
          {decisionButton("merge", "MERGE_WITH_EXISTING", "Sim, juntar", {
            disabled: !chosen,
            target: chosen,
          })}
          {decisionButton("new", "CREATE_NEW", "Não, manter separadas")}
        </div>
        {excludeAction()}
      </>
    );
  } else if (item.category === "AVAILABILITY") {
    body = (
      <>
        <p className="imports-conflict-question">
          {conflictReasonLabel(item.reasonCode)}
        </p>
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
        <div className="imports-conflict-actions">
          {decisionButton("exclude", "EXCLUDE", "Manter meus horários")}
          {decisionButton(
            "include",
            "INCLUDE",
            "Usar os horários da Minha Agenda",
          )}
        </div>
      </>
    );
  } else {
    // Sem cadastro sugerido (lista vazia, ou item de antes da migration): num
    // conflito de correspondência a primeira saída é seguir como cadastro novo.
    const matchGone =
      (item.category === "SERVICE" || item.category === "CUSTOMER") &&
      /^(SERVICE|CUSTOMER)_MATCH_/.test(item.reasonCode ?? "");
    body = (
      <>
        <p className="imports-conflict-question">
          {matchGone
            ? SUGGESTED_RECORD_GONE
            : conflictReasonLabel(item.reasonCode)}
        </p>
        <div className="imports-conflict-actions">
          {matchGone
            ? decisionButton(
                "new",
                "CREATE_NEW",
                item.category === "SERVICE"
                  ? "Criar outro serviço"
                  : "Manter separadas",
              )
            : decisionButton("include", "INCLUDE", "Importar mesmo assim")}
          {decisionButton("exclude", "EXCLUDE", "Não importar")}
        </div>
      </>
    );
  }

  return (
    <li>
      <div className="imports-conflict-card is-open">
        <div className="imports-conflict-head">
          <span className="imports-conflict-name">{title}</span>
          <span className="imports-conflict-reason">{shortReason}</span>
        </div>
        {body}
        {decisionError && (
          <p className="field-help" role="alert">
            {decisionError}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * O nome do cadastro sugerido só entra na peça quando difere do nome do item
 * (nome parecido): com o mesmo nome o título do cartão já o diz, como no quadro.
 */
function pieceName(
  candidate: ImportServiceCandidate,
  item: ImportItem,
  count: number,
): string | undefined {
  if (count > 1) return candidate.name;
  const label = (item.label ?? item.externalId)
    .trim()
    .toLocaleLowerCase("pt-BR");
  return candidate.name.trim().toLocaleLowerCase("pt-BR") === label
    ? undefined
    : candidate.name;
}

/** Uma peça do cartão de serviço: "Avenly" ou "Minha Agenda", com os valores. */
function ServicePiece({
  label,
  name,
  selected = false,
  source = false,
  value,
}: {
  label?: string;
  name?: string;
  selected?: boolean;
  source?: boolean;
  value: string;
}) {
  const classes = ["imports-conflict-piece"];
  if (selected) classes.push("is-selected");
  if (source) classes.push("is-source");
  return (
    <div className={classes.join(" ")}>
      {label && <span className="imports-conflict-piece-label">{label}</span>}
      {name && <span className="imports-conflict-piece-name">{name}</span>}
      <span className="imports-conflict-piece-value">{value}</span>
    </div>
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
