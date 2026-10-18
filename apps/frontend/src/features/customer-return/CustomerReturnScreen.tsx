"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import {
  type AiTone,
  BffHttpError,
  RETURN_WINBACK_DAY_OPTIONS,
  type ReturnCandidate,
  type ReturnCandidateList,
  type ReturnKind,
  type ReturnPlan,
  type ReturnSettings,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { BrandLoader } from "@/shared/ui/Brand";
import { Dialog } from "@/shared/ui/Dialog";
import { StatePanel } from "@/shared/ui/States";
import { showToast } from "@/shared/ui/toastBus";

import { ReturnCampaigns } from "./ReturnCampaigns";
import {
  candidateDetail,
  countLabel,
  exclusionSummary,
  habitLabel,
  intervalSourceLabel,
  shortDate,
  windowLabel,
} from "./returnCopy";
import { composeReturnText, type ReturnFacts } from "./returnMessage";
import { ReturnMessageEditor } from "./ReturnMessageEditor";

type Week = "this" | "next";

/**
 * Retorno de clientes (D-206, `06-Retorno-de-Clientes.md`): a lista vem
 * pronta e toda marcada, a profissional desmarca quem não quer chamar, vê a
 * mensagem que vai sair e aprova. A aprovação vira uma rodada que sai aos
 * poucos, no ritmo da configuração; quem não cabe até a própria data é
 * avisado antes, com a escolha de aumentar o limite do dia ou deixar de fora.
 */
export function CustomerReturnScreen() {
  const [tone, setTone] = useState<AiTone>("BALANCED");
  const [kind, setKind] = useState<ReturnKind>("RENEWAL");
  const [week, setWeek] = useState<Week>("this");
  const [days, setDays] = useState<number | null>(null);
  const [settings, setSettings] = useState<ReturnSettings | null>(null);
  // Lista e erro guardados com o filtro a que pertencem: trocar de aba ou
  // de semana não mostra a lista anterior enquanto a nova não chega.
  const [loaded, setLoaded] = useState<{
    key: string;
    list: ReturnCandidateList | null;
    error: string | null;
  } | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ReturnPlan | null>(null);
  const [campaignsVersion, setCampaignsVersion] = useState(0);
  const listHeadingId = useId();
  const closeEditor = useCallback(() => setEditing(false), []);

  useEffect(() => {
    const controller = new AbortController();
    // Estilo da IA só para a prévia: sem ele, vale o Equilibrado.
    getProductServices()
      .settings.get(controller.signal)
      .then((state) => setTone(state.ai.tone ?? "BALANCED"))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .customerReturn.settings(controller.signal)
      .then((value) => {
        setSettings(value);
        setDays((current) => current ?? value.winbackDays);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSettingsError("Não foi possível carregar o retorno de clientes.");
      });
    return () => controller.abort();
  }, [reload]);

  const winbackDays = days ?? settings?.winbackDays ?? null;
  // O filtro de cada rotina: a semana na Renovação, os dias no Resgate.
  const filter =
    kind === "RENEWAL"
      ? week
      : winbackDays === null
        ? null
        : String(winbackDays);
  const listKey = `${kind}:${filter}:${reload}`;
  const list = loaded?.key === listKey ? loaded.list : null;
  const error =
    (loaded?.key === listKey ? loaded.error : null) ?? settingsError;
  useEffect(() => {
    if (filter === null) return;
    const controller = new AbortController();
    const key = `${kind}:${filter}:${reload}`;
    getProductServices()
      .customerReturn.candidates(
        kind === "RENEWAL"
          ? { kind, week: filter as Week }
          : { kind, days: Number(filter) },
        controller.signal,
      )
      .then((value) => {
        setLoaded({ key, list: value, error: null });
        setUnchecked(new Set());
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key,
          list: null,
          error:
            caught instanceof BffHttpError && caught.status === 404
              ? "Configure sua agenda antes de chamar clientes de volta."
              : "Não foi possível carregar a lista de clientes.",
        });
      });
    return () => controller.abort();
  }, [kind, filter, reload]);

  useShellConfig({
    active: "clientes",
    attention: Boolean(error && !list),
    loading: !list && !error,
    module: "directory",
    pushed: true,
    title: "Retorno de clientes",
  });

  const candidates = useMemo(() => list?.candidates ?? [], [list]);
  const selected = candidates.filter(
    (candidate) => !unchecked.has(candidate.customerId),
  );
  const showLoader = useDeferredLoading(!list && !error);
  const template =
    kind === "RENEWAL"
      ? (settings?.renewalMessage ?? null)
      : (settings?.winbackMessage ?? null);
  const incentive =
    kind === "WINBACK" ? (settings?.winbackIncentive ?? null) : null;

  function toggle(customerId: string) {
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  function toggleAll() {
    setUnchecked(
      selected.length === candidates.length
        ? new Set(candidates.map((candidate) => candidate.customerId))
        : new Set(),
    );
  }

  const request = useCallback(
    (customerIds: string[], dailyLimit?: number) => ({
      kind,
      ...(kind === "RENEWAL" ? { week } : { days: winbackDays ?? undefined }),
      customerIds,
      ...(dailyLimit ? { dailyLimit } : {}),
    }),
    [kind, week, winbackDays],
  );

  async function approve(
    customerIds: string[],
    options: { dailyLimit?: number; skipPlan?: boolean } = {},
  ) {
    if (customerIds.length === 0) return;
    setBusy(true);
    try {
      const services = getProductServices().customerReturn;
      if (!options.skipPlan) {
        const simulated = await services.plan(
          request(customerIds, options.dailyLimit),
        );
        if (simulated.notFitting.length > 0) {
          setPlan(simulated);
          return;
        }
      }
      const campaign = await services.approve(
        request(customerIds, options.dailyLimit),
      );
      setPlan(null);
      showToast(
        `Rodada aprovada: ${countLabel(campaign.counts.total, "mensagem sai", "mensagens saem")} aos poucos.`,
      );
      setCampaignsVersion((value) => value + 1);
      setReload((value) => value + 1);
    } catch {
      showToast("Não foi possível aprovar a rodada. Tente de novo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  const closePlan = useCallback(() => {
    if (!busy) setPlan(null);
  }, [busy]);

  const preview = useMemo(
    () =>
      previewText({
        candidate: selected[0] ?? candidates[0] ?? null,
        incentive,
        kind,
        template,
        today: list?.today ?? null,
        tone,
      }),
    [selected, candidates, incentive, kind, template, list, tone],
  );

  return (
    <div className="page return-page">
      <PushedBar
        backHref="/clientes"
        backLabel="Voltar para clientes"
        title="Retorno de clientes"
      />
      <div className="return-content">
        <p className="return-intro">
          Chame de volta quem está no prazo de refazer um serviço e quem não vem
          há um tempo. Você escolhe quem recebe; as mensagens saem aos poucos e
          a IA continua a conversa quando a cliente responder.
        </p>
        <div aria-label="Quem chamar" className="return-tabs" role="group">
          {(
            [
              ["RENEWAL", "Renovação"],
              ["WINBACK", "Resgate"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={kind === value}
              className={clsx("return-tab", kind === value && "is-active")}
              key={value}
              onClick={() => setKind(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {kind === "RENEWAL" ? (
          <div className="return-filter">
            <p className="return-filter-copy">
              Quem está no prazo de voltar, pelo prazo do serviço ou pela média
              da própria cliente.
            </p>
            <div aria-label="Semana" className="return-chips" role="group">
              {(
                [
                  ["this", "Esta semana"],
                  ["next", "Próxima semana"],
                ] as const
              ).map(([value, label]) => (
                <button
                  aria-pressed={week === value}
                  className={clsx("return-chip", week === value && "is-active")}
                  key={value}
                  onClick={() => setWeek(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="return-filter">
            <p className="return-filter-copy">
              Quem não vem há um tempo. Uma mensagem leve, de saudade, sem
              pressão.
            </p>
            <div aria-label="Sem vir há" className="return-chips" role="group">
              {RETURN_WINBACK_DAY_OPTIONS.map((value) => (
                <button
                  aria-pressed={winbackDays === value}
                  className={clsx(
                    "return-chip",
                    winbackDays === value && "is-active",
                  )}
                  key={value}
                  onClick={() => setDays(value)}
                  type="button"
                >
                  {value} dias
                </button>
              ))}
            </div>
            <div className="return-incentive">
              <span className="return-incentive-label">Incentivo</span>
              <span className="return-incentive-text">
                {incentive
                  ? `“${incentive}”`
                  : "Sem incentivo: a mensagem é só de reaproximação."}
              </span>
              <button
                className="return-link-button"
                onClick={() => setEditing(true)}
                type="button"
              >
                {incentive ? "Editar" : "Adicionar"}
              </button>
            </div>
          </div>
        )}

        {!list && !error && showLoader && (
          <BrandLoader inline label="Carregando a lista" />
        )}
        {!list && error && (
          <StatePanel
            actionLabel="Tentar novamente"
            description={error}
            icon="alert"
            onAction={() => setReload((value) => value + 1)}
            title="Lista indisponível"
            tone="error"
          />
        )}
        {list && (
          <section aria-labelledby={listHeadingId} className="return-list">
            <div className="return-list-head">
              <h2 className="return-list-title" id={listHeadingId}>
                {kind === "RENEWAL"
                  ? week === "this"
                    ? "Chamar clientes desta semana"
                    : "Chamar clientes da próxima semana"
                  : `Sem vir há ${list.days ?? winbackDays} dias ou mais`}
              </h2>
              {candidates.length > 0 && (
                <button
                  className="return-link-button"
                  onClick={toggleAll}
                  type="button"
                >
                  {selected.length === candidates.length
                    ? "Desmarcar todas"
                    : "Marcar todas"}
                </button>
              )}
            </div>
            {list.weekStart && list.weekEnd && (
              <p className="return-list-range">
                {shortDate(list.weekStart)} a {shortDate(list.weekEnd)}
              </p>
            )}
            {candidates.length === 0 ? (
              <p className="return-empty">
                {kind === "RENEWAL"
                  ? "Ninguém vence nesta semana sem horário marcado."
                  : "Ninguém está há tanto tempo sem vir."}
              </p>
            ) : (
              <ul className="return-candidates">
                {candidates.map((candidate) => (
                  <CandidateRow
                    candidate={candidate}
                    checked={!unchecked.has(candidate.customerId)}
                    key={candidate.customerId}
                    onToggle={() => toggle(candidate.customerId)}
                    today={list.today}
                  />
                ))}
              </ul>
            )}
            {exclusionSummary(list.excluded) && (
              <p className="return-excluded">
                {exclusionSummary(list.excluded)}
              </p>
            )}
          </section>
        )}

        {list && candidates.length > 0 && (
          <section className="return-message" aria-label="Mensagem">
            <div className="return-message-head">
              <span className="return-message-title">
                Assim chega para{" "}
                {firstName(selected[0]?.name ?? candidates[0]?.name) ??
                  "a cliente"}
              </span>
              <button
                className="return-link-button"
                onClick={() => setEditing(true)}
                type="button"
              >
                Editar mensagem
              </button>
            </div>
            <div className="return-message-bubble">{preview}</div>
            <p className="return-message-note">
              {kind === "RENEWAL"
                ? "Cada cliente recebe o próprio nome, serviço e dois horários livres da sua agenda no momento do envio, perto dos dias e horários de costume dela."
                : "Cada cliente recebe o próprio nome. Quando ela responder, a IA oferece horários perto dos de costume dela."}
            </p>
            {settings && (
              <p className="return-message-note">
                Saem até {settings.dailyLimit} por dia,{" "}
                {windowLabel(
                  settings.windowDays,
                  settings.windowStart,
                  settings.windowEnd,
                )}
                .{" "}
                <Link
                  className="return-inline-link"
                  href="/configuracoes/retorno"
                >
                  Ajustar
                </Link>
              </p>
            )}
          </section>
        )}

        {list && candidates.length > 0 && (
          <div className="return-approve">
            <button
              className="btn btn-primary return-approve-button"
              disabled={busy || selected.length === 0}
              onClick={() =>
                void approve(selected.map((candidate) => candidate.customerId))
              }
              type="button"
            >
              {busy
                ? "Aprovando..."
                : selected.length === 0
                  ? "Marque quem vai receber"
                  : `Aprovar ${countLabel(selected.length, "cliente", "clientes")}`}
            </button>
          </div>
        )}

        <ReturnCampaigns version={campaignsVersion} />
      </div>

      {settings && editing && (
        <ReturnMessageEditor
          kind={kind}
          onClose={closeEditor}
          onSaved={(saved) => {
            setSettings(saved);
            setEditing(false);
          }}
          open={editing}
          settings={settings}
          tone={tone}
        />
      )}

      <Dialog
        onClose={closePlan}
        open={plan !== null}
        title="Nem todas cabem antes da data"
      >
        {plan && (
          <NotFittingChoice
            busy={busy}
            onCancel={() => setPlan(null)}
            onLeaveOut={() =>
              void approve(
                selected
                  .map((candidate) => candidate.customerId)
                  .filter((id) => !plan.notFitting.includes(id)),
                { skipPlan: true },
              )
            }
            onRaise={(limit) =>
              void approve(
                selected.map((candidate) => candidate.customerId),
                { dailyLimit: limit, skipPlan: true },
              )
            }
            plan={plan}
          />
        )}
      </Dialog>
    </div>
  );
}

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/u)[0];
  return first || null;
}

function CandidateRow({
  candidate,
  checked,
  onToggle,
  today,
}: {
  candidate: ReturnCandidate;
  checked: boolean;
  onToggle: () => void;
  today: string;
}) {
  const habit = habitLabel(candidate.habit);
  const interval = intervalSourceLabel(candidate);
  return (
    <li>
      <label className={clsx("return-candidate", checked && "is-checked")}>
        <input
          checked={checked}
          className="return-candidate-input"
          onChange={onToggle}
          type="checkbox"
        />
        <span aria-hidden="true" className="return-candidate-box">
          {checked && <Icon name="check" />}
        </span>
        <span className="return-candidate-copy">
          <strong>{candidate.name?.trim() || "Cliente sem nome"}</strong>
          <span className="return-candidate-detail">
            {candidateDetail(candidate, today)}
          </span>
          <span className="return-candidate-meta">
            Último atendimento em {shortDate(candidate.lastVisitDate)}
            {interval ? ` · ${interval}` : ""}
          </span>
          {habit && <span className="return-candidate-habit">{habit}</span>}
        </span>
      </label>
    </li>
  );
}

function NotFittingChoice({
  busy,
  onCancel,
  onLeaveOut,
  onRaise,
  plan,
}: {
  busy: boolean;
  onCancel: () => void;
  onLeaveOut: () => void;
  onRaise: (limit: number) => void;
  plan: ReturnPlan;
}) {
  const count = plan.notFitting.length;
  return (
    <div className="return-fit">
      <p>
        {countLabel(count, "cliente não cabe", "clientes não cabem")} no limite
        de {plan.dailyLimit} por dia antes da data{" "}
        {count === 1 ? "dela" : "delas"}. Ninguém recebe no próprio dia do
        vencimento.
      </p>
      <div className="return-fit-actions">
        {plan.minimumDailyLimit !== null && (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onRaise(plan.minimumDailyLimit as number)}
            type="button"
          >
            Aumentar para {plan.minimumDailyLimit} por dia
          </button>
        )}
        {count < plan.total && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onLeaveOut}
            type="button"
          >
            Deixar {count === 1 ? "essa" : `essas ${count}`} de fora
          </button>
        )}
        <button
          className="btn btn-tertiary"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}

/**
 * Prévia da primeira cliente marcada. Os dois horários da Renovação saem da
 * agenda só no envio; aqui eles são um exemplo nos dias e na faixa de
 * costume dela, e a nota da tela diz isso.
 */
function previewText(input: {
  candidate: ReturnCandidate | null;
  incentive: string | null;
  kind: ReturnKind;
  template: string | null;
  today: string | null;
  tone: AiTone;
}): string {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const candidate = input.candidate;
  const facts: ReturnFacts = {
    kind: input.kind,
    followUp: false,
    customerName: candidate?.name ?? null,
    serviceName: candidate?.serviceName ?? null,
    today,
    expectedDate:
      input.kind === "RENEWAL" ? (candidate?.expectedDate ?? null) : null,
    intervalDays: candidate?.intervalDays ?? null,
    daysSinceLastVisit: candidate?.daysSinceLastVisit ?? null,
    offeredSlots:
      input.kind === "RENEWAL" && candidate
        ? exampleSlots(candidate, today)
        : [],
    incentive: input.incentive,
    messageTemplate: input.template,
  };
  return composeReturnText({ style: input.tone, facts });
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function exampleSlots(
  candidate: ReturnCandidate,
  today: string,
): Array<{ date: string; time: string }> {
  const start = addDays(today, 1);
  const anchor =
    candidate.expectedDate && candidate.expectedDate > start
      ? candidate.expectedDate
      : start;
  const habit = candidate.habit;
  const time = habit ? middleTime(habit.bandStart, habit.bandEnd) : "10:00";
  const slots: Array<{ date: string; time: string }> = [];
  for (let offset = 0; offset < 14 && slots.length < 2; offset += 1) {
    const date = addDays(anchor, offset);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (
      !habit ||
      habit.weekdays.length === 0 ||
      habit.weekdays.includes(weekday)
    ) {
      slots.push({ date, time });
    }
  }
  return slots;
}

function middleTime(start: string, end: string): string {
  const toMinutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const middle = Math.round((toMinutes(start) + toMinutes(end)) / 60) * 30;
  const hours = Math.floor(middle / 60);
  return `${String(hours).padStart(2, "0")}:${String(middle % 60).padStart(2, "0")}`;
}
