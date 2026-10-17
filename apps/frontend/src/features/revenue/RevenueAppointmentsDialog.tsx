"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  BffHttpError,
  type RevenueAppointmentKind,
  type RevenueAppointmentList,
  type RevenueReport,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";

import {
  countLabel,
  formatMoney,
  monthName,
  periodTitle,
  weekdayOf,
  weekdayShort,
} from "./revenueFormat";

type Item = RevenueAppointmentList["items"][number];

/**
 * Os atendimentos por trás dos números do Faturamento (D-179): ao tocar em
 * "Cancelamentos", "Faltas" ou no aviso de "atendimentos concluídos sem
 * valor", a lista do período diz quais foram, quem marcou e quem cancelou ou
 * registrou a falta, com o motivo escrito quando houver. Cada linha abre o
 * atendimento — é lá que se registra o valor final.
 */
export function RevenueAppointmentsDialog({
  kind,
  onClose,
  report,
}: {
  kind: RevenueAppointmentKind | null;
  onClose: () => void;
  report: Pick<RevenueReport, "period" | "start" | "end" | "today">;
}) {
  const wide = useWideLayout();
  const [state, setState] = useState<{
    key: string;
    list: RevenueAppointmentList | null;
    error: string | null;
  } | null>(null);
  const [reload, setReload] = useState(0);
  const key = kind ? `${kind}:${report.period}:${report.start}:${reload}` : "";

  useEffect(() => {
    if (!kind) return;
    const controller = new AbortController();
    getProductServices()
      .revenue.appointments(
        { period: report.period, date: report.start, kind },
        controller.signal,
      )
      .then((list) => setState({ key, list, error: null }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          key,
          list: null,
          error:
            caught instanceof BffHttpError
              ? caught.message
              : "Não foi possível carregar os atendimentos.",
        });
      });
    return () => controller.abort();
  }, [key, kind, report.period, report.start]);

  const current = state?.key === key ? state : null;
  const loading = Boolean(kind) && !current;
  const showLoading = useDeferredLoading(loading);

  return (
    <Dialog
      eyebrow={periodTitle(report)}
      onClose={onClose}
      open={kind !== null}
      title={kind ? TITLES[kind] : ""}
      variant={wide ? "drawer" : "sheet"}
    >
      <div aria-busy={loading || undefined} className="revenue-list">
        {loading ? (
          showLoading ? (
            <p className="revenue-list-status" role="status">
              Carregando os atendimentos…
            </p>
          ) : null
        ) : current?.error ? (
          <div className="revenue-list-error" role="alert">
            <p>{current.error}</p>
            <button
              className="btn btn-secondary"
              onClick={() => setReload((value) => value + 1)}
              type="button"
            >
              Tentar novamente
            </button>
          </div>
        ) : current?.list && kind ? (
          <ListBody kind={kind} list={current.list} />
        ) : null}
      </div>
    </Dialog>
  );
}

const TITLES: Record<RevenueAppointmentKind, string> = {
  cancelled: "Cancelamentos",
  no_show: "Faltas",
  unvalued: "Atendimentos sem valor",
};

const ACTOR_BY_KIND: Record<"cancelled" | "no_show", Record<string, string>> = {
  cancelled: {
    AI: "Cancelado pela IA",
    USER: "Cancelado por você",
    SYSTEM: "Cancelado automaticamente",
    INTEGRATION: "Veio cancelado da importação",
  },
  no_show: {
    AI: "Falta registrada pela IA",
    USER: "Falta registrada por você",
    SYSTEM: "Falta registrada automaticamente",
    INTEGRATION: "Veio como falta da importação",
  },
};

const SUMMARY_ACTOR: Record<string, [string, string]> = {
  AI: ["pela IA", "pela IA"],
  USER: ["por você", "por você"],
  SYSTEM: ["automático", "automáticos"],
  INTEGRATION: ["da importação", "da importação"],
};

const UNVALUED_REASON: Record<string, string> = {
  ON_REQUEST: "Serviço sob consulta",
  STARTING_AT: "Preço “a partir de”",
  NOT_INFORMED: "Serviço sem preço",
  UNLISTED: "Atendimento avulso",
};

/** "sex, 16 out". */
function dayLabel(date: string): string {
  return `${weekdayShort(weekdayOf(date))}, ${Number(date.slice(8))} ${monthName(date).slice(0, 3)}`;
}

/** "5 por você · 3 pela IA · 1 sem registro". */
function actorSummary(items: readonly Item[]): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.changedBy ?? "NONE";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([actor, count]) => {
      if (actor === "NONE") return `${count} sem registro de quem fez`;
      const [one, many] = SUMMARY_ACTOR[actor] ?? [actor, actor];
      return `${count} ${count === 1 ? one : many}`;
    })
    .join(" · ");
}

function ListBody({
  kind,
  list,
}: {
  kind: RevenueAppointmentKind;
  list: RevenueAppointmentList;
}) {
  if (list.items.length === 0) {
    return (
      <p className="revenue-list-status">Nenhum atendimento neste período.</p>
    );
  }
  const summary = kind === "unvalued" ? null : actorSummary(list.items);
  return (
    <>
      {kind === "unvalued" ? (
        <p className="revenue-list-hint">
          Abra o atendimento e registre o valor final para ele entrar no
          faturamento.
        </p>
      ) : (
        summary && <p className="revenue-list-hint">{summary}</p>
      )}
      <ul className="revenue-list-items">
        {list.items.map((item) => (
          <li key={item.id}>
            <Link
              className="revenue-list-item"
              href={`/agenda/agendamento?id=${encodeURIComponent(item.id)}`}
            >
              <span className="revenue-list-when">
                <span className="revenue-list-day">{dayLabel(item.date)}</span>
                <span className="revenue-list-time">{item.time}</span>
              </span>
              <span className="revenue-list-copy">
                <span className="revenue-list-name">
                  {item.customerName ?? "Cliente sem nome"}
                </span>
                <span className="revenue-list-services">
                  {item.services.length > 0
                    ? item.services.join(" + ")
                    : "Atendimento avulso"}
                </span>
                <span className="revenue-list-tags">
                  {kind === "unvalued" ? (
                    <span className="revenue-list-tag">
                      {UNVALUED_REASON[item.unvaluedReason ?? "NOT_INFORMED"]}
                    </span>
                  ) : (
                    <span
                      className={
                        item.changedBy === "AI"
                          ? "revenue-list-tag is-ai"
                          : "revenue-list-tag"
                      }
                    >
                      {item.changedBy
                        ? ACTOR_BY_KIND[kind][item.changedBy]
                        : "Sem registro de quem fez"}
                    </span>
                  )}
                  {item.bookedBy === "AI" && (
                    <span className="revenue-list-tag is-ai">
                      Marcado pela IA
                    </span>
                  )}
                </span>
                {item.note && (
                  <span className="revenue-list-note">“{item.note}”</span>
                )}
              </span>
              <span className="revenue-list-amount">
                {kind === "unvalued"
                  ? "Registrar valor"
                  : item.amount !== null
                    ? formatMoney(item.amount)
                    : "sem valor"}
                <Icon name="chevron-right" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {list.total > list.items.length && (
        <p className="revenue-list-hint">
          Mostrando os {list.items.length} mais recentes de{" "}
          {countLabel(list.total, "atendimento", "atendimentos")}.
        </p>
      )}
    </>
  );
}
