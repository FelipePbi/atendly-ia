"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { RevenueReport } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";

import { homeAiLine } from "./aiValue";

/** A mesma chave da tela de Faturamento: o mês corrente lido por um serve ao outro. */
const MONTH_MEMORY_KEY = "revenue:month:hoje";

/**
 * Cartão curto do Início (D-178): "Neste mês a IA trouxe R$ 400 · 5 clientes
 * novos", levando ao Faturamento. Só aparece quando a IA marcou algo no mês;
 * falha de leitura não mostra nada — é complemento, não bloqueia o Início.
 */
export function HomeAiValue() {
  const [report, setReport] = useState<RevenueReport | null>(
    () => recall<RevenueReport>(MONTH_MEMORY_KEY) ?? null,
  );

  useEffect(() => {
    // Dublês de teste do Início podem não ter o serviço de faturamento.
    const { revenue } = getProductServices() as Partial<
      ReturnType<typeof getProductServices>
    >;
    if (!revenue) return;
    const controller = new AbortController();
    revenue
      .get({ period: "month" }, controller.signal)
      .then((result) => {
        remember(MONTH_MEMORY_KEY, result);
        setReport(result);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const line = report ? homeAiLine(report) : null;
  if (!line) return null;
  return (
    <Link className="card home-ai-value" href="/faturamento">
      <span aria-hidden="true" className="home-ai-value-icon">
        <Icon name="spark" />
      </span>
      <span className="home-ai-value-copy">
        <span className="home-ai-value-eyebrow">O que a IA fez por você</span>
        <span className="home-ai-value-line">{line}</span>
      </span>
      <span aria-hidden="true" className="home-ai-value-chevron">
        <Icon name="chevron-right" />
      </span>
    </Link>
  );
}
