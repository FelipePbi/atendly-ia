"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import {
  type Appointment,
  appointmentStatusLabel,
  BffHttpError,
  type Conversation,
  type CustomerAppointmentSummary,
  type CustomerDetail,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import {
  ContactPhoto,
  conversationPhotoUrl,
  customerPhotoUrl,
} from "@/shared/ui/ContactPhoto";

import { ChatSheetShell } from "./ConversationActionsSheet";
import {
  ConversationContextPanel,
  type TreatmentPosition,
} from "./ConversationContextPanel";
import { formatInboxPhone, initials } from "./format";

type CustomerLoad =
  | { status: "loading" }
  | { message: string; status: "error" }
  | {
      appointments: Appointment[];
      customer: CustomerDetail;
      status: "ready";
    };

/**
 * A folha do cliente aberta pelo cabeçalho do chat (quadro K5): quem é, o que
 * a IA sabe sob demanda, próximo e último atendimento, e o controle de como a
 * IA trata o contato. O cliente só é lido quando a folha abre, e o resumo da
 * IA só nasce no botão — abrir não grava nem gera nada.
 */
export function ConversationCustomerSheet({
  conversation,
  onChooseTreatment,
  onClose,
  onResolve,
  onTakeover,
  person,
  takeoverBusy,
  treatmentBusy,
  treatmentError,
}: {
  conversation: Conversation;
  onChooseTreatment: (position: TreatmentPosition) => void;
  onClose: () => void;
  onResolve: () => void;
  onTakeover: () => void;
  person: string;
  takeoverBusy: boolean;
  treatmentBusy: boolean;
  treatmentError: string | null;
}) {
  const customerId = conversation.customerId ?? null;
  return (
    <ChatSheetShell
      className="is-customer"
      onClose={onClose}
      title="Contexto da conversa"
    >
      {customerId ? (
        <CustomerSection
          customerId={customerId}
          fallbackPhone={conversation.externalContactId}
          person={person}
          returnTo={`/conversas/${conversation.id}`}
        />
      ) : (
        <>
          <CustomerHead
            person={person}
            photo={conversationPhotoUrl(conversation)}
            subtitle={formatInboxPhone(conversation.externalContactId)}
          />
          <p className="customer-sheet-empty">
            Este contato ainda não é um cliente cadastrado.
          </p>
        </>
      )}
      <ConversationContextPanel
        conversation={conversation}
        onChooseTreatment={onChooseTreatment}
        onResolve={onResolve}
        onTakeover={onTakeover}
        person={person}
        takeoverBusy={takeoverBusy}
        treatmentBusy={treatmentBusy}
        treatmentError={treatmentError}
      />
    </ChatSheetShell>
  );
}

function CustomerHead({
  action,
  person,
  photo,
  subtitle,
}: {
  action?: ReactNode;
  person: string;
  photo: string | null;
  subtitle: string;
}) {
  return (
    <div className="customer-sheet-head">
      <span aria-hidden="true" className="customer-sheet-avatar">
        {initials(person)}
        <ContactPhoto src={photo} />
      </span>
      <div className="customer-sheet-who">
        <span className="customer-sheet-name">{person}</span>
        <span className="customer-sheet-sub">{subtitle}</span>
      </div>
      {action}
    </div>
  );
}

function CustomerSection({
  customerId,
  fallbackPhone,
  person,
  returnTo,
}: {
  customerId: string;
  fallbackPhone: string;
  person: string;
  /** Para onde o perfil volta: a propria conversa (pedido de 2026-10-12). */
  returnTo: string;
}) {
  const [load, setLoad] = useState<CustomerLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const services = getProductServices();
    void (async () => {
      try {
        const customer = await services.customers.get(
          customerId,
          controller.signal,
        );
        const dates = [customer.nextAppointment, customer.lastAppointment]
          .filter((item): item is CustomerAppointmentSummary => Boolean(item))
          .map((item) => item.date)
          .sort();
        let appointments: Appointment[] = [];
        if (dates.length > 0) {
          try {
            appointments = await services.calendar.listAppointments(
              {
                customerId,
                endDate: dates[dates.length - 1],
                startDate: dates[0],
              },
              controller.signal,
            );
          } catch {
            // Sem a agenda o cliente continua legível: só faltam os serviços.
            appointments = [];
          }
        }
        if (!controller.signal.aborted) {
          setLoad({ appointments, customer, status: "ready" });
        }
      } catch (caught: unknown) {
        if (!controller.signal.aborted) {
          setLoad({
            message: requestMessage(
              caught,
              "Não foi possível carregar este cliente.",
            ),
            status: "error",
          });
        }
      }
    })();
    return () => controller.abort();
  }, [customerId, attempt]);

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  if (load.status === "loading") {
    return (
      <div aria-busy="true" className="customer-sheet-customer">
        <CustomerHead
          person={person}
          photo={customerPhotoUrl(customerId)}
          subtitle="Carregando cliente…"
        />
        <span className="sr-only" role="status">
          Carregando cliente
        </span>
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div className="customer-sheet-customer">
        <CustomerHead
          person={person}
          photo={customerPhotoUrl(customerId)}
          subtitle={formatInboxPhone(fallbackPhone)}
        />
        <p className="chat-sheet-error" role="alert">
          {load.message}
        </p>
        <button className="customer-sheet-retry" onClick={retry} type="button">
          Tentar de novo
        </button>
      </div>
    );
  }

  const { appointments, customer } = load;
  const phone = formatInboxPhone(customer.phone ?? fallbackPhone);
  const since = customer.appointmentStats?.firstAppointmentDate;
  const subtitle = since
    ? `${phone} · cliente desde ${monthYear(since)}`
    : phone;
  const next = customer.nextAppointment
    ? withServices(customer.nextAppointment, appointments)
    : null;
  const last = customer.lastAppointment
    ? withServices(customer.lastAppointment, appointments)
    : null;

  return (
    <div className="customer-sheet-customer">
      <CustomerHead
        action={
          <Link
            className="customer-sheet-profile"
            href={customerProfileHref(customer.id, returnTo)}
          >
            Ver perfil
          </Link>
        }
        person={person}
        photo={customerPhotoUrl(customer.id)}
        subtitle={subtitle}
      />
      {(next || last) && (
        <div className="customer-sheet-visits">
          {next && (
            <div className="customer-sheet-visit">
              <div className="customer-sheet-visit-copy">
                <span className="customer-sheet-visit-label">Próximo</span>
                <span className="customer-sheet-visit-line is-next">
                  {[
                    dayLabel(next.summary.date),
                    next.summary.startTime,
                    next.services,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <span
                className={
                  next.summary.status === "CONFIRMED" ||
                  next.summary.status === "SCHEDULED"
                    ? "customer-sheet-status is-confirmed"
                    : "customer-sheet-status"
                }
              >
                <span
                  aria-hidden="true"
                  className="customer-sheet-status-dot"
                />
                {appointmentStatusLabel(next.summary.status)}
              </span>
            </div>
          )}
          {last && (
            <div className="customer-sheet-visit">
              <div className="customer-sheet-visit-copy">
                <span className="customer-sheet-visit-label">Último</span>
                <span className="customer-sheet-visit-line is-last">
                  {[
                    dayLabel(last.summary.date),
                    last.services,
                    last.value,
                    last.summary.status.toUpperCase() === "COMPLETED"
                      ? null
                      : appointmentStatusLabel(last.summary.status),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Atalho para a lista de agendamentos do cliente (pedido de
          2026-10-12): abre o perfil direto na aba Atendimentos. */}
      <Link
        className="customer-sheet-profile customer-sheet-appointments"
        href={customerProfileHref(customer.id, returnTo, "atendimentos")}
      >
        Ver agendamentos
      </Link>
    </div>
  );
}

/**
 * Serviços e valor do atendimento do resumo do cliente. O resumo não traz id,
 * então o atendimento é achado por dia e hora entre os do próprio cliente. O
 * valor é o valor final gravado: sem ele, a linha não mostra valor algum.
 */
function withServices(
  summary: CustomerAppointmentSummary,
  appointments: Appointment[],
) {
  const match = appointments.find(
    (item) =>
      item.date === summary.date && item.startTime === summary.startTime,
  );
  const names = match
    ? [
        ...match.services.map((service) => service.name),
        ...(match.services.length === 0 && match.title ? [match.title] : []),
      ].join(", ")
    : "";
  const value =
    match && match.finalValue !== null ? money(match.finalValue) : "";
  return { services: names, summary, value };
}

function dayLabel(date: string): string {
  const instant = new Date(`${date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "short",
  })
    .format(instant)
    .replace(".", "");
  const dayMonth = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(instant);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dayMonth}`;
}

function monthYear(date: string): string {
  const instant = new Date(`${date}T12:00:00Z`);
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "UTC",
  })
    .format(instant)
    .replace(".", "");
  return `${month} ${instant.getUTCFullYear()}`;
}

function money(value: number): string {
  const digits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  }).format(value);
}

function requestMessage(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  return `${fallback} Referência: ${error.requestId}`;
}

/**
 * Perfil do cliente aberto pela conversa: `voltar` leva de volta a ela, e
 * `aba` abre direto na aba pedida (pedido de 2026-10-12).
 */
export function customerProfileHref(
  customerId: string,
  returnTo: string,
  tab?: "atendimentos",
): string {
  const params = new URLSearchParams({ id: customerId });
  if (tab) params.set("aba", tab);
  params.set("voltar", returnTo);
  return `/clientes/detalhes?${params.toString()}`;
}
