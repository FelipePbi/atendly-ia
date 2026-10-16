"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  type Appointment,
  type AppointmentLifecycle,
  type CalendarState,
  isActiveAppointmentStatus,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { SkeletonSettle } from "@/shared/motion/SkeletonSettle";
import { runViewTransition } from "@/shared/motion/viewTransition";
import { displayPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { ContactPhoto, customerPhotoUrl } from "@/shared/ui/ContactPhoto";
import { Skeleton, StatePanel } from "@/shared/ui/States";

import { appointmentBackHref, appointmentFlowHref } from "./agendaLinks";
import {
  recalledAppointment,
  recalledCalendar,
  rememberAppointment,
  rememberCalendar,
} from "./agendaMemory";
import { AppointmentFlowShell, formatMoney } from "./AppointmentFlowShell";
import { AppointmentHistory } from "./AppointmentHistory";
import { AppointmentReminder, useLifecycleMenu } from "./LifecycleActions";
import {
  appointmentServiceColors,
  customerLabel,
  formatDuration,
  parseDate,
  requestError,
  type ServiceColorMap,
  serviceColorMap,
  statusLabel,
} from "./occupancy";

/** Os eixos do ciclo do atendimento gravados por uma ação do "•••". */
export function withLifecycle(
  appointment: Appointment,
  lifecycle: AppointmentLifecycle,
): Appointment {
  return {
    ...appointment,
    completedAt: lifecycle.completedAt,
    completionOrigin: lifecycle.completionOrigin,
    finalValue: lifecycle.finalValue,
    noShowAt: lifecycle.noShowAt,
    noShowNote: lifecycle.noShowNote,
    presenceConfirmedAt: lifecycle.presenceConfirmedAt,
    status: lifecycle.status,
  };
}

type LoadedAppointment = {
  /** Veio do servidor; `false` para semente da lista ou da memória, ainda a revalidar. */
  fresh: boolean;
  appointment: Appointment | null;
  error: string | null;
  id: string;
};

/**
 * Tempo mínimo do esqueleto numa troca de atendimento (pedido de 2026-10-12):
 * com a resposta local em poucos milissegundos, o esqueleto só piscaria um
 * quadro e a troca pareceria não ter carregado nada. 200 ms é curto o bastante
 * para não atrasar quem lê e longo o bastante para ser visto.
 */
/** Mantido para quem importa; a troca de atendimento não tem mais esqueleto (D-168). */
export const SWITCH_SKELETON_MS = 0;

/**
 * Leitura e estado do detalhe do agendamento (A5), compartilhados pela rota
 * `/agenda/agendamento` e pelo painel do Dia a partir de 1024 px: a mesma
 * leitura, os mesmos estados de carregamento e erro e as mesmas ações do
 * "•••". `calendar`, quando a tela já o tem, evita lê-lo de novo;
 * `onLifecycle` avisa quem mostra o agendamento ao lado (a lista do Dia).
 * `remembered` (só a rota) começa pelo que a Agenda já leu nesta aba e
 * revalida em segundo plano (D-167); trocar de atendimento dentro da tela
 * continua mostrando o esqueleto (D-166).
 */
export function useAppointmentDetail(
  appointmentId: string | undefined,
  options: {
    calendar?: CalendarState | null;
    onLifecycle?: (lifecycle: AppointmentLifecycle) => void;
    /** A rota: o calendário que a Agenda já leu nesta aba vale antes da leitura. */
    remembered?: boolean;
    /**
     * O agendamento como a lista ao lado o conhece (nome, horário, serviço,
     * estado): aparece na hora, e a leitura completa o resto (decisão do
     * usuário, 2026-10-12, D-168 — substitui o esqueleto de troca de D-166).
     */
    seed?: Appointment | null;
  } = {},
) {
  const knownCalendar = options.calendar ?? null;
  const useRemembered = options.remembered ?? false;
  const seed =
    options.seed && appointmentId && options.seed.id === appointmentId
      ? options.seed
      : null;
  // A leitura fica marcada com o id que ela responde: uma resposta atrasada
  // de outro id nunca vale para o atual (corrida A → B). `fresh` diz se o
  // que está na tela veio do servidor ou de uma semente (lista, memória da
  // aba) que ainda será revalidada.
  const [loaded, setLoaded] = useState<LoadedAppointment | null>(() => {
    if (!appointmentId) return null;
    const appointment = seed ?? recalledAppointment(appointmentId);
    return appointment
      ? { appointment, error: null, fresh: false, id: appointmentId }
      : null;
  });
  // Trocar de atendimento com o novo já conhecido (semente ou memória): ele
  // entra na hora; sem nada conhecido, o anterior fica na tela, ocupado, até
  // o novo chegar — nunca um esqueleto no lugar de conteúdo.
  if (appointmentId && loaded?.id !== appointmentId) {
    const known = seed ?? recalledAppointment(appointmentId);
    if (known) {
      setLoaded({
        appointment: known,
        error: null,
        fresh: false,
        id: appointmentId,
      });
    }
  }
  const [calendar, setCalendar] = useState<CalendarState | null>(
    () => knownCalendar ?? (useRemembered ? recalledCalendar() : null),
  );
  const [historyReload, setHistoryReload] = useState(0);
  const [serviceColors, setServiceColors] = useState<ServiceColorMap>(
    () => new Map(),
  );
  const hasKnownCalendar = knownCalendar !== null;
  const loadedRef = useRef(loaded);
  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    const calendarService = getProductServices().calendar;
    // Conteúdo de outro atendimento na tela enquanto este carrega: a troca,
    // quando ele chegar, é conteúdo → conteúdo, com fade (D-168).
    const stale = loadedRef.current?.id !== appointmentId;
    Promise.all([
      calendarService.getAppointment(appointmentId, controller.signal),
      hasKnownCalendar ? null : calendarService.getCalendar(controller.signal),
    ])
      .then(([appointmentResult, calendarResult]) => {
        if (controller.signal.aborted) return;
        const apply = () => {
          setLoaded({
            appointment: appointmentResult,
            error: null,
            fresh: true,
            id: appointmentId,
          });
          rememberAppointment(appointmentResult);
          if (calendarResult) {
            setCalendar(calendarResult);
            rememberCalendar(calendarResult);
          }
        };
        if (stale) void runViewTransition(apply);
        else apply();
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          appointment: null,
          error: requestError(
            caught,
            "Não foi possível carregar o agendamento.",
          ),
          fresh: true,
          id: appointmentId,
        });
      });
    return () => controller.abort();
  }, [appointmentId, hasKnownCalendar]);

  const current = appointmentId && loaded?.id === appointmentId ? loaded : null;
  // Sem o pedido na tela, vale o anterior (ocupado) até o novo chegar.
  const previous = appointmentId && !current ? loaded : null;
  const appointment = current?.appointment ?? previous?.appointment ?? null;
  // Ocupado: o pedido ainda não chegou (há conteúdo anterior, ou nada) ou o
  // que está na tela veio de uma semente e está sendo revalidado.
  const busy = Boolean(appointmentId) && (current === null || !current.fresh);
  // Esqueleto só quando não há nada para mostrar (primeira carga fria).
  const loading =
    Boolean(appointmentId) && appointment === null && !current?.error;
  const error = appointmentId
    ? (current?.error ?? null)
    : "O agendamento não foi informado.";

  // Só a cor do ponto de cada serviço depende do catálogo: sem ele, o ponto
  // fica neutro e o detalhe continua.
  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    const catalog = getProductServices().serviceCatalog;
    if (!catalog || typeof catalog.list !== "function") return;
    Promise.resolve()
      .then(() => catalog.list(controller.signal))
      .then((result) => setServiceColors(serviceColorMap(result.items)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [appointmentId]);

  const writable = Boolean(
    calendar?.capabilities.createAppointments && appointment
      ? isActiveAppointmentStatus(appointment.status)
      : false,
  );
  // Ciclo de vida e histórico exigem fonte configurada (Goal016).
  const lifecycleAvailable = calendar?.source === "AVENLY";

  function applyLifecycle(lifecycle: AppointmentLifecycle) {
    if (appointment) rememberAppointment(withLifecycle(appointment, lifecycle));
    setLoaded((state) =>
      state?.appointment
        ? { ...state, appointment: withLifecycle(state.appointment, lifecycle) }
        : state,
    );
    setHistoryReload((value) => value + 1);
    options.onLifecycle?.(lifecycle);
  }

  const lifecycle = useLifecycleMenu({
    appointment: lifecycleAvailable ? appointment : null,
    onUpdated: applyLifecycle,
  });

  return {
    appointment,
    calendar,
    error,
    historyReload,
    lifecycle,
    busy,
    lifecycleAvailable,
    loading,
    serviceColors,
    writable,
  };
}

export type AppointmentDetailState = ReturnType<typeof useAppointmentDetail>;

/**
 * Detalhe do agendamento (quadro A5, D-110 (c) e (d)): horário em destaque
 * com o status, a cliente, os serviços, o lembrete, as observações e o
 * histórico. Remarcar e Cancelar ficam no rodapé; o ciclo do atendimento
 * (Concluir, Não compareceu, presença e valor final) vive no "•••".
 */
export function AppointmentDetail({
  appointmentId,
  returnTo,
}: {
  appointmentId?: string;
  /** `?voltar=` de quem abriu o detalhe; só caminho interno vale (D-167). */
  returnTo?: string;
}) {
  const detail = useAppointmentDetail(appointmentId, { remembered: true });
  // Na troca pela coluna do Dia ao lado, a coluna fica no dia que já mostrava
  // enquanto o novo agendamento carrega, em vez de sumir e voltar.
  const [shownDate, setShownDate] = useState<string | null>(null);
  const loadedDate = detail.appointment?.date ?? null;
  if (loadedDate !== null && loadedDate !== shownDate) setShownDate(loadedDate);

  return (
    <AppointmentFlowShell
      appointmentRoute={{
        date: loadedDate ?? shownDate,
        id: appointmentId,
      }}
      bare
      calendar={detail.calendar}
      loading={detail.loading}
      title="Detalhes do agendamento"
    >
      <div aria-busy={detail.busy || undefined} className="agenda-appt">
        <PushedBar
          backHref={appointmentBackHref(returnTo, loadedDate ?? shownDate)}
          backLabel="Voltar para a agenda"
          menuItems={detail.lifecycle.menuItems}
          menuLabel="Mais ações do agendamento"
        />
        <h1 className="sr-only">Detalhes do agendamento</h1>
        <AppointmentDetailBody detail={detail} returnTo={returnTo} />
      </div>
    </AppointmentFlowShell>
  );
}

/**
 * O corpo do quadro A5 abaixo da barra: carregando, erro ou o agendamento com
 * o rodapé de Remarcar e Cancelar. A rota e o painel do Dia (D-165) mostram
 * exatamente este corpo.
 */
export function AppointmentDetailBody({
  detail,
  returnTo,
}: {
  detail: AppointmentDetailState;
  /**
   * Origem que Remarcar e Cancelar levam adiante (D-167): a da rota, ou o dia
   * da Agenda em que o painel está. Sem ela, o retorno vai ao dia do
   * atendimento.
   */
  returnTo?: string;
}) {
  const {
    appointment,
    error,
    historyReload,
    lifecycle,
    lifecycleAvailable,
    loading,
    serviceColors,
    writable,
  } = detail;
  // O corpo que chega depois do esqueleto entra com um fade curto; o que já
  // veio preenchido (D-167) e as revalidações trocam sem animação.
  const [afterSkeleton, setAfterSkeleton] = useState(loading);
  if (loading && !afterSkeleton) setAfterSkeleton(true);
  if (loading) return <AppointmentDetailSkeleton />;
  if (error || !appointment) {
    return (
      <div className="agenda-appt-body">
        <StatePanel
          actionHref="/agenda"
          actionLabel="Voltar à agenda"
          description={error ?? "Agendamento não encontrado."}
          icon="alert"
          title="Agendamento indisponível"
          tone="error"
        />
      </div>
    );
  }
  const reveal = afterSkeleton ? "agenda-reveal" : undefined;
  return (
    <>
      <div className={clsx("agenda-appt-body", reveal)}>
        {lifecycle.panel}
        <div className="agenda-appt-columns">
          <div className="agenda-appt-main">
            <AppointmentWhen appointment={appointment} />
            <AppointmentCustomer
              appointment={appointment}
              key={appointment.customerId ?? ""}
            />
            <AppointmentServices
              appointment={appointment}
              serviceColors={serviceColors}
            />
          </div>
          <div className="agenda-appt-side">
            {lifecycleAvailable && (
              <AppointmentReminder appointmentId={appointment.id} />
            )}
            <section className="agenda-appt-block">
              <h2 className="agenda-appt-label">Observações</h2>
              <p
                className={clsx(
                  "agenda-appt-text",
                  !appointment.comments && "is-empty",
                )}
              >
                {appointment.comments || "Nenhuma observação."}
              </p>
            </section>
            {lifecycleAvailable && (
              <section className="agenda-appt-block is-history">
                <h2 className="agenda-appt-label">Histórico</h2>
                <AppointmentHistory
                  appointmentId={appointment.id}
                  reloadKey={historyReload}
                />
              </section>
            )}
          </div>
        </div>
      </div>
      {writable && (
        <div className={clsx("agenda-appt-footer", reveal)}>
          <Link
            className="agenda-appt-action"
            data-motion="forward"
            href={appointmentFlowHref("reagendar", appointment.id, returnTo)}
          >
            <Icon name="calendar" />
            Remarcar
          </Link>
          <Link
            className="agenda-appt-action is-danger"
            data-motion="forward"
            href={appointmentFlowHref("cancelar", appointment.id, returnTo)}
          >
            Cancelar
          </Link>
        </div>
      )}
    </>
  );
}

/**
 * Carregando, no formato do corpo A5: horário, cliente, serviços e a coluna
 * de Lembrete, Observações e Histórico. Aparece na primeira carga e em cada
 * troca de atendimento (pedido de 2026-10-12); o desenho fica fora da árvore
 * acessível e só "Carregando agendamento" é anunciado.
 */
function AppointmentDetailSkeleton() {
  return (
    <SkeletonSettle>
      <div
        aria-busy="true"
        aria-label="Carregando agendamento"
        className="agenda-appt-body"
        role="status"
      >
        <div
          aria-hidden="true"
          className="agenda-appt-columns agenda-appt-skeleton"
        >
          <div className="agenda-appt-main">
            <div className="agenda-appt-when">
              <Skeleton className="agenda-appt-skeleton-label" />
              <div className="agenda-appt-when-row">
                <Skeleton className="agenda-appt-skeleton-hero" />
                <Skeleton className="agenda-appt-skeleton-status" />
              </div>
            </div>
            <div className="agenda-appt-customer">
              <Skeleton className="agenda-appt-skeleton-avatar" />
              <div className="agenda-appt-customer-text">
                <Skeleton className="agenda-appt-skeleton-name" />
                <Skeleton className="agenda-appt-skeleton-meta" />
              </div>
            </div>
            <div className="agenda-appt-services">
              <Skeleton className="agenda-appt-skeleton-label" />
              <div className="agenda-appt-service">
                <Skeleton className="agenda-appt-skeleton-name" />
                <Skeleton className="agenda-appt-skeleton-meta is-short" />
              </div>
              <div className="agenda-appt-total">
                <Skeleton className="agenda-appt-skeleton-meta is-short" />
                <Skeleton className="agenda-appt-skeleton-meta is-short" />
              </div>
            </div>
          </div>
          <div className="agenda-appt-side">
            {[0, 1, 2].map((block) => (
              <div className="agenda-appt-block" key={block}>
                <Skeleton className="agenda-appt-skeleton-label" />
                <Skeleton className="agenda-appt-skeleton-line" />
                <Skeleton className="agenda-appt-skeleton-line is-short" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonSettle>
  );
}

function AppointmentWhen({ appointment }: { appointment: Appointment }) {
  const status = appointment.status.toUpperCase();
  return (
    <div className="agenda-appt-when">
      <span className="agenda-appt-label">
        {longDayLabel(appointment.date)}
      </span>
      <div className="agenda-appt-when-row">
        <span className="agenda-appt-hero">
          {appointment.startTime}
          <span> – {appointment.endTime}</span>
        </span>
        <span
          className={clsx(
            "agenda-appt-status",
            status === "COMPLETED" && "is-completed",
            status === "NO_SHOW" && "is-no-show",
            status === "CANCELLED" && "is-cancelled",
          )}
        >
          <span aria-hidden="true" className="agenda-appt-status-dot" />
          {status === "COMPLETED" && appointment.completionOrigin === "AUTO"
            ? "Concluído automaticamente"
            : statusLabel(appointment.status)}
        </span>
      </div>
    </div>
  );
}

/**
 * A cliente com o telefone (D-099) e, quando há `customerId` e a leitura
 * responde, a contagem de atendimentos e o atalho para a conversa dela
 * (D-110 (d)). Leitura que falha some sem erro na tela.
 */
function AppointmentCustomer({ appointment }: { appointment: Appointment }) {
  const customerId = appointment.customerId;
  const [completed, setCompleted] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    // Leitura auxiliar: qualquer falha, inclusive síncrona, só esconde a contagem.
    Promise.resolve()
      .then(() =>
        getProductServices().customers.get(customerId, controller.signal),
      )
      .then((customer) =>
        setCompleted(customer.appointmentStats?.completed ?? null),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [customerId]);

  // A conversa mais recente da pessoa, como no perfil do cliente (Goal075).
  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    Promise.resolve()
      .then(() =>
        getProductServices().conversations.list(
          { customerId, limit: 1 },
          controller.signal,
        ),
      )
      .then((result) => setConversationId(result[0]?.id ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [customerId]);

  const name = customerLabel(appointment);
  const line = [
    displayPhone(appointment.customer?.phone, ""),
    completed === null
      ? ""
      : `${completed} ${completed === 1 ? "atendimento" : "atendimentos"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="agenda-appt-customer">
      <span aria-hidden="true" className="agenda-appt-avatar">
        {initials(name)}
        <ContactPhoto src={customerPhotoUrl(customerId)} />
      </span>
      <div className="agenda-appt-customer-text">
        <h2>{name}</h2>
        {line && <span>{line}</span>}
      </div>
      {customerId && conversationId && (
        <Link
          className="agenda-appt-conversation"
          href={`/conversas/${encodeURIComponent(conversationId)}`}
        >
          <Icon name="chat" />
          Conversa
        </Link>
      )}
    </div>
  );
}

function AppointmentServices({
  appointment,
  serviceColors,
}: {
  appointment: Appointment;
  serviceColors: ServiceColorMap;
}) {
  const colors = appointmentServiceColors(appointment, serviceColors);
  const total = [
    formatDuration(appointment.durationMinutes),
    totalPriceLabel(appointment),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="agenda-appt-services">
      <h2 className="agenda-appt-label">Serviços</h2>
      {appointment.services.length === 0 ? (
        <div className="agenda-appt-service">
          <span className="agenda-appt-service-name">
            <span aria-hidden="true" className="agenda-appt-service-dot" />
            {appointment.title || "Serviço não informado"}
          </span>
        </div>
      ) : (
        appointment.services.map((service, index) => (
          <div
            className="agenda-appt-service"
            key={`${service.serviceId}-${index}`}
          >
            <span className="agenda-appt-service-name">
              <span
                aria-hidden="true"
                className="agenda-appt-service-dot"
                data-color={colors[index] ?? undefined}
              />
              {service.name}
            </span>
            <span className="agenda-appt-service-meta">
              {[
                service.durationMinutes
                  ? formatDuration(service.durationMinutes)
                  : "",
                servicePriceLabel(service),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        ))
      )}
      <div className="agenda-appt-total">
        <span>Total</span>
        <strong>{total}</strong>
      </div>
      {appointment.finalValue !== null && (
        <div className="agenda-appt-total">
          <span>Valor final</span>
          <strong>{formatMoney(appointment.finalValue)}</strong>
        </div>
      )}
    </section>
  );
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

function servicePriceLabel(service: Appointment["services"][number]): string {
  if (service.priceType === "ON_REQUEST") return "sob consulta";
  if (service.price === null || service.priceType === "NOT_INFORMED") return "";
  return service.priceType === "STARTING_AT"
    ? `a partir de ${money(service.price)}`
    : money(service.price);
}

export function totalPriceLabel(appointment: Appointment): string {
  const { totalPrice, totalPriceType } = appointment;
  if (totalPrice === null || totalPriceType === "NONE") return "";
  return totalPriceType === "STARTING_AT"
    ? `a partir de ${money(totalPrice)}`
    : money(totalPrice);
}

/** "Sexta, 19 de setembro", como no quadro. */
export function longDayLabel(date: string): string {
  const label = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  })
    .format(parseDate(date))
    .replace("-feira", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter((part) => /\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
