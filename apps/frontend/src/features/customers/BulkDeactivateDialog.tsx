"use client";

import { useEffect, useMemo, useState } from "react";

import { BffHttpError, type CustomerInactivityCandidates } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { showToast } from "@/shared/ui/toastBus";

/** Períodos sem vir que a profissional escolhe (2026-10-18). */
export const INACTIVITY_PERIODS = [3, 6, 12, 24] as const;

type Candidate = CustomerInactivityCandidates["items"][number];

function periodLabel(months: number): string {
  if (months === 12) return "1 ano";
  if (months === 24) return "2 anos";
  return `${months} meses`;
}

/** "última vez há 8 meses", "última vez há 1 ano", "nunca veio". */
export function lastVisitLabel(lastVisitAt: string | null, now = new Date()) {
  if (!lastVisitAt) return "nunca veio";
  const last = new Date(lastVisitAt);
  const months =
    (now.getFullYear() - last.getFullYear()) * 12 +
    (now.getMonth() - last.getMonth()) -
    (now.getDate() < last.getDate() ? 1 : 0);
  if (months >= 24) return `última vez há ${Math.floor(months / 12)} anos`;
  if (months >= 12) return "última vez há 1 ano";
  return `última vez há ${months} ${months === 1 ? "mês" : "meses"}`;
}

/**
 * Desativação em massa (pedido de 2026-10-18): escolhe há quanto tempo a
 * cliente não vem, a lista chega já marcada para revisar e, ao confirmar,
 * todas as marcadas vão para Inativos de uma vez.
 */
export function BulkDeactivateDialog({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const [months, setMonths] = useState<number>(6);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    getProductServices()
      .customers.inactivityCandidates(months, controller.signal)
      .then((result) => {
        setCandidates(result.items);
        setSelected(new Set(result.items.map((item) => item.id)));
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setCandidates([]);
        setError(
          caught instanceof BffHttpError
            ? caught.message
            : "Não foi possível buscar os clientes.",
        );
      });
    return () => controller.abort();
  }, [months, open]);

  const allSelected = useMemo(
    () =>
      candidates !== null &&
      candidates.length > 0 &&
      candidates.every((item) => selected.has(item.id)),
    [candidates, selected],
  );

  function choose(next: number) {
    if (next === months) return;
    setCandidates(null);
    setMonths(next);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function confirm() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getProductServices().customers.deactivateMany([
        ...selected,
      ]);
      showToast(
        result.deactivated === 1
          ? "1 cliente desativado."
          : `${result.deactivated} clientes desativados.`,
      );
      onClose();
    } catch (caught: unknown) {
      setError(
        caught instanceof BffHttpError
          ? caught.message
          : "Não foi possível desativar os clientes.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      onClose={() => !busy && onClose()}
      open={open}
      title="Desativar em massa"
    >
      <div className="bulk-deactivate">
        <p className="bulk-deactivate-intro">
          Clientes sem atendimento há mais de:
        </p>
        <div
          aria-label="Sem atendimento há mais de"
          className="customer-status-tabs bulk-deactivate-periods"
          role="group"
        >
          {INACTIVITY_PERIODS.map((value) => (
            <button
              aria-pressed={months === value}
              className={
                months === value
                  ? "customer-status-tab is-active"
                  : "customer-status-tab"
              }
              key={value}
              onClick={() => choose(value)}
              type="button"
            >
              {periodLabel(value)}
            </button>
          ))}
        </div>

        {candidates === null ? (
          <p className="bulk-deactivate-status" role="status">
            Buscando clientes...
          </p>
        ) : candidates.length === 0 ? (
          <p className="bulk-deactivate-status" role="status">
            {error ??
              `Ninguém está sem vir há mais de ${periodLabel(months)} e sem horário marcado.`}
          </p>
        ) : (
          <>
            <label className="bulk-deactivate-all">
              <input
                checked={allSelected}
                onChange={() =>
                  setSelected(
                    allSelected
                      ? new Set()
                      : new Set(candidates.map((item) => item.id)),
                  )
                }
                type="checkbox"
              />
              <span>
                {selected.size} de {candidates.length} selecionados
              </span>
            </label>
            <ul className="bulk-deactivate-list">
              {candidates.map((item) => (
                <li key={item.id}>
                  <label className="bulk-deactivate-row">
                    <input
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      type="checkbox"
                    />
                    <span className="bulk-deactivate-name">
                      <strong>{item.name?.trim() || "Cliente sem nome"}</strong>
                      <span>{lastVisitLabel(item.lastVisitAt)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && candidates && candidates.length > 0 && (
          <p className="field-help" role="alert">
            {error}
          </p>
        )}
        <p className="bulk-deactivate-note">
          Quem tem horário marcado não aparece. Agenda, conversas e histórico
          continuam como estão, e dá para reativar no perfil.
        </p>
        <div className="customer-deactivate-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || selected.size === 0}
            onClick={() => void confirm()}
            type="button"
          >
            {busy
              ? "Desativando..."
              : selected.size === 1
                ? "Desativar 1 cliente"
                : `Desativar ${selected.size} clientes`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
