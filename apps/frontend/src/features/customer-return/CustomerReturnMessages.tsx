"use client";

import { useEffect, useId, useState } from "react";

import type { CustomerReturnStatus } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { showToast } from "@/shared/ui/toastBus";

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusCopy(status: CustomerReturnStatus): string {
  if (!status.blocked) return "Pode receber convites de retorno.";
  if (status.reason === "STOPPED") {
    return "Pediu para não receber mais mensagens de retorno. Só você pode liberar.";
  }
  if (status.reason === "OWNER") {
    return "Você bloqueou as mensagens de retorno para esta cliente.";
  }
  return status.blockedUntil
    ? `Recusou o último convite: sem mensagens de retorno até ${dateLabel(status.blockedUntil)}.`
    : "Sem mensagens de retorno por enquanto.";
}

/**
 * Mensagens de retorno no perfil (D-206): se a cliente recebe convites, por
 * que não, e a saída que só a profissional tem — liberar quem pediu para
 * parar, ou bloquear quem ela não quer chamar.
 */
export function CustomerReturnMessages({ customerId }: { customerId: string }) {
  const headingId = useId();
  // Guardado com a cliente a que pertence: trocar de cliente não mostra o
  // estado da anterior enquanto a leitura nova não chega.
  const [loaded, setLoaded] = useState<CustomerReturnStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const status = loaded?.customerId === customerId ? loaded : null;
  const setStatus = setLoaded;

  useEffect(() => {
    const service = getProductServices().customerReturn;
    if (!service) return;
    const controller = new AbortController();
    service
      .customerStatus(customerId, controller.signal)
      .then(setLoaded)
      .catch(() => undefined);
    return () => controller.abort();
  }, [customerId]);

  if (!status) return null;

  async function change(blocked: boolean) {
    setBusy(true);
    try {
      const next = await getProductServices().customerReturn.setCustomerBlocked(
        customerId,
        blocked,
      );
      setStatus(next);
      showToast(
        blocked
          ? "Esta cliente não recebe mais mensagens de retorno."
          : "Mensagens de retorno liberadas.",
      );
    } catch {
      showToast("Não foi possível salvar. Tente de novo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="resume-history return-profile"
    >
      <h2 className="resume-heading" id={headingId}>
        Mensagens de retorno
      </h2>
      <p className="return-profile-copy">{statusCopy(status)}</p>
      {status.lastMessageAt && (
        <p className="return-profile-meta">
          Último convite em {dateLabel(status.lastMessageAt)}
        </p>
      )}
      <button
        className="return-link-button return-profile-action"
        disabled={busy}
        onClick={() => void change(!status.blocked)}
        type="button"
      >
        {status.blocked ? "Voltar a enviar" : "Não enviar mensagens de retorno"}
      </button>
    </section>
  );
}
