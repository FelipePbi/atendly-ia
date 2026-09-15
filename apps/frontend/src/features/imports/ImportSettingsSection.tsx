"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Skeleton } from "@/shared/ui/States";

import { ImportHistoryCard } from "./ImportHistoryCard";
import type { ImportState } from "./types";

/**
 * Bloco de Importação em Configurações → Agenda (Goal020/WU-09): lê o mesmo
 * `ImportState` de `/importacao`, nunca inventa estado próprio. Sem
 * histórico nem direito disponível, o bloco não existe — não há o que dizer
 * (ex.: agenda ainda usando fonte externa, sem o direito de importar).
 */
export function ImportSettingsSection() {
  const [state, setState] = useState<ImportState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .migration.getImportState(controller.signal)
      .then(setState)
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    return () => controller.abort();
  }, []);

  if (!state && !error) {
    return (
      <section className="settings-panel" aria-busy="true">
        <Skeleton style={{ width: "40%", height: 20 }} />
        <Skeleton style={{ width: "100%", height: 56 }} />
      </section>
    );
  }

  if (error || !state) return null;

  if (state.history) {
    return (
      <section className="settings-panel">
        <ImportHistoryCard history={state.history} />
      </section>
    );
  }

  if (!state.right.available) return null;

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <div>
          <h2>Importar do Minha Agenda</h2>
          <p>
            Traga serviços, clientes, horários e agendamentos de uma vez.
            Acontece uma única vez.
          </p>
        </div>
      </div>
      <Link className="btn btn-primary" href="/importacao">
        Começar importação
      </Link>
    </section>
  );
}
