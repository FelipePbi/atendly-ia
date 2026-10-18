"use client";

import clsx from "clsx";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  BffHttpError,
  type RevenueCustomerList,
  type RevenuePeriod,
} from "@/data";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { BrandLoader } from "@/shared/ui/Brand";
import { StatePanel } from "@/shared/ui/States";

import { countLabel, formatMoney, periodTitle } from "./revenueFormat";

const PERIODS: readonly RevenuePeriod[] = ["day", "week", "month", "year"];
type Order = "amount" | "count";

/** Link para esta tela, com o mesmo período que o Faturamento mostra. */
export function revenueCustomersHref(view: {
  period: RevenuePeriod;
  date?: string;
}): string {
  const query = new URLSearchParams({ periodo: view.period });
  if (view.date) query.set("data", view.date);
  return `/faturamento/clientes?${query.toString()}`;
}

/**
 * Todos os clientes do período (pedido de 2026-10-18): o cartão "Clientes que
 * mais faturaram" mostra cinco; aqui vem a lista inteira, por faturamento ou
 * por número de atendimentos.
 */
export function RevenueCustomersScreen() {
  const params = useSearchParams();
  const rawPeriod = params.get("periodo");
  const period: RevenuePeriod = PERIODS.includes(rawPeriod as RevenuePeriod)
    ? (rawPeriod as RevenuePeriod)
    : "month";
  const date = params.get("data") ?? undefined;
  const [list, setList] = useState<RevenueCustomerList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [order, setOrder] = useState<Order>("amount");

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .revenue.customers({ period, date }, controller.signal)
      .then((result) => {
        setList(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof BffHttpError
            ? caught.message
            : "Não foi possível carregar os clientes.",
        );
      });
    return () => controller.abort();
  }, [period, date, reload]);

  useShellConfig({
    active: "faturamento",
    attention: Boolean(error && !list),
    loading: !list && !error,
    title: "Clientes do faturamento",
  });

  const customers = useMemo(() => {
    const items = [...(list?.customers ?? [])];
    if (order === "count") {
      items.sort((a, b) => b.count - a.count || b.amount - a.amount);
    }
    return items;
  }, [list, order]);

  const showLoader = useDeferredLoading(!list && !error);
  const backHref = `/faturamento`;

  return (
    <div className="revenue-page revenue-customers-page">
      <PushedBar
        backHref={backHref}
        backLabel="Voltar ao faturamento"
        subtitle={list ? periodTitle(list) : undefined}
        title="Clientes do período"
      />
      {!list && !error && showLoader && (
        <BrandLoader inline label="Carregando os clientes" />
      )}
      {!list && error && (
        <StatePanel
          actionLabel="Tentar novamente"
          description={error}
          icon="alert"
          onAction={() => setReload((value) => value + 1)}
          title="Não foi possível carregar os clientes"
          tone="error"
        />
      )}
      {list && (
        <section className="card revenue-card">
          <div
            aria-label="Ordenar por"
            className="revenue-period-tabs revenue-customers-order"
            role="group"
          >
            {(
              [
                ["amount", "Faturamento"],
                ["count", "Atendimentos"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={order === value}
                className={clsx(
                  "revenue-period-tab",
                  order === value && "is-active",
                )}
                key={value}
                onClick={() => setOrder(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {customers.length === 0 ? (
            <p className="revenue-empty-line">
              Nenhum cliente com valor neste período.
            </p>
          ) : (
            <>
              <p className="revenue-card-sub">
                {countLabel(customers.length, "cliente", "clientes")} com
                atendimento concluído neste período.
              </p>
              <ol className="revenue-rank">
                {customers.map((customer, index) => (
                  <li className="revenue-rank-row" key={customer.customerId}>
                    <span aria-hidden="true" className="revenue-rank-position">
                      {index + 1}
                    </span>
                    <Link
                      className="revenue-rank-name"
                      href={`/clientes/detalhes?id=${encodeURIComponent(customer.customerId)}`}
                    >
                      {customer.name?.trim() || "Cliente sem nome"}
                    </Link>
                    <span className="revenue-rank-numbers">
                      <span className="revenue-rank-amount">
                        {formatMoney(customer.amount)}
                      </span>
                      <span className="revenue-rank-count">
                        {countLabel(
                          customer.count,
                          "atendimento",
                          "atendimentos",
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </div>
  );
}
