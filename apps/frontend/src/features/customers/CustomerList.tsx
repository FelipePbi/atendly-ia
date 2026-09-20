"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  BffHttpError,
  type CustomerList as CustomerListResult,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Field } from "@/shared/ui/Field";
import { ListItem } from "@/shared/ui/ListItem";
import { Skeleton, StatePanel } from "@/shared/ui/States";

export function CustomerList() {
  const [result, setResult] = useState<CustomerListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .customers.list(controller.signal)
      .then(setResult)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar os clientes."),
          );
      });
    return () => controller.abort();
  }, [reload]);

  const customers = result?.items ?? [];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return result?.items ?? [];
    return (result?.items ?? []).filter((customer) =>
      `${customer.name ?? ""} ${customer.phone ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized),
    );
  }, [result, query]);

  const canCreate = Boolean(result) && !result?.managedExternally;
  const loading = !result && !error;
  useShellConfig({
    action: canCreate
      ? { href: "/clientes/novo", icon: "plus", label: "Novo cliente" }
      : undefined,
    active: "clientes",
    loading,
    module: "directory",
    title: "Clientes",
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p>
            Encontre quem você já atende e cadastre quem chega agora, sem
            depender de telefone.
          </p>
        </div>
        {canCreate && (
          <Link className="btn btn-primary" href="/clientes/novo">
            <Icon name="plus" />
            <span>Novo cliente</span>
          </Link>
        )}
      </div>

      {error ? (
        <StatePanel
          actionLabel="Tentar novamente"
          description={error}
          icon="alert"
          onAction={() => {
            setError(null);
            setReload((value) => value + 1);
          }}
          title="Não foi possível carregar clientes"
          tone="error"
        />
      ) : loading ? (
        <CustomerListSkeleton />
      ) : customers.length === 0 ? (
        <StatePanel
          actionHref={canCreate ? "/clientes/novo" : undefined}
          actionLabel={canCreate ? "Cadastrar cliente" : undefined}
          description="Depois do primeiro cadastro ou agendamento, os clientes aparecerão aqui."
          icon="users"
          title="Seus clientes aparecerão aqui"
        />
      ) : (
        <>
          <Field
            className="customer-search"
            icon="search"
            label="Buscar cliente"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome ou telefone"
            type="search"
            value={query}
          />
          <div className="customer-list-meta">
            <strong>Clientes cadastrados</strong>
            <span>
              {filtered.length}{" "}
              {filtered.length === 1 ? "cliente" : "clientes"}
            </span>
          </div>
          {filtered.length === 0 ? (
            <p className="customer-no-results" role="status">
              Nenhum cliente corresponde à busca.
            </p>
          ) : (
            <div aria-label="Clientes" className="list" role="list">
              {filtered.map((customer) => (
                <ListItem
                  copy={customer.phone || "Telefone não informado"}
                  href={`/clientes/detalhes?id=${encodeURIComponent(customer.id)}`}
                  key={customer.id}
                  leading={
                    <span className="avatar" aria-hidden="true">
                      {initials(customer.name)}
                    </span>
                  }
                  title={customer.name || "Cliente sem nome"}
                  trailing={<Icon name="chevron-right" />}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CustomerListSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">
        Carregando clientes
      </p>
      <div aria-hidden="true" className="list">
        {[0, 1, 2, 3].map((item) => (
          <div className="list-item" key={item}>
            <Skeleton className="avatar" />
            <div className="list-item-main customer-list-loading-copy">
              <Skeleton className="skeleton-title" />
              <Skeleton className="skeleton-line" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    NETWORK_ERROR: "Não foi possível acessar a Atendly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}

function initials(name: string | null): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR"))
    .join("");
}
