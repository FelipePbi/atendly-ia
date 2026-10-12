"use client";

import { useId } from "react";

import { type Customer, type CustomerList } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { displayPhone } from "@/shared/phone";

import { parseDate } from "./occupancy";

const SUGGESTED_CUSTOMERS = 5;

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

export function weekdayShort(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(parseDate(date))
    .replace(".", "")
    .toLowerCase();
}

export function personLabel(customer: Customer): string {
  return (
    customer.name ??
    (customer.phone ? displayPhone(customer.phone, "") : null) ??
    "Cliente sem identificação"
  );
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Chips de serviço visíveis antes de "Ver outros serviços" (D-170). */
export const MOST_USED_SERVICES = 5;

/**
 * Mais usados primeiro (D-170): `usageCount` decrescente, que é o número de
 * atendimentos não cancelados dos últimos 90 dias; empate, ou negócio sem
 * atendimentos, fica na ordem do catálogo (a ordenação é estável).
 */
export function servicesByUsage<T extends { usageCount?: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (left, right) => (right.usageCount ?? 0) - (left.usageCount ?? 0),
  );
}

export function CustomerField({
  customers,
  name,
  onChoose,
  onCommitName,
  onName,
  onPhone,
  onSwap,
  phone,
  selected,
}: {
  customers: CustomerList | null;
  name: string;
  onChoose: (customer: Customer) => void;
  /**
   * Nome digitado assumido como cliente novo: ao sair do campo (`false`) ou
   * pelo botão "Cadastrar" (`true`, uma escolha). É o que revela Serviços
   * para um cliente novo (D-170): digitar não revela nada no meio da busca.
   */
  onCommitName?: (fromChoice: boolean) => void;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onSwap: () => void;
  phone: string;
  selected: Customer | undefined;
}) {
  const labelId = useId();
  const query = name.trim();
  const registered =
    customers && !customers.managedExternally ? customers.items : [];
  const needle = normalize(query);
  const matches = (
    needle
      ? registered.filter((item) =>
          normalize(`${item.name ?? ""} ${item.phone ?? ""}`).includes(needle),
        )
      : registered
  ).slice(0, SUGGESTED_CUSTOMERS);
  const exact = registered.some(
    (item) => normalize(item.name ?? "") === needle,
  );

  return (
    <div
      aria-labelledby={labelId}
      className="agenda-new-block agenda-new-customer-field"
      role="group"
    >
      <span className="label" id={labelId}>
        Cliente
      </span>
      {selected ? (
        <div className="agenda-new-customer">
          <span className="agenda-new-customer-chip">
            <span aria-hidden="true" className="agenda-new-avatar">
              {initials(personLabel(selected))}
            </span>
            {personLabel(selected)}
            <button
              aria-label={`Remover ${personLabel(selected)}`}
              className="agenda-new-customer-clear"
              onClick={onSwap}
              type="button"
            >
              <Icon name="x" />
            </button>
          </span>
          <button className="agenda-new-swap" onClick={onSwap} type="button">
            Trocar
          </button>
        </div>
      ) : (
        <>
          <input
            aria-label="Nome do cliente"
            autoComplete="off"
            className="input"
            onBlur={() => {
              if (query) onCommitName?.(false);
            }}
            onChange={(event) => onName(event.target.value)}
            placeholder={
              registered.length > 0
                ? "Buscar ou cadastrar cliente"
                : "Nome do cliente"
            }
            value={name}
          />
          {matches.length > 0 && (
            // Sem busca, as sugestões são atalho: de 768 px em diante só
            // aparecem com o campo em foco (pedido de 2026-10-12, D-170), para
            // a lista não ocupar a tela antes de a pessoa buscar.
            <ul
              className={
                query
                  ? "agenda-new-options"
                  : "agenda-new-options is-suggestions"
              }
            >
              {matches.map((item) => (
                <li key={item.id}>
                  <button
                    className="agenda-new-option"
                    onClick={() => onChoose(item)}
                    // O foco fica no campo até o clique: a sugestão não
                    // some no meio dele (Safari não foca botão ao clicar).
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    <span aria-hidden="true" className="agenda-new-avatar">
                      {initials(personLabel(item))}
                    </span>
                    <span>{personLabel(item)}</span>
                    {item.name && item.phone && (
                      <small>{displayPhone(item.phone, "")}</small>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query && !exact && (
            <button
              className="agenda-new-hint"
              onClick={() => onCommitName?.(true)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <Icon name="plus" /> Cadastrar “{query}” como novo cliente
            </button>
          )}
          {query && (
            <label className="field">
              <span className="label">Telefone (opcional)</span>
              <input
                className="input"
                inputMode="tel"
                onChange={(event) => onPhone(event.target.value)}
                value={phone}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
